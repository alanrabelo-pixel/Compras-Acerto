import { NextRequest, NextResponse } from "next/server";

/**
 * Autenticação simples (Bearer token) para a API de integração com o futuro
 * ERP, mesmo padrão já usado nos crons (ver src/app/api/cron/*). O ERP
 * ainda não existe; este token é o que será entregue ao time responsável
 * por configurá-lo quando o projeto de integração começar.
 */
export function requireErpAuth(req: NextRequest): NextResponse | null {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.ERP_API_KEY}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
