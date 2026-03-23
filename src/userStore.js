const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { users: seedUsers } = require("../data/sampleData");

const USERS_FILE = path.join(__dirname, "..", "data", "users.json");
const AUDIT_FILE = path.join(__dirname, "..", "data", "admin-audit.log");
const projectRef = (() => {
  try {
    const url = new URL(process.env.SUPABASE_URL || "");
    return url.hostname.split(".")[0] || "";
  } catch (_) {
    return "";
  }
})();
const SUPABASE_DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.SUPABASE_PASSWORD || "";
const SUPABASE_DB_USER = process.env.SUPABASE_DB_USER || "postgres";
const SUPABASE_DB_HOST = process.env.SUPABASE_DB_HOST || (projectRef ? `db.${projectRef}.supabase.co` : "");
const SUPABASE_DB_PORT = Number(process.env.SUPABASE_DB_PORT || 5432);
const SUPABASE_DB_NAME = process.env.SUPABASE_DB_NAME || "postgres";
const DB_CONNECTION_STRING = process.env.DATABASE_URL
  || (SUPABASE_DB_HOST && SUPABASE_DB_PASSWORD
    ? `postgresql://${encodeURIComponent(SUPABASE_DB_USER)}:${encodeURIComponent(SUPABASE_DB_PASSWORD)}@${SUPABASE_DB_HOST}:${SUPABASE_DB_PORT}/${encodeURIComponent(SUPABASE_DB_NAME)}`
    : "");

const isDatabaseEnabled = Boolean(DB_CONNECTION_STRING);
let isDatabaseReady = false;
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: DB_CONNECTION_STRING,
      ssl: { rejectUnauthorized: false },
    });
  }

  return pool;
}

async function initDatabase() {
  if (!isDatabaseEnabled) return;

  const sql = `
    create table if not exists iptv_users (
      username text primary key,
      password text not null,
      status text not null default 'Active',
      exp_date text not null,
      max_connections integer not null default 1,
      is_trial integer not null default 0,
      created_at text not null
    );

    create table if not exists admin_audit_logs (
      id bigserial primary key,
      time timestamptz not null default now(),
      ip text,
      actor text,
      action text not null,
      target text,
      status text,
      patch jsonb,
      payload jsonb
    );

    create index if not exists idx_admin_audit_time on admin_audit_logs(time desc);
  `;

  try {
    await getPool().query(sql);
    isDatabaseReady = true;
  } catch (error) {
    isDatabaseReady = false;
    console.error(`Supabase init failed, falling back to file mode: ${error.message}`);
  }
}

function normalizeUser(user) {
  return {
    username: String(user.username),
    password: String(user.password),
    status: String(user.status || "Active"),
    exp_date: String(user.exp_date || "0"),
    max_connections: Number(user.max_connections || 1),
    is_trial: Number(user.is_trial || 0),
    created_at: String(user.created_at || Math.floor(Date.now() / 1000)),
  };
}

function ensureUsersFile() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(seedUsers, null, 2));
  }
}

function loadUsers() {
  ensureUsersFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    // If file is corrupt, reset from seed users.
  }

  fs.writeFileSync(USERS_FILE, JSON.stringify(seedUsers, null, 2));
  return [...seedUsers];
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

async function migrateFileUsersToDatabase() {
  if (!isDatabaseEnabled) return { enabled: false, inserted: 0 };

  await initDatabase();
  if (!isDatabaseReady) {
    return { enabled: false, inserted: 0 };
  }
  const users = loadUsers();
  let inserted = 0;

  for (const user of users) {
    const normalized = normalizeUser(user);
    await getPool().query(
      `
        insert into iptv_users (username, password, status, exp_date, max_connections, is_trial, created_at)
        values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (username) do update set
          password = excluded.password,
          status = excluded.status,
          exp_date = excluded.exp_date,
          max_connections = excluded.max_connections,
          is_trial = excluded.is_trial,
          created_at = excluded.created_at
      `,
      [
        normalized.username,
        normalized.password,
        normalized.status,
        normalized.exp_date,
        normalized.max_connections,
        normalized.is_trial,
        normalized.created_at,
      ],
    );
    inserted += 1;
  }

  return { enabled: true, inserted };
}

