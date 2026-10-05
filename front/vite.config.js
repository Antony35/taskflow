import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// API_PROXY_TARGET n'est utilisée que par le serveur de développement (npm run dev) :
// elle n'est pas intégrée aux fichiers produits par `npm run build`.
// En production, les appels /api/... sont envoyés au serveur qui sert le front,
// qui doit les relayer vers l'API.
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  build: {
    outDir: 'dist',
  },
});
