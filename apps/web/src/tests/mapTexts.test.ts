import { describe, it, expect } from "vitest";
import { MAP_TEXTS } from "@/lib/campusData";
import { AREAS } from "@/lib/mapAreas";

// issue #51:駅マップに駅名ランドマーク注記が表示され、投影座標がマップ範囲に収まること。
describe("MAP_TEXTS 駅名ランドマーク", () => {
  it("駅エリアに駅名テキストが入っている", () => {
    expect(MAP_TEXTS.station_1.some((t) => t.t === "国際展示場駅")).toBe(true);
    expect(MAP_TEXTS.station_2.some((t) => t.t === "東京テレポート駅")).toBe(true);
  });

  it("駅名が駅の位置(投影)に重なる(地図中央ではない)", () => {
    // GeoJSON 由来のアンカー(station_1=駅舎 / station_2=駅前ロータリー)を投影した想定位置。
    // データ/投影が変わって位置がズレたらここで気づけるようにする。
    const nameOf = (area: "station_1" | "station_2", t: string) =>
      MAP_TEXTS[area].find((x) => x.t === t)!;
    const s1 = nameOf("station_1", "国際展示場駅");
    expect(s1.x).toBeCloseTo(405.7, 0);
    expect(s1.y).toBeCloseTo(162.6, 0);
    const s2 = nameOf("station_2", "東京テレポート駅");
    expect(s2.x).toBeCloseTo(431.9, 0);
    expect(s2.y).toBeCloseTo(299.8, 0);
  });

  it("注記座標が各エリアのマップ範囲内(pan/zoom 追従の前提)", () => {
    for (const area of ["station_1", "station_2"] as const) {
      const { w, h } = AREAS[area];
      for (const t of MAP_TEXTS[area]) {
        expect(t.x).toBeGreaterThanOrEqual(0);
        expect(t.x).toBeLessThanOrEqual(w);
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeLessThanOrEqual(h);
      }
    }
  });

  it("campus は空のまま(実地理化で模式注記がズレるため・issue #3)", () => {
    expect(MAP_TEXTS.campus).toEqual([]);
  });
});
