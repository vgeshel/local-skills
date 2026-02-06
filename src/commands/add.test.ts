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
import { ManifestSchema, StateFileSchema } from '../lib/schemas.js'
import type { Deps } from '../lib/types.js'
import { add, formatSourceLabel, marketplaceUrl, sourceLabel } from './add.js'

describe('add command', () => {
  let marketplaceRepo: string
  let projectDir: string
  const deps = createDefaultDeps()

  beforeAll(async () => {
    // Create a fake marketplace git repo
    marketplaceRepo = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-add-marketplace-'),
    )
    execSync('git init', { cwd: marketplaceRepo })
    execSync('git config user.email "test@test.com"', {
      cwd: marketplaceRepo,
    })
    execSync('git config user.name "Test"', { cwd: marketplaceRepo })

    // Create marketplace.json
    const pluginDir = path.join(marketplaceRepo, '.claude-plugin')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'marketplace.json'),
      JSON.stringify({
        plugins: [{ name: 'superpowers', source: '.' }],
      }),
    )

    // Create skills
    const skillDir = path.join(marketplaceRepo, 'skills', 'tdd')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# TDD Skill')

    const debugDir = path.join(marketplaceRepo, 'skills', 'debug')
    await fs.mkdir(debugDir, { recursive: true })
    await fs.writeFile(path.join(debugDir, 'SKILL.md'), '# Debug Skill')

    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "initial"', { cwd: marketplaceRepo })
  })

  afterAll(async () => {
    await fs.rm(marketplaceRepo, { recursive: true, force: true })
  })

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-add-project-'),
    )
    const claudeDir = path.join(projectDir, '.claude')
    await fs.mkdir(claudeDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true })
  })

  it('adds a single skill from a local marketplace', async () => {
    const result = await add(deps, projectDir, {
      plugin: 'superpowers',
      marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
      skill: 'tdd',
      ref: undefined,
    })

    expect(result.isOk()).toBe(true)

    // Verify skill was copied
    const skillMd = await fs.readFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      'utf-8',
    )
    expect(skillMd).toBe('# TDD Skill')
    const agentsSkillMd = await fs.readFile(
      path.join(projectDir, '.agents', 'skills', 'tdd', 'SKILL.md'),
      'utf-8',
    )
    expect(agentsSkillMd).toBe('# TDD Skill')

    // Verify manifest was created
    const manifestContent = await fs.readFile(
      path.join(projectDir, '.claude', 'local-skills.json'),
      'utf-8',
    )
    const manifest = ManifestSchema.parse(JSON.parse(manifestContent))
    expect(manifest.skills.tdd).toBeDefined()
    expect(manifest.skills.tdd.source).toBe(
      `superpowers@file://${marketplaceRepo}`,
    )
    expect(manifest.skills.tdd.ref).toBe('HEAD')
    expect(manifest.skills.tdd.sha).toMatch(/^[a-f0-9]{40}$/)
  })

  it('writes content hash to state file after adding a skill', async () => {
    await add(deps, projectDir, {
      plugin: 'superpowers',
      marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
      skill: 'tdd',
      ref: undefined,
    })

    const stateContent = await fs.readFile(
      path.join(projectDir, '.claude', 'local-skills-state.json'),
      'utf-8',
    )
    const state = StateFileSchema.parse(JSON.parse(stateContent))
    expect(state.skills.tdd).toBeDefined()
    expect(state.skills.tdd.contentHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('adds all skills with wildcard', async () => {
    const result = await add(deps, projectDir, {
      plugin: 'superpowers',
      marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
      skill: '*',
      ref: undefined,
    })

    expect(result.isOk()).toBe(true)

    // Verify both skills were copied
    const tddMd = await fs.readFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      'utf-8',
    )
    expect(tddMd).toBe('# TDD Skill')

    const debugMd = await fs.readFile(
      path.join(projectDir, '.claude', 'skills', 'debug', 'SKILL.md'),
      'utf-8',
    )
    expect(debugMd).toBe('# Debug Skill')
    const tddAgentsMd = await fs.readFile(
      path.join(projectDir, '.agents', 'skills', 'tdd', 'SKILL.md'),
      'utf-8',
    )
    expect(tddAgentsMd).toBe('# TDD Skill')
    const debugAgentsMd = await fs.readFile(
      path.join(projectDir, '.agents', 'skills', 'debug', 'SKILL.md'),
      'utf-8',
    )
    expect(debugAgentsMd).toBe('# Debug Skill')

    // Verify manifest has both skills
    const manifestContent = await fs.readFile(
      path.join(projectDir, '.claude', 'local-skills.json'),
      'utf-8',
    )
    const manifest = ManifestSchema.parse(JSON.parse(manifestContent))
    expect(Object.keys(manifest.skills).sort()).toEqual(['debug', 'tdd'])
  })

  it('returns SKILL_ALREADY_EXISTS when skill already installed', async () => {
    // First add
    await add(deps, projectDir, {
      plugin: 'superpowers',
      marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
      skill: 'tdd',
      ref: undefined,
    })

    // Second add should fail
    const result = await add(deps, projectDir, {
      plugin: 'superpowers',
      marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
      skill: 'tdd',
      ref: undefined,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('SKILL_ALREADY_EXISTS')
    }
  })

  it('returns PLUGIN_NOT_FOUND when plugin name is wrong', async () => {
    const result = await add(deps, projectDir, {
      plugin: 'nonexistent-plugin',
      marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
      skill: 'tdd',
      ref: undefined,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('PLUGIN_NOT_FOUND')
    }
  })

  it('returns SKILL_NOT_FOUND for nonexistent skill', async () => {
    const result = await add(deps, projectDir, {
      plugin: 'superpowers',
      marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
      skill: 'nonexistent-skill',
      ref: undefined,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('SKILL_NOT_FOUND')
    }
  })

  describe('marketplaceUrl', () => {
    it('returns GitHub HTTPS URL for github marketplace', () => {
      const url = marketplaceUrl({
        plugin: 'superpowers',
        marketplace: {
          type: 'github',
          owner: 'anthropics',
          repo: 'claude-code',
        },
        skill: 'tdd',
        ref: undefined,
      })

      expect(url).toBe('https://github.com/anthropics/claude-code.git')
    })

    it('returns raw URL for url marketplace', () => {
      const url = marketplaceUrl({
        plugin: 'p',
        marketplace: {
          type: 'url',
          url: 'https://gitlab.com/team/repo',
        },
        skill: 'tdd',
        ref: undefined,
      })

      expect(url).toBe('https://gitlab.com/team/repo')
    })
  })

  describe('sourceLabel', () => {
    it('returns plugin@owner/repo for github marketplace', () => {
      const label = sourceLabel({
        plugin: 'superpowers',
        marketplace: {
          type: 'github',
          owner: 'anthropics',
          repo: 'claude-code',
        },
        skill: 'tdd',
        ref: undefined,
      })

      expect(label).toBe('superpowers@anthropics/claude-code')
    })

    it('returns plugin@url for url marketplace', () => {
      const label = sourceLabel({
        plugin: 'p',
        marketplace: {
          type: 'url',
          url: 'https://gitlab.com/team/repo',
        },
        skill: 'tdd',
        ref: undefined,
      })

      expect(label).toBe('p@https://gitlab.com/team/repo')
    })
  })

  describe('formatSourceLabel', () => {
    it('returns plugin@owner/repo for GitHub HTTPS URL', () => {
      const label = formatSourceLabel(
        'superpowers',
        'https://github.com/anthropics/claude-plugins-official.git',
      )

      expect(label).toBe('superpowers@anthropics/claude-plugins-official')
    })

    it('strips .git suffix from GitHub URL', () => {
      const label = formatSourceLabel('sp', 'https://github.com/owner/repo.git')

      expect(label).toBe('sp@owner/repo')
    })

    it('handles GitHub URL without .git suffix', () => {
      const label = formatSourceLabel('sp', 'https://github.com/owner/repo')

      expect(label).toBe('sp@owner/repo')
    })

    it('returns plugin@url for non-GitHub URLs', () => {
      const label = formatSourceLabel('p', 'https://gitlab.com/team/repo.git')

      expect(label).toBe('p@https://gitlab.com/team/repo.git')
    })

    it('returns plugin@url for file:// URLs', () => {
      const label = formatSourceLabel('p', 'file:///tmp/repo')

      expect(label).toBe('p@file:///tmp/repo')
    })
  })

  it('adds a skill from a marketplace with remote plugin source', async () => {
    // Create a plugin repo separate from the marketplace
    const pluginRepo = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-add-plugin-'),
    )
    execSync('git init', { cwd: pluginRepo })
    execSync('git config user.email "test@test.com"', {
      cwd: pluginRepo,
    })
    execSync('git config user.name "Test"', { cwd: pluginRepo })
    const pluginSkillDir = path.join(pluginRepo, 'skills', 'remote-skill')
    await fs.mkdir(pluginSkillDir, { recursive: true })
    await fs.writeFile(path.join(pluginSkillDir, 'SKILL.md'), '# Remote Skill')
    execSync('git add -A', { cwd: pluginRepo })
    execSync('git commit -m "plugin initial"', { cwd: pluginRepo })

    // Create a marketplace that references the external plugin
    const remoteMarketplace = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-add-remote-mkt-'),
    )
    execSync('git init', { cwd: remoteMarketplace })
    execSync('git config user.email "test@test.com"', {
      cwd: remoteMarketplace,
    })
    execSync('git config user.name "Test"', { cwd: remoteMarketplace })
    const mktPluginDir = path.join(remoteMarketplace, '.claude-plugin')
    await fs.mkdir(mktPluginDir, { recursive: true })
    await fs.writeFile(
      path.join(mktPluginDir, 'marketplace.json'),
      JSON.stringify({
        plugins: [
          {
            name: 'ext-plugin',
            source: { source: 'url', url: `file://${pluginRepo}` },
          },
        ],
      }),
    )
    execSync('git add -A', { cwd: remoteMarketplace })
    execSync('git commit -m "initial"', { cwd: remoteMarketplace })

    try {
      const result = await add(deps, projectDir, {
        plugin: 'ext-plugin',
        marketplace: {
          type: 'url',
          url: `file://${remoteMarketplace}`,
        },
        skill: 'remote-skill',
        ref: undefined,
      })

      expect(result.isOk()).toBe(true)

      const skillMd = await fs.readFile(
        path.join(projectDir, '.claude', 'skills', 'remote-skill', 'SKILL.md'),
        'utf-8',
      )
      expect(skillMd).toBe('# Remote Skill')
      const agentsSkillMd = await fs.readFile(
        path.join(projectDir, '.agents', 'skills', 'remote-skill', 'SKILL.md'),
        'utf-8',
      )
      expect(agentsSkillMd).toBe('# Remote Skill')
    } finally {
      await fs.rm(pluginRepo, { recursive: true, force: true })
      await fs.rm(remoteMarketplace, { recursive: true, force: true })
    }
  })

  it('returns error when tmpdir fails', async () => {
    const failingDeps: Deps = {
      ...deps,
      tmpdir: () => err(localSkillsError('FS_ERROR', 'tmpdir failed')),
    }

    const result = await add(failingDeps, projectDir, {
      plugin: 'superpowers',
      marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
      skill: 'tdd',
      ref: undefined,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_ERROR')
    }
  })

  it('rejects undefined skill', async () => {
    const result = await add(deps, projectDir, {
      plugin: 'superpowers',
      marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
      skill: undefined,
      ref: undefined,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('INVALID_SPECIFIER')
      expect(result.error.message).toContain('Skill name is required')
    }
  })

  it('returns CLONE_FAILED for invalid repo URL', async () => {
    const result = await add(deps, projectDir, {
      plugin: 'superpowers',
      marketplace: { type: 'url', url: 'file:///nonexistent/repo' },
      skill: 'tdd',
      ref: undefined,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('CLONE_FAILED')
    }
  })
})
