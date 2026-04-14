import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function readSupabaseStatus() {
  try {
    return execSync("supabase status", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch {
    return "";
  }
}

function readSupabaseStatusJson() {
  try {
    const raw = execSync("supabase status -o json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseFromStatus(statusText, label) {
  const regex = new RegExp(`${label}\\s*\\|\\s*(\\S+)`, "i");
  const match = statusText.match(regex);
  return match?.[1] ?? "";
}

async function ensureDefaultAdmin() {
  const statusJson = readSupabaseStatusJson();
  const statusText = readSupabaseStatus();

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    statusJson?.API_URL ||
    parseFromStatus(statusText, "Project URL") ||
    "http://127.0.0.1:54321";

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    statusJson?.SERVICE_ROLE_KEY ||
    parseFromStatus(statusText, "Secret");

  if (!serviceRoleKey) {
    throw new Error(
      "Nao foi possivel encontrar a chave Secret do Supabase local. Defina SUPABASE_SERVICE_ROLE_KEY ou rode 'supabase start' antes."
    );
  }

  const adminEmail = process.env.LOCAL_ADMIN_EMAIL || "admin@bingo.local";
  const adminPassword = process.env.LOCAL_ADMIN_PASSWORD || "Admin123456!";
  const adminName = process.env.LOCAL_ADMIN_NAME || "Administrador Local";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (listError) {
    throw new Error(`Falha ao listar usuarios: ${listError.message}`);
  }

  let user = usersData?.users?.find((u) => u.email?.toLowerCase() === adminEmail.toLowerCase());

  if (!user) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName }
    });

    if (createError) {
      throw new Error(`Falha ao criar admin padrao: ${createError.message}`);
    }

    user = created.user;
  }

  if (!user?.id) {
    throw new Error("Nao foi possivel obter o ID do usuario admin.");
  }

  const userId = user.id;

  const { error: adminsError } = await supabase.from("admins").upsert(
    {
      id: userId,
      full_name: adminName,
      role: "admin",
      bloqueado: false
    },
    { onConflict: "id" }
  );

  if (adminsError) {
    throw new Error(`Falha ao ajustar tabela admins: ${adminsError.message}`);
  }

  const { error: perfisError } = await supabase.from("perfis").upsert(
    {
      id: userId,
      full_name: adminName,
      role: "admin",
      bloqueado: false,
      admins_id: userId
    },
    { onConflict: "id" }
  );

  if (perfisError) {
    throw new Error(`Falha ao ajustar perfil admin: ${perfisError.message}`);
  }

  const { error: modulosError } = await supabase.from("admin_modulos").upsert(
    {
      admin_id: userId,
      modulo_bingo: true,
      modulo_rifa: true
    },
    { onConflict: "admin_id" }
  );

  if (modulosError) {
    throw new Error(`Falha ao ajustar modulos do admin: ${modulosError.message}`);
  }

  const { data: cfgRow, error: cfgSelectError } = await supabase
    .from("configuracoes")
    .select("id")
    .eq("admin_id", userId)
    .limit(1)
    .maybeSingle();

  if (cfgSelectError) {
    throw new Error(`Falha ao buscar configuracoes do admin: ${cfgSelectError.message}`);
  }

  if (!cfgRow) {
    const { error: cfgInsertError } = await supabase.from("configuracoes").insert({
      admin_id: userId,
      singleton: false
    });

    if (cfgInsertError) {
      throw new Error(`Falha ao criar configuracoes do admin: ${cfgInsertError.message}`);
    }
  }

  console.log("Admin local pronto:");
  console.log(`- email: ${adminEmail}`);
  console.log(`- senha: ${adminPassword}`);
}

ensureDefaultAdmin().catch((err) => {
  console.error("Erro no bootstrap do admin local:", err.message);
  process.exit(1);
});
