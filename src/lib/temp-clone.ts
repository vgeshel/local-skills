import { errAsync, type ResultAsync } from 'neverthrow'
import * as path from 'node:path'

import type { LocalSkillsError } from './errors.js'
import { cloneRepo } from './git.js'
import type { Deps } from './types.js'

/**
 * Clone a repo into a temp directory, run an operation, and clean up.
 * Cleanup runs on both success and error paths.
 */
export function withTempClone<T>(
  deps: Deps,
  url: string,
  ref: string | undefined,
  operation: (cloneDir: string) => ResultAsync<T, LocalSkillsError>,
): ResultAsync<T, LocalSkillsError> {
  const tmpResult = deps.tmpdir()

  if (tmpResult.isErr()) {
    return errAsync(tmpResult.error)
  }

  const tmpBase = tmpResult.value
  const cloneDir = path.join(tmpBase, `local-skills-clone-${Date.now()}`)

  return cloneRepo(deps, url, cloneDir, ref)
    .andThen(() => operation(cloneDir))
    .andThen((result) => deps.rm(cloneDir).map(() => result))
    .orElse((error) =>
      deps
        .rm(cloneDir)
        .andThen(() => errAsync(error))
        .orElse(() => errAsync(error)),
    )
}
