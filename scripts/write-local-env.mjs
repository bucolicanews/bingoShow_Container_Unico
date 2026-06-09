import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
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

// Lê o .env existente e retorna um Map de key→value (preserva comentários separados)
function parseEnv(filePath) {
  const map = new Map();
  try {
    const lines = readFileSync(filePath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      map.set(key, val);
    }
  } catch {}
  return map;
}

function main() {
  const status = getStatusJson();

  const apiUrl =
    process.env.LOCAL_SUPABASE_PUBLIC_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    status.API_URL ||
    "http://127.0.0.1:54321";

  const anonKey = status.ANON_KEY || "";
  const serviceKey = status.SERVICE_ROLE_KEY || "";

  if (!anonKey) throw new Error("Nao foi possivel ler ANON_KEY do Supabase local.");
  if (!serviceKey) throw new Error("Nao foi possivel ler SERVICE_ROLE_KEY do Supabase local.");

  // Preserva valores do .env atual para não perder configurações manuais
  const existing = parseEnv(envPath);

  const merged = {
    VITE_SUPABASE_URL:           apiUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: anonKey,
    VITE_LIVE_SERVER_URL:        existing.get("VITE_LIVE_SERVER_URL") || "http://localhost:8082",
    SUPABASE_SERVICE_ROLE_KEY:   serviceKey,
    PORT:                        existing.get("PORT") || "8082",
    LOCAL_ADMIN_EMAIL:           process.env.LOCAL_ADMIN_EMAIL || existing.get("LOCAL_ADMIN_EMAIL") || "admin@bingo.local",
    LOCAL_ADMIN_PASSWORD:        process.env.LOCAL_ADMIN_PASSWORD || existing.get("LOCAL_ADMIN_PASSWORD") || "Admin123456!",
    LOCAL_ADMIN_NAME:            process.env.LOCAL_ADMIN_NAME || existing.get("LOCAL_ADMIN_NAME") || "Administrador Local",
  };

  const lines = [
    "# Gerado automaticamente por scripts/write-local-env.mjs",
    "# Ambiente: LOCAL (Supabase local + npm run dev:full)",
    "# Para trocar de ambiente, copie a seção correspondente do .env_ex para cá.",
    "",
    ...Object.entries(merged).map(([k, v]) => `${k}=${v}`),
    ""
  ];

  writeFileSync(envPath, lines.join("\n"), "utf8");
  console.log(`[write-local-env] .env atualizado: ${envPath}`);
  console.log(`  VITE_SUPABASE_URL=${apiUrl}`);
}

main();
