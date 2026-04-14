import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env.local");

function getStatusJson() {
  const raw = execSync("supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(raw);
}

function main() {
  const status = getStatusJson();

  const apiUrl =
    process.env.LOCAL_SUPABASE_PUBLIC_URL ||
    process.env.SUPABASE_PUBLIC_URL ||
    status.API_URL ||
    "http://127.0.0.1:54321";
  const publishable = status.ANON_KEY || "";

  if (!publishable) {
    throw new Error("Nao foi possivel ler ANON_KEY do Supabase local.");
  }

  const envContent = [
    "# Gerado automaticamente por scripts/write-local-env.mjs",
    "# Este arquivo trava o frontend no Supabase local.",
    `VITE_SUPABASE_URL=${apiUrl}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${publishable}`,
    ""
  ].join("\n");

  writeFileSync(envPath, envContent, "utf8");
  console.log(`Arquivo .env.local atualizado em: ${envPath}`);
}

main();
