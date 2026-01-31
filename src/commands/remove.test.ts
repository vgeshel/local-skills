import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDefaultDeps } from '../lib/fs-ops.js'
import { remove } from './remove.js'

describe('remove command', () => {
  let projectDir: string
  const deps = createDefaultDeps()

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-remove-test-'),
    )

    // Create .claude directory structure
    const claudeDir = path.join(projectDir, '.claude')
    const skillsDir = path.join(claudeDir, 'skills', 'tdd')
    await fs.mkdir(skillsDir, { recursive: true })
    await fs.writeFile(path.join(skillsDir, 'SKILL.md'), '# TDD Skill')

    // Create manifest
    await fs.writeFile(
      path.join(claudeDir, 'local-skills.json'),
      JSON.stringify({
        skills: {
          tdd: {
            source: 'superpowers@anthropics/claude-code',
            ref: 'main',
            sha: 'abc123',
          },
        },
      }),
    )
  })

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true })
  })

  it('removes an installed skill and updates manifest', async () => {
    const result = await remove(deps, projectDir, 'tdd')

    expect(result.isOk()).toBe(true)

    // Verify skill directory was removed
    const skillDir = path.join(projectDir, '.claude', 'skills', 'tdd')
    await expect(fs.stat(skillDir)).rejects.toThrow()

    // Verify manifest was updated
    const manifestContent = await fs.readFile(
      path.join(projectDir, '.claude', 'local-skills.json'),
      'utf-8',
    )
    const manifest: unknown = JSON.parse(manifestContent)
    expect(manifest).toEqual({ skills: {} })
  })

  it('returns SKILL_NOT_INSTALLED when skill not in manifest', async () => {
    const result = await remove(deps, projectDir, 'nonexistent')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('SKILL_NOT_INSTALLED')
    }
  })

  it('works when .claude/local-skills.json does not exist', async () => {
    await fs.rm(path.join(projectDir, '.claude', 'local-skills.json'))

    const result = await remove(deps, projectDir, 'tdd')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('SKILL_NOT_INSTALLED')
    }
  })
})
