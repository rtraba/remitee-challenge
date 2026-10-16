import { expect, test } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { Interface } from 'ethers';
test('native SQLite, Fastify injection and ethers work on the pinned runtime', async () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  expect(db.prepare('SELECT sqlite_version() AS version').get()).toHaveProperty('version');
  db.close();
  const app = Fastify();
  app.get('/', () => ({ ok: true }));
  expect((await app.inject('/')).json()).toEqual({ ok: true });
  await app.close();
  expect(new Interface(['event Ready(uint256 id)']).getEvent('Ready')?.name).toBe('Ready');
});
