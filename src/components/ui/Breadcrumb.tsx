import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

/**
 * Trilha de navegação. Substitui o link solto "← voltar ao X" nas telas de
 * detalhe (Solicitação, Contrato) por um rastro completo (Quadro / CÓDIGO),
 * deixando claro onde a pessoa está e permitindo voltar a qualquer nível.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumb" aria-label="Trilha de navegação">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="breadcrumb-item">
            {item.href && !isLast ? (
              <Link href={item.href} className="breadcrumb-link">{item.label}</Link>
            ) : (
              <span className={isLast ? "breadcrumb-current" : undefined}>{item.label}</span>
            )}
            {!isLast && <span className="breadcrumb-sep" aria-hidden>/</span>}
          </span>
        );
      })}
    </nav>
  );
}
