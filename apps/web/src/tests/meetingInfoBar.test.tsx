// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MeetingInfoBar } from "@/components/MeetingInfoBar";

afterEach(cleanup);

// issue #38:集合時間は常時、集合場所+距離は設定時に表示し、距離は隠さない。
describe("MeetingInfoBar", () => {
  it("集合場所の設定時は 集合時間・場所・距離・クリアボタン を表示する", () => {
    const onClear = vi.fn();
    render(
      <MeetingInfoBar
        meetAtLabel="7/5 14:30"
        meetingSet={true}
        meetingLabel="3号館 2F"
        meetingDistSelf="あなたから 約120m"
        onClear={onClear}
      />
    );
    expect(screen.getByText("7/5 14:30")).toBeTruthy();
    expect(screen.getByText("3号館 2F")).toBeTruthy();
    expect(screen.getByText("あなたから 約120m")).toBeTruthy(); // 距離は常時表示
    const clearBtn = screen.getByLabelText("集合場所をクリア");
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it("集合場所が未設定でも集合時間は表示し、未設定を示す", () => {
    render(
      <MeetingInfoBar
        meetAtLabel="7/5 14:30"
        meetingSet={false}
        meetingLabel=""
        meetingDistSelf=""
        onClear={() => {}}
      />
    );
    expect(screen.getByText("7/5 14:30")).toBeTruthy();
    expect(screen.getByText("・ 集合場所は未設定")).toBeTruthy();
    expect(screen.queryByLabelText("集合場所をクリア")).toBeNull(); // クリアボタンは出さない
  });
});
