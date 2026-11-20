/**
 * Undo/redo history — plan phase 4.6 / section 3.4.
 *
 * A pure snapshot history: every commit stores the state *before* the edit,
 * so undo/redo are O(1) swaps of `present` between the `past` and `future`
 * stacks. No immer dependency — snapshots are plain references, so this stays
 * inside `core`'s "pure TypeScript, no platform globals" contract.
 *
 * Rapid edits that share a `coalesceKey` (slider drags, colour scrubbing)
 * collapse into a single undo step while they keep arriving inside the
 * coalescing window — a drag is one step, not forty.
 *
 * The past is capped at `limit` steps; the oldest entry falls off.
 */

/** One undo step: the state before an edit, plus a label for the UI. */
export interface HistoryEntry<T> {
  state: T;
  /** Human-readable description shown next to the undo/redo buttons. */
  label: string;
}

/** Metadata for a commit: label, coalescing key, timestamp. */
export interface CommitMeta {
  label: string;
  /** Edits sharing this key coalesce into one step while they keep coming. */
  coalesceKey?: string;
  /** Commit timestamp in ms; used for the coalescing window. */
  at?: number;
}

export interface History<T> {
  /** States before each committed edit, oldest first. */
  past: ReadonlyArray<HistoryEntry<T>>;
  /** Current state. */
  present: T;
  /** States to re-apply on redo, next redo first. */
  future: ReadonlyArray<HistoryEntry<T>>;
  /** Maximum number of undo steps kept in `past`. */
  limit: number;
  /** Metadata of the most recent commit, for coalescing. */
  lastCommit: CommitMeta | null;
}

/** Default number of undo steps kept. */
export const DEFAULT_HISTORY_LIMIT = 100;

/** Window (ms) in which same-key commits coalesce into one step. */
export const COALESCE_WINDOW_MS = 600;

/** Create a fresh history starting at `present`. */
export function createHistory<T>(present: T, limit: number = DEFAULT_HISTORY_LIMIT): History<T> {
  return { past: [], present, future: [], limit, lastCommit: null };
}

/**
 * Commit a new state.
 *
 * Pushes the current `present` onto `past`, sets `next`, and clears `future`
 * (a new edit invalidates the redo stack). If `meta.coalesceKey` matches the
 * previous commit's key and the timestamps fall inside `COALESCE_WINDOW_MS`,
 * the previous step is reused instead of pushing a new one.
 */
export function commit<T>(history: History<T>, next: T, meta: CommitMeta): History<T> {
  const last = history.lastCommit;
  const coalescing =
    meta.coalesceKey !== undefined &&
    last !== null &&
    last.coalesceKey === meta.coalesceKey &&
    (meta.at === undefined || last.at === undefined || meta.at - last.at <= COALESCE_WINDOW_MS);

  const past = coalescing
    ? history.past
    : (
        [...history.past, { state: history.present, label: meta.label }] as ReadonlyArray<
          HistoryEntry<T>
        >
      ).slice(-history.limit);

  return {
    ...history,
    past,
    present: next,
    future: [],
    lastCommit: { ...meta },
  };
}

/** Step back one edit. Returns the same history when there is nothing to undo. */
export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;

  const entry = history.past[history.past.length - 1];
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: entry.state,
    future: [{ state: history.present, label: entry.label }, ...history.future],
    // Break coalescing: an edit after an undo starts a fresh step.
    lastCommit: null,
  };
}

/** Re-apply the next undone edit. Returns the same history when nothing is redone. */
export function redo<T>(history: History<T>): History<T> {
  if (history.future.length === 0) return history;

  const entry = history.future[0];
  const past = (
    [...history.past, { state: history.present, label: entry.label }] as ReadonlyArray<
      HistoryEntry<T>
    >
  ).slice(-history.limit);

  return {
    ...history,
    past,
    present: entry.state,
    future: history.future.slice(1),
    lastCommit: null,
  };
}

/** Whether an undo step is available. */
export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

/** Whether a redo step is available. */
export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

/** Label of the edit that undo would revert, or null. */
export function undoLabel<T>(history: History<T>): string | null {
  return history.past.length > 0 ? history.past[history.past.length - 1].label : null;
}

/** Label of the edit that redo would re-apply, or null. */
export function redoLabel<T>(history: History<T>): string | null {
  return history.future.length > 0 ? history.future[0].label : null;
}

/** Fresh history at `present`, discarding all steps (e.g. project switch). */
export function resetHistory<T>(present: T, limit: number = DEFAULT_HISTORY_LIMIT): History<T> {
  return createHistory(present, limit);
}
