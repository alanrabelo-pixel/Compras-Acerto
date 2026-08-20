/**
 * Percentual de participação com uma barra fina embaixo, para uma coluna de
 * ranking se ler de relance em vez de exigir a comparação de números.
 *
 * Só aparece nas versões expandidas dos painéis: numa coluna estreita a barra
 * ocuparia o lugar de um dado, e três pixels de barra não informam nada.
 *
 * `role` existe porque TableRow clona cada célula injetando role="cell" (ver
 * ui/Table.tsx); sem repassar, a célula perderia o papel para o leitor de tela.
 */
export function BarraParticipacao({ pct, role }: { pct: number; role?: string }) {
  const largura = Math.min(100, Math.max(0, pct));
  return (
    <span role={role}>
      <span style={{ display: "block", fontWeight: 600 }}>{pct.toFixed(1)}%</span>
      <span style={{ display: "block", height: 3, marginTop: 3, borderRadius: 2, background: "var(--surface-muted)" }}>
        <span style={{ display: "block", height: "100%", width: `${largura}%`, borderRadius: 2, background: "var(--acerto-green)" }} />
      </span>
    </span>
  );
}
