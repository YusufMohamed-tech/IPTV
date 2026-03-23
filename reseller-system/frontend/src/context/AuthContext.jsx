import { createContext, useContext, useMemo, useState } from "react";
import http from "../api/http";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const demoEmail = import.meta.env.VITE_DEMO_EMAIL || "yusufmohamedyak55@gmail.com";
  const demoPassword = import.meta.env.VITE_DEMO_PASSWORD || "Admin";
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("iptv_user");
    return raw ? JSON.parse(raw) : null;
  });

  async function login(email, password) {
    try {
      const { data } = await http.post("/auth/login", { email, password });
      localStorage.setItem("iptv_token", data.token);
      localStorage.setItem("iptv_user", JSON.stringify(data.user));
      localStorage.removeItem("iptv_demo_mode");
      setUser(data.user);
      return;
    } catch (error) {
      const isFallbackMatch =
        String(email || "").toLowerCase() === String(demoEmail).toLowerCase()
        && String(password || "") === String(demoPassword);

      if (!isFallbackMatch) {
        throw error;
      }

      const demoUser = {
        id: "demo-admin",
        name: "Demo Admin",
        email: demoEmail,
        role: "admin",
        credits: 0,
        revenue: 0,
      };

      localStorage.setItem("iptv_token", "demo-token");
      localStorage.setItem("iptv_user", JSON.stringify(demoUser));
      localStorage.setItem("iptv_demo_mode", "1");
      setUser(demoUser);
    }
  }

  function logout() {
    localStorage.removeItem("iptv_token");
    localStorage.removeItem("iptv_user");
    localStorage.removeItem("iptv_demo_mode");
    setUser(null);
  }

  const value = useMemo(
    () => ({
      user,
      login,
      logout,
      isAdmin: user?.role === "admin",
      isReseller: user?.role === "reseller",
      isClient: user?.role === "client",
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
