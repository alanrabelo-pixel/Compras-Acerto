/**
 * @react-pdf/renderer@4.5.1 só declara `bookmark` em `PageProps`, mas o
 * renderer (@react-pdf/layout) trata `bookmark` genericamente em qualquer nó
 * (`'bookmark' in child.props`) — funciona em runtime em qualquer
 * componente, inclusive <View>, só o .d.ts do pacote está desatualizado.
 * Augmentação de tipo para refletir o comportamento real, sem precisar de
 * `as any` espalhado pelos documentos de PDF (ver src/lib/pdf/manualProcesso.tsx).
 */
// O import (mesmo vazio) é o que diz ao TypeScript que isto é uma
// augmentation do módulo existente, não uma declaração substituindo-o —
// sem ele, o `declare module` abaixo apaga os exports reais do pacote
// (renderToBuffer, View, Document, etc.).
import "@react-pdf/renderer";

declare module "@react-pdf/renderer" {
  interface ViewProps {
    bookmark?: string | { title: string; fit?: boolean; expanded?: boolean; zoom?: number };
  }
}
