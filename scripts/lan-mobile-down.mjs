import { execSync } from "node:child_process";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, {
    stdio: "inherit",
    env: process.env
  });
}

function main() {
  run("docker compose down");
  run("supabase stop");
}

main();