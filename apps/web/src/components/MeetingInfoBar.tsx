// 集合インフォバー(いつ・どこに。issue #38)。上部 chrome として全幅表示。
// 集合時間は常時、集合場所+距離は設定時に併記。距離は flex:none で隠さず、場所名のみ ellipsis で省略。
interface Props {
  meetAtLabel: string;
  meetingSet: boolean;
  meetingLabel: string;
  meetingDistSelf: string;
  onClear: () => void;
}
export function MeetingInfoBar({
  meetAtLabel,
  meetingSet,
  meetingLabel,
  meetingDistSelf,
  onClear,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 14px",
        borderBottom: "1px solid #ebebeb",
        background: "#fff",
        fontSize: 12,
      }}
    >
      {/* いつ(集合時間・常時表示) */}
      <span style={{ whiteSpace: "nowrap", flex: "none", fontWeight: 500 }}>
        <span style={{ color: "#888888", fontWeight: 400 }}>集合 </span>
        {meetAtLabel}
      </span>
      {/* どこに(集合場所+距離・設定時のみ)。距離は常時表示、場所名だけ省略する */}
      {meetingSet ? (
        <>
          <span style={{ color: "#d0d0d0", flex: "none" }}>・</span>
          <span
            style={{
              width: 8,
              height: 8,
              background: "#0070f3",
              transform: "rotate(45deg)",
              flex: "none",
            }}
          />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {meetingLabel}
          </span>
          <span style={{ color: "#888888", whiteSpace: "nowrap", flex: "none" }}>
            {meetingDistSelf}
          </span>
          <button
            onClick={onClear}
            aria-label="集合場所をクリア"
            style={{
              width: 20,
              height: 20,
              borderRadius: 9999,
              border: 0,
              background: "#f0f0f0",
              color: "#4d4d4d",
              cursor: "pointer",
              fontSize: 10,
              lineHeight: 1,
              flex: "none",
            }}
          >
            ✕
          </button>
        </>
      ) : (
        <span style={{ color: "#aaaaaa", flex: 1, whiteSpace: "nowrap" }}>・ 集合場所は未設定</span>
      )}
    </div>
  );
}
