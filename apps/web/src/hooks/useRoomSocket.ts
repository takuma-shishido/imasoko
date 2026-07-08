import { useCallback, useEffect, useRef, useState } from "react";
import { WS_RECONNECT_BASE_MS, WS_RECONNECT_MAX_MS } from "@/lib/constants";
import type { ClientMsg, ServerMsg } from "@/types/messages";

// WebSocket 接続・指数バックオフ再接続・join 再送(docs/02 §5 / dev-docs §6)。
// RoomContext が map 画面(参加中)の間だけ実サーバー(apps/server)へ接続する(issue #1)。

export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed";

export function useRoomSocket(
  roomId: string | null,
  onMessage: (msg: ServerMsg) => void,
  joinMessage?: ClientMsg
) {
  const [status, setStatus] = useState<SocketStatus>("closed");
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(WS_RECONNECT_BASE_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    if (!roomId) return;
    closedRef.current = false;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/${roomId}`);
      wsRef.current = ws;
      setStatus(backoffRef.current === WS_RECONNECT_BASE_MS ? "connecting" : "reconnecting");

      ws.onopen = () => {
        backoffRef.current = WS_RECONNECT_BASE_MS;
        setStatus("open");
        if (joinMessage) ws.send(JSON.stringify(joinMessage)); // 再接続後は join を再送
      };
      ws.onmessage = (ev) => {
        try {
          onMessageRef.current(JSON.parse(ev.data) as ServerMsg);
        } catch {
          /* 不正メッセージは無視して継続 */
        }
      };
      ws.onclose = () => {
        if (closedRef.current) return;
        setStatus("reconnecting");
        timerRef.current = setTimeout(connect, backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, WS_RECONNECT_MAX_MS);
      };
    };

    connect();
    return () => {
      closedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  return { status, send };
}
