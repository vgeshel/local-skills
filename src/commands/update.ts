import { errAsync, type ResultAsync } from 'neverthrow'
import * as path from 'node:path'

import { localSkillsError, type LocalSkillsError } from '../lib/errors.js'
import { cloneRepo, getHeadSha } from '../lib/git.js'
import { readManifest, writeManifest } from '../lib/manifest.js'
import {
  findPlugin,
  readMarketplace,
  resolvePluginDir,
} from '../lib/marketplace.js'
import type { Deps } from '../lib/types.js'

export function update(
  deps: Deps,
  projectDir: string,
  skillName: string,
): ResultAsync<void, LocalSkillsError> {
  const claudeDir = path.join(projectDir, '.claude')
  const manifestPath = path.join(claudeDir, 'local-skills.json')

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

    // Determine the clone URL from the marketplace part
    let cloneUrl: string
    if (marketplacePart.includes('://')) {
      // Full URL source
      cloneUrl = marketplacePart
    } else {
      // GitHub shorthand: "owner/repo"
      cloneUrl = `https://github.com/${marketplacePart}.git`
    }

    const tmpResult = deps.tmpdir()
    if (tmpResult.isErr()) {
      return errAsync(tmpResult.error)
    }

    const tmpBase = tmpResult.value
    const cloneDir = path.join(tmpBase, `local-skills-update-${Date.now()}`)

    const ref = entry.ref === 'HEAD' ? undefined : entry.ref

    return cloneRepo(deps, cloneUrl, cloneDir, ref)
      .andThen(() => getHeadSha(deps, cloneDir))
      .andThen((sha) =>
        readMarketplace(deps, cloneDir).andThen((marketplace) => {
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

          return deps
            .rm(skillDestDir)
            .andThen(() => deps.cp(skillSrcDir, skillDestDir))
            .andThen(() => {
              const updatedManifest = {
                skills: {
                  ...manifest.skills,
                  [skillName]: {
                    source: entry.source,
                    ref: entry.ref,
                    sha,
                  },
                },
              }
              return writeManifest(deps, manifestPath, updatedManifest)
            })
        }),
      )
      .andThen(() => deps.rm(cloneDir))
  })
}
