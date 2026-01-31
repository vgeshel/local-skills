import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDefaultDeps } from './fs-ops.js'
import {
  addSkillToManifest,
  readManifest,
  removeSkillFromManifest,
  writeManifest,
} from './manifest.js'
import type { Manifest } from './types.js'

describe('manifest', () => {
  let tmpDir: string
  const deps = createDefaultDeps()

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-manifest-test-'),
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('readManifest', () => {
    it('reads an existing manifest file', async () => {
      const manifest: Manifest = {
        skills: {
          tdd: {
            source: 'superpowers@anthropics/claude-code',
            ref: 'main',
            sha: 'abc123',
          },
        },
      }
      await fs.writeFile(
        path.join(tmpDir, 'local-skills.json'),
        JSON.stringify(manifest),
      )

      const result = await readManifest(
        deps,
        path.join(tmpDir, 'local-skills.json'),
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skills.tdd.source).toBe(
          'superpowers@anthropics/claude-code',
        )
        expect(result.value.skills.tdd.ref).toBe('main')
        expect(result.value.skills.tdd.sha).toBe('abc123')
      }
    })

    it('returns empty manifest when file does not exist', async () => {
      const result = await readManifest(
        deps,
        path.join(tmpDir, 'nonexistent.json'),
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skills).toEqual({})
      }
    })

    it('returns MARKETPLACE_PARSE_ERROR for invalid JSON', async () => {
      await fs.writeFile(path.join(tmpDir, 'local-skills.json'), 'not json')

      const result = await readManifest(
        deps,
        path.join(tmpDir, 'local-skills.json'),
      )

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('MARKETPLACE_PARSE_ERROR')
      }
    })

    it('returns MARKETPLACE_PARSE_ERROR for invalid schema', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'local-skills.json'),
        JSON.stringify({ wrong: 'shape' }),
      )

      const result = await readManifest(
        deps,
        path.join(tmpDir, 'local-skills.json'),
      )

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('MARKETPLACE_PARSE_ERROR')
      }
    })
  })

  describe('writeManifest', () => {
    it('writes manifest to file', async () => {
      const manifest: Manifest = {
        skills: {
          debug: {
            source: 'tools@owner/repo',
            ref: 'v1.0',
            sha: 'def456',
          },
        },
      }
      const filePath = path.join(tmpDir, 'local-skills.json')

      const result = await writeManifest(deps, filePath, manifest)

      expect(result.isOk()).toBe(true)
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed: unknown = JSON.parse(content)
      expect(parsed).toEqual(manifest)
    })

    it('overwrites existing manifest', async () => {
      const filePath = path.join(tmpDir, 'local-skills.json')
      await fs.writeFile(filePath, '{"skills":{}}')

      const manifest: Manifest = {
        skills: {
          tdd: {
            source: 'x@y/z',
            ref: 'main',
            sha: '111',
          },
        },
      }

      const result = await writeManifest(deps, filePath, manifest)

      expect(result.isOk()).toBe(true)
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed: unknown = JSON.parse(content)
      expect(parsed).toEqual(manifest)
    })
  })

  describe('addSkillToManifest', () => {
    it('adds a new skill to the manifest', () => {
      const manifest: Manifest = { skills: {} }

      const result = addSkillToManifest(manifest, 'tdd', {
        source: 'superpowers@anthropics/claude-code',
        ref: 'main',
        sha: 'abc',
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skills.tdd.source).toBe(
          'superpowers@anthropics/claude-code',
        )
      }
    })

    it('returns SKILL_ALREADY_EXISTS when skill exists', () => {
      const manifest: Manifest = {
        skills: {
          tdd: {
            source: 'x@y/z',
            ref: 'main',
            sha: 'old',
          },
        },
      }

      const result = addSkillToManifest(manifest, 'tdd', {
        source: 'x@y/z',
        ref: 'main',
        sha: 'new',
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('SKILL_ALREADY_EXISTS')
      }
    })
  })

  describe('removeSkillFromManifest', () => {
    it('removes an existing skill', () => {
      const manifest: Manifest = {
        skills: {
          tdd: {
            source: 'x@y/z',
            ref: 'main',
            sha: 'abc',
          },
        },
      }

      const result = removeSkillFromManifest(manifest, 'tdd')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skills).toEqual({})
      }
    })

    it('returns SKILL_NOT_INSTALLED when skill not found', () => {
      const manifest: Manifest = { skills: {} }

      const result = removeSkillFromManifest(manifest, 'tdd')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('SKILL_NOT_INSTALLED')
      }
    })
  })
})
