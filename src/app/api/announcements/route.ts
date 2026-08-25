import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadCurrentUser } from "@/lib/current-user";
import { bypassAuthAtivo } from "@/lib/bypass";

// Sem parâmetro no GET, o Next.js tenta pré-renderizar esta rota em tempo de
// build (acha que é "estática") e quebra o build sem banco disponível, por
// exemplo no runner de CI. force-dynamic desliga essa tentativa. Veio da
// versão de infraestrutura do time de engenharia, em 25/08/2026.
export const dynamic = "force-dynamic";

// GET /api/announcements: lista os comunicados mais recentes (leitura
// aberta a qualquer pessoa autenticada/bypass, sem alçada).
export async function GET() {
  const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  return NextResponse.json(announcements);
}

// POST /api/announcements: publica um novo comunicado geral. Só ADMIN (em
// LOCAL_BYPASS_AUTH, ver .env, o "Modo local" sempre atua como ADMIN, mesma
// regra já usada em AppShell.tsx/rbac.ts).
export async function POST(req: NextRequest) {
  const bypass = bypassAuthAtivo();
  if (!bypass) {
    const currentUser = await loadCurrentUser();
    if (!currentUser?.isAdmin) {
      return NextResponse.json({ error: "Só administradores podem publicar comunicados." }, { status: 403 });
    }
  }

  const body = await req.json();
  const { title, body: message, authorName } = body;
  if (!title || !message || !authorName) {
    return NextResponse.json({ error: "Preencha o título e a mensagem do comunicado." }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({ data: { title, body: message, authorName } });
  return NextResponse.json(announcement, { status: 201 });
}
