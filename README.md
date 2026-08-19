# GameTranslator

A small Windows desktop app that translates on-screen game text while you play. Press one key, mark the text with the Windows snipping overlay, and the translation appears in a floating window above the game.

## Requirements

- Windows 10 or 11 (the hotkey and capture layer uses Win32 APIs, so macOS and Linux are not supported yet)
- Your own Google Gemini API key — the free tier is enough for everyday play

## Install

1. Download the latest `.exe` installer from [Releases](https://github.com/Tursunov-Diyorbek/GameTranslator/releases).
2. Windows SmartScreen will warn about an unknown publisher because the installer is not code-signed yet. Choose **More info → Run anyway** if you trust this build.
3. On first launch the app asks for a Gemini API key. Get one for free at [Google AI Studio](https://aistudio.google.com/apikey) and paste it in. The key is saved on this computer — the next launch will not ask again.

The app updates itself: when a new release is published it offers to download and install it.

## How it works

1. Press **Start** (or the toggle key, `F8` by default) to arm the translator.
2. Go back to your game. Press the screenshot key (`T` by default) to open the snipping overlay.
3. Mark the text. The screenshot goes to Gemini and the translation appears in the top-right corner, along with a short note about what the text is in the game.

Some fullscreen games block overlays. If the translation window does not appear, switch the game to borderless or windowed mode.

You can also paste an image into the main window with `Ctrl+V` to translate it.

## Privacy

- Every screenshot you capture is sent to Google Gemini to be translated. Nothing else leaves your computer.
- Your API key and settings are stored locally in `%APPDATA%\GameTranslator\settings.json`. They are never sent anywhere except to Google, as part of the translation request.
- Translation history is kept in the app's local storage and can be cleared from the main window.

## Development

```bash
npm install
npm run tauri:dev     # run the app with hot reload
npm run tauri:build   # build the installer into src-tauri/target/release/bundle/nsis
```

Because the app ships updater artifacts, a release build needs the updater signing key:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\gametranslator.key"
npm run tauri:build
```

`tauri:build` goes through `scripts/tauri-build.mjs` rather than calling the CLI directly. The CLI prompts for the signing key password when `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is unset, and on Windows a shell cannot pass an empty value (PowerShell deletes the variable instead of emptying it), so an unattended build would hang forever. The wrapper passes the empty password through Node, which can.

The frontend is React and Vite (`src/`). Everything else — global hotkeys, screen capture, the Gemini request, the overlay window and settings persistence — lives in the Rust backend (`src-tauri/src/`):

| File | Purpose |
| --- | --- |
| `lib.rs` | App state, Tauri commands, overlay control |
| `snip.rs` | Win32 hotkey polling and clipboard capture |
| `gemini.rs` | Gemini request, model fallback, response parsing |
| `settings.rs` | `settings.json` in the app config directory |
| `lang.rs` | Supported target languages |

Interface strings live in `src/i18n/`. `en.ts` is the source dictionary — adding a key there makes TypeScript flag any language that is missing its translation.

## Releasing

Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds the Windows installer, signs the updater artifacts and publishes `latest.json` alongside the release.

Two repository secrets are required:

- `TAURI_SIGNING_PRIVATE_KEY` — contents of the updater private key generated with `npm run tauri signer generate`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password; set an empty secret if the key has none

Giving the key a password is worth doing: it is a second secret an attacker would need even if the private key leaks, and it removes the empty-value handling described above.

This key is unrelated to Windows code signing. If it is lost, already-installed copies of the app can never be updated again, so keep a backup outside this repository.
