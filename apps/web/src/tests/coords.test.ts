import { describe, it, expect } from "vitest";
import { project, projectClamped, resolveArea } from "@/lib/coords";
import { MAP_AREAS } from "@/lib/mapAreas";
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
    expect(resolveArea(35.632, 139.794)).toBe("campus");
  });

  it("テレポート矩形内の点は station_2", () => {
    const b = MAP_AREAS.station_2.bounds;
    expect(resolveArea((b.lat0 + b.lat1) / 2, (b.lng0 + b.lng1) / 2)).toBe("station_2");
  });

  it("全エリア外は null", () => {
    expect(resolveArea(35.0, 139.0)).toBeNull();
  });
});
