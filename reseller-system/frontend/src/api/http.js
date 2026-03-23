import axios from "axios";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

http.interceptors.response.use(
  (response) => {
    const contentType = String(response?.headers?.["content-type"] || "").toLowerCase();
    if (contentType.includes("text/html")) {
      return Promise.reject(new Error("Backend API is not configured or returned HTML"));
    }

    return response;
  },
  (error) => Promise.reject(error),
);

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("iptv_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default http;
