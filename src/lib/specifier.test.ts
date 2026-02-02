import { describe, expect, it } from 'vitest'

import { parseMarketplaceRef, parseSpecifier } from './specifier.js'

describe('parseSpecifier', () => {
  describe('GitHub shorthand', () => {
    it('parses plugin@owner/repo:skill', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code:tdd')

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
        'superpowers@anthropics/claude-code:v2.0:tdd',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('superpowers')
        expect(result.value.marketplace).toEqual({
          type: 'github',
          owner: 'anthropics',
          repo: 'claude-code',
        })
        expect(result.value.skill).toBe('tdd')
        expect(result.value.ref).toBe('v2.0')
      }
    })

    it('parses wildcard skill', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code:*')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skill).toBe('*')
        expect(result.value.ref).toBeUndefined()
      }
    })

    it('parses wildcard skill with version', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code:v1.0:*')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skill).toBe('*')
        expect(result.value.ref).toBe('v1.0')
      }
    })

    it('parses without skill (partial specifier)', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('superpowers')
        expect(result.value.marketplace).toEqual({
          type: 'github',
          owner: 'anthropics',
          repo: 'claude-code',
        })
        expect(result.value.skill).toBeUndefined()
        expect(result.value.ref).toBeUndefined()
      }
    })

    it('parses with version but no skill (partial specifier)', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code:v2.0')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('superpowers')
        expect(result.value.skill).toBeUndefined()
        expect(result.value.ref).toBe('v2.0')
      }
    })
  })

  describe('full git URL', () => {
    it('parses plugin@https://gitlab.com/team/repo.git:skill', () => {
      const result = parseSpecifier(
        'my-plugin@https://gitlab.com/team/repo.git:my-skill',
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

    it('parses URL with version and skill', () => {
      const result = parseSpecifier(
        'my-plugin@https://gitlab.com/team/repo.git:v3.1:my-skill',
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
        'my-plugin@https://gitlab.com/team/repo.git:*',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skill).toBe('*')
      }
    })

    it('parses URL with port number', () => {
      const result = parseSpecifier(
        'plugin@https://gitlab.example.com:8443/team/repo.git:tdd',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('plugin')
        expect(result.value.marketplace).toEqual({
          type: 'url',
          url: 'https://gitlab.example.com:8443/team/repo.git',
        })
        expect(result.value.skill).toBe('tdd')
        expect(result.value.ref).toBeUndefined()
      }
    })

    it('parses URL with port, version, and skill', () => {
      const result = parseSpecifier(
        'plugin@https://gitlab.example.com:8443/team/repo.git:v2:tdd',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.marketplace).toEqual({
          type: 'url',
          url: 'https://gitlab.example.com:8443/team/repo.git',
        })
        expect(result.value.ref).toBe('v2')
        expect(result.value.skill).toBe('tdd')
      }
    })

    it('parses URL without skill (partial)', () => {
      const result = parseSpecifier(
        'my-plugin@https://gitlab.com/team/repo.git',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('my-plugin')
        expect(result.value.marketplace).toEqual({
          type: 'url',
          url: 'https://gitlab.com/team/repo.git',
        })
        expect(result.value.skill).toBeUndefined()
        expect(result.value.ref).toBeUndefined()
      }
    })
  })

  describe('local path', () => {
    it('parses plugin@/absolute/path:skill', () => {
      const result = parseSpecifier('sp@/Users/me/marketplace:tdd')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('sp')
        expect(result.value.marketplace).toEqual({
          type: 'url',
          url: '/Users/me/marketplace',
        })
        expect(result.value.skill).toBe('tdd')
        expect(result.value.ref).toBeUndefined()
      }
    })

    it('parses plugin@file:///path:skill', () => {
      const result = parseSpecifier('sp@file:///Users/me/mkt:tdd')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('sp')
        expect(result.value.marketplace).toEqual({
          type: 'url',
          url: 'file:///Users/me/mkt',
        })
        expect(result.value.skill).toBe('tdd')
        expect(result.value.ref).toBeUndefined()
      }
    })

    it('parses file URL with version and skill', () => {
      const result = parseSpecifier('sp@file:///path/to/mkt:v2:tdd')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.marketplace).toEqual({
          type: 'url',
          url: 'file:///path/to/mkt',
        })
        expect(result.value.ref).toBe('v2')
        expect(result.value.skill).toBe('tdd')
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
      const result = parseSpecifier('superpowersanthropics/claude-code:tdd')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
      }
    })

    it('rejects empty plugin name', () => {
      const result = parseSpecifier('@anthropics/claude-code:tdd')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
      }
    })

    it('rejects GitHub shorthand with only one path segment', () => {
      const result = parseSpecifier('superpowers@anthropics:tdd')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
      }
    })

    it('rejects empty marketplace after @', () => {
      const result = parseSpecifier('plugin@')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
        expect(result.error.message).toContain('empty marketplace')
      }
    })

    it('treats trailing colon as no skill and no ref', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code:')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('superpowers')
        expect(result.value.marketplace).toEqual({
          type: 'github',
          owner: 'anthropics',
          repo: 'claude-code',
        })
        expect(result.value.skill).toBeUndefined()
        expect(result.value.ref).toBeUndefined()
      }
    })

    it('rejects too many colon segments', () => {
      const result = parseSpecifier(
        'superpowers@anthropics/claude-code:v1:tdd:extra',
      )

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_SPECIFIER')
        expect(result.error.message).toContain('Too many')
      }
    })

    it('treats SHA-like segment as ref', () => {
      const result = parseSpecifier(
        'superpowers@anthropics/claude-code:abcdef1',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.plugin).toBe('superpowers')
        expect(result.value.ref).toBe('abcdef1')
        expect(result.value.skill).toBeUndefined()
      }
    })

    it('treats empty ref in two-colon format as undefined ref', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code::tdd')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.ref).toBeUndefined()
        expect(result.value.skill).toBe('tdd')
      }
    })

    it('treats empty skill in two-colon format as undefined skill', () => {
      const result = parseSpecifier('superpowers@anthropics/claude-code:v1:')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.ref).toBe('v1')
        expect(result.value.skill).toBeUndefined()
      }
    })
  })
})

