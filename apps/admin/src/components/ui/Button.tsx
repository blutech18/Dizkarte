import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "destructive" | "text";
type Size = "md" | "sm";

type CommonProps = {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly children: ReactNode;
};

function classesFor(variant: Variant, size: Size, extra?: string): string {
  const variantClass =
    variant === "primary"
      ? "dk-btn-primary"
      : variant === "secondary"
        ? "dk-btn-secondary"
        : variant === "destructive"
          ? "dk-btn-destructive"
          : "dk-btn-text";
  const sizeClass = size === "sm" ? "dk-btn-sm" : "";
  return ["dk-btn", variantClass, sizeClass, extra].filter(Boolean).join(" ");
}

export type ButtonProps = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    readonly loading?: boolean;
  };

/** Accessible button. Never a bare `<div>`; disabled/loading state is explicit and announced. */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={rest.type ?? "button"}
      className={classesFor(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="dk-spinner" aria-hidden="true" /> : null}
      <span>{children}</span>
      {loading ? <span className="dk-visually-hidden">Loading, please wait</span> : null}
    </button>
  );
}

export type LinkButtonProps = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement>;

export function LinkButton({
  variant = "secondary",
  size = "md",
  children,
  className,
  ...rest
}: LinkButtonProps) {
  return (
    <a className={classesFor(variant, size, className)} {...rest}>
      {children}
    </a>
  );
}
