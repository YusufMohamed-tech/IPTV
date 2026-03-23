const express = require("express");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const {
  serverInfo,
  epg,
} = require("../data/sampleData");
const {
  getCatalog,
  importFromM3UUrl,
} = require("./catalogStore");
const {
  isDatabaseEnabled,
  getStorageMode,
  initDatabase,
  migrateFileUsersToDatabase,
  listUsers,
  findUser,
  findUserByUsername,
  upsertUser,
  updateUser,
  deleteUser,
  appendAuditLog,
  listAuditLogs,
} = require("./userStore");

const app = express();
const port = Number(process.env.PORT || serverInfo.port || 8080);
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "3stars-admin-dev-key";
const RATE_WINDOW_SECONDS = Number(process.env.RATE_WINDOW_SECONDS || 60);
const RATE_MAX_REQUESTS = Number(process.env.RATE_MAX_REQUESTS || 120);
const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const isVercelRuntime = String(process.env.VERCEL || "") === "1";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "3stars-jwt-dev-secret";
const ADMIN_JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || "12h";
const ALLOW_LEGACY_ADMIN_KEY = String(process.env.ALLOW_LEGACY_ADMIN_KEY || "true").toLowerCase() === "true";
const AUDIT_LOG_FILE = path.join(__dirname, "..", "data", "admin-audit.log");
const STREAM_ENGINE_ENABLED = String(process.env.STREAM_ENGINE_ENABLED || "true").toLowerCase() === "true";
const STREAM_ENGINE_HLS_URL = process.env.STREAM_ENGINE_HLS_URL || "http://127.0.0.1:8080/hls/live/stream.m3u8";
const STREAM_ENGINE_PUBLIC_HLS_URL = process.env.STREAM_ENGINE_PUBLIC_HLS_URL || "";
const STREAM_ENGINE_TIMEOUT_MS = Number(process.env.STREAM_ENGINE_TIMEOUT_MS || 3000);
const M3U_SOURCE_URL = process.env.M3U_SOURCE_URL || "";

if (!fs.existsSync(path.dirname(AUDIT_LOG_FILE))) {
  fs.mkdirSync(path.dirname(AUDIT_LOG_FILE), { recursive: true });
}

app.use(express.json());

const rateBuckets = new Map();
const metrics = {
  requests_total: 0,
  auth_401_total: 0,
  auth_403_total: 0,
  rate_limit_429_total: 0,
  admin_401_total: 0,
  admin_400_total: 0,
  admin_login_fail_total: 0,
  admin_login_success_total: 0,
  admin_actions_total: 0,
};

if (isProduction && !isVercelRuntime && (!process.env.ADMIN_API_KEY || ADMIN_API_KEY === "3stars-admin-dev-key")) {
  console.error("ADMIN_API_KEY must be set to a non-default value in production.");
  process.exit(1);
}

if (isProduction && !isVercelRuntime && (!process.env.ADMIN_JWT_SECRET || ADMIN_JWT_SECRET === "3stars-jwt-dev-secret")) {
  console.error("ADMIN_JWT_SECRET must be set to a non-default value in production.");
  process.exit(1);
}

if (isProduction && !isVercelRuntime && (!process.env.ADMIN_PASSWORD || ADMIN_PASSWORD === "admin123")) {
  console.error("ADMIN_PASSWORD must be set to a non-default value in production.");
  process.exit(1);
}

app.use((req, res, next) => {
  metrics.requests_total += 1;
  next();
});

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

function authRateLimit(req, res, next) {
  const ip = getClientIp(req);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - RATE_WINDOW_SECONDS;
  const bucket = rateBuckets.get(ip);

  if (!bucket || bucket.start < windowStart) {
    rateBuckets.set(ip, { start: now, count: 1 });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > RATE_MAX_REQUESTS) {
    metrics.rate_limit_429_total += 1;
    return res.status(429).json({
      error: "Too many requests",
      message: "Rate limit exceeded. Please retry shortly.",
    });
  }

  return next();
}

setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  const expireBefore = now - RATE_WINDOW_SECONDS * 2;

  for (const [ip, bucket] of rateBuckets.entries()) {
    if (bucket.start < expireBefore) {
      rateBuckets.delete(ip);
    }
  }
}, 60 * 1000).unref();

