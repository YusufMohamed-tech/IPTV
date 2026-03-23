const User = require("../models/User");
const env = require("../config/env");

async function ensureDefaultAdmin() {
  const existing = await User.findOne({ role: "admin", email: env.adminEmail }).lean();
  if (existing) {
    return existing;
  }

  const passwordHash = await User.hashPassword(env.adminPassword);
  const admin = await User.create({
    name: env.adminName,
    email: env.adminEmail,
    passwordHash,
    role: "admin",
    status: "active",
  });

  return admin;
}

if (require.main === module) {
  const { connectDb } = require("../config/db");

  connectDb()
    .then(() => ensureDefaultAdmin())
    .then((admin) => {
      console.log(`Default admin ready: ${admin.email}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}

module.exports = { ensureDefaultAdmin };
