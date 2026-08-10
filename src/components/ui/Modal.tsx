"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cx } from "./cx";

/**
 * Modal simples (sem dependência externa) — nenhuma tela usa isso ainda hoje
 * (ações como cancelar contrato disparam direto, sem confirmação), então
 * este componente é uma peça nova da biblioteca, pronta para quando alguma
 * tela precisar de uma confirmação/diálogo (ex: "Tem certeza que deseja
 * cancelar este contrato?") — não foi ligado a nenhum botão existente por
 * conta própria, para não mudar o comportamento de nada sem pedido explícito.
 */
export function Modal({
  open, onClose, title, children, panelClassName,
}: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode; panelClassName?: string }) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

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