function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function isUserExpired(user) {
  const exp = Number(user.exp_date || 0);
  if (!exp) return false;
  return exp < Math.floor(Date.now() / 1000);
}

function getUserStatus(user) {
  if (String(user.status).toLowerCase() !== "active") {
    return { ok: false, httpStatus: 403, message: "User is inactive" };
  }

  if (isUserExpired(user)) {
    return { ok: false, httpStatus: 403, message: "Subscription expired" };
  }

  return { ok: true };
}

function unauthorizedResponse(res) {
  metrics.auth_401_total += 1;
  return res.status(401).json({
    user_info: {
      auth: 0,
      status: "Disabled",
      message: "Invalid username or password",
    },
  });
}

function disabledResponse(res, message) {
  metrics.auth_403_total += 1;
  return res.status(403).json({
    user_info: {
      auth: 0,
      status: "Disabled",
      message,
    },
  });
}

function buildUserInfo(user, req) {
  return {
    username: user.username,
    password: user.password,
    auth: 1,
    status: user.status,
    exp_date: user.exp_date,
    is_trial: user.is_trial,
    active_cons: 0,
    created_at: String(user.created_at || Math.floor(Date.now() / 1000)),
    max_connections: user.max_connections,
    allowed_output_formats: ["ts", "m3u8"],
    server_portal: getBaseUrl(req),
  };
}

function requireAdmin(req, res, next) {
  const authHeader = req.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (token) {
    try {
      const payload = jwt.verify(token, ADMIN_JWT_SECRET);
      req.adminUser = String(payload.sub || payload.username || ADMIN_USERNAME);
      return next();
    } catch (error) {
      metrics.admin_401_total += 1;
      return res.status(401).json({ error: "Invalid or expired admin token" });
    }
  }

  const key = req.get("x-admin-key");
  if (ALLOW_LEGACY_ADMIN_KEY && key && key === ADMIN_API_KEY) {
    req.adminUser = "legacy-key";
    return next();
  }

  if (key && !ALLOW_LEGACY_ADMIN_KEY) {
    metrics.admin_401_total += 1;
    return res.status(401).json({ error: "Legacy x-admin-key is disabled" });
  }

  if (!token) {
    metrics.admin_401_total += 1;
    return res.status(401).json({ error: "Unauthorized admin token" });
  }
}

function isValidUsername(value) {
  return /^[a-zA-Z0-9_.-]{3,32}$/.test(String(value || ""));
}

function isValidPassword(value) {
  const text = String(value || "");
  return text.length >= 4 && text.length <= 64;
}

function isPositiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function isValidStatus(value) {
  return ["active", "disabled"].includes(String(value || "").toLowerCase());
}

function badAdminRequest(res, error) {
  metrics.admin_400_total += 1;
  return res.status(400).json({ error });
}

async function writeAudit(req, event) {
  const entry = {
    time: new Date().toISOString(),
    ip: getClientIp(req),
    actor: req.adminUser || "unknown",
    ...event,
  };

  try {
    await appendAuditLog(entry);
  } catch (error) {
    // Keep file audit fallback if DB logging fails.
  }
  fs.appendFileSync(AUDIT_LOG_FILE, `${JSON.stringify(entry)}\n`);
  metrics.admin_actions_total += 1;
}

function buildServerInfo(req) {
  return {
    url: req.hostname,
    port,
    https_port: 443,
    server_protocol: req.protocol,
    rtmp_port: 1935,
    timezone: serverInfo.timezone,
    timestamp_now: Math.floor(Date.now() / 1000),
    time_now: new Date().toISOString(),
  };
}

