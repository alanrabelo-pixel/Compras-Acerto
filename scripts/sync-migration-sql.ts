/**
 * Achata as migrations do Prisma pro formato plano que a Golden Pipeline já
 * espera (mesmo mecanismo usado por acerto-blocklist/acerto-credito-poc-backend/
 * acerto-metrics-backend — arquivo .sql único por migration, nome plano e
 * único, direto na pasta configurada em dbMigrations.<env>.targets[].path).
 *
 * Por quê: a Golden Pipeline detecta ".sql alterado" via `git diff` num
 * diretório e copia pro nome de arquivo — SEM preservar subpastas (isso é
 * uma característica do mecanismo, não um bug a corrigir aqui). O Prisma
 * gera uma pasta por migration, e TODO arquivo dentro se chama exatamente
 * "migration.sql" — sem achatar, todas colidiriam no mesmo nome.
 *
 * Como usar: depois de `npx prisma migrate dev`, rode
 *   npm run migrations:sync
 * e comite os dois (a pasta original do Prisma + o .sql achatado). Sem
 * rodar isso antes do merge, a migration nunca chega no banco — mesmo tipo
 * de armadilha silenciosa já documentada no acerto-metrics-backend pra EF
 * Core (2 incidentes reais lá por esse motivo exato).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PRISMA_MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");
const FLAT_OUTPUT_DIR = join(process.cwd(), "sql", "acerto-compras");

function main() {
  if (!existsSync(PRISMA_MIGRATIONS_DIR)) {
    console.error(`Pasta não encontrada: ${PRISMA_MIGRATIONS_DIR}`);
    process.exit(1);
  }

  mkdirSync(FLAT_OUTPUT_DIR, { recursive: true });

  const entries = readdirSync(PRISMA_MIGRATIONS_DIR).filter((name) =>
    statSync(join(PRISMA_MIGRATIONS_DIR, name)).isDirectory(),
  );

  let synced = 0;
  for (const folder of entries) {
    const sourceFile = join(PRISMA_MIGRATIONS_DIR, folder, "migration.sql");
    if (!existsSync(sourceFile)) continue;

    // Nome plano e único: o próprio nome da pasta do Prisma (timestamp +
    // descrição) já garante unicidade e ordenação cronológica correta —
    // o mecanismo da Golden Pipeline aplica os arquivos em ordem alfabética.
    const destFile = join(FLAT_OUTPUT_DIR, `${folder}.sql`);
    const content = readFileSync(sourceFile, "utf-8");

    if (existsSync(destFile) && readFileSync(destFile, "utf-8") === content) {
      continue; // já sincronizado, nada a fazer
    }

    writeFileSync(destFile, content, "utf-8");
    synced++;
    console.log(`--> sincronizado: ${folder}.sql`);
  }

  if (synced === 0) {
    console.log("Nada novo pra sincronizar — sql/acerto-compras/ já está atualizado.");
  } else {
    console.log(`\n${synced} migration(s) sincronizada(s). Não esqueça de comitar sql/acerto-compras/ junto.`);
  }
}

main();
