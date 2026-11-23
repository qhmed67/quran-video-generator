/**
 * Public API of @qvg/platform — port interfaces and their value types only.
 *
 * Adapters are NOT exported here: `apps/*` wires them explicitly from
 * `@qvg/platform/web` (or `@qvg/platform/native` later), so packages can
 * depend on the contracts without pulling in a platform implementation.
 * Named exports only.
 */

export { SystemClock, type Clock } from './ports/Clock';
export type { AudioPlayer, AudioPort } from './ports/AudioPort';
export {
  ExportError,
  ExportErrorCode,
  type ExportCapability,
  type ExportEngine,
  type ExportEngineId,
  type ExportJob,
  type ExportJobAudio,
  type ExportProgress,
  type ExportResult,
} from './ports/ExportEngine';
export type { FilePort } from './ports/FilePort';
export type { FontLoader } from './ports/FontLoader';
export type { HapticsPort } from './ports/HapticsPort';
export { HttpError, type HttpPort } from './ports/HttpPort';
export type { StoragePort } from './ports/StoragePort';
export {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_PREFIX,
  PROJECT_EXTENSION,
  createAutosave,
  deleteAutosave,
  deserializeProject,
  exportProjectFile,
  importProjectFile,
  listAutosaved,
  loadAutosaved,
  projectFileName,
  projectFromSettings,
  serializeProject,
  touchProject,
} from './projectStore';
export type { PersistenceStatus } from './projectStore';
