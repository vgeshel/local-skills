import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDefaultDeps } from './fs-ops.js'
import { readState, writeState } from './state.js'

describe('state', () => {
  let tmpDir: string
  const deps = createDefaultDeps()

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-state-test-'),
    )
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('readState', () => {
    it('returns empty state when file does not exist', async () => {
      const result = await readState(
        deps,
        path.join(tmpDir, 'nonexistent.json'),
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({ skills: {} })
      }
    })

    it('parses a valid state file', async () => {
      const state = {
        skills: {
          tdd: { contentHash: 'abc123' },
        },
      }
      await fs.writeFile(path.join(tmpDir, 'state.json'), JSON.stringify(state))

      const result = await readState(deps, path.join(tmpDir, 'state.json'))

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.skills.tdd.contentHash).toBe('abc123')
      }
    })

    it('returns error for invalid JSON', async () => {
      await fs.writeFile(path.join(tmpDir, 'state.json'), 'not json{{{')

      const result = await readState(deps, path.join(tmpDir, 'state.json'))

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('MARKETPLACE_PARSE_ERROR')
      }
    })

    it('returns error for invalid schema', async () => {
      await fs.writeFile(
        path.join(tmpDir, 'state.json'),
        JSON.stringify({ wrong: 'shape' }),
      )

      const result = await readState(deps, path.join(tmpDir, 'state.json'))

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('MARKETPLACE_PARSE_ERROR')
      }
    })
  })

  describe('writeState', () => {
    it('writes a state file with formatted JSON', async () => {
      const state = {
        skills: {
          tdd: { contentHash: 'abc123' },
        },
      }

      const result = await writeState(
        deps,
        path.join(tmpDir, 'state.json'),
        state,
      )

      expect(result.isOk()).toBe(true)

      const content = await fs.readFile(
        path.join(tmpDir, 'state.json'),
        'utf-8',
      )
      const parsed: unknown = JSON.parse(content)
      expect(parsed).toEqual(state)
      // Verify it ends with a newline
      expect(content.endsWith('\n')).toBe(true)
    })

    it('round-trips through read and write', async () => {
      const state = {
        skills: {
          tdd: { contentHash: 'hash1' },
          debug: { contentHash: 'hash2' },
        },
      }
      const filePath = path.join(tmpDir, 'state.json')

      await writeState(deps, filePath, state)
      const result = await readState(deps, filePath)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual(state)
      }
    })
  })
})
