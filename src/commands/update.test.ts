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

  it('returns already-up-to-date when upstream has not changed', async () => {
    const result = await update(deps, projectDir, 'tdd')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.status).toBe('already-up-to-date')
      if (result.value.status === 'already-up-to-date') {
        expect(result.value.sha).toBe(initialSha)
      }
    }

    // Verify the skill is still there
    const skillContent = await fs.readFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      'utf-8',
    )
    expect(skillContent).toBe('# TDD v1')
  })

  it('returns updated when upstream has changed', async () => {
    // Make a change upstream
    await fs.writeFile(
      path.join(marketplaceRepo, 'skills', 'tdd', 'SKILL.md'),
      '# TDD v2 - updated',
    )
    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "update tdd"', { cwd: marketplaceRepo })

    const result = await update(deps, projectDir, 'tdd')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.status).toBe('updated')
      if (result.value.status === 'updated') {
        expect(result.value.oldSha).toBe(initialSha)
        expect(result.value.newSha).not.toBe(initialSha)
      }
    }

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

    // Verify state file was updated with new content hash
    const stateContent = await fs.readFile(
      path.join(projectDir, '.claude', 'local-skills-state.json'),
      'utf-8',
    )
    const state = StateFileSchema.parse(JSON.parse(stateContent))
    expect(state.skills.tdd.contentHash).toMatch(/^[a-f0-9]{64}$/)

    // Restore the repo to original state for other tests
    execSync('git reset --hard HEAD~1', { cwd: marketplaceRepo })
  })

  it('returns skipped-pinned when ref is a 40-char SHA', async () => {
    // Rewrite manifest to have a SHA ref
    await fs.writeFile(
      path.join(projectDir, '.claude', 'local-skills.json'),
      JSON.stringify({
        skills: {
          tdd: {
            source: `superpowers@file://${marketplaceRepo}`,
            ref: initialSha,
            sha: initialSha,
          },
        },
      }),
    )

    const result = await update(deps, projectDir, 'tdd')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.status).toBe('skipped-pinned')
      if (result.value.status === 'skipped-pinned') {
        expect(result.value.sha).toBe(initialSha)
      }
    }
  })

  it('returns SKILL_MODIFIED when local files changed and no --force', async () => {
    // Modify the installed skill locally
    await fs.writeFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      '# TDD - locally modified',
    )

    // Make an upstream change so there's something to update to
    await fs.writeFile(
      path.join(marketplaceRepo, 'skills', 'tdd', 'SKILL.md'),
      '# TDD v2 - upstream',
    )
    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "update tdd"', { cwd: marketplaceRepo })

    const result = await update(deps, projectDir, 'tdd')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('SKILL_MODIFIED')
    }

    // Restore repo
    execSync('git reset --hard HEAD~1', { cwd: marketplaceRepo })
  })

  it('proceeds when local files changed with --force', async () => {
    // Modify the installed skill locally
    await fs.writeFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      '# TDD - locally modified',
    )

    // Make an upstream change
    await fs.writeFile(
      path.join(marketplaceRepo, 'skills', 'tdd', 'SKILL.md'),
      '# TDD v2 - forced update',
    )
    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "update tdd"', { cwd: marketplaceRepo })

    const result = await update(deps, projectDir, 'tdd', { force: true })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.status).toBe('updated')
    }

    // Verify the skill file was overwritten
    const skillContent = await fs.readFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      'utf-8',
    )
    expect(skillContent).toBe('# TDD v2 - forced update')

    // Restore repo
    execSync('git reset --hard HEAD~1', { cwd: marketplaceRepo })
  })

  it('proceeds without modification check when state file is missing', async () => {
    // Remove the state file to simulate a legacy install
    await fs.rm(path.join(projectDir, '.claude', 'local-skills-state.json'), {
      force: true,
    })

    // Modify the installed skill locally
    await fs.writeFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      '# TDD - locally modified',
    )

    // Make an upstream change
    await fs.writeFile(
      path.join(marketplaceRepo, 'skills', 'tdd', 'SKILL.md'),
      '# TDD v2 - legacy update',
    )
    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "update tdd"', { cwd: marketplaceRepo })

    const result = await update(deps, projectDir, 'tdd')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.status).toBe('updated')
    }

    const skillContent = await fs.readFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      'utf-8',
    )
    expect(skillContent).toBe('# TDD v2 - legacy update')

    // Restore repo
    execSync('git reset --hard HEAD~1', { cwd: marketplaceRepo })
  })

  it('proceeds without modification check when skill has no entry in state file', async () => {
    // Write a state file without the tdd skill
    await fs.writeFile(
      path.join(projectDir, '.claude', 'local-skills-state.json'),
      JSON.stringify({ skills: {} }),
    )

    // Modify the installed skill locally
    await fs.writeFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      '# TDD - locally modified',
    )

    // Make an upstream change
    await fs.writeFile(
      path.join(marketplaceRepo, 'skills', 'tdd', 'SKILL.md'),
      '# TDD v2 - no state entry',
    )
    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "update tdd"', { cwd: marketplaceRepo })

    const result = await update(deps, projectDir, 'tdd')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.status).toBe('updated')
    }

    // Restore repo
    execSync('git reset --hard HEAD~1', { cwd: marketplaceRepo })
  })

  it('returns MARKETPLACE_PARSE_ERROR when source has no @ separator', async () => {
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

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('CLONE_FAILED')
    }
  })

  it('returns PLUGIN_NOT_FOUND when plugin name in manifest does not match marketplace', async () => {
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
