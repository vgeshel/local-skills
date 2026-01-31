export const ERROR_CODES = [
  'INVALID_SPECIFIER',
  'CLONE_FAILED',
  'MARKETPLACE_NOT_FOUND',
  'MARKETPLACE_PARSE_ERROR',
  'PLUGIN_NOT_FOUND',
  'SKILL_NOT_FOUND',
  'SKILL_ALREADY_EXISTS',
  'SKILL_NOT_INSTALLED',
  'FS_ERROR',
  'EXEC_ERROR',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export interface LocalSkillsError {
  readonly _tag: 'LocalSkillsError'
  readonly code: ErrorCode
  readonly message: string
  readonly cause?: unknown
}

export function localSkillsError(
  code: ErrorCode,
  message: string,
  cause?: unknown,
): LocalSkillsError {
  return { _tag: 'LocalSkillsError', code, message, cause }
}

export function isLocalSkillsError(value: unknown): value is LocalSkillsError {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('_tag' in value)) {
    return false
  }
  // 'in' narrows to `object & Record<'_tag', unknown>`
  return value._tag === 'LocalSkillsError'
}
