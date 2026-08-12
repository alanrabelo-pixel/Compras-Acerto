import { AlertTriangle } from "lucide-react";
import { cx } from "./cx";

/**
 * Caixa de aviso com ícone — antes reimplementada 3x com o mesmo
 * background/borda/padding hardcoded (inclusive um hex fora dos tokens,
 * #fbdba0). Um único componente garante que os 3 avisos do sistema
 * (Onfly em Chamados x2, fracionamento em Solicitações) fiquem idênticos
 * e futuros avisos não reintroduzam a duplicação.
 */
export function WarningNotice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("hint-box hint-box-warning warning-notice", className)}>
      <AlertTriangle size={15} strokeWidth={1.75} className="warning-notice-icon" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
