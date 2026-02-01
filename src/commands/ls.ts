import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import * as path from 'node:path'

import type { LocalSkillsError } from '../lib/errors.js'
import { localSkillsError } from '../lib/errors.js'
import { readManifest } from '../lib/manifest.js'
import {
  findPlugin,
  listSkills,
  readMarketplace,
  resolvePluginDir,
} from '../lib/marketplace.js'
import { withTempClone } from '../lib/temp-clone.js'
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

            return listSkills(deps, resolvedDir)
              .map((skills) => [
                ...acc,
                ...skills.map(
                  (name): LsEntry => ({
                    name,
                    plugin: plugin.name,
                  }),
                ),
              ])
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

        return listSkills(deps, resolvedDir).map((skills) =>
          skills.map(
            (name): LsEntry => ({
              name,
              plugin: pluginName,
            }),
          ),
        )
      })
    }),
  )
}
