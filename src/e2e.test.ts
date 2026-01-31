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
  vi,
} from 'vitest'

import { createProgram } from './cli.js'
import { createDefaultDeps } from './lib/fs-ops.js'
import { ManifestSchema, StateFileSchema } from './lib/schemas.js'

/**
 * End-to-end tests that exercise the full CLI lifecycle:
 * add → verify → update → verify → remove → verify
 * using real temp git repos and real filesystem operations.
 */
describe('end-to-end', () => {
  let marketplaceRepo: string
  let marketplaceParent: string
  let projectDir: string
  let initialSha: string
  const deps = createDefaultDeps()

  beforeAll(async () => {
    marketplaceParent = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-e2e-mkt-'),
    )
    marketplaceRepo = path.join(marketplaceParent, 'marketplace.git')
    await fs.mkdir(marketplaceRepo, { recursive: true })

    execSync('git init', { cwd: marketplaceRepo })
    execSync('git config user.email "test@test.com"', {
      cwd: marketplaceRepo,
    })
    execSync('git config user.name "Test"', { cwd: marketplaceRepo })

    // Create marketplace.json with one plugin
    const pluginDir = path.join(marketplaceRepo, '.claude-plugin')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'marketplace.json'),
      JSON.stringify({
        plugins: [{ name: 'superpowers', source: '.' }],
      }),
    )

    // Create two skills
    const tddDir = path.join(marketplaceRepo, 'skills', 'tdd')
    await fs.mkdir(tddDir, { recursive: true })
    await fs.writeFile(path.join(tddDir, 'SKILL.md'), '# TDD v1')
    await fs.writeFile(path.join(tddDir, 'helpers.md'), '# Helper content')

    const debugDir = path.join(marketplaceRepo, 'skills', 'debug')
    await fs.mkdir(debugDir, { recursive: true })
    await fs.writeFile(path.join(debugDir, 'SKILL.md'), '# Debug v1')

    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "initial"', { cwd: marketplaceRepo })

    initialSha = execSync('git rev-parse HEAD', {
      cwd: marketplaceRepo,
      encoding: 'utf-8',
    }).trim()
  })

  afterAll(async () => {
    await fs.rm(marketplaceParent, { recursive: true, force: true })
  })

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-e2e-proj-'),
    )
    await fs.mkdir(path.join(projectDir, '.claude'), { recursive: true })
    process.exitCode = undefined
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function specifier(skill: string): string {
    return `superpowers@file://${marketplaceRepo}/${skill}`
  }

  async function run(...args: string[]): Promise<void> {
    const program = createProgram({ deps, projectDir })
    await program.parseAsync(['node', 'local-skills', ...args])
  }

  async function readManifest() {
    const content = await fs.readFile(
      path.join(projectDir, '.claude', 'local-skills.json'),
      'utf-8',
    )
    return ManifestSchema.parse(JSON.parse(content))
  }

  async function skillExists(skillName: string): Promise<boolean> {
    try {
      await fs.access(path.join(projectDir, '.claude', 'skills', skillName))
      return true
    } catch {
      return false
    }
  }

  async function readSkill(
    skillName: string,
    fileName: string,
  ): Promise<string> {
    return fs.readFile(
      path.join(projectDir, '.claude', 'skills', skillName, fileName),
      'utf-8',
    )
  }

  async function readStateFile() {
    const content = await fs.readFile(
      path.join(projectDir, '.claude', 'local-skills-state.json'),
      'utf-8',
    )
    return StateFileSchema.parse(JSON.parse(content))
  }

  it('full lifecycle: add → update → remove a single skill', async () => {
    // --- ADD ---
    await run('add', specifier('tdd'))

    expect(await skillExists('tdd')).toBe(true)
    expect(await readSkill('tdd', 'SKILL.md')).toBe('# TDD v1')
    expect(await readSkill('tdd', 'helpers.md')).toBe('# Helper content')

    const manifestAfterAdd = await readManifest()
    expect(manifestAfterAdd.skills.tdd).toBeDefined()
    expect(manifestAfterAdd.skills.tdd.sha).toBe(initialSha)
    expect(manifestAfterAdd.skills.tdd.ref).toBe('HEAD')
    expect(manifestAfterAdd.skills.tdd.source).toContain('superpowers@')

    // --- UPDATE (no upstream changes yet — should succeed, same SHA) ---
    await run('update', 'tdd')

    const manifestAfterNoopUpdate = await readManifest()
    expect(manifestAfterNoopUpdate.skills.tdd.sha).toBe(initialSha)
    expect(await readSkill('tdd', 'SKILL.md')).toBe('# TDD v1')

    // --- Make upstream change ---
    await fs.writeFile(
      path.join(marketplaceRepo, 'skills', 'tdd', 'SKILL.md'),
      '# TDD v2 — updated upstream',
    )
    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "update tdd skill"', { cwd: marketplaceRepo })
    const updatedSha = execSync('git rev-parse HEAD', {
      cwd: marketplaceRepo,
      encoding: 'utf-8',
    }).trim()

    // --- UPDATE (with upstream changes — should pull new content) ---
    await run('update', 'tdd')

    expect(await readSkill('tdd', 'SKILL.md')).toBe(
      '# TDD v2 — updated upstream',
    )

    const manifestAfterUpdate = await readManifest()
    expect(manifestAfterUpdate.skills.tdd.sha).toBe(updatedSha)
    expect(manifestAfterUpdate.skills.tdd.sha).not.toBe(initialSha)

    // --- REMOVE ---
    await run('remove', 'tdd')

    expect(await skillExists('tdd')).toBe(false)

    const manifestAfterRemove = await readManifest()
    expect(manifestAfterRemove.skills).toEqual({})

    // Restore repo state for other tests
    execSync('git reset --hard HEAD~1', { cwd: marketplaceRepo })
  })

  it('add all skills with wildcard, then remove individually', async () => {
    await run('add', specifier('*'))

    expect(await skillExists('tdd')).toBe(true)
    expect(await skillExists('debug')).toBe(true)
    expect(await readSkill('tdd', 'SKILL.md')).toBe('# TDD v1')
    expect(await readSkill('debug', 'SKILL.md')).toBe('# Debug v1')

    const manifest = await readManifest()
    expect(Object.keys(manifest.skills).sort()).toEqual(['debug', 'tdd'])

    // Remove one skill — the other should remain
    await run('remove', 'tdd')

    expect(await skillExists('tdd')).toBe(false)
    expect(await skillExists('debug')).toBe(true)

    const manifestAfter = await readManifest()
    expect(Object.keys(manifestAfter.skills)).toEqual(['debug'])

    // Remove the second skill
    await run('remove', 'debug')

    expect(await skillExists('debug')).toBe(false)
    const manifestFinal = await readManifest()
    expect(manifestFinal.skills).toEqual({})
  })

  it('add rejects duplicate skill', async () => {
    await run('add', specifier('tdd'))

    await run('add', specifier('tdd'))

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('SKILL_ALREADY_EXISTS'),
    )
  })

  it('update rejects unknown skill', async () => {
    await run('update', 'nope')

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('SKILL_NOT_INSTALLED'),
    )
  })

  it('remove rejects unknown skill', async () => {
    await run('remove', 'nope')

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('SKILL_NOT_INSTALLED'),
    )
  })

  it('add rejects malformed specifier', async () => {
    await run('add', 'garbage')

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('INVALID_SPECIFIER'),
    )
  })

  it('add rejects nonexistent plugin', async () => {
    await run('add', `wrong-plugin@file://${marketplaceRepo}/tdd`)

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('PLUGIN_NOT_FOUND'),
    )
  })

  it('add rejects nonexistent skill', async () => {
    await run('add', specifier('no-such-skill'))

    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('SKILL_NOT_FOUND'),
    )
  })

  it('add → modify locally → update blocked → update --force succeeds', async () => {
    // ADD
    await run('add', specifier('tdd'))
    expect(await skillExists('tdd')).toBe(true)

    // Verify state file was created
    const stateAfterAdd = await readStateFile()
    expect(stateAfterAdd.skills.tdd).toBeDefined()
    expect(stateAfterAdd.skills.tdd.contentHash).toMatch(/^[a-f0-9]{64}$/)

    // MODIFY locally
    await fs.writeFile(
      path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
      '# TDD - my local edits',
    )

    // Make upstream change
    await fs.writeFile(
      path.join(marketplaceRepo, 'skills', 'tdd', 'SKILL.md'),
      '# TDD v2 — force test',
    )
    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "update for force test"', {
      cwd: marketplaceRepo,
    })

    // UPDATE without --force → blocked
    await run('update', 'tdd')
    expect(process.exitCode).toBe(1)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('SKILL_MODIFIED'),
    )

    // Verify local changes are preserved
    expect(await readSkill('tdd', 'SKILL.md')).toBe('# TDD - my local edits')

    // Reset exitCode for next command
    process.exitCode = undefined

    // UPDATE with --force → succeeds
    await run('update', '--force', 'tdd')
    expect(process.exitCode).toBeUndefined()
    expect(await readSkill('tdd', 'SKILL.md')).toBe('# TDD v2 — force test')

    // State file updated with new hash
    const stateAfterForce = await readStateFile()
    expect(stateAfterForce.skills.tdd.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(stateAfterForce.skills.tdd.contentHash).not.toBe(
      stateAfterAdd.skills.tdd.contentHash,
    )

    // Restore repo
    execSync('git reset --hard HEAD~1', { cwd: marketplaceRepo })
  })

  it('pinned SHA lifecycle: add with SHA ref → update skipped', async () => {
    // ADD (default ref)
    await run('add', specifier('tdd'))

    const manifest = await readManifest()
    const sha = manifest.skills.tdd.sha

    // Pin the ref to the SHA
    await fs.writeFile(
      path.join(projectDir, '.claude', 'local-skills.json'),
      JSON.stringify(
        {
          skills: {
            tdd: {
              source: manifest.skills.tdd.source,
              ref: sha,
              sha,
            },
          },
        },
        null,
        2,
      ) + '\n',
    )

    // UPDATE → skipped-pinned
    await run('update', 'tdd')
    expect(process.exitCode).toBeUndefined()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('pinned'))

    // Skill file unchanged
    expect(await readSkill('tdd', 'SKILL.md')).toBe('# TDD v1')
  })
})
