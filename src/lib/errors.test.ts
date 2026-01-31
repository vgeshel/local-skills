import { describe, expect, it } from 'vitest'

import {
  isLocalSkillsError,
  localSkillsError,
  type ErrorCode,
} from './errors.js'

describe('errors', () => {
  describe('localSkillsError', () => {
    it('creates an error with code and message', () => {
      const error = localSkillsError('INVALID_SPECIFIER', 'bad input')

      expect(error.code).toBe('INVALID_SPECIFIER')
      expect(error.message).toBe('bad input')
      expect(error.cause).toBeUndefined()
    })

    it('creates an error with code, message, and cause', () => {
      const cause = new Error('original')
      const error = localSkillsError('CLONE_FAILED', 'git clone failed', cause)

      expect(error.code).toBe('CLONE_FAILED')
      expect(error.message).toBe('git clone failed')
      expect(error.cause).toBe(cause)
    })

    it('creates errors for every error code', () => {
      const codes: ErrorCode[] = [
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
      ]

      for (const code of codes) {
        const error = localSkillsError(code, `msg for ${code}`)
        expect(error.code).toBe(code)
        expect(error.message).toBe(`msg for ${code}`)
      }
    })
  })

  describe('isLocalSkillsError', () => {
    it('returns true for a LocalSkillsError', () => {
      const error = localSkillsError('FS_ERROR', 'disk full')

      expect(isLocalSkillsError(error)).toBe(true)
    })

    it('returns false for a plain object missing _tag', () => {
      const plain = { code: 'FS_ERROR', message: 'disk full' }

      expect(isLocalSkillsError(plain)).toBe(false)
    })

    it('returns false for null', () => {
      expect(isLocalSkillsError(null)).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isLocalSkillsError(undefined)).toBe(false)
    })

    it('returns false for a string', () => {
      expect(isLocalSkillsError('error')).toBe(false)
    })

    it('returns false for a number', () => {
      expect(isLocalSkillsError(42)).toBe(false)
    })
  })
})
