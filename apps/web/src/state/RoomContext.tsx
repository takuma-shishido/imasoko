import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { RoomEngine, type RoomVals } from "./RoomEngine";
import { useRoomSocket } from "@/hooks/useRoomSocket";

const RoomCtx = createContext<RoomVals | null>(null);

// RoomEngine(プロトタイプの状態機械)を React にブリッジする。
// useSyncExternalStore で version を購読し、変化時に renderVals() を再計算する。
export function RoomProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<RoomEngine | null>(null);
  if (!engineRef.current) engineRef.current = new RoomEngine();
  const engine = engineRef.current;

  useSyncExternalStore(engine.subscribe, engine.getVersion, engine.getVersion);

  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, [engine]);

  // WebSocket 実配線(issue #1):map 画面(参加中)の間だけ実サーバーへ接続する。
  // screen が map を外れると roomId が null になり、useRoomSocket が切断(再接続しない)。
  const inRoom = engine.state.screen === "map";
  const roomId = inRoom ? engine.state.roomId : null;
  const { status, send } = useRoomSocket(
    roomId,
    engine.onServerMsg,
    inRoom ? engine.joinMessage() : undefined
  );
  useEffect(() => {
    engine.attachSocket(inRoom ? send : null);
    return () => engine.attachSocket(null);
  }, [engine, inRoom, send]);
  useEffect(() => {
    engine.setSocketStatus(status);
  }, [engine, status]);

  const vals = engine.renderVals();
  return <RoomCtx.Provider value={vals}>{children}</RoomCtx.Provider>;
}

export function useRoom(): RoomVals {
  const v = useContext(RoomCtx);
  if (!v) throw new Error("useRoom must be used within RoomProvider");
  return v;
}
