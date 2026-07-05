import { describe, it, expect } from "vitest";
import { fmtShort, fmtLong } from "@/lib/format";

const H = 3600000;
const M = 60000;
const S = 1000;

// issue #49:残り時間の単位(時間/分/秒)が一目で判別できることを保証する。
describe("fmtShort", () => {
  it("1時間以上は h/m 単位で表示する(秒は落とす)", () => {
    expect(fmtShort(2 * H + 59 * M)).toBe("2h59m");
    expect(fmtShort(2 * H + 59 * M + 30 * S)).toBe("2h59m"); // 30秒は表示しない
    expect(fmtShort(12 * H + 5 * M)).toBe("12h05m"); // 分は2桁ゼロ埋め
    expect(fmtShort(H)).toBe("1h00m"); // ちょうど1時間
  });

  it("1時間未満は m/s 単位で表示する(1時間以上と混同しない)", () => {
    expect(fmtShort(2 * M + 59 * S)).toBe("2m59s"); // かつて "2:59" で 2時間59分と両義だった
    expect(fmtShort(4 * M + 59 * S)).toBe("4m59s");
    expect(fmtShort(H - S)).toBe("59m59s"); // 1時間の直前
  });

  it("1分未満は s 単位のみ", () => {
    expect(fmtShort(45 * S)).toBe("45s");
    expect(fmtShort(M - S)).toBe("59s");
  });

  it("0以下は 0s", () => {
    expect(fmtShort(0)).toBe("0s");
    expect(fmtShort(-1000)).toBe("0s");
  });
});

describe("fmtLong", () => {
  it("h/m/s をゼロ埋めで表示する", () => {
    expect(fmtLong(2 * H + 59 * M + 30 * S)).toBe("2h59m30s");
    expect(fmtLong(H + 5 * M + 9 * S)).toBe("1h05m09s");
    expect(fmtLong(5 * M)).toBe("0h05m00s"); // 1時間未満でも常に h から表示
  });

  it("0以下は 0h00m00s", () => {
    expect(fmtLong(0)).toBe("0h00m00s");
    expect(fmtLong(-1000)).toBe("0h00m00s");
  });
});
