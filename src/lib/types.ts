import type { Result, ResultAsync } from 'neverthrow'

import type { LocalSkillsError } from './errors.js'

/** Parsed CLI specifier: plugin@marketplace[:version]:skill */
export interface ParsedSpecifier {
  readonly plugin: string
  readonly marketplace: MarketplaceRef
  readonly skill: string | undefined // '*' for all skills, undefined for partial specifiers
  readonly ref: string | undefined // git ref (tag, branch), undefined = default branch
}

/** Either a GitHub shorthand or a full git URL */
export type MarketplaceRef =
  | { readonly type: 'github'; readonly owner: string; readonly repo: string }
  | { readonly type: 'url'; readonly url: string }

/** A single entry in local-skills.json */
export interface ManifestSkillEntry {
  readonly source: string // e.g. "superpowers@anthropics/claude-code"
  readonly ref: string // resolved git ref (branch or tag)
  readonly sha: string // commit SHA at time of install
}

/** The full manifest: .claude/local-skills.json */
export interface Manifest {
  readonly skills: Record<string, ManifestSkillEntry>
}

/** Plugin source in marketplace.json — string (relative) or object */
export type PluginSource =
  | string
  | { readonly source: 'github'; readonly repo: string }
  | { readonly source: 'url'; readonly url: string }

/** A plugin entry in marketplace.json */
export interface MarketplacePlugin {
  readonly name: string
  readonly source: PluginSource
}

/** Top-level marketplace.json structure */
export interface MarketplaceConfig {
  readonly plugins: readonly MarketplacePlugin[]
  readonly metadata?: {
    readonly pluginRoot?: string
  }
}

/** Result of an update operation */
export type UpdateResult =
  | { status: 'updated'; oldSha: string; newSha: string }
  | { status: 'already-up-to-date'; sha: string }
  | { status: 'skipped-pinned'; sha: string }

/** A single entry in local-skills-state.json */
export interface StateFileEntry {
  readonly contentHash: string
}

/** The full state file: .claude/local-skills-state.json */
export interface StateFile {
  readonly skills: Record<string, StateFileEntry>
}

/** All I/O operations injected as dependencies */
export interface Deps {
  readonly exec: (
    cmd: string,
    args: readonly string[],
    opts?: { cwd?: string },
  ) => ResultAsync<string, LocalSkillsError>
  readonly readFile: (path: string) => ResultAsync<string, LocalSkillsError>
  readonly writeFile: (
    path: string,
    content: string,
  ) => ResultAsync<void, LocalSkillsError>
  readonly mkdir: (path: string) => ResultAsync<void, LocalSkillsError>
  readonly rm: (path: string) => ResultAsync<void, LocalSkillsError>
  readonly cp: (
    src: string,
    dest: string,
  ) => ResultAsync<void, LocalSkillsError>
  readonly readdir: (
    path: string,
  ) => ResultAsync<readonly string[], LocalSkillsError>
  readonly exists: (path: string) => ResultAsync<boolean, LocalSkillsError>
  readonly tmpdir: () => Result<string, LocalSkillsError>
}
