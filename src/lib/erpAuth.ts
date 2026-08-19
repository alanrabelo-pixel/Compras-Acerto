import { NextRequest, NextResponse } from "next/server";
import { verificarTokenDeMaquina } from "@/lib/segredos";

/**
 * Autenticação simples (Bearer token) para a API de integração com o futuro
 * ERP, mesmo padrão já usado nos crons (ver src/app/api/cron/*). O ERP
 * ainda não existe; este token é o que será entregue ao time responsável
 * por configurá-lo quando o projeto de integração começar.
 *
 * A comparação vive em src/lib/segredos.ts: antes era `!==` direto contra a
 * interpolação da variável, o que aceitava "Bearer undefined" quando ela não
 * estava definida e ainda era vulnerável a ataque de tempo.
 */
export function requireErpAuth(req: NextRequest): NextResponse | null {
  const resultado = verificarTokenDeMaquina(req.headers.get("authorization"), "ERP_API_KEY");
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: resultado.status });
  }
  return null;
}
