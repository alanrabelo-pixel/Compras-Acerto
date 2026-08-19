import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { NovaSolicitacaoForm } from "@/components/NovaSolicitacaoForm";

export default async function NovaSolicitacaoPage({
  searchParams,
}: {
  searchParams: { origemContrato?: string };
}) {
  const session = await getServerSession(authOptions);

  // O e-mail de alerta de renovação manda para cá com ?origemContrato=<id>,
  // prometendo abrir a solicitação já preenchida a partir do contrato que está
  // vencendo. O parâmetro não era lido em lugar nenhum, então o formulário
  // abria em branco e a pessoa tinha que redigitar tudo, com o contrato numa
  // outra aba. Promessa quebrada na cara de quem recebeu o e-mail.
  const contratoDeOrigem = searchParams.origemContrato
    ? await prisma.contract.findUnique({
        where: { id: searchParams.origemContrato },
        select: {
          id: true,
          supplierName: true,
          supplierCnpj: true,
          contractObject: true,
          costCenter: true,
          diretoria: true,
          endDate: true,
        },
      })
    : null;

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
      <NovaSolicitacaoForm
        sessionRequester={sessionRequester}
        contratoDeOrigem={
          contratoDeOrigem && {
            id: contratoDeOrigem.id,
            fornecedor: contratoDeOrigem.supplierName,
            objeto: contratoDeOrigem.contractObject,
            centroDeCusto: contratoDeOrigem.costCenter,
            diretoria: contratoDeOrigem.diretoria,
            fimDaVigencia: contratoDeOrigem.endDate.toISOString(),
          }
        }
      />
    </AppShell>
  );
}
