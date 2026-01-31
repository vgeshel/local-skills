import { execSync } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDefaultDeps } from './fs-ops.js'
import { cloneRepo, getHeadSha, isShaRef } from './git.js'

describe('git', () => {
  let fixtureRepo: string
  let fixtureSha: string
  const deps = createDefaultDeps()

  beforeAll(async () => {
    // Create a real git repo as a fixture
    fixtureRepo = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-skills-git-fixture-'),
    )
    execSync('git init', { cwd: fixtureRepo })
    execSync('git config user.email "test@test.com"', { cwd: fixtureRepo })
    execSync('git config user.name "Test"', { cwd: fixtureRepo })

    // Create a marketplace structure
    const pluginDir = path.join(fixtureRepo, '.claude-plugin')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(
      path.join(pluginDir, 'marketplace.json'),
      JSON.stringify({
        plugins: [{ name: 'test-plugin', source: '.' }],
      }),
    )

    const skillDir = path.join(fixtureRepo, 'skills', 'my-skill')
    await fs.mkdir(skillDir, { recursive: true })
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# My Skill')

    execSync('git add -A', { cwd: fixtureRepo })
    execSync('git commit -m "initial"', { cwd: fixtureRepo })
    fixtureSha = execSync('git rev-parse HEAD', {
      cwd: fixtureRepo,
      encoding: 'utf-8',
    }).trim()
  })

  afterAll(async () => {
    await fs.rm(fixtureRepo, { recursive: true, force: true })
  })

  describe('isShaRef', () => {
    it('returns true for a 40-char lowercase hex string', () => {
      expect(isShaRef('a'.repeat(40))).toBe(true)
    })

    it('returns true for a real-looking SHA', () => {
      expect(isShaRef('abc123def456789012345678901234abcdef5678')).toBe(true)
    })

    it('returns false for a branch name', () => {
      expect(isShaRef('main')).toBe(false)
    })

    it('returns false for HEAD', () => {
      expect(isShaRef('HEAD')).toBe(false)
    })

    it('returns false for a tag', () => {
      expect(isShaRef('v1.0.0')).toBe(false)
    })

    it('returns false for a 39-char hex string', () => {
      expect(isShaRef('a'.repeat(39))).toBe(false)
    })

    it('returns false for a 41-char hex string', () => {
      expect(isShaRef('a'.repeat(41))).toBe(false)
    })

    it('returns false for uppercase hex', () => {
      expect(isShaRef('A'.repeat(40))).toBe(false)
    })

    it('returns false for non-hex characters', () => {
      expect(isShaRef('g'.repeat(40))).toBe(false)
    })
  })

  describe('cloneRepo', () => {
    it('clones a repo to a target directory', async () => {
      const target = path.join(
        os.tmpdir(),
        `local-skills-clone-test-${Date.now()}`,
      )

      try {
        const result = await cloneRepo(
          deps,
          `file://${fixtureRepo}`,
          target,
          undefined,
        )

        expect(result.isOk()).toBe(true)
        // Verify the cloned repo has the fixture files
        const marketplaceJson = await fs.readFile(
          path.join(target, '.claude-plugin', 'marketplace.json'),
          'utf-8',
        )
        expect(marketplaceJson).toContain('test-plugin')
      } finally {
        await fs.rm(target, { recursive: true, force: true })
      }
    })

    it('clones a repo with a specific ref', async () => {
      // Create a tagged commit
      execSync('git tag v1.0', { cwd: fixtureRepo })

      const target = path.join(
        os.tmpdir(),
        `local-skills-clone-ref-test-${Date.now()}`,
      )

      try {
        const result = await cloneRepo(
          deps,
          `file://${fixtureRepo}`,
          target,
          'v1.0',
        )

        expect(result.isOk()).toBe(true)
      } finally {
        execSync('git tag -d v1.0', { cwd: fixtureRepo })
        await fs.rm(target, { recursive: true, force: true })
      }
    })

    it('returns CLONE_FAILED for invalid URL', async () => {
      const target = path.join(
        os.tmpdir(),
        `local-skills-clone-fail-test-${Date.now()}`,
      )

      try {
        const result = await cloneRepo(
          deps,
          'file:///nonexistent/repo',
          target,
          undefined,
        )

        expect(result.isErr()).toBe(true)
        if (result.isErr()) {
          expect(result.error.code).toBe('CLONE_FAILED')
        }
      } finally {
        await fs.rm(target, { recursive: true, force: true })
      }
    })

    it('returns CLONE_FAILED for invalid ref', async () => {
      const target = path.join(
        os.tmpdir(),
        `local-skills-clone-badref-test-${Date.now()}`,
      )

      try {
        const result = await cloneRepo(
          deps,
          `file://${fixtureRepo}`,
          target,
          'nonexistent-ref-xyz',
        )

        expect(result.isErr()).toBe(true)
        if (result.isErr()) {
          expect(result.error.code).toBe('CLONE_FAILED')
        }
      } finally {
        await fs.rm(target, { recursive: true, force: true })
      }
    })
  })

  describe('getHeadSha', () => {
    it('returns the HEAD SHA of a repo', async () => {
      const result = await getHeadSha(deps, fixtureRepo)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe(fixtureSha)
      }
    })

    it('returns EXEC_ERROR for non-repo directory', async () => {
      const nonRepo = await fs.mkdtemp(
        path.join(os.tmpdir(), 'local-skills-nonrepo-'),
      )

      try {
        const result = await getHeadSha(deps, nonRepo)

        expect(result.isErr()).toBe(true)
        if (result.isErr()) {
          expect(result.error.code).toBe('EXEC_ERROR')
        }
      } finally {
        await fs.rm(nonRepo, { recursive: true, force: true })
      }
    })
  })
})
