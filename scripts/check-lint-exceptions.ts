#!/usr/bin/env bun

/**
 * Lint exception detection for pre-commit hooks
 *
 * Detects ESLint and TypeScript exception comments in staged changes
 * that bypass linting guardrails.
 *
 * Usage:
 *   bun scripts/check-lint-exceptions.ts [--tree]
 *
 * Options:
 *   --tree    Check entire file tree instead of staged changes
 */

import { logger } from '@/lib/logger'
import { Command } from 'commander'

/**
 * Represents a lint exception violation found in the diff or file
 */
export interface LintViolation {
  type: 'eslint' | 'typescript'
  pattern: string
  line: string
  lineNumber: number
  file?: string
}

/**
 * Patterns that bypass linting guardrails
 */
const ESLINT_PATTERNS = [
  'eslint-disable-next-line',
  'eslint-disable-line',
  'eslint-disable',
] as const

const TYPESCRIPT_PATTERNS = [
  '@ts-ignore',
  '@ts-nocheck',
  '@ts-expect-error',
] as const

/**
 * Patterns to identify files that should be excluded from the check
 */
const EXCLUDED_FILE_PATTERNS = [
  /check-lint-exceptions\.ts$/,
  /check-lint-exceptions\.test\.ts$/,
  /src\/server\/db\.ts$/, // JSONB parse helpers are the only allowed eslint-disable
  /\.md$/, // Documentation files may reference these patterns
] as const

function isExcludedFile(filePath: string): boolean {
  return EXCLUDED_FILE_PATTERNS.some((pattern) => pattern.test(filePath))
}

export function detectLintExceptions(diff: string): LintViolation[] {
  if (!diff) {
    return []
  }

  const violations: LintViolation[] = []
  const lines = diff.split('\n')
  let currentFile = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('diff --git')) {
      const match = /diff --git a\/(.+) b\//.exec(line)
      currentFile = match ? match[1] : ''
      continue
    }

    if (isExcludedFile(currentFile)) {
      continue
    }

    if (!line.startsWith('+') || line.startsWith('+++')) {
      continue
    }

    const content = line.slice(1)

    for (const pattern of ESLINT_PATTERNS) {
      const regex = new RegExp(`\\b${escapeRegex(pattern)}\\b`)
      if (regex.test(content)) {
        violations.push({
          type: 'eslint',
          pattern,
          line: content,
          lineNumber: i + 1,
        })
        break
      }
    }

    for (const pattern of TYPESCRIPT_PATTERNS) {
      if (content.includes(pattern)) {
        violations.push({
          type: 'typescript',
          pattern,
          line: content,
          lineNumber: i + 1,
        })
        break
      }
    }
  }

  return violations
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function checkFileContent(
  content: string,
  filePath: string,
): LintViolation[] {
  if (isExcludedFile(filePath)) {
    return []
  }

  const violations: LintViolation[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    for (const pattern of ESLINT_PATTERNS) {
      const regex = new RegExp(`\\b${escapeRegex(pattern)}\\b`)
      if (regex.test(line)) {
        violations.push({
          type: 'eslint',
          pattern,
          line,
          lineNumber: i + 1,
          file: filePath,
        })
        break
      }
    }

    for (const pattern of TYPESCRIPT_PATTERNS) {
      if (line.includes(pattern)) {
        violations.push({
          type: 'typescript',
          pattern,
          line,
          lineNumber: i + 1,
          file: filePath,
        })
        break
      }
    }
  }

  return violations
}

const CHECKABLE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const SKIP_DIRECTORIES = ['node_modules', '.git', 'dist', 'build', 'coverage']

export interface FileSystemOps {
  readdir: (path: string) => string[]
  stat: (path: string) => { isDirectory: boolean; isFile: boolean }
  readFile: (path: string) => string
}

