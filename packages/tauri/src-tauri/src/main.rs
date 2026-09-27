// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

mod window_state;

struct ControllerChild {
    process: Child,
    input: Arc<Mutex<ChildStdin>>,
}

#[derive(Default)]
struct UrlDispatchState {
    focused: Option<String>,
    loaded: HashSet<String>,
    pending: HashMap<String, Vec<String>>,
}

#[derive(Default)]
struct DownloadReservations(Mutex<DownloadReservationState>);

#[derive(Default)]
struct DownloadReservationState {
    active: HashSet<std::path::PathBuf>,
    by_url: HashMap<String, DownloadReservationGroup>,
}

#[derive(Default)]
struct DownloadReservationGroup {
    pending: usize,
    paths: HashSet<std::path::PathBuf>,
}

impl DownloadReservationState {
    fn begin(&mut self, url: &str) {
        self.by_url.entry(url.to_owned()).or_default().pending += 1;
    }

    fn reserve(&mut self, url: &str, path: std::path::PathBuf) {
        self.active.insert(path.clone());
        let group = self.by_url.entry(url.to_owned()).or_default();
        group.paths.insert(path);
    }

    fn finish(&mut self, url: &str, path: Option<&std::path::Path>) {
        let mut completed_path = None;
        let mut all_finished = false;
        if let Some(group) = self.by_url.get_mut(url) {
            if group.pending == 0 {
                return;
            }
            group.pending -= 1;
            if let Some(path) = path {
                if group.paths.remove(path) {
                    completed_path = Some(path.to_path_buf());
                }
            }
            all_finished = group.pending == 0;
        }
        if let Some(path) = completed_path {
            self.active.remove(&path);
        }
        if all_finished {
            if let Some(group) = self.by_url.remove(url) {
                for path in group.paths {
                    self.active.remove(&path);
                }
            }
        }
    }
}

#[cfg(test)]
mod download_reservation_tests {
    use super::DownloadReservationState;
    use std::path::PathBuf;

    #[test]
    fn releases_failed_download_without_a_finished_path() {
        let mut reservations = DownloadReservationState::default();
        let first = PathBuf::from("/downloads/proof.txt");
        let other = PathBuf::from("/downloads/other.txt");
        reservations.begin("https://example.test/proof");
        reservations.reserve("https://example.test/proof", first.clone());
        reservations.begin("https://example.test/other");
        reservations.reserve("https://example.test/other", other.clone());

        reservations.finish("https://example.test/proof", None);

        assert!(!reservations.active.contains(&first));
        assert!(reservations.active.contains(&other));
    }

    #[test]
    fn keeps_same_url_reservations_until_all_downloads_finish() {
        let mut reservations = DownloadReservationState::default();
        let first = PathBuf::from("/downloads/proof.txt");
        let second = PathBuf::from("/downloads/proof (1).txt");
        reservations.begin("https://example.test/proof");
        reservations.reserve("https://example.test/proof", first.clone());
        reservations.begin("https://example.test/proof");
        reservations.reserve("https://example.test/proof", second.clone());

        reservations.finish("https://example.test/proof", None);
        assert!(reservations.active.contains(&first));
        assert!(reservations.active.contains(&second));

        reservations.finish("https://example.test/proof", Some(&second));
        assert!(reservations.active.is_empty());
        assert!(reservations.by_url.is_empty());
    }

    #[test]
    fn rejected_request_does_not_release_an_active_same_url_download() {
        let mut reservations = DownloadReservationState::default();
        let active = PathBuf::from("/downloads/proof.txt");
        reservations.begin("https://example.test/proof");
        reservations.reserve("https://example.test/proof", active.clone());
        reservations.begin("https://example.test/proof");

        reservations.finish("https://example.test/proof", None);
        assert!(reservations.active.contains(&active));

        reservations.finish("https://example.test/proof", Some(&active));
        assert!(reservations.active.is_empty());
    }
}

