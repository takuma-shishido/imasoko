import { COLORS } from "@/lib/theme";
// 選択状態に応じたチップ / ドットの色ヘルパ(issue #99)。
// renderVals とその派生セレクタ(selectors/*)から共有するため lib に配置する(循環 import 回避)。

// 選択チップの色(選択状態に応じた背景 bg / 文字 fg / 枠線 bd の三つ組)。
// fgOff = 非選択時の文字色(既定 #171717。フロアタブ / エリアセグメントのみ #4d4d4d)。
// bgOff = 非選択時の背景色(既定 #ffffff。エリアセグメントのみ透明)。
export function selChip(
  selected: boolean,
  fgOff: string = COLORS.INK,
  bgOff: string = COLORS.WHITE
) {
  return {
    bg: selected ? COLORS.INK : bgOff,
    fg: selected ? COLORS.WHITE : fgOff,
    bd: selected ? COLORS.INK : COLORS.BORDER,
  };
}

// 選択ドットの色(選択時のみ塗り、非選択は透明)。ラジオ的なドット表示で反復していたパターンを集約する(issue #99)。
export function selDot(selected: boolean): string {
  return selected ? COLORS.INK : "transparent";
}
