import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import * as path from 'node:path'

import type { LocalSkillsError } from '../lib/errors.js'
import { cloneRepo } from '../lib/git.js'
import { readManifest } from '../lib/manifest.js'
import {
  findPlugin,
  listSkills,
  readMarketplace,
  resolvePluginDir,
} from '../lib/marketplace.js'
import type { Deps } from '../lib/types.js'

export interface LsEntry {
  readonly name: string
  readonly source?: string
  readonly plugin?: string
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

export function ls(
  deps: Deps,
  projectDir: string,
  query: LsQuery,
): ResultAsync<readonly LsEntry[], LocalSkillsError> {
  switch (query.type) {
    case 'installed': {
      return lsInstalled(deps, projectDir)
    }
    case 'remote-marketplace': {
      return lsRemoteMarketplace(deps, query.marketplaceUrl, query.ref)
    }
    case 'remote-plugin': {
      return lsRemotePlugin(
        deps,
        query.pluginName,
        query.marketplaceUrl,
        query.ref,
      )
    }
  }
}

function lsInstalled(
  deps: Deps,
  projectDir: string,
): ResultAsync<readonly LsEntry[], LocalSkillsError> {
  const manifestPath = path.join(projectDir, '.claude', 'local-skills.json')

  return readManifest(deps, manifestPath).map((manifest) =>
    Object.entries(manifest.skills).map(
      ([name, entry]): LsEntry => ({
        name,
        source: entry.source,
      }),
    ),
  )
}

function lsRemoteMarketplace(
  deps: Deps,
  marketplaceUrl: string,
  ref: string | undefined,
): ResultAsync<readonly LsEntry[], LocalSkillsError> {
  const tmpResult = deps.tmpdir()

  if (tmpResult.isErr()) {
    return errAsync(tmpResult.error)
  }

  const tmpBase = tmpResult.value
  const cloneDir = path.join(tmpBase, `local-skills-ls-${Date.now()}`)

  return cloneRepo(deps, marketplaceUrl, cloneDir, ref)
    .andThen(() => readMarketplace(deps, cloneDir))
    .andThen((marketplace) => {
      let chain: ResultAsync<readonly LsEntry[], LocalSkillsError> = okAsync([])

      for (const plugin of marketplace.plugins) {
        chain = chain.andThen((acc) => {
          const dirResult = resolvePluginDir(
            plugin,
            cloneDir,
            marketplace.metadata?.pluginRoot,
          )
          const resolvedDir = dirResult._unsafeUnwrap()

          // Only list skills from local paths (not remote URLs)
          if (!resolvedDir.startsWith('/')) {
            return okAsync(acc)
          }

          return listSkills(deps, resolvedDir).map((skills) => [
            ...acc,
            ...skills.map(
              (name): LsEntry => ({
                name,
                plugin: plugin.name,
              }),
            ),
          ])
        })
      }

      return chain
    })
    .andThen((entries) => deps.rm(cloneDir).map(() => entries))
}

function lsRemotePlugin(
  deps: Deps,
  pluginName: string,
  marketplaceUrl: string,
  ref: string | undefined,
): ResultAsync<readonly LsEntry[], LocalSkillsError> {
  const tmpResult = deps.tmpdir()

  if (tmpResult.isErr()) {
    return errAsync(tmpResult.error)
  }

  const tmpBase = tmpResult.value
  const cloneDir = path.join(tmpBase, `local-skills-ls-${Date.now()}`)

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

      // For remote plugin sources, we would need a second clone
      // which is out of scope; only handle local paths
      if (!resolvedDir.startsWith('/')) {
        const empty: readonly LsEntry[] = []
        return okAsync(empty)
      }

      return listSkills(deps, resolvedDir).map((skills) =>
        skills.map(
          (name): LsEntry => ({
            name,
            plugin: pluginName,
          }),
        ),
      )
    })
    .andThen((entries) => deps.rm(cloneDir).map(() => entries))
}
