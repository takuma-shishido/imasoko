import { useRoom } from "@/state/RoomContext";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { FloorSelector } from "./FloorSelector";
import { RemainingChip } from "./RemainingChip";
import { COLORS } from "@/lib/theme";

// 参加フォーム(design/03)。名前(+任意で建物・階)を入力して参加 / 見るだけ参加。
export function JoinForm() {
  const v = useRoom();
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "14px 20px",
          borderBottom: `1px solid ${COLORS.BORDER}`,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{v.roomTitleDisplay}</div>
        <RemainingChip remaining={v.remainingShort} timerColor={v.timerColor} />
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "26px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Geist Mono',monospace",
              fontSize: 10.5,
              letterSpacing: ".14em",
              color: COLORS.GRAY,
            }}
          >
            JOIN
          </div>
          <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: -0.4, marginTop: 4 }}>
            名前を入れて参加する。
          </div>
        </div>

        <Input
          size="lg"
          label="表示名"
          placeholder={`ニックネームでOK(1〜${v.nameMax}文字)`}
          value={v.name}
          onChange={v.onName}
          error={v.nameError}
        />

        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            いる場所<span style={{ color: COLORS.GRAY, fontWeight: 400 }}>(任意)</span>
          </div>
          <div style={{ fontSize: 12, color: COLORS.GRAY, marginTop: 2 }}>
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

        <div
          style={{
            background: COLORS.BG,
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: 12.5,
            color: COLORS.SUBTLE,
            lineHeight: 1.7,
          }}
        >
          位置情報を許可すると、地図に自分のピンが表示されます。位置は最新の値だけが共有され、履歴は残りません。
        </div>

        <div data-tutorial="join-submit" style={{ display: "flex", flexDirection: "column" }}>
          <Button variant="primary" size="lg" disabled={v.joinDisabled} onClick={v.tapJoin}>
            参加する
          </Button>
        </div>

        <div style={{ textAlign: "center" }}>
          <button
            onClick={v.joinViewer}
            className="hv-underline"
            style={{
              background: "none",
              border: 0,
              color: COLORS.BLUE,
              fontSize: 13,
              fontFamily: "inherit",
              cursor: "pointer",
              padding: 4,
            }}
          >
            位置情報なしで「見るだけ」参加 →
          </button>
        </div>
      </div>
    </div>
  );
}