impl Drop for ControllerChild {
    fn drop(&mut self) {
        if let Ok(mut input) = self.input.lock() {
            let _ = input.write_all(b"{\"version\":1,\"type\":\"stop\"}\n");
            let _ = input.flush();
        }
        for _ in 0..50 {
            if self.process.try_wait().ok().flatten().is_some() {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = self.process.kill();
        let _ = self.process.wait();
    }
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Tauri host startup failed: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let controller = args.next().ok_or("Missing controller path")?;
    let node = args.next().ok_or("Missing Node executable")?;
    let mut process = Command::new(node)
        .arg(controller)
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()?;
    let output = process.stdout.take().ok_or("Missing controller output")?;
    let input = Arc::new(Mutex::new(
        process.stdin.take().ok_or("Missing controller input")?,
    ));
    let child = ControllerChild {
        process,
        input: input.clone(),
    };
    let app_handle: Arc<Mutex<Option<tauri::AppHandle>>> = Arc::new(Mutex::new(None));
    let controller_ended = Arc::new(AtomicBool::new(false));
    let close_pending: Arc<Mutex<HashMap<String, u64>>> = Arc::new(Mutex::new(HashMap::new()));
    let url_dispatch = Arc::new(Mutex::new(UrlDispatchState::default()));
    let close_next_id = Arc::new(AtomicU64::new(0));
    let response_input = input.clone();
    let response_handle = app_handle.clone();
    let response_controller_ended = controller_ended.clone();
    let response_close_pending = close_pending.clone();
    let response_url_dispatch = url_dispatch.clone();
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut reader = BufReader::new(output);
        let mut line = String::new();
        let result = reader.read_line(&mut line).map(|_| line);
        let _ = sender.send(result);
        let mut announced_exit = false;
        for line in reader.lines() {
            match line {
                Ok(message) => {
                    let response = match serde_json::from_str::<serde_json::Value>(&message) {
                        Ok(request) if request["type"] == "native-request" => {
                            if matches!(
                                request["operation"].as_str(),
                                Some("open-file" | "show-open-dialog" | "show-save-dialog")
                            ) {
                                handle_file_dialog_request(
                                    &response_handle,
                                    &response_input,
                                    &request,
                                );
                                None
                            } else if matches!(
                                request["operation"].as_str(),
                                Some("read-clipboard-text" | "write-clipboard-text")
                            ) {
                                handle_clipboard_request(
                                    &response_handle,
                                    &response_input,
                                    &request,
                                );
                                None
                            } else {
                                Some(handle_native_request(&response_handle, &request))
                            }
                        }
                        Ok(response) if response["type"] == "close-response" => {
                            handle_close_response(
                                &response_handle,
                                &response_close_pending,
                                &response,
                            );
                            None
                        }
                        Ok(request) if request["type"] == "create-window" => {
                            handle_create_window(&response_handle, &response_input, &request);
                            None
                        }
                        Ok(request) if request["type"] == "open-url" => {
                            if request["version"] == 1 {
                                if let Some(url) = request["url"].as_str() {
                                    queue_open_url(&response_handle, &response_url_dispatch, url);
                                }
                            }
                            None
                        }
                        Ok(request) if request["type"] == "window-backend-exited" => {
                            if let Some(label) = request["window"].as_str() {
                                if let Ok(app) = response_handle.lock() {
                                    if let Some(window) =
                                        app.as_ref().and_then(|app| app.get_webview_window(label))
                                    {
                                        let _ = window.destroy();
                                    }
                                }
                            }
                            None
                        }
                        Ok(response)
                            if response["type"] == "stopped" || response["type"] == "error" =>
                        {
                            announced_exit = true;
                            response_controller_ended.store(true, Ordering::Release);
                            if let Ok(app) = response_handle.lock() {
                                if let Some(app) = app.as_ref() {
                                    app.exit(if response["type"] == "error" { 1 } else { 0 });
                                }
                            }
                            None
                        }
                        _ => None,
                    };
                    if let Some(response) = response {
                        if let Ok(mut input) = response_input.lock() {
                            let _ = writeln!(input, "{response}");
                            let _ = input.flush();
                        }
                    }
                }
                Err(_) => break,
            }
        }
        if !announced_exit {
            response_controller_ended.store(true, Ordering::Release);
            if let Ok(app) = response_handle.lock() {
                if let Some(app) = app.as_ref() {
                    app.exit(1);
                }
            }
        }
    });
    let ready = receiver.recv_timeout(Duration::from_secs(60))??;
    let message: serde_json::Value = serde_json::from_str(&ready)?;
    if message["version"] == 1 && message["type"] == "forwarded" {
        drop(child);
        return Ok(());
    }
    if message["version"] != 1 || message["type"] != "ready" {
        return Err(format!("Controller did not become ready: {message}").into());
    }
    validate_window_descriptor(&message)?;
    let setup_handle = app_handle.clone();
    let setup_controller_ended = controller_ended.clone();
    let event_input = input.clone();
    let event_close_pending = close_pending.clone();
    let event_url_dispatch = url_dispatch.clone();
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            if setup_controller_ended.load(Ordering::Acquire) {
                return Err("Desktop controller stopped before window startup".into());
            }
            app.manage(window_state::WindowStateStore::new(&app.handle())?);
            app.manage(url_dispatch.clone());
            app.manage(DownloadReservations::default());
            *setup_handle.lock().map_err(|_| "Native host state is unavailable")? = Some(app.handle().clone());
            create_window(&app.handle(), &message)?;
            if setup_controller_ended.load(Ordering::Acquire) {
                return Err("Desktop controller stopped during window startup".into());
            }
            Ok(())
        })
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::Focused(true) = event {
                if let Ok(mut dispatch) = event_url_dispatch.lock() {
                    dispatch.focused = Some(window.label().to_owned());
                }
            }
            if matches!(event, tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }
                | tauri::WindowEvent::CloseRequested { .. }) {
                if let Some(store) = window.app_handle().try_state::<Arc<window_state::WindowStateStore>>() {
                    store.record(window, matches!(event, tauri::WindowEvent::CloseRequested { .. }));
                }
            }
            if let tauri::WindowEvent::Destroyed = event {
                if let Ok(mut dispatch) = event_url_dispatch.lock() {
                    dispatch.loaded.remove(window.label());
                    dispatch.pending.remove(window.label());
                    if dispatch.focused.as_deref() == Some(window.label()) {
                        dispatch.focused = None;
                    }
                }
                if let Ok(mut pending) = event_close_pending.lock() {
                    pending.remove(window.label());
                }
                if let Ok(mut input) = event_input.lock() {
                    let _ = writeln!(input, "{}", serde_json::json!({"version": 1, "type": "window-destroyed", "window": window.label()}));
                    let _ = input.flush();
                }
            } else if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let mut pending = match event_close_pending.lock() {
                    Ok(pending) => pending,
                    Err(_) => return,
                };
                if pending.contains_key(window.label()) {
                    return;
                }
                let id = close_next_id.fetch_add(1, Ordering::Relaxed) + 1;
                pending.insert(window.label().to_owned(), id);
                let sent = event_input.lock().map(|mut input| {
                    writeln!(input, "{}", serde_json::json!({"version": 1, "type": "close-request", "id": id, "window": window.label()}))
                        .and_then(|_| input.flush())
                });
                if !matches!(sent, Ok(Ok(()))) {
                    pending.remove(window.label());
                    return;
                }
                let timeout_pending = event_close_pending.clone();
                let label = window.label().to_owned();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(17));
                    if let Ok(mut pending) = timeout_pending.lock() {
                        if pending.get(&label) == Some(&id) {
                            pending.remove(&label);
                        }
                    }
                });
            }
        })
        .run(tauri::generate_context!());
    drop(child);
    result?;
    Ok(())
}

