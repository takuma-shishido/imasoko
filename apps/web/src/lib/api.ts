// REST クライアント(同一オリジン・相対パス。docs/dev-docs §5 / docs/05 §6)。
// RoomEngine から実サーバー(apps/server)への作成 / 取得 / 公開一覧 / visibility / campus / config 呼び出しに使用。

import type {
  CampusRes,
  ConfigRes,
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

  getCampus: (): Promise<CampusRes> => fetch("/api/campus").then(json<CampusRes>),

  getConfig: (): Promise<ConfigRes> => fetch("/api/config").then(json<ConfigRes>),
};

// host_token の端末ローカル保存(docs/design/01)。
export const hostTokenKey = (roomId: string) => `imasoko.host.${roomId}`;
export const saveHostToken = (roomId: string, token: string) =>
  localStorage.setItem(hostTokenKey(roomId), token);
export const getHostToken = (roomId: string): string | null =>
  localStorage.getItem(hostTokenKey(roomId));

// 表示名の端末ローカル保存(一度入れた名前を次回も使い回す・issue #22)。
export const nameKey = "imasoko.name";
export const saveName = (name: string) => localStorage.setItem(nameKey, name);
export const getName = (): string => localStorage.getItem(nameKey) ?? "";
