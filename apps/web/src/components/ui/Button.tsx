import type { CSSProperties, ReactNode } from "react";

// Ink & Mesh Design System の Button(Marketing CTA pill)を再現。
type Variant = "primary" | "secondary";
type Size = "md" | "lg";

interface Props {
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "lg",
  disabled,
  onClick,
  style,
  children,
}: Props) {
  return (
    <button
      type="button"
      className={`ims-btn ims-btn--${variant} ims-btn--${size}`}
      disabled={disabled}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );
}
