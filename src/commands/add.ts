import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import * as path from 'node:path'

import { localSkillsError, type LocalSkillsError } from '../lib/errors.js'
import { cloneRepo, getHeadSha } from '../lib/git.js'
import {
  addSkillToManifest,
  readManifest,
  writeManifest,
} from '../lib/manifest.js'
import {
  findPlugin,
  listSkills,
  readMarketplace,
  resolvePluginDir,
} from '../lib/marketplace.js'
import type { Deps, ParsedSpecifier } from '../lib/types.js'

export function marketplaceUrl(spec: ParsedSpecifier): string {
  if (spec.marketplace.type === 'github') {
    return `https://github.com/${spec.marketplace.owner}/${spec.marketplace.repo}.git`
  }
  return spec.marketplace.url
}

export function sourceLabel(spec: ParsedSpecifier): string {
  if (spec.marketplace.type === 'github') {
    return `${spec.plugin}@${spec.marketplace.owner}/${spec.marketplace.repo}`
  }
  return `${spec.plugin}@${spec.marketplace.url}`
}

export function add(
  deps: Deps,
  projectDir: string,
  spec: ParsedSpecifier,
): ResultAsync<void, LocalSkillsError> {
  const claudeDir = path.join(projectDir, '.claude')
  const manifestPath = path.join(claudeDir, 'local-skills.json')
  const url = marketplaceUrl(spec)
  const tmpResult = deps.tmpdir()

  if (tmpResult.isErr()) {
    return errAsync(tmpResult.error)
  }

  const tmpBase = tmpResult.value
  const cloneDir = path.join(tmpBase, `local-skills-clone-${Date.now()}`)

  return cloneRepo(deps, url, cloneDir, spec.ref ?? undefined)
    .andThen(() => getHeadSha(deps, cloneDir))
    .andThen((sha) =>
      readMarketplace(deps, cloneDir).andThen((marketplace) => {
        const pluginResult = findPlugin(marketplace, spec.plugin)
        if (pluginResult.isErr()) {
          return errAsync(pluginResult.error)
        }
        const plugin = pluginResult.value

        const pluginDirResult = resolvePluginDir(
          plugin,
          cloneDir,
          marketplace.metadata?.pluginRoot,
        )
        // resolvePluginDir always returns Ok for valid plugin sources
        const pluginDir = pluginDirResult._unsafeUnwrap()

        // Determine if we need to clone a separate plugin repo
        const isRemote = typeof plugin.source === 'object'

        if (isRemote) {
          const pluginCloneDir = path.join(
            tmpBase,
            `local-skills-plugin-${Date.now()}`,
          )
          return cloneRepo(deps, pluginDir, pluginCloneDir, undefined).andThen(
            () =>
              installSkills(
                deps,
                spec,
                pluginCloneDir,
                sha,
                claudeDir,
                manifestPath,
              ),
          )
        }

        return installSkills(
          deps,
          spec,
          pluginDir,
          sha,
          claudeDir,
          manifestPath,
        )
      }),
    )
    .andThen(() => deps.rm(cloneDir))
}

function installSkills(
  deps: Deps,
  spec: ParsedSpecifier,
  pluginDir: string,
  sha: string,
  claudeDir: string,
  manifestPath: string,
): ResultAsync<void, LocalSkillsError> {
  if (spec.skill === '*') {
    return installAllSkills(deps, spec, pluginDir, sha, claudeDir, manifestPath)
  }

  return installSingleSkill(
    deps,
    spec,
    pluginDir,
    sha,
    claudeDir,
    manifestPath,
    spec.skill,
  )
}

function installSingleSkill(
  deps: Deps,
  spec: ParsedSpecifier,
  pluginDir: string,
  sha: string,
  claudeDir: string,
  manifestPath: string,
  skillName: string,
): ResultAsync<void, LocalSkillsError> {
  const skillSrcDir = path.join(pluginDir, 'skills', skillName)
  const skillDestDir = path.join(claudeDir, 'skills', skillName)

  return deps
    .exists(skillSrcDir)
    .andThen((exists) => {
      if (!exists) {
        return errAsync(
          localSkillsError(
            'SKILL_NOT_FOUND',
            `Skill "${skillName}" not found in plugin "${spec.plugin}"`,
          ),
        )
      }
      return okAsync(undefined)
    })
    .andThen(() => readManifest(deps, manifestPath))
    .andThen((manifest) => {
      const result = addSkillToManifest(manifest, skillName, {
        source: sourceLabel(spec),
        ref: spec.ref ?? 'HEAD',
        sha,
      })
      if (result.isErr()) {
        return errAsync(result.error)
      }
      return okAsync(result.value)
    })
    .andThen((updated) =>
      deps
        .mkdir(path.join(claudeDir, 'skills'))
        .andThen(() => deps.cp(skillSrcDir, skillDestDir))
        .andThen(() => writeManifest(deps, manifestPath, updated)),
    )
}

function installAllSkills(
  deps: Deps,
  spec: ParsedSpecifier,
  pluginDir: string,
  sha: string,
  claudeDir: string,
  manifestPath: string,
): ResultAsync<void, LocalSkillsError> {
  return listSkills(deps, pluginDir).andThen((skills) => {
    let chain: ResultAsync<void, LocalSkillsError> = okAsync(undefined)

    for (const skillName of skills) {
      chain = chain.andThen(() =>
        installSingleSkill(
          deps,
          spec,
          pluginDir,
          sha,
          claudeDir,
          manifestPath,
          skillName,
        ),
      )
    }

    return chain
  })
}
