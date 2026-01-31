import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import * as path from 'node:path'

import { computeContentHash } from '../lib/content-hash.js'
import { localSkillsError, type LocalSkillsError } from '../lib/errors.js'
import { cloneRepo, getHeadSha, isShaRef } from '../lib/git.js'
import { readManifest, writeManifest } from '../lib/manifest.js'
import {
  findPlugin,
  readMarketplace,
  resolvePluginDir,
} from '../lib/marketplace.js'
import { readState, writeState } from '../lib/state.js'
import type { Deps, UpdateResult } from '../lib/types.js'

export function update(
  deps: Deps,
  projectDir: string,
  skillName: string,
  options?: { force?: boolean },
): ResultAsync<UpdateResult, LocalSkillsError> {
  const claudeDir = path.join(projectDir, '.claude')
  const manifestPath = path.join(claudeDir, 'local-skills.json')
  const statePath = path.join(claudeDir, 'local-skills-state.json')

  return readManifest(deps, manifestPath).andThen((manifest) => {
    if (!(skillName in manifest.skills)) {
      return errAsync(
        localSkillsError(
          'SKILL_NOT_INSTALLED',
          `Skill "${skillName}" is not installed`,
        ),
      )
    }

    const entry = manifest.skills[skillName]

    // Pinned SHA — skip update
    if (isShaRef(entry.ref)) {
      return okAsync({
        status: 'skipped-pinned',
        sha: entry.sha,
      } satisfies UpdateResult)
    }

    const atIdx = entry.source.indexOf('@')
    if (atIdx === -1) {
      return errAsync(
        localSkillsError(
          'MARKETPLACE_PARSE_ERROR',
          `Invalid source in manifest: "${entry.source}"`,
        ),
      )
    }

    const pluginName = entry.source.slice(0, atIdx)
    const marketplacePart = entry.source.slice(atIdx + 1)

    let cloneUrl: string
    if (marketplacePart.includes('://')) {
      cloneUrl = marketplacePart
    } else {
      cloneUrl = `https://github.com/${marketplacePart}.git`
    }

    const tmpResult = deps.tmpdir()
    if (tmpResult.isErr()) {
      return errAsync(tmpResult.error)
    }

    const tmpBase = tmpResult.value
    const cloneDir = path.join(tmpBase, `local-skills-update-${Date.now()}`)
    const ref = entry.ref === 'HEAD' ? undefined : entry.ref

    // Local modification check
    const modCheckResult: ResultAsync<void, LocalSkillsError> = options?.force
      ? okAsync(undefined)
      : readState(deps, statePath).andThen((state) => {
          const stateEntry = state.skills[skillName]
          if (!stateEntry) {
            // No state entry — skip modification check (legacy or missing)
            return okAsync(undefined)
          }
          const skillDestDir = path.join(claudeDir, 'skills', skillName)
          return computeContentHash(deps, skillDestDir).andThen(
            (currentHash) => {
              if (currentHash !== stateEntry.contentHash) {
                return errAsync(
                  localSkillsError(
                    'SKILL_MODIFIED',
                    `Skill "${skillName}" has been locally modified. Use --force to overwrite.`,
                  ),
                )
              }
              return okAsync(undefined)
            },
          )
        })

    return modCheckResult
      .andThen(() => cloneRepo(deps, cloneUrl, cloneDir, ref))
      .andThen(() => getHeadSha(deps, cloneDir))
      .andThen((newSha) => {
        // Already up to date
        if (newSha === entry.sha) {
          return deps
            .rm(cloneDir)
            .map(
              () =>
                ({
                  status: 'already-up-to-date',
                  sha: newSha,
                }) satisfies UpdateResult,
            )
        }

        return readMarketplace(deps, cloneDir).andThen((marketplace) => {
          const pluginResult = findPlugin(marketplace, pluginName)
          if (pluginResult.isErr()) {
            return errAsync(pluginResult.error)
          }
          const plugin = pluginResult.value
          const pluginDirResult = resolvePluginDir(
            plugin,
            cloneDir,
            marketplace.metadata?.pluginRoot,
          )
          const pluginDir = pluginDirResult._unsafeUnwrap()

          const skillSrcDir = path.join(pluginDir, 'skills', skillName)
          const skillDestDir = path.join(claudeDir, 'skills', skillName)
          const oldSha = entry.sha

          return deps
            .rm(skillDestDir)
            .andThen(() => deps.cp(skillSrcDir, skillDestDir))
            .andThen(() => computeContentHash(deps, skillDestDir))
            .andThen((contentHash) =>
              readState(deps, statePath).andThen((state) =>
                writeState(deps, statePath, {
                  skills: {
                    ...state.skills,
                    [skillName]: { contentHash },
                  },
                }),
              ),
            )
            .andThen(() => {
              const updatedManifest = {
                skills: {
                  ...manifest.skills,
                  [skillName]: {
                    source: entry.source,
                    ref: entry.ref,
                    sha: newSha,
                  },
                },
              }
              return writeManifest(deps, manifestPath, updatedManifest)
            })
            .andThen(() => deps.rm(cloneDir))
            .map(
              () =>
                ({ status: 'updated', oldSha, newSha }) satisfies UpdateResult,
            )
        })
      })
  })
}
