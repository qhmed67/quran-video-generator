import type { FilePort } from '../../ports/FilePort';

/**
 * Web file port. Picking opens a programmatic file input (the app uses
 * the same `<input type="file">` flow today); saving triggers a browser
 * download via an anchor — the exact mechanism `src/App.tsx` uses to
 * ship exported videos. No `shareFile`: browsers have no share sheet.
 */
export class BrowserFilePort implements FilePort {
  async pickFile(options?: { accept?: string }): Promise<File | null> {
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.accept) input.accept = options.accept;
    // The File reference stays valid after the input is removed (it is an
    // object, not a live FileList lookup), so resolving it in the change
    // handler is safe.
    const file = await new Promise<File | null>((resolve) => {
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), {
        once: true,
      });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      document.body.append(input);
      input.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    input.remove();
    return file;
  }

  async saveFile(file: File, suggestedName: string): Promise<void> {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
