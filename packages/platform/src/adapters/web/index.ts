/**
 * Public web adapters of @qvg/platform. Import explicitly from
 * `@qvg/platform/web` (never through the package root) — that keeps the
 * boundary lint-enforceable: only apps wire adapters to ports.
 * Named exports only.
 */

export { BrowserAudioPort } from './Audio';
export { BrowserFilePort } from './File';
export { BrowserFontLoader } from './Fonts';
export { BrowserHttpPort } from './Http';
export { WebHapticsPort } from './Haptics';
export { LocalStoragePort } from './Storage';
