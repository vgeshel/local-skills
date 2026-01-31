import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDefaultDeps } from './fs-ops.js'
import {
  findPlugin,
  listSkills,
  readMarketplace,
  resolvePluginDir,
} from './marketplace.js'

describe('marketplace', () => {
  let tmpDir: string
  const deps = createDefaultDeps()

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-marketplace-test-'),
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('readMarketplace', () => {
    it('reads and parses marketplace.json', async () => {
      const marketplaceDir = path.join(tmpDir, '.claude-plugin')
      await fs.mkdir(marketplaceDir, { recursive: true })
      await fs.writeFile(
        path.join(marketplaceDir, 'marketplace.json'),
        JSON.stringify({
          plugins: [{ name: 'my-plugin', source: './plugins/my-plugin' }],
        }),
      )

      const result = await readMarketplace(deps, tmpDir)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugins[0].name).toBe('my-plugin')
      }
    })

    it('returns MARKETPLACE_NOT_FOUND when file missing', async () => {
      const result = await readMarketplace(deps, tmpDir)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('MARKETPLACE_NOT_FOUND')
      }
    })

    it('returns MARKETPLACE_PARSE_ERROR for invalid JSON', async () => {
      const marketplaceDir = path.join(tmpDir, '.claude-plugin')
      await fs.mkdir(marketplaceDir, { recursive: true })
      await fs.writeFile(
        path.join(marketplaceDir, 'marketplace.json'),
        'not json',
      )

      const result = await readMarketplace(deps, tmpDir)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('MARKETPLACE_PARSE_ERROR')
      }
    })

    it('returns MARKETPLACE_PARSE_ERROR for invalid schema', async () => {
      const marketplaceDir = path.join(tmpDir, '.claude-plugin')
      await fs.mkdir(marketplaceDir, { recursive: true })
      await fs.writeFile(
        path.join(marketplaceDir, 'marketplace.json'),
        JSON.stringify({ wrong: 'shape' }),
      )

      const result = await readMarketplace(deps, tmpDir)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('MARKETPLACE_PARSE_ERROR')
      }
    })
  })

  describe('findPlugin', () => {
    it('finds a plugin by name', () => {
      const config = {
        plugins: [
          { name: 'alpha', source: './alpha' },
          { name: 'beta', source: './beta' },
        ],
      }

      const result = findPlugin(config, 'beta')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.name).toBe('beta')
        expect(result.value.source).toBe('./beta')
      }
    })

    it('returns PLUGIN_NOT_FOUND when not found', () => {
      const config = {
        plugins: [{ name: 'alpha', source: './alpha' }],
      }

      const result = findPlugin(config, 'gamma')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('PLUGIN_NOT_FOUND')
      }
    })
  })

  describe('resolvePluginDir', () => {
    it('resolves string source relative to clone dir', () => {
      const plugin = { name: 'test', source: './plugins/test' }
      const cloneDir = '/tmp/clone'

      const result = resolvePluginDir(plugin, cloneDir, undefined)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe('/tmp/clone/plugins/test')
      }
    })

    it('resolves string source with pluginRoot', () => {
      const plugin = { name: 'test', source: './test' }
      const cloneDir = '/tmp/clone'

      const result = resolvePluginDir(plugin, cloneDir, './plugins')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe('/tmp/clone/plugins/test')
      }
    })

    it('resolves github source to github clone URL', () => {
      const plugin = {
        name: 'test',
        source: { source: 'github' as const, repo: 'owner/repo' },
      }
      const cloneDir = '/tmp/clone'

      const result = resolvePluginDir(plugin, cloneDir, undefined)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe('https://github.com/owner/repo.git')
      }
    })

    it('resolves url source to url', () => {
      const plugin = {
        name: 'test',
        source: {
          source: 'url' as const,
          url: 'https://gitlab.com/team/repo.git',
        },
      }
      const cloneDir = '/tmp/clone'

      const result = resolvePluginDir(plugin, cloneDir, undefined)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe('https://gitlab.com/team/repo.git')
      }
    })
  })

  describe('listSkills', () => {
    it('lists skill directories in a plugin dir', async () => {
      const pluginDir = path.join(tmpDir, 'plugin')
      const skillsDir = path.join(pluginDir, 'skills')
      await fs.mkdir(path.join(skillsDir, 'tdd'), { recursive: true })
      await fs.writeFile(path.join(skillsDir, 'tdd', 'SKILL.md'), '# TDD')
      await fs.mkdir(path.join(skillsDir, 'debug'), { recursive: true })
      await fs.writeFile(path.join(skillsDir, 'debug', 'SKILL.md'), '# Debug')

      const result = await listSkills(deps, pluginDir)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect([...result.value].sort()).toEqual(['debug', 'tdd'])
      }
    })

    it('returns SKILL_NOT_FOUND when skills directory missing', async () => {
      const result = await listSkills(deps, tmpDir)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('SKILL_NOT_FOUND')
      }
    })
  })
})
