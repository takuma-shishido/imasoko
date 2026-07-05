import { useRoom } from "@/state/RoomContext";
import { BottomSheet } from "./BottomSheet";
import { MemberList } from "./MemberList";
import { CampusView } from "./CampusView";
import { MeetingPointPicker } from "./MeetingPointPicker";
import { ShareButton } from "./ShareButton";
import { RoomVisibility } from "./RoomVisibility";

// 開いているボトムシート(1枚)を描画する(design/00 共通ルール)。
export function RoomSheets() {
  const v = useRoom();
  if (!v.sheetOpen) return null;
  return (
    <BottomSheet
      onClose={v.closeSheet}
      closing={v.sheetClosing}
      sheetRef={v.sheetRef}
      onHandleDown={v.hDown}
      onHandleMove={v.hMove}
      onHandleUp={v.hUp}
      onHandleCancel={v.hCancel}
    >
      {v.shMembers && <MemberList />}
      {v.shBuilding && <CampusView />}
      {v.shMeeting && <MeetingPointPicker />}
      {v.shShare && <ShareButton />}
      {v.shSettings && <RoomVisibility />}
    </BottomSheet>
  );
}
