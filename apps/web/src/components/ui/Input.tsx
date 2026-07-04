import type { ChangeEvent } from "react";

// Ink & Mesh Design System の Input(label + input + error)を再現。
type Size = "md" | "lg";

interface Props {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  size?: Size;
}

export function Input({ label, placeholder, value, onChange, error, size = "md" }: Props) {
  return (
    <div style={{ width: "100%" }}>
      {label && <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>{label}</div>}
      <input
        className={`ims-input ims-input--${size}${error ? " ims-input--error" : ""}`}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
      {error && <div style={{ fontSize: 12, color: "#ee0000", marginTop: 5 }}>{error}</div>}
    </div>
  );
}
