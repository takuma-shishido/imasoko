import type { ReactNode } from "react";
import type { AreaId, AreaProjection } from "@/types/campus";
import { useRoom } from "@/state/RoomContext";
import { CAMPUS_PROJECTION } from "@/lib/campusGeo";
import { STATION1_PROJECTION } from "@/lib/station1Geo";
import { STATION2_PROJECTION } from "@/lib/station2Geo";
import { CampusSvg } from "./map/CampusSvg";
import { Station1Svg } from "./map/Station1Svg";
import { Station2Svg } from "./map/Station2Svg";

// 実地図は街区に合わせて回転しているため、北がどちらかを示すコンパスの回転角(度)をエリア別に用意。
// 北方向の画面ベクトルは (bx, by)。上向き矢印をこの角度だけ時計回りに回すと北を指す。
const northDegOf = (p: AreaProjection): number => (Math.atan2(p.bx, -p.by) * 180) / Math.PI;
const NORTH_DEG: Record<AreaId, number> = {
  campus: northDegOf(CAMPUS_PROJECTION),
  station_1: northDegOf(STATION1_PROJECTION),
  station_2: northDegOf(STATION2_PROJECTION),
};

// 地図ビュー(Leaflet 相当の pan/zoom を CSS transform で実装した模式版)。
// SVG・注記テキスト・建物・ピン・集合ピン・バナー・FAB を描画する(design/04)。
export function MapView() {
  const v = useRoom();
  return (
    <div
      ref={v.vpRef}
      onPointerDown={v.onMapDown}
      onPointerMove={v.onMapMove}
      onPointerUp={v.onMapUp}
      onWheel={v.onMapWheel}
      style={{
        flex: 1,
        position: "relative",
        overflow: "hidden",
        background: "#f5f5f5",
        touchAction: "none",
        userSelect: "none", // ドラッグ/長押しで地図上テキストが選択されるのを防ぐ(issue #36)
        WebkitUserSelect: "none", // Safari / iOS
        cursor: "grab",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: v.worldW,
          height: v.worldH,
          transform: v.mapTransform,
          transformOrigin: "0 0",
        }}
      >
        {v.isCampusArea && <CampusSvg />}
        {v.isSt1 && <Station1Svg />}
        {v.isSt2 && <Station2Svg />}

        {/* 注記テキストレイヤー */}
        {v.mapTexts.map((tx, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${tx.x}px`,
              top: `${tx.y}px`,
              transform: tx.tf,
              fontSize: tx.size,
              fontWeight: tx.w,
              color: tx.c,
              fontFamily: tx.ff,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 1,
              letterSpacing: tx.ls,
            }}
          >
            {tx.t}
          </div>
        ))}

        {/* 建物レイヤー(クリックで建物パネル) */}
        {v.isCampusArea &&
          v.campusBuildings.map((cb) => (
            <div
              key={cb.id}
              onClick={cb.pick}
              data-b={cb.id}
              style={{
                position: "absolute",
                left: cb.x,
                top: cb.y,
                width: cb.w,
                height: cb.h,
                background: "#ffffff",
                border: `${cb.bw}px solid ${cb.bd}`,
                borderRadius: 7,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                zIndex: 1,
                boxSizing: "border-box",
                overflow: "hidden",
                padding: "0 3px",
              }}
            >
              <span
                style={{
                  fontSize: Math.min(cb.fs, 13),
                  fontWeight: 600,
                  letterSpacing: -0.5,
                  color: "#171717",
                  lineHeight: 1.1,
                  maxWidth: "100%",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {cb.name}
              </span>
              {cb.cap && cb.h > 34 && (
                <span
                  style={{
                    fontSize: 9,
                    color: "#888888",
                    lineHeight: 1.2,
                    maxWidth: "100%",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {cb.cap}
                </span>
              )}
            </div>
          ))}

        {/* 集合ピン(member 追従型は対象ピンを青くするため描画しない) */}
        {v.meetingPinOn && (
          <div
            style={{
              position: "absolute",
              left: `${v.meetingPinX}px`,
              top: `${v.meetingPinY}px`,
              transform: `translate(-50%,-100%) scale(${v.invScale})`,
              transformOrigin: "50% 100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                background: "#0070f3",
                color: "#fff",
                borderRadius: 9999,
                padding: "2px 9px",
                fontSize: 10.5,
                fontWeight: 500,
                whiteSpace: "nowrap",
                boxShadow: "0 1px 3px rgba(0,0,0,.2)",
              }}
            >
              集合 ・ {v.meetingLabel}
            </div>
            <div
              style={{
                width: 13,
                height: 13,
                background: "#0070f3",
                border: "2px solid #fff",
                transform: "rotate(45deg)",
                boxShadow: "0 1px 3px rgba(0,0,0,.25)",
              }}
            />
          </div>
        )}

        {/* 参加者ピン */}
        {v.pinList.map((p, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${p.x}px`,
              top: `${p.y}px`,
              transform: `translate(-50%,-100%) scale(${v.invScale})`,
              transformOrigin: "50% 100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              zIndex: 3,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                background: p.chipBg,
                color: p.chipFg,
                border: `1px solid ${p.chipBd}`,
                borderRadius: 9999,
                padding: "2px 8px",
                fontSize: 10.5,
                fontWeight: 500,
                whiteSpace: "nowrap",
                boxShadow: "0 1px 2px rgba(0,0,0,.10)",
              }}
            >
              {p.label}
            </div>
            <div
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                background: p.dotBg,
                border: `2.5px solid ${p.dotBd}`,
                animation: p.anim,
              }}
            />
          </div>
        ))}
      </div>

      {/* 集合地点タップモードのバナー */}
      {v.pickMode && (
        <div
          data-nopan="1"
          style={{
            position: "absolute",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#171717",
            color: "#fff",
            borderRadius: 9999,
            padding: "7px 8px 7px 16px",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            zIndex: 8,
            boxShadow: "0 4px 14px rgba(0,0,0,.25)",
            whiteSpace: "nowrap",
          }}
        >
          地図をタップして集合地点を指定
          <button
            onClick={v.cancelPick}
            style={{
              height: 24,
              padding: "0 10px",
              borderRadius: 9999,
              border: 0,
              background: "rgba(255,255,255,.18)",
              color: "#fff",
              fontSize: 11,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>
        </div>
      )}

      {/* 集合インフォバナー:集合時間は常時、集合場所は設定時に併記(いつ・どこに。issue #38) */}
      {v.screen === "map" && !v.pickMode && (
        <div
          data-nopan="1"
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            background: "#fff",
            border: "1px solid #ebebeb",
            borderRadius: 9999,
            padding: "5px 12px",
            fontSize: 11.5,
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,.10)",
            maxWidth: "78%", // 狭幅端末で右上コンパス(right:12)と重ならない範囲
          }}
        >
          {/* いつ(集合時間・常時表示) */}
          <span style={{ whiteSpace: "nowrap", fontWeight: 500, flex: "none" }}>
            <span style={{ color: "#888888", fontWeight: 400 }}>集合 </span>
            {v.meetAtLabel}
          </span>
          {/* どこに(集合場所・設定時のみ) */}
          {v.meetingSet && (
            <>
              <span style={{ width: 1, height: 14, background: "#ebebeb", flex: "none" }} />
              <span
                style={{
                  width: 9,
                  height: 9,
                  background: "#0070f3",
                  transform: "rotate(45deg)",
                  flex: "none",
                }}
              />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {v.meetingLabel}
                <span style={{ color: "#888888" }}> ・ {v.meetingDistSelf}</span>
              </span>
              <button
                onClick={v.clearMeeting}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 9999,
                  border: 0,
                  background: "#f5f5f5",
                  color: "#4d4d4d",
                  cursor: "pointer",
                  fontSize: 11,
                  lineHeight: 1,
                  flex: "none",
                  marginRight: -4,
                }}
              >
                ✕
              </button>
            </>
          )}
        </div>
      )}

      {/* 方位コンパス(実地図は街区に合わせ回転しているため北を示す。3エリア共通) */}
      {v.screen === "map" && (
        <div
          data-nopan="1"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 36,
            height: 36,
            borderRadius: 9999,
            background: "#fff",
            boxShadow: "0 2px 8px rgba(0,0,0,.12)",
            zIndex: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="北の向き"
        >
          <svg
            width="36"
            height="36"
            viewBox="-18 -18 36 36"
            style={{ transform: `rotate(${NORTH_DEG[v.area]}deg)` }}
          >
            <path d="M0 -12 L4 1 L0 -2 L-4 1 Z" fill="#ee0000" />
            <path d="M0 -2 L4 1 L0 12 L-4 1 Z" fill="#c8c8c8" />
            <text x="0" y="-13" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ee0000">
              N
            </text>
          </svg>
        </div>
      )}

      {/* 地図FAB */}
      <div
        data-nopan="1"
        style={{
          position: "absolute",
          right: 12,
          bottom: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          zIndex: 6,
        }}
      >
        <FabButton onClick={v.fabZoomIn} title="拡大">
          ＋
        </FabButton>
        <FabButton onClick={v.fabZoomOut} title="縮小">
          −
        </FabButton>
        <FabButton onClick={v.fabSelf} title="現在地へ">
          <svg
            width="17"
            height="17"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="9" cy="9" r="4" />
            <path d="M9 1v3M9 14v3M1 9h3M14 9h3" />
          </svg>
        </FabButton>
        <FabButton onClick={v.fabFit} title="全員表示">
          <svg
            width="17"
            height="17"
            viewBox="0 0 18 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 6V3h3M12 3h3v3M15 12v3h-3M6 15H3v-3" />
          </svg>
        </FabButton>
      </div>
    </div>
  );
}

function FabButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="hv-border"
      style={{
        width: 38,
        height: 38,
        borderRadius: 9999,
        border: "1px solid #ebebeb",
        background: "#fff",
        cursor: "pointer",
        color: "#171717",
        fontSize: 17,
        boxShadow: "0 2px 8px rgba(0,0,0,.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}