async function checkStreamingEngine() {
  if (!STREAM_ENGINE_ENABLED) {
    return { enabled: false, online: false, reason: "disabled" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_ENGINE_TIMEOUT_MS);

  try {
    const response = await fetch(STREAM_ENGINE_HLS_URL, { signal: controller.signal });
    const body = await response.text();
    const looksLikeM3U8 = body.includes("#EXTM3U");
    return {
      enabled: true,
      online: response.ok && looksLikeM3U8,
      status_code: response.status,
      hls_url: STREAM_ENGINE_HLS_URL,
      looks_like_m3u8: looksLikeM3U8,
    };
  } catch (error) {
    return {
      enabled: true,
      online: false,
      hls_url: STREAM_ENGINE_HLS_URL,
      error: error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function resolveLiveSource(stream, ext) {
  const fallbackPublic = process.env.PUBLIC_IP
    ? `http://${process.env.PUBLIC_IP}:8080/hls/live/stream.m3u8`
    : "";
  const publicHls = STREAM_ENGINE_PUBLIC_HLS_URL || fallbackPublic || STREAM_ENGINE_HLS_URL;

  if (STREAM_ENGINE_ENABLED && String(ext).toLowerCase() === "m3u8") {
    return publicHls;
  }

  return stream.url;
}

async function ensureAuth(req, res) {
  const { username, password } = req.query;
  if (!username || !password) {
    return { error: res.status(400).json({ error: "username and password are required" }) };
  }

  const user = await findUser(username, password);
  if (!user) {
    return { error: unauthorizedResponse(res) };
  }

  const userStatus = getUserStatus(user);
  if (!userStatus.ok) {
    return { error: disabledResponse(res, userStatus.message) };
  }

  return { user };
}

function toM3UChannel(req, user, channel, output = "ts") {
  const streamUrl = `${getBaseUrl(req)}/live/${user.username}/${user.password}/${channel.stream_id}.${output}`;
  return `#EXTINF:-1 tvg-id="${channel.epg_channel_id || ""}" group-title="Live",${channel.name}\n${streamUrl}`;
}

function toM3UVod(req, user, item) {
  const ext = item.container_extension || "mp4";
  const streamUrl = `${getBaseUrl(req)}/movie/${user.username}/${user.password}/${item.stream_id}.${ext}`;
  return `#EXTINF:-1 group-title="VOD",${item.name}\n${streamUrl}`;
}

function toXmlTv(req) {
  const { liveStreams } = getCatalog();
  const channels = liveStreams
    .map((stream) => {
      return `<channel id="${stream.epg_channel_id}"><display-name>${stream.name}</display-name></channel>`;
    })
    .join("");

  const programmes = liveStreams
    .flatMap((stream) => {
      const streamEpg = epg[stream.stream_id] || [];
      return streamEpg.map((item) => {
        return `<programme start="${item.start}" stop="${item.stop}" channel="${stream.epg_channel_id}"><title>${item.title}</title><desc>${item.description}</desc></programme>`;
      });
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><tv generator-info-name="3 Stars IPTV">${channels}${programmes}</tv>`;
}

app.get("/", (req, res) => {
  res.json({
    name: "3 Stars IPTV Xtream Backend",
    status: "ok",
    docs: {
      auth: `${getBaseUrl(req)}/player_api.php?username=demo&password=demo123`,
      m3u: `${getBaseUrl(req)}/get.php?username=demo&password=demo123&type=m3u_plus`,
      epg: `${getBaseUrl(req)}/xmltv.php?username=demo&password=demo123`,
    },
  });
});

app.get("/admin/panel", (req, res) => {
  return res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.post("/admin/login", authRateLimit, async (req, res) => {
  const username = String(req.body?.username || "");
  const password = String(req.body?.password || "");

  if (!username || !password) {
    metrics.admin_login_fail_total += 1;
    return res.status(400).json({ error: "username and password are required" });
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    metrics.admin_login_fail_total += 1;
    return res.status(401).json({ error: "Invalid admin credentials" });
  }

  const token = jwt.sign({ sub: username, role: "admin" }, ADMIN_JWT_SECRET, {
    expiresIn: ADMIN_JWT_EXPIRES_IN,
  });

  metrics.admin_login_success_total += 1;
  await writeAudit(req, { action: "admin_login", status: "success" });
  return res.json({ token, token_type: "Bearer", expires_in: ADMIN_JWT_EXPIRES_IN });
});

app.get("/health", async (req, res) => {
  const { liveStreams, vodStreams, series } = getCatalog();
  const users = await listUsers();
  const engine = await checkStreamingEngine();
  return res.json({
    status: "ok",
    service: "3 Stars IPTV Xtream Backend",
    now: new Date().toISOString(),
    users: users.length,
    live_streams: liveStreams.length,
    vod_streams: vodStreams.length,
    storage_mode: getStorageMode(),
    streaming_engine: engine,
  });
});

app.get("/admin/metrics", requireAdmin, (req, res) => {
  return res.json({
    ...metrics,
    uptime_seconds: Math.floor(process.uptime()),
    memory_rss: process.memoryUsage().rss,
    rate_window_seconds: RATE_WINDOW_SECONDS,
    rate_max_requests: RATE_MAX_REQUESTS,
    allow_legacy_admin_key: ALLOW_LEGACY_ADMIN_KEY,
  });
});

app.get("/admin/streaming/status", requireAdmin, async (req, res) => {
  const engine = await checkStreamingEngine();
  return res.json(engine);
});

app.get("/admin/catalog/status", requireAdmin, (req, res) => {
  const catalog = getCatalog();
  return res.json({
    source: catalog.source,
    imported_at: catalog.importedAt,
    totals: {
      live_categories: catalog.liveCategories.length,
      live_streams: catalog.liveStreams.length,
      vod_categories: catalog.vodCategories.length,
      vod_streams: catalog.vodStreams.length,
      series_categories: catalog.seriesCategories.length,
      series: catalog.series.length,
    },
  });
});

app.post("/admin/catalog/import-m3u", requireAdmin, async (req, res) => {
  const source = String(req.body?.url || M3U_SOURCE_URL || "").trim();
  if (!source) {
    return badAdminRequest(res, "M3U URL is required in body.url or M3U_SOURCE_URL env var");
  }

  try {
    const summary = await importFromM3UUrl(source);
    await writeAudit(req, {
      action: "admin_import_m3u",
      target: "catalog",
      status: "success",
      payload: summary,
    });
    return res.json({ message: "Catalog imported", ...summary });
  } catch (error) {
    await writeAudit(req, {
      action: "admin_import_m3u",
      target: "catalog",
      status: "failed",
      payload: { source, error: error.message },
    });
    return res.status(400).json({ error: error.message });
  }
});

app.get("/admin/audit-logs", requireAdmin, async (req, res) => {
  const logs = await listAuditLogs({
    limit: req.query.limit,
    action: req.query.action,
    actor: req.query.actor,
    target: req.query.target,
  });

  return res.json({
    count: logs.length,
    logs,
  });
});

app.get("/player_api.php", authRateLimit, async (req, res) => {
  const {
    liveCategories,
    liveStreams,
    vodCategories,
    vodStreams,
    seriesCategories,
    series,
  } = getCatalog();
  const auth = await ensureAuth(req, res);
  if (auth.error) return;

  const { user } = auth;
  const action = req.query.action;

  if (!action) {
    return res.json({
      user_info: buildUserInfo(user, req),
      server_info: buildServerInfo(req),
      available_channels: liveStreams,
    });
  }

  switch (action) {
    case "get_simple_data_table":
      return res.json({
        user_info: buildUserInfo(user, req),
        server_info: buildServerInfo(req),
      });
    case "get_live_categories":
      return res.json(liveCategories);
    case "get_live_streams": {
      const { category_id } = req.query;
      const items = category_id
        ? liveStreams.filter((item) => item.category_id === String(category_id))
        : liveStreams;

      const enriched = items.map((item) => ({
        ...item,
        stream_source: resolveLiveSource(item, "m3u8"),
      }));
      return res.json(enriched);
    }
    case "get_vod_categories":
      return res.json(vodCategories);
    case "get_vod_streams": {
      const { category_id } = req.query;
      const items = category_id
        ? vodStreams.filter((item) => item.category_id === String(category_id))
        : vodStreams;
      return res.json(items);
    }
    case "get_series_categories":
      return res.json(seriesCategories);
    case "get_series":
      return res.json(series);
    case "get_series_info": {
      const seriesId = Number(req.query.series_id);
      const selected = series.find((s) => Number(s.series_id) === seriesId);
      if (!selected) {
        return res.status(404).json({ error: "Series not found" });
      }

      return res.json({
        info: selected,
        episodes: {},
      });
    }
    case "get_live_info": {
      const liveId = Number(req.query.live_id);
      const selected = liveStreams.find((s) => Number(s.stream_id) === liveId);
      if (!selected) {
        return res.status(404).json({ error: "Live stream not found" });
      }

      return res.json({ info: selected });
    }
    case "get_epg": {
      const streamId = Number(req.query.stream_id);
      if (!streamId) {
        return res.json({ epg_listings: [] });
      }
      return res.json({ epg_listings: epg[streamId] || [] });
    }
    case "get_short_epg": {
      const streamId = Number(req.query.stream_id);
      const limit = Number(req.query.limit || 4);
      if (!streamId) {
        return res.json({ epg_listings: [] });
      }

      const items = epg[streamId] || [];
      return res.json({ epg_listings: items.slice(0, Math.max(limit, 0)) });
    }
    default:
      return res.status(400).json({ error: `Unsupported action: ${action}` });
  }
});

app.get("/admin/users", requireAdmin, async (req, res) => {
  await writeAudit(req, { action: "admin_list_users", status: "success" });
  const users = await listUsers();
  return res.json(
    users.map((u) => ({
      username: u.username,
      status: u.status,
      exp_date: u.exp_date,
      max_connections: u.max_connections,
      is_trial: u.is_trial,
      created_at: String(u.created_at || ""),
    })),
  );
});

app.post("/admin/users", requireAdmin, async (req, res) => {
  const { username, password, exp_date, status = "Active", max_connections = 1, is_trial = 0 } =
    req.body || {};

  if (!username || !password || !exp_date) {
    return badAdminRequest(res, "username, password, exp_date are required");
  }

  if (!isValidUsername(username)) {
    return badAdminRequest(res, "Invalid username format (3-32 chars: a-z A-Z 0-9 _ . -)");
  }

  if (!isValidPassword(password)) {
    return badAdminRequest(res, "Invalid password length (4-64 chars)");
  }

  if (!isPositiveInteger(exp_date)) {
    return badAdminRequest(res, "exp_date must be a positive unix timestamp");
  }

  if (!isPositiveInteger(max_connections)) {
    return badAdminRequest(res, "max_connections must be a positive integer");
  }

  if (![0, 1].includes(Number(is_trial))) {
    return badAdminRequest(res, "is_trial must be 0 or 1");
  }

  if (!isValidStatus(status)) {
    return badAdminRequest(res, "status must be Active or Disabled");
  }

  if (await findUserByUsername(username)) {
    return res.status(409).json({ error: "Username already exists" });
  }

  const newUser = {
    username: String(username),
    password: String(password),
    status: String(status),
    exp_date: String(exp_date),
    max_connections: Number(max_connections),
    is_trial: Number(is_trial),
    created_at: String(Math.floor(Date.now() / 1000)),
  };

  await upsertUser(newUser);
  await writeAudit(req, { action: "admin_create_user", target: newUser.username, status: "success" });

  return res.status(201).json({ message: "User created", user: { username: newUser.username } });
});

app.patch("/admin/users/:username", requireAdmin, async (req, res) => {
  const { username } = req.params;
  if (!isValidUsername(username)) {
    return badAdminRequest(res, "Invalid username format");
  }

  const user = await findUserByUsername(username);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const allowedFields = ["password", "status", "exp_date", "max_connections", "is_trial"];
  const patch = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
      if (field === "password") {
        if (!isValidPassword(req.body[field])) {
          return badAdminRequest(res, "Invalid password length (4-64 chars)");
        }
        patch[field] = String(req.body[field]);
      }

      if (field === "status") {
        if (!isValidStatus(req.body[field])) {
          return badAdminRequest(res, "status must be Active or Disabled");
        }
        patch[field] = String(req.body[field]);
      }

      if (field === "exp_date") {
        if (!isPositiveInteger(req.body[field])) {
          return badAdminRequest(res, "exp_date must be a positive unix timestamp");
        }
        patch[field] = String(req.body[field]);
      }

      if (field === "max_connections") {
        if (!isPositiveInteger(req.body[field])) {
          return badAdminRequest(res, "max_connections must be a positive integer");
        }
        patch[field] = Number(req.body[field]);
      }

      if (field === "is_trial") {
        const trial = Number(req.body[field]);
        if (![0, 1].includes(trial)) {
          return badAdminRequest(res, "is_trial must be 0 or 1");
        }
        patch[field] = trial;
      }
    }
  }

  if (!Object.keys(patch).length) {
    return badAdminRequest(res, "No valid fields provided for patch");
  }

  const updated = await updateUser(username, patch);
  await writeAudit(req, { action: "admin_update_user", target: updated.username, status: "success", patch });
  return res.json({ message: "User updated", username: updated.username });
});

app.delete("/admin/users/:username", requireAdmin, async (req, res) => {
  const { username } = req.params;
  if (!isValidUsername(username)) {
    return badAdminRequest(res, "Invalid username format");
  }

  const ok = await deleteUser(username);
  if (!ok) {
    return res.status(404).json({ error: "User not found" });
  }

  await writeAudit(req, { action: "admin_delete_user", target: username, status: "success" });
  return res.json({ message: "User deleted", username });
});

app.get("/get.php", authRateLimit, async (req, res) => {
  const { liveStreams, vodStreams } = getCatalog();
  const auth = await ensureAuth(req, res);
  if (auth.error) return;

  const { user } = auth;
  const type = String(req.query.type || "m3u_plus");
  const output = String(req.query.output || "ts").toLowerCase();

  if (!["m3u", "m3u_plus"].includes(type)) {
    return res.status(400).json({ error: "Unsupported playlist type" });
  }

  if (!["ts", "m3u8"].includes(output)) {
    return res.status(400).json({ error: "Unsupported output format" });
  }

  const header = "#EXTM3U";
  const channels = liveStreams.map((item) => toM3UChannel(req, user, item, output));
  const vod = vodStreams.map((item) => toM3UVod(req, user, item));
  const body = [header, ...channels, ...vod].join("\n");

  res.setHeader("Content-Type", "application/x-mpegURL; charset=utf-8");
  return res.send(body);
});

app.get("/xmltv.php", authRateLimit, async (req, res) => {
  const auth = await ensureAuth(req, res);
  if (auth.error) return;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  return res.send(toXmlTv(req));
});

app.get("/live/:username/:password/:streamId.:ext", authRateLimit, async (req, res) => {
  const { liveStreams } = getCatalog();
  const { username, password, streamId, ext } = req.params;
  const user = await findUser(username, password);

  if (!user) {
    return unauthorizedResponse(res);
  }

  const userStatus = getUserStatus(user);
  if (!userStatus.ok) {
    return disabledResponse(res, userStatus.message);
  }

  if (!["ts", "m3u8"].includes(String(ext).toLowerCase())) {
    return res.status(400).json({ error: "Unsupported live output format" });
  }

  const stream = liveStreams.find((s) => String(s.stream_id) === String(streamId));
  if (!stream) {
    return res.status(404).json({ error: "Live stream not found" });
  }

  const source = resolveLiveSource(stream, ext);
  return res.redirect(source);
});

app.get("/movie/:username/:password/:streamId.:ext", authRateLimit, async (req, res) => {
  const { vodStreams } = getCatalog();
  const { username, password, streamId } = req.params;
  const user = await findUser(username, password);

  if (!user) {
    return unauthorizedResponse(res);
  }

  const userStatus = getUserStatus(user);
  if (!userStatus.ok) {
    return disabledResponse(res, userStatus.message);
  }

  const item = vodStreams.find((s) => String(s.stream_id) === String(streamId));
  if (!item) {
    return res.status(404).json({ error: "VOD stream not found" });
  }

  return res.redirect(item.url);
});

async function start() {
  if (M3U_SOURCE_URL) {
    try {
      const summary = await importFromM3UUrl(M3U_SOURCE_URL);
      console.log(`M3U catalog import success source=${summary.source} live=${summary.totals.live_streams}`);
    } catch (error) {
      console.error(`M3U catalog import failed: ${error.message}`);
    }
  }

  if (isDatabaseEnabled) {
    await initDatabase();
    const migration = await migrateFileUsersToDatabase();
    console.log(`Storage mode=${getStorageMode()} migrated_users=${migration.inserted}`);
  }

  app.listen(port, () => {
    // Keep startup log minimal for receiver-friendly deployments.
    console.log(`3 Stars IPTV backend listening on port ${port}`);
  });
}

if (!isVercelRuntime) {
  start().catch((error) => {
    console.error("Failed to start backend:", error.message);
    process.exit(1);
  });
}

module.exports = app;
