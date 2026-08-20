import { CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import { ALERT_KINDS, type Alert as AlertData, type AlertKind } from "@/lib/dashboard-data";

export type Alert = AlertData;

const SEM_ALERTA = "Nenhum alerta no momento: operação dentro dos parâmetros esperados neste recorte.";

/** Vermelho antes de amarelo: numa lista cortada, o que some tem que ser o menos grave. */
function porGravidade(a: Alert, b: Alert) {
  if (a.severity === b.severity) return 0;
  return a.severity === "danger" ? -1 : 1;
}

function LinhaAlerta({ alerta }: { alerta: Alert }) {
  const style: React.CSSProperties = {
    display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, padding: "9px 12px", borderRadius: 8,
    background: alerta.severity === "danger" ? "var(--danger-bg)" : "var(--warning-bg)",
    color: "var(--ink)", textDecoration: "none",
  };
  const content = (
    <>
      <span aria-hidden style={{ display: "flex", marginTop: 1 }}>
        {alerta.severity === "danger" ? <AlertCircle size={15} strokeWidth={1.75} /> : <AlertTriangle size={15} strokeWidth={1.75} />}
      </span>
      <span>{alerta.text}</span>
    </>
  );
  return alerta.href ? <a href={alerta.href} style={style}>{content}</a> : <div style={style}>{content}</div>;
}

function SemAlertas() {
  return (
    <p style={{ fontSize: 12.5, color: "var(--acerto-green-dark)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
      <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden /> {SEM_ALERTA}
    </p>
  );
}

/**
 * Alertas inteligentes: cada um dispara só com dado real (limiar relativo
 * ou fato concreto), nunca com uma meta inventada. Ver geração em
 * src/lib/dashboard-data.ts.
 *
 * `limite` corta a lista. Ela não tem tamanho fixo: um contrato vencendo gera
 * uma linha, e um mês com sete contratos vencendo gera sete, empurrando o
 * resto do dashboard para baixo com uma parede amarela. Cortada, a lista mostra
 * os mais graves primeiro e diz quantos ficaram de fora, e quem quiser todos
 * expande o painel (ver AlertsPanelAgrupado).
 */
export function AlertsPanel({ alerts, limite }: { alerts: Alert[]; limite?: number }) {
  if (alerts.length === 0) return <SemAlertas />;

  const ordenados = [...alerts].sort(porGravidade);
  const visiveis = limite ? ordenados.slice(0, limite) : ordenados;
  const ocultos = ordenados.length - visiveis.length;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {visiveis.map((a, i) => <LinhaAlerta key={i} alerta={a} />)}
      {ocultos > 0 && (
        <p style={{ fontSize: 11.5, color: "var(--ink-muted)", margin: "2px 0 0" }}>
          +{ocultos} alerta(s) neste recorte. Expanda o painel para ver todos, agrupados por assunto.
        </p>
      )}
    </div>
  );
}

/**
 * A lista inteira em tela cheia, agrupada por assunto.
 *
 * Sem grupo, "todos os alertas" é a mesma pilha do painel compacto, só mais
 * longa: sete contratos vencendo intercalados com dois compradores fora da
 * média não formam nenhuma leitura. Agrupado, cada bloco vira uma tarefa
 * com dono provável (contratos, prazo, fornecedor) e dá para ver de longe
 * onde está a concentração de problema.
 *
 * A ordem dos grupos é a de ALERT_KINDS; dentro do grupo, o mais grave
 * primeiro. Nenhum alerta é criado, removido ou reescrito aqui.
 */
export function AlertsPanelAgrupado({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return <SemAlertas />;

  const criticos = alerts.filter((a) => a.severity === "danger").length;
  const chaves = Object.keys(ALERT_KINDS) as AlertKind[];
  const grupos = chaves
    .map((kind) => ({
      kind,
      titulo: ALERT_KINDS[kind],
      itens: alerts.filter((a) => a.kind === kind).sort(porGravidade),
    }))
    .filter((g) => g.itens.length > 0);

  // Rede de segurança: se algum dia nascer um alerta com assunto novo e o
  // rótulo não for cadastrado em ALERT_KINDS, ele aparece aqui em vez de
  // sumir da tela cheia sem ninguém notar.
  const semGrupo = alerts.filter((a) => !chaves.includes(a.kind));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: 0 }}>
        {alerts.length} alerta(s) no recorte atual{criticos > 0 ? `, ${criticos} de gravidade alta` : ""}.
        Cada um dispara a partir de um fato do banco ou de um limiar relativo, nunca de uma meta inventada.
      </p>

      {grupos.map((g) => (
        <section key={g.kind} style={{ display: "grid", gap: 8 }}>
          <h3
            style={{
              margin: 0, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
              color: "var(--ink-muted)", display: "flex", alignItems: "baseline", gap: 8,
            }}
          >
            {g.titulo}
            <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0 }}>{g.itens.length}</span>
          </h3>
          <div style={{ display: "grid", gap: 6 }}>
            {g.itens.map((a, i) => <LinhaAlerta key={i} alerta={a} />)}
          </div>
        </section>
      ))}

      {semGrupo.length > 0 && (
        <section style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)" }}>
            Outros
          </h3>
          <div style={{ display: "grid", gap: 6 }}>
            {semGrupo.map((a, i) => <LinhaAlerta key={i} alerta={a} />)}
          </div>
        </section>
      )}
    </div>
  );
}
