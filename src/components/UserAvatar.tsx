"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * Círculo de avatar — mostra a foto (via /api/users/[id]/avatar) ou as
 * iniciais do nome quando não há foto. Só é clicável/editável quando
 * `userId` é um id de User real (sessão SSO resolvida — ver
 * src/lib/current-user.ts); em bypass local ou sem sessão, `userId` vem
 * null e o círculo fica só decorativo, sem upload possível — não existe um
 * User de verdade pra atrelar a foto nesse caso.
 */
export function UserAvatar({
  userId, avatarUrl, name, size = 30,
}: { userId: string | null; avatarUrl: string | null; name: string; size?: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = Boolean(userId);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("Imagem muito grande (máx. 2MB).");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/users/${userId}/avatar`, { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Não foi possível enviar a foto.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado ao enviar a foto.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <span className="user-avatar-wrap">
      <button
        type="button"
        className="user-avatar"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
        onClick={() => editable && inputRef.current?.click()}
        disabled={!editable || uploading}
        title={editable ? "Alterar foto de perfil" : name}
        aria-label={editable ? "Alterar foto de perfil" : name}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" />
        ) : (
          <span aria-hidden>{initialsOf(name)}</span>
        )}
      </button>
      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="user-avatar-input"
          onChange={onFileChange}
          aria-hidden
          tabIndex={-1}
        />
      )}
      {error && <span className="user-avatar-error" role="alert">{error}</span>}
    </span>
  );
}
