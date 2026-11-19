import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// The admin is served under /admin; the public website owns the domain root
// and the PHP API sits at /api (see README → "How the URLs fit together").
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  build: {
    // Straight into the deployable layout next to this folder (../admin + ../api)
    outDir: '../admin',
    emptyOutDir: true,
  },
})
