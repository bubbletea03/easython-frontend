import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: mode === 'https' ? [basicSsl()] : [],
    server: {
      proxy: env.API_PROXY_TARGET ? {
        '/api': { target: env.API_PROXY_TARGET, changeOrigin: true },
      } : undefined,
    },
  };
});
