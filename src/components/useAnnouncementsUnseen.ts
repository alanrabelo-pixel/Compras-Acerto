"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "acerto-announcements-seen-at";

type AnnouncementStub = { createdAt: string };

/**
 * Contagem de comunicados "não vistos" neste navegador — diferente de
 * countRecentAnnouncements() (server, "criados nos últimos 7 dias", sem
 * noção de leitura). Aqui comparamos com um carimbo salvo no localStorage:
 * assim que a pessoa abre o painel de Comunicados (markSeen), tudo vira
 * "visto" e o badge some, até que um novo comunicado seja publicado depois
 * disso.
 *
 * É por navegador, não por conta — sem sessão real persistente
 * (LOCAL_BYPASS_AUTH), não há onde guardar isso no servidor por pessoa;
 * `initialCount` (o recorte org-wide de 7 dias) é só o valor exibido antes
 * do primeiro carregamento no cliente.
 */
export function useAnnouncementsUnseen(initialCount: number) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    fetch("/api/announcements")
      .then((res) => res.json())
      .then((items: AnnouncementStub[]) => {
        const seenAt = localStorage.getItem(STORAGE_KEY);
        const seenTime = seenAt ? new Date(seenAt).getTime() : 0;
        const unseen = items.filter((a) => new Date(a.createdAt).getTime() > seenTime).length;
        setCount(unseen);
      })
      .catch(() => {});
  }, []);

  function markSeen() {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    setCount(0);
  }

  return { count, markSeen };
}
