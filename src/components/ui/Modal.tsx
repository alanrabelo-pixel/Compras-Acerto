"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cx } from "./cx";

/**
 * Modal simples (sem dependência externa). Nenhuma tela usa isso ainda hoje
 * (ações como cancelar contrato disparam direto, sem confirmação), então
 * este componente é uma peça nova da biblioteca, pronta para quando alguma
 * tela precisar de uma confirmação/diálogo (ex: "Tem certeza que deseja
 * cancelar este contrato?"). Não foi ligado a nenhum botão existente por
 * conta própria, para não mudar o comportamento de nada sem pedido explícito.
 */
export function Modal({
  open, onClose, title, children, panelClassName,
}: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; panelClassName?: string }) {
  // onClose entra como prop e é comum ser recriada a cada render de quem usa
  // este modal (ex: onClose={() => setAberto(false)} inline) — inclusive a
  // cada tecla digitada num campo do conteúdo, se ele mexer em algum estado
  // do componente pai. Uma ref evita que o efeito abaixo (que só deve rodar
  // ao abrir/fechar) dependa dessa identidade instável — mesmo bug corrigido
  // em src/components/OrcamentoExtraModal.tsx, onde chegou a tirar o foco do
  // campo que a pessoa estava preenchendo a cada tecla.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className={cx("modal-panel", panelClassName)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button className="modal-close" onClick={onClose} aria-label="Fechar"><X size={16} strokeWidth={1.75} /></button>
          </div>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
