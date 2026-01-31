import { err, ok, type Result, type ResultAsync } from 'neverthrow'
import * as path from 'node:path'

import { localSkillsError, type LocalSkillsError } from './errors.js'
import { errorMessage } from './fs-ops.js'
import { MarketplaceConfigSchema } from './schemas.js'
import type { Deps, MarketplaceConfig, MarketplacePlugin } from './types.js'

export function readMarketplace(
  deps: Deps,
  cloneDir: string,
): ResultAsync<MarketplaceConfig, LocalSkillsError> {
  const filePath = path.join(cloneDir, '.claude-plugin', 'marketplace.json')

  return deps
    .readFile(filePath)
    .mapErr((e) =>
      localSkillsError(
        'MARKETPLACE_NOT_FOUND',
        `Marketplace file not found at "${filePath}"`,
        e.cause,
      ),
    )
    .andThen((content) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch (e) {
        return err(
          localSkillsError(
            'MARKETPLACE_PARSE_ERROR',
            `Invalid JSON in marketplace.json: ${errorMessage(e)}`,
            e,
          ),
        )
      }
      const result = MarketplaceConfigSchema.safeParse(parsed)
      if (!result.success) {
        return err(
          localSkillsError(
            'MARKETPLACE_PARSE_ERROR',
            `Invalid marketplace.json schema`,
            result.error,
          ),
        )
      }
      return ok(result.data)
    })
}

export function findPlugin(
  config: MarketplaceConfig,
  pluginName: string,
): Result<MarketplacePlugin, LocalSkillsError> {
  const plugin = config.plugins.find((p) => p.name === pluginName)
  if (!plugin) {
    return err(
      localSkillsError(
        'PLUGIN_NOT_FOUND',
        `Plugin "${pluginName}" not found in marketplace`,
      ),
    )
  }
  return ok(plugin)
}

/**
 * Resolves the plugin directory or remote URL.
 * For string sources: returns an absolute local path.
 * For github/url sources: returns the git clone URL (caller must clone separately).
 */
export function resolvePluginDir(
  plugin: MarketplacePlugin,
  cloneDir: string,
  pluginRoot: string | undefined,
): Result<string, LocalSkillsError> {
  const { source } = plugin

  if (typeof source === 'string') {
    if (pluginRoot) {
      return ok(path.join(cloneDir, pluginRoot, source))
    }
    return ok(path.join(cloneDir, source))
  }

  if (source.source === 'github') {
    return ok(`https://github.com/${source.repo}.git`)
  }

  // source.source === 'url'
  return ok(source.url)
}

export function listSkills(
  deps: Deps,
  pluginDir: string,
): ResultAsync<readonly string[], LocalSkillsError> {
  const skillsDir = path.join(pluginDir, 'skills')
  return deps
    .readdir(skillsDir)
    .mapErr(() =>
      localSkillsError(
        'SKILL_NOT_FOUND',
        `No skills directory found at "${skillsDir}"`,
      ),
    )
}
