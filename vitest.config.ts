import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['api/test/**/*.test.ts'], coverage: { provider: 'v8', include: ['api/src/**/*.ts'], exclude: ['api/src/main.ts'], reporter: ['text', 'json', 'lcov'] } } });
