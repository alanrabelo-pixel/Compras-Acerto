import { Children, cloneElement, isValidElement, useId, type ReactElement } from "react";

const NATIVE_CONTROL_TAGS = new Set(["input", "select", "textarea"]);

/**
 * Rótulo + texto de ajuda + campo — o mesmo wrapper que já existia duplicado
 * (com o mesmo nome) em NovaSolicitacaoForm.tsx, agora compartilhado.
 *
 * Quando o filho é um único <input>/<select>/<textarea> nativo sem id
 * próprio, gera um id (useId) e associa via htmlFor — sem isso o <label>
 * visual não tinha nenhum vínculo real com o campo (falha de WCAG 2.2 AA,
 * leitor de tela não anuncia o rótulo ao focar o campo). Usos somente-leitura
 * (ex: Contratos/StageHistoryPanel, onde children é texto/JSX arbitrário) não
 * têm um controle nativo detectável e continuam sem htmlFor, como antes.
 */
export function Field({
  label, help, required, children,
}: { label: string; help?: string; required?: boolean; children: React.ReactNode }) {
  const generatedId = useId();
  const onlyChild = Children.count(children) === 1 ? Children.only(children) : null;
  const isNativeControl = isValidElement(onlyChild) && typeof onlyChild.type === "string" && NATIVE_CONTROL_TAGS.has(onlyChild.type);
  const existingId = isNativeControl ? (onlyChild as ReactElement<{ id?: string }>).props.id : undefined;
  const controlId = isNativeControl ? existingId ?? generatedId : undefined;
  const resolvedChildren = isNativeControl && !existingId
    ? cloneElement(onlyChild as ReactElement<{ id?: string }>, { id: controlId })
    : children;

  return (
    <div className="field">
      <label className="label" htmlFor={controlId}>
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
      </label>
      {help && <p className="help">{help}</p>}
      {resolvedChildren}
    </div>
  );
}