fn validate_window_descriptor(
    descriptor: &serde_json::Value,
) -> Result<(), Box<dyn std::error::Error>> {
    if descriptor["version"] != 1 {
        return Err("Invalid window protocol version".into());
    }
    let label = descriptor["window"]
        .as_str()
        .ok_or("Missing window label")?;
    if label != "main"
        && (!label.starts_with("workspace-")
            || label.len() != 26
            || !label[10..].bytes().all(|byte| byte.is_ascii_hexdigit()))
    {
        return Err("Invalid window label".into());
    }
    let url: url::Url = descriptor["url"]
        .as_str()
        .ok_or("Missing backend URL")?
        .parse()?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port().is_none()
        || url.path() != "/"
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Invalid backend address".into());
    }
    let token = descriptor["token"]
        .as_str()
        .ok_or("Missing security token")?;
    if token.len() != 64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Invalid security token".into());
    }
    let cookie_name = descriptor["cookieName"]
        .as_str()
        .ok_or("Missing cookie name")?;
    let expected_cookie = if label == "main" {
        "THEIA_TAURI_TOKEN".to_owned()
    } else {
        format!("THEIA_TAURI_TOKEN_{}", label.replace('-', ""))
    };
    if cookie_name != expected_cookie {
        return Err("Invalid security cookie name".into());
    }
    Ok(())
}

