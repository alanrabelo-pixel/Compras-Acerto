/** Junta classNames condicionais sem precisar de uma dependência externa. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
