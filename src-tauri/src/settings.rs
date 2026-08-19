//! Sozlamalar diskda saqlanadi (`app_config_dir/settings.json`).
//!
//! Kalit endi binarga joylanmaydi — har bir foydalanuvchi o'z Gemini kalitini
//! kiritadi, shuning uchun sozlamalarning yagona egasi shu modul.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::lang;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub api_key: String,
    /// Tarjima tili — har doim o'zbekcha.
    pub target_lang: String,
    /// Interfeys tili — har doim o'zbekcha.
    pub ui_lang: String,
    /// Skrinshot tugmasi, KeyboardEvent.code shaklida ("KeyT").
    pub hotkey: String,
    /// Yoqish/o'chirish tugmasi ("F8").
    pub toggle_hotkey: String,
    /// Onboarding ekrani o'tilganini belgilaydi.
    pub onboarded: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            target_lang: "uz".to_string(),
            ui_lang: "uz".to_string(),
            hotkey: "KeyT".to_string(),
            toggle_hotkey: "F8".to_string(),
            onboarded: false,
        }
    }
}

impl Settings {
    /// Tashqaridan kelgan qiymatlarni ishonchli holatga keltiradi.
    pub fn sanitize(&mut self) {
        self.api_key = crate::gemini::clean_key(&self.api_key);

        // Kalit bo'lsa onboarding o'tilgan hisoblanadi — eski fayllar ham ishlaydi.
        if !self.api_key.is_empty() {
            self.onboarded = true;
        }
        self.target_lang = "uz".to_string();
        self.ui_lang = "uz".to_string();
        if self.hotkey.trim().is_empty() {
            self.hotkey = "KeyT".to_string();
        }
        if self.toggle_hotkey.trim().is_empty() {
            self.toggle_hotkey = "F8".to_string();
        }
        // Bitta tugma ikki vazifaga biriktirilmasligi kerak.
        if self.hotkey == self.toggle_hotkey {
            self.toggle_hotkey = if self.hotkey == "F8" { "F9" } else { "F8" }.to_string();
        }
    }

    pub fn target_language_name(&self) -> &'static str {
        lang::name_for(&self.target_lang)
    }
}

/// `KeyboardEvent.code` ni Windows virtual key kodiga aylantiradi.
///
/// Hisoblash Rust tomonda turadi, shunda hotkey kuzatuvchisi interfeys yuklanishini
/// kutmasdan darhol ishlay boshlaydi. 0 qaytsa tugma biriktirilmagan hisoblanadi.
pub fn code_to_vk(code: &str) -> u32 {
    if let Some(letter) = code.strip_prefix("Key") {
        let mut chars = letter.chars();
        if let (Some(ch), None) = (chars.next(), chars.next()) {
            if ch.is_ascii_uppercase() {
                return ch as u32;
            }
        }
        return 0;
    }

    if let Some(digit) = code.strip_prefix("Digit") {
        if let Ok(value) = digit.parse::<u32>() {
            if value <= 9 {
                return 0x30 + value;
            }
        }
        return 0;
    }

    if code == "Space" {
        return 0x20;
    }

    if let Some(number) = code.strip_prefix('F') {
        if let Ok(value) = number.parse::<u32>() {
            if (1..=12).contains(&value) {
                return 0x70 + value - 1;
            }
        }
    }

    0
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|err| format!("Sozlamalar papkasi topilmadi: {err}"))?;
    Ok(dir.join("settings.json"))
}

fn extra_settings_paths() -> Vec<PathBuf> {
    let Some(appdata) = std::env::var_os("APPDATA") else {
        return Vec::new();
    };
    let base = PathBuf::from(appdata);
    vec![
        base.join("uz.gametranslator.desktop").join("settings.json"),
        base.join("GameTranslator").join("settings.json"),
    ]
}

fn read_settings_file(path: &PathBuf) -> Option<Settings> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<Settings>(&raw).ok()
}

fn pick_best(candidates: impl IntoIterator<Item = Settings>) -> Settings {
    let mut chosen = Settings::default();
    for mut item in candidates {
        item.sanitize();
        if !item.api_key.is_empty() {
            return item;
        }
        if item.onboarded {
            chosen = item;
        }
    }
    chosen.sanitize();
    chosen
}

/// AppHandle bo'lmasa ham APPDATA dan o'qiydi — oyna ochilishidan oldin kerak.
pub fn load_from_disk() -> Settings {
    pick_best(extra_settings_paths().iter().filter_map(read_settings_file))
}

pub fn load(app: &AppHandle) -> Settings {
    let mut found = Vec::new();
    if let Ok(path) = settings_path(app) {
        if let Some(settings) = read_settings_file(&path) {
            found.push(settings);
        }
    }
    found.extend(extra_settings_paths().iter().filter_map(read_settings_file));
    pick_best(found)
}

fn write_settings_file(path: &PathBuf, settings: &Settings) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|err| format!("Sozlamalar papkasi yaratilmadi: {err}"))?;
    }

    let json = serde_json::to_string_pretty(settings)
        .map_err(|err| format!("Sozlamalar JSON'ga aylanmadi: {err}"))?;

    std::fs::write(path, json).map_err(|err| format!("Sozlamalar saqlanmadi: {err}"))
}

pub fn save(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let mut paths = extra_settings_paths();
    if let Ok(path) = settings_path(app) {
        paths.push(path);
    }
    paths.sort();
    paths.dedup();

    let mut last_error = None;
    let mut wrote = false;
    for path in paths {
        match write_settings_file(&path, settings) {
            Ok(()) => wrote = true,
            Err(err) => last_error = Some(err),
        }
    }

    if wrote {
        Ok(())
    } else {
        Err(last_error.unwrap_or_else(|| "Sozlamalar saqlanmadi".to_string()))
    }
}
