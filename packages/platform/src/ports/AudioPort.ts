/**
 * AudioPort — recitation playback.
 *
 * The app plays one recitation MP3 and shows a clip of it (the selected
 * ayah range). A prepared {@link AudioPlayer} sits at the clip's start
 * before play and — when an end was given — stops itself at the clip's
 * end (dispatching "ended"). Times on the player are offsets in seconds
 * from the *clip* start, not the file start, which keeps callers away
 * from the file's absolute timestamps. The one exception is
 * `startOffsetSeconds`, which positions the clip inside the file and is
 * therefore file-absolute.
 */
export interface AudioPort {
  /**
   * Prepare a clip: load `url` (no playback yet) and position it at
   * `startOffsetSeconds` — the file-absolute offset where the clip begins.
   * When `endSeconds` is given (clip-relative: seconds from the clip start),
   * stop with "ended" when playback reaches it. Resolves with the
   * positioned, not yet playing, player.
   * @throws when the audio cannot be loaded.
   */
  prepareClip(url: string, startOffsetSeconds: number, endSeconds?: number): Promise<AudioPlayer>;
}

/**
 * A prepared, positioned audio clip.
 */
export interface AudioPlayer {
  /** Start (or resume) playback. */
  play(): Promise<void>;

  /** Pause; the position is kept. */
  pause(): void;

  /** Stop and rewind to the clip start. */
  stop(): void;

  /** Current position in seconds from the clip start, clamped to >= 0. */
  timeSeconds(): number;

  /** Move to a position in seconds from the clip start (clamped into the clip). */
  seek(offsetSeconds: number): void;

  /**
   * Subscribe to the clip reaching its end — real or the synthetic end
   * fired when the end offset is reached. Returns an unsubscribe function.
   */
  onEnded(listener: () => void): () => void;

  /** Release the underlying audio resources. Idempotent. */
  dispose(): void;
}