fn create_window(
    app: &tauri::AppHandle,
    descriptor: &serde_json::Value,
) -> Result<(), Box<dyn std::error::Error>> {
    validate_window_descriptor(descriptor)?;
    let label = descriptor["window"]
        .as_str()
        .ok_or("Missing window label")?;
    let target_url: url::Url = descriptor["url"]
        .as_str()
        .ok_or("Missing backend URL")?
        .parse()?;
    let token = descriptor["token"]
        .as_str()
        .ok_or("Missing security token")?;
    let cookie_name = descriptor["cookieName"]
        .as_str()
        .ok_or("Missing cookie name")?;
    let allowed_backend_origin = target_url.origin();
    let allowed_port = target_url.port_or_known_default();
    let page_load_port = allowed_port;
    let url_dispatch = app.state::<Arc<Mutex<UrlDispatchState>>>().inner().clone();
    let data_directory = match std::env::var_os("THEIA_CONFIG_DIR") {
        Some(config_directory) => std::path::PathBuf::from(config_directory).join("tauri-webview"),
        None => app.path().app_data_dir()?.join("webview"),
    };
    let data_directory = if label == "main" {
        data_directory
    } else {
        data_directory.join(label)
    };
    std::fs::create_dir_all(&data_directory)?;
    let builder = tauri::WebviewWindowBuilder::new(
        app,
        label,
        tauri::WebviewUrl::External("about:blank".parse()?),
    )
    .title("Theia Tauri Example")
    .inner_size(1200.0, 800.0);
    let builder = app
        .state::<Arc<window_state::WindowStateStore>>()
        .apply(app, builder);
    let window = builder
        .data_directory(data_directory)
        .on_download(|webview, event| match event {
            tauri::webview::DownloadEvent::Requested { url, destination } => {
                let reservations = webview.app_handle().state::<DownloadReservations>();
                let mut reservations = match reservations.0.lock() {
                    Ok(reservations) => reservations,
                    Err(_) => return false,
                };
                reservations.begin(url.as_str());
                let downloads = match webview.app_handle().path().download_dir() {
                    Ok(downloads) => downloads,
                    Err(error) => {
                        eprintln!("Could not find Downloads directory: {error}");
                        return false;
                    }
                };
                if let Err(error) = std::fs::create_dir_all(&downloads) {
                    eprintln!("Could not create Downloads directory: {error}");
                    return false;
                }
                let filename = destination
                    .file_name()
                    .unwrap_or_else(|| std::ffi::OsStr::new("download"))
                    .to_string_lossy();
                let name = std::path::Path::new(filename.as_ref());
                let stem = name
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or("download");
                let extension = name.extension().and_then(|value| value.to_str());
                for attempt in 0..1000 {
                    let name = if attempt == 0 {
                        filename.to_string()
                    } else if let Some(extension) = extension {
                        format!("{stem} ({attempt}).{extension}")
                    } else {
                        format!("{stem} ({attempt})")
                    };
                    let path = downloads.join(name);
                    if matches!(
                        std::fs::symlink_metadata(&path),
                        Err(error) if error.kind() == std::io::ErrorKind::NotFound
                    ) && !reservations.active.contains(&path)
                    {
                        reservations.reserve(url.as_str(), path.clone());
                        *destination = path;
                        return true;
                    }
                }
                eprintln!("Could not reserve a unique download filename");
                false
            }
            tauri::webview::DownloadEvent::Finished { url, path, .. } => {
                if let Ok(mut reservations) = webview
                    .app_handle()
                    .state::<DownloadReservations>()
                    .0
                    .lock()
                {
                    reservations.finish(url.as_str(), path.as_deref());
                }
                true
            }
            _ => true,
        })
        .on_page_load(move |window, payload| {
            if payload.url().host_str() != Some("127.0.0.1")
                || payload.url().port_or_known_default() != page_load_port
            {
                return;
            }
            if let Ok(mut dispatch) = url_dispatch.lock() {
                match payload.event() {
                    tauri::webview::PageLoadEvent::Started => {
                        dispatch.loaded.remove(window.label());
                    }
                    tauri::webview::PageLoadEvent::Finished => {
                        dispatch.loaded.insert(window.label().to_owned());
                    }
                }
            }
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                deliver_urls(&window.app_handle(), &url_dispatch, window.label());
            }
        })
        .on_navigation(move |url| {
            url.as_str() == "about:blank"
                || url.origin() == allowed_backend_origin
                || (url.scheme() == "http"
                    && url.port_or_known_default() == allowed_port
                    && url.host_str().is_some_and(|host| {
                        host.ends_with(".webview.localhost")
                            || host.ends_with(".mini-browser.localhost")
                    }))
        })
        .on_menu_event(|native_window, event| {
            if let Some(webview) = native_window
                .app_handle()
                .get_webview_window(native_window.label())
            {
                if let Ok(id) = serde_json::to_string(&event.id().0) {
                    let _ = webview.eval(&format!(
                    "window.dispatchEvent(new CustomEvent('theia-tauri-menu', {{ detail: {id} }}))"
                ));
                }
            }
        })
        .build()?;
    let cookie = tauri::webview::Cookie::build((cookie_name.to_owned(), token.to_owned()))
        .domain("127.0.0.1")
        .path("/")
        .http_only(true)
        .same_site(tauri::webview::cookie::SameSite::Lax)
        .build();
    let launch_result = (|| -> Result<(), Box<dyn std::error::Error>> {
        window.set_cookie(cookie)?;
        if !window
            .cookies_for_url(target_url.clone())?
            .iter()
            .any(|cookie| cookie.name() == cookie_name && cookie.value() == token)
        {
            return Err("Could not initialize the webview security cookie".into());
        }
        window.navigate(target_url)?;
        Ok(())
    })();
    if launch_result.is_err() {
        let _ = window.destroy();
    }
    launch_result
}

