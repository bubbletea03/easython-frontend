import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const proxy = { '/api': {
    target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true,
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
