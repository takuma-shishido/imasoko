// キャンパス/エリア/メンバー/集合場所のドメイン型。
// docs/05 §1・§2・§4 と、プロトタイプ(いまそこ Prototype.dc.html)の内部表現に対応。

export type AreaId = "station_1" | "station_2" | "campus";

/** エリア定義(実地理マップのワールドサイズ + 距離換算 m/px)。 */
export interface AreaDef {
  name: string;
  short: string;
  w: number;
  h: number;
  mpp: number; // meters per pixel(おおよその距離表示用)
}

/** 緯度経度→描画座標(x,y)のアフィン係数(回転込み)。x=ax*(lng-lon0)+bx*(lat-lat0)+cx, y=同様。 */
export interface AreaProjection {
  lon0: number;
  lat0: number;
  ax: number;
  bx: number;
  cx: number;
  ay: number;
  by: number;
  cy: number;
}

/** docs/dev-docs §7:実測キャリブレーション付きエリア(実緯度経度→map座標変換用)。 */
export interface MapArea {
  id: AreaId;
  name: string;
  svg: string;
  width: number;
  height: number;
  bounds: {
    lat0: number; // 画像左上=北西角
    lng0: number;
    lat1: number; // 画像右下=南東角
    lng1: number;
  };
  /** あれば bounds 線形ではなく回転付きアフィンで投影(campus・issue #3)。 */
  matrix?: AreaProjection;
}

export interface Room {
  id: string;
  n: string; // 教室番号(例 "301")
  t: string | null; // 種別(例 "大教室")
}

export interface Floor {
  level: string; // "3F"
  rooms: Room[];
}

export interface Building {
  id: string; // "b1"
  name: string; // "1号館"
  fl?: string; // 最上階など補足
  cap?: string; // 建物のキャプション
  fs?: number; // ラベル文字サイズ上書き
  x: number;
  y: number;
  w: number;
  h: number;
  floors: Floor[];
}

export interface Member {
  id: string;
  name: string;
  area: AreaId;
  x: number;
  y: number;
  building: string | null;
  floor: string | null;
  viewer: boolean; // 閲覧のみ(位置非共有)
  lost: boolean; // 全エリア範囲外(圏外)
  lat: number | null; // 実 GPS(範囲外の方向計算に使う。位置非共有は null)
  lng: number | null;
}

/**
 * 集合場所(プロトタイプ内部表現)。docs/05 §4 の MeetingPoint union に対応。
 * - coords: 地図タップ地点(+任意メモ)
 * - member: 対象メンバーの現在地に追従
 * - place : 教室(classroom)or ランドマーク(spot=「◯号館前」)
 */
export type MeetingPoint =
  | { kind: "coords"; area: AreaId; x: number; y: number; note?: string }
  | { kind: "member"; memberId: string }
  | { kind: "place"; type: "classroom"; ref: string }
  | { kind: "place"; type: "spot"; ref: string };

/** 空き教室候補(crowd-sourced, docs/05 §4)。 */
export interface PlaceSuggestion {
  id: string;
  kind: "room";
  ref: string; // 教室id
  note: string;
  by: string; // 追加者名
}

export interface DemoRoom {
  id: string;
  title: string;
  members: number;
  exp: number; // expires_at (epoch ms)
  own?: boolean;
}

export interface Toast {
  id: number;
  msg: string;
  /** 退場アニメーション中フラグ。true の間はマウントしたままフェードアウトさせる。 */
  closing?: boolean;
}
