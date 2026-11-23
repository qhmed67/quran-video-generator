/**
 * Zod validation for project documents — plan phase 3.4.
 *
 * Anything crossing a boundary (an imported file, a stored blob, an API
 * response) is validated at the edge and typed inside. The schemas here are
 * the edge: `parseProject` accepts unknown JSON and returns a `Project` or a
 * list of human-readable problems, never a half-typed object.
 */

import { z } from 'zod';

/** `#rgb` or `#rrggbb`, or any `rgb()/rgba()/hsl()/named` CSS colour. */
const cssColor = z.string().min(1).max(64);

const wordRef = z.object({
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1),
  word: z.number().int().min(0),
});

const styleTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('global') }),
  z.object({ kind: z.literal('state'), state: z.enum(['upcoming', 'active', 'spoken']) }),
  z.object({
    kind: z.literal('ayah'),
    surah: z.number().int().min(1).max(114),
    ayah: z.number().int().min(1),
  }),
  z.object({ kind: z.literal('wordRange'), from: wordRef, to: wordRef }),
  z.object({ kind: z.literal('word'), ref: wordRef }),
]);

const wordStyleOverrides = z
  .object({
    color: cssColor.optional(),
    opacity: z.number().min(0).max(1).optional(),
    fontScale: z.number().min(0.25).max(4).optional(),
    glow: z
      .object({ color: cssColor, radius: z.number().min(0).max(200) })
      .nullable()
      .optional(),
    shadow: z
      .object({ color: cssColor, blur: z.number().min(0).max(200) })
      .nullable()
      .optional(),
    highlight: z
      .object({ fill: cssColor, radius: z.number().min(0).max(100) })
      .nullable()
      .optional(),
    underline: z
      .object({ color: cssColor, thickness: z.number().min(0.5).max(20) })
      .nullable()
      .optional(),
    entrance: z
      .object({ kind: z.string().min(1).max(24), durationMs: z.number().min(0).max(5000) })
      .nullable()
      .optional(),
  })
  .strict();

const styleRule = z.object({
  id: z.string().min(1).max(120),
  target: styleTarget,
  props: wordStyleOverrides,
});

const annotation = z.object({
  id: z.string().min(1).max(120),
  anchor: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('ayah'),
      surah: z.number().int().min(1).max(114),
      ayah: z.number().int().min(1),
    }),
    z.object({ kind: z.literal('word'), ref: wordRef }),
  ]),
  placement: z.enum(['above', 'below', 'inline-after']),
  text: z.string().max(2000),
  lang: z.string().min(2).max(12),
  style: z
    .object({
      fontFamily: z.string().max(120).optional(),
      fontSize: z.number().min(6).max(200).optional(),
      color: cssColor.optional(),
      opacity: z.number().min(0).max(1).optional(),
      align: z.enum(['left', 'center', 'right']).optional(),
    })
    .strict(),
});

export const projectSchema = z.object({
  schemaVersion: z.number().int().min(1),
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  source: z.object({
    reciterId: z.number().int().min(1),
    surah: z.number().int().min(1).max(114),
    fromAyah: z.number().int().min(1),
    toAyah: z.number().int().min(1),
  }),
  format: z.enum(['9:16', '1:1']),
  background: z
    .object({
      preset: z.string().min(1).max(40),
      customImage: z.string().max(4_000_000).optional(),
      opacity: z.number().min(0).max(1).optional(),
    })
    .strict(),
  rules: z.array(styleRule).max(2000),
  annotations: z.array(annotation).max(2000),
});

export type ParsedProject = z.infer<typeof projectSchema>;

/** One validation problem, human-readable, for UI display. */
export interface ValidationIssue {
  path: string;
  message: string;
}

/** Result of parsing an untrusted document. */
export type ParseResult =
  { ok: true; project: ParsedProject } | { ok: false; issues: ValidationIssue[] };

/**
 * Validate an untrusted project document.
 *
 * Returns every problem, not just the first, so an import dialog can show the
 * user a complete list.
 */
export function parseProject(input: unknown): ParseResult {
  const result = projectSchema.safeParse(input);
  if (result.success) {
    return { ok: true, project: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
    })),
  };
}
