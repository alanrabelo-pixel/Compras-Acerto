import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { NovaSolicitacaoForm } from "@/components/NovaSolicitacaoForm";

export default async function NovaSolicitacaoPage() {
  const session = await getServerSession(authOptions);

  // Com SSO ativo, quem abre a solicitação já é conhecido pela sessão, então não
  // faz sentido pedir pra escolher "quem está solicitando" numa lista. O User já
  // existe neste ponto (upsert acontece no signIn callback do NextAuth). Sem
  // sessão real (ex: LOCAL_BYPASS_AUTH, ver .env), sessionRequester fica nulo
  // e o formulário volta a mostrar o seletor manual, como hoje.
  const sessionRequester = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, name: true, email: true },
      })
    : null;

  return (
    <AppShell active="/solicitacoes">
      <NovaSolicitacaoForm sessionRequester={sessionRequester} />
    </AppShell>
  );
}