describe('parseMarketplaceRef', () => {
  it('parses GitHub shorthand', () => {
    const result = parseMarketplaceRef('anthropics/claude-code')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.marketplace).toEqual({
        type: 'github',
        owner: 'anthropics',
        repo: 'claude-code',
      })
      expect(result.value.ref).toBeUndefined()
    }
  })

  it('parses GitHub shorthand with version', () => {
    const result = parseMarketplaceRef('anthropics/claude-code:v2.0')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.marketplace).toEqual({
        type: 'github',
        owner: 'anthropics',
        repo: 'claude-code',
      })
      expect(result.value.ref).toBe('v2.0')
    }
  })

  it('parses file URL', () => {
    const result = parseMarketplaceRef('file:///Users/me/mkt')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.marketplace).toEqual({
        type: 'url',
        url: 'file:///Users/me/mkt',
      })
      expect(result.value.ref).toBeUndefined()
    }
  })

  it('parses file URL with version', () => {
    const result = parseMarketplaceRef('file:///Users/me/mkt:v1.0')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.marketplace).toEqual({
        type: 'url',
        url: 'file:///Users/me/mkt',
      })
      expect(result.value.ref).toBe('v1.0')
    }
  })

  it('treats trailing colon as no ref', () => {
    const result = parseMarketplaceRef('anthropics/claude-code:')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.marketplace).toEqual({
        type: 'github',
        owner: 'anthropics',
        repo: 'claude-code',
      })
      expect(result.value.ref).toBeUndefined()
    }
  })

  it('parses URL with port number', () => {
    const result = parseMarketplaceRef(
      'https://gitlab.example.com:8443/team/repo.git',
    )

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.marketplace).toEqual({
        type: 'url',
        url: 'https://gitlab.example.com:8443/team/repo.git',
      })
      expect(result.value.ref).toBeUndefined()
    }
  })

  it('parses URL with port number and version', () => {
    const result = parseMarketplaceRef(
      'https://gitlab.example.com:8443/team/repo.git:v1.0',
    )

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.marketplace).toEqual({
        type: 'url',
        url: 'https://gitlab.example.com:8443/team/repo.git',
      })
      expect(result.value.ref).toBe('v1.0')
    }
  })

  it('rejects empty string', () => {
    const result = parseMarketplaceRef('')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('INVALID_SPECIFIER')
    }
  })

  it('rejects too many colon segments', () => {
    const result = parseMarketplaceRef('anthropics/claude-code:v1:v2')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('INVALID_SPECIFIER')
    }
  })
})
