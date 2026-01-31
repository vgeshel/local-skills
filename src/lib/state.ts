import { err, ok, type ResultAsync } from 'neverthrow'

import { localSkillsError, type LocalSkillsError } from './errors.js'
import { errorMessage } from './fs-ops.js'
import { StateFileSchema } from './schemas.js'
import type { Deps, StateFile } from './types.js'

export function readState(
  deps: Deps,
  filePath: string,
): ResultAsync<StateFile, LocalSkillsError> {
  return deps
    .readFile(filePath)
    .andThen((content) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch (e) {
        return err(
          localSkillsError(
            'MARKETPLACE_PARSE_ERROR',
            `Invalid JSON in state file "${filePath}": ${errorMessage(e)}`,
            e,
          ),
        )
      }
      const result = StateFileSchema.safeParse(parsed)
      if (!result.success) {
        return err(
          localSkillsError(
            'MARKETPLACE_PARSE_ERROR',
            `Invalid state file schema in "${filePath}"`,
            result.error,
          ),
        )
      }
      return ok(result.data)
    })
    .orElse((error) => {
      if (error.code === 'FS_ERROR') {
        return ok({ skills: {} })
      }
      return err(error)
    })
}

export function writeState(
  deps: Deps,
  filePath: string,
  state: StateFile,
): ResultAsync<void, LocalSkillsError> {
  const content = JSON.stringify(state, null, 2) + '\n'
  return deps.writeFile(filePath, content)
}