async function listUsers() {
  if (!isDatabaseEnabled) {
    return loadUsers();
  }

  await initDatabase();
  if (!isDatabaseReady) {
    return loadUsers();
  }

  try {
    const result = await getPool().query(
      "select username, password, status, exp_date, max_connections, is_trial, created_at from iptv_users order by username asc",
    );
    return result.rows.map(normalizeUser);
  } catch (error) {
    isDatabaseReady = false;
    return loadUsers();
  }
}

async function findUserByUsername(username) {
  if (!isDatabaseEnabled) {
    return loadUsers().find((u) => u.username === username) || null;
  }

  await initDatabase();
  if (!isDatabaseReady) {
    return loadUsers().find((u) => u.username === username) || null;
  }

  try {
    const result = await getPool().query(
      "select username, password, status, exp_date, max_connections, is_trial, created_at from iptv_users where username = $1 limit 1",
      [username],
    );
    return result.rows[0] ? normalizeUser(result.rows[0]) : null;
  } catch (error) {
    isDatabaseReady = false;
    return loadUsers().find((u) => u.username === username) || null;
  }
}

async function findUser(username, password) {
  if (!isDatabaseEnabled) {
    return loadUsers().find((u) => u.username === username && u.password === password) || null;
  }

  await initDatabase();
  if (!isDatabaseReady) {
    return loadUsers().find((u) => u.username === username && u.password === password) || null;
  }

  try {
    const result = await getPool().query(
      "select username, password, status, exp_date, max_connections, is_trial, created_at from iptv_users where username = $1 and password = $2 limit 1",
      [username, password],
    );
    return result.rows[0] ? normalizeUser(result.rows[0]) : null;
  } catch (error) {
    isDatabaseReady = false;
    return loadUsers().find((u) => u.username === username && u.password === password) || null;
  }
}

async function upsertUser(userData) {
  const normalized = normalizeUser(userData);
  if (!isDatabaseEnabled) {
    const users = loadUsers();
    const index = users.findIndex((u) => u.username === normalized.username);
    if (index >= 0) {
      users[index] = { ...users[index], ...normalized };
    } else {
      users.push(normalized);
    }
    saveUsers(users);
    return users.find((u) => u.username === normalized.username) || null;
  }

  await initDatabase();
  if (!isDatabaseReady) {
    const users = loadUsers();
    const index = users.findIndex((u) => u.username === normalized.username);
    if (index >= 0) {
      users[index] = { ...users[index], ...normalized };
    } else {
      users.push(normalized);
    }
    saveUsers(users);
    return users.find((u) => u.username === normalized.username) || null;
  }

  try {
    await getPool().query(
    `
      insert into iptv_users (username, password, status, exp_date, max_connections, is_trial, created_at)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (username) do update set
        password = excluded.password,
        status = excluded.status,
        exp_date = excluded.exp_date,
        max_connections = excluded.max_connections,
        is_trial = excluded.is_trial,
        created_at = excluded.created_at
    `,
    [
      normalized.username,
      normalized.password,
      normalized.status,
      normalized.exp_date,
      normalized.max_connections,
      normalized.is_trial,
      normalized.created_at,
    ],
    );
  } catch (error) {
    isDatabaseReady = false;
    const users = loadUsers();
    const index = users.findIndex((u) => u.username === normalized.username);
    if (index >= 0) {
      users[index] = { ...users[index], ...normalized };
    } else {
      users.push(normalized);
    }
    saveUsers(users);
    return users.find((u) => u.username === normalized.username) || null;
  }

  return findUserByUsername(normalized.username);
}

async function updateUser(username, patch) {
  if (!isDatabaseEnabled) {
    const users = loadUsers();
    const index = users.findIndex((u) => u.username === username);
    if (index < 0) return null;

    users[index] = { ...users[index], ...patch };
    saveUsers(users);
    return users[index];
  }

  await initDatabase();
  if (!isDatabaseReady) {
    const users = loadUsers();
    const index = users.findIndex((u) => u.username === username);
    if (index < 0) return null;

    users[index] = { ...users[index], ...patch };
    saveUsers(users);
    return users[index];
  }

  const current = await findUserByUsername(username);
  if (!current) return null;
  const next = normalizeUser({ ...current, ...patch, username: current.username });
  return upsertUser(next);
}

