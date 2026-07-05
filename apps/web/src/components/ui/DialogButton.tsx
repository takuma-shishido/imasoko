import type { ReactNode } from "react";
import { COLORS } from "@/lib/theme";

// モーダル/ダイアログのフッターに並ぶ pill ボタン(キャンセル/確定/危険)の primitive。
// LeaveModal / WarnPublicModal / PermModal / PinModal / CreateRoomModal で重複していた
// インライン button を集約したもの。スタイル値・hover クラスは統合元と同一(issue #107・同値移設)。
type Variant = "primary" | "secondary" | "danger";

// variant 別の差分(hover クラス・枠線・地色・前景・字の太さ)。値は統合元の各 button と一致。
const VARIANT: Record<
  Variant,
  { hoverClass?: string; border: string; background: string; color: string; fontWeight?: number }
> = {
  // 確定(黒地・白字):WarnPublic/Perm/Pin/CreateRoom の confirm。hover クラスなし。
  primary: { border: "0", background: COLORS.INK, color: COLORS.WHITE, fontWeight: 500 },
  // キャンセル(白地・黒字・薄枠):全モーダルの cancel。hover は hv-border。
  secondary: {
    hoverClass: "hv-border",
    border: `1px solid ${COLORS.BORDER}`,
    background: COLORS.WHITE,
    color: COLORS.INK,
  },
  // 危険(赤地・白字):LeaveModal の退出。hover は hv-bg-err-deep。
  danger: {
    hoverClass: "hv-bg-err-deep",
    border: "0",
    background: COLORS.ERR,
    color: COLORS.WHITE,
    fontWeight: 500,
  },
};

interface Props {
  variant: Variant;
  onClick: () => void;
  /** 横幅の伸長比。既定 1(一部モーダルは確定側を 1.4 にして広げる)。 */
  flex?: number;
  children: ReactNode;
}

export function DialogButton({ variant, onClick, flex = 1, children }: Props) {
  const v = VARIANT[variant];
  return (
    <button
      onClick={onClick}
      className={v.hoverClass}
      style={{
        flex,
        height: 38,
        borderRadius: 9999,
        border: v.border,
        background: v.background,
        color: v.color,
        fontSize: 13,
        fontWeight: v.fontWeight,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