fn queue_open_url(
    handle: &Arc<Mutex<Option<tauri::AppHandle>>>,
    dispatch: &Arc<Mutex<UrlDispatchState>>,
    url: &str,
) {
    if url.len() > 8192
        || url.bytes().any(|byte| matches!(byte, b'\r' | b'\n' | 0))
        || url::Url::parse(url).is_err()
    {
        eprintln!("Ignoring invalid Tauri open URL");
        return;
    }
    let app = handle.lock().ok().and_then(|handle| handle.clone());
    let label = {
        let Ok(mut state) = dispatch.lock() else {
            return;
        };
        let label = app
            .as_ref()
            .and_then(|app| {
                state
                    .focused
                    .as_deref()
                    .filter(|label| app.get_webview_window(label).is_some())
                    .map(str::to_owned)
                    .or_else(|| app.get_webview_window("main").map(|_| "main".to_owned()))
                    .or_else(|| app.webview_windows().keys().next().cloned())
            })
            .unwrap_or_else(|| "main".to_owned());
        let pending = state.pending.entry(label.clone()).or_default();
        if pending.len() >= 32 {
            eprintln!("Ignoring excess Tauri open URLs");
            return;
        }
        pending.push(url.to_owned());
        label
    };
    if let Some(app) = app {
        deliver_urls(&app, dispatch, &label);
    }
}

fn deliver_urls(app: &tauri::AppHandle, dispatch: &Arc<Mutex<UrlDispatchState>>, label: &str) {
    let Some(window) = app.get_webview_window(label) else {
        return;
    };
    let urls = {
        let Ok(mut state) = dispatch.lock() else {
            return;
        };
        if !state.loaded.contains(label) {
            return;
        }
        state.pending.remove(label).unwrap_or_default()
    };
    for url in urls {
        let Ok(value) = serde_json::to_string(&url) else {
            continue;
        };
        let script = format!(
            "(window.__theiaTauriOpenUrls ||= []).push({value}); window.dispatchEvent(new Event('theia-tauri-open-url'));"
        );
        if let Err(error) = window.eval(&script) {
            eprintln!("Could not dispatch Tauri URL: {error}");
        }
    }
}

fn handle_create_window(
    handle: &Arc<Mutex<Option<tauri::AppHandle>>>,
    input: &Arc<Mutex<ChildStdin>>,
    request: &serde_json::Value,
) {
    let mut app = handle.lock().ok().and_then(|handle| handle.clone());
    for _ in 0..200 {
        if app.is_some() {
            break;
        }
        std::thread::sleep(Duration::from_millis(50));
        app = handle.lock().ok().and_then(|handle| handle.clone());
    }
    let Some(app) = app else {
        if let Ok(mut input) = input.lock() {
            let _ = writeln!(
                input,
                "{}",
                serde_json::json!({"version": 1, "type": "window-created", "window": request["window"], "ok": false, "error": "Native host is unavailable"})
            );
            let _ = input.flush();
        }
        return;
    };
    let descriptor = request.clone();
    let label = request["window"].as_str().unwrap_or_default().to_owned();
    let response_input = input.clone();
    let result = app.clone().run_on_main_thread(move || {
        let result = create_window(&app, &descriptor);
        if let Ok(mut input) = response_input.lock() {
            let response = match result {
                Ok(()) => serde_json::json!({"version": 1, "type": "window-created", "window": label, "ok": true}),
                Err(error) => serde_json::json!({"version": 1, "type": "window-created", "window": label, "ok": false, "error": error.to_string()}),
            };
            let _ = writeln!(input, "{response}");
            let _ = input.flush();
        }
    });
    if let Err(error) = result {
        if let Ok(mut input) = input.lock() {
            let _ = writeln!(
                input,
                "{}",
                serde_json::json!({"version": 1, "type": "window-created", "window": request["window"], "ok": false, "error": error.to_string()})
            );
            let _ = input.flush();
        }
    }
}

