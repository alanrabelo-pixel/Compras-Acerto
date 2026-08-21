"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Field } from "@/components/ui/Field";
import {
  BASES_DE_ORCAMENTO_EXTRA,
  BASE_DE_ORCAMENTO_EXTRA_LABEL,
  IMPACTOS_DE_ORCAMENTO_EXTRA,
  IMPACTO_DE_ORCAMENTO_EXTRA_LABEL,
} from "@/lib/orcamento-extra";

export type DetalhamentoDeOrcamentoExtra = {
  estimatedValue: number | "";
  basis: string;
  start: string;
  end: string;
  impact: string;
  justification: string;
};

export const DETALHAMENTO_VAZIO: DetalhamentoDeOrcamentoExtra = {
  estimatedValue: "", basis: "", start: "", end: "", impact: "", justification: "",
};

/**
 * Verdade única sobre o que "detalhamento completo" significa. A tela usa isto
 * para habilitar o botão, e POST /api/requests repete a mesma exigência.
 * Duplicado de propósito, e não compartilhado: a rota precisa recusar um POST
 * direto, que nunca passa por aqui.
 */
export function detalhamentoCompleto(d: DetalhamentoDeOrcamentoExtra): boolean {
  return (
    d.estimatedValue !== "" && Number(d.estimatedValue) > 0 &&
    Boolean(d.basis) && Boolean(d.start) && Boolean(d.end) &&
    Boolean(d.impact) && d.justification.trim().length > 0 &&
    new Date(d.end) >= new Date(d.start)
  );
}

/**
 * Modal do detalhamento de Orçamento Extra, aberto ao escolher essa opção na
 * Linha do Orçamento.
 *
 * Por que modal e não campos soltos na página: são cinco perguntas que só
 * existem para uma minoria das solicitações, e diluí-las no formulário longo
 * faria quem NÃO é Orçamento Extra rolar por campos que não lhe dizem
 * respeito. Sobrepondo, a pergunta chega junto com a decisão que a motivou.
 *
 * O Valor Estimado aparece aqui e continua na página, ligado ao MESMO estado:
 * ele deixou de ser opcional quando é Orçamento Extra, porque é ele que define
 * se a exceção vai para a Coordenação ou para o Gerente F&NC
 * (budgetExceptionLevel). Editar num lugar reflete no outro; não são dois
 * números.
 */
export function OrcamentoExtraModal({
  aberto, valor, onChange, onFechar, onConfirmar,
}: {
  aberto: boolean;
  valor: DetalhamentoDeOrcamentoExtra;
  onChange: (d: DetalhamentoDeOrcamentoExtra) => void;
  onFechar: () => void;
  onConfirmar: () => void;
}) {
  const fecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", aoTeclar);

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    fecharRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aberto, onFechar]);

  if (!aberto) return null;

  const set = (parcial: Partial<DetalhamentoDeOrcamentoExtra>) => onChange({ ...valor, ...parcial });
  const fimAntesDoInicio = Boolean(valor.start && valor.end && new Date(valor.end) < new Date(valor.start));
  const pronto = detalhamentoCompleto(valor);

  return (
    <div
      className="painel-expandido-fundo modal-centrado-fundo"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhamento do Orçamento Extra"
      onClick={onFechar}
    >
      <div className="modal-centrado" onClick={(e) => e.stopPropagation()}>
        <div className="painel-expandido-topo">
          <h2 className="painel-expandido-titulo">Detalhamento do Orçamento Extra</h2>
          <button ref={fecharRef} type="button" className="painel-expandido-fechar" onClick={onFechar} aria-label="Fechar">
            <X size={18} strokeWidth={1.75} aria-hidden />
            <span>Fechar</span>
          </button>
        </div>

        <div className="modal-centrado-conteudo">
          <p className="hint-box hint-box-info">
            Esta compra não tem linha de orçamento prevista. Quem vai decidir a exceção, Coordenação ou Gerente
            F&amp;NC conforme o valor, precisa destas informações para responder com base no impacto, e não só no
            número.
          </p>

          <div className="form-section">
            <Field
              label="Valor solicitado em R$"
              required
              help="É o mesmo Valor Estimado do formulário. Obrigatório aqui porque é ele que define a alçada de quem decide a exceção."
            >
              <input
                className="input" type="number" min="0" step="0.01" inputMode="decimal"
                value={valor.estimatedValue}
                onChange={(e) => set({ estimatedValue: e.target.value === "" ? "" : Number(e.target.value) })}
              />
            </Field>

            <Field label="Este valor é" required>
              <select className="input" value={valor.basis} onChange={(e) => set({ basis: e.target.value })}>
                <option value="">Selecione</option>
                {BASES_DE_ORCAMENTO_EXTRA.map((b) => (
                  <option key={b} value={b}>{BASE_DE_ORCAMENTO_EXTRA_LABEL[b]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="form-section">
            <p className="form-section-label">Período de utilização / vigência</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Início" required>
                <input className="input" type="date" value={valor.start} onChange={(e) => set({ start: e.target.value })} />
              </Field>
              <Field label="Fim" required>
                <input className="input" type="date" value={valor.end} min={valor.start || undefined} onChange={(e) => set({ end: e.target.value })} />
              </Field>
            </div>
            {fimAntesDoInicio && (
              <p className="hint-box hint-box-danger">O fim da vigência não pode ser anterior ao início.</p>
            )}
          </div>

          <div className="form-section">
            <Field
              label="Impacto financeiro"
              required
              help="Recorrente é o gasto que continua depois do período informado, e por isso entra no orçamento dos próximos ciclos. Pontual morre com ele."
            >
              <select className="input" value={valor.impact} onChange={(e) => set({ impact: e.target.value })}>
                <option value="">Selecione</option>
                {IMPACTOS_DE_ORCAMENTO_EXTRA.map((i) => (
                  <option key={i} value={i}>{IMPACTO_DE_ORCAMENTO_EXTRA_LABEL[i]}</option>
                ))}
              </select>
            </Field>

            <Field label="Motivo de o valor não estar previsto no orçamento original" required>
              <textarea
                className="input" rows={4}
                value={valor.justification}
                onChange={(e) => set({ justification: e.target.value })}
                placeholder="O que mudou desde o planejamento do orçamento, e por que esta compra não podia esperar o próximo ciclo."
              />
            </Field>
          </div>
        </div>

        <div className="modal-centrado-acoes">
          <button type="button" className="btn btn-secondary" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!pronto} onClick={onConfirmar}>
            Confirmar detalhamento
          </button>
        </div>
      </div>
    </div>
  );
}
