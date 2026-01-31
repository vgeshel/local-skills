import type { ResultAsync } from 'neverthrow'
import * as path from 'node:path'

import type { LocalSkillsError } from '../lib/errors.js'
import {
  readManifest,
  removeSkillFromManifest,
  writeManifest,
} from '../lib/manifest.js'
import type { Deps } from '../lib/types.js'

export function remove(
  deps: Deps,
  projectDir: string,
  skillName: string,
): ResultAsync<void, LocalSkillsError> {
  const claudeDir = path.join(projectDir, '.claude')
  const manifestPath = path.join(claudeDir, 'local-skills.json')
  const skillDir = path.join(claudeDir, 'skills', skillName)

  return readManifest(deps, manifestPath)
    .andThen((manifest) => removeSkillFromManifest(manifest, skillName))
    .andThen((updated) =>
      deps
        .rm(skillDir)
        .andThen(() => writeManifest(deps, manifestPath, updated)),
    )
}
