// apiClient.js
import axios from "axios";
import { useAuthStore } from "./store/auth";

export const api = axios.create({ baseURL: "/api" });

// 请求拦截：自动加 Bearer
api.interceptors.request.use((cfg) => {
  const { token } = useAuthStore.getState();
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// 响应拦截：统一错误 & 401 登出
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const res = err?.response;
    if (res?.status === 401) {
      useAuthStore.getState().logout();
      location.replace("/login");
    }
    const data = res?.data;
    return Promise.reject(new Error(data?.message || data?.error || err.message || "请求失败"));
  }
);
