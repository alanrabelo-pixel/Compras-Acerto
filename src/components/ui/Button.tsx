import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "danger";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

/**
 * Botão padrão do sistema — mesma aparência de sempre (.btn/.btn-primary/
 * .btn-secondary/.btn-danger em globals.css), só que como um componente
 * tipado em vez de `className="btn btn-primary"` repetido em toda tela.
 */
export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return <button className={cx("btn", `btn-${variant}`, className)} {...props} />;
}
