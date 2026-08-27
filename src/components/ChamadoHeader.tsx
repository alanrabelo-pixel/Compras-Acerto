import { AlaiWordmark } from "@/components/AlaiWordmark";

export function ChamadoHeader({ categoryLabel, backHref, backLabel }: { categoryLabel: string; backHref: string; backLabel: string }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a href="/" className="topbar-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/acerto-logo.svg" alt="Acerto" className="topbar-logo" />
          <span className="topbar-divider" />
          <AlaiWordmark className="topbar-alai-full" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/alai-mark.svg" alt="alAi" className="topbar-alai-icon" />
          <span className="topbar-divider" />
          <span className="topbar-title">{categoryLabel}</span>
        </a>
        <a href={backHref} className="back-link" style={{ margin: 0 }}>{backLabel}</a>
      </div>
    </header>
  );
}
