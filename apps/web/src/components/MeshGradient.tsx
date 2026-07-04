// Ink & Mesh Design System の MeshGradient(hero-scale の雰囲気背景)。
interface Props {
  height?: string;
  opacity?: number;
}

export function MeshGradient({ height = "58%", opacity = 0.45 }: Props) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height,
        background: "var(--gradient-mesh)",
        opacity,
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
