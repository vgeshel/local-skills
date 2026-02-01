import { execSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'

import { err } from 'neverthrow'
import { localSkillsError } from '../lib/errors.js'
import { createDefaultDeps } from '../lib/fs-ops.js'
import type { Deps } from '../lib/types.js'
import { add } from './add.js'
import { ls } from './ls.js'

describe('ls command', () => {
  let marketplaceRepo: string
  let marketplaceParent: string
  let projectDir: string
  const deps = createDefaultDeps()

  beforeAll(async () => {
    marketplaceParent = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-ls-marketplace-'),
    )
    marketplaceRepo = path.join(marketplaceParent, 'marketplace.git')
    await fs.mkdir(marketplaceRepo, { recursive: true })

    execSync('git init', { cwd: marketplaceRepo })
    execSync('git config user.email "test@test.com"', { cwd: marketplaceRepo })
    execSync('git config user.name "Test"', { cwd: marketplaceRepo })

    const pluginDir = path.join(marketplaceRepo, '.claude-plugin')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'marketplace.json'),
      JSON.stringify({
        plugins: [
          { name: 'superpowers', source: '.' },
          { name: 'other-plugin', source: '.' },
        ],
      }),
    )

    const tddDir = path.join(marketplaceRepo, 'skills', 'tdd')
    await fs.mkdir(tddDir, { recursive: true })
    await fs.writeFile(path.join(tddDir, 'SKILL.md'), '# TDD')

    const debugDir = path.join(marketplaceRepo, 'skills', 'debug')
    await fs.mkdir(debugDir, { recursive: true })
    await fs.writeFile(path.join(debugDir, 'SKILL.md'), '# Debug')

    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "initial"', { cwd: marketplaceRepo })
  })

  afterAll(async () => {
    await fs.rm(marketplaceParent, { recursive: true, force: true })
  })

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-ls-project-'),
    )
    await fs.mkdir(path.join(projectDir, '.claude'), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true })
  })

  describe('ls installed', () => {
    it('returns empty list when no skills installed', async () => {
      const result = await ls(deps, projectDir, { type: 'installed' })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual([])
      }
    })

    it('returns installed skills from manifest', async () => {
      await add(deps, projectDir, {
        plugin: 'superpowers',
        marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
        skill: 'tdd',
        ref: undefined,
      })

      const result = await ls(deps, projectDir, { type: 'installed' })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(1)
        expect(result.value[0].name).toBe('tdd')
        expect(result.value[0].source).toContain('superpowers@')
      }
    })
  })

  describe('ls remote marketplace', () => {
    it('lists all plugins and skills in a marketplace', async () => {
      const result = await ls(deps, projectDir, {
        type: 'remote-marketplace',
        marketplaceUrl: `file://${marketplaceRepo}`,
        ref: undefined,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.length).toBeGreaterThanOrEqual(2)
        const names = result.value.map((s) => s.name)
        expect(names).toContain('tdd')
        expect(names).toContain('debug')
      }
    })

    it('includes plugin name in entries', async () => {
      const result = await ls(deps, projectDir, {
        type: 'remote-marketplace',
        marketplaceUrl: `file://${marketplaceRepo}`,
        ref: undefined,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const plugins = result.value.map((s) => s.plugin)
        expect(plugins).toContain('superpowers')
        expect(plugins).toContain('other-plugin')
      }
    })

    it('skips plugins with remote (non-local) sources', async () => {
      // Create a marketplace with a remote plugin source (object type)
      const remoteParent = await fs.mkdtemp(
        path.join(os.tmpdir(), 'local-skills-ls-remote-mkt-'),
      )
      const remoteRepo = path.join(remoteParent, 'remote.git')
      await fs.mkdir(remoteRepo, { recursive: true })
      execSync('git init', { cwd: remoteRepo })
      execSync('git config user.email "test@test.com"', { cwd: remoteRepo })
      execSync('git config user.name "Test"', { cwd: remoteRepo })

      const pluginDir = path.join(remoteRepo, '.claude-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      await fs.writeFile(
        path.join(pluginDir, 'marketplace.json'),
        JSON.stringify({
          plugins: [
            {
              name: 'remote-plugin',
              source: { source: 'url', url: 'https://example.com/repo.git' },
            },
          ],
        }),
      )
      execSync('git add -A', { cwd: remoteRepo })
      execSync('git commit -m "initial"', { cwd: remoteRepo })

      try {
        const result = await ls(deps, projectDir, {
          type: 'remote-marketplace',
          marketplaceUrl: `file://${remoteRepo}`,
          ref: undefined,
        })

        expect(result.isOk()).toBe(true)
        if (result.isOk()) {
          expect(result.value).toEqual([])
        }
      } finally {
        await fs.rm(remoteParent, { recursive: true, force: true })
      }
    })

    it('returns error when tmpdir fails', async () => {
      const failingDeps: Deps = {
        ...deps,
        tmpdir: () => err(localSkillsError('FS_ERROR', 'tmpdir failed')),
      }

      const result = await ls(failingDeps, projectDir, {
        type: 'remote-marketplace',
        marketplaceUrl: `file://${marketplaceRepo}`,
        ref: undefined,
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('FS_ERROR')
      }
    })

    it('returns CLONE_FAILED for invalid repo URL', async () => {
      const result = await ls(deps, projectDir, {
        type: 'remote-marketplace',
        marketplaceUrl: 'file:///nonexistent/repo',
        ref: undefined,
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('CLONE_FAILED')
      }
    })
  })

  describe('ls remote plugin', () => {
    it('lists skills in a specific plugin', async () => {
      const result = await ls(deps, projectDir, {
        type: 'remote-plugin',
        pluginName: 'superpowers',
        marketplaceUrl: `file://${marketplaceRepo}`,
        ref: undefined,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        const names = result.value.map((s) => s.name)
        expect(names).toContain('tdd')
        expect(names).toContain('debug')
      }
    })

    it('returns PLUGIN_NOT_FOUND for unknown plugin', async () => {
      const result = await ls(deps, projectDir, {
        type: 'remote-plugin',
        pluginName: 'nonexistent',
        marketplaceUrl: `file://${marketplaceRepo}`,
        ref: undefined,
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('PLUGIN_NOT_FOUND')
      }
    })

    it('includes plugin name in entries', async () => {
      const result = await ls(deps, projectDir, {
        type: 'remote-plugin',
        pluginName: 'superpowers',
        marketplaceUrl: `file://${marketplaceRepo}`,
        ref: undefined,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        for (const entry of result.value) {
          expect(entry.plugin).toBe('superpowers')
        }
      }
    })

    it('returns REMOTE_SOURCE error for plugin with remote source', async () => {
      const remoteParent = await fs.mkdtemp(
        path.join(os.tmpdir(), 'local-skills-ls-remote-plugin-'),
      )
      const remoteRepo = path.join(remoteParent, 'remote.git')
      await fs.mkdir(remoteRepo, { recursive: true })
      execSync('git init', { cwd: remoteRepo })
      execSync('git config user.email "test@test.com"', { cwd: remoteRepo })
      execSync('git config user.name "Test"', { cwd: remoteRepo })

      const pluginDir = path.join(remoteRepo, '.claude-plugin')
      await fs.mkdir(pluginDir, { recursive: true })
      await fs.writeFile(
        path.join(pluginDir, 'marketplace.json'),
        JSON.stringify({
          plugins: [
            {
              name: 'ext-plugin',
              source: { source: 'url', url: 'https://example.com/repo.git' },
            },
          ],
        }),
      )
      execSync('git add -A', { cwd: remoteRepo })
      execSync('git commit -m "initial"', { cwd: remoteRepo })

      try {
        const result = await ls(deps, projectDir, {
          type: 'remote-plugin',
          pluginName: 'ext-plugin',
          marketplaceUrl: `file://${remoteRepo}`,
          ref: undefined,
        })

        expect(result.isErr()).toBe(true)
        if (result.isErr()) {
          expect(result.error.code).toBe('REMOTE_SOURCE')
        }
      } finally {
        await fs.rm(remoteParent, { recursive: true, force: true })
      }
    })

    it('returns error when tmpdir fails', async () => {
      const failingDeps: Deps = {
        ...deps,
        tmpdir: () => err(localSkillsError('FS_ERROR', 'tmpdir failed')),
      }

      const result = await ls(failingDeps, projectDir, {
        type: 'remote-plugin',
        pluginName: 'superpowers',
        marketplaceUrl: `file://${marketplaceRepo}`,
        ref: undefined,
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('FS_ERROR')
      }
    })
  })
})
