/// <reference types="vite/client" />
import axios from "axios";

function apiBaseUrl() {
  const configured = import.meta.env.VITE_API_URL ?? "/api/v1";
  if (typeof window === "undefined") return configured;
  try {
    const url = new URL(configured, window.location.origin);
    const pageHost = window.location.hostname;
    const apiHost = url.hostname;
    const localHosts = new Set(["localhost", "127.0.0.1"]);
    if (localHosts.has(pageHost) && localHosts.has(apiHost) && pageHost !== apiHost) {
      url.hostname = pageHost;
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    return configured;
  }
  return configured;
}

export const api = axios.create({
  baseURL: apiBaseUrl(),
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const isAuthRequest = String(request?.url ?? "").includes("/admin/auth/");
    if (error.response?.status === 401 && request && !request._retried && !isAuthRequest) {
      request._retried = true;
      await api.post("/admin/auth/refresh/");
      return api(request);
    }
    return Promise.reject(error);
  },
);
