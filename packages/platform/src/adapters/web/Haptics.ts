import type { HapticsPort } from '../../ports/HapticsPort';

/**
 * Web haptics via `navigator.vibrate` when the platform offers it
 * (Android WebView, some mobile Chrome). iOS Safari has no vibrate
 * support, so every call there is a no-op — the contract allows that.
 */
export class WebHapticsPort implements HapticsPort {
  private canVibrate: boolean;

  constructor() {
    this.canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  light(): void {
    this.vibrate(10);
  }

  medium(): void {
    this.vibrate(20);
  }

  warning(): void {
    this.vibrate(40);
  }

  private vibrate(pattern: number): void {
    if (this.canVibrate) {
      const ok = navigator.vibrate(pattern);
      if (!ok) {
        // Some Android WebViews report vibrate unsupported at runtime.
        this.canVibrate = false;
      }
    }
  }
}
