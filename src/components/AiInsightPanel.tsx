"use client";

import { useEffect, useState } from "react";

type Insight = {
  id: string;
  stage: string;
  anthropicPayload: string | null;
  anthropicModel: string | null;
  anthropicError: string | null;
  geminiPayload: string | null;
  geminiModel: string | null;
  geminiError: string | null;
  createdAt: string;
  requestedBy: { name: string } | null;
};

type Payload = {
  summary: string;
  highlights: string[];
  cautions: string[];
  recommendation: string | null;
  nextStep: string | null;
  draftMessage: string | null;
};

function parsePayload(json: string | null): Payload | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const STAGE_CONFIG: Record<
  string,
  { label: string; highlights: string; cautions: string; recommendation: string }
> = {
  TRIAGEM: { label: "Triagem", highlights: "Informações a confirmar", cautions: "Sinais de risco", recommendation: "Faixa sugerida" },
  DUE_DILIGENCE: { label: "Due Diligence", highlights: "Riscos identificados", cautions: "Verificar com o fornecedor", recommendation: "Recomendação" },
  COTACAO: { label: "Cotação", highlights: "Pontos para abordar", cautions: "O que evitar", recommendation: "Faixa sugerida" },
  MAPA_COTACAO: { label: "Mapa de Cotação", highlights: "Pontos para abordar", cautions: "O que evitar", recommendation: "Faixa sugerida" },
  JURIDICO: { label: "Jurídico", highlights: "Cláusulas de risco a verificar", cautions: "Cláusulas a garantir", recommendation: "Recomendação" },
  APROVACAO: { label: "Aprovação", highlights: "Pontos favoráveis", cautions: "Sinalizações e riscos", recommendation: "Parecer" },
  MAPEAMENTO_CONTRATO: { label: "Mapeamento de Contrato", highlights: "Pontos incompletos/vagos", cautions: "Cláusulas ausentes", recommendation: "Recomendação" },
};

/**
 * Painel de IA genérico (pedido do usuário), usado em todas as etapas onde
 * um assistente é aplicável: Triagem, Due Diligence, Cotação, Mapa de
 * Cotação, Jurídico e Mapeamento de Contrato. Roda Anthropic e Gemini em
 * paralelo e mostra as duas sugestões lado a lado.
 *
 * `draft` carrega campos que a pessoa está preenchendo no formulário mas
 * ainda não salvou (ex: observações do Jurídico, dados do contrato), para a
 * IA reagir ao que está sendo digitado.
 */
export function AiInsightPanel({
  requestId,
  stage,
  actorId,
  draft,
}: {
  requestId: string;
  stage: string;
  actorId: string;
  draft?: Record<string, unknown>;
}) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/requests/${requestId}/ai-insight`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setInsights(Array.isArray(data) ? data : []);
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/ai-insight`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, draft: draft ?? {} }),
      });
      const data = await res.json();
      if (!res.ok && !data.id) throw new Error(data.error ?? "Erro ao gerar análise de IA.");
      setInsights((prev) => [data, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setGenerating(false);
    }
  }

  const [latest, ...older] = insights;

  return (
    <section className="ai-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 className="ai-panel-title">Assistente de IA</h3>
        <button
          className="btn btn-secondary"
          disabled={generating || !actorId}
          onClick={generate}
          style={{ fontSize: 11.5, padding: "6px 12px" }}
        >
          {generating ? "Gerando..." : "Gerar análise (Claude + Gemini)"}
        </button>
      </div>

      {!actorId && (
        <p style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
          Selecione o responsável acima para gerar uma análise.
        </p>
      )}

      {error && <p style={{ fontSize: 12, color: "var(--danger)" }}>{error}</p>}

      {loadingList && <p style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>Carregando histórico...</p>}

      {!loadingList && insights.length === 0 && !error && (
        <p style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>Nenhuma análise gerada ainda. Use o botão acima para pedir uma leitura da IA sobre esta etapa.</p>
      )}

      {latest && <InsightCard insight={latest} highlight />}

      {older.length > 0 && (
        <details>
          <summary style={{ fontSize: 11.5, color: "var(--ink-muted)", cursor: "pointer" }}>
            Ver {older.length} análise(s) anterior(es)
          </summary>
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {older.map((insight) => (
              <InsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function InsightCard({ insight, highlight }: { insight: Insight; highlight?: boolean }) {
  const config = STAGE_CONFIG[insight.stage] ?? {
    label: insight.stage,
    highlights: "Pontos identificados",
    cautions: "Pontos de atenção",
    recommendation: "Recomendação",
  };

  return (
    <div className={`ai-insight-card${highlight ? " latest" : ""}`}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--ink-muted)" }}>
        <span>
          {config.label} · {insight.requestedBy?.name ?? "-"}
        </span>
        <span>{new Date(insight.createdAt).toLocaleString("pt-BR")}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <ProviderColumn
          label="Claude"
          payload={parsePayload(insight.anthropicPayload)}
          errorMsg={insight.anthropicError}
          config={config}
        />
        <ProviderColumn
          label="Gemini"
          payload={parsePayload(insight.geminiPayload)}
          errorMsg={insight.geminiError}
          config={config}
        />
      </div>
    </div>
  );
}

function ProviderColumn({
  label,
  payload,
  errorMsg,
  config,
}: {
  label: string;
  payload: Payload | null;
  errorMsg: string | null;
  config: { highlights: string; cautions: string; recommendation: string };
}) {
  return (
    <div className="ai-provider-col">
      <p className="ai-provider-label">{label}</p>
      {!payload && errorMsg && <p style={{ color: "var(--danger)", fontSize: 10.5 }}>{errorMsg}</p>}
      {payload && (
        <>
          <p style={{ fontWeight: 600 }}>{payload.summary}</p>
          {payload.highlights.length > 0 && (
            <div>
              <p style={{ fontWeight: 700, fontSize: 10.5 }}>{config.highlights}</p>
              <ul style={{ margin: "2px 0 0 14px", padding: 0 }}>
                {payload.highlights.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          )}
          {payload.cautions.length > 0 && (
            <div>
              <p style={{ fontWeight: 700, fontSize: 10.5, color: "var(--danger)" }}>{config.cautions}</p>
              <ul style={{ margin: "2px 0 0 14px", padding: 0 }}>
                {payload.cautions.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
          )}
          {payload.recommendation && (
            <p>
              <strong>{config.recommendation}:</strong> {payload.recommendation}
            </p>
          )}
          {payload.nextStep && (
            <p>
              <strong>Próximo passo:</strong> {payload.nextStep}
            </p>
          )}
          {payload.draftMessage && <DraftMessageBlock text={payload.draftMessage} />}
        </>
      )}
    </div>
  );
}

/**
 * Rascunho de mensagem para um terceiro externo (fornecedor), items 2.4/2.7
 * do diagnóstico de IA: nunca enviado automaticamente, só copiado para quem
 * for revisar e mandar pelo canal de sempre (e-mail, WhatsApp do fornecedor).
 */
function DraftMessageBlock({ text }: { text: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(text);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div style={{ marginTop: 4, border: "1px dashed var(--border)", borderRadius: 8, padding: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <p style={{ fontWeight: 700, fontSize: 10.5, margin: 0 }}>Rascunho para o fornecedor — revise antes de enviar</p>
        <button type="button" className="btn btn-secondary" style={{ fontSize: 10, padding: "3px 8px" }} onClick={copiar}>
          {copiado ? "Copiado!" : "Copiar"}
        </button>
      </div>
      <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{text}</p>
    </div>
  );
}