fn handle_close_response(
    handle: &Arc<Mutex<Option<tauri::AppHandle>>>,
    pending: &Arc<Mutex<HashMap<String, u64>>>,
    response: &serde_json::Value,
) {
    if response["version"] != 1 {
        return;
    }
    let id = match response["id"].as_u64() {
        Some(id) => id,
        None => return,
    };
    let label = match response["window"].as_str() {
        Some(label) => label,
        None => return,
    };
    let mut pending = match pending.lock() {
        Ok(pending) => pending,
        Err(_) => return,
    };
    if pending.get(label) != Some(&id) {
        return;
    }
    pending.remove(label);
    if response["allow"] == true {
        if let Ok(app) = handle.lock() {
            if let Some(window) = app.as_ref().and_then(|app| app.get_webview_window(label)) {
                let _ = window.destroy();
            }
        }
    }
}

fn handle_native_request(
    handle: &Arc<Mutex<Option<tauri::AppHandle>>>,
    request: &serde_json::Value,
) -> serde_json::Value {
    let id = request["id"].as_u64();
    let result = (|| -> Result<(), String> {
        if request["version"] != 1 {
            return Err("Unsupported native operation".into());
        }
        let app = handle
            .lock()
            .map_err(|_| "Native host state is unavailable")?;
        let app = app.as_ref().ok_or("Native host is not ready")?;
        let label = request["window"].as_str().ok_or("Missing window label")?;
        let window = app
            .get_webview_window(label)
            .ok_or("Window is unavailable")?;
        match request["operation"].as_str() {
            Some("set-window-title") => {
                let title = request["title"].as_str().ok_or("Missing window title")?;
                if title.is_empty()
                    || title.len() > 200
                    || title.chars().any(|ch| matches!(ch, '\r' | '\n' | '\0'))
                {
                    return Err("Invalid window title".into());
                }
                window.set_title(title).map_err(|error| error.to_string())
            }
            Some("set-menu") => {
                let items = request["items"].as_array().ok_or("Missing menu items")?;
                let mut count = 0;
                let menu = Menu::new(app).map_err(|error| error.to_string())?;
                for item in items {
                    let child = build_menu_item(app, item, 0, &mut count)?;
                    menu.append(&child).map_err(|error| error.to_string())?;
                }
                window.set_menu(menu).map_err(|error| error.to_string())?;
                Ok(())
            }
            Some("focus-window") => {
                #[cfg(target_os = "linux")]
                let was_minimized = window.is_minimized().map_err(|error| error.to_string())?;
                window.unminimize().map_err(|error| error.to_string())?;
                window.show().map_err(|error| error.to_string())?;
                window.set_focus().map_err(|error| error.to_string())?;
                #[cfg(target_os = "linux")]
                if was_minimized {
                    activate_minimized_x11_window(&window)?;
                }
                Ok(())
            }
            Some("close-window") => window.close().map_err(|error| error.to_string()),
            Some("minimize-window") => window.minimize().map_err(|error| error.to_string()),
            Some("toggle-maximize") => {
                let maximized = window.is_maximized().map_err(|error| error.to_string())?;
                if maximized {
                    window.unmaximize().map_err(|error| error.to_string())
                } else {
                    window.maximize().map_err(|error| error.to_string())
                }
            }
            Some("toggle-fullscreen") => {
                let fullscreen = window.is_fullscreen().map_err(|error| error.to_string())?;
                window
                    .set_fullscreen(!fullscreen)
                    .map_err(|error| error.to_string())
            }
            Some("set-window-zoom") => {
                let level = request["zoomLevel"]
                    .as_f64()
                    .ok_or("Missing window zoom level")?;
                if !level.is_finite() || !(-8.0..=9.0).contains(&level) {
                    return Err("Invalid window zoom level".into());
                }
                window
                    .set_zoom(1.2_f64.powf(level))
                    .map_err(|error| error.to_string())
            }
            _ => Err("Unsupported native operation".into()),
        }
    })();
    match result {
        Ok(()) => {
            serde_json::json!({"version": 1, "type": "native-response", "id": id, "ok": true})
        }
        Err(error) => {
            serde_json::json!({"version": 1, "type": "native-response", "id": id, "ok": false, "error": error})
        }
    }
}

