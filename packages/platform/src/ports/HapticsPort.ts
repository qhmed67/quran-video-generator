/**
 * HapticsPort — optional tactile feedback.
 *
 * The app may hold `null` here and skip haptics entirely; callers must
 * tolerate that. On native this drives the platform vibrator; on web an
 * adapter may back it with `navigator.vibrate` or stay a no-op (iOS Safari
 * has no vibrate support to begin with).
 */
export interface HapticsPort {
  /** A light tick: selection, toggle, hover-worthy tap. */
  light(): void;

  /** A firmer impact: confirming an action, dropping into place. */
  medium(): void;

  /** A warning pulse: something failed or was rejected. */
  warning(): void;
}
