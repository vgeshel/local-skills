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

  describe('ls command', () => {
    it('exists and accepts an optional source argument', () => {
      const program = createProgram()
      const lsCmd = program.commands.find((c: Command) => c.name() === 'ls')

      expect(lsCmd).toBeDefined()
      expect(lsCmd?.registeredArguments).toHaveLength(1)
      expect(lsCmd?.registeredArguments[0].name()).toBe('source')
      expect(lsCmd?.registeredArguments[0].required).toBe(false)
    })
  })

  describe('info command', () => {
    it('exists and accepts a required skill argument', () => {
      const program = createProgram()
      const infoCmd = program.commands.find((c: Command) => c.name() === 'info')

      expect(infoCmd).toBeDefined()
      expect(infoCmd?.registeredArguments).toHaveLength(1)
      expect(infoCmd?.registeredArguments[0].name()).toBe('skill')
      expect(infoCmd?.registeredArguments[0].required).toBe(true)
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
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\nname: tdd\ndescription: Test-driven development\n---\n\n# TDD Skill',
    )

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
        `superpowers@file://${marketplaceRepo}:tdd`,
      ])

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Added skill "tdd"'),
      )

      const skillContent = await fs.readFile(
        path.join(projectDir, '.claude', 'skills', 'tdd', 'SKILL.md'),
        'utf-8',
      )
      expect(skillContent).toBe(
        '---\nname: tdd\ndescription: Test-driven development\n---\n\n# TDD Skill',
      )
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
        'superpowers@file:///nonexistent/repo.git:tdd',
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
        `superpowers@file://${marketplaceRepo}:tdd`,
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
        `superpowers@file://${marketplaceRepo}:tdd`,
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
        `superpowers@file://${marketplaceRepo}:tdd`,
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

  describe('ls action', () => {
    it('prints "No skills found" when no skills are installed', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync(['node', 'local-skills', 'ls'])

      expect(logSpy).toHaveBeenCalledWith('No skills found')
    })

    it('lists installed skills in specifier format', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const setupProgram = createProgram({ deps, projectDir })
      await setupProgram.parseAsync([
        'node',
        'local-skills',
        'add',
        `superpowers@file://${marketplaceRepo}:tdd`,
      ])
      vi.restoreAllMocks()

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })
      await program.parseAsync(['node', 'local-skills', 'ls'])

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/superpowers@.+:tdd \*$/),
      )
    })

    it('shows description with -l flag', async () => {
      // Manually create skill with description in front matter
      const skillDir = path.join(projectDir, '.claude', 'skills', 'my-skill')
      await fs.mkdir(skillDir, { recursive: true })
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\ndescription: A great skill\n---\n# My Skill',
      )
      await fs.writeFile(
        path.join(projectDir, '.claude', 'local-skills.json'),
        JSON.stringify({
          skills: {
            'my-skill': { source: 'p@test', ref: 'HEAD', sha: 'abc' },
          },
        }),
      )

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })
      await program.parseAsync(['node', 'local-skills', 'ls', '-l'])

      expect(logSpy).toHaveBeenCalledWith('p@test:my-skill *')
      expect(logSpy).toHaveBeenCalledWith('  A great skill')
    })

    it('shows asterisk for installed skills in remote listing', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const setupProgram = createProgram({ deps, projectDir })
      await setupProgram.parseAsync([
        'node',
        'local-skills',
        'add',
        `superpowers@file://${marketplaceRepo}:tdd`,
      ])
      vi.restoreAllMocks()

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })
      await program.parseAsync([
        'node',
        'local-skills',
        'ls',
        `file://${marketplaceRepo}`,
      ])

      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/tdd \*$/))
    })

    it('lists remote marketplace skills', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'ls',
        `file://${marketplaceRepo}`,
      ])

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('tdd'))
    })

    it('lists remote plugin skills with @ syntax', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'ls',
        `superpowers@file://${marketplaceRepo}`,
      ])

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('tdd'))
    })

    it('prints error for invalid specifier with @', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync(['node', 'local-skills', 'ls', '@'])

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('INVALID_SPECIFIER'),
      )
      expect(process.exitCode).toBe(1)
    })

    it('prints error for invalid marketplace reference', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync(['node', 'local-skills', 'ls', 'not-valid'])

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('INVALID_SPECIFIER'),
      )
      expect(process.exitCode).toBe(1)
    })

    it('prints error when remote ls fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'ls',
        `superpowers@file:///nonexistent/repo.git`,
      ])

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error ['))
      expect(process.exitCode).toBe(1)
    })

    it('prints error for GitHub shorthand marketplace that does not exist', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'ls',
        'nonexistent-owner/nonexistent-repo',
      ])

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error ['))
      expect(process.exitCode).toBe(1)
    })
  })

  describe('info action', () => {
    it('shows info for an installed skill', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const setupProgram = createProgram({ deps, projectDir })
      await setupProgram.parseAsync([
        'node',
        'local-skills',
        'add',
        `superpowers@file://${marketplaceRepo}:tdd`,
      ])
      vi.restoreAllMocks()

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })
      await program.parseAsync(['node', 'local-skills', 'info', 'tdd'])

      expect(logSpy).toHaveBeenCalledWith('Skill: tdd')
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^Installed: yes \([0-9a-f]{7}\)$/),
      )
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Source: superpowers@'),
      )
    })

    it('shows installed status with SHA for remote info of installed skill', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const setupProgram = createProgram({ deps, projectDir })
      await setupProgram.parseAsync([
        'node',
        'local-skills',
        'add',
        `superpowers@file://${marketplaceRepo}:tdd`,
      ])
      vi.restoreAllMocks()

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })
      await program.parseAsync([
        'node',
        'local-skills',
        'info',
        `superpowers@file://${marketplaceRepo}:tdd`,
      ])

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^Installed: yes \([0-9a-f]{7}\)$/),
      )
    })

    it('does not show installed line for remote info of non-installed skill', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })
      await program.parseAsync([
        'node',
        'local-skills',
        'info',
        `superpowers@file://${marketplaceRepo}:tdd`,
      ])

      const calls = logSpy.mock.calls.map((c) => c[0])
      expect(calls).not.toContain(expect.stringContaining('Installed'))
    })

    it('displays front matter from SKILL.md', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const setupProgram = createProgram({ deps, projectDir })
      await setupProgram.parseAsync([
        'node',
        'local-skills',
        'add',
        `superpowers@file://${marketplaceRepo}:tdd`,
      ])
      vi.restoreAllMocks()

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })
      await program.parseAsync(['node', 'local-skills', 'info', 'tdd'])

      expect(logSpy).toHaveBeenCalledWith(
        'description: Test-driven development',
      )
    })

    it('shows error for nonexistent installed skill', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync(['node', 'local-skills', 'info', 'nonexistent'])

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('SKILL_NOT_INSTALLED'),
      )
      expect(process.exitCode).toBe(1)
    })

    it('shows info for a remote skill with @ syntax', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'info',
        `superpowers@file://${marketplaceRepo}:tdd`,
      ])

      expect(logSpy).toHaveBeenCalledWith('Skill: tdd')
    })

    it('prints error for invalid specifier', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync(['node', 'local-skills', 'info', '@'])

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('INVALID_SPECIFIER'),
      )
      expect(process.exitCode).toBe(1)
    })

    it('prints error when skill name is missing from specifier', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'info',
        `superpowers@file://${marketplaceRepo}`,
      ])

      expect(errorSpy).toHaveBeenCalledWith(
        'Error: skill name is required for info',
      )
      expect(process.exitCode).toBe(1)
    })

    it('prints error when remote info fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const program = createProgram({ deps, projectDir })

      await program.parseAsync([
        'node',
        'local-skills',
        'info',
        `superpowers@file:///nonexistent/repo.git:tdd`,
      ])

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error ['))
      expect(process.exitCode).toBe(1)
    })
  })
})
