import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import * as path from 'node:path'

import type { LocalSkillsError } from '../lib/errors.js'
import { localSkillsError } from '../lib/errors.js'
import { parseFrontMatter } from '../lib/front-matter.js'
import { readManifest } from '../lib/manifest.js'
import {
  findPlugin,
  listSkills,
  readMarketplace,
  resolvePluginDir,
} from '../lib/marketplace.js'
import { withTempClone } from '../lib/temp-clone.js'
import type { Deps } from '../lib/types.js'
import { formatSourceLabel } from './add.js'

export interface LsEntry {
  readonly name: string
  readonly source: string
  readonly description?: string
  readonly installed?: boolean
}

export interface LsOptions {
  readonly long?: boolean
}

export type LsQuery =
  | { readonly type: 'installed' }
  | {
      readonly type: 'remote-marketplace'
      readonly marketplaceUrl: string
      readonly ref: string | undefined
    }
  | {
      readonly type: 'remote-plugin'
      readonly pluginName: string
      readonly marketplaceUrl: string
      readonly ref: string | undefined
    }

function sortEntries(entries: readonly LsEntry[]): readonly LsEntry[] {
  return [...entries].sort((a, b) =>
    a.source !== b.source
      ? a.source.localeCompare(b.source)
      : a.name.localeCompare(b.name),
  )
}

export function ls(
  deps: Deps,
  projectDir: string,
  query: LsQuery,
  options?: LsOptions,
): ResultAsync<readonly LsEntry[], LocalSkillsError> {
  let result: ResultAsync<readonly LsEntry[], LocalSkillsError>

  switch (query.type) {
    case 'installed': {
      result = lsInstalled(deps, projectDir, options?.long)
      break
    }
    case 'remote-marketplace': {
      result = lsRemoteMarketplace(
        deps,
        query.marketplaceUrl,
        query.ref,
        options?.long,
      )
      break
    }
    case 'remote-plugin': {
      result = lsRemotePlugin(
        deps,
        query.pluginName,
        query.marketplaceUrl,
        query.ref,
        options?.long,
      )
      break
    }
  }

  if (query.type === 'installed') {
    return result.map((entries) =>
      sortEntries(entries.map((e) => ({ ...e, installed: true }))),
    )
  }

  const manifestPath = path.join(projectDir, '.claude', 'local-skills.json')
  return result.andThen((entries) =>
    readManifest(deps, manifestPath).map((manifest) => {
      const installedNames = new Set(Object.keys(manifest.skills))
      return sortEntries(
        entries.map((e) =>
          installedNames.has(e.name) ? { ...e, installed: true } : e,
        ),
      )
    }),
  )
}

function readDescription(
  deps: Deps,
  skillMdPath: string,
): ResultAsync<string | undefined, LocalSkillsError> {
  return deps
    .readFile(skillMdPath)
    .map((content) => {
      const { data } = parseFrontMatter(content)
      return typeof data.description === 'string' ? data.description : undefined
    })
    .orElse(() => okAsync(undefined))
}

function lsInstalled(
  deps: Deps,
  projectDir: string,
  long: boolean | undefined,
): ResultAsync<readonly LsEntry[], LocalSkillsError> {
  const manifestPath = path.join(projectDir, '.claude', 'local-skills.json')

  return readManifest(deps, manifestPath).andThen((manifest) => {
    const entries = Object.entries(manifest.skills)

    if (!long) {
      return okAsync(
        entries.map(
          ([name, entry]): LsEntry => ({
            name,
            source: entry.source,
          }),
        ),
      )
    }

    let chain: ResultAsync<readonly LsEntry[], LocalSkillsError> = okAsync([])

    for (const [name, entry] of entries) {
      chain = chain.andThen((acc) => {
        const skillMdPath = path.join(
          projectDir,
          '.claude',
          'skills',
          name,
          'SKILL.md',
        )
        return readDescription(deps, skillMdPath).map((description) => [
          ...acc,
          { name, source: entry.source, description },
        ])
      })
    }

    return chain
  })
}

function lsRemoteMarketplace(
  deps: Deps,
  marketplaceUrl: string,
  ref: string | undefined,
  long: boolean | undefined,
): ResultAsync<readonly LsEntry[], LocalSkillsError> {
  return withTempClone(deps, marketplaceUrl, ref, (cloneDir) =>
    readMarketplace(deps, cloneDir).andThen((marketplace) => {
      let chain: ResultAsync<readonly LsEntry[], LocalSkillsError> = okAsync([])

      for (const plugin of marketplace.plugins) {
        chain = chain.andThen((acc) =>
          resolvePluginDir(
            plugin,
            cloneDir,
            marketplace.metadata?.pluginRoot,
          ).asyncAndThen((resolvedDir) => {
            // Skip plugins with remote sources (not resolvable from this clone)
            if (!resolvedDir.startsWith('/')) {
              return okAsync(acc)
            }

            const source = formatSourceLabel(plugin.name, marketplaceUrl)

            return listSkills(deps, resolvedDir)
              .andThen((skills) => {
                if (!long) {
                  return okAsync([
                    ...acc,
                    ...skills.map((name): LsEntry => ({ name, source })),
                  ])
                }

                let inner: ResultAsync<readonly LsEntry[], LocalSkillsError> =
                  okAsync(acc)
                for (const name of skills) {
                  inner = inner.andThen((innerAcc) => {
                    const skillMdPath = path.join(
                      resolvedDir,
                      'skills',
                      name,
                      'SKILL.md',
                    )
                    return readDescription(deps, skillMdPath).map(
                      (description) => [
                        ...innerAcc,
                        { name, source, description },
                      ],
                    )
                  })
                }
                return inner
              })
              .orElse(() => okAsync(acc))
          }),
        )
      }

      return chain
    }),
  )
}

function lsRemotePlugin(
  deps: Deps,
  pluginName: string,
  marketplaceUrl: string,
  ref: string | undefined,
  long: boolean | undefined,
): ResultAsync<readonly LsEntry[], LocalSkillsError> {
  return withTempClone(deps, marketplaceUrl, ref, (cloneDir) =>
    readMarketplace(deps, cloneDir).andThen((marketplace) => {
      const pluginResult = findPlugin(marketplace, pluginName)
      if (pluginResult.isErr()) {
        return errAsync(pluginResult.error)
      }
      const plugin = pluginResult.value

      return resolvePluginDir(
        plugin,
        cloneDir,
        marketplace.metadata?.pluginRoot,
      ).asyncAndThen((resolvedDir) => {
        // Plugin has a remote source — can't list skills from this clone
        if (!resolvedDir.startsWith('/')) {
          return errAsync(
            localSkillsError(
              'REMOTE_SOURCE',
              `Plugin "${pluginName}" has a remote source and cannot be listed from this marketplace`,
            ),
          )
        }

        const source = formatSourceLabel(pluginName, marketplaceUrl)

        return listSkills(deps, resolvedDir).andThen((skills) => {
          if (!long) {
            return okAsync(skills.map((name): LsEntry => ({ name, source })))
          }

          let chain: ResultAsync<readonly LsEntry[], LocalSkillsError> =
            okAsync([])
          for (const name of skills) {
            chain = chain.andThen((acc) => {
              const skillMdPath = path.join(
                resolvedDir,
                'skills',
                name,
                'SKILL.md',
              )
              return readDescription(deps, skillMdPath).map((description) => [
                ...acc,
                { name, source, description },
              ])
            })
          }
          return chain
        })
      })
    }),
  )
}
