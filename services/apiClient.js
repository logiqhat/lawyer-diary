import Constants from 'expo-constants';
import { auth } from '../firebase';

const JSON_HEADERS = { Accept: 'application/json' };

function resolveExtra() {
  return Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};
}

function resolveBaseUrl() {
  const extra = resolveExtra();
  const url = extra.apiBaseUrl;
  if (url) return url.replace(/\/$/, '');
  // Default to localhost for dev convenience
  return 'http://localhost:3000';
}

const API_BASE_URL = resolveBaseUrl();

async function resolveAuthHeaders(forceRefresh = false) {
  if (!auth?.currentUser) return {};
  try {
    const token = await auth.currentUser.getIdToken(forceRefresh);
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (error) {
    console.warn('Failed to fetch Firebase ID token', error);
    return {};
  }
}

function buildUrl(path, query) {
  const cleanedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${cleanedPath}`);
  if (query && typeof query === 'object') {
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null)
      .forEach(([key, value]) => url.searchParams.append(key, String(value)));
  }
  return url.toString();
}

async function request(method, path, options = {}) {
  const {
    body,
    headers = {},
    query,
    authRequired = true,
    testUserId,
    signal,
    forceTokenRefresh = false,
  } = options;

  const url = buildUrl(path, query);

  const init = {
    method,
    headers: { ...JSON_HEADERS, ...headers },
    signal,
  };

  if (authRequired) {
    const authHeaders = await resolveAuthHeaders(forceTokenRefresh);
    Object.assign(init.headers, authHeaders);
  }

  if (testUserId) {
    init.headers['x-test-user'] = testUserId;
  }

  if (body !== undefined && body !== null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(url, init);

  const responseText = await response.text();
  let data;
  try {
    data = responseText ? JSON.parse(responseText) : undefined;
  } catch (error) {
    data = responseText;
  }

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || 'API request failed');
    error.status = response.status;
    error.data = data;
    error.url = url;
    throw error;
  }

  return {
    data,
    status: response.status,
    headers: response.headers,
  };
}

export const apiClient = {
  get: (path, options) => request('GET', path, options),
  post: (path, options) => request('POST', path, options),
  put: (path, options) => request('PUT', path, options),
  delete: (path, options) => request('DELETE', path, options),
  request,
  buildUrl,
  API_BASE_URL,
};

