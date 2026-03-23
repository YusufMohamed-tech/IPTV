const fs = require("fs");
const path = require("path");

const sourceFile = path.join(__dirname, "..", "data", "users.json");
const backupRoot = process.env.USERS_BACKUP_DIR || path.join(__dirname, "..", "backups", "users");
const retention = Number(process.env.USERS_BACKUP_RETENTION || 14);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function stamp() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}-${h}${min}${s}`;
}

function pruneOldBackups(dir, keep) {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => ({
      name,
      fullPath: path.join(dir, name),
      mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const remove = files.slice(Math.max(keep, 0));
  for (const file of remove) {
    fs.unlinkSync(file.fullPath);
  }

  return { total: files.length, removed: remove.length };
}

function main() {
  if (!fs.existsSync(sourceFile)) {
    console.error(`Source file not found: ${sourceFile}`);
    process.exit(1);
  }

  ensureDir(backupRoot);

  const outFile = path.join(backupRoot, `users-${stamp()}.json`);
  fs.copyFileSync(sourceFile, outFile);

  const result = pruneOldBackups(backupRoot, retention);
  console.log(
    `Backup created: ${outFile} | total_before_prune=${result.total} removed=${result.removed} keep=${retention}`,
  );
}

main();
