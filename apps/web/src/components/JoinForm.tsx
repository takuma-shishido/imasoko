import { useRoom } from "@/state/RoomContext";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { FloorSelector } from "./FloorSelector";

// 参加フォーム(design/03)。名前(+任意で建物・階)を入力して参加 / 見るだけ参加。
export function JoinForm() {
  const v = useRoom();
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", borderBottom: "1px solid #ebebeb" }}>
        <div style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{v.roomTitleDisplay}</div>
        <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "#4d4d4d", background: "#f5f5f5", borderRadius: 9999, padding: "4px 10px" }}>
          残り {v.remainingShort}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "26px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10.5, letterSpacing: ".14em", color: "#888888" }}>JOIN</div>
          <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: -0.4, marginTop: 4 }}>名前を入れて参加する。</div>
        </div>

        <Input size="lg" label="表示名" placeholder="ニックネームでOK(1〜20文字)" value={v.name} onChange={v.onName} error={v.nameError} />

        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            いる場所<span style={{ color: "#888888", fontWeight: 400 }}>(任意)</span>
          </div>
          <div style={{ fontSize: 12, color: "#888888", marginTop: 2 }}>
            屋内にいる場合は建物と階を選べます。あとから変更できます。
          </div>
          <div style={{ marginTop: 10 }}>
            <FloorSelector
              buildingValue={v.joinB}
              onBuilding={v.onJoinB}
              buildingOpts={v.buildingOpts}
              floorValue={v.joinF}
              onFloor={v.onJoinF}
              floorOpts={v.joinFloorOpts}
            />
          </div>
        </div>

        <div style={{ background: "#f5f5f5", borderRadius: 8, padding: "12px 14px", fontSize: 12.5, color: "#4d4d4d", lineHeight: 1.7 }}>
          位置情報を許可すると、地図に自分のピンが表示されます。位置は最新の値だけが共有され、履歴は残りません。
        </div>

        <Button variant="primary" size="lg" disabled={v.joinDisabled} onClick={v.tapJoin}>
          参加する
        </Button>

        <div style={{ textAlign: "center" }}>
          <button
            onClick={v.joinViewer}
            className="hv-underline"
            style={{ background: "none", border: 0, color: "#0070f3", fontSize: 13, fontFamily: "inherit", cursor: "pointer", padding: 4 }}
          >
            位置情報なしで「見るだけ」参加 →
          </button>
        </div>
      </div>
    </div>
  );
}
