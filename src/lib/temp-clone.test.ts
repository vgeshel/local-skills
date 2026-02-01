import { execSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { err, errAsync, okAsync } from 'neverthrow'
import { localSkillsError } from './errors.js'
import { createDefaultDeps } from './fs-ops.js'
import { withTempClone } from './temp-clone.js'
import type { Deps } from './types.js'

describe('withTempClone', () => {
  let repoParent: string
  let repoDir: string
  const deps = createDefaultDeps()

  beforeAll(async () => {
    repoParent = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-tempclone-'),
    )
    repoDir = path.join(repoParent, 'repo.git')
    await fs.mkdir(repoDir, { recursive: true })

    execSync('git init', { cwd: repoDir })
    execSync('git config user.email "test@test.com"', { cwd: repoDir })
    execSync('git config user.name "Test"', { cwd: repoDir })
    await fs.writeFile(path.join(repoDir, 'hello.txt'), 'world')
    execSync('git add -A', { cwd: repoDir })
    execSync('git commit -m "initial"', { cwd: repoDir })
  })

  afterAll(async () => {
    await fs.rm(repoParent, { recursive: true, force: true })
  })

  it('clones repo, runs operation, cleans up on success', async () => {
    let cloneDirSeen = ''

    const result = await withTempClone(
      deps,
      `file://${repoDir}`,
      undefined,
      (cloneDir) => {
        cloneDirSeen = cloneDir
        return okAsync('done')
      },
    )

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toBe('done')
    }
    // Clone dir should be cleaned up
    await expect(fs.access(cloneDirSeen)).rejects.toThrow()
  })

  it('cleans up clone dir on operation error', async () => {
    let cloneDirSeen = ''

    const result = await withTempClone(
      deps,
      `file://${repoDir}`,
      undefined,
      (cloneDir) => {
        cloneDirSeen = cloneDir
        return errAsync(localSkillsError('FS_ERROR', 'operation failed'))
      },
    )

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_ERROR')
      expect(result.error.message).toBe('operation failed')
    }
    // Clone dir should still be cleaned up
    await expect(fs.access(cloneDirSeen)).rejects.toThrow()
  })

  it('returns error when tmpdir fails', async () => {
    const failingDeps: Deps = {
      ...deps,
      tmpdir: () => err(localSkillsError('FS_ERROR', 'tmpdir failed')),
    }

    const result = await withTempClone(
      failingDeps,
      `file://${repoDir}`,
      undefined,
      () => okAsync('done'),
    )

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_ERROR')
    }
  })

  it('returns CLONE_FAILED for invalid repo URL', async () => {
    const result = await withTempClone(
      deps,
      'file:///nonexistent/repo',
      undefined,
      () => okAsync('done'),
    )

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.code).toBe('CLONE_FAILED')
    }
  })

  it('passes ref to clone', async () => {
    // Create a tagged commit
    execSync('git tag v1.0.0', { cwd: repoDir })

    const result = await withTempClone(
      deps,
      `file://${repoDir}`,
      'v1.0.0',
      () => okAsync('tagged'),
    )

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toBe('tagged')
    }
  })
})
