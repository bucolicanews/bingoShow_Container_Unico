import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env.production");

function getStatusJson() {
  const raw = execSync("supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(raw);
}

function main() {
  const status = getStatusJson();
  const anonKey = status.ANON_KEY || "";
  const lanProtocol = (process.env.LAN_PROTOCOL || "https").trim() || "https";
  const lanAppHost = (process.env.LAN_APP_HOST || "").trim();
  const lanSupabaseHost = (process.env.LAN_SUPABASE_HOST || "").trim();
  const lanLiveEnabled = (process.env.LAN_ENABLE_LIVE || "1").trim() !== "0";

  if (!anonKey) {
    throw new Error("Nao foi possivel ler ANON_KEY do Supabase local.");
  }

  const publicSupabaseUrl =
    process.env.VPS_SUPABASE_PUBLIC_URL ||
    (lanSupabaseHost ? `${lanProtocol}://${lanSupabaseHost}` : "") ||
    process.env.SUPABASE_PUBLIC_URL ||
    "http://127.0.0.1:54321";

  const liveServerUrl =
    process.env.VPS_LIVE_SERVER_URL ||
    (lanLiveEnabled && lanAppHost ? `${lanProtocol}://${lanAppHost}` : "") ||
    "";

  const envContent = [
    "# Gerado automaticamente por scripts/write-vps-local-env.mjs",
    "# Self-host VPS com Supabase local (sem Supabase Cloud).",
    `VITE_SUPABASE_URL=${publicSupabaseUrl}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${anonKey}`,
    `VITE_LIVE_SERVER_URL=${liveServerUrl}`,
    "PORT=8082",
    ""
  ].join("\n");

  writeFileSync(envPath, envContent, "utf8");
  console.log(`Arquivo .env.production atualizado em: ${envPath}`);
  console.log(`VITE_SUPABASE_URL=${publicSupabaseUrl}`);
  console.log(`VITE_LIVE_SERVER_URL=${liveServerUrl || "<vazio>"}`);
}

main();
