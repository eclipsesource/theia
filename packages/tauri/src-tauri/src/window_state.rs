// Copyright (C) 2026 Eclipse Theia contributors.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, WebviewWindowBuilder, Window};

#[derive(Clone, Serialize, Deserialize)]
struct WindowState {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    maximized: bool,
    fullscreen: bool,
    screen_layout: String,
}

pub struct WindowStateStore {
    path: PathBuf,
    state: Mutex<Option<WindowState>>,
    pending: AtomicBool,
}

impl WindowStateStore {
    pub fn new(app: &AppHandle) -> tauri::Result<Arc<Self>> {
        let directory = match std::env::var_os("THEIA_CONFIG_DIR") {
            Some(directory) => PathBuf::from(directory),
            None => app.path().app_data_dir()?,
        };
        let path = directory.join("tauri-window-state.json");
        let state = std::fs::read(&path)
            .ok()
            .and_then(|data| serde_json::from_slice::<WindowState>(&data).ok());
        Ok(Arc::new(Self {
            path,
            state: Mutex::new(state),
            pending: AtomicBool::new(false),
        }))
    }

    pub fn apply<'a>(
        &self,
        app: &AppHandle,
        builder: WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
    ) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
        let saved = self.state.lock().ok().and_then(|state| state.clone());
        let Some(saved) = saved else { return builder };
        if saved.screen_layout != screen_layout(app.available_monitors().ok())
            || !saved.width.is_finite()
            || !saved.height.is_finite()
            || !(200.0..=10000.0).contains(&saved.width)
            || !(120.0..=10000.0).contains(&saved.height)
            || !saved.x.is_finite()
            || !saved.y.is_finite()
        {
            return builder;
        }
        let offset = app.webview_windows().len() as f64 * 30.0;
        builder
            .position(saved.x + offset, saved.y + offset)
            .inner_size(saved.width, saved.height)
            .maximized(saved.maximized)
            .fullscreen(saved.fullscreen)
    }

    pub fn record(self: &Arc<Self>, window: &Window, immediate: bool) {
        let (Ok(position), Ok(size), Ok(scale), Ok(maximized), Ok(fullscreen)) = (
            window.outer_position(),
            window.inner_size(),
            window.scale_factor(),
            window.is_maximized(),
            window.is_fullscreen(),
        ) else {
            return;
        };
        if !scale.is_finite() || scale <= 0.0 {
            return;
        }
        let layout = screen_layout(window.available_monitors().ok());
        let mut guard = match self.state.lock() {
            Ok(guard) => guard,
            Err(_) => return,
        };
        let mut state = guard.clone().unwrap_or(WindowState {
            x: 0.0,
            y: 0.0,
            width: 1200.0,
            height: 800.0,
            maximized: false,
            fullscreen: false,
            screen_layout: layout.clone(),
        });
        if !maximized && !fullscreen && size.width >= 200 && size.height >= 120 {
            state.x = position.x as f64 / scale;
            state.y = position.y as f64 / scale;
            state.width = size.width as f64 / scale;
            state.height = size.height as f64 / scale;
        }
        state.maximized = maximized;
        state.fullscreen = fullscreen;
        state.screen_layout = layout;
        *guard = Some(state);
        if immediate {
            self.write_locked(&guard);
            return;
        }
        drop(guard);
        if !self.pending.swap(true, Ordering::AcqRel) {
            let store = Arc::clone(self);
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(1));
                if let Ok(guard) = store.state.lock() {
                    store.write_locked(&guard);
                }
                store.pending.store(false, Ordering::Release);
            });
        }
    }

    fn write_locked(&self, state: &Option<WindowState>) {
        let Some(state) = state else { return };
        let result = (|| -> std::io::Result<()> {
            if let Some(parent) = self.path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let data = serde_json::to_vec(state).map_err(std::io::Error::other)?;
            let temporary = self.path.with_extension("json.tmp");
            std::fs::write(&temporary, data)?;
            std::fs::rename(temporary, &self.path)
        })();
        if let Err(error) = result {
            eprintln!("Could not save Tauri window state: {error}");
        }
    }
}

fn screen_layout(monitors: Option<Vec<tauri::Monitor>>) -> String {
    let mut bounds = monitors
        .unwrap_or_default()
        .iter()
        .map(|monitor| {
            let position = monitor.position();
            let size = monitor.size();
            format!(
                "{}:{}:{}:{}",
                position.x, position.y, size.width, size.height
            )
        })
        .collect::<Vec<_>>();
    bounds.sort();
    bounds.join("-")
}
