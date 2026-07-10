import type { CSSProperties, ReactNode } from "react";

// モーダルの共通シェル(オーバーレイ + 上寄せカード)。プロトタイプの各モーダルを賄う。
// カードは上側に表示し、少し半透明 + 背景ぼかしで背後(地図など)がうっすら見えるようにする。
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
        alignItems: "flex-start",
        justifyContent: "center",
        padding: 24,
        paddingTop: 70,
        animation: "ims-fade-in .15s ease",
        ...overlayStyle,
      }}
    >
      <div
        style={{
          width: 300,
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)", // iOS Safari はベンダープレフィックスが必要
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
