const { body, param, query } = require("express-validator");
const User = require("../models/User");
const Package = require("../models/Package");
const ServerNode = require("../models/ServerNode");
const Subscription = require("../models/Subscription");
const ActivityLog = require("../models/ActivityLog");
const Notification = require("../models/Notification");
const { writeAudit } = require("../services/auditService");
const { refreshSystemNotifications } = require("../services/notificationService");

const resellerValidation = [
  body("name").isLength({ min: 2 }),
  body("email").isEmail(),
  body("password").isLength({ min: 8 }),
];

const resellerUpdateValidation = [
  param("id").isMongoId(),
  body("name").optional().isLength({ min: 2 }),
  body("status").optional().isIn(["active", "disabled"]),
];

const creditValidation = [param("id").isMongoId(), body("credits").isInt({ min: 1 })];

const packageValidation = [
  body("name").isLength({ min: 2 }),
  body("durationDays").isInt({ min: 1 }),
  body("price").isFloat({ min: 0 }),
  body("channels").isArray(),
  body("serverIds").optional().isArray(),
];

const serverValidation = [
  body("name").isLength({ min: 2 }),
  body("xtreamUrl").optional().isString(),
  body("m3uUrl").optional().isString(),
  body("status").optional().isIn(["online", "offline"]),
];

const reportValidation = [
  query("format").optional().isIn(["json", "csv", "pdf"]),
  query("type").optional().isIn(["resellers", "clients", "subscriptions", "activity"]),
];

async function dashboard(req, res) {
  const [totalResellers, totalClients, activeSubscriptions, resellerRevenueAgg] = await Promise.all([
    User.countDocuments({ role: "reseller" }),
    User.countDocuments({ role: "client" }),
    Subscription.countDocuments({ status: "active" }),
    User.aggregate([{ $match: { role: "reseller" } }, { $group: { _id: null, sum: { $sum: "$revenue" } } }]),
  ]);

  const totalRevenue = resellerRevenueAgg[0]?.sum || 0;

  return res.json({
    totalResellers,
    totalClients,
    totalRevenue,
    activeSubscriptions,
  });
}

async function createReseller(req, res) {
  const { name, email, password } = req.body;
  const existing = await User.findOne({ email: String(email).toLowerCase() }).lean();
  if (existing) return res.status(409).json({ error: "Reseller email already exists" });

  const passwordHash = await User.hashPassword(password);
  const reseller = await User.create({
    name,
    email: String(email).toLowerCase(),
    passwordHash,
    role: "reseller",
    credits: 0,
    status: "active",
  });

  await writeAudit({
    actor: req.auth.id,
    actorRole: req.auth.role,
    action: "create_reseller",
    targetType: "user",
    targetId: reseller._id,
  });

  return res.status(201).json(reseller);
}

async function listResellers(req, res) {
  const q = String(req.query.q || "").trim();
  const filter = { role: "reseller" };

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
  }

  const resellers = await User.find(filter)
    .select("name email status credits revenue lastLoginAt createdAt")
    .sort({ createdAt: -1 })
    .lean();

  return res.json(resellers);
}

async function updateReseller(req, res) {
  const updates = {};
  if (req.body.name) updates.name = req.body.name;
  if (req.body.status) updates.status = req.body.status;

  const reseller = await User.findOneAndUpdate({ _id: req.params.id, role: "reseller" }, updates, {
    new: true,
  });

  if (!reseller) return res.status(404).json({ error: "Reseller not found" });

  await writeAudit({
    actor: req.auth.id,
    actorRole: req.auth.role,
    action: "update_reseller",
    targetType: "user",
    targetId: reseller._id,
    metadata: updates,
  });

  return res.json(reseller);
}

async function deleteReseller(req, res) {
  const reseller = await User.findOneAndDelete({ _id: req.params.id, role: "reseller" });
  if (!reseller) return res.status(404).json({ error: "Reseller not found" });

  await User.deleteMany({ role: "client", parentReseller: reseller._id });

  await writeAudit({
    actor: req.auth.id,
    actorRole: req.auth.role,
    action: "delete_reseller",
    targetType: "user",
    targetId: reseller._id,
  });

  return res.json({ message: "Reseller deleted" });
}

async function assignCredits(req, res) {
  const credits = Number(req.body.credits || 0);
  const reseller = await User.findOneAndUpdate(
    { _id: req.params.id, role: "reseller" },
    { $inc: { credits } },
    { new: true },
  );

  if (!reseller) return res.status(404).json({ error: "Reseller not found" });

  await writeAudit({
    actor: req.auth.id,
    actorRole: req.auth.role,
    action: "assign_credits",
    targetType: "user",
    targetId: reseller._id,
    metadata: { credits },
  });

  return res.json({
    resellerId: reseller._id,
    credits: reseller.credits,
  });
}

async function createPackage(req, res) {
  const pkg = await Package.create(req.body);

  await writeAudit({
    actor: req.auth.id,
    actorRole: req.auth.role,
    action: "create_package",
    targetType: "package",
    targetId: pkg._id,
  });

  return res.status(201).json(pkg);
}

async function listPackages(req, res) {
  const packages = await Package.find().populate("serverIds", "name status").sort({ createdAt: -1 }).lean();
  return res.json(packages);
}

async function updatePackage(req, res) {
  const pkg = await Package.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  return res.json(pkg);
}

async function deletePackage(req, res) {
  const pkg = await Package.findByIdAndDelete(req.params.id);
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  return res.json({ message: "Package deleted" });
}

async function createServer(req, res) {
  const server = await ServerNode.create(req.body);
  return res.status(201).json(server);
}

async function listServers(req, res) {
  const servers = await ServerNode.find().sort({ createdAt: -1 }).lean();
  return res.json(servers);
}

async function updateServer(req, res) {
  const server = await ServerNode.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!server) return res.status(404).json({ error: "Server not found" });
  return res.json(server);
}

async function deleteServer(req, res) {
  const server = await ServerNode.findByIdAndDelete(req.params.id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  return res.json({ message: "Server deleted" });
}

async function activity(req, res) {
  const logs = await ActivityLog.find()
    .populate("actor", "name email role")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  return res.json(logs);
}

async function notifications(req, res) {
  const summary = await refreshSystemNotifications();
  const list = await Notification.find().sort({ createdAt: -1 }).limit(100).lean();
  return res.json({ summary, list });
}

module.exports = {
  resellerValidation,
  resellerUpdateValidation,
  creditValidation,
  packageValidation,
  serverValidation,
  reportValidation,
  dashboard,
  createReseller,
  listResellers,
  updateReseller,
  deleteReseller,
  assignCredits,
  createPackage,
  listPackages,
  updatePackage,
  deletePackage,
  createServer,
  listServers,
  updateServer,
  deleteServer,
  activity,
  notifications,
};
