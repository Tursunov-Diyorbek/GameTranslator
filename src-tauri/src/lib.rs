mod gemini;
mod lang;
mod settings;

#[cfg(windows)]
mod snip;

#[cfg(not(windows))]
mod snip {
    //! Global hotkey faqat Windows'da qo'llanadi — boshqa platformalarda bo'sh stub.
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
    use std::sync::Arc;

    #[derive(Debug, Default)]
    pub struct HotkeyState {
        pub armed: AtomicBool,
        pub snip_vk: AtomicU32,
        pub toggle_vk: AtomicU32,
        pub shutdown: AtomicBool,
    }

    impl HotkeyState {
        pub fn is_armed(&self) -> bool {
            self.armed.load(Ordering::Relaxed)
        }
    }

    #[derive(Debug)]
    pub enum SnipEvent {
        Toggle(bool),
        Opened,
        Cancelled,
        Captured(Vec<u8>),
    }

    pub fn spawn<F>(_state: Arc<HotkeyState>, _sink: F)
    where
        F: Fn(SnipEvent) + Send + 'static,
    {
    }
}

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State};

use lang::Language;
use settings::Settings;

const OVERLAY_WINDOW: &str = "overlay";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationResult {
    pub id: String,
    pub created_at: u64,
    pub image: String,
    pub original: String,
    pub translation: String,
    pub note: String,
}

/// O'yin ustidagi kichik oynaning holati.
#[derive(Debug, Clone, Serialize)]
struct OverlayState {
    status: &'static str,
    translation: String,
    note: String,
    error: String,
}

impl OverlayState {
    fn new(status: &'static str) -> Self {
        Self {
            status,
            translation: String::new(),
            note: String::new(),
            error: String::new(),
        }
    }

    fn hide() -> Self {
        Self::new("hide")
    }

    fn armed() -> Self {
        Self::new("armed")
    }

    fn loading() -> Self {
        Self::new("loading")
    }

    fn done(result: &TranslationResult) -> Self {
        Self {
            status: "done",
            translation: result.translation.clone(),
            note: result.note.clone(),
            error: String::new(),
        }
    }

    fn error(message: impl Into<String>) -> Self {
        Self {
            status: "error",
            translation: String::new(),
            note: String::new(),
            error: message.into(),
        }
    }
}

/// Barcha o'zgaruvchan holat — `Arc` orqali ip va async vazifalar bilan bo'lishiladi.
/// Tauri `State` ni `await` orqali ushlab turish mumkin emas, shuning uchun alohida.
struct Shared {
    hotkeys: Arc<snip::HotkeyState>,
    settings: Mutex<Settings>,
    last: Mutex<Option<TranslationResult>>,
    translating: AtomicBool,
    counter: AtomicU64,
}

impl Shared {
    fn new() -> Self {
        let shared = Self {
            hotkeys: Arc::new(snip::HotkeyState::default()),
            settings: Mutex::new(settings::load_from_disk()),
            last: Mutex::new(None),
            translating: AtomicBool::new(false),
            counter: AtomicU64::new(0),
        };
        shared.apply_hotkeys();
        shared
    }

    fn next_id(&self) -> String {
        let seq = self.counter.fetch_add(1, Ordering::Relaxed);
        format!("{:x}-{:x}", now_ms(), seq)
    }

    fn snapshot(&self) -> Settings {
        self.settings
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    /// Sozlamalardagi tugmalarni kuzatuvchi ipiga uzatadi.
    fn apply_hotkeys(&self) {
        let current = self.snapshot();
        self.hotkeys
            .snip_vk
            .store(settings::code_to_vk(&current.hotkey), Ordering::Relaxed);
        self.hotkeys
            .toggle_vk
            .store(settings::code_to_vk(&current.toggle_hotkey), Ordering::Relaxed);
    }

    fn remember(&self, result: &TranslationResult) {
        if let Ok(mut last) = self.last.lock() {
            *last = Some(result.clone());
        }
    }
}

struct AppState(Arc<Shared>);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Overlay oynasini ekranning yuqori o'ng burchagiga qo'yadi.
/// JS ruxsatlari ishlamasa ham dastlabki joy shu yerda belgilanadi.
fn place_overlay(app: &AppHandle, width: f64, height: f64) {
    let Some(window) = app.get_webview_window(OVERLAY_WINDOW) else {
        return;
    };
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let scale = monitor.scale_factor();
    let screen = monitor.size();
    let origin = monitor.position();
    let x = origin.x as f64 / scale + screen.width as f64 / scale - width - 16.0;
    let y = origin.y as f64 / scale + 16.0;
    let _ = window.set_size(LogicalSize::new(width, height));
    let _ = window.set_position(LogicalPosition::new(x, y));
}

/// Asosiy oyna yopilsa butun dastur chiqadi — overlay va hotkey ipi qolmasin.
fn quit_app(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        state.0.hotkeys.armed.store(false, Ordering::Relaxed);
        state.0.hotkeys.shutdown.store(true, Ordering::Relaxed);
    }
    if let Some(overlay) = app.get_webview_window(OVERLAY_WINDOW) {
        let _ = overlay.hide();
        let _ = overlay.close();
    }
    app.exit(0);
}

fn push_overlay(app: &AppHandle, state: OverlayState) {
    let Some(window) = app.get_webview_window(OVERLAY_WINDOW) else {
        return;
    };

    if state.status == "hide" {
        let _ = window.hide();
    } else if !window.is_visible().unwrap_or(false) {
        // Faqat yashiringan holatda show() chaqiriladi — takroriy show() o'yindan
        // fokusni tortib olishi mumkin.
        let _ = window.show();
    }

    let _ = window.emit("gt:overlay", state);
}

