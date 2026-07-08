import type { CSSProperties } from "react";
import { useRoom } from "@/state/RoomContext";
import { Button } from "@/components/ui/Button";
import { MeshGradient } from "@/components/MeshGradient";
import { COLORS } from "@/lib/theme";

const FEATURES = [
  ["01", "ログイン・アカウント登録は不要"],
  ["02", "アプリのインストールも不要"],
  ["03", "ルームは2時間で自動的に消滅"],
];

// トップ画面(design/01)。ルーム作成 + 公開ルーム探索の2導線 + 使い方(チュートリアル)。
export function TopPage({ onOpenTutorial }: { onOpenTutorial: () => void }) {
  const v = useRoom();
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <MeshGradient height="58%" opacity={0.45} />
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "22px 28px 24px",
          minHeight: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div
            style={{
              fontFamily: "'Geist Mono',monospace",
              fontSize: 11,
              letterSpacing: ".14em",
              color: COLORS.INK,
              fontWeight: 500,
              flex: 1,
            }}
          >
            IMASOKO
          </div>
          <div
            style={{
              fontFamily: "'Geist Mono',monospace",
              fontSize: 10,
              letterSpacing: ".12em",
              color: COLORS.GRAY,
            }}
          >
            有明キャンパス
          </div>
          <button
            onClick={onOpenTutorial}
            className="hv-border-ink"
            style={{
              background: COLORS.WHITE,
              border: `1px solid ${COLORS.BORDER}`,
              borderRadius: 9999,
              fontSize: 11,
              fontFamily: "inherit",
              color: COLORS.INK,
              padding: "4px 12px",
              cursor: "pointer",
            }}
          >
            ? 使い方
          </button>
        </div>

        <div style={{ marginTop: 44 }}>
          <h1
            style={{
              fontSize: 56,
              fontWeight: 600,
              letterSpacing: -2.8,
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            いまそこ
          </h1>
          <p
            style={{
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: -0.6,
              margin: "12px 0 0",
              lineHeight: 1.4,
            }}
          >
            集合、リンク一本で。
          </p>
          <p
            style={
              {
                fontSize: 14,
                color: COLORS.SUBTLE,
                margin: "10px 0 0",
                lineHeight: 1.75,
                textWrap: "pretty",
              } as CSSProperties
            }
          >
            URLを共有するだけで、全員の現在地が
            <br />
            キャンパスマップに表示されます。
          </p>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ borderTop: `1px solid ${COLORS.BORDER}` }}>
          {FEATURES.map(([n, label]) => (
            <div
              key={n}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "12px 0",
                borderBottom: `1px solid ${COLORS.BORDER}`,
              }}
            >
              <span
                style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, color: COLORS.GRAY }}
              >
                {n}
              </span>
              <span style={{ fontSize: 13, color: COLORS.INK }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div data-tutorial="create-room" style={{ display: "flex", flexDirection: "column" }}>
            <Button variant="primary" size="lg" onClick={v.createRoom}>
              ルームを作る
            </Button>
          </div>
          <Button variant="secondary" size="lg" onClick={v.goPublic}>
            公開ルームを探す
          </Button>
        </div>
        <div style={{ marginTop: 16, fontSize: 11.5, color: COLORS.GRAY, textAlign: "center" }}>
          参加すると、現在地がルーム内で共有されます。
        </div>
      </div>
    </div>
  );
}
