import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDefaultDeps, errorMessage } from './fs-ops.js'

describe('errorMessage', () => {
  it('returns message from Error instance', () => {
    expect(errorMessage(new Error('test error'))).toBe('test error')
  })

  it('returns String of non-Error value', () => {
    expect(errorMessage('string error')).toBe('string error')
  })

  it('returns String of number', () => {
    expect(errorMessage(42)).toBe('42')
  })
})

describe('createDefaultDeps', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'local-skills-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('exec', () => {
    it('runs a command and returns stdout', async () => {
      const deps = createDefaultDeps()
      const result = await deps.exec('echo', ['hello'])

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.trim()).toBe('hello')
      }
    })

    it('runs a command with cwd option', async () => {
      const deps = createDefaultDeps()
      const result = await deps.exec('pwd', [], { cwd: tmpDir })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        // realpath handles macOS /private/var vs /var symlinks
        const realTmp = await fs.realpath(tmpDir)
        expect(result.value.trim()).toBe(realTmp)
      }
    })

    it('returns EXEC_ERROR when command fails', async () => {
      const deps = createDefaultDeps()
      const result = await deps.exec('false', [])

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('EXEC_ERROR')
      }
    })

    it('returns EXEC_ERROR when command does not exist', async () => {
      const deps = createDefaultDeps()
      const result = await deps.exec('nonexistent-command-abc123', [])

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('EXEC_ERROR')
      }
    })
  })

  describe('readFile', () => {
    it('reads file contents', async () => {
      const filePath = path.join(tmpDir, 'test.txt')
      await fs.writeFile(filePath, 'hello world')

      const deps = createDefaultDeps()
      const result = await deps.readFile(filePath)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe('hello world')
      }
    })

    it('returns FS_ERROR for missing file', async () => {
      const deps = createDefaultDeps()
      const result = await deps.readFile(path.join(tmpDir, 'nonexistent.txt'))

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('FS_ERROR')
      }
    })
  })

  describe('writeFile', () => {
    it('writes content to a file', async () => {
      const filePath = path.join(tmpDir, 'output.txt')

      const deps = createDefaultDeps()
      const result = await deps.writeFile(filePath, 'written content')

      expect(result.isOk()).toBe(true)
      const content = await fs.readFile(filePath, 'utf-8')
      expect(content).toBe('written content')
    })

    it('returns FS_ERROR when writing to nonexistent directory', async () => {
      const deps = createDefaultDeps()
      const result = await deps.writeFile(
        path.join(tmpDir, 'no-such-dir', 'file.txt'),
        'content',
      )

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('FS_ERROR')
      }
    })
  })

  describe('mkdir', () => {
    it('creates a directory recursively', async () => {
      const dirPath = path.join(tmpDir, 'a', 'b', 'c')

      const deps = createDefaultDeps()
      const result = await deps.mkdir(dirPath)

      expect(result.isOk()).toBe(true)
      const stat = await fs.stat(dirPath)
      expect(stat.isDirectory()).toBe(true)
    })

    it('succeeds when directory already exists', async () => {
      const dirPath = path.join(tmpDir, 'existing')
      await fs.mkdir(dirPath)

      const deps = createDefaultDeps()
      const result = await deps.mkdir(dirPath)

      expect(result.isOk()).toBe(true)
    })
  })

  describe('rm', () => {
    it('removes a directory recursively', async () => {
      const dirPath = path.join(tmpDir, 'to-remove')
      await fs.mkdir(dirPath)
      await fs.writeFile(path.join(dirPath, 'file.txt'), 'x')

      const deps = createDefaultDeps()
      const result = await deps.rm(dirPath)

      expect(result.isOk()).toBe(true)
      await expect(fs.stat(dirPath)).rejects.toThrow()
    })

    it('succeeds when target does not exist', async () => {
      const deps = createDefaultDeps()
      const result = await deps.rm(path.join(tmpDir, 'nonexistent'))

      expect(result.isOk()).toBe(true)
    })
  })

  describe('cp', () => {
    it('copies a directory recursively', async () => {
      const srcDir = path.join(tmpDir, 'src-dir')
      const destDir = path.join(tmpDir, 'dest-dir')
      await fs.mkdir(srcDir)
      await fs.writeFile(path.join(srcDir, 'file.txt'), 'content')

      const deps = createDefaultDeps()
      const result = await deps.cp(srcDir, destDir)

      expect(result.isOk()).toBe(true)
      const content = await fs.readFile(path.join(destDir, 'file.txt'), 'utf-8')
      expect(content).toBe('content')
    })

    it('returns FS_ERROR when source does not exist', async () => {
      const deps = createDefaultDeps()
      const result = await deps.cp(
        path.join(tmpDir, 'nonexistent-src'),
        path.join(tmpDir, 'dest'),
      )

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('FS_ERROR')
      }
    })
  })

  describe('readdir', () => {
    it('lists directory entries', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), '')
      await fs.writeFile(path.join(tmpDir, 'b.txt'), '')

      const deps = createDefaultDeps()
      const result = await deps.readdir(tmpDir)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect([...result.value].sort()).toEqual(['a.txt', 'b.txt'])
      }
    })

    it('returns FS_ERROR for nonexistent directory', async () => {
      const deps = createDefaultDeps()
      const result = await deps.readdir(path.join(tmpDir, 'nonexistent'))

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.code).toBe('FS_ERROR')
      }
    })
  })

  describe('exists', () => {
    it('returns true for existing file', async () => {
      const filePath = path.join(tmpDir, 'exists.txt')
      await fs.writeFile(filePath, '')

      const deps = createDefaultDeps()
      const result = await deps.exists(filePath)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe(true)
      }
    })

    it('returns false for nonexistent file', async () => {
      const deps = createDefaultDeps()
      const result = await deps.exists(path.join(tmpDir, 'nope.txt'))

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe(false)
      }
    })
  })

  describe('tmpdir', () => {
    it('returns a valid temp directory path', () => {
      const deps = createDefaultDeps()
      const result = deps.tmpdir()

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(typeof result.value).toBe('string')
        expect(result.value.length).toBeGreaterThan(0)
      }
    })
  })
})
