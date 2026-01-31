import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { computeContentHash } from './content-hash.js'
import { createDefaultDeps } from './fs-ops.js'

describe('computeContentHash', () => {
  let tmpDir: string
  const deps = createDefaultDeps()

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-skills-hash-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('returns a hex string hash for a directory with files', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.txt'), 'hello')
    await fs.writeFile(path.join(tmpDir, 'b.txt'), 'world')

    const result = await computeContentHash(deps, tmpDir)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('produces the same hash for identical content', async () => {
    await fs.writeFile(path.join(tmpDir, 'file.txt'), 'content')

    const result1 = await computeContentHash(deps, tmpDir)
    const result2 = await computeContentHash(deps, tmpDir)

    expect(result1.isOk()).toBe(true)
    expect(result2.isOk()).toBe(true)
    if (result1.isOk() && result2.isOk()) {
      expect(result1.value).toBe(result2.value)
    }
  })

  it('produces different hashes for different content', async () => {
    await fs.writeFile(path.join(tmpDir, 'file.txt'), 'content-a')
    const result1 = await computeContentHash(deps, tmpDir)

    await fs.writeFile(path.join(tmpDir, 'file.txt'), 'content-b')
    const result2 = await computeContentHash(deps, tmpDir)

    expect(result1.isOk()).toBe(true)
    expect(result2.isOk()).toBe(true)
    if (result1.isOk() && result2.isOk()) {
      expect(result1.value).not.toBe(result2.value)
    }
  })

  it('includes nested files in the hash', async () => {
    await fs.mkdir(path.join(tmpDir, 'sub'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'sub', 'nested.txt'), 'nested')

    const result = await computeContentHash(deps, tmpDir)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('produces different hashes when a nested file changes', async () => {
    await fs.mkdir(path.join(tmpDir, 'sub'), { recursive: true })
    await fs.writeFile(path.join(tmpDir, 'sub', 'nested.txt'), 'v1')
    const result1 = await computeContentHash(deps, tmpDir)

    await fs.writeFile(path.join(tmpDir, 'sub', 'nested.txt'), 'v2')
    const result2 = await computeContentHash(deps, tmpDir)

    expect(result1.isOk()).toBe(true)
    expect(result2.isOk()).toBe(true)
    if (result1.isOk() && result2.isOk()) {
      expect(result1.value).not.toBe(result2.value)
    }
  })

  it('handles an empty directory', async () => {
    const result = await computeContentHash(deps, tmpDir)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toMatch(/^[a-f0-9]{64}$/)
    }
  })
})
