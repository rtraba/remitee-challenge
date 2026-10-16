import { spawn } from 'node:child_process';
import { openSync, closeSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export async function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; quiet?: boolean } = {},
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.quiet ? 'ignore' : 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(Error(`${command} failed (${code})`)),
    );
  });
}
export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export async function until<T>(
  read: () => Promise<T>,
  ok: (value: T) => boolean,
  timeout = 30000,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let value: T;
  do {
    value = await read();
    if (ok(value)) return value;
    await delay(100);
  } while (Date.now() < deadline);
  throw Error('Timed out waiting for required state');
}
export function writerLock(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const lock = path + '.lock';
  const fd = openSync(lock, 'wx', 0o600);
  return () => {
    closeSync(fd);
    unlinkSync(lock);
  };
}