/// Skrinshot olindi — tarjima qilib, natijani overlay va asosiy oynaga yuboradi.
async fn handle_capture(app: AppHandle, shared: Arc<Shared>, jpeg: Vec<u8>) {
    // Oldingi tarjima hali tugamagan bo'lsa bu kadrni tashlab ketamiz.
    if shared.translating.swap(true, Ordering::SeqCst) {
        return;
    }

    let _ = app.emit("gt:busy", ());
    push_overlay(&app, OverlayState::loading());

    let data_url = format!("data:image/jpeg;base64,{}", BASE64.encode(&jpeg));
    let current = shared.snapshot();
    let outcome = gemini::translate(
        &current.api_key,
        current.target_language_name(),
        &data_url,
    )
    .await;

    match outcome {
        Ok(payload) => {
            let result = TranslationResult {
                id: shared.next_id(),
                created_at: now_ms(),
                image: data_url,
                original: payload.original,
                translation: payload.translation,
                note: payload.note,
            };
            shared.remember(&result);
            push_overlay(&app, OverlayState::done(&result));
            let _ = app.emit("gt:result", result);
        }
        Err(message) => {
            push_overlay(&app, OverlayState::error(message.clone()));
            let _ = app.emit("gt:error", message);
        }
    }

    shared.translating.store(false, Ordering::SeqCst);
}

fn start_watcher(app: &AppHandle, shared: Arc<Shared>) {
    let handle = app.clone();
    let hotkeys = shared.hotkeys.clone();

    snip::spawn(hotkeys, move |event| match event {
        snip::SnipEvent::Toggle(on) => {
            let _ = handle.emit("gt:toggle", on);
            push_overlay(
                &handle,
                if on {
                    OverlayState::armed()
                } else {
                    OverlayState::hide()
                },
            );
        }
        snip::SnipEvent::Opened => {
            // Kesish oynasi ochilganda overlay xalaqit bermasligi kerak.
            push_overlay(&handle, OverlayState::hide());
            let _ = handle.emit("gt:snip-open", ());
        }
        snip::SnipEvent::Cancelled => {
            push_overlay(&handle, OverlayState::armed());
            let _ = handle.emit("gt:snip-cancel", ());
        }
        snip::SnipEvent::Captured(jpeg) => {
            tauri::async_runtime::spawn(handle_capture(handle.clone(), shared.clone(), jpeg));
        }
    });
}

#[tauri::command]
fn get_settings(app: AppHandle, state: State<'_, AppState>) -> Settings {
    let loaded = settings::load(&app);
    if let Ok(mut guard) = state.0.settings.lock() {
        *guard = loaded.clone();
    }
    state.0.apply_hotkeys();
    loaded
}

#[tauri::command]
fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    mut settings: Settings,
) -> Result<Settings, String> {
    settings.sanitize();

    if let Ok(mut guard) = state.0.settings.lock() {
        *guard = settings.clone();
    }
    state.0.apply_hotkeys();
    settings::save(&app, &settings)?;

    // Overlay boshqa oynada yashaydi — interfeys tilini shu voqeadan biladi.
    let _ = app.emit("gt:settings", &settings);

    Ok(settings)
}

#[tauri::command]
fn list_languages() -> Vec<Language> {
    lang::LANGUAGES.to_vec()
}

#[tauri::command]
fn set_armed(app: AppHandle, state: State<'_, AppState>, on: bool) {
    state.0.hotkeys.armed.store(on, Ordering::Relaxed);

    push_overlay(
        &app,
        if on {
            OverlayState::armed()
        } else {
            OverlayState::hide()
        },
    );
}

#[tauri::command]
fn get_armed(state: State<'_, AppState>) -> bool {
    state.0.hotkeys.is_armed()
}

#[tauri::command]
fn get_last_result(state: State<'_, AppState>) -> Option<TranslationResult> {
    state.0.last.lock().ok().and_then(|guard| guard.clone())
}

/// Qo'lda qo'yilgan rasm (Ctrl+V) uchun.
#[tauri::command]
async fn translate_image(app: AppHandle, image: String) -> Result<TranslationResult, String> {
    let shared = app.state::<AppState>().0.clone();
    let current = shared.snapshot();

    let payload =
        gemini::translate(&current.api_key, current.target_language_name(), &image).await?;

    let result = TranslationResult {
        id: shared.next_id(),
        created_at: now_ms(),
        image,
        original: payload.original,
        translation: payload.translation,
        note: payload.note,
    };

    shared.remember(&result);
    push_overlay(&app, OverlayState::done(&result));

    Ok(result)
}

#[tauri::command]
fn hide_overlay(app: AppHandle, state: State<'_, AppState>) {
    push_overlay(
        &app,
        if state.0.hotkeys.is_armed() {
            OverlayState::armed()
        } else {
            OverlayState::hide()
        },
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared = Arc::new(Shared::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState(shared.clone()))
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            list_languages,
            set_armed,
            get_armed,
            get_last_result,
            translate_image,
            hide_overlay
        ])
        .setup(move |app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();

            // Diskdagi sozlamalarni yuklaymiz va tugmalarni darhol biriktiramiz.
            if let Ok(mut guard) = shared.settings.lock() {
                *guard = settings::load(&handle);
            }
            shared.apply_hotkeys();
            place_overlay(&handle, 220.0, 48.0);
            start_watcher(&handle, shared.clone());

            if let Some(main) = handle.get_webview_window("main") {
                let _ = main.show();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                quit_app(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
