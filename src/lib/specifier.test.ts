import { describe, expect, it } from 'vitest'

import { parseSpecifier } from './specifier.js'

describe('parseSpecifier', () => {
  describe('GitHub shorthand', () => {
    it('parses plugin@owner/repo/skill', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code/tdd')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('superpowers')
        expect(result.value.marketplace).toEqual({
          type: 'github',
          owner: 'anthropics',
          repo: 'claude-code',
        })
        expect(result.value.skill).toBe('tdd')
        expect(result.value.ref).toBeUndefined()
      }
    })

    it('parses with version ref', () => {
      const result = parseSpecifier(
        'superpowers@anthropics/claude-code/tdd:v2.0',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('superpowers')
        expect(result.value.skill).toBe('tdd')
        expect(result.value.ref).toBe('v2.0')
      }
    })

    it('parses wildcard skill', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code/*')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skill).toBe('*')
        expect(result.value.ref).toBeUndefined()
      }
    })

    it('parses wildcard skill with version', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code/*:v1.0')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skill).toBe('*')
        expect(result.value.ref).toBe('v1.0')
      }
    })
  })

  describe('full git URL', () => {
    it('parses plugin@https://gitlab.com/team/repo.git/my-skill', () => {
      const result = parseSpecifier(
        'my-plugin@https://gitlab.com/team/repo.git/my-skill',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('my-plugin')
        expect(result.value.marketplace).toEqual({
          type: 'url',
          url: 'https://gitlab.com/team/repo.git',
        })
        expect(result.value.skill).toBe('my-skill')
        expect(result.value.ref).toBeUndefined()
      }
    })

    it('parses URL with version', () => {
      const result = parseSpecifier(
        'my-plugin@https://gitlab.com/team/repo.git/my-skill:v3.1',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('my-plugin')
        expect(result.value.marketplace).toEqual({
          type: 'url',
          url: 'https://gitlab.com/team/repo.git',
        })
        expect(result.value.skill).toBe('my-skill')
        expect(result.value.ref).toBe('v3.1')
      }
    })

    it('parses URL with wildcard', () => {
      const result = parseSpecifier(
        'my-plugin@https://gitlab.com/team/repo.git/*',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skill).toBe('*')
      }
    })
  })

  describe('error cases', () => {
    it('rejects empty string', () => {
      const result = parseSpecifier('')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
      }
    })

    it('rejects missing @ separator', () => {
      const result = parseSpecifier('superpowersanthropics/claude-code/tdd')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
      }
    })

    it('rejects GitHub shorthand with fewer than 3 path segments', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
      }
    })

    it('treats trailing colon with no version as no ref', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code/tdd:')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skill).toBe('tdd')
        expect(result.value.ref).toBeUndefined()
      }
    })

    it('rejects empty plugin name', () => {
      const result = parseSpecifier('@anthropics/claude-code/tdd')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
      }
    })

    it('rejects URL without .git/ separator', () => {
      const result = parseSpecifier(
        'my-plugin@https://gitlab.com/team/repo/my-skill',
      )

      // This is actually GitHub shorthand format — but with > 3 segments
      // After owner/repo the rest is skill
      // Actually let me re-think: if it contains :// it's a URL
      // A URL without .git/ is invalid
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
      }
    })

    it('rejects URL with .git/ but no skill after it', () => {
      const result = parseSpecifier(
        'my-plugin@https://gitlab.com/team/repo.git/',
      )

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
      }
    })
  })
})
