import { createApiClient, getClientId } from './apiCore';
export { ApiError } from './apiCore';
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  apiKey: import.meta.env.VITE_API_KEY || '',
  requireApiKey: !!import.meta.env.VITE_API_BASE_URL && !import.meta.env.VITE_API_BASE_URL.startsWith('/'),
  clientId: () => getClientId(localStorage),
});
