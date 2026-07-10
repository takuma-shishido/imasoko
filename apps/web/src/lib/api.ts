// REST クライアント(同一オリジン・相対パス。docs/dev-docs §5 / docs/05 §6)。
// RoomEngine から実サーバー(apps/server)への作成 / 取得 / 公開一覧 / visibility / campus / config 呼び出しに使用。

import type {
  CampusRes,
  ConfigRes,
  CreateRoomReq,
  CreateRoomRes,
  PublicRoomRes,
  RoomStatusRes,
  UpdateRoomReq,
  UpdateRoomRes,
} from "@/types/messages";
import { serverConfig } from "@/lib/constants";

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

  // ルームの部分更新(visibility / title。host のみ。issue #166)。指定フィールドだけ変更される。
  patchRoom: (roomId: string, hostToken: string, body: UpdateRoomReq): Promise<UpdateRoomRes> =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-host-token": hostToken },
      body: JSON.stringify(body),
    }).then(json<UpdateRoomRes>),

  getCampus: (): Promise<CampusRes> => fetch("/api/campus").then(json<CampusRes>),

  getConfig: (): Promise<ConfigRes> => fetch("/api/config").then(json<ConfigRes>),
};

// host_token の端末ローカル保存(docs/design/01)。
// ルーム消滅(集合+3時間)後も imasoko.host.* のキーが溜まり続けないよう、
// 有効期限付き JSON({t, exp})で保存し、期限切れは読み取り時と起動時の掃除で削除する。
export const hostTokenKey = (roomId: string) => `imasoko.host.${roomId}`;
const HOST_TOKEN_PREFIX = "imasoko.host.";

const parseHostToken = (raw: string): { t: string; exp: number } | null => {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v === "object" && v !== null && "t" in v && "exp" in v)
      return v as { t: string; exp: number };
  } catch {
    // 旧形式(生トークン文字列)は下で移行する
  }
  return null;
};

export const saveHostToken = (roomId: string, token: string, expiresAt: number) =>
  localStorage.setItem(hostTokenKey(roomId), JSON.stringify({ t: token, exp: expiresAt }));

export const getHostToken = (roomId: string): string | null => {
  const raw = localStorage.getItem(hostTokenKey(roomId));
  if (raw === null) return null;
  const v = parseHostToken(raw);
  if (v === null) {
    // 旧形式:残存し得る最大期間(+3時間)の期限を付けて移行し、いずれ掃除で消えるようにする
    saveHostToken(roomId, raw, Date.now() + serverConfig.endOffsetMs);
    return raw;
  }
  if (v.exp <= Date.now()) {
    localStorage.removeItem(hostTokenKey(roomId));
    return null;
  }
  return v.t;
};

// 期限切れの host_token をまとめて削除する(アプリ起動時に1回)。
export const pruneHostTokens = () => {
  const now = Date.now();
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(HOST_TOKEN_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    const v = parseHostToken(raw);
    if (v === null)
      localStorage.setItem(key, JSON.stringify({ t: raw, exp: now + serverConfig.endOffsetMs }));
    else if (v.exp <= now) localStorage.removeItem(key);
  }
};

// 表示名の端末ローカル保存(一度入れた名前を次回も使い回す・issue #22)。
export const nameKey = "imasoko.name";
export const saveName = (name: string) => localStorage.setItem(nameKey, name);
export const getName = (): string => localStorage.getItem(nameKey) ?? "";
