import { createApiClient, getClientId } from './apiCore';
export { ApiError } from './apiCore';
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  apiKey: import.meta.env.VITE_API_KEY || '',
  clientId: () => getClientId(localStorage),
});
export const DEFAULT_TARGETS = ['cup','bottle','bowl','cell phone','book','remote','key','wallet','person','laptop'];
