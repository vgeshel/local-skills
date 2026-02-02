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
import { info } from './info.js'

describe('info command', () => {
  let marketplaceRepo: string
  let marketplaceParent: string
  let projectDir: string
  const deps = createDefaultDeps()

  beforeAll(async () => {
    marketplaceParent = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-info-marketplace-'),
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
        plugins: [{ name: 'superpowers', source: '.' }],
      }),
    )

    const tddDir = path.join(marketplaceRepo, 'skills', 'tdd')
    await fs.mkdir(tddDir, { recursive: true })
    await fs.writeFile(
      path.join(tddDir, 'SKILL.md'),
      `---
name: tdd
description: Test-driven development workflow
---

# TDD Skill

Write tests first.`,
    )

    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "initial"', { cwd: marketplaceRepo })
  })

  afterAll(async () => {
    await fs.rm(marketplaceParent, { recursive: true, force: true })
  })

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-info-project-'),
    )
    await fs.mkdir(path.join(projectDir, '.claude'), { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true })
  })

  describe('info installed', () => {
    it('returns info for an installed skill', async () => {
      await add(deps, projectDir, {
        plugin: 'superpowers',
        marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
        skill: 'tdd',
        ref: undefined,
      })

      const result = await info(deps, projectDir, {
        type: 'installed',
        skillName: 'tdd',
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.name).toBe('tdd')
        expect(result.value.source).toContain('superpowers@')
        expect(result.value.installedSha).toBeDefined()
        expect(result.value.frontMatter.name).toBe('tdd')
        expect(result.value.frontMatter.description).toBe(
          'Test-driven development workflow',
        )
      }
    })

    it('returns SKILL_NOT_INSTALLED for unknown skill', async () => {
      const result = await info(deps, projectDir, {
        type: 'installed',
        skillName: 'nonexistent',
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('SKILL_NOT_INSTALLED')
      }
    })

    it('returns empty front matter when SKILL.md has no front matter', async () => {
      // Manually create a skill without front matter
      const skillDir = path.join(projectDir, '.claude', 'skills', 'plain')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Plain skill')
      // Add to manifest
      await fs.writeFile(
        path.join(projectDir, '.claude', 'local-skills.json'),
        JSON.stringify({
          skills: {
            plain: { source: 'test@test', ref: 'HEAD', sha: 'abc123' },
          },
        }),
      )

      const result = await info(deps, projectDir, {
        type: 'installed',
        skillName: 'plain',
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.frontMatter).toEqual({})
      }
    })

    it('returns info with empty front matter when SKILL.md does not exist', async () => {
      // Manually create a skill directory without SKILL.md
      const skillDir = path.join(projectDir, '.claude', 'skills', 'no-readme')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(
        path.join(projectDir, '.claude', 'local-skills.json'),
        JSON.stringify({
          skills: {
            'no-readme': {
              source: 'test@test',
              ref: 'HEAD',
              sha: 'abc123',
            },
          },
        }),
      )

      const result = await info(deps, projectDir, {
        type: 'installed',
        skillName: 'no-readme',
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.name).toBe('no-readme')
        expect(result.value.frontMatter).toEqual({})
      }
    })
  })

  describe('info remote', () => {
    it('returns info for a remote skill', async () => {
      const result = await info(deps, projectDir, {
        type: 'remote',
        pluginName: 'superpowers',
        marketplaceUrl: `file://${marketplaceRepo}`,
        skillName: 'tdd',
        ref: undefined,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.name).toBe('tdd')
        expect(result.value.installedSha).toBeUndefined()
        expect(result.value.frontMatter.name).toBe('tdd')
        expect(result.value.frontMatter.description).toBe(
          'Test-driven development workflow',
        )
      }
    })

    it('marks remote skill as installed when it is', async () => {
      await add(deps, projectDir, {
        plugin: 'superpowers',
        marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
        skill: 'tdd',
        ref: undefined,
      })

      const result = await info(deps, projectDir, {
        type: 'remote',
        pluginName: 'superpowers',
        marketplaceUrl: `file://${marketplaceRepo}`,
        skillName: 'tdd',
        ref: undefined,
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.installedSha).toBeDefined()
      }
    })

    it('returns SKILL_NOT_FOUND for nonexistent remote skill', async () => {
      const result = await info(deps, projectDir, {
        type: 'remote',
        pluginName: 'superpowers',
        marketplaceUrl: `file://${marketplaceRepo}`,
        skillName: 'nonexistent',
        ref: undefined,
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('SKILL_NOT_FOUND')
      }
    })

    it('returns PLUGIN_NOT_FOUND for nonexistent plugin', async () => {
      const result = await info(deps, projectDir, {
        type: 'remote',
        pluginName: 'nonexistent',
        marketplaceUrl: `file://${marketplaceRepo}`,
        skillName: 'tdd',
        ref: undefined,
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('PLUGIN_NOT_FOUND')
      }
    })

    it('returns error when tmpdir fails', async () => {
      const failingDeps: Deps = {
        ...deps,
        tmpdir: () => err(localSkillsError('FS_ERROR', 'tmpdir failed')),
      }

      const result = await info(failingDeps, projectDir, {
        type: 'remote',
        pluginName: 'superpowers',
        marketplaceUrl: `file://${marketplaceRepo}`,
        skillName: 'tdd',
        ref: undefined,
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('FS_ERROR')
      }
    })

    it('returns CLONE_FAILED for invalid repo URL', async () => {
      const result = await info(deps, projectDir, {
        type: 'remote',
        pluginName: 'superpowers',
        marketplaceUrl: 'file:///nonexistent/repo',
        skillName: 'tdd',
        ref: undefined,
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('CLONE_FAILED')
      }
    })
  })
})
