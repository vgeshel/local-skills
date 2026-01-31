import { describe, expect, it } from 'vitest'

import { ManifestSchema, MarketplaceConfigSchema } from './schemas.js'

describe('schemas', () => {
  describe('ManifestSchema', () => {
    it('parses a valid manifest with one skill', () => {
      const input = {
        skills: {
          tdd: {
            source: 'superpowers@anthropics/claude-code',
            ref: 'main',
            sha: 'abc123def456',
          },
        },
      }

      const result = ManifestSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.skills.tdd.source).toBe(
          'superpowers@anthropics/claude-code',
        )
        expect(result.data.skills.tdd.ref).toBe('main')
        expect(result.data.skills.tdd.sha).toBe('abc123def456')
      }
    })

    it('parses a valid manifest with multiple skills', () => {
      const input = {
        skills: {
          tdd: {
            source: 'superpowers@anthropics/claude-code',
            ref: 'main',
            sha: 'abc123',
          },
          debugging: {
            source: 'superpowers@anthropics/claude-code',
            ref: 'v2.0',
            sha: 'def456',
          },
        },
      }

      const result = ManifestSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(Object.keys(result.data.skills)).toEqual(['tdd', 'debugging'])
      }
    })

    it('parses an empty manifest', () => {
      const input = { skills: {} }

      const result = ManifestSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.skills).toEqual({})
      }
    })

    it('rejects manifest missing skills field', () => {
      const input = {}

      const result = ManifestSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('rejects skill entry missing source', () => {
      const input = {
        skills: {
          tdd: { ref: 'main', sha: 'abc' },
        },
      }

      const result = ManifestSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('rejects skill entry missing ref', () => {
      const input = {
        skills: {
          tdd: { source: 'foo@bar/baz', sha: 'abc' },
        },
      }

      const result = ManifestSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('rejects skill entry missing sha', () => {
      const input = {
        skills: {
          tdd: { source: 'foo@bar/baz', ref: 'main' },
        },
      }

      const result = ManifestSchema.safeParse(input)

      expect(result.success).toBe(false)
    })
  })

  describe('MarketplaceConfigSchema', () => {
    it('parses marketplace with string source plugin', () => {
      const input = {
        plugins: [{ name: 'superpowers', source: './plugins/superpowers' }],
      }

      const result = MarketplaceConfigSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.plugins[0].name).toBe('superpowers')
        expect(result.data.plugins[0].source).toBe('./plugins/superpowers')
      }
    })

    it('parses marketplace with github source plugin', () => {
      const input = {
        plugins: [
          {
            name: 'my-plugin',
            source: { source: 'github', repo: 'owner/repo' },
          },
        ],
      }

      const result = MarketplaceConfigSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        const src = result.data.plugins[0].source
        expect(typeof src).toBe('object')
        if (typeof src === 'object') {
          expect(src.source).toBe('github')
          expect('repo' in src ? src.repo : undefined).toBe('owner/repo')
        }
      }
    })

    it('parses marketplace with url source plugin', () => {
      const input = {
        plugins: [
          {
            name: 'external',
            source: { source: 'url', url: 'https://gitlab.com/team/repo.git' },
          },
        ],
      }

      const result = MarketplaceConfigSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        const src = result.data.plugins[0].source
        expect(typeof src).toBe('object')
        if (typeof src === 'object') {
          expect(src.source).toBe('url')
          expect('url' in src ? src.url : undefined).toBe(
            'https://gitlab.com/team/repo.git',
          )
        }
      }
    })

    it('parses marketplace with metadata.pluginRoot', () => {
      const input = {
        plugins: [{ name: 'p', source: './p' }],
        metadata: { pluginRoot: './plugins' },
      }

      const result = MarketplaceConfigSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata?.pluginRoot).toBe('./plugins')
      }
    })

    it('parses marketplace without metadata', () => {
      const input = {
        plugins: [{ name: 'p', source: './p' }],
      }

      const result = MarketplaceConfigSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.metadata).toBeUndefined()
      }
    })

    it('parses marketplace with empty plugins', () => {
      const input = { plugins: [] }

      const result = MarketplaceConfigSchema.safeParse(input)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.plugins).toEqual([])
      }
    })

    it('rejects marketplace missing plugins', () => {
      const input = {}

      const result = MarketplaceConfigSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('rejects plugin missing name', () => {
      const input = {
        plugins: [{ source: './foo' }],
      }

      const result = MarketplaceConfigSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('rejects plugin missing source', () => {
      const input = {
        plugins: [{ name: 'foo' }],
      }

      const result = MarketplaceConfigSchema.safeParse(input)

      expect(result.success).toBe(false)
    })

    it('rejects plugin with invalid source object', () => {
      const input = {
        plugins: [{ name: 'foo', source: { source: 'unknown', path: '/tmp' } }],
      }

      const result = MarketplaceConfigSchema.safeParse(input)

      expect(result.success).toBe(false)
    })
  })
})
