import { Command } from 'commander'
import { bold, dim, green } from 'yoctocolors'

import { add, marketplaceUrl, sourceLabel } from './commands/add.js'
import { info, type InfoQuery } from './commands/info.js'
import { ls, type LsQuery } from './commands/ls.js'
import { remove } from './commands/remove.js'
import { update } from './commands/update.js'
import type { LocalSkillsError } from './lib/errors.js'
import { createDefaultDeps } from './lib/fs-ops.js'
import { parseMarketplaceRef, parseSpecifier } from './lib/specifier.js'
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
    .argument('<specifier>', 'plugin@marketplace[:version]:skill')
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
      const skillLabel =
        parsed.value.skill === '*'
          ? 'all skills'
          : `skill "${parsed.value.skill}"`
      console.log(`Added ${skillLabel} from ${source}`)
    })

  program
    .command('update')
    .description('Update an installed skill to the latest version')
    .argument('<skill-name>', 'Name of the skill to update')
    .option('-f, --force', 'Overwrite locally modified skill files')
    .action(async (skillName: string, opts: { force?: boolean }) => {
      const result = await update(deps, projectDir, skillName, {
        force: opts.force,
      })

      if (result.isErr()) {
        console.error(formatError(result.error))
        process.exitCode = 1
        return
      }

      switch (result.value.status) {
        case 'updated':
          console.log(
            `Updated skill "${skillName}" (${result.value.oldSha.slice(0, 7)} → ${result.value.newSha.slice(0, 7)})`,
          )
          break
        case 'already-up-to-date':
          console.log(`Skill "${skillName}" is already up to date`)
          break
        case 'skipped-pinned':
          console.log(
            `Skill "${skillName}" is pinned to a specific commit, skipping update`,
          )
          break
      }
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

  program
    .command('ls')
    .description('List skills (installed or from a marketplace)')
    .argument('[source]', 'marketplace or plugin@marketplace[:version]')
    .option('-l, --long', 'Show descriptions from SKILL.md front matter')
    .option('--installed', 'Show only installed skills')
    .option('--not-installed', 'Show only non-installed skills')
    .action(
      async (
        source: string | undefined,
        opts: { long?: boolean; installed?: boolean; notInstalled?: boolean },
      ) => {
        if (opts.installed && opts.notInstalled) {
          console.error(
            'Error: --installed and --not-installed are mutually exclusive',
          )
          process.exitCode = 1
          return
        }

        const filter = opts.installed
          ? ('installed' as const)
          : opts.notInstalled
            ? ('not-installed' as const)
            : undefined

        let query: LsQuery

        if (source === undefined) {
          query = { type: 'installed' }
        } else if (source.includes('@')) {
          const parsed = parseSpecifier(source)
          if (parsed.isErr()) {
            console.error(formatError(parsed.error))
            process.exitCode = 1
            return
          }
          query = {
            type: 'remote-plugin',
            pluginName: parsed.value.plugin,
            marketplaceUrl: marketplaceUrl(parsed.value),
            ref: parsed.value.ref,
          }
        } else {
          const parsed = parseMarketplaceRef(source)
          if (parsed.isErr()) {
            console.error(formatError(parsed.error))
            process.exitCode = 1
            return
          }
          const mkt = parsed.value.marketplace
          const url =
            mkt.type === 'github'
              ? `https://github.com/${mkt.owner}/${mkt.repo}.git`
              : mkt.url
          query = {
            type: 'remote-marketplace',
            marketplaceUrl: url,
            ref: parsed.value.ref,
          }
        }

        const result = await ls(deps, projectDir, query, {
          long: opts.long,
          filter,
        })

        if (result.isErr()) {
          console.error(formatError(result.error))
          process.exitCode = 1
          return
        }

        if (result.value.length === 0) {
          console.log('No skills found')
          return
        }

        for (const entry of result.value) {
          const specifier = `${dim(`${entry.source}:`)}${bold(entry.name)}`
          console.log(
            entry.installed ? `${specifier} ${green('*')}` : specifier,
          )
          if (opts.long && entry.description) {
            console.log(`  ${dim(entry.description)}`)
          }
        }
      },
    )

  program
    .command('info')
    .description('Show details about a skill')
    .argument(
      '<skill>',
      'skill name (installed) or plugin@marketplace[:version]:skill (remote)',
    )
    .action(async (skillArg: string) => {
      let query: InfoQuery

      if (skillArg.includes('@')) {
        const parsed = parseSpecifier(skillArg)
        if (parsed.isErr()) {
          console.error(formatError(parsed.error))
          process.exitCode = 1
          return
        }
        if (parsed.value.skill === undefined) {
          console.error('Error: skill name is required for info')
          process.exitCode = 1
          return
        }
        query = {
          type: 'remote',
          pluginName: parsed.value.plugin,
          marketplaceUrl: marketplaceUrl(parsed.value),
          skillName: parsed.value.skill,
          ref: parsed.value.ref,
        }
      } else {
        query = { type: 'installed', skillName: skillArg }
      }

      const result = await info(deps, projectDir, query)

      if (result.isErr()) {
        console.error(formatError(result.error))
        process.exitCode = 1
        return
      }

      console.log(`${dim('Skill:')} ${bold(result.value.name)}`)
      if (result.value.installedSha) {
        console.log(
          `${dim('Installed:')} ${green('yes')} ${dim(`(${result.value.installedSha.slice(0, 7)})`)}`,
        )
      }
      if (result.value.source)
        console.log(`${dim('Source:')} ${result.value.source}`)
      if (result.value.ref) console.log(`${dim('Ref:')} ${result.value.ref}`)
      if (result.value.sha) console.log(`${dim('SHA:')} ${result.value.sha}`)

      const fm = result.value.frontMatter
      if (Object.keys(fm).length > 0) {
        for (const [key, value] of Object.entries(fm)) {
          console.log(`${dim(`${key}:`)} ${String(value)}`)
        }
      }
    })

  return program
}
