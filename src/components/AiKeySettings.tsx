"use client";

import { useEffect, useState } from "react";

/**
 * Gestão das chaves pessoais de IA (Anthropic/Gemini) de quem está atuando —
 * extraído do AiInsightPanel para ser reaproveitado em qualquer lugar que
 * precise de uma chamada de IA por conta do usuário (ex: assistente de
 * preenchimento da Nova Solicitação), em vez de duplicar o mesmo bloco.
 */
export function AiKeySettings({ actorId }: { actorId: string }) {
  const [keyStatus, setKeyStatus] = useState<{ anthropicConfigured: boolean; geminiConfigured: boolean } | null>(null);
  const [editingKeys, setEditingKeys] = useState(false);
  const [anthropicKeyInput, setAnthropicKeyInput] = useState("");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [savingKeys, setSavingKeys] = useState(false);

  useEffect(() => {
    if (!actorId) {
      setKeyStatus(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/users/${actorId}/ai-keys`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setKeyStatus(data);
        setEditingKeys(!data.anthropicConfigured && !data.geminiConfigured);
        setAnthropicKeyInput("");
        setGeminiKeyInput("");
      });
    return () => {
      cancelled = true;
    };
  }, [actorId]);

  async function saveKeys() {
    setSavingKeys(true);
    try {
      const body: { anthropicApiKey?: string; geminiApiKey?: string } = {};
      if (anthropicKeyInput.trim()) body.anthropicApiKey = anthropicKeyInput;
      if (geminiKeyInput.trim()) body.geminiApiKey = geminiKeyInput;
      const res = await fetch(`/api/users/${actorId}/ai-keys`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setKeyStatus(data);
      setAnthropicKeyInput("");
      setGeminiKeyInput("");
      setEditingKeys(false);
    } finally {
      setSavingKeys(false);
    }
  }

  if (!actorId || !keyStatus) return null;

  return (
    <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "var(--ink-muted)" }}>
          Suas chaves pessoais — Claude: {keyStatus.anthropicConfigured ? "configurada ✓" : "não configurada"} ·
          {" "}Gemini: {keyStatus.geminiConfigured ? "configurada ✓" : "não configurada"}
        </span>
        <button
          type="button"
          onClick={() => setEditingKeys((v) => !v)}
          style={{ background: "none", border: "none", color: "var(--acerto-green-dark)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
        >
          {editingKeys ? "cancelar" : "editar"}
        </button>
      </div>
      {editingKeys && (
        <div style={{ display: "grid", gap: 6, background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: "var(--radius-sm)", padding: 8 }}>
          <p style={{ color: "var(--ink-muted)" }}>
            Cada pessoa usa sua própria chave (todo mundo na Acerto já tem acesso a Claude e Gemini) — deixe em
            branco o que não quiser alterar.
          </p>
          <details>
            <summary style={{ cursor: "pointer", color: "var(--acerto-green-dark)", fontWeight: 600 }}>
              Não sei onde pegar minha chave — como faço?
            </summary>
            <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
              <div>
                <p style={{ fontWeight: 700, margin: "0 0 3px" }}>Claude (Anthropic)</p>
                <ol style={{ margin: 0, paddingLeft: 16, color: "var(--ink-muted)" }}>
                  <li>Acesse <strong>console.anthropic.com</strong> e entre com sua conta @acerto.com.br.</li>
                  <li>No menu à esquerda, clique em <strong>API Keys</strong>.</li>
                  <li>Clique em <strong>Create Key</strong>, dê um nome (ex: &quot;Acerto Compras&quot;) e confirme.</li>
                  <li>Copie a chave gerada (começa com <strong>sk-ant-...</strong>) — ela só aparece uma vez.</li>
                  <li>Cole no campo &quot;Sua chave da Anthropic (Claude)&quot; abaixo e clique em Salvar.</li>
                </ol>
              </div>
              <div>
                <p style={{ fontWeight: 700, margin: "0 0 3px" }}>Gemini (Google AI Studio)</p>
                <ol style={{ margin: 0, paddingLeft: 16, color: "var(--ink-muted)" }}>
                  <li>Acesse <strong>aistudio.google.com</strong> e entre com sua conta @acerto.com.br.</li>
                  <li>Clique em <strong>Get API key</strong> (canto superior) e depois em <strong>Create API key</strong>.</li>
                  <li>Copie a chave gerada.</li>
                  <li>Cole no campo &quot;Sua chave do Gemini&quot; abaixo e clique em Salvar.</li>
                </ol>
              </div>
              <p style={{ margin: 0, fontStyle: "italic" }}>
                Só precisa de uma das duas para usar o assistente — configure Claude, Gemini, ou os dois.
              </p>
            </div>
          </details>
          <input
            className="input" type="password" placeholder="Sua chave da Anthropic (Claude)"
            value={anthropicKeyInput} onChange={(e) => setAnthropicKeyInput(e.target.value)}
          />
          <input
            className="input" type="password" placeholder="Sua chave do Gemini"
            value={geminiKeyInput} onChange={(e) => setGeminiKeyInput(e.target.value)}
          />
          <button className="btn btn-secondary" disabled={savingKeys} onClick={saveKeys} style={{ fontSize: 11, padding: "6px 12px" }}>
            {savingKeys ? "Salvando..." : "Salvar minhas chaves"}
          </button>
        </div>
      )}
    </div>
  );
}
