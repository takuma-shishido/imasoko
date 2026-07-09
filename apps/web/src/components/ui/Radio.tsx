import { COLORS } from "@/lib/theme";
// ラジオ選択の丸(プロトタイプ共通:16px リング + 8px 内丸)。
export function Radio({ dot }: { dot: string }) {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: `1.5px solid ${COLORS.INK}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot }} />
    </span>
  );
}
