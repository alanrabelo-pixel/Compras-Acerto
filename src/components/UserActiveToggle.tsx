"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button } from "@/components/ui";
import { useAcaoRemota, StatusDaAcao } from "@/components/useAcaoRemota";

export function UserActiveToggle({ userId, active }: { userId: string; active: boolean }) {
  const router = useRouter();
  const { estado, executar, salvando } = useAcaoRemota();
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function setActive(next: boolean) {
    return executar(
      () =>
        fetch(`/api/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: next }),
        }),
      () => router.refresh()
    );
  }

  function onClick() {
    // Reativar não precisa de confirmação (reversível, sem perda de acesso);
    // desativar tira o acesso da pessoa na hora, então passa por um diálogo
    // explícito em vez do window.confirm() nativo de antes.
    if (active) setConfirmOpen(true);
    else setActive(true);
  }

  return (
    <>
      <button
        className={`btn ${active ? "btn-secondary" : "btn-danger"}`}
        style={{ padding: "4px 9px", fontSize: 11 }}
        disabled={salvando}
        onClick={onClick}
      >
        {active ? "Ativo" : "Reativar"}
      </button>
      <StatusDaAcao estado={estado} />

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Desativar usuário?">
        <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.55, margin: "0 0 20px" }}>
          Este usuário perderá o acesso ao sistema, mas seu histórico de atividades será preservado.
        </p>
        <div style={{ marginBottom: 10 }}><StatusDaAcao estado={estado} /></div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
          <Button
            variant="danger"
            disabled={salvando}
            onClick={async () => {
              const deuCerto = await setActive(false);
              // Só fecha se deu certo: fechando sempre, a mensagem de erro
              // sumiria junto com o diálogo e a pessoa acharia que funcionou.
              if (deuCerto) setConfirmOpen(false);
            }}
          >
            Inativar usuário
          </Button>
        </div>
      </Modal>
    </>
  );
}