#[cfg(target_os = "linux")]
fn activate_minimized_x11_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    use gdkx11::glib::Cast;
    use gtk::prelude::WidgetExt;
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{ClientMessageEvent, ConnectionExt, EventMask};

    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let window_for_main = window.clone();
    window
        .run_on_main_thread(move || {
            let result = (|| -> Result<Option<u32>, String> {
                let native = window_for_main
                    .gtk_window()
                    .map_err(|error| error.to_string())?;
                let gdk_window = native.window().ok_or("Window is not realized")?;
                let x11_window = match gdk_window.downcast::<gdkx11::X11Window>() {
                    Ok(window) => window,
                    // Wayland has no X11 window ID; Tauri's normal focus request is used there.
                    Err(_) => return Ok(None),
                };
                Ok(Some(
                    u32::try_from(x11_window.xid()).map_err(|error| error.to_string())?,
                ))
            })();
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;
    let xid = match receiver
        .recv_timeout(Duration::from_secs(2))
        .map_err(|error| error.to_string())??
    {
        Some(xid) => xid,
        None => return Ok(()),
    };
    let (connection, screen_number) = x11rb::connect(None).map_err(|error| error.to_string())?;
    let atom = connection
        .intern_atom(false, b"_NET_ACTIVE_WINDOW")
        .map_err(|error| error.to_string())?
        .reply()
        .map_err(|error| error.to_string())?
        .atom;
    let root = connection.setup().roots[screen_number].root;
    let event = ClientMessageEvent::new(32, xid, atom, [2, 0, 0, 0, 0]);
    connection
        .send_event(
            false,
            root,
            EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
            event,
        )
        .map_err(|error| error.to_string())?;
    connection.flush().map_err(|error| error.to_string())
}

fn build_menu_item(
    app: &tauri::AppHandle,
    item: &serde_json::Value,
    depth: usize,
    count: &mut usize,
) -> Result<MenuItemKind<tauri::Wry>, String> {
    // The controller checks the same bounds before forwarding. Keep the native host
    // defensive because its input is a separate process protocol.
    *count += 1;
    if *count > 500 || depth > 5 {
        return Err("Menu is too large".into());
    }
    if item["type"] == "separator" {
        return PredefinedMenuItem::separator(app)
            .map(MenuItemKind::Predefined)
            .map_err(|error| error.to_string());
    }
    let label = item["label"].as_str().ok_or("Missing menu label")?;
    if label.is_empty()
        || label.len() > 120
        || label.chars().any(|ch| matches!(ch, '\r' | '\n' | '\0'))
    {
        return Err("Invalid menu label".into());
    }
    // Theia labels contain literal ampersands; GTK would otherwise treat them as mnemonics.
    let label = label.replace('&', "&&");
    let enabled = item["enabled"].as_bool().unwrap_or(true);
    if let Some(children) = item["submenu"].as_array() {
        if children.len() > 100 {
            return Err("Menu has too many children".into());
        }
        let submenu = Submenu::new(app, &label, enabled).map_err(|error| error.to_string())?;
        for child in children {
            let child = build_menu_item(app, child, depth + 1, count)?;
            submenu.append(&child).map_err(|error| error.to_string())?;
        }
        return Ok(MenuItemKind::Submenu(submenu));
    }
    let id = item["id"].as_str().ok_or("Missing menu item ID")?;
    if id.is_empty()
        || id.len() > 80
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err("Invalid menu item ID".into());
    }
    if item["type"] == "checkbox" {
        CheckMenuItem::with_id(
            app,
            id,
            &label,
            enabled,
            item["checked"] == true,
            None::<&str>,
        )
        .map(MenuItemKind::Check)
        .map_err(|error| error.to_string())
    } else {
        MenuItem::with_id(app, id, &label, enabled, None::<&str>)
            .map(MenuItemKind::MenuItem)
            .map_err(|error| error.to_string())
    }
}

