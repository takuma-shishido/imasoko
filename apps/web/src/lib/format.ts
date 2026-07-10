// 日時/残り時間フォーマット(プロトタイプの関数群を移植)。

export const fmt2 = (n: number): string => String(n).padStart(2, "0");

const d0off = (ts: number): number => new Date(ts).getTimezoneOffset() * 60000;

/** datetime-local の value 形式 "YYYY-MM-DDTHH:mm"(ローカルタイム)。 */
export const toLocalInput = (ts: number): string => {
  const d = new Date(ts - d0off(ts));
  return d.toISOString().slice(0, 16);
};

export const fromLocalInput = (v: string): number => (v ? new Date(v).getTime() : Date.now());

export const fmtMeetLabel = (ts: number): string => {
  const d = new Date(ts);
  return d.getMonth() + 1 + "/" + d.getDate() + " " + d.getHours() + ":" + fmt2(d.getMinutes());
};

// 単位(h/m/s)を付けることで「時間」か「分」かを一目で判別できるようにする(issue #49)。
// 以前は 1時間以上 h:mm / 未満 m:ss で、同じ "2:59" が 2時間59分/2分59秒 の両義だった。

/** 短い残り時間表示(1時間以上は 2h59m、未満は 4m59s、1分未満は 45s)。 */
export const fmtShort = (ms: number): string => {
  if (ms <= 0) return "0s";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  if (h >= 1) return h + "h" + fmt2(m) + "m";
  if (m >= 1) return m + "m" + fmt2(s) + "s";
  return s + "s";
};

/** 長い残り時間表示(2h59m30s)。fmtShort と単位表記をそろえる(issue #49)。 */
export const fmtLong = (ms: number): string => {
  if (ms <= 0) return "0h00m00s";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return h + "h" + fmt2(m) + "m" + fmt2(s) + "s";
};
