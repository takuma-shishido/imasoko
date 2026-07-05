import { CreateRoomModal } from "./modals/CreateRoomModal";
import { PinModal } from "./modals/PinModal";
import { PermModal } from "./modals/PermModal";
import { WarnPublicModal } from "./modals/WarnPublicModal";
import { LeaveModal } from "./modals/LeaveModal";

// 全モーダルのまとめ描画(各コンポーネントが自身のフラグで表示制御)。
export function RoomModals() {
  return (
    <>
      <CreateRoomModal />
      <PinModal />
      <PermModal />
      <WarnPublicModal />
      <LeaveModal />
    </>
  );
}
