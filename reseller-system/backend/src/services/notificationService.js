const Notification = require("../models/Notification");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const env = require("../config/env");

async function refreshSystemNotifications() {
  const now = new Date();
  const alertDate = new Date(now.getTime() + env.expiryAlertDays * 24 * 60 * 60 * 1000);

  const lowCreditResellers = await User.find({ role: "reseller", credits: { $lte: env.lowCreditThreshold } })
    .select("name credits")
    .lean();

  const expiringSubscriptions = await Subscription.find({
    status: "active",
    endDate: { $gte: now, $lte: alertDate },
  })
    .populate("client", "name email")
    .populate("reseller", "name email")
    .lean();

  const notifications = [];

  for (const reseller of lowCreditResellers) {
    notifications.push({
      level: "warning",
      title: "Low reseller credits",
      message: `${reseller.name} has only ${reseller.credits} credits left`,
      user: reseller._id,
    });
  }

  for (const sub of expiringSubscriptions) {
    notifications.push({
      level: "info",
      title: "Subscription expiring soon",
      message: `Client ${sub.client?.name || "Unknown"} expires on ${new Date(sub.endDate).toISOString().slice(0, 10)}`,
      user: sub.reseller?._id || null,
    });
  }

  if (notifications.length) {
    await Notification.insertMany(notifications);
  }

  return {
    created: notifications.length,
    lowCredits: lowCreditResellers.length,
    expiring: expiringSubscriptions.length,
  };
}

module.exports = { refreshSystemNotifications };
