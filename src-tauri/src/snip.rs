//! Windows global hotkey kuzatuvchisi va skrinshot olish.
//!
//! `GetAsyncKeyState` bilan poll qilinadi — bu tugmani "yutmaydi", ya'ni o'yin ham
//! o'sha tugmani oladi. `RegisterHotKey` ishlatilsa tugma o'yindan tortib olinardi.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use windows::Win32::System::DataExchange::GetClipboardSequenceNumber;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, GetAsyncKeyState, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP,
};

const VK_SHIFT: u8 = 0x10;
const VK_MENU: u8 = 0x12;
const VK_ESCAPE: i32 = 0x1B;
const VK_LWIN: u8 = 0x5B;
const VK_RWIN: i32 = 0x5C;
const VK_S: u8 = 0x53;

/// Skrinshot kutish muddati — foydalanuvchi kesish oynasida shuncha vaqt olishi mumkin.
const SNIP_TIMEOUT: Duration = Duration::from_secs(90);
const POLL_INTERVAL: Duration = Duration::from_millis(25);
const MAX_SIDE: u32 = 960;
const JPEG_QUALITY: u8 = 62;

#[derive(Debug, Default)]
pub struct HotkeyState {
    pub armed: AtomicBool,
    pub snip_vk: AtomicU32,
    pub toggle_vk: AtomicU32,
    /// Asosiy oyna yopilganda kuzatuvchi ip to'xtaydi.
    pub shutdown: AtomicBool,
}

impl HotkeyState {
    pub fn is_armed(&self) -> bool {
        self.armed.load(Ordering::Relaxed)
    }
}

#[derive(Debug)]
pub enum SnipEvent {
    /// Start/Stop tugmasi bosildi — yangi holat.
    Toggle(bool),
    /// Kesish oynasi ochildi.
    Opened,
    /// Foydalanuvchi bekor qildi yoki vaqt tugadi.
    Cancelled,
    /// JPEG baytlari tayyor.
    Captured(Vec<u8>),
}

fn key_down(vk: i32) -> bool {
    if vk <= 0 {
        return false;
    }
    // SAFETY: GetAsyncKeyState oddiy o'qish, hech qanday resurs egallamaydi.
    unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 }
}

fn tap(vk: u8, flags: KEYBD_EVENT_FLAGS) {
    // SAFETY: keybd_event faqat kirish oqimiga voqea qo'shadi.
    unsafe { keybd_event(vk, 0, flags, 0) };
}

/// Windows'ning o'z kesish oynasini ochadi (Win+Shift+S).
fn send_win_shift_s() {
    // Alt bosilib qolgan bo'lsa (masalan Alt+Tab dan keyin) kombinatsiya ishlamaydi.
    tap(VK_MENU, KEYEVENTF_KEYUP);
    tap(VK_LWIN, KEYBD_EVENT_FLAGS(0));
    tap(VK_SHIFT, KEYBD_EVENT_FLAGS(0));
    tap(VK_S, KEYBD_EVENT_FLAGS(0));
    tap(VK_S, KEYEVENTF_KEYUP);
    tap(VK_SHIFT, KEYEVENTF_KEYUP);
    tap(VK_LWIN, KEYEVENTF_KEYUP);
}

fn clipboard_sequence() -> u32 {
    // SAFETY: hisoblagichni o'qish, yon ta'siri yo'q.
    unsafe { GetClipboardSequenceNumber() }
}

fn encode_jpeg(width: u32, height: u32, rgba: Vec<u8>) -> Result<Vec<u8>, String> {
    let image = image::RgbaImage::from_raw(width, height, rgba)
        .ok_or_else(|| "Buferdagi rasm o'lchami mos kelmadi".to_string())?;

    let mut dynamic = image::DynamicImage::ImageRgba8(image);
    let longest = dynamic.width().max(dynamic.height());
    if longest > MAX_SIDE {
        let scale = MAX_SIDE as f32 / longest as f32;
        let width = ((dynamic.width() as f32 * scale).round() as u32).max(1);
        let height = ((dynamic.height() as f32 * scale).round() as u32).max(1);
        dynamic = dynamic.resize(width, height, image::imageops::FilterType::CatmullRom);
    }

    let rgb = dynamic.to_rgb8();
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|err| format!("JPEG kodlanmadi: {err}"))?;

    Ok(out)
}

