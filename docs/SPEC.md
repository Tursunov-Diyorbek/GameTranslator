# GameTranslator — spetsifikatsiya

O‘yindagi matnni skrinshot orqali o‘qib tarjima qiladigan va qisqa izoh beradigan Windows desktop ilovasi (Tauri).

## Maqsad

O‘yin paytida kerakli joyni belgilash → sun’iy intellekt matnni o‘qishi → tanlangan tilda tarjima + qisqa izoh o‘yin ustida chiqishi. Tarjima imkon qadar tez bo‘lishi kerak.

## Asosiy oqim

1. Birinchi ishga tushirishda foydalanuvchi o‘z Google Gemini kalitini kiritadi va tarjima tilini tanlaydi.
2. **Start** (yoki toggle tugmasi, standart `F8`) tarjimonni yoqadi. Bu tugma o‘yin fokusda bo‘lganda ham ishlaydi.
3. Faol paytda skrinshot tugmasi (standart `T`) bosilsa:
   - Rust `Win+Shift+S` ni yuboradi va Windows kesish oynasi ochiladi;
   - foydalanuvchi kerakli joyni belgilaydi;
   - buferga tushgan rasm avtomatik tarjimaga ketadi (qo‘shimcha tugma yo‘q).
4. Natija overlay oynasida (ekranning yuqori o‘ng burchagi) va asosiy oynada ko‘rinadi, tarixda saqlanadi.
5. Asosiy oynaga `Ctrl+V` bilan rasm qo‘yib ham tarjima qilish mumkin.

## Tezlik qoidalari

- JPEG, sifat ~0.75, eng katta tomoni 1280px.
- Bitta AI so‘rovi: OCR + tarjima + izoh.
- Gemini Flash, past temperatura, JSON javob.
- Ishlagan model marshruti keshlanadi — keyingi so‘rovlar birinchi urinishda o‘tadi.
- Oraliq server yo‘q: Rust bevosita Gemini bilan gaplashadi.

## Vazifalar taqsimoti

Global hotkey, ekrandan olish, Gemini so‘rovi, overlay va sozlamalar — hammasi Rust tomonda. Webview faqat interfeys.

| Fayl | Vazifasi |
| --- | --- |
| `src-tauri/src/lib.rs` | Holat, Tauri buyruqlari, overlay boshqaruvi |
| `src-tauri/src/snip.rs` | Win32 hotkey kuzatuvi va bufer orqali olish |
| `src-tauri/src/gemini.rs` | Gemini so‘rovi, model zaxirasi, javobni ajratish |
| `src-tauri/src/settings.rs` | `settings.json`, VK kodlarini hisoblash |
| `src-tauri/src/lang.rs` | Maqsad tillari ro‘yxati |

Hotkey `GetAsyncKeyState` bilan kuzatiladi — tugma ushlab olinmaydi, shuning uchun o‘yin uni ham ko‘radi.

## Sozlamalar

Rust `app_config_dir/settings.json` da saqlaydi (`%APPDATA%\uz.gametranslator.desktop\`):

- `apiKey` — foydalanuvchining Gemini kaliti
- `targetLang` — tarjima tili kodi (16 tildan biri)
- `uiLang` — interfeys tili (`en` yoki `uz`)
- `hotkey`, `toggleHotkey` — `KeyboardEvent.code` shaklida
- `onboarded` — birinchi ishga tushirish ekrani o‘tilganmi

Tarix (oxirgi 20 tarjima) webview `localStorage` da qoladi — u sof interfeysga xos.

## UI

- Interfeys tillari: inglizcha va o‘zbekcha, standarti tizim tilidan aniqlanadi.
- Qorong‘i, HUD uslubidagi interfeys.
- Kalit yo‘q bo‘lsa to‘liq onboarding ekrani ko‘rsatiladi.
- Overlay: faol belgisi, yuklanish, natija va xato holatlari; 20 sekunddan keyin o‘zi yopiladi.

## AI chiqishi

```json
{
  "original": ["ekrandagi asl matn"],
  "translation": ["tarjima"],
  "note": "bu matn nima haqida — 1–2 jumla"
}
```

Prompt inglizcha shablon, maqsad tili parametr sifatida qo‘yiladi. `note` ham maqsad tilida qaytadi. Matn bo‘lmasa ham JSON qaytadi.

## Xatolar

Rust ma’lum xatolarni kod sifatida qaytaradi (`MISSING_API_KEY`, `INVALID_API_KEY`, `QUOTA_EXCEEDED`, `NETWORK_ERROR`, `NO_IMAGE`, `EMPTY_RESPONSE`, `BAD_RESPONSE`, `TRANSLATE_FAILED`), interfeys ularni tarjima qiladi. Tanilmagan matn xom holda ko‘rsatiladi.

## Cheklovlar

- Faqat Windows 10/11 — `snip.rs` to‘liq Win32 API’ga tayanadi.
- Ba’zi to‘liq ekran o‘yinlari overlayni ko‘rsatmaydi; borderless yoki windowed rejim kerak.
- Skrinshotlar tarjima uchun Google’ga yuboriladi.
