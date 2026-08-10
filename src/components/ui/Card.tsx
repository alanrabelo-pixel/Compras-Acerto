import { cx } from "./cx";

/**
 * Card com título — mesma marcação que existia duplicada como `Panel` em
 * RequestActions.tsx e dashboards/page.tsx (título + ícone opcional +
 * subtítulo opcional + conteúdo), agora um único componente compartilhado.
 *
 * `icon` recebe o elemento já renderizado (ex: `<Wallet size={16}/>`), não a
 * referência do componente — só assim pode atravessar a fronteira Server →
 * Client quando `Card` é usado a partir de um Client Component.
 *
 * `titleSize="lg"` reproduz o `dash-section-title` (15px) que os painéis do
 * Dashboard Executivo já usavam antes de migrar para este componente; o
 * padrão "sm" continua sendo o `card-title` (13px) de todo o resto do app.
 */
export function Card({
  title, icon, subtitle, accent, titleSize = "sm", className, style, children,
}: {
  title?: string;
  icon?: React.ReactNode;
  subtitle?: string;
  accent?: boolean;
  titleSize?: "sm" | "lg";
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <section className={cx("card", className)} style={style}>
      {title && (
        <h2 className={cx(titleSize === "lg" ? "dash-section-title" : "card-title", accent && "accent")}>
          {icon && <span aria-hidden style={{ display: "inline-flex" }}>{icon}</span>}
          {title}
        </h2>
      )}
      {subtitle && <p className="dash-section-subtitle">{subtitle}</p>}
      {children}
    </section>
  );
}
