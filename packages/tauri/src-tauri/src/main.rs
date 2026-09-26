// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

struct ControllerChild {
    process: Child,
    input: Arc<Mutex<ChildStdin>>,
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
    let close_pending: Arc<Mutex<Option<u64>>> = Arc::new(Mutex::new(None));
    let close_next_id = Arc::new(AtomicU64::new(0));
    let response_input = input.clone();
    let response_handle = app_handle.clone();
    let response_controller_ended = controller_ended.clone();
    let response_close_pending = close_pending.clone();
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
    let ready = receiver.recv_timeout(Duration::from_secs(35))??;
    let message: serde_json::Value = serde_json::from_str(&ready)?;
    if message["version"] != 1 || message["type"] != "ready" {
        return Err(format!("Controller did not become ready: {message}").into());
    }
    let url: url::Url = message["url"]
        .as_str()
        .ok_or("Missing backend URL")?
        .parse()?;
    let token = message["token"].as_str().ok_or("Missing security token")?;
    if token.len() != 64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Controller returned an invalid security token".into());
    }
    if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") {
        return Err("Controller returned an invalid backend address".into());
    }
    let target_url = url.clone();
    let allowed_backend_origin = url.origin();
    let allowed_port = url.port_or_known_default();
    let security_token = token.to_owned();
    let setup_handle = app_handle.clone();
    let setup_controller_ended = controller_ended.clone();
    let event_input = input.clone();
    let event_close_pending = close_pending.clone();
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            if setup_controller_ended.load(Ordering::Acquire) {
                return Err("Desktop controller stopped before window startup".into());
            }
            let data_directory = match std::env::var_os("THEIA_CONFIG_DIR") {
                Some(config_directory) => std::path::PathBuf::from(config_directory).join("tauri-webview"),
                None => app.path().app_data_dir()?.join("webview"),
            };
            std::fs::create_dir_all(&data_directory)?;
            let window = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External("about:blank".parse()?))
                .title("Theia Tauri Example")
                .inner_size(1200.0, 800.0)
                .data_directory(data_directory)
                .on_navigation(move |url| {
                    url.as_str() == "about:blank"
                        || url.origin() == allowed_backend_origin
                        || (url.scheme() == "http"
                            && url.port_or_known_default() == allowed_port
                            && url
                                .host_str()
                                .is_some_and(|host| host.ends_with(".webview.localhost")))
                })
                .build()?;
            let cookie = tauri::webview::Cookie::build(("THEIA_TAURI_TOKEN", security_token.clone()))
                .domain("127.0.0.1")
                .path("/")
                .http_only(true)
                .same_site(tauri::webview::cookie::SameSite::Lax)
                .build();
            window.set_cookie(cookie)?;
            if !window.cookies_for_url(target_url.clone())?.iter().any(|cookie|
                cookie.name() == "THEIA_TAURI_TOKEN" && cookie.value() == security_token
            ) {
                return Err("Could not initialize the webview security cookie".into());
            }
            *setup_handle.lock().map_err(|_| "Native host state is unavailable")? = Some(app.handle().clone());
            if setup_controller_ended.load(Ordering::Acquire) {
                return Err("Desktop controller stopped during window startup".into());
            }
            window.navigate(target_url)?;
            Ok(())
        })
        .on_window_event(move |window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let mut pending = match event_close_pending.lock() {
                    Ok(pending) => pending,
                    Err(_) => return,
                };
                if pending.is_some() {
                    return;
                }
                let id = close_next_id.fetch_add(1, Ordering::Relaxed) + 1;
                *pending = Some(id);
                let sent = event_input.lock().map(|mut input| {
                    writeln!(input, "{}", serde_json::json!({"version": 1, "type": "close-request", "id": id, "window": "main"}))
                        .and_then(|_| input.flush())
                });
                if !matches!(sent, Ok(Ok(()))) {
                    *pending = None;
                    return;
                }
                let timeout_pending = event_close_pending.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(17));
                    if let Ok(mut pending) = timeout_pending.lock() {
                        if *pending == Some(id) {
                            *pending = None;
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

fn handle_close_response(
    handle: &Arc<Mutex<Option<tauri::AppHandle>>>,
    pending: &Arc<Mutex<Option<u64>>>,
    response: &serde_json::Value,
) {
    if response["version"] != 1 {
        return;
    }
    let id = match response["id"].as_u64() {
        Some(id) => id,
        None => return,
    };
    let mut pending = match pending.lock() {
        Ok(pending) => pending,
        Err(_) => return,
    };
    if *pending != Some(id) {
        return;
    }
    *pending = None;
    if response["allow"] == true {
        if let Ok(app) = handle.lock() {
            if let Some(window) = app.as_ref().and_then(|app| app.get_webview_window("main")) {
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
        if request["version"] != 1 || request["window"] != "main" {
            return Err("Unsupported native operation".into());
        }
        let app = handle
            .lock()
            .map_err(|_| "Native host state is unavailable")?;
        let app = app.as_ref().ok_or("Native host is not ready")?;
        let window = app
            .get_webview_window("main")
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
            Some("focus-window") => {
                window.unminimize().map_err(|error| error.to_string())?;
                window.show().map_err(|error| error.to_string())?;
                window.set_focus().map_err(|error| error.to_string())
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

fn handle_file_dialog_request(
    handle: &Arc<Mutex<Option<tauri::AppHandle>>>,
    input: &Arc<Mutex<ChildStdin>>,
    request: &serde_json::Value,
) {
    let id = request["id"].as_u64();
    let window = if request["version"] == 1 && request["window"] == "main" && id.is_some() {
        handle
            .lock()
            .ok()
            .and_then(|app| app.as_ref().and_then(|app| app.get_webview_window("main")))
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
    if request["version"] != 1 || request["window"] != "main" || id.is_none() {
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
