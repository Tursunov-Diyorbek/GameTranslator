/**
 * Manba lug'at. Boshqa tillar shu shaklga bo'ysunadi (`Dictionary` tipi shundan olinadi),
 * shuning uchun yangi kalit qo'shilsa tarjimasi yozilmagani kompilyatsiyada ko'rinadi.
 */
export const en = {
  appTagline: 'Game text, in your language',
  settings: 'Settings',
  save: 'Save',
  cancel: 'Cancel',
  close: 'Close',

  statusOn: 'Active',
  statusOff: 'Inactive',
  start: 'Start',
  stop: 'Stop',
  startHint: 'Turn the translator on',
  stopHint: 'Turn the translator off',
  toggleKey: 'On / off',
  snipKey: 'Screenshot',
  fullscreenHint:
    'Press Start and go back to your game — the translation appears on top of it. Some fullscreen games need borderless or windowed mode.',

  keyMissing: 'No Gemini API key. Add one in Settings, otherwise translation will not work.',
  busy: 'Reading the text and translating…',

  emptyTitle: 'Translations appear over the game',
  emptyBody:
    'Press {toggle} or Start, then go back to your game. Mark an area with {snip} — the translation opens in the corner.',

  historyTitle: 'History',
  historyClear: 'Clear',
  historyNoText: 'No text',

  screenshotAlt: 'Captured screenshot',
  noOriginal: 'No source text found',
  noTranslation: 'No translation',
  note: 'Note',

  overlayActive: 'GameTranslator is active',
  overlayTranslation: 'Translation',
  overlayError: 'Error',
  overlayLoading: 'Translating…',
  overlayNoText: 'No text found',

  toggleKeyLabel: 'Start / Stop key',
  toggleKeyHint: 'This key turns the translator on and off. It works inside games too.',
  snipKeyLabel: 'Screenshot key',
  snipKeyHint: 'While active, this opens the snipping overlay like Win+Shift+S.',
  pressKey: 'Press a key…',
  keyTakenByToggle: 'That key is taken by Start/Stop. Pick another one.',
  keyTakenBySnip: 'That key is taken by the screenshot. Pick another one.',
  apiKeyLabel: 'Gemini API key',
  apiKeyHint: 'The key is stored only on this computer.',
  getApiKey: 'Get a free key',
  targetLangLabel: 'Translate into',
  uiLangLabel: 'App language',

  onboardTitle: 'Welcome to GameTranslator',
  onboardBody:
    'GameTranslator reads the text on your screen and translates it while you play. It uses your own Google Gemini key — the free tier is enough for everyday play.',
  onboardStep1: 'Open Google AI Studio and sign in with a Google account.',
  onboardStep2: 'Create an API key and copy it.',
  onboardStep3: 'Paste the key below and choose your language.',
  onboardOpenStudio: 'Open Google AI Studio',
  onboardContinue: 'Continue',
  onboardKeyRequired: 'Paste your API key to continue.',
  privacyNote:
    'Each screenshot you take is sent to Google Gemini to be translated. Nothing else leaves your computer, and your key stays on this device.',

  updateAvailable: 'Version {version} is available.',
  updateInstall: 'Update',
  updateDownloading: 'Downloading the update…',
  updateRestart: 'Update installed. Restarting…',
  updateFailed: 'The update could not be installed.',

  errMissingApiKey: 'No Gemini API key. Add one in Settings.',
  errInvalidApiKey: 'Google rejected this key. Create a new one in Google AI Studio.',
  errQuota: 'This key has run out of free quota. Try again later.',
  errNetwork: 'Could not reach Google. Check your internet connection.',
  errNoImage: 'No screenshot was found.',
  errEmptyResponse: 'The model replied with nothing. Try again.',
  errBadResponse: 'The model reply could not be read. Try again.',
  errTranslateFailed: 'Translation failed.',
}
