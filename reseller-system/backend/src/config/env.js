const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGO_URI || "",
  jwtSecret: process.env.JWT_SECRET || "change_this_secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  adminEmail: process.env.ADMIN_EMAIL || "yusufmohamedyak55@gmail.com",
  adminPassword: process.env.ADMIN_PASSWORD || "Admin",
  adminName: process.env.ADMIN_NAME || "Parent Admin",
  lowCreditThreshold: Number(process.env.LOW_CREDIT_THRESHOLD || 10),
  expiryAlertDays: Number(process.env.EXPIRY_ALERT_DAYS || 5),
};
