#!/usr/bin/env node
/**
 * Verifica se o Prisma Client gerado (postinstall) realmente baixou os
 * engines de TODOS os binaryTargets declarados em prisma/schema.prisma.
 *
 * Por que isso existe: na Golden Pipeline, mais de uma vez o `prisma
 * generate` terminou "com sucesso" (sem erro, sem aviso, em <1s — tempo
 * incompatível com um download real de ~20MB+) mas sem trazer o engine
 * do binaryTarget explícito (linux-musl-openssl-3.0.x) — só descobrimos
 * isso pelo erro em runtime, no meio dos testes: "Prisma Client could
 * not locate the Query Engine for runtime X, but was generated for Y".
 *
 * Se algum target declarado estiver faltando, apaga o client gerado e
 * força um novo `prisma generate` do zero (até MAX_ATTEMPTS vezes). Se
 * mesmo assim continuar faltando, falha aqui com mensagem clara — em vez
 * de deixar o erro confuso do Prisma aparecer só depois, no meio da
 * suíte de testes.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SCHEMA_PATH = path.join(ROOT, "prisma", "schema.prisma");
const CLIENT_DIR = path.join(ROOT, "node_modules", ".prisma", "client");
const MAX_ATTEMPTS = 3;

function getDeclaredTargets() {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf-8");
  const match = schema.match(/binaryTargets\s*=\s*\[([^\]]*)\]/);
  if (!match) return []; // sem binaryTargets explícito: nada pra verificar aqui.
  return match[1]
    .split(",")
    .map((t) => t.trim().replace(/^["']|["']$/g, ""))
    .filter((t) => t && t !== "native"); // "native" é resolvido em runtime, não tem nome de arquivo fixo pra checar.
}

function missingTargets(targets) {
  if (!fs.existsSync(CLIENT_DIR)) return targets;
  const files = fs.readdirSync(CLIENT_DIR);
  return targets.filter(
    (target) => !files.some((f) => f.includes(`libquery_engine-${target}`)),
  );
}

const targets = getDeclaredTargets();
if (targets.length === 0) {
  process.exit(0);
}

let missing = missingTargets(targets);
for (let attempt = 1; attempt <= MAX_ATTEMPTS && missing.length > 0; attempt++) {
  console.warn(
    `--> Engine(s) faltando após generate: ${missing.join(", ")} (tentativa ${attempt}/${MAX_ATTEMPTS}). Forçando novo prisma generate...`,
  );
  fs.rmSync(CLIENT_DIR, { recursive: true, force: true });
  execSync("npx prisma generate", { stdio: "inherit" });
  missing = missingTargets(targets);
}

if (missing.length > 0) {
  console.error(
    `ERRO: Prisma Client sem engine para: ${missing.join(", ")} após ${MAX_ATTEMPTS} tentativas.`,
  );
  console.error(
    "Verifique conectividade com binaries.prisma.sh e o binaryTargets em prisma/schema.prisma.",
  );
  process.exit(1);
}

console.log(`--> Engines OK para todos os binaryTargets declarados: ${targets.join(", ")}.`);
