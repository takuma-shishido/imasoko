// 日時/残り時間フォーマット(プロトタイプの関数群を移植)。

export const fmt2 = (n: number): string => String(n).padStart(2, "0");

export const fmtClock = (ts: number): string => {
  const d = new Date(ts);
  return d.getHours() + ":" + fmt2(d.getMinutes());
};

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

/** 短い残り時間表示(1時間以上は h:mm、未満は m:ss)。 */
export const fmtShort = (ms: number): string => {
  if (ms <= 0) return "0:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return ms >= 3600000 ? h + ":" + fmt2(m) : m + ":" + fmt2(s);
};

/** 長い残り時間表示(h:mm:ss)。 */
export const fmtLong = (ms: number): string => {
  if (ms <= 0) return "0:00:00";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return h + ":" + fmt2(m) + ":" + fmt2(s);
};
