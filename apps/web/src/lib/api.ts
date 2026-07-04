// REST クライアント(同一オリジン・相対パス。docs/dev-docs §5 / docs/05 §6)。
// ※ 本アプリのデモはシミュレーションで自走するため、これらはバックエンド雛形(apps/server)を
//    実配線する際に使用する。エンドポイントは docs 準拠。

import type {
  CreateRoomReq,
  CreateRoomRes,
  PublicRoomRes,
  RoomStatusRes,
  Visibility,
} from "@/types/messages";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new HttpError(res.status, res.statusText);
  return (await res.json()) as T;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const api = {
  createRoom: (body: CreateRoomReq = {}): Promise<CreateRoomRes> =>
    fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(json<CreateRoomRes>),

  getRoom: (roomId: string): Promise<RoomStatusRes> =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}`).then(json<RoomStatusRes>),

  getPublicRooms: (): Promise<PublicRoomRes[]> =>
    fetch("/api/rooms/public").then(json<PublicRoomRes[]>),

  patchVisibility: (
    roomId: string,
    hostToken: string,
    visibility: Visibility,
    title?: string
  ): Promise<{ visibility: Visibility }> =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/visibility`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-host-token": hostToken },
      body: JSON.stringify({ visibility, title }),
    }).then(json<{ visibility: Visibility }>),

  getCampus: (): Promise<unknown> => fetch("/api/campus").then(json<unknown>),
};

// host_token の端末ローカル保存(docs/design/01)。
export const hostTokenKey = (roomId: string) => `imasoko.host.${roomId}`;
export const saveHostToken = (roomId: string, token: string) =>
  localStorage.setItem(hostTokenKey(roomId), token);
export const getHostToken = (roomId: string): string | null =>
  localStorage.getItem(hostTokenKey(roomId));
