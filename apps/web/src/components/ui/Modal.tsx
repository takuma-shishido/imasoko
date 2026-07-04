import type { CSSProperties, ReactNode } from "react";

// モーダルの共通シェル(オーバーレイ + 中央カード)。プロトタイプの各モーダルを賄う。
interface Props {
  overlayStyle?: CSSProperties;
  cardStyle?: CSSProperties;
  children: ReactNode;
}

export function Modal({ overlayStyle, cardStyle, children }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        background: "rgba(23,23,23,.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        animation: "ims-fade-in .15s ease",
        ...overlayStyle,
      }}
    >
      <div
        style={{
          width: 300,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 16px 40px rgba(0,0,0,.25)",
          padding: 20,
          ...cardStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
