import { err, ok, type Result, type ResultAsync } from 'neverthrow'

import { localSkillsError, type LocalSkillsError } from './errors.js'
import { errorMessage } from './fs-ops.js'
import { ManifestSchema } from './schemas.js'
import type { Deps, Manifest, ManifestSkillEntry } from './types.js'

export function readManifest(
  deps: Deps,
  filePath: string,
): ResultAsync<Manifest, LocalSkillsError> {
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
            `Invalid JSON in manifest "${filePath}": ${errorMessage(e)}`,
            e,
          ),
        )
      }
      const result = ManifestSchema.safeParse(parsed)
      if (!result.success) {
        return err(
          localSkillsError(
            'MARKETPLACE_PARSE_ERROR',
            `Invalid manifest schema in "${filePath}"`,
            result.error,
          ),
        )
      }
      return ok(result.data)
    })
    .orElse((error) => {
      // File not found → empty manifest
      if (error.code === 'FS_ERROR') {
        return ok({ skills: {} })
      }
      return err(error)
    })
}

export function writeManifest(
  deps: Deps,
  filePath: string,
  manifest: Manifest,
): ResultAsync<void, LocalSkillsError> {
  const content = JSON.stringify(manifest, null, 2) + '\n'
  return deps.writeFile(filePath, content)
}

export function addSkillToManifest(
  manifest: Manifest,
  skillName: string,
  entry: ManifestSkillEntry,
): Result<Manifest, LocalSkillsError> {
  if (skillName in manifest.skills) {
    return err(
      localSkillsError(
        'SKILL_ALREADY_EXISTS',
        `Skill "${skillName}" is already installed`,
      ),
    )
  }
  return ok({
    skills: { ...manifest.skills, [skillName]: entry },
  })
}

export function removeSkillFromManifest(
  manifest: Manifest,
  skillName: string,
): Result<Manifest, LocalSkillsError> {
  if (!(skillName in manifest.skills)) {
    return err(
      localSkillsError(
        'SKILL_NOT_INSTALLED',
        `Skill "${skillName}" is not installed`,
      ),
    )
  }
  const updated = Object.fromEntries(
    Object.entries(manifest.skills).filter(([key]) => key !== skillName),
  )
  return ok({ skills: updated })
}
