import { Sparkles } from "lucide-react";

/**
 * Selo discreto para marcar um valor/sugestão gerado por IA (ex: campo
 * pré-preenchido pelo assistente de Nova Solicitação), no mesmo tom "quase
 * transparente" já usado no hint do Ctrl+K (sidebar-search-kbd): sem
 * caixa/preenchimento, só um ícone pequeno + texto sobre --ink-muted com
 * opacidade reduzida. O objetivo é dar proveniência sem chamar mais atenção
 * que o próprio dado.
 */
export function AiTag({ label = "sugerido pela IA" }: { label?: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 400, color: "var(--ink-muted)", opacity: 0.65 }}>
      <Sparkles size={11} strokeWidth={1.75} aria-hidden />
      {label}
    </span>
  );
}
