import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import * as path from 'node:path'

import type { LocalSkillsError } from '../lib/errors.js'
import { localSkillsError } from '../lib/errors.js'
import { parseFrontMatter } from '../lib/front-matter.js'
import { cloneRepo } from '../lib/git.js'
import { readManifest } from '../lib/manifest.js'
import {
  findPlugin,
  readMarketplace,
  resolvePluginDir,
} from '../lib/marketplace.js'
import type { Deps } from '../lib/types.js'

export interface InfoResult {
  readonly name: string
  readonly source?: string
  readonly ref?: string
  readonly sha?: string
  readonly frontMatter: Record<string, unknown>
}

export type InfoQuery =
  | { readonly type: 'installed'; readonly skillName: string }
  | {
      readonly type: 'remote'
      readonly pluginName: string
      readonly marketplaceUrl: string
      readonly skillName: string
      readonly ref: string | undefined
    }

export function info(
  deps: Deps,
  projectDir: string,
  query: InfoQuery,
): ResultAsync<InfoResult, LocalSkillsError> {
  switch (query.type) {
    case 'installed':
      return infoInstalled(deps, projectDir, query.skillName)
    case 'remote':
      return infoRemote(
        deps,
        query.pluginName,
        query.marketplaceUrl,
        query.skillName,
        query.ref,
      )
  }
}

function infoInstalled(
  deps: Deps,
  projectDir: string,
  skillName: string,
): ResultAsync<InfoResult, LocalSkillsError> {
  const manifestPath = path.join(projectDir, '.claude', 'local-skills.json')

  return readManifest(deps, manifestPath).andThen((manifest) => {
    const entry = manifest.skills[skillName]
    if (!entry) {
      return errAsync(
        localSkillsError(
          'SKILL_NOT_INSTALLED',
          `Skill "${skillName}" is not installed`,
        ),
      )
    }

    const skillMdPath = path.join(
      projectDir,
      '.claude',
      'skills',
      skillName,
      'SKILL.md',
    )

    return deps
      .readFile(skillMdPath)
      .map((content) => {
        const { data } = parseFrontMatter(content)
        return {
          name: skillName,
          source: entry.source,
          ref: entry.ref,
          sha: entry.sha,
          frontMatter: data,
        }
      })
      .orElse(() =>
        // SKILL.md doesn't exist — return info without front matter
        okAsync({
          name: skillName,
          source: entry.source,
          ref: entry.ref,
          sha: entry.sha,
          frontMatter: {},
        }),
      )
  })
}

function infoRemote(
  deps: Deps,
  pluginName: string,
  marketplaceUrl: string,
  skillName: string,
  ref: string | undefined,
): ResultAsync<InfoResult, LocalSkillsError> {
  const tmpResult = deps.tmpdir()

  if (tmpResult.isErr()) {
    return errAsync(tmpResult.error)
  }

  const tmpBase = tmpResult.value
  const cloneDir = path.join(tmpBase, `local-skills-info-${Date.now()}`)

  return cloneRepo(deps, marketplaceUrl, cloneDir, ref)
    .andThen(() => readMarketplace(deps, cloneDir))
    .andThen((marketplace) => {
      const pluginResult = findPlugin(marketplace, pluginName)
      if (pluginResult.isErr()) {
        return errAsync(pluginResult.error)
      }
      const plugin = pluginResult.value

      const dirResult = resolvePluginDir(
        plugin,
        cloneDir,
        marketplace.metadata?.pluginRoot,
      )
      const resolvedDir = dirResult._unsafeUnwrap()

      const skillMdPath = path.join(
        resolvedDir,
        'skills',
        skillName,
        'SKILL.md',
      )

      return deps
        .readFile(skillMdPath)
        .mapErr(() =>
          localSkillsError(
            'SKILL_NOT_FOUND',
            `Skill "${skillName}" not found in plugin "${pluginName}"`,
          ),
        )
        .map((content) => {
          const { data } = parseFrontMatter(content)
          const result: InfoResult = {
            name: skillName,
            frontMatter: data,
          }
          return result
        })
    })
    .andThen((result) => deps.rm(cloneDir).map(() => result))
}
