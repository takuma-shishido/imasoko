import type { PointerEvent, ReactNode, RefObject } from "react";

// 汎用ボトムシート(docs/design 共通ルール)。同時に開くのは1枚。
// ハンドルのドラッグ / 背景タップで閉じる。
interface Props {
  onClose: () => void;
  /** 退場アニメーション中(下スライド + 背景フェードアウト。issue #71)。 */
  closing?: boolean;
  sheetRef: RefObject<HTMLDivElement>;
  onHandleDown: (e: PointerEvent<HTMLDivElement>) => void;
  onHandleMove: (e: PointerEvent<HTMLDivElement>) => void;
  onHandleUp: (e: PointerEvent<HTMLDivElement>) => void;
  onHandleCancel: (e: PointerEvent<HTMLDivElement>) => void;
  children: ReactNode;
}

export function BottomSheet({
  onClose,
  closing = false,
  sheetRef,
  onHandleDown,
  onHandleMove,
  onHandleUp,
  onHandleCancel,
  children,
}: Props) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40 }}>
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(23,23,23,.32)",
          animation: closing ? "ims-fade-out .2s ease forwards" : "ims-fade-in .18s ease",
        }}
      />
      <div
        ref={sheetRef}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "#fff",
          borderRadius: "14px 14px 0 0",
          boxShadow: "0 -8px 30px rgba(0,0,0,.14)",
          maxHeight: "76%",
          display: "flex",
          flexDirection: "column",
          // 入場はキーフレーム。退場はドラッグ位置から連続させるため RoomEngine.closeSheet が
          // sheetRef へ transition + translateY(100%) を直接付ける(issue #71)。
          animation: closing ? "none" : "ims-sheet-in .22s cubic-bezier(.3,.8,.4,1)",
        }}
      >
        {/* ハンドル帯:携帯で下ドラッグして閉じる領域。タッチのヒット領域を 44px 確保する
            (従来 ~22px は小さすぎて指で掴めず閉じられなかった。issue #71)。
            touchAction:"none" で本文スクロールと競合させない。 */}
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleCancel}
          style={{
            minHeight: 44,
            paddingTop: 10,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            cursor: "grab",
            touchAction: "none",
            flex: "none",
          }}
        >
          <div style={{ width: 40, height: 5, borderRadius: 9999, background: "#d9d9d9" }} />
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 24px", minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}
