import charaImg from "@/data/chara.png";

// チュートリアルのマスコット(正式キャラ画像・背景透過)。
export function Mascot({ size = 48 }: { size?: number }) {
  return (
    <img
      src={charaImg}
      width={size}
      height={size}
      alt="マスコット"
      style={{ objectFit: "contain" }}
    />
  );
}
