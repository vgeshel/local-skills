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

import { Command } from 'commander'
import { createProgram, formatError } from './cli.js'
import { localSkillsError } from './lib/errors.js'
import { createDefaultDeps } from './lib/fs-ops.js'
import { ManifestSchema } from './lib/schemas.js'

describe('formatError', () => {
  it('formats a LocalSkillsError with code and message', () => {
    const error = localSkillsError(
      'SKILL_NOT_FOUND',
      'Skill "tdd" not found in plugin "superpowers"',
    )

    const result = formatError(error)

    expect(result).toBe(
      'Error [SKILL_NOT_FOUND]: Skill "tdd" not found in plugin "superpowers"',
    )
  })

  it('formats all error codes consistently', () => {
    const error = localSkillsError('CLONE_FAILED', 'git clone failed')

    const result = formatError(error)

    expect(result).toBe('Error [CLONE_FAILED]: git clone failed')
  })
})

describe('createProgram', () => {
  it('returns a Commander program', () => {
    const program = createProgram()

    expect(program).toBeInstanceOf(Command)
  })

  it('has the correct name', () => {
    const program = createProgram()

    expect(program.name()).toBe('local-skills')
  })

  it('has a description', () => {
    const program = createProgram()

    expect(program.description()).toBeTruthy()
  })

  describe('add command', () => {
    it('accepts a specifier argument', () => {
      const program = createProgram()
      const addCmd = program.commands.find((c: Command) => c.name() === 'add')

      expect(addCmd).toBeDefined()
      expect(addCmd?.registeredArguments).toHaveLength(1)
      expect(addCmd?.registeredArguments[0].name()).toBe('specifier')
    })
  })

  describe('update command', () => {
    it('exists and accepts a skill-name argument', () => {
      const program = createProgram()
      const updateCmd = program.commands.find(
        (c: Command) => c.name() === 'update',
      )

      expect(updateCmd).toBeDefined()
      expect(updateCmd?.registeredArguments).toHaveLength(1)
      expect(updateCmd?.registeredArguments[0].name()).toBe('skill-name')
    })
  })

  describe('remove command', () => {
    it('exists and accepts a skill-name argument', () => {
      const program = createProgram()
      const removeCmd = program.commands.find(
        (c: Command) => c.name() === 'remove',
      )

      expect(removeCmd).toBeDefined()
      expect(removeCmd?.registeredArguments).toHaveLength(1)
      expect(removeCmd?.registeredArguments[0].name()).toBe('skill-name')
    })
  })
})

describe('CLI command actions', () => {
  let marketplaceRepo: string
  let projectDir: string
  const deps = createDefaultDeps()

  beforeAll(async () => {
    const tmpBase = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-cli-marketplace-'),
    )
    // The specifier parser splits URLs on ".git/" so the repo path must end with .git
    marketplaceRepo = path.join(tmpBase, 'repo.git')
    await fs.mkdir(marketplaceRepo, { recursive: true })
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
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# TDD Skill')

    execSync('git add -A', { cwd: marketplaceRepo })
    execSync('git commit -m "initial"', { cwd: marketplaceRepo })
  })

  afterAll(async () => {
    // Clean up the parent of repo.git
    await fs.rm(path.dirname(marketplaceRepo), {
      recursive: true,
      force: true,
    })
  })

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-cli-project-'),
    )
    await fs.mkdir(path.join(projectDir, '.claude'), { recursive: true })
    process.exitCode = undefined
  })

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  describe('add action', () => {
    it('adds a skill successfully', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'add',
        `superpowers@file://${marketplaceRepo}/tdd`,
      ])

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Added skill "tdd"'),
      )

      const skillContent = await fs.readFile(
        path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
        'utf-8',
      )
      expect(skillContent).toBe('# TDD Skill')
    })

    it('prints error for invalid specifier', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync(['node', 'local-skills', 'add', 'no-at-sign'])

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('INVALID_SPECIFIER'),
      )
      expect(process.exitCode).toBe(1)
    })

    it('prints error when add command fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'add',
        'superpowers@file:///nonexistent/repo.git/tdd',
      ])

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error ['))
      expect(process.exitCode).toBe(1)
    })
  })

  describe('update action', () => {
    it('has a --force option', () => {
      const program = createProgram()
      const updateCmd = program.commands.find(
        (c: Command) => c.name() === 'update',
      )

      expect(updateCmd).toBeDefined()
      const forceOpt = updateCmd?.options.find(
        (o: { long?: string }) => o.long === '--force',
      )
      expect(forceOpt).toBeDefined()
    })

    it('prints already-up-to-date message when no changes', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const setupProgram = createProgram({ deps, projectDir })
      await setupProgram.parseAsync([
        'node',
        'local-skills',
        'add',
        `superpowers@file://${marketplaceRepo}/tdd`,
      ])
      vi.restoreAllMocks()

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })
      await program.parseAsync(['node', 'local-skills', 'update', 'tdd'])

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('already up to date'),
      )
    })

    it('prints skipped-pinned message for SHA ref', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const setupProgram = createProgram({ deps, projectDir })
      await setupProgram.parseAsync([
        'node',
        'local-skills',
        'add',
        `superpowers@file://${marketplaceRepo}/tdd`,
      ])
      vi.restoreAllMocks()

      // Rewrite manifest with a SHA ref
      const manifestContent = await fs.readFile(
        path.join(projectDir, '.claude', 'local-skills.json'),
        'utf-8',
      )
      const manifest = ManifestSchema.parse(JSON.parse(manifestContent))
      const sha = manifest.skills.tdd.sha
      await fs.writeFile(
        path.join(projectDir, '.claude', 'local-skills.json'),
        JSON.stringify({
          skills: {
            tdd: {
              source: manifest.skills.tdd.source,
              ref: sha,
              sha,
            },
          },
        }),
      )

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })
      await program.parseAsync(['node', 'local-skills', 'update', 'tdd'])

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('pinned'))
    })

    it('prints error when skill is not installed', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'update',
        'nonexistent',
      ])

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SKILL_NOT_INSTALLED'),
      )
      expect(process.exitCode).toBe(1)
    })
  })

  describe('remove action', () => {
    it('removes a skill successfully', async () => {
      // First install the skill (suppress output)
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const setupProgram = createProgram({ deps, projectDir })
      await setupProgram.parseAsync([
        'node',
        'local-skills',
        'add',
        `superpowers@file://${marketplaceRepo}/tdd`,
      ])
      vi.restoreAllMocks()

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })
      await program.parseAsync(['node', 'local-skills', 'remove', 'tdd'])

      expect(logSpy).toHaveBeenCalledWith('Removed skill "tdd"')

      // Verify skill directory was removed
      const manifestContent = await fs.readFile(
        path.join(projectDir, '.claude', 'local-skills.json'),
        'utf-8',
      )
      const manifest = ManifestSchema.parse(JSON.parse(manifestContent))
      expect(manifest.skills).toEqual({})
    })

    it('prints error when skill is not installed', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'remove',
        'nonexistent',
      ])

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SKILL_NOT_INSTALLED'),
      )
      expect(process.exitCode).toBe(1)
    })
  })
})
