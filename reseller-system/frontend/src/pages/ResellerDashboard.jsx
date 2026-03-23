import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import http from "../api/http";
import DashboardLayout from "../layouts/DashboardLayout";
import StatCard from "../components/StatCard";
import DataTable from "../components/DataTable";

function ResellerDashboard() {
  const [summary, setSummary] = useState(null);
  const [clients, setClients] = useState([]);
  const [packages, setPackages] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [clientForm, setClientForm] = useState({ name: "", email: "", password: "" });
  const [subForm, setSubForm] = useState({ clientId: "", packageId: "", isTrial: false });

  async function load() {
    const [dash, clientRes, packageRes, subRes] = await Promise.all([
      http.get("/reseller/dashboard"),
      http.get("/reseller/clients"),
      http.get("/reseller/packages"),
      http.get("/reseller/subscriptions"),
    ]);

    setSummary(dash.data);
    setClients(clientRes.data);
    setPackages(packageRes.data);
    setSubscriptions(subRes.data);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function createClient(event) {
    event.preventDefault();
    await http.post("/reseller/clients", clientForm);
    setClientForm({ name: "", email: "", password: "" });
    await load();
  }

  async function createSubscription(event) {
    event.preventDefault();
    await http.post("/reseller/subscriptions", {
      clientId: subForm.clientId,
      packageId: subForm.packageId,
      isTrial: Boolean(subForm.isTrial),
    });
    setSubForm({ clientId: "", packageId: "", isTrial: false });
    await load();
  }

  const chartData = useMemo(
    () => [
      { name: "Clients", value: summary?.totalClients || 0 },
      { name: "Active", value: summary?.activeSubscriptions || 0 },
      { name: "Credits", value: summary?.credits || 0 },
    ],
    [summary],
  );

  return (
    <DashboardLayout>
      <section className="grid-cards">
        <StatCard title="Total Clients" value={summary?.totalClients || 0} />
        <StatCard title="Revenue" value={`$${summary?.revenue || 0}`} />
        <StatCard title="Remaining Credits" value={summary?.credits || 0} />
        <StatCard title="Active Subscriptions" value={summary?.activeSubscriptions || 0} />
      </section>

      <section className="panel">
        <h3>Business Trend</h3>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="value" stroke="#0f7b6c" fill="#8adcc6" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <h3>Create Client</h3>
          <form className="form-grid" onSubmit={createClient}>
            <input
              placeholder="Client name"
              value={clientForm.name}
              onChange={(e) => setClientForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
            <input
              placeholder="Client email"
              type="email"
              value={clientForm.email}
              onChange={(e) => setClientForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
            <input
              placeholder="Client password"
              type="password"
              value={clientForm.password}
              onChange={(e) => setClientForm((prev) => ({ ...prev, password: e.target.value }))}
              required
            />
            <button className="primary-button" type="submit">Create Client</button>
          </form>
        </div>
        <div>
          <h3>Assign Subscription</h3>
          <form className="form-grid" onSubmit={createSubscription}>
            <select
              value={subForm.clientId}
              onChange={(e) => setSubForm((prev) => ({ ...prev, clientId: e.target.value }))}
              required
            >
              <option value="">Select client</option>
              {clients.map((client) => (
                <option key={client._id} value={client._id}>{client.name}</option>
              ))}
            </select>
            <select
              value={subForm.packageId}
              onChange={(e) => setSubForm((prev) => ({ ...prev, packageId: e.target.value }))}
              required
            >
              <option value="">Select package</option>
              {packages.map((item) => (
                <option key={item._id} value={item._id}>{item.name}</option>
              ))}
            </select>
            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={subForm.isTrial}
                onChange={(e) => setSubForm((prev) => ({ ...prev, isTrial: e.target.checked }))}
              />
              Offer free trial
            </label>
            <button className="primary-button" type="submit">Assign Subscription</button>
          </form>
        </div>
      </section>

      <section className="panel">
        <h3>Clients</h3>
        <DataTable
          columns={[
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "status", label: "Status" },
            { key: "deviceInfo", label: "Device" },
            {
              key: "lastLoginAt",
              label: "Last Login",
              render: (row) => (row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : "-")
            },
          ]}
          rows={clients}
        />
      </section>

      <section className="panel">
        <h3>Subscriptions</h3>
        <DataTable
          columns={[
            { key: "client", label: "Client", render: (row) => row.client?.name || "-" },
            { key: "package", label: "Package", render: (row) => row.package?.name || "-" },
            { key: "amount", label: "Amount" },
            { key: "isTrial", label: "Trial", render: (row) => (row.isTrial ? "Yes" : "No") },
            {
              key: "endDate",
              label: "Expires",
              render: (row) => new Date(row.endDate).toLocaleDateString()
            },
            { key: "status", label: "Status" },
          ]}
          rows={subscriptions}
        />
      </section>
    </DashboardLayout>
  );
}

export default ResellerDashboard;
