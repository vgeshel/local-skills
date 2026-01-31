import { createHash } from 'node:crypto'
import * as path from 'node:path'

import { okAsync, type ResultAsync } from 'neverthrow'

import type { LocalSkillsError } from './errors.js'
import type { Deps } from './types.js'

export function computeContentHash(
  deps: Deps,
  dirPath: string,
): ResultAsync<string, LocalSkillsError> {
  return deps
    .exec('find', [dirPath, '-type', 'f'], { cwd: dirPath })
    .map((stdout) =>
      stdout
        .trim()
        .split('\n')
        .filter((f) => f.length > 0)
        .map((f) => path.relative(dirPath, f))
        .sort(),
    )
    .andThen((relativePaths) => {
      const hash = createHash('sha256')

      let chain: ResultAsync<void, LocalSkillsError> = okAsync(undefined)

      for (const relPath of relativePaths) {
        const absPath = path.join(dirPath, relPath)
        chain = chain.andThen(() =>
          deps.readFile(absPath).map((content) => {
            hash.update(relPath + '\0' + content)
          }),
        )
      }

      return chain.map(() => hash.digest('hex'))
    })
}
