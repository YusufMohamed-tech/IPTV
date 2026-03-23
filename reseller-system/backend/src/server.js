const app = require("./app");
const env = require("./config/env");
const { connectDb } = require("./config/db");
const { ensureDefaultAdmin } = require("./services/seedAdmin");

async function start() {
  await connectDb();
  await ensureDefaultAdmin();

  app.listen(env.port, () => {
    console.log(`IPTV Reseller API running on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error.message);
  process.exit(1);
});
