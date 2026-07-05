import { COLORS } from "@/lib/theme";
// 残り時間チップ:「残り」ラベル + tabular-nums の数値(残り5分未満で timerColor が赤)。
// メインマップ(AreaSwitcher)と参加画面(JoinForm)で共通利用(issue #50・#32)。
interface Props {
  remaining: string;
  timerColor: string;
}
export function RemainingChip({ remaining, timerColor }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, flex: "none" }}>
      <span style={{ fontSize: 10.5, color: COLORS.GRAY, fontWeight: 500, whiteSpace: "nowrap" }}>
        残り
      </span>
      <span
        style={{
          fontFamily: "'Geist Mono',monospace",
          fontSize: 12.5,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: timerColor,
        }}
      >
        {remaining}
      </span>
    </div>
  );
}
