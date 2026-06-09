import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

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
  const serviceKey = status.SERVICE_ROLE_KEY || "";
  const lanProtocol = (process.env.LAN_PROTOCOL || "https").trim() || "https";
  const lanAppHost = (process.env.LAN_APP_HOST || "").trim();
  const lanSupabaseHost = (process.env.LAN_SUPABASE_HOST || "").trim();
  const lanLiveEnabled = (process.env.LAN_ENABLE_LIVE || "1").trim() !== "0";

  if (!anonKey) throw new Error("Nao foi possivel ler ANON_KEY do Supabase local.");
  if (!serviceKey) throw new Error("Nao foi possivel ler SERVICE_ROLE_KEY do Supabase local.");

  const publicSupabaseUrl =
    process.env.VPS_SUPABASE_PUBLIC_URL ||
    (lanSupabaseHost ? `${lanProtocol}://${lanSupabaseHost}` : "") ||
    process.env.SUPABASE_PUBLIC_URL ||
    "http://127.0.0.1:54321";

  const liveServerUrl =
    process.env.VPS_LIVE_SERVER_URL ||
    (lanLiveEnabled && lanAppHost ? `${lanProtocol}://${lanAppHost}` : "") ||
    "http://localhost:8082";

  const adminEmail = process.env.LOCAL_ADMIN_EMAIL || "admin@bingo.local";
  const adminPassword = process.env.LOCAL_ADMIN_PASSWORD || "Admin123456!";
  const adminName = process.env.LOCAL_ADMIN_NAME || "Administrador Local";

  const lines = [
    "# Gerado automaticamente por scripts/write-vps-local-env.mjs",
    "# Ambiente: VPS / LAN (Supabase local com URL pública)",
    "# Para trocar de ambiente, copie a seção correspondente do .env_ex para cá.",
    "",
    `VITE_SUPABASE_URL=${publicSupabaseUrl}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${anonKey}`,
    `VITE_LIVE_SERVER_URL=${liveServerUrl}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceKey}`,
    "PORT=8082",
    `LOCAL_ADMIN_EMAIL=${adminEmail}`,
    `LOCAL_ADMIN_PASSWORD=${adminPassword}`,
    `LOCAL_ADMIN_NAME=${adminName}`,
    ""
  ];

  writeFileSync(envPath, lines.join("\n"), "utf8");
  console.log(`[write-vps-local-env] .env atualizado: ${envPath}`);
  console.log(`  VITE_SUPABASE_URL=${publicSupabaseUrl}`);
  console.log(`  VITE_LIVE_SERVER_URL=${liveServerUrl || "<vazio>"}`);
}

main();
