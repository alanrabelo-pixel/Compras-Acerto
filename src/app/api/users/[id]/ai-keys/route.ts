import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { bypassAuthAtivo } from "@/lib/bypass";

/**
 * GET /api/users/[id]/ai-keys: status das chaves pessoais de IA (Claude e
 * Gemini) de um usuário. Nunca retorna o valor da chave, só se está
 * configurada. Isso evita expor o segredo em qualquer resposta de API.
 *
 * PATCH /api/users/[id]/ai-keys: salva/atualiza as chaves pessoais do
 * próprio usuário. Enviar um campo ausente/undefined preserva a chave atual;
 * só um campo explicitamente enviado é alterado (limpa se vier string vazia).
 * Pedido do usuário: os Assistentes de IA usam a chave de quem está atuando
 * na etapa no momento, não uma chave única do app (ver src/lib/integrations/ai.ts).
 *
 * Autenticação por sessão real (mesmo padrão de src/app/api/users/[id]/route.ts)
 * porque isso grava uma credencial: confiar num id enviado no corpo/params
 * sem checar a sessão permitiria a qualquer pessoa ler o status ou sobrescrever
 * a chave pessoal de outra. Só o dono da conta (ou ADMIN) pode ver/alterar.
 * Respeita LOCAL_BYPASS_AUTH (ver .env e middleware.ts) para uso local
 * enquanto o SSO real não está configurado.
 */
async function requireSelfOrAdmin(userId: string): Promise<string | null> {
  if (bypassAuthAtivo()) return null;
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; roles?: string[] } | undefined;
  if (!session || !sessionUser?.id) return "Não autenticado.";
  if (sessionUser.id === userId) return null;
  if (sessionUser.roles?.includes("ADMIN")) return null;
  return "Você só pode ver/alterar suas próprias chaves de IA.";
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireSelfOrAdmin(params.id);
  if (authError) return NextResponse.json({ error: authError }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { anthropicApiKey: true, geminiApiKey: true },
  });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  return NextResponse.json({
    anthropicConfigured: Boolean(user.anthropicApiKey),
    geminiConfigured: Boolean(user.geminiApiKey),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const authError = await requireSelfOrAdmin(params.id);
  if (authError) return NextResponse.json({ error: authError }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const body = await req.json();
  const { anthropicApiKey, geminiApiKey } = body as { anthropicApiKey?: string; geminiApiKey?: string };

  // Criptografadas em repouso (ver src/lib/crypto.ts): nunca gravamos texto
  // puro a partir daqui, mesmo que a leitura (ai-insight route) ainda saiba
  // lidar com chaves antigas não criptografadas por compatibilidade.
  const data: { anthropicApiKey?: string | null; geminiApiKey?: string | null } = {};
  if (anthropicApiKey !== undefined) data.anthropicApiKey = anthropicApiKey.trim() ? encryptSecret(anthropicApiKey.trim()) : null;
  if (geminiApiKey !== undefined) data.geminiApiKey = geminiApiKey.trim() ? encryptSecret(geminiApiKey.trim()) : null;

  await prisma.user.update({ where: { id: params.id }, data });

  const updated = await prisma.user.findUnique({
    where: { id: params.id },
    select: { anthropicApiKey: true, geminiApiKey: true },
  });
  return NextResponse.json({
    anthropicConfigured: Boolean(updated?.anthropicApiKey),
    geminiConfigured: Boolean(updated?.geminiApiKey),
  });
}
