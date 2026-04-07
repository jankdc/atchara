import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: true,
    benchmark: {
      include: ['**/*.bench.{ts,js}'],
      exclude: ['node_modules'],
      outputJson: './benchmark-results.json',
      reporters: ['verbose'],
    },
  },
})
