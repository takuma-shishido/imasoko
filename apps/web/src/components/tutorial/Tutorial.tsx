import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRoom } from "@/state/RoomContext";
import { COLORS } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { Mascot } from "./Mascot";
import { TUTORIAL_STEPS } from "./steps";
import { TUTORIAL_TEXTS } from "./texts";

// 実UI追従の座標(フレーム相対)。
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rectEq = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

// チュートリアル(ホームの「使い方」から起動)。
// 実画面の対象ボタンをスポットライトで示し、マスコットの吹き出しで案内する。
// クリックは実UIへ素通しし、実際の操作(画面遷移・シートが開く)を検知して次へ進む。
export function Tutorial({ onClose }: { onClose: () => void }) {
  const v = useRoom();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const s = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;

  // 実操作による自動前進(done を満たしたステップを飛ばす)。
  useEffect(() => {
    let i = step;
    while (i < TUTORIAL_STEPS.length - 1 && TUTORIAL_STEPS[i].done?.(v)) i++;
    if (i !== step) setStep(i);
  }, [v, step]);

  // 想定外の画面(期限切れ・満員など)に出たら終了する。
  useEffect(() => {
    if (!v.isTop && !v.isPublic && !v.isJoin && !v.isMap) onClose();
  }, [v.isTop, v.isPublic, v.isJoin, v.isMap, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 対象ボタンの位置を追従(画面遷移やレイアウト変化があるため定期再測定)。
  // useLayoutEffect でポップ表示("ポッ"アニメ)の初回フレームから正しい位置に出す。
  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      const el = s.anchor ? document.querySelector(`[data-tutorial="${s.anchor}"]`) : null;
      if (!wrap || !el) {
        setRect((prev) => (prev === null ? prev : null));
        return;
      }
      const w = wrap.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const next = { x: r.left - w.left, y: r.top - w.top, w: r.width, h: r.height };
      setRect((prev) => (rectEq(prev, next) ? prev : next));
    };
    measure();
    const t = setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", measure);
    };
  }, [s.anchor]);

  // モーダル・シートが開いている間は隠れて操作を邪魔しない(閉じると再表示)。
  const hidden = v.sheetOpen || v.createOpen || v.permModal || v.pinModal;

  // 吹き出しの配置:対象が上半分なら下に、下半分なら上に。対象なしは下寄せ。
  const wrapH = wrapRef.current?.clientHeight ?? 800;
  const below = rect !== null && rect.y + rect.h / 2 < wrapH / 2;
  const bubblePos =
    rect === null
      ? { bottom: v.isMap ? 150 : 32 }
      : below
        ? { top: rect.y + rect.h + 18 }
        : { bottom: wrapH - rect.y + 18 };
  // 尻尾の水平位置(対象の中心。吹き出し(left/right 16px)内に収まるようクランプ)。
  const wrapW = wrapRef.current?.clientWidth ?? 430;
  const tailLeft =
    rect === null ? null : Math.min(Math.max(rect.x + rect.w / 2 - 16 - 6, 14), wrapW - 32 - 26);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        overflow: "hidden",
        pointerEvents: "none",
        visibility: hidden ? "hidden" : "visible",
      }}
    >
      {/* スポットライト(対象の周りだけ明るく残す暗幕) */}
      {rect && (
        <div
          style={{
            position: "absolute",
            left: rect.x - 6,
            top: rect.y - 6,
            width: rect.w + 12,
            height: rect.h + 12,
            borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(23,23,23,.45)",
            outline: `2px solid ${COLORS.WHITE}`,
            animation: "ims-pulse 1.8s infinite",
          }}
        />
      )}

      {/* マスコットの吹き出し(ステップごとに key を変えて"ポッ"と出し直す。
          transform-origin を尻尾側にして対象ボタンから弾むように見せる) */}
      <div
        key={step}
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          ...bubblePos,
          background: COLORS.WHITE,
          borderRadius: 14,
          boxShadow: "0 8px 30px rgba(0,0,0,.22)",
          padding: "12px 14px",
          pointerEvents: "auto",
          animation: "ims-pop .3s cubic-bezier(.34,1.56,.64,1) both",
          transformOrigin:
            tailLeft !== null ? `${tailLeft + 6}px ${below ? "0%" : "100%"}` : "50% 100%",
        }}
      >
        {tailLeft !== null && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              [below ? "top" : "bottom"]: -6,
              left: tailLeft,
              width: 12,
              height: 12,
              background: COLORS.WHITE,
              transform: "rotate(45deg)",
            }}
          />
        )}

        <div style={{ display: "flex", alignItems: "center" }}>
          <span
            style={{
              fontFamily: "'Geist Mono',monospace",
              fontSize: 10,
              letterSpacing: ".14em",
              color: COLORS.GRAY,
              flex: 1,
            }}
          >
            {TUTORIAL_TEXTS.heading} {step + 1}/{TUTORIAL_STEPS.length}
          </span>
          <button
            onClick={onClose}
            className="hv-underline"
            style={{
              background: "none",
              border: 0,
              color: COLORS.GRAY,
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
              padding: 2,
            }}
          >
            {TUTORIAL_TEXTS.skip}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 6 }}>
          <Mascot size={64} />
          <div style={{ flex: 1, fontSize: 13, lineHeight: 1.7, color: COLORS.INK }}>
            {s.speech}
          </div>
        </div>

        {/* 実操作で進むステップにはボタンを出さない(押してもらって検知する) */}
        {!s.done && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <Button size="md" onClick={isLast ? onClose : () => setStep((n) => n + 1)}>
              {isLast ? TUTORIAL_TEXTS.end : TUTORIAL_TEXTS.next}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
