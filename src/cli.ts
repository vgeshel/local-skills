import { Command } from 'commander'

import { add, sourceLabel } from './commands/add.js'
import { remove } from './commands/remove.js'
import { update } from './commands/update.js'
import type { LocalSkillsError } from './lib/errors.js'
import { createDefaultDeps } from './lib/fs-ops.js'
import { parseSpecifier } from './lib/specifier.js'
import type { Deps } from './lib/types.js'

export interface ProgramOptions {
  readonly deps?: Deps
  readonly projectDir?: string
}

export function formatError(error: LocalSkillsError): string {
  return `Error [${error.code}]: ${error.message}`
}

export function createProgram(options?: ProgramOptions): Command {
  const deps = options?.deps ?? createDefaultDeps()
  const projectDir = options?.projectDir ?? process.cwd()

  const program = new Command()
  program
    .name('local-skills')
    .description(
      'Extract skills from Claude Code plugin marketplaces into your project',
    )

  program
    .command('add')
    .description('Add a skill from a marketplace')
    .argument('<specifier>', 'plugin@marketplace/skill[:version]')
    .action(async (specifier: string) => {
      const parsed = parseSpecifier(specifier)

      if (parsed.isErr()) {
        console.error(formatError(parsed.error))
        process.exitCode = 1
        return
      }

      const result = await add(deps, projectDir, parsed.value)

      if (result.isErr()) {
        console.error(formatError(result.error))
        process.exitCode = 1
        return
      }

      const source = sourceLabel(parsed.value)
      console.log(`Added skill "${parsed.value.skill}" from ${source}`)
    })

  program
    .command('update')
    .description('Update an installed skill to the latest version')
    .argument('<skill-name>', 'Name of the skill to update')
    .action(async (skillName: string) => {
      const result = await update(deps, projectDir, skillName)

      if (result.isErr()) {
        console.error(formatError(result.error))
        process.exitCode = 1
        return
      }

      console.log(`Updated skill "${skillName}"`)
    })

  program
    .command('remove')
    .description('Remove an installed skill')
    .argument('<skill-name>', 'Name of the skill to remove')
    .action(async (skillName: string) => {
      const result = await remove(deps, projectDir, skillName)

      if (result.isErr()) {
        console.error(formatError(result.error))
        process.exitCode = 1
        return
      }

      console.log(`Removed skill "${skillName}"`)
    })

  return program
}
