import { Children, cloneElement, isValidElement } from "react";
import { cx } from "./cx";

/**
 * Tabela em grid (não uma <table> HTML) — mesmo padrão já usado em
 * Contratos/Solicitações/Dashboard (.table-wrap/.table-head-row/.table-row
 * em globals.css), agora como componentes em vez de três divs repetidas com
 * o mesmo `gridTemplateColumns` colado em cada uma.
 *
 * role="table"/"row"/"columnheader"/"cell" abaixo: como isto é uma grade de
 * divs (não uma <table> nativa), sem esses papéis um leitor de tela não tinha
 * NENHUMA noção de estrutura tabular — apenas divs/links soltos, sem contagem
 * de linhas/colunas nem cabeçalho associado à célula.
 */
export function TableWrap({
  className, style, children,
}: { className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className={cx("table-wrap", className)} role="table" style={style}>
      {children}
    </div>
  );
}

function withCellRole(children: React.ReactNode, role: "columnheader" | "cell") {
  return Children.map(children, (child) => (isValidElement(child) ? cloneElement(child, { role }) : child));
}

export function TableHeadRow({ columns, children }: { columns: string; children: React.ReactNode }) {
  return (
    <div className="table-head-row" role="row" style={{ gridTemplateColumns: columns }}>
      {withCellRole(children, "columnheader")}
    </div>
  );
}

export function TableRow({
  columns, href, style, children,
}: { columns: string; href?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const mergedStyle: React.CSSProperties = { gridTemplateColumns: columns, ...style };
  const cells = withCellRole(children, "cell");
  if (href) {
    return (
      <a href={href} className="table-row" role="row" style={mergedStyle}>
        {cells}
      </a>
    );
  }
  return (
    <div className="table-row" role="row" style={mergedStyle}>
      {cells}
    </div>
  );
}

export function TableEmpty({ children }: { children: React.ReactNode }) {
  return <p style={{ padding: 20, fontSize: 12.5, color: "var(--ink-muted)" }}>{children}</p>;
}
