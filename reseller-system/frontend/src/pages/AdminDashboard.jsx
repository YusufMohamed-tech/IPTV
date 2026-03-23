import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import http from "../api/http";
import DashboardLayout from "../layouts/DashboardLayout";
import StatCard from "../components/StatCard";
import DataTable from "../components/DataTable";

function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [resellers, setResellers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [servers, setServers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  async function load() {
    const [dash, resellerRes, pkgRes, serverRes, notifRes] = await Promise.all([
      http.get("/admin/dashboard"),
      http.get("/admin/resellers"),
      http.get("/admin/packages"),
      http.get("/admin/servers"),
      http.get("/admin/notifications"),
    ]);

    setSummary(dash.data);
    setResellers(resellerRes.data);
    setPackages(pkgRes.data);
    setServers(serverRes.data);
    setNotifications(notifRes.data.list || []);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function createReseller(event) {
    event.preventDefault();
    await http.post("/admin/resellers", form);
    setForm({ name: "", email: "", password: "" });
    await load();
  }

  const chartData = useMemo(
    () => [
      { name: "Resellers", value: summary?.totalResellers || 0 },
      { name: "Clients", value: summary?.totalClients || 0 },
      { name: "Active Subs", value: summary?.activeSubscriptions || 0 },
    ],
    [summary],
  );

  return (
    <DashboardLayout>
      <section className="grid-cards">
        <StatCard title="Total Resellers" value={summary?.totalResellers || 0} />
        <StatCard title="Total Clients" value={summary?.totalClients || 0} />
        <StatCard title="Revenue" value={`$${summary?.totalRevenue || 0}`} />
        <StatCard title="Active Subscriptions" value={summary?.activeSubscriptions || 0} />
      </section>

      <section className="panel">
        <h3>Platform Snapshot</h3>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#e68a00" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <h3>Create Reseller</h3>
          <form className="form-grid" onSubmit={createReseller}>
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
            <input
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              required
            />
            <button className="primary-button" type="submit">Create</button>
          </form>
        </div>
        <div>
          <h3>Notifications</h3>
          <ul className="notice-list">
            {notifications.slice(0, 8).map((item) => (
              <li key={item._id}>{item.title}: {item.message}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <h3>Resellers</h3>
        <DataTable
          columns={[
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "credits", label: "Credits" },
            { key: "revenue", label: "Revenue" },
            { key: "status", label: "Status" },
          ]}
          rows={resellers}
        />
      </section>

      <section className="panel two-col">
        <div>
          <h3>Subscription Packages</h3>
          <DataTable
            columns={[
              { key: "name", label: "Package" },
              { key: "durationDays", label: "Days" },
              { key: "price", label: "Price" },
              { key: "status", label: "Status" },
            ]}
            rows={packages}
          />
        </div>
        <div>
          <h3>Servers</h3>
          <DataTable
            columns={[
              { key: "name", label: "Name" },
              { key: "xtreamUrl", label: "Xtream URL" },
              { key: "status", label: "Status" },
            ]}
            rows={servers}
          />
        </div>
      </section>
    </DashboardLayout>
  );
}

export default AdminDashboard;
