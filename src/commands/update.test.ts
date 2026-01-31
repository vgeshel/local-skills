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
import { ManifestSchema } from '../lib/schemas.js'
import type { Deps } from '../lib/types.js'
import { add } from './add.js'
import { update } from './update.js'

describe('update command', () => {
  let marketplaceRepo: string
  let projectDir: string
  let initialSha: string
  const deps = createDefaultDeps()

  beforeAll(async () => {
    marketplaceRepo = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-update-marketplace-'),
    )
    execSync('git init', { cwd: marketplaceRepo })
    execSync('git config user.email "test@test.com"', {
      cwd: marketplaceRepo,
    })
    execSync('git config user.name "Test"', { cwd: marketplaceRepo })

    const pluginDir = path.join(marketplaceRepo, '.claude-plugin')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'marketplace.json'),
      JSON.stringify({
        plugins: [{ name: 'superpowers', source: '.' }],
      }),
    )

    const skillDir = path.join(marketplaceRepo, 'skills', 'tdd')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# TDD v1')

    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "initial"', { cwd: marketplaceRepo })
    initialSha = execSync('git rev-parse HEAD', {
      cwd: marketplaceRepo,
      encoding: 'utf-8',
    }).trim()
  })

  afterAll(async () => {
    await fs.rm(marketplaceRepo, { recursive: true, force: true })
  })

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-update-project-'),
    )
    await fs.mkdir(path.join(projectDir, '.claude'), {
      recursive: true,
    })

    // Install the skill first
    await add(deps, projectDir, {
      plugin: 'superpowers',
      marketplace: { type: 'url', url: `file://${marketplaceRepo}` },
      skill: 'tdd',
      ref: undefined,
    })
  })

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true })
  })

  it('updates a skill when upstream has changed', async () => {
    // Make a change upstream
    await fs.writeFile(
      path.join(marketplaceRepo, 'skills', 'tdd', 'SKILL.md'),
      '# TDD v2 - updated',
    )
    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "update tdd"', { cwd: marketplaceRepo })

    const result = await update(deps, projectDir, 'tdd')

    expect(result.isOk()).toBe(true)

    // Verify the skill file was updated
    const skillContent = await fs.readFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      'utf-8',
    )
    expect(skillContent).toBe('# TDD v2 - updated')

    // Verify manifest SHA was updated
    const manifestContent = await fs.readFile(
      path.join(projectDir, '.claude', 'local-skills.json'),
      'utf-8',
    )
    const manifest = ManifestSchema.parse(JSON.parse(manifestContent))
    expect(manifest.skills.tdd.sha).not.toBe(initialSha)

    // Restore the repo to original state for other tests
    execSync('git reset --hard HEAD~1', { cwd: marketplaceRepo })
  })

  it('succeeds even when upstream has not changed', async () => {
    const result = await update(deps, projectDir, 'tdd')

    expect(result.isOk()).toBe(true)

    // Verify the skill is still there
    const skillContent = await fs.readFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      'utf-8',
    )
    expect(skillContent).toBe('# TDD v1')
  })

  it('returns MARKETPLACE_PARSE_ERROR when source has no @ separator', async () => {
    // Manually write a broken manifest entry
    await fs.writeFile(
      path.join(projectDir, '.claude', 'local-skills.json'),
      JSON.stringify({
        skills: {
          tdd: {
            source: 'no-at-sign',
            ref: 'HEAD',
            sha: 'abc123',
          },
        },
      }),
    )

    const result = await update(deps, projectDir, 'tdd')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('MARKETPLACE_PARSE_ERROR')
    }
  })

  it('returns error when tmpdir fails', async () => {
    const failingDeps: Deps = {
      ...deps,
      tmpdir: () => err(localSkillsError('FS_ERROR', 'tmpdir failed')),
    }

    const result = await update(failingDeps, projectDir, 'tdd')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_ERROR')
    }
  })

  it('updates from GitHub shorthand source', async () => {
    // Write a manifest with a GitHub shorthand source that points to
    // a nonexistent repo — verifies the GitHub URL path is hit
    await fs.writeFile(
      path.join(projectDir, '.claude', 'local-skills.json'),
      JSON.stringify({
        skills: {
          tdd: {
            source: 'superpowers@nonexistent-owner/nonexistent-repo',
            ref: 'main',
            sha: 'abc123deadbeef',
          },
        },
      }),
    )

    const result = await update(deps, projectDir, 'tdd')

    // Should fail because the GitHub repo doesn't exist
    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('CLONE_FAILED')
    }
  })

  it('returns PLUGIN_NOT_FOUND when plugin name in manifest does not match marketplace', async () => {
    // Modify manifest to have a wrong plugin name
    await fs.writeFile(
      path.join(projectDir, '.claude', 'local-skills.json'),
      JSON.stringify({
        skills: {
          tdd: {
            source: `wrong-plugin@file://${marketplaceRepo}`,
            ref: 'HEAD',
            sha: 'abc123',
          },
        },
      }),
    )

    const result = await update(deps, projectDir, 'tdd')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('PLUGIN_NOT_FOUND')
    }
  })

  it('returns SKILL_NOT_INSTALLED when skill not in manifest', async () => {
    const result = await update(deps, projectDir, 'nonexistent')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('SKILL_NOT_INSTALLED')
    }
  })
})
