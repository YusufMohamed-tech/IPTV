import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const isDemoMode = typeof window !== "undefined" && localStorage.getItem("iptv_demo_mode") === "1";

  const links = user?.role === "admin"
    ? [{ to: "/admin", label: "Admin Dashboard" }]
    : [{ to: "/reseller", label: "Reseller Dashboard" }];

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <h1 className="logo">3Stars Control</h1>
        <nav className="sidebar-nav">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={location.pathname === link.to ? "active" : ""}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <button className="ghost-button" onClick={logout} type="button">
          Sign out
        </button>
      </aside>
      <main className="dashboard-content">
        {isDemoMode ? <div className="panel">Demo mode is enabled. Backend login is currently unavailable.</div> : null}
        {children}
      </main>
    </div>
  );
}

export default DashboardLayout;
