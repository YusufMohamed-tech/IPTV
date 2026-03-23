import axios from "axios";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("iptv_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default http;
