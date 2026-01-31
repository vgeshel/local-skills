import type { ResultAsync } from 'neverthrow'

import { localSkillsError, type LocalSkillsError } from './errors.js'
import type { Deps } from './types.js'

const SHA_RE = /^[a-f0-9]{40}$/

export function isShaRef(ref: string): boolean {
  return SHA_RE.test(ref)
}

export function cloneRepo(
  deps: Deps,
  url: string,
  target: string,
  ref: string | undefined,
): ResultAsync<void, LocalSkillsError> {
  const args = ['clone', '--depth', '1']
  if (ref !== undefined) {
    args.push('--branch', ref)
  }
  args.push(url, target)

  return deps
    .exec('git', args)
    .map(() => undefined)
    .mapErr((e) =>
      localSkillsError(
        'CLONE_FAILED',
        `Failed to clone "${url}": ${e.message}`,
        e.cause,
      ),
    )
}

export function getHeadSha(
  deps: Deps,
  repoDir: string,
): ResultAsync<string, LocalSkillsError> {
  return deps
    .exec('git', ['rev-parse', 'HEAD'], { cwd: repoDir })
    .map((stdout) => stdout.trim())
}
