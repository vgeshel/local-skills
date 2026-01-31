import { ok, ResultAsync } from 'neverthrow'
import { execFile } from 'node:child_process'
import {
  access,
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import * as os from 'node:os'

import { localSkillsError } from './errors.js'
import type { Deps } from './types.js'

export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    return e.message
  }
  return String(e)
}

function toFsError(filePath: string, operation: string) {
  return (e: unknown) =>
    localSkillsError(
      'FS_ERROR',
      `Failed to ${operation} "${filePath}": ${errorMessage(e)}`,
      e,
    )
}

export function createDefaultDeps(): Deps {
  return {
    exec: (cmd, args, opts) =>
      ResultAsync.fromPromise(
        new Promise<string>((resolve, reject) => {
          execFile(cmd, [...args], { cwd: opts?.cwd }, (error, stdout) => {
            if (error) {
              reject(error)
            } else {
              resolve(stdout)
            }
          })
        }),
        (e) =>
          localSkillsError(
            'EXEC_ERROR',
            `Command "${cmd}" failed: ${errorMessage(e)}`,
            e,
          ),
      ),

    readFile: (filePath) =>
      ResultAsync.fromPromise(
        readFile(filePath, 'utf-8'),
        toFsError(filePath, 'read'),
      ),

    writeFile: (filePath, content) =>
      ResultAsync.fromPromise(
        writeFile(filePath, content, 'utf-8'),
        toFsError(filePath, 'write'),
      ),

    mkdir: (dirPath) =>
      ResultAsync.fromPromise(
        mkdir(dirPath, { recursive: true }).then(() => undefined),
        toFsError(dirPath, 'create directory'),
      ),

    rm: (targetPath) =>
      ResultAsync.fromPromise(
        rm(targetPath, { recursive: true, force: true }),
        toFsError(targetPath, 'remove'),
      ),

    cp: (src, dest) =>
      ResultAsync.fromPromise(cp(src, dest, { recursive: true }), (e) =>
        localSkillsError(
          'FS_ERROR',
          `Failed to copy "${src}" to "${dest}": ${errorMessage(e)}`,
          e,
        ),
      ),

    readdir: (dirPath) =>
      ResultAsync.fromPromise(
        readdir(dirPath).then((entries) => [...entries]),
        toFsError(dirPath, 'read directory'),
      ),

    exists: (filePath) =>
      ResultAsync.fromSafePromise(
        access(filePath)
          .then(() => true)
          .catch(() => false),
      ),

    tmpdir: () => ok(os.tmpdir()),
  }
}
