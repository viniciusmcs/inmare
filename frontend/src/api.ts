/// <reference types="vite/client" />
import axios from "axios";
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api/v1",
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
