// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getHostToken, hostTokenKey, pruneHostTokens, saveHostToken } from "@/lib/api";

// host_token の端末ローカル保存。ルーム消滅後も imasoko.host.* のキーが
// 溜まり続けないよう、有効期限付きで保存し期限切れは掃除されることを検証する。
afterEach(() => localStorage.clear());

describe("host_token の有効期限付き保存", () => {
  it("期限内は取得でき、期限切れは null を返してキーも消える", () => {
    saveHostToken("alive", "tok1", Date.now() + 3600000);
    saveHostToken("dead", "tok2", Date.now() - 1000);

    expect(getHostToken("alive")).toBe("tok1");
    expect(getHostToken("dead")).toBeNull();
    expect(localStorage.getItem(hostTokenKey("dead"))).toBeNull(); // 読み取り時に削除
  });

  it("pruneHostTokens は期限切れのキーだけをまとめて削除する", () => {
    saveHostToken("alive", "tok1", Date.now() + 3600000);
    saveHostToken("dead1", "tok2", Date.now() - 1000);
    saveHostToken("dead2", "tok3", Date.now() - 1000);
    localStorage.setItem("imasoko.name", "たろう"); // 無関係なキーは触らない

    pruneHostTokens();

    expect(localStorage.getItem(hostTokenKey("alive"))).not.toBeNull();
    expect(localStorage.getItem(hostTokenKey("dead1"))).toBeNull();
    expect(localStorage.getItem(hostTokenKey("dead2"))).toBeNull();
    expect(localStorage.getItem("imasoko.name")).toBe("たろう");
  });

  it("旧形式(生トークン文字列)は読める + 期限付きへ移行され、いずれ掃除対象になる", () => {
    localStorage.setItem(hostTokenKey("legacy"), "raw-token");

    expect(getHostToken("legacy")).toBe("raw-token"); // 読み取りは従来どおり
    const migrated = JSON.parse(localStorage.getItem(hostTokenKey("legacy"))!);
    expect(migrated.t).toBe("raw-token");
    expect(migrated.exp).toBeGreaterThan(Date.now()); // 期限が付与されている
  });
});