async function deleteUser(username) {
  if (!isDatabaseEnabled) {
    const users = loadUsers();
    const next = users.filter((u) => u.username !== username);
    if (next.length === users.length) {
      return false;
    }
    saveUsers(next);
    return true;
  }

  await initDatabase();
  if (!isDatabaseReady) {
    const users = loadUsers();
    const next = users.filter((u) => u.username !== username);
    if (next.length === users.length) {
      return false;
    }
    saveUsers(next);
    return true;
  }

  try {
    const result = await getPool().query("delete from iptv_users where username = $1", [username]);
    return Number(result.rowCount || 0) > 0;
  } catch (error) {
    isDatabaseReady = false;
    const users = loadUsers();
    const next = users.filter((u) => u.username !== username);
    if (next.length === users.length) {
      return false;
    }
    saveUsers(next);
    return true;
  }
}

async function appendAuditLog(entry) {
  if (!isDatabaseEnabled) return false;

  await initDatabase();
  if (!isDatabaseReady) return false;

  try {
    await getPool().query(
    `
      insert into admin_audit_logs (time, ip, actor, action, target, status, patch, payload)
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
    `,
    [
      entry.time || new Date().toISOString(),
      entry.ip || null,
      entry.actor || null,
      entry.action || "unknown",
      entry.target || null,
      entry.status || null,
      JSON.stringify(entry.patch || null),
      JSON.stringify(entry.payload || null),
    ],
    );
  } catch (error) {
    isDatabaseReady = false;
    return false;
  }

  return true;
}

async function listAuditLogs(options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
  const action = options.action ? String(options.action) : "";
  const actor = options.actor ? String(options.actor) : "";
  const target = options.target ? String(options.target) : "";

  if (isDatabaseEnabled) {
    await initDatabase();
    if (isDatabaseReady) {
      try {
        const clauses = [];
        const values = [];
        let idx = 1;

        if (action) {
          clauses.push(`action = $${idx}`);
          values.push(action);
          idx += 1;
        }

        if (actor) {
          clauses.push(`actor = $${idx}`);
          values.push(actor);
          idx += 1;
        }

        if (target) {
          clauses.push(`target = $${idx}`);
          values.push(target);
          idx += 1;
        }

        values.push(limit);
        const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
        const query = `
          select id, time, ip, actor, action, target, status, patch, payload
          from admin_audit_logs
          ${where}
          order by time desc
          limit $${idx}
        `;
        const result = await getPool().query(query, values);
        return result.rows;
      } catch (error) {
        isDatabaseReady = false;
      }
    }
  }

  if (!fs.existsSync(AUDIT_FILE)) {
    return [];
  }

  const lines = fs.readFileSync(AUDIT_FILE, "utf8").split(/\r?\n/).filter(Boolean);
  const parsed = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const row = JSON.parse(lines[i]);
      if (action && String(row.action || "") !== action) continue;
      if (actor && String(row.actor || "") !== actor) continue;
      if (target && String(row.target || "") !== target) continue;
      parsed.push(row);
      if (parsed.length >= limit) break;
    } catch (_) {
      // Skip malformed lines.
    }
  }

  return parsed;
}

function getStorageMode() {
  if (!isDatabaseEnabled) return "file";
  return isDatabaseReady ? "supabase-postgres" : "file-fallback";
}

function toUnixPlusDays(days) {
  const now = Math.floor(Date.now() / 1000);
  return String(now + Number(days) * 24 * 60 * 60);
}

module.exports = {
  USERS_FILE,
  isDatabaseEnabled,
  getStorageMode,
  initDatabase,
  migrateFileUsersToDatabase,
  loadUsers,
  saveUsers,
  listUsers,
  findUserByUsername,
  findUser,
  upsertUser,
  updateUser,
  deleteUser,
  appendAuditLog,
  listAuditLogs,
  toUnixPlusDays,
};
