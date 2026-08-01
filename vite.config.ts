import { defineConfig } from 'vite';

export default defineConfig({
  // Project pages live at /pyrrhia-3d-map/; local `npm run dev` stays at /.
  base: process.env.GITHUB_PAGES === 'true' ? '/pyrrhia-3d-map/' : '/',
  server: {
    port: 5173,
    open: true,
  },
});
