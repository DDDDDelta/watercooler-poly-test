import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/seed.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (it ships TypeScript sources); keep real deps external.
  noExternal: ['@watercooler/shared'],
});
