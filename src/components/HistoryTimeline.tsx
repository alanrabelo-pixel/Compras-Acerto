import { STAGES } from "@/lib/workflow";
import type { Stage } from "@prisma/client";
import { stageDataFields, type StageHistoryRequest } from "@/components/StageHistoryPanel";

type StageEventLite = { id: string; fromStage: Stage | null; toStage: Stage; actor: { name: string } | null; createdAt: Date; comment: string | null };

/**
 * Histórico com acesso progressivo aos dados de cada etapa: cada linha é uma
 * transição registrada (StageEvent) e, ao clicar, expande os campos
 * preenchidos/decididos na etapa que a solicitação estava deixando naquele
 * momento (fromStage). Assim, ao chegar em qualquer etapa, inclusive
 * Concluído, dá pra abrir e ver o que foi preenchido em todas as etapas
 * anteriores, uma por uma, sem precisar de uma seção separada.
 */
export function HistoryTimeline({
  stageEvents, request, declaredByNames = {},
}: {
  stageEvents: StageEventLite[];
  request: StageHistoryRequest;
  declaredByNames?: Record<string, string>;
}) {
  return (
    <section className="card section-gap">
      <h2 className="card-title">Histórico</h2>
      <p style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: -4, marginBottom: 10 }}>
        Clique em uma etapa para ver o que foi preenchido/decidido nela.
      </p>
      {stageEvents.map((e, i) => {
        const stageOfData: Stage = e.fromStage ?? "SOLICITACAO";
        const fields = stageDataFields(stageOfData, request, declaredByNames);
        const isLast = i === stageEvents.length - 1;
        return (
          <details key={e.id}>
            <summary className="timeline-item" style={{ cursor: "pointer", borderBottom: isLast ? "none" : undefined }}>
              <span className="timeline-dot" />
              <span>
                {e.fromStage ? `${STAGES[e.fromStage].label} → ` : ""}
                <strong style={{ color: "var(--ink)" }}>{STAGES[e.toStage].label}</strong>
                {e.actor ? ` · ${e.actor.name}` : ""} · {new Date(e.createdAt).toLocaleString("pt-BR")}
                {e.comment ? `: ${e.comment}` : ""}
              </span>
            </summary>
            <div style={{ marginLeft: 20, marginTop: -4, marginBottom: 8, padding: 12, background: "var(--surface-muted)", borderRadius: 8 }}>
              {fields ?? <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Sem dados adicionais registrados nesta etapa.</span>}
            </div>
          </details>
        );
      })}
    </section>
  );
}
