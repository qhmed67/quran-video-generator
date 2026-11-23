/**
 * Project migrations — plan phase 3.4.
 *
 * A stored or imported project carries a `schemaVersion`. Migrating runs each
 * step from that version to the current one, validating the result at the end.
 * Every migration is a pure function from an unknown document to the next
 * version, and fixtures in `tests/fixtures/migrations/` pin each step so a
 * change to an old shape cannot silently rewrite users' projects.
 */

import type { Project } from './project';
import { parseProject } from './validate';
import type { ValidationIssue } from './validate';

/** The schema version this build reads and writes. */
export const CURRENT_SCHEMA_VERSION = 1;

export type MigrationResult =
  | { ok: true; project: Project; issues?: undefined; applied: number[] }
  | { ok: false; project?: undefined; issues: ValidationIssue[]; applied: number[] };

type MigrationStep = {
  from: number;
  to: number;
  migrate: (doc: Record<string, unknown>) => Record<string, unknown>;
};

/** Ordered list of known migrations, oldest first. */
const steps: MigrationStep[] = [
  // v0 (unversioned early drafts) -> v1: stamp the version, nothing else moved.
  {
    from: 0,
    to: 1,
    migrate: (doc) => ({ ...doc, schemaVersion: 1 }),
  },
];

/** Clamp an unknown version stamp to a number we can reason about. */
function versionOf(doc: Record<string, unknown>): number {
  const v = doc.schemaVersion;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
  // A missing version means an unversioned draft: the oldest shape.
  return 0;
}

/**
 * Bring an untrusted document up to the current schema.
 *
 * Unknown *newer* versions are refused rather than guessed at: the document
 * was written by a build that knows something this one does not, and dropping
 * fields would corrupt it. The user is told to update.
 */
export function migrateProject(input: unknown): MigrationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return {
      ok: false,
      issues: [{ path: '(root)', message: 'Not a project document' }],
      applied: [],
    };
  }
  const doc = input as Record<string, unknown>;
  const from = versionOf(doc);

  if (from > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        {
          path: 'schemaVersion',
          message: `Saved with schema version ${from}, but this build understands up to ${CURRENT_SCHEMA_VERSION}. Update the app to open this project.`,
        },
      ],
      applied: [],
    };
  }

  let current = doc;
  const applied: number[] = [];
  for (const step of steps) {
    if (step.from < from || step.to > CURRENT_SCHEMA_VERSION) continue;
    if (step.from > from) continue;
    try {
      current = step.migrate(current);
      applied.push(step.to);
    } catch {
      return {
        ok: false,
        issues: [{ path: 'schemaVersion', message: `Migration from v${step.from} failed` }],
        applied,
      };
    }
  }

  const parsed = parseProject(current);
  if (!parsed.ok) {
    return { ok: false, issues: parsed.issues, applied };
  }
  return { ok: true, project: parsed.project as Project, applied };
}
