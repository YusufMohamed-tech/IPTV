const { initDatabase, migrateFileUsersToDatabase, isDatabaseEnabled } = require("../src/userStore");

async function main() {
  if (!isDatabaseEnabled) {
    console.error("Supabase/Postgres is not configured. Set SUPABASE_URL + SUPABASE_DB_PASSWORD or DATABASE_URL.");
    process.exit(1);
  }

  await initDatabase();
  const result = await migrateFileUsersToDatabase();
  console.log(`Migration completed. inserted_or_updated=${result.inserted}`);
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
