const { body, param, query } = require("express-validator");
const mongoose = require("mongoose");
const User = require("../models/User");
const Package = require("../models/Package");
const Subscription = require("../models/Subscription");
const { writeAudit } = require("../services/auditService");

const clientValidation = [
  body("name").isLength({ min: 2 }),
  body("email").isEmail(),
  body("password").isLength({ min: 8 }),
];

const subscriptionValidation = [
  body("clientId").isMongoId(),
  body("packageId").isMongoId(),
  body("serverId").optional().isMongoId(),
  body("isTrial").optional().isBoolean(),
];

const renewalValidation = [param("id").isMongoId(), body("extraDays").isInt({ min: 1 })];

async function dashboard(req, res) {
  const resellerId = req.auth.id;
  const resellerObjectId = new mongoose.Types.ObjectId(resellerId);

  const [totalClients, activeSubscriptions, reseller, subscriptionRevenue] = await Promise.all([
    User.countDocuments({ role: "client", parentReseller: resellerId }),
    Subscription.countDocuments({ reseller: resellerId, status: "active" }),
    User.findById(resellerId).select("credits revenue"),
    Subscription.aggregate([
      { $match: { reseller: resellerObjectId, status: "active" } },
      { $group: { _id: null, sum: { $sum: "$amount" } } },
    ]),
  ]);

  return res.json({
    totalClients,
    activeSubscriptions,
    credits: reseller?.credits || 0,
    revenue: subscriptionRevenue[0]?.sum || reseller?.revenue || 0,
  });
}

async function createClient(req, res) {
  const { name, email, password } = req.body;
  const exists = await User.findOne({ email: String(email).toLowerCase() }).lean();
  if (exists) return res.status(409).json({ error: "Client email already exists" });

  const passwordHash = await User.hashPassword(password);
  const client = await User.create({
    name,
    email: String(email).toLowerCase(),
    passwordHash,
    role: "client",
    parentReseller: req.auth.id,
    status: "active",
  });

  await writeAudit({
    actor: req.auth.id,
    actorRole: req.auth.role,
    action: "create_client",
    targetType: "user",
    targetId: client._id,
  });

  return res.status(201).json(client);
}

async function listClients(req, res) {
  const q = String(req.query.q || "").trim();
  const filter = { role: "client", parentReseller: req.auth.id };

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
    ];
  }

  const clients = await User.find(filter)
    .select("name email status lastLoginAt deviceInfo createdAt")
    .sort({ createdAt: -1 })
    .lean();

  return res.json(clients);
}

async function updateClient(req, res) {
  const updates = {};
  if (req.body.name) updates.name = req.body.name;
  if (req.body.status) updates.status = req.body.status;

  const client = await User.findOneAndUpdate(
    { _id: req.params.id, role: "client", parentReseller: req.auth.id },
    updates,
    { new: true },
  );

  if (!client) return res.status(404).json({ error: "Client not found" });
  return res.json(client);
}

async function deleteClient(req, res) {
  const client = await User.findOneAndDelete({ _id: req.params.id, role: "client", parentReseller: req.auth.id });
  if (!client) return res.status(404).json({ error: "Client not found" });

  await Subscription.deleteMany({ client: client._id, reseller: req.auth.id });
  return res.json({ message: "Client deleted" });
}

async function createSubscription(req, res) {
  const { clientId, packageId, serverId, isTrial = false } = req.body;
  const [client, pkg, reseller] = await Promise.all([
    User.findOne({ _id: clientId, role: "client", parentReseller: req.auth.id }),
    Package.findById(packageId),
    User.findById(req.auth.id),
  ]);

  if (!client) return res.status(404).json({ error: "Client not found" });
  if (!pkg || pkg.status !== "active") return res.status(404).json({ error: "Package not found or disabled" });

  const now = new Date();
  const endDate = new Date(now.getTime() + Number(pkg.durationDays) * 24 * 60 * 60 * 1000);
  const amount = isTrial ? 0 : Number(pkg.price || 0);

  if (!isTrial && reseller.credits <= 0) {
    return res.status(400).json({ error: "Insufficient credits" });
  }

  const sub = await Subscription.create({
    client: client._id,
    reseller: req.auth.id,
    package: pkg._id,
    server: serverId || null,
    startDate: now,
    endDate,
    status: "active",
    isTrial,
    amount,
  });

  if (!isTrial) {
    reseller.credits -= 1;
    reseller.revenue += amount;
    await reseller.save();
  }

  await writeAudit({
    actor: req.auth.id,
    actorRole: req.auth.role,
    action: isTrial ? "create_trial_subscription" : "create_subscription",
    targetType: "subscription",
    targetId: sub._id,
    metadata: { clientId, packageId, amount, isTrial },
  });

  return res.status(201).json(sub);
}

async function listSubscriptions(req, res) {
  const status = String(req.query.status || "").trim();
  const filter = { reseller: req.auth.id };
  if (status) filter.status = status;

  const list = await Subscription.find(filter)
    .populate("client", "name email")
    .populate("package", "name durationDays price")
    .populate("server", "name status")
    .sort({ createdAt: -1 })
    .lean();

  return res.json(list);
}

async function renewSubscription(req, res) {
  const extraDays = Number(req.body.extraDays || 0);
  const sub = await Subscription.findOne({ _id: req.params.id, reseller: req.auth.id }).populate("package");
  if (!sub) return res.status(404).json({ error: "Subscription not found" });

  const currentEnd = new Date(sub.endDate);
  const base = currentEnd > new Date() ? currentEnd : new Date();
  sub.endDate = new Date(base.getTime() + extraDays * 24 * 60 * 60 * 1000);
  sub.status = "active";
  await sub.save();

  await writeAudit({
    actor: req.auth.id,
    actorRole: req.auth.role,
    action: "renew_subscription",
    targetType: "subscription",
    targetId: sub._id,
    metadata: { extraDays },
  });

  return res.json(sub);
}

async function expireSubscriptions(req, res) {
  const now = new Date();
  const result = await Subscription.updateMany(
    { reseller: req.auth.id, status: "active", endDate: { $lt: now } },
    { $set: { status: "expired" } },
  );

  return res.json({ updated: result.modifiedCount || 0 });
}

async function availablePackages(req, res) {
  const list = await Package.find({ status: "active" }).sort({ createdAt: -1 }).lean();
  return res.json(list);
}

module.exports = {
  clientValidation,
  subscriptionValidation,
  renewalValidation,
  dashboard,
  createClient,
  listClients,
  updateClient,
  deleteClient,
  createSubscription,
  listSubscriptions,
  renewSubscription,
  expireSubscriptions,
  availablePackages,
};
