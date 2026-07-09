import { afterEach, describe, expect, it } from "vitest";
import {
  classroomDataDate,
  classroomDataStale,
  classroomFreeAt,
  classroomNowLabel,
  setClassrooms,
} from "@/lib/campusData";
import type { CampusClassroom } from "@/types/messages";

// GET /api/campus の classrooms[](空き時間帯)→ 空き判定・表示用ヘルパー(issue #142)。

const rooms: CampusClassroom[] = [
  {
    building_id: "b1",
    floor: "2F",
    room_id: "b1-201",
    name: "201",
    capacity: 40,
    date: "2026-07-09",
    available: [
      { start: "00:00", end: "08:50" },
      { start: "10:30", end: "13:10" },
      { start: "19:00", end: "24:00" },
    ],
  },
  {
    building_id: "b1",
    floor: "3F",
    room_id: "b1-307",
    name: "307",
    capacity: 40,
    date: "2026-07-09",
    available: [], // 終日使用中
  },
];

const at = (hm: string): number => new Date(`2026-07-09T${hm}:00`).getTime();

afterEach(() => setClassrooms([]));

describe("classroomFreeAt", () => {
  it("空き時間帯内なら true、境界の終了時刻は false(半開区間)", () => {
    setClassrooms(rooms);
    expect(classroomFreeAt("b1-201", at("11:00"))).toBe(true);
    expect(classroomFreeAt("b1-201", at("10:30"))).toBe(true); // 開始時刻ちょうどは空き
    expect(classroomFreeAt("b1-201", at("13:10"))).toBe(false); // 終了時刻ちょうどは使用中
    expect(classroomFreeAt("b1-201", at("09:30"))).toBe(false);
    expect(classroomFreeAt("b1-201", at("23:59"))).toBe(true); // 24:00 終端まで空き
  });

  it("終日使用中の教室は常に false、データが無い教室は null", () => {
    setClassrooms(rooms);
    expect(classroomFreeAt("b1-307", at("12:00"))).toBe(false);
    expect(classroomFreeAt("b9-999", at("12:00"))).toBeNull();
  });

  it("空き情報が未ロードなら null(表示は壊れない)", () => {
    expect(classroomFreeAt("b1-201", at("11:00"))).toBeNull();
  });
});

describe("classroomNowLabel", () => {
  it("空き中は「いつまで空きか」、使用中は「いつから空くか」を返す", () => {
    setClassrooms(rooms);
    expect(classroomNowLabel("b1-201", at("11:00"))).toEqual({
      free: true,
      text: "空き(13:10まで)",
    });
    expect(classroomNowLabel("b1-201", at("09:30"))).toEqual({
      free: false,
      text: "使用中(10:30から空き)",
    });
  });

  it("この後空きが無い教室・データが無い教室", () => {
    setClassrooms(rooms);
    expect(classroomNowLabel("b1-307", at("12:00"))).toEqual({
      free: false,
      text: "使用中(本日はこのあと空きなし)",
    });
    expect(classroomNowLabel("b9-999", at("12:00"))).toBeNull();
  });
});

describe("classroomDataDate / classroomDataStale", () => {
  it("エクスポート対象日と判定日が別日なら stale", () => {
    setClassrooms(rooms);
    expect(classroomDataDate()).toBe("2026-07-09");
    expect(classroomDataStale(at("12:00"))).toBe(false);
    expect(classroomDataStale(new Date("2026-07-10T12:00:00").getTime())).toBe(true);
  });

  it("データが無ければ date は空・stale は false", () => {
    expect(classroomDataDate()).toBe("");
    expect(classroomDataStale(at("12:00"))).toBe(false);
  });
});
