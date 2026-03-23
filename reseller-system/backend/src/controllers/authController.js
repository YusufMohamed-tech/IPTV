const jwt = require("jsonwebtoken");
const { body } = require("express-validator");
const env = require("../config/env");
const User = require("../models/User");
const { writeAudit } = require("../services/auditService");

const registerValidation = [
  body("name").isLength({ min: 2 }).withMessage("name is required"),
  body("email").isEmail().withMessage("valid email is required"),
  body("password").isLength({ min: 8 }).withMessage("password must be at least 8 chars"),
  body("role").optional().isIn(["reseller", "client"]).withMessage("role must be reseller or client"),
];

const loginValidation = [
  body("email").isEmail().withMessage("valid email is required"),
  body("password").notEmpty().withMessage("password is required"),
];

function signToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

async function login(req, res) {
  const { email, password, deviceInfo = "" } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase() });

  if (!user || !(await user.comparePassword(password)) || user.status !== "active") {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  user.lastLoginAt = new Date();
  user.deviceInfo = String(deviceInfo || "");
  await user.save();

  await writeAudit({
    actor: user._id,
    actorRole: user.role,
    action: "login",
    targetType: "user",
    targetId: user._id,
    metadata: { email: user.email },
  });

  const token = signToken(user);
  return res.json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      credits: user.credits,
      revenue: user.revenue,
    },
  });
}

async function register(req, res) {
  const { name, email, password, role = "client", parentReseller } = req.body;

  const exists = await User.findOne({ email: String(email).toLowerCase() }).lean();
  if (exists) {
    return res.status(409).json({ error: "Email already exists" });
  }

  const passwordHash = await User.hashPassword(password);
  const user = await User.create({
    name,
    email: String(email).toLowerCase(),
    passwordHash,
    role,
    parentReseller: role === "client" ? parentReseller || null : null,
    credits: role === "reseller" ? 0 : undefined,
  });

  await writeAudit({
    actor: req.auth?.id || user._id,
    actorRole: req.auth?.role || "self",
    action: "register",
    targetType: "user",
    targetId: user._id,
    metadata: { role: user.role },
  });

  return res.status(201).json({
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}

async function me(req, res) {
  const user = await User.findById(req.auth.id)
    .select("name email role credits revenue status lastLoginAt deviceInfo")
    .lean();

  return res.json(user);
}

module.exports = {
  registerValidation,
  loginValidation,
  login,
  register,
  me,
};
