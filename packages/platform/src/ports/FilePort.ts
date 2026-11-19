/**
 * FilePort — user-file operations: picking and saving files.
 *
 * Web: a programmatic file input for picking, an anchor download for
 * saving — exactly what the app does today. Native: the platform
 * document-picker and file-system APIs; `shareFile` uses the share sheet.
 */
export interface FilePort {
  /**
   * Open the file picker with an optional MIME accept filter. Resolves to
   * the chosen file, or `null` when the user cancels.
   */
  pickFile(options?: { accept?: string }): Promise<File | null>;

  /**
   * Persist a file under a suggested name. The user may change the
   * destination; rejects when the user cancels.
   */
  saveFile(file: File, suggestedName: string): Promise<void>;

  /**
   * Hand the file to the OS share sheet (native only — browsers have no
   * share sheet, so web adapters may leave this `undefined`).
   */
  shareFile?(file: File, suggestedName: string): Promise<void>;
}
