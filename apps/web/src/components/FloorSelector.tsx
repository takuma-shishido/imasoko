import type { ChangeEvent } from "react";

// 建物(任意)+ 階の手動選択(design/03・design/05)。参加フォームとメンバー一覧で再利用。
interface Opt {
  id: string;
  name: string;
}
interface Props {
  buildingValue: string;
  onBuilding: (e: ChangeEvent<HTMLSelectElement>) => void;
  buildingOpts: Opt[];
  floorValue: string;
  onFloor: (e: ChangeEvent<HTMLSelectElement>) => void;
  floorOpts: Opt[];
  height?: number;
  fontSize?: number;
  buildingPlaceholder?: string;
  floorPlaceholder?: string;
}

export function FloorSelector({
  buildingValue,
  onBuilding,
  buildingOpts,
  floorValue,
  onFloor,
  floorOpts,
  height = 40,
  fontSize = 13,
  buildingPlaceholder = "屋外・未設定",
  floorPlaceholder = "階を選択",
}: Props) {
  const base = {
    height,
    border: "1px solid #ebebeb",
    borderRadius: 6,
    background: "#fff",
    fontFamily: "inherit",
    fontSize,
    color: "#171717",
    padding: "0 8px",
    minWidth: 0,
  } as const;
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select value={buildingValue} onChange={onBuilding} style={{ ...base, flex: 1.4 }}>
        <option value="">{buildingPlaceholder}</option>
        {buildingOpts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <select value={floorValue} onChange={onFloor} style={{ ...base, flex: 1 }}>
        <option value="">{floorPlaceholder}</option>
        {floorOpts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
