import { useRoom } from "@/state/RoomContext";
import { FloorSelector } from "./FloorSelector";

// メンバー一覧シート(design/04)。自分の場所(建物+階)変更 + 各メンバー行(タップで地図を寄せる)。
export function MemberList() {
  const v = useRoom();
  return (
    <div>
      <div
        style={{
          fontFamily: "'Geist Mono',monospace",
          fontSize: 10.5,
          letterSpacing: ".14em",
          color: "#888888",
        }}
      >
        MEMBERS
      </div>
      <div style={{ fontSize: 17, fontWeight: 600, margin: "3px 0 14px" }}>
        参加者 {v.memberCount} / {v.memberMax}人
      </div>

      <div
        style={{
          background: "#f5f5f5",
          borderRadius: 8,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 12, color: "#4d4d4d", whiteSpace: "nowrap", flex: "none" }}>
          自分の場所
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FloorSelector
            buildingValue={v.selfB}
            onBuilding={v.onSelfB}
            buildingOpts={v.buildingOpts}
            floorValue={v.selfF}
            onFloor={v.onSelfF}
            floorOpts={v.selfFloorOpts}
            height={34}
            fontSize={12}
            floorPlaceholder="階"
          />
        </div>
      </div>

      {v.memberRows.map((m) => (
        <div
          key={m.id}
          onClick={m.focus}
          className="hv-bg-soft"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 2px",
            borderBottom: "1px solid #ebebeb",
            cursor: "pointer",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: m.avBg,
              color: m.avFg,
              border: `1.5px solid ${m.avBd}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: 14,
              flex: "none",
            }}
          >
            {m.initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</span>
              {m.tag && (
                <span
                  style={{
                    fontSize: 10,
                    color: "#4d4d4d",
                    background: "#f5f5f5",
                    borderRadius: 9999,
                    padding: "1px 8px",
                  }}
                >
                  {m.tag}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: "#888888", marginTop: 2 }}>{m.loc}</div>
          </div>
          <div
            style={{
              fontFamily: "'Geist Mono',monospace",
              fontSize: 11,
              color: "#4d4d4d",
              textAlign: "right",
            }}
          >
            {m.dist}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11.5, color: "#888888", marginTop: 12 }}>
        タップすると地図がその人の位置へ移動します。集合場所を設定すると、各メンバーからのおおよその距離が表示されます。
      </div>
    </div>
  );
}
