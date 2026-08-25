import axios from "axios";

const API = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    "http://127.0.0.1:8000",
  timeout: 10000,
});

// Attach Auth Token
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// =====================================================
// IN-MEMORY CACHE
// =====================================================

const memoryCache = new Map();

const CACHE_TTL_MS = 60 * 1000;

// =====================================================
// CACHED GET
// =====================================================

export async function getCached(url, params = {}) {
  const cacheKey =
    `${url}:${JSON.stringify(params)}`;

  const cached =
    memoryCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.timestamp <
      CACHE_TTL_MS
  ) {
    return {
      data: cached.data,
      fromCache: true,
    };
  }

  const response =
    await API.get(url, { params });

  memoryCache.set(
    cacheKey,
    {
      data: response.data,
      timestamp: Date.now(),
    }
  );

  return {
    data: response.data,
    fromCache: false,
  };
}

// =====================================================
// INVALIDATE CACHE
// =====================================================

export function invalidateCache(
  urlPattern
) {
  for (
    const key of memoryCache.keys()
  ) {
    if (key.includes(urlPattern)) {
      memoryCache.delete(key);
    }
  }
}

export default API;