import { describe, it, expect } from "vitest";
import { clampToEdge, project, projectClamped, resolveArea, unproject } from "@/lib/coords";
import { MAP_AREAS } from "@/lib/mapAreas";
import { CAMPUS_GEO_BOUNDS } from "@/lib/campusGeo";
import type { MapArea } from "@/types/campus";

// docs/02 §6:既知の対応点で座標変換をテストする。
const area: MapArea = {
  id: "campus",
  name: "test",
  svg: "",
  width: 800,
  height: 640,
  bounds: { lat0: 35.634, lng0: 139.792, lat1: 35.63, lng1: 139.796 },
};

describe("project", () => {
  it("北西角 → (0, 0)", () => {
    const p = project(area, area.bounds.lat0, area.bounds.lng0);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(0);
  });

  it("南東角 → (W, H)", () => {
    const p = project(area, area.bounds.lat1, area.bounds.lng1);
    expect(p.x).toBeCloseTo(800);
    expect(p.y).toBeCloseTo(640);
  });

  it("中央 → (W/2, H/2)", () => {
    const cLat = (area.bounds.lat0 + area.bounds.lat1) / 2;
    const cLng = (area.bounds.lng0 + area.bounds.lng1) / 2;
    const p = project(area, cLat, cLng);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(320);
  });
});

describe("projectClamped", () => {
  it("範囲内は out=false", () => {
    const cLat = (area.bounds.lat0 + area.bounds.lat1) / 2;
    const cLng = (area.bounds.lng0 + area.bounds.lng1) / 2;
    expect(projectClamped(area, cLat, cLng).out).toBe(false);
  });

  it("範囲外は端にクランプし out=true", () => {
    const r = projectClamped(area, area.bounds.lat0 + 0.01, area.bounds.lng0 - 0.01);
    expect(r.out).toBe(true);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeLessThanOrEqual(area.width);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeLessThanOrEqual(area.height);
  });
});

describe("resolveArea", () => {
  it("キャンパス矩形内の点は campus", () => {
    // 実測 bbox(campusGeo.ts)内の点(中心付近)
    expect(resolveArea(35.6303, 139.7858)).toBe("campus");
  });

  it("テレポート矩形内の点は station_2", () => {
    const b = MAP_AREAS.station_2.bounds;
    expect(resolveArea((b.lat0 + b.lat1) / 2, (b.lng0 + b.lng1) / 2)).toBe("station_2");
  });

  it("全エリア外は null", () => {
    expect(resolveArea(35.0, 139.0)).toBeNull();
  });
});

describe("campus 回転投影 (issue #3)", () => {
  it("project → unproject が元の緯度経度に戻る", () => {
    const lat = 35.6303;
    const lng = 139.7858;
    const p = project(MAP_AREAS.campus, lat, lng);
    const back = unproject(MAP_AREAS.campus, p.x, p.y);
    expect(back.lat).toBeCloseTo(lat, 5);
    expect(back.lng).toBeCloseTo(lng, 5);
  });

  it("bbox 内の点は 800x640 の範囲に投影される", () => {
    const b = CAMPUS_GEO_BOUNDS;
    const p = project(MAP_AREAS.campus, (b.lat0 + b.lat1) / 2, (b.lng0 + b.lng1) / 2);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(800);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(640);
  });
});

describe("clampToEdge — 範囲外の方向 (issue #3)", () => {
  it("右方向の点は右端に寄る", () => {
    const e = clampToEdge(400, 320, 2000, 320, 20, 20, 780, 620);
    expect(e.x).toBeCloseTo(780);
    expect(e.y).toBeCloseTo(320);
  });

  it("斜め方向は方向(傾き)を保って端に乗る", () => {
    const e = clampToEdge(400, 320, 1200, 1200, 0, 0, 800, 640);
    expect(e.x === 800 || e.y === 640).toBe(true);
    expect((e.y - 320) / (e.x - 400)).toBeCloseTo((1200 - 320) / (1200 - 400), 5);
  });
});