fn handle_file_dialog_request(
    handle: &Arc<Mutex<Option<tauri::AppHandle>>>,
    input: &Arc<Mutex<ChildStdin>>,
    request: &serde_json::Value,
) {
    let id = request["id"].as_u64();
    let window = if request["version"] == 1 && id.is_some() {
        handle.lock().ok().and_then(|app| {
            app.as_ref().and_then(|app| {
                request["window"]
                    .as_str()
                    .and_then(|label| app.get_webview_window(label))
            })
        })
    } else {
        None
    };
    let Some(window) = window else {
        send_dialog_response::<String>(input, id, Err("Window is unavailable".into()));
        return;
    };
    let operation = request["operation"].as_str().unwrap_or_default();
    let options = &request["options"];
    let mut dialog = window.dialog().file();
    if let Some(title) = options["title"].as_str() {
        dialog = dialog.set_title(title);
    }
    if let Some(default_path) = options["defaultPath"].as_str() {
        let path = std::path::Path::new(default_path);
        if path.is_dir() {
            dialog = dialog.set_directory(path);
        } else if let Some(parent) = path.parent() {
            dialog = dialog.set_directory(parent);
            if let Some(name) = path.file_name() {
                dialog = dialog.set_file_name(name.to_string_lossy());
            }
        }
    }
    if let Some(filters) = options["filters"].as_array() {
        for filter in filters {
            if let (Some(name), Some(extensions)) =
                (filter["name"].as_str(), filter["extensions"].as_array())
            {
                let values: Vec<&str> = extensions
                    .iter()
                    .filter_map(|value| value.as_str())
                    .collect();
                if !values.is_empty() {
                    dialog = dialog.add_filter(name, &values);
                }
            }
        }
    }
    let input = input.clone();
    if operation == "show-save-dialog" {
        dialog.save_file(move |file| {
            send_dialog_response(&input, id, file.map(file_path).transpose())
        });
    } else if operation == "show-open-dialog" && options["directory"] == true {
        if options["multiple"] == true {
            dialog.pick_folders(move |files| {
                send_dialog_response(&input, id, files.map(file_paths).transpose())
            });
        } else {
            dialog.pick_folder(move |file| {
                send_dialog_response(
                    &input,
                    id,
                    file.map(file_path)
                        .transpose()
                        .map(|path| path.map(|path| vec![path])),
                )
            });
        }
    } else if operation == "show-open-dialog" && options["multiple"] == true {
        dialog.pick_files(move |files| {
            send_dialog_response(&input, id, files.map(file_paths).transpose())
        });
    } else if operation == "show-open-dialog" {
        dialog.pick_file(move |file| {
            send_dialog_response(
                &input,
                id,
                file.map(file_path)
                    .transpose()
                    .map(|path| path.map(|path| vec![path])),
            )
        });
    } else {
        dialog.pick_file(move |file| {
            send_dialog_response(&input, id, file.map(file_path).transpose())
        });
    }
}

fn handle_clipboard_request(
    handle: &Arc<Mutex<Option<tauri::AppHandle>>>,
    input: &Arc<Mutex<ChildStdin>>,
    request: &serde_json::Value,
) {
    let id = request["id"].as_u64();
    if request["version"] != 1 || request["window"].as_str().is_none() || id.is_none() {
        send_dialog_response::<String>(input, id, Err("Invalid clipboard request".into()));
        return;
    }
    let operation = request["operation"].as_str();
    if operation == Some("read-clipboard-text") && request.get("text").is_some() {
        send_dialog_response::<String>(input, id, Err("Invalid clipboard request".into()));
        return;
    }
    let text = if operation == Some("write-clipboard-text") {
        match request["text"].as_str() {
            Some(text) if text.len() <= 1024 * 1024 => Some(text.to_owned()),
            _ => {
                send_dialog_response::<String>(input, id, Err("Invalid clipboard text".into()));
                return;
            }
        }
    } else {
        None
    };
    let app = handle.lock().ok().and_then(|handle| handle.clone());
    let Some(app) = app else {
        send_dialog_response::<String>(input, id, Err("Native host is unavailable".into()));
        return;
    };
    let response_input = input.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        let clipboard =
            gtk::gdk::Display::default().and_then(|display| gtk::Clipboard::default(&display));
        let Some(clipboard) = clipboard else {
            send_dialog_response::<String>(
                &response_input,
                id,
                Err("System clipboard is unavailable".into()),
            );
            return;
        };
        if let Some(text) = text {
            clipboard.set_text(&text);
            send_dialog_response::<String>(&response_input, id, Ok(None));
        } else {
            clipboard.request_text(move |_, text| {
                send_dialog_response(
                    &response_input,
                    id,
                    Ok(Some(text.unwrap_or_default().to_owned())),
                );
            });
        }
    }) {
        send_dialog_response::<String>(input, id, Err(error.to_string()));
    }
}

fn file_path(file: tauri_plugin_dialog::FilePath) -> Result<String, String> {
    file.into_path()
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

fn file_paths(files: Vec<tauri_plugin_dialog::FilePath>) -> Result<Vec<String>, String> {
    files.into_iter().map(file_path).collect()
}

fn send_dialog_response<T: serde::Serialize>(
    input: &Arc<Mutex<ChildStdin>>,
    id: Option<u64>,
    result: Result<Option<T>, String>,
) {
    let response = match result {
        Ok(value) => {
            serde_json::json!({"version": 1, "type": "native-response", "id": id, "ok": true, "result": value})
        }
        Err(error) => {
            serde_json::json!({"version": 1, "type": "native-response", "id": id, "ok": false, "error": error})
        }
    };
    if let Ok(mut input) = input.lock() {
        let _ = writeln!(input, "{response}");
        let _ = input.flush();
    }
}
