import axios from "axios";

// =====================================================
// API BASE URL
// Local development:
//   VITE_API_URL=http://127.0.0.1:8000
//
// Production (Render):
//   VITE_API_URL=https://smart-chat-ai-application.onrender.com

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

const API = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});

// =====================================================
// ATTACH AUTH TOKEN
// =====================================================

API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

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

  const cached = memoryCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.timestamp < CACHE_TTL_MS
  ) {
    return {
      data: cached.data,
      fromCache: true,
    };
  }

  const response = await API.get(url, {
    params,
  });

  memoryCache.set(cacheKey, {
    data: response.data,
    timestamp: Date.now(),
  });

  return {
    data: response.data,
    fromCache: false,
  };
}

// =====================================================
// INVALIDATE CACHE
// =====================================================

export function invalidateCache(urlPattern) {
  for (const key of memoryCache.keys()) {
    if (key.includes(urlPattern)) {
      memoryCache.delete(key);
    }
  }
}

// =====================================================
// EXPORT
// =====================================================

export default API;

