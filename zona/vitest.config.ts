import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Lets tests exercise data-layer modules that import via the `@/` alias and
// `react-native` (stubbed) without bundling the real RN runtime.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'react-native': fileURLToPath(new URL('./src/__tests__/mocks/react-native.ts', import.meta.url)),
    },
  },
});
