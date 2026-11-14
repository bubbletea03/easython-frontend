import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxy = { '/api': {
    target: env.BACKEND_API_URL || env.API_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true,
    headers: {'X-API-Key': env.BACKEND_API_KEY || env.VITE_API_KEY || ''},
    rewrite: (path: string) => path.replace(/^\/api(?=\/|$)/, ''),
  } };
  return {
    plugins: mode === 'https' ? [basicSsl()] : [],
    server: {
      proxy,
    },
    preview: { proxy },
  };
});
