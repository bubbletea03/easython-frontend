import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      proxy: env.API_PROXY_TARGET ? {
        '/api': { target: env.API_PROXY_TARGET, changeOrigin: true },
      } : undefined,
    },
  };
});