export function walkTree(dir: string, fs: FileSystemOps): LintViolation[] {
  const violations: LintViolation[] = []
  const entries = fs.readdir(dir)

  for (const entry of entries) {
    const fullPath = dir === '.' ? entry : `${dir}/${entry}`

    if (entry.startsWith('.')) continue
    if (SKIP_DIRECTORIES.includes(entry)) continue

    const stat = fs.stat(fullPath)

    if (stat.isDirectory) {
      violations.push(...walkTree(fullPath, fs))
    } else if (stat.isFile) {
      const hasCheckableExtension = CHECKABLE_EXTENSIONS.some((ext) =>
        fullPath.endsWith(ext),
      )
      if (hasCheckableExtension) {
        const content = fs.readFile(fullPath)
        violations.push(...checkFileContent(content, fullPath))
      }
    }
  }

  return violations
}

export function formatViolationReport(violations: LintViolation[]): string {
  if (violations.length === 0) {
    return ''
  }

  const eslintViolations = violations.filter((v) => v.type === 'eslint')
  const tsViolations = violations.filter((v) => v.type === 'typescript')

  const lines: string[] = [
    '',
    '==========================================',
    '  COMMIT BLOCKED: Lint Exceptions Found',
    '==========================================',
    '',
    'Your commit contains code comments that bypass linting guardrails.',
    'These are not allowed as they undermine code quality checks.',
    '',
  ]

  if (eslintViolations.length > 0) {
    lines.push('ESLint exceptions found:')
    for (const v of eslintViolations.slice(0, 20)) {
      const location = v.file
        ? `${v.file}:${v.lineNumber}`
        : String(v.lineNumber)
      lines.push(`  ${location}: ${v.line}`)
    }
    lines.push('')
  }

  if (tsViolations.length > 0) {
    lines.push('TypeScript exceptions found:')
    for (const v of tsViolations.slice(0, 20)) {
      const location = v.file
        ? `${v.file}:${v.lineNumber}`
        : String(v.lineNumber)
      lines.push(`  ${location}: ${v.line}`)
    }
    lines.push('')
  }

  lines.push(
    'Please fix the underlying issues instead of disabling the checks.',
  )
  lines.push('')
  lines.push('Blocked patterns:')
  lines.push(
    '  - eslint-disable, eslint-disable-next-line, eslint-disable-line',
  )
  lines.push('  - @ts-ignore, @ts-nocheck, @ts-expect-error')
  lines.push('')

  return lines.join('\n')
}

export async function main(
  args: string[] = [],
  testFs?: FileSystemOps,
): Promise<number> {
  const program = new Command()
  program
    .name('check-lint-exceptions')
    .description('Detect ESLint and TypeScript exception comments in code')
    .option('--tree', 'Check entire file tree instead of staged changes', false)

  program.parse(args, { from: 'user' })
  const options = program.opts<{ tree: boolean }>()

  const treeMode = options.tree

  if (treeMode) {
    let fs: FileSystemOps

    if (testFs) {
      fs = testFs
    } else {
      const { readdirSync, readFileSync, statSync } = await import('node:fs')
      fs = {
        readdir: (path) => readdirSync(path, { encoding: 'utf-8' }),
        stat: (path) => {
          const s = statSync(path)
          return { isDirectory: s.isDirectory(), isFile: s.isFile() }
        },
        readFile: (path) => readFileSync(path, 'utf-8'),
      }
    }

    const violations = walkTree('.', fs)

    if (violations.length > 0) {
      logger.error(
        { report: formatViolationReport(violations) },
        'Lint exceptions found',
      )
      return 1
    }

    return 0
  }

  // Default: check staged changes
  const { execSync } = await import('node:child_process')

  let diff: string
  try {
    diff = execSync('git diff --cached --diff-filter=ACMR', {
      encoding: 'utf-8',
    })
  } catch {
    return 0
  }

  const violations = detectLintExceptions(diff)

  if (violations.length > 0) {
    logger.error(
      { report: formatViolationReport(violations) },
      'Lint exceptions found',
    )
    return 1
  }

  return 0
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      logger.error({ err }, 'Failed to check lint exceptions')
      process.exit(1)
    })
}
