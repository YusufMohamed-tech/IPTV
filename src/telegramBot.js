const TelegramBot = require("node-telegram-bot-api");
const {
  listUsers,
  findUserByUsername,
  upsertUser,
  updateUser,
  deleteUser,
  toUnixPlusDays,
} = require("./userStore");

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminIds = String(process.env.TELEGRAM_ADMIN_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

if (!adminIds.length) {
  console.error("Missing TELEGRAM_ADMIN_IDS (comma-separated chat IDs)");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const sessions = new Map();

const MENU = {
  GEN: "Create License",
  LIST: "List Users",
  EXTEND: "Extend License",
  DISABLE: "Disable User",
  ENABLE: "Enable User",
  SETPASS: "Change Password",
  DELETE: "Delete User",
  CANCEL: "Cancel",
};

const mainKeyboard = {
  keyboard: [
    [MENU.GEN, MENU.LIST],
    [MENU.EXTEND, MENU.SETPASS],
    [MENU.DISABLE, MENU.ENABLE],
    [MENU.DELETE, MENU.CANCEL],
  ],
  resize_keyboard: true,
  persistent: true,
};

function isAdmin(msg) {
  return adminIds.includes(String(msg.chat.id));
}

function requireAdmin(msg) {
  if (!isAdmin(msg)) {
    bot.sendMessage(msg.chat.id, "غير مصرح. البوت مخصص للمدير فقط.");
    return false;
  }
  return true;
}

function helpText() {
  return [
    "اوامر بوت 3Stars للرخص:",
    "/gen",
    "ينشئ رخصة بشكل تفاعلي خطوة بخطوة",
    "/extend <username> <days>",
    "/disable <username>",
    "/enable <username>",
    "/setpass <username> <new_password>",
    "/delete <username>",
    "/list",
    "/menu لعرض الازرار",
    "/cancel لالغاء اي عملية جارية",
  ].join("\n");
}

function getPortalUrl() {
  return process.env.PORTAL_URL || "http://188.166.61.68:3000";
}

function smartersText(user) {
  return [
    "تم انشاء الرخصة بنجاح",
    "",
    "بيانات IPTV Smarters:",
    `Server URL: ${getPortalUrl()}`,
    `Username: ${user.username}`,
    `Password: ${user.password}`,
    `Exp Date (unix): ${user.exp_date}`,
    `Max Connections: ${user.max_connections}`,
  ].join("\n");
}

function sendMenu(chatId, text = "اختار العملية من الازرار:") {
  return bot.sendMessage(chatId, text, { reply_markup: mainKeyboard });
}

async function listUsersText() {
  const users = await listUsers();
  if (!users.length) {
    return "لا يوجد مستخدمين.";
  }
  return users.map((u) => `${u.username} | ${u.status} | انتهاء: ${u.exp_date}`).join("\n");
}

function beginSession(chatId, flow, step, text) {
  sessions.set(chatId, { flow, step, data: {} });
  bot.sendMessage(chatId, text);
}

bot.onText(/^\/start$/, async (msg) => {
  if (!requireAdmin(msg)) return;
  await bot.sendMessage(msg.chat.id, helpText());
  await sendMenu(msg.chat.id);
});

bot.onText(/^\/help$/, async (msg) => {
  if (!requireAdmin(msg)) return;
  await bot.sendMessage(msg.chat.id, helpText());
  await sendMenu(msg.chat.id);
});

bot.onText(/^\/menu$/, async (msg) => {
  if (!requireAdmin(msg)) return;
  await sendMenu(msg.chat.id);
});

bot.onText(/^\/cancel$/, async (msg) => {
  if (!requireAdmin(msg)) return;
  sessions.delete(msg.chat.id);
  await sendMenu(msg.chat.id, "تم الغاء العملية الحالية.");
});

bot.onText(/^\/gen$/, async (msg) => {
  if (!requireAdmin(msg)) return;
  await beginSession(msg.chat.id, "gen", "username", "ابدأ انشاء رخصة جديدة.\nادخل اسم المستخدم:");
});

bot.onText(/^\/gen\s+(\S+)\s+(\S+)\s+(\d+)(?:\s+(\d+))?$/, async (msg, match) => {
  if (!requireAdmin(msg)) return;

  const user = {
    username: match[1],
    password: match[2],
    status: "Active",
    exp_date: toUnixPlusDays(Number(match[3])),
    max_connections: Number(match[4] || 1),
    is_trial: 0,
    created_at: String(Math.floor(Date.now() / 1000)),
  };

  await upsertUser(user);
  await bot.sendMessage(msg.chat.id, smartersText(user));
  await sendMenu(msg.chat.id);
});

bot.onText(/^\/extend\s+(\S+)\s+(\d+)$/, async (msg, match) => {
  if (!requireAdmin(msg)) return;

  const username = match[1];
  const days = Number(match[2]);
  const user = await findUserByUsername(username);

  if (!user) {
    await bot.sendMessage(msg.chat.id, "المستخدم غير موجود.");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const currentExp = Number(user.exp_date || 0);
  const nextExp = String(Math.max(currentExp, now) + days * 24 * 60 * 60);
  await updateUser(username, { exp_date: nextExp, status: "Active" });

  await bot.sendMessage(msg.chat.id, `تم تمديد ${username}. تاريخ الانتهاء الجديد: ${nextExp}`);
  await sendMenu(msg.chat.id);
});

bot.onText(/^\/disable\s+(\S+)$/, async (msg, match) => {
  if (!requireAdmin(msg)) return;
  const user = await updateUser(match[1], { status: "Disabled" });
  await bot.sendMessage(msg.chat.id, user ? `تم تعطيل المستخدم: ${match[1]}` : "المستخدم غير موجود.");
  await sendMenu(msg.chat.id);
});

bot.onText(/^\/enable\s+(\S+)$/, async (msg, match) => {
  if (!requireAdmin(msg)) return;
  const user = await updateUser(match[1], { status: "Active" });
  await bot.sendMessage(msg.chat.id, user ? `تم تفعيل المستخدم: ${match[1]}` : "المستخدم غير موجود.");
  await sendMenu(msg.chat.id);
});

bot.onText(/^\/setpass\s+(\S+)\s+(\S+)$/, async (msg, match) => {
  if (!requireAdmin(msg)) return;
  const user = await updateUser(match[1], { password: match[2] });
  await bot.sendMessage(msg.chat.id, user ? `تم تحديث كلمة المرور للمستخدم: ${match[1]}` : "المستخدم غير موجود.");
  await sendMenu(msg.chat.id);
});

bot.onText(/^\/delete\s+(\S+)$/, async (msg, match) => {
  if (!requireAdmin(msg)) return;
  const ok = await deleteUser(match[1]);
  await bot.sendMessage(msg.chat.id, ok ? `تم حذف المستخدم: ${match[1]}` : "المستخدم غير موجود.");
  await sendMenu(msg.chat.id);
});

bot.onText(/^\/list$/, async (msg) => {
  if (!requireAdmin(msg)) return;
  await bot.sendMessage(msg.chat.id, await listUsersText());
  await sendMenu(msg.chat.id);
});

bot.on("message", async (msg) => {
  if (!requireAdmin(msg)) return;
  if (!msg.text) return;

  const text = msg.text.trim();
  if (text.startsWith("/")) return;

  if (text === MENU.CANCEL) {
    sessions.delete(msg.chat.id);
    await sendMenu(msg.chat.id, "تم الغاء العملية الحالية.");
    return;
  }

  if (text === MENU.GEN) {
    await beginSession(msg.chat.id, "gen", "username", "ابدأ انشاء رخصة جديدة.\nادخل اسم المستخدم:");
    return;
  }

  if (text === MENU.LIST) {
    await bot.sendMessage(msg.chat.id, await listUsersText());
    await sendMenu(msg.chat.id);
    return;
  }

  if (text === MENU.EXTEND) {
    await beginSession(msg.chat.id, "extend", "username", "ادخل اسم المستخدم المراد تمديده:");
    return;
  }

  if (text === MENU.DISABLE) {
    await beginSession(msg.chat.id, "disable", "username", "ادخل اسم المستخدم المراد تعطيله:");
    return;
  }

  if (text === MENU.ENABLE) {
    await beginSession(msg.chat.id, "enable", "username", "ادخل اسم المستخدم المراد تفعيله:");
    return;
  }

  if (text === MENU.SETPASS) {
    await beginSession(msg.chat.id, "setpass", "username", "ادخل اسم المستخدم:");
    return;
  }

  if (text === MENU.DELETE) {
    await beginSession(msg.chat.id, "delete", "username", "ادخل اسم المستخدم المراد حذفه:");
    return;
  }

  const session = sessions.get(msg.chat.id);
  if (!session) return;

  if (session.flow === "gen") {
    if (session.step === "username") {
      session.data.username = text;
      session.step = "password";
      await bot.sendMessage(msg.chat.id, "ادخل كلمة المرور:");
      return;
    }

    if (session.step === "password") {
      session.data.password = text;
      session.step = "days";
      await bot.sendMessage(msg.chat.id, "ادخل عدد الايام (مثال: 30):");
      return;
    }

    if (session.step === "days") {
      const days = Number(text);
      if (!Number.isFinite(days) || days <= 0) {
        await bot.sendMessage(msg.chat.id, "عدد الايام غير صحيح. ادخل رقم مثل 30.");
        return;
      }

      session.data.days = days;
      session.step = "maxConnections";
      await bot.sendMessage(msg.chat.id, "ادخل عدد الاتصالات المسموحة (Max Connections).\nارسل 1 او اكتب default.");
      return;
    }

    if (session.step === "maxConnections") {
      let maxConnections = 1;
      if (text.toLowerCase() !== "default") {
        const parsed = Number(text);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          await bot.sendMessage(msg.chat.id, "الرقم غير صحيح. ادخل رقم صحيح او default.");
          return;
        }
        maxConnections = parsed;
      }

      const user = {
        username: session.data.username,
        password: session.data.password,
        status: "Active",
        exp_date: toUnixPlusDays(session.data.days),
        max_connections: maxConnections,
        is_trial: 0,
        created_at: String(Math.floor(Date.now() / 1000)),
      };

      await upsertUser(user);
      sessions.delete(msg.chat.id);
      await bot.sendMessage(msg.chat.id, smartersText(user));
      await sendMenu(msg.chat.id);
      return;
    }
  }

  if (session.flow === "extend") {
    if (session.step === "username") {
      session.data.username = text;
      session.step = "days";
      await bot.sendMessage(msg.chat.id, "ادخل عدد الايام للتمديد:");
      return;
    }

    if (session.step === "days") {
      const days = Number(text);
      if (!Number.isFinite(days) || days <= 0) {
        await bot.sendMessage(msg.chat.id, "عدد الايام غير صحيح.");
        return;
      }

      const user = await findUserByUsername(session.data.username);
      if (!user) {
        sessions.delete(msg.chat.id);
        await bot.sendMessage(msg.chat.id, "المستخدم غير موجود.");
        await sendMenu(msg.chat.id);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const currentExp = Number(user.exp_date || 0);
      const nextExp = String(Math.max(currentExp, now) + days * 24 * 60 * 60);
      await updateUser(session.data.username, { exp_date: nextExp, status: "Active" });
      sessions.delete(msg.chat.id);
      await bot.sendMessage(msg.chat.id, `تم تمديد ${session.data.username}. تاريخ الانتهاء الجديد: ${nextExp}`);
      await sendMenu(msg.chat.id);
      return;
    }
  }

  if (["disable", "enable", "delete"].includes(session.flow) && session.step === "username") {
    const username = text;
    sessions.delete(msg.chat.id);

    if (session.flow === "disable") {
      const user = await updateUser(username, { status: "Disabled" });
      await bot.sendMessage(msg.chat.id, user ? `تم تعطيل المستخدم: ${username}` : "المستخدم غير موجود.");
      await sendMenu(msg.chat.id);
      return;
    }

    if (session.flow === "enable") {
      const user = await updateUser(username, { status: "Active" });
      await bot.sendMessage(msg.chat.id, user ? `تم تفعيل المستخدم: ${username}` : "المستخدم غير موجود.");
      await sendMenu(msg.chat.id);
      return;
    }

    const ok = await deleteUser(username);
    await bot.sendMessage(msg.chat.id, ok ? `تم حذف المستخدم: ${username}` : "المستخدم غير موجود.");
    await sendMenu(msg.chat.id);
    return;
  }

  if (session.flow === "setpass") {
    if (session.step === "username") {
      session.data.username = text;
      session.step = "password";
      await bot.sendMessage(msg.chat.id, "ادخل كلمة المرور الجديدة:");
      return;
    }

    if (session.step === "password") {
      const user = await updateUser(session.data.username, { password: text });
      sessions.delete(msg.chat.id);
      await bot.sendMessage(msg.chat.id, user ? `تم تحديث كلمة المرور للمستخدم: ${session.data.username}` : "المستخدم غير موجود.");
      await sendMenu(msg.chat.id);
    }
  }
});

bot.on("polling_error", (error) => {
  console.error("Telegram polling error:", error.message);
});

console.log("3Stars Telegram license bot is running (AR mode). Keyboard enabled.");
