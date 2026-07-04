import { useEffect, useRef, useState } from "react";

// watchPosition ラッパ(docs/02 §5 / 企画書 4.2)。
// 許可 → 位置を継続取得、拒否/非対応 → 「閲覧のみ」相当。
// ※ 本アプリのデモは擬似許可ダイアログ + シミュレーションで自走するため、
//    このフックは実位置経路(バックエンド実配線)を有効化する際に使用する。

export type GeoStatus = "idle" | "granted" | "denied" | "unsupported";

export interface GeoState {
  status: GeoStatus;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}

export function useGeolocation(
  enabled: boolean,
  onPosition?: (lat: number, lng: number, accuracy: number) => void
): GeoState {
  const [state, setState] = useState<GeoState>({
    status: "idle",
    lat: null,
    lng: null,
    accuracy: null,
  });
  const cbRef = useRef(onPosition);
  cbRef.current = onPosition;

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState((s) => ({ ...s, status: "unsupported" }));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setState({ status: "granted", lat: latitude, lng: longitude, accuracy });
        cbRef.current?.(latitude, longitude, accuracy);
      },
      (err) => {
        setState((s) => ({
          ...s,
          status: err.code === err.PERMISSION_DENIED ? "denied" : "unsupported",
        }));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  return state;
}
