/**
 * Clock port — abstraction over wall-clock time.
 *
 * `core` may ask the clock for the current time instead of calling
 * `Date.now()` itself, which keeps time-testable (a fake clock in unit
 * tests) and makes the port the single place where "now" is defined.
 */
export interface Clock {
  /** Current wall-clock time in seconds (fractional) since the Unix epoch. */
  now(): number;
}

/**
 * System clock backed by `Date.now()`. This is plain ECMAScript, not a
 * platform API — it behaves identically in a browser, a WebView and a
 * node environment — so it ships with the port instead of with an adapter.
 */
export class SystemClock implements Clock {
  now(): number {
    return Date.now() / 1000;
  }
}
