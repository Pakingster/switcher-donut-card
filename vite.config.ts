import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    lib: {
      entry: 'src/switcher-donut.ts',
      formats: ['es'],
      fileName: () => 'switcher-donut.js'
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      }
    }
  }
});