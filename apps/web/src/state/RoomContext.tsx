import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { RoomEngine, type RoomVals } from "./RoomEngine";
import { useRoomSocket } from "@/hooks/useRoomSocket";
import { useGeolocation } from "@/hooks/useGeolocation";

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
    void engine.loadCampus(); // キャンパスマスタを実サーバーから取得(issue #14)
    void engine.loadConfig(); // サーバー定数(期限・上限)を取得し二重管理を解消(issue #15)
    return () => engine.stop();
  }, [engine]);

  // WebSocket 実配線(issue #1):map 画面(参加中)の間だけ実サーバーへ接続する。
  // screen が map を外れると roomId が null になり、useRoomSocket が切断(再接続しない)。
  const inRoom = engine.state.screen === "map";
  const roomId = inRoom ? engine.state.roomId : null;
  const { status, send } = useRoomSocket(
    roomId,
    engine.socket.onServerMsg,
    inRoom ? engine.joinMessage() : undefined
  );
  useEffect(() => {
    engine.attachSocket(inRoom ? send : null);
    return () => engine.attachSocket(null);
  }, [engine, inRoom, send]);
  useEffect(() => {
    engine.setSocketStatus(status);
  }, [engine, status]);

  // 実位置取得(issue #2):参加中かつ位置共有(閲覧のみでない)ときだけ watchPosition。
  // 実測値は engine.onGeoPosition(自分ピン反映 + throttle 送信)へ。
  const geoEnabled = inRoom && !engine.state.viewerOnly;
  const geo = useGeolocation(geoEnabled, engine.onGeoPosition);
  useEffect(() => {
    if (geoEnabled && (geo.status === "denied" || geo.status === "unsupported")) {
      engine.onGeoDenied(geo.status === "unsupported");
    }
  }, [engine, geoEnabled, geo.status]);

  const vals = engine.renderVals();
  return <RoomCtx.Provider value={vals}>{children}</RoomCtx.Provider>;
}

export function useRoom(): RoomVals {
  const v = useContext(RoomCtx);
  if (!v) throw new Error("useRoom must be used within RoomProvider");
  return v;
}
