#!/usr/bin/env node
/**
 * Instala o openssl quando (e SÓ quando) estamos numa imagem Alpine.
 *
 * POR QUE EXISTE. O time de engenharia resolveu isto com um one-liner no
 * `preinstall` do package.json:
 *
 *   if command -v apk >/dev/null 2>&1; then apk add --no-cache openssl; fi
 *
 * Funciona no node:20-alpine da Golden Pipeline e QUEBRA NO WINDOWS: o npm
 * executa scripts pelo `cmd.exe`, que não entende `command -v` nem `;`, e o
 * `npm install` morre com "-v foi inesperado neste momento". O time não viu
 * porque o CI deles só roda em Linux; na máquina de desenvolvimento daqui,
 * nenhum `npm install` passava.
 *
 * O QUE O OPENSSL RESOLVE. O node:20-alpine não traz openssl, e sem ele o
 * binário nativo do schema-engine do Prisma falha ao carregar libssl em
 * runtime: aparece só o aviso "Prisma failed to detect the libssl/openssl
 * version", e o `db push` seguinte falha com uma resposta que não é JSON.
 *
 * Fora do Alpine isto é no-op silencioso, que é o comportamento desejado em
 * Windows, macOS e nas imagens Debian.
 */
const { execFileSync } = require("node:child_process");

function temApk() {
  try {
    // `apk --version` em vez de `command -v apk`: execFileSync não passa por
    // shell nenhum, então não há sintaxe de shell para o cmd.exe interpretar
    // errado. Se o binário não existe, o próprio spawn falha e cai no catch.
    execFileSync("apk", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (process.platform !== "linux" || !temApk()) {
  process.exit(0);
}

try {
  execFileSync("apk", ["add", "--no-cache", "openssl"], { stdio: "inherit" });
} catch (erro) {
  // Não derruba a instalação: em imagem Alpine sem permissão de root, o
  // `apk add` falha, e ainda assim vale tentar seguir. O que de fato cobra o
  // engine correto é o verify-prisma-engine.cjs, logo depois no postinstall.
  console.warn("[openssl-no-alpine] apk add falhou, seguindo:", erro.message);
}
