const User = require("../models/User");
const Subscription = require("../models/Subscription");
const ActivityLog = require("../models/ActivityLog");
const { toCsv, toPdf } = require("../services/reportService");

function sendByFormat(res, format, filename, rows, title) {
  if (format === "csv") {
    const csv = toCsv(rows);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=${filename}.csv`);
    return res.send(csv);
  }

  if (format === "pdf") {
    return toPdf(title, rows).then((buffer) => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}.pdf`);
      return res.send(buffer);
    });
  }

  return res.json(rows);
}

async function adminReport(req, res) {
  const type = String(req.query.type || "resellers");
  const format = String(req.query.format || "json");
  let rows = [];

  if (type === "resellers") {
    rows = await User.find({ role: "reseller" })
      .select("name email credits revenue status lastLoginAt createdAt")
      .lean();
  } else if (type === "clients") {
    rows = await User.find({ role: "client" })
      .populate("parentReseller", "name email")
      .lean();
    rows = rows.map((item) => ({
      name: item.name,
      email: item.email,
      status: item.status,
      reseller: item.parentReseller?.name || "",
      lastLoginAt: item.lastLoginAt || "",
      createdAt: item.createdAt,
    }));
  } else if (type === "subscriptions") {
    rows = await Subscription.find()
      .populate("client", "name email")
      .populate("reseller", "name email")
      .populate("package", "name price")
      .lean();
    rows = rows.map((item) => ({
      client: item.client?.name || "",
      reseller: item.reseller?.name || "",
      package: item.package?.name || "",
      amount: item.amount,
      status: item.status,
      startDate: item.startDate,
      endDate: item.endDate,
      isTrial: item.isTrial,
    }));
  } else if (type === "activity") {
    rows = await ActivityLog.find().sort({ createdAt: -1 }).limit(500).lean();
    rows = rows.map((item) => ({
      actorRole: item.actorRole,
      action: item.action,
      targetType: item.targetType,
      targetId: item.targetId,
      createdAt: item.createdAt,
    }));
  } else {
    return res.status(400).json({ error: "Unsupported report type" });
  }

  return sendByFormat(res, format, `admin-${type}-report`, rows, `Admin ${type} report`);
}

async function resellerReport(req, res) {
  const type = String(req.query.type || "clients");
  const format = String(req.query.format || "json");
  let rows = [];

  if (type === "clients") {
    rows = await User.find({ role: "client", parentReseller: req.auth.id })
      .select("name email status lastLoginAt deviceInfo createdAt")
      .lean();
  } else if (type === "subscriptions") {
    rows = await Subscription.find({ reseller: req.auth.id })
      .populate("client", "name email")
      .populate("package", "name price")
      .lean();
    rows = rows.map((item) => ({
      client: item.client?.name || "",
      package: item.package?.name || "",
      amount: item.amount,
      status: item.status,
      startDate: item.startDate,
      endDate: item.endDate,
      isTrial: item.isTrial,
    }));
  } else {
    return res.status(400).json({ error: "Unsupported report type" });
  }

  return sendByFormat(res, format, `reseller-${type}-report`, rows, `Reseller ${type} report`);
}

module.exports = { adminReport, resellerReport };
