// Carrega e valida as variáveis de ambiente. Nunca expõe estes valores ao frontend —
// só este processo (backend) os lê.
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");

try {
  process.loadEnvFile(path.join(__dirname, "..", "..", ".env"));
} catch {
  // .env ainda não existe (ex.: primeira execução) — segue com as variáveis já presentes
  // no ambiente, se houver. A validação abaixo garante que nada crítico fique faltando.
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(
      `[configuração] Falta ${name}. O arquivo server/.env não existe ou está incompleto. Ao passar o sistema para outro computador, copie o server/.env do computador de origem (ele não vai pelo GitHub) ou use server/.env.example como modelo.`
    );
    process.exit(1);
  }
  return value;
}

const NODE_ENV = process.env.NODE_ENV || "development";
// A porta vem do ambiente do servidor (PORT no .env ou na hospedagem); o sistema não impõe uma.
// O 3000 é só o padrão do Node quando nada foi definido.
const PORT = parseInt(process.env.PORT || "3000", 10);

const ADMIN_USERNAME = required("ADMIN_USERNAME");
const ADMIN_PASSWORD_HASH = required("ADMIN_PASSWORD_HASH");
const ADMIN_ACCESS_KEY = required("ADMIN_ACCESS_KEY");

// SESSION_SECRET: se não vier do .env, é gerado uma vez e guardado em <pasta de dados>/session.secret
// (fora do GitHub), assim as sessões sobrevivem a reinícios sem nenhuma configuração.
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const dir = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
  const arquivo = path.join(dir, "session.secret");
  try {
    const salvo = fs.readFileSync(arquivo, "utf8").trim();
    if (salvo.length >= 32) return salvo;
  } catch {
    // ainda não existe: cria abaixo
  }
  const novo = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(arquivo, novo, { mode: 0o600 });
  } catch (err) {
    console.warn("[configuração] Não foi possível guardar o SESSION_SECRET (" + err.message + "); as sessões serão perdidas ao reiniciar.");
  }
  return novo;
}
const SESSION_SECRET = sessionSecret();

const SESSION_MAX_AGE_MINUTES = parseInt(process.env.SESSION_MAX_AGE_MINUTES || "30", 10);
const LOGIN_MAX_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || "5", 10);
const LOGIN_LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || "15", 10);

// Login desligado por padrão: todo acesso entra direto como administrador. Para voltar a exigir
// login, defina REQUIRE_LOGIN=true em server/.env.
const REQUIRE_LOGIN = process.env.REQUIRE_LOGIN === "true";

module.exports = {
  REQUIRE_LOGIN,
  NODE_ENV,
  PORT,
  ADMIN_USERNAME,
  ADMIN_PASSWORD_HASH,
  ADMIN_ACCESS_KEY,
  SESSION_SECRET,
  SESSION_MAX_AGE_MINUTES,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES
};
