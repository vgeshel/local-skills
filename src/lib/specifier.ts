import { err, ok, type Result } from 'neverthrow'

import { localSkillsError, type LocalSkillsError } from './errors.js'
import type { ParsedSpecifier } from './types.js'

export function parseSpecifier(
  input: string,
): Result<ParsedSpecifier, LocalSkillsError> {
  const atIndex = input.indexOf('@')
  if (atIndex <= 0) {
    return err(
      localSkillsError(
        'INVALID_SPECIFIER',
        `Invalid specifier "${input}": must contain "@" with a plugin name before it`,
      ),
    )
  }

  const plugin = input.slice(0, atIndex)
  const right = input.slice(atIndex + 1)

  // Split off optional version from the end (last colon)
  // But be careful: URLs contain "://" — only split on the last ":"
  // that's not part of "://"
  const { remainder, ref } = splitVersion(right)

  // Detect URL vs GitHub shorthand
  if (remainder.includes('://')) {
    return parseUrlSpecifier(plugin, remainder, ref)
  }

  return parseGitHubSpecifier(plugin, remainder, ref)
}

function splitVersion(right: string): {
  remainder: string
  ref: string | undefined
} {
  // Find the last colon. If the text before it ends with "http" or "https"
  // (i.e. it's a protocol separator), skip it.
  const lastColon = right.lastIndexOf(':')
  if (lastColon === -1) {
    return { remainder: right, ref: undefined }
  }

  // Check if this colon is part of "://"
  if (right[lastColon + 1] === '/' && right[lastColon + 2] === '/') {
    return { remainder: right, ref: undefined }
  }

  const beforeColon = right.slice(0, lastColon)
  const afterColon = right.slice(lastColon + 1)

  if (afterColon.length === 0) {
    return { remainder: beforeColon, ref: undefined }
  }

  return { remainder: beforeColon, ref: afterColon }
}

function parseUrlSpecifier(
  plugin: string,
  remainder: string,
  ref: string | undefined,
): Result<ParsedSpecifier, LocalSkillsError> {
  // Split on ".git/" to find the URL and skill
  const gitSeparator = '.git/'
  const gitIndex = remainder.indexOf(gitSeparator)

  if (gitIndex === -1) {
    return err(
      localSkillsError(
        'INVALID_SPECIFIER',
        `Invalid URL specifier: must contain ".git/" to separate repository URL from skill name`,
      ),
    )
  }

  const url = remainder.slice(0, gitIndex + '.git'.length)
  const skill = remainder.slice(gitIndex + gitSeparator.length)

  if (skill.length === 0) {
    return err(
      localSkillsError(
        'INVALID_SPECIFIER',
        `Invalid URL specifier: skill name is empty after ".git/"`,
      ),
    )
  }

  return ok({
    plugin,
    marketplace: { type: 'url', url },
    skill,
    ref,
  })
}

function parseGitHubSpecifier(
  plugin: string,
  remainder: string,
  ref: string | undefined,
): Result<ParsedSpecifier, LocalSkillsError> {
  // GitHub shorthand: owner/repo/skill
  const segments = remainder.split('/')

  if (segments.length < 3) {
    return err(
      localSkillsError(
        'INVALID_SPECIFIER',
        `Invalid GitHub specifier "${remainder}": expected owner/repo/skill`,
      ),
    )
  }

  const owner = segments[0]
  const repo = segments[1]
  const skill = segments.slice(2).join('/')

  return ok({
    plugin,
    marketplace: { type: 'github', owner, repo },
    skill,
    ref,
  })
}