fn read_clipboard_jpeg() -> Option<Vec<u8>> {
    let mut clipboard = arboard::Clipboard::new().ok()?;
    let image = clipboard.get_image().ok()?;
    let width = u32::try_from(image.width).ok()?;
    let height = u32::try_from(image.height).ok()?;
    match encode_jpeg(width, height, image.bytes.into_owned()) {
        Ok(bytes) => Some(bytes),
        Err(err) => {
            log::warn!("skrinshot kodlanmadi: {err}");
            None
        }
    }
}

struct Session {
    started: Instant,
    baseline_sequence: u32,
}

/// Hotkey kuzatuvchi ipini ishga tushiradi. `sink` har bir voqea uchun chaqiriladi.
pub fn spawn<F>(state: Arc<HotkeyState>, sink: F)
where
    F: Fn(SnipEvent) + Send + 'static,
{
    std::thread::spawn(move || {
        let mut snip_down = false;
        let mut toggle_down = false;
        let mut esc_down = false;
        let mut win_s_down = false;
        let mut session: Option<Session> = None;

        loop {
            std::thread::sleep(POLL_INTERVAL);

            if state.shutdown.load(Ordering::Relaxed) {
                break;
            }

            let snip_vk = state.snip_vk.load(Ordering::Relaxed) as i32;
            let toggle_vk = state.toggle_vk.load(Ordering::Relaxed) as i32;

            // Start/Stop — tarjimon o'chiq bo'lsa ham yoqish uchun ishlaydi.
            // Dastur yopilganda `shutdown` tepada tekshiriladi, shuning uchun
            // jarayon o'chganidan keyin skrinshot ochilmaydi.
            let toggle_pressed = key_down(toggle_vk);
            if toggle_pressed && !toggle_down {
                let next = !state.is_armed();
                state.armed.store(next, Ordering::Relaxed);
                if !next {
                    session = None;
                }
                sink(SnipEvent::Toggle(next));
            }
            toggle_down = toggle_pressed;

            let armed = state.is_armed();

            // Skrinshot tugmasi.
            let snip_pressed = key_down(snip_vk);
            if snip_pressed && !snip_down && armed && session.is_none() {
                session = Some(Session {
                    started: Instant::now(),
                    baseline_sequence: clipboard_sequence(),
                });
                sink(SnipEvent::Opened);
                // Kesish oynasi ochilishi uchun kichik pauza.
                std::thread::sleep(Duration::from_millis(180));
                send_win_shift_s();
            }
            snip_down = snip_pressed;

            // Foydalanuvchi Win+Shift+S ni o'zi bosgan bo'lsa ham natijani ushlaymiz.
            let win_s = (key_down(VK_LWIN as i32) || key_down(VK_RWIN))
                && key_down(VK_SHIFT as i32)
                && key_down(VK_S as i32);
            if win_s && !win_s_down && armed && session.is_none() {
                session = Some(Session {
                    started: Instant::now(),
                    baseline_sequence: clipboard_sequence(),
                });
                sink(SnipEvent::Opened);
            }
            win_s_down = win_s;

            let esc = key_down(VK_ESCAPE);
            if esc && !esc_down && session.is_some() {
                session = None;
                sink(SnipEvent::Cancelled);
            }
            esc_down = esc;

            // Faol sessiya: bufer o'zgarishini kutamiz.
            if let Some(active) = session.as_ref() {
                if active.started.elapsed() > SNIP_TIMEOUT {
                    session = None;
                    sink(SnipEvent::Cancelled);
                    continue;
                }

                if clipboard_sequence() != active.baseline_sequence {
                    // Kesish oynasi buferni yozib bo'lishi uchun ozgina kutamiz.
                    std::thread::sleep(Duration::from_millis(90));
                    if let Some(jpeg) = read_clipboard_jpeg() {
                        session = None;
                        sink(SnipEvent::Captured(jpeg));
                    } else {
                        // Rasm emas (masalan matn ko'chirildi) — yangi nuqtadan kuzatamiz.
                        let baseline = clipboard_sequence();
                        session = Some(Session {
                            started: active.started,
                            baseline_sequence: baseline,
                        });
                    }
                }
            }
        }
    });
}
