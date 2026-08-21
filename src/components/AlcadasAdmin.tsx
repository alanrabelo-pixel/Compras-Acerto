"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Power, Trash2 } from "lucide-react";
import { Button, Modal } from "@/components/ui";
import { ApprovalLevelPicker } from "@/components/ApprovalLevelPicker";
import { formatCurrency } from "@/lib/format";

export type FaixaAdmin = {
  level: number;
  label: string;
  maxValue: number | null;
  requiredApprovers: number;
  active: boolean;
};

/**
 * Administração das faixas de alçada da Aprovação final (ApprovalTier).
 *
 * Até 21/08/2026 esta lista era `[1, 2, 3]` escrito na página, e as faixas
 * eram constantes em workflow.ts: mudar um valor de corte exigia deploy.
 *
 * Duas coisas que a tela esconde de propósito, e que estão no schema:
 *
 * O NÚMERO da faixa não aparece. `level` é identidade estável, não posição:
 * uma faixa criada hoje entre a primeira e a segunda recebe o próximo número
 * livre, e mostrá-lo faria a lista parecer fora de ordem. Quem lê a tela vê
 * nome e intervalo, que é o que importa.
 *
 * O INTERVALO é calculado, não digitado. Você informa só o teto de cada
 * faixa; o piso é o teto da anterior. Pedir os dois abriria espaço para
 * buracos (nenhuma faixa cobre R$ 60 mil) e sobreposições (duas cobrem), que
 * é justamente o tipo de erro que a escada não pode ter.
 */
export function AlcadasAdmin({
  faixas,
  aprovadoresPorFaixa,
}: {
  faixas: FaixaAdmin[];
  /** level -> ids dos aprovadores já configurados (ApprovalLevelApprover). */
  aprovadoresPorFaixa: Record<number, string[]>;
}) {
  const router = useRouter();
  const [emEdicao, setEmEdicao] = useState<FaixaAdmin | null>(null);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const ativas = faixas.filter((f) => f.active);

  async function chamar(url: string, metodo: string, corpo?: unknown) {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error ?? "Não foi possível salvar.");
      setEmEdicao(null);
      setCriando(false);
      router.refresh();
      return dados;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function remover(faixa: FaixaAdmin) {
    const resposta = await chamar(`/api/approval-tiers/${faixa.level}`, "DELETE");
    // A rota decide entre apagar e desativar conforme a faixa já ter sido
    // usada. Quem clicou precisa saber qual das duas aconteceu, senão vê a
    // faixa continuar na lista (desativada) achando que o clique falhou.
    if (resposta?.desativada && !resposta?.jaEstavaDesativada) {
      setErro(resposta.motivo ?? "A faixa foi desativada em vez de apagada, porque já tem histórico.");
    }
  }

  return (
    <div className="section-gap">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 14 }}>
        <p className="page-subtitle" style={{ margin: 0 }}>
          Faixas de valor da etapa Aprovação, e o(s) aprovador(es) padrão de cada uma. O intervalo de cada faixa
          começa onde a anterior termina; a última não tem teto. Alterar uma faixa vale para as próximas aprovações,
          e não mexe nas já criadas.
        </p>
        <Button variant="primary" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => { setErro(null); setCriando(true); }}>
          <Plus size={15} strokeWidth={2} style={{ marginRight: 6, verticalAlign: -2 }} />
          Nova faixa
        </Button>
      </div>

      {erro && <p className="hint-box hint-box-warning">{erro}</p>}

      <div className="tabela-alcadas">
        {faixas.map((faixa) => {
          // Piso vem do teto da faixa anterior ATIVA. Faixa desativada não
          // participa do intervalo, senão a tela mostraria um piso que o
          // cálculo não usa.
          const anteriorAtiva = faixa.active ? ativas[ativas.findIndex((f) => f.level === faixa.level) - 1] : undefined;
          const piso = anteriorAtiva?.maxValue ?? null;
          return (
            <div
              key={faixa.level}
              className="linha-alcada"
              style={{ opacity: faixa.active ? 1 : 0.55 }}
            >
              <div>
                <strong>{faixa.label}</strong>
                {!faixa.active && <span className="badge badge-neutral" style={{ marginLeft: 8 }}>Desativada</span>}
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {piso === null ? "De R$ 0,00" : `Acima de ${formatCurrency(piso)}`}
                  {faixa.maxValue === null ? ", sem teto" : ` até ${formatCurrency(faixa.maxValue)}`}
                  {" · "}
                  {faixa.requiredApprovers === 1
                    ? "1 assinatura"
                    : `${faixa.requiredApprovers} assinaturas de pessoas distintas`}
                </div>
              </div>

              <div>
                <ApprovalLevelPicker level={faixa.level} initialApproverIds={aprovadoresPorFaixa[faixa.level] ?? []} />
              </div>

              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <Button variant="secondary" disabled={ocupado} onClick={() => { setErro(null); setEmEdicao(faixa); }} title="Editar faixa">
                  <Pencil size={14} strokeWidth={1.9} />
                </Button>
                <Button
                  variant="secondary"
                  disabled={ocupado}
                  title={faixa.active ? "Desativar faixa" : "Reativar faixa"}
                  onClick={() => chamar(`/api/approval-tiers/${faixa.level}`, "PATCH", { active: !faixa.active })}
                >
                  <Power size={14} strokeWidth={1.9} />
                </Button>
                <Button variant="danger" disabled={ocupado} onClick={() => remover(faixa)} title="Remover faixa">
                  <Trash2 size={14} strokeWidth={1.9} />
                </Button>
              </div>
            </div>
          );
        })}
        {faixas.length === 0 && (
          <p className="hint-box hint-box-danger">
            Nenhuma faixa de alçada cadastrada. Enquanto isso, a etapa Aprovação recusa toda criação de aprovação.
            Crie ao menos uma faixa, sem teto, para o fluxo voltar a funcionar.
          </p>
        )}
      </div>

      <FormularioDeFaixa
        aberto={criando}
        titulo="Nova faixa de alçada"
        inicial={null}
        ocupado={ocupado}
        onFechar={() => setCriando(false)}
        onSalvar={(dados) => chamar("/api/approval-tiers", "POST", dados)}
      />
      <FormularioDeFaixa
        aberto={emEdicao !== null}
        titulo="Editar faixa de alçada"
        inicial={emEdicao}
        ocupado={ocupado}
        onFechar={() => setEmEdicao(null)}
        onSalvar={(dados) => chamar(`/api/approval-tiers/${emEdicao?.level}`, "PATCH", dados)}
      />
    </div>
  );
}

