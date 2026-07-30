import { cx } from "./cx";

export type BadgeVariant = "neutral" | "green" | "warning" | "danger" | "info";

export function Badge({
  variant = "neutral", children, className,
}: { variant?: BadgeVariant; children: React.ReactNode; className?: string }) {
  return <span className={cx("badge", `badge-${variant}`, className)}>{children}</span>;
}
