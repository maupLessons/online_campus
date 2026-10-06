import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](?:react|react-dom|react-router|scheduler)[\\/]/,
              priority: 40,
            },
            {
              name: 'vendor-i18n',
              test: /[\\/]node_modules[\\/](?:i18next|react-i18next|i18next-browser-languagedetector)[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor-forms',
              test: /[\\/]node_modules[\\/](?:react-hook-form|zod|@hookform[\\/]resolvers)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-query',
              test: /[\\/]node_modules[\\/]@tanstack[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
