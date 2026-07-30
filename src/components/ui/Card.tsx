import { cx } from "./cx";

/**
 * Card com título — mesma marcação que existia duplicada como `Panel` em
 * RequestActions.tsx e dashboards/page.tsx (título + ícone opcional +
 * subtítulo opcional + conteúdo), agora um único componente compartilhado.
 */
export function Card({
  title, icon, subtitle, accent, className, children,
}: {
  title?: string;
  icon?: string;
  subtitle?: string;
  accent?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cx("card", className)}>
      {title && (
        <h2 className={cx("card-title", accent && "accent")}>
          {icon && <span aria-hidden>{icon}</span>}
          {title}
        </h2>
      )}
      {subtitle && <p className="dash-section-subtitle">{subtitle}</p>}
      {children}
    </section>
  );
}