function FormularioDeFaixa({
  aberto, titulo, inicial, ocupado, onFechar, onSalvar,
}: {
  aberto: boolean;
  titulo: string;
  inicial: FaixaAdmin | null;
  ocupado: boolean;
  onFechar: () => void;
  onSalvar: (dados: { label: string; maxValue: number | null; requiredApprovers: number }) => void;
}) {
  const [label, setLabel] = useState(inicial?.label ?? "");
  const [semTeto, setSemTeto] = useState(inicial ? inicial.maxValue === null : false);
  const [maxValue, setMaxValue] = useState<number | "">(inicial?.maxValue ?? "");
  const [assinaturas, setAssinaturas] = useState(inicial?.requiredApprovers ?? 1);

  // Reseta ao trocar de faixa: sem isto, abrir a edição de uma faixa e depois
  // de outra mostraria os valores da primeira.
  const [chave, setChave] = useState<number | null>(inicial?.level ?? null);
  if (aberto && chave !== (inicial?.level ?? null)) {
    setChave(inicial?.level ?? null);
    setLabel(inicial?.label ?? "");
    setSemTeto(inicial ? inicial.maxValue === null : false);
    setMaxValue(inicial?.maxValue ?? "");
    setAssinaturas(inicial?.requiredApprovers ?? 1);
  }

  const valido = label.trim().length > 0 && assinaturas >= 1 && (semTeto || (maxValue !== "" && Number(maxValue) > 0));

  return (
    <Modal open={aberto} onClose={onFechar} title={titulo}>
      <div style={{ display: "grid", gap: 12, minWidth: 340 }}>
        <div>
          <label className="label" htmlFor="faixa-nome">Nome da faixa</label>
          <input
            id="faixa-nome" className="input" value={label} autoFocus
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Nível 2 (até R$ 500 mil)"
          />
          <p className="help">É este nome que aparece na tela da solicitação e nos relatórios.</p>
        </div>

        <div>
          <label className="label" htmlFor="faixa-teto">Teto da faixa em R$</label>
          <input
            id="faixa-teto" className="input" type="number" min="0" step="0.01" inputMode="decimal"
            value={semTeto ? "" : maxValue} disabled={semTeto}
            onChange={(e) => setMaxValue(e.target.value === "" ? "" : Number(e.target.value))}
          />
          <label className="checkbox-row" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={semTeto} onChange={(e) => setSemTeto(e.target.checked)} />
            Esta é a faixa do topo, sem teto
          </label>
          <p className="help">
            O piso é o teto da faixa anterior, calculado sozinho. Só pode haver uma faixa do topo ativa.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="faixa-assinaturas">Assinaturas exigidas</label>
          <input
            id="faixa-assinaturas" className="input" type="number" min="1" step="1"
            value={assinaturas}
            onChange={(e) => setAssinaturas(Math.max(1, Number(e.target.value) || 1))}
          />
          <p className="help">
            Acima de 1, exige pessoas distintas decidindo em conjunto: é a dupla checagem dos valores altos.
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" onClick={onFechar}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={ocupado || !valido}
            onClick={() => onSalvar({ label: label.trim(), maxValue: semTeto ? null : Number(maxValue), requiredApprovers: assinaturas })}
          >
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
