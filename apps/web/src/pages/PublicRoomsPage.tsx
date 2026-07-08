import { useRoom } from "@/state/RoomContext";
import { Button } from "@/components/ui/Button";
import { COLORS } from "@/lib/theme";

// 公開ルーム一覧(design/02)。
export function PublicRoomsPage() {
  const v = useRoom();
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          borderBottom: `1px solid ${COLORS.BORDER}`,
        }}
      >
        <button
          onClick={v.goTop}
          className="hv-border"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9999,
            border: `1px solid ${COLORS.BORDER}`,
            background: COLORS.WHITE,
            cursor: "pointer",
            fontSize: 15,
            color: COLORS.INK,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ←
        </button>
        <div style={{ fontWeight: 600, fontSize: 16, flex: 1 }}>公開ルーム</div>
        <button
          onClick={v.refreshPublic}
          className="hv-border"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9999,
            border: `1px solid ${COLORS.BORDER}`,
            background: COLORS.WHITE,
            cursor: "pointer",
            color: COLORS.INK,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: v.refreshAnim,
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3" />
          </svg>
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, color: COLORS.GRAY }}>
          参加すると、現在地がルームの参加者に共有されます。
        </div>

        {v.publicRooms.map((pr, i) => (
          <div
            key={i}
            onClick={pr.open}
            className="hv-border"
            style={{
              background: COLORS.WHITE,
              border: `1px solid ${COLORS.BORDER}`,
              borderRadius: 8,
              padding: 16,
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{pr.title}</div>
              <div
                style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: COLORS.SUBTLE }}
              >
                残り {pr.remaining}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
              <div style={{ fontSize: 12.5, color: COLORS.GRAY, flex: 1 }}>
                {pr.members}人が参加中
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.BLUE }}>参加する →</div>
            </div>
          </div>
        ))}

        {v.noPublicRooms && (
          <div
            style={{ textAlign: "center", padding: "56px 20px", color: COLORS.GRAY, fontSize: 13 }}
          >
            いま公開されているルームはありません
            <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
              <Button variant="secondary" size="md" onClick={v.goTop} style={{ width: 140 }}>
                トップへ戻る
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
