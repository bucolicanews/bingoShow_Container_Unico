import { existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

function runSafe(command, args) {
  const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
  return spawnSync(executable, args, {
    cwd: root,
    stdio: "inherit"
  });
}

function ensureEnvProduction() {
  const envProd = path.join(root, ".env.production");
  const envProdExample = path.join(root, ".env.production.example");

  if (!existsSync(envProd) && existsSync(envProdExample)) {
    copyFileSync(envProdExample, envProd);
    console.log("Criado .env.production a partir de .env.production.example");
  }
}

console.log("[1/2] Instalando dependencias com npm ci...");
const ciResult = runSafe("npm", ["ci"]);

if (ciResult.status !== 0) {
  console.log("npm ci falhou. Tentando npm install como fallback...");
  const installResult = runSafe("npm", ["install"]);
  if (installResult.status !== 0) {
    process.exit(installResult.status ?? 1);
  }
}

console.log("[2/2] Preparando arquivo de ambiente de producao...");
ensureEnvProduction();

console.log("Bootstrap finalizado.");
console.log("Proximo passo local: npm run s-local-up");
console.log("Proximo passo container: npm run docker:up");
