import { cx } from "./cx";

/**
 * Tabela em grid (não uma <table> HTML) — mesmo padrão já usado em
 * Contratos/Solicitações/Dashboard (.table-wrap/.table-head-row/.table-row
 * em globals.css), agora como componentes em vez de três divs repetidas com
 * o mesmo `gridTemplateColumns` colado em cada uma.
 */
export function TableWrap({
  className, style, children,
}: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className={cx("table-wrap", className)} style={style}>
      {children}
    </div>
  );
}

export function TableHeadRow({ columns, children }: { columns: string; children: React.ReactNode }) {
  return (
    <div className="table-head-row" style={{ gridTemplateColumns: columns }}>
      {children}
    </div>
  );
}

export function TableRow({
  columns, href, style, children,
}: { columns: string; href?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const mergedStyle: React.CSSProperties = { gridTemplateColumns: columns, ...style };
  if (href) {
    return (
      <a href={href} className="table-row" style={mergedStyle}>
        {children}
      </a>
    );
  }
  return (
    <div className="table-row" style={mergedStyle}>
      {children}
    </div>
  );
}

export function TableEmpty({ children }: { children: React.ReactNode }) {
  return <p style={{ padding: 20, fontSize: 12.5, color: "var(--ink-muted)" }}>{children}</p>;
}
