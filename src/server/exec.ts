import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** A GUI app does not inherit the login shell's PATH, so the Orca CLI's own folders are added. */
const EXTRA_PATH = [
  '/Applications/Orca.app/Contents/Resources/bin',
  '/opt/homebrew/bin',
  '/usr/local/bin',
  join(process.env.HOME ?? '', '.local/bin')
]

const PATH = [...(process.env.PATH ?? '').split(delimiter), ...EXTRA_PATH].filter(Boolean).join(delimiter)

function which(command: string): string {
  const found = PATH.split(delimiter)
    .map((dir) => join(dir, command))
    .find((candidate) => existsSync(candidate))
  return found ?? command
}

export class CommandError extends Error {}

/** Runs a CLI and rejects with its first stderr line, so the panel can say why. */
export function run(command: string, args: string[], input?: string, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      which(command),
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PATH } },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout)
        const code = (error as NodeJS.ErrnoException).code
        const cause =
          code === 'ENOENT'
            ? `${command} is not installed or not on the PATH`
            : error.killed
              ? `${command} timed out after ${timeoutMs} ms`
              : (stderr
                  .trim()
                  .split('\n')
                  .find((line) => line.trim()) ?? error.message)
        reject(new CommandError(cause))
      }
    )
    if (input !== undefined) child.stdin?.end(input)
  })
}
