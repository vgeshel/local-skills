import { err, ok, type Result } from 'neverthrow'

import { localSkillsError, type LocalSkillsError } from './errors.js'
import type { ParsedSpecifier } from './types.js'

/**
 * Parse a specifier: plugin@marketplace[:version]:skill
 *
 * The marketplace part can be:
 * - GitHub shorthand: owner/repo
 * - Full URL: https://... or file://...
 * - Local absolute path: /path/to/dir
 *
 * After the marketplace, colons separate optional version and skill:
 * - plugin@marketplace → no version, no skill (partial)
 * - plugin@marketplace:skill → no version, has skill
 * - plugin@marketplace:version:skill → has version, has skill
 *
 * For URLs containing "://", the marketplace boundary is detected by
 * finding the first ":" that is NOT part of "://".
 */
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

  return parseRight(plugin, right)
}

/**
 * Parse a marketplace-only reference (no @ prefix, no plugin name).
 * Used by `ls` when the argument has no `@`.
 *
 * Format: marketplace[:version]
 */
export function parseMarketplaceRef(
  input: string,
): Result<
  { marketplace: ParsedSpecifier['marketplace']; ref: string | undefined },
  LocalSkillsError
> {
  if (input.length === 0) {
    return err(
      localSkillsError('INVALID_SPECIFIER', 'Empty marketplace reference'),
    )
  }

  const { marketplace, colonSegments } = splitMarketplaceAndColons(input)

  const marketplaceRef = classifyMarketplace(marketplace)
  if (marketplaceRef.isErr()) {
    return err(marketplaceRef.error)
  }

  // For marketplace-only: 0 segments = no version, 1 segment = version
  if (colonSegments.length === 0) {
    return ok({ marketplace: marketplaceRef.value, ref: undefined })
  }
  if (colonSegments.length === 1) {
    const ref = colonSegments[0].length > 0 ? colonSegments[0] : undefined
    return ok({ marketplace: marketplaceRef.value, ref })
  }

  return err(
    localSkillsError(
      'INVALID_SPECIFIER',
      `Too many ":" segments in marketplace reference "${input}"`,
    ),
  )
}

function parseRight(
  plugin: string,
  right: string,
): Result<ParsedSpecifier, LocalSkillsError> {
  if (right.length === 0) {
    return err(
      localSkillsError(
        'INVALID_SPECIFIER',
        `Invalid specifier: empty marketplace after "@"`,
      ),
    )
  }

  const { marketplace, colonSegments } = splitMarketplaceAndColons(right)

  const marketplaceRef = classifyMarketplace(marketplace)
  if (marketplaceRef.isErr()) {
    return err(marketplaceRef.error)
  }

  // 0 colon segments: plugin@marketplace (partial, no skill, no version)
  if (colonSegments.length === 0) {
    return ok({
      plugin,
      marketplace: marketplaceRef.value,
      skill: undefined,
      ref: undefined,
    })
  }

  // 1 colon segment: plugin@marketplace:X
  // If X looks like a version/ref (e.g. v2.0, a hex SHA), treat as ref with no skill.
  // Otherwise treat as skill with no ref.
  if (colonSegments.length === 1) {
    const segment = colonSegments[0]
    if (segment.length === 0) {
      return ok({
        plugin,
        marketplace: marketplaceRef.value,
        skill: undefined,
        ref: undefined,
      })
    }
    if (looksLikeRef(segment)) {
      return ok({
        plugin,
        marketplace: marketplaceRef.value,
        skill: undefined,
        ref: segment,
      })
    }
    return ok({
      plugin,
      marketplace: marketplaceRef.value,
      skill: segment,
      ref: undefined,
    })
  }

  // 2 colon segments: plugin@marketplace:version:skill
  if (colonSegments.length === 2) {
    const ref = colonSegments[0].length > 0 ? colonSegments[0] : undefined
    const skill = colonSegments[1].length > 0 ? colonSegments[1] : undefined
    return ok({
      plugin,
      marketplace: marketplaceRef.value,
      skill,
      ref,
    })
  }

  return err(
    localSkillsError('INVALID_SPECIFIER', `Too many ":" segments in specifier`),
  )
}

/**
 * Heuristic: does a string look like a git ref (version tag or SHA)?
 * - Starts with "v" followed by a digit (e.g. v2.0, v1.0.0-beta)
 * - Is a hex string of 7+ characters (abbreviated or full SHA)
 */
function looksLikeRef(segment: string): boolean {
  // Version tags: v1, v2.0, v1.0.0-rc1, etc.
  if (/^v\d/.test(segment)) {
    return true
  }
  // Hex SHA (abbreviated 7+ chars or full 40 chars)
  if (/^[0-9a-f]{7,40}$/.test(segment)) {
    return true
  }
  return false
}

/**
 * Split input into marketplace part + colon-separated segments after it.
 *
 * For URLs (contain "://"), the marketplace is everything up to the first ":"
 * that is NOT part of "://". For local paths (start with "/"), the marketplace
 * is everything up to the first ":". For GitHub shorthand, same rule.
 */
function splitMarketplaceAndColons(input: string): {
  marketplace: string
  colonSegments: string[]
} {
  // Find the protocol separator "://" if present
  const protocolIndex = input.indexOf('://')

  let searchFrom: number
  if (protocolIndex !== -1) {
    // Skip past "://" to find the next colon
    searchFrom = protocolIndex + 3
  } else {
    searchFrom = 0
  }

  const firstColonAfterMarketplace = input.indexOf(':', searchFrom)

  if (firstColonAfterMarketplace === -1) {
    return { marketplace: input, colonSegments: [] }
  }

  const marketplace = input.slice(0, firstColonAfterMarketplace)
  const rest = input.slice(firstColonAfterMarketplace + 1)

  if (rest.length === 0) {
    return { marketplace, colonSegments: [] }
  }

  return { marketplace, colonSegments: rest.split(':') }
}

/**
 * Classify marketplace string as GitHub shorthand or URL.
 */
function classifyMarketplace(
  marketplace: string,
): Result<ParsedSpecifier['marketplace'], LocalSkillsError> {
  // URLs: contain "://" or start with "/"
  if (marketplace.includes('://') || marketplace.startsWith('/')) {
    return ok({ type: 'url', url: marketplace })
  }

  // GitHub shorthand: owner/repo
  const segments = marketplace.split('/')
  if (segments.length < 2) {
    return err(
      localSkillsError(
        'INVALID_SPECIFIER',
        `Invalid GitHub shorthand "${marketplace}": expected owner/repo`,
      ),
    )
  }

  return ok({
    type: 'github',
    owner: segments[0],
    repo: segments.slice(1).join('/'),
  })
}
