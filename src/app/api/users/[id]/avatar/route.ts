import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { saveFile, readFile } from "@/lib/storage";
import { loadCurrentUser } from "@/lib/current-user";

export const runtime = "nodejs";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const EXT_BY_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// POST /api/users/[id]/avatar: envia/atualiza a foto de perfil. Só a
// própria pessoa altera a própria foto, exige sessão SSO real (sem
// bypass: em LOCAL_BYPASS_AUTH não há um User de verdade "logado" pra
// comparar contra params.id, ver src/lib/current-user.ts).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const currentUser = await loadCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "É preciso estar autenticado (SSO) para alterar a foto de perfil." }, { status: 401 });
  }
  if (currentUser.id !== params.id) {
    return NextResponse.json({ error: "Você só pode alterar a própria foto de perfil." }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
  }
  const ext = EXT_BY_MIME[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Formato inválido. Envie uma imagem PNG, JPG ou WEBP." }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Imagem muito grande (máximo 2MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageUrl = await saveFile(`avatars/${params.id}`, `avatar.${ext}`, buffer);
  await prisma.user.update({ where: { id: params.id }, data: { avatarUrl: storageUrl } });

  return NextResponse.json({ avatarUrl: `/api/users/${params.id}/avatar` }, { status: 200 });
}

// GET /api/users/[id]/avatar: serve a imagem (local em dev, Vercel Blob em produção; ver src/lib/storage.ts).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { avatarUrl: true } });
  if (!user?.avatarUrl) {
    return NextResponse.json({ error: "Esta pessoa ainda não enviou uma foto de perfil." }, { status: 404 });
  }

  const buffer = await readFile(user.avatarUrl);
  const ext = user.avatarUrl.split(".").pop()?.toLowerCase() ?? "";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": mime, "Cache-Control": "private, max-age=0, must-revalidate" },
  });
}
