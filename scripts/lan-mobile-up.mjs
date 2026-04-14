import { execSync } from "node:child_process";

function run(command) {
  console.log(`\n> ${command}`);
  const appHost = process.env.LAN_APP_HOST || "bingo.up";

  execSync(command, {
    stdio: "inherit",
    env: {
      ...process.env,
      LAN_APP_HOST: appHost,
      LAN_PROTOCOL: process.env.LAN_PROTOCOL || "http",
      LAN_ENABLE_LIVE: process.env.LAN_ENABLE_LIVE || "0",
      VPS_SUPABASE_PUBLIC_URL: process.env.VPS_SUPABASE_PUBLIC_URL || `http://${appHost}/supabase`
    }
  });
}

function main() {
  run("supabase start");
  run("node scripts/write-local-env.mjs");
  run("node scripts/bootstrap-local-admin.mjs");
  run("node scripts/write-vps-local-env.mjs");
  run("docker compose up -d --build");
}

main();