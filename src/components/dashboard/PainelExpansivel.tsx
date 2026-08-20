"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";

/**
 * Expansão de painel do dashboard para tela cheia.
 *
 * Por que existe: os gráficos do dashboard cabem numa coluna estreita, e para
 * caber eles cortam. A evolução mostra 12 meses num espaço de 12 barras finas,
 * as tabelas mostram os cinco primeiros, e o histograma agrupa em faixas
 * largas. Quem quer olhar de perto não tinha para onde ir.
 *
 * O contrato tem duas metades de propósito, `compacto` e `expandido`, em vez de
 * um conteúdo só que cresce. Ampliar o mesmo desenho resolveria o tamanho e não
 * resolveria a pergunta: numa tela inteira cabem mais meses, mais linhas e mais
 * rótulos, e é isso que a pessoa foi buscar ao expandir. Quando não houver o
 * que acrescentar, passar o mesmo nó nos dois é legítimo e explícito.
 *
 * Os dois lados são renderizados NO SERVIDOR e chegam aqui como children. Este
 * componente é só a mecânica de abrir e fechar: não busca dado, não recalcula
 * nada, e por isso a expansão é instantânea e funciona com o dashboard
 * filtrado, sem refazer a consulta com outros parâmetros.
 */
export function PainelExpansivel({
  titulo,
  compacto,
  expandido,
}: {
  titulo: string;
  compacto: React.ReactNode;
  expandido?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);

    // Trava a rolagem do fundo: sem isso, rolar dentro do painel expandido
    // rola a página atrás quando o conteúdo termina, e ao fechar a pessoa está
    // num lugar diferente de onde parou.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    fecharRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      // Devolve o foco ao botão que abriu, senão quem navega por teclado
      // volta para o início da página a cada expansão.
      botaoRef.current?.focus();
    };
  }, [aberto]);

  return (
    <>
      <div className="painel-expansivel">
        <button
          ref={botaoRef}
          type="button"
          className="painel-expansivel-botao"
          onClick={() => setAberto(true)}
          aria-label={`Expandir ${titulo} para tela cheia`}
          title="Expandir para tela cheia"
        >
          <Maximize2 size={14} strokeWidth={1.75} aria-hidden />
        </button>
        {compacto}
      </div>

      {aberto && (
        <div
          className="painel-expandido-fundo"
          role="dialog"
          aria-modal="true"
          aria-label={titulo}
          // Clique no fundo fecha; clique dentro do conteúdo não deve fechar,
          // daí o stopPropagation no filho.
          onClick={() => setAberto(false)}
        >
          <div className="painel-expandido" onClick={(e) => e.stopPropagation()}>
            <div className="painel-expandido-topo">
              <h2 className="painel-expandido-titulo">{titulo}</h2>
              <button
                ref={fecharRef}
                type="button"
                className="painel-expandido-fechar"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
              >
                <X size={18} strokeWidth={1.75} aria-hidden />
                <span>Fechar</span>
              </button>
            </div>
            <div className="painel-expandido-conteudo">{expandido ?? compacto}</div>
          </div>
        </div>
      )}
    </>
  );
}
