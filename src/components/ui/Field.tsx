/**
 * Rótulo + texto de ajuda + campo — o mesmo wrapper que já existia duplicado
 * (com o mesmo nome) em NovaSolicitacaoForm.tsx, agora compartilhado.
 */
export function Field({
  label, help, required, children,
}: { label: string; help?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label">
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
      </label>
      {help && <p className="help">{help}</p>}
      {children}
    </div>
  );
}
