import { describe, expect, it } from "vitest";
import { mergeCampus } from "@/lib/campusData";
import type { CampusRes } from "@/types/messages";

// GET /api/campus のデータ → 内部 Building[] 変換(issue #14)。
// データ(名前・階・教室・type)はサーバー由来、レイアウト(x/y/w/h)はフロント保持。
const res: CampusRes = {
  areas: [{ id: "campus", name: "有明キャンパス" }],
  buildings: [
    {
      id: "b1",
      name: "1号館(サーバー更新)",
      svgRegionId: "region-b1",
      spots: [],
      floors: [
        {
          level: "9F",
          rooms: [
            { id: "b1-901", name: "901", type: "新設ゼミ室" },
            { id: "b1-902", name: "902" },
          ],
        },
      ],
    },
    // レイアウト未定義の建物 → スキップされる
    { id: "bX", name: "存在しない棟", spots: [], floors: [] },
  ],
  classrooms: [],
};

describe("mergeCampus (issue #14)", () => {
  it("サーバーデータとフロントレイアウトを統合する", () => {
    const merged = mergeCampus(res);
    const b1 = merged.find((b) => b.id === "b1")!;
    expect(b1.name).toBe("1号館(サーバー更新)"); // 名前はサーバー由来
    expect(typeof b1.x).toBe("number"); // レイアウトはフロント由来
    expect(typeof b1.w).toBe("number");
    expect(b1.floors[0].level).toBe("9F");
    // server {id,name,type} → 内部 {id,n,t}
    expect(b1.floors[0].rooms[0]).toEqual({ id: "b1-901", n: "901", t: "新設ゼミ室" });
    expect(b1.floors[0].rooms[1]).toEqual({ id: "b1-902", n: "902", t: null });
  });

  it("レイアウト未定義の建物はスキップする", () => {
    const merged = mergeCampus(res);
    expect(merged.find((b) => b.id === "bX")).toBeUndefined();
  });
});
