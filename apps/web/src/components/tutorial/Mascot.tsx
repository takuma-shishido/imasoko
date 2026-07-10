import charaImg from "@/data/chara.png";
import { TUTORIAL_TEXTS } from "./texts";

// チュートリアルのマスコット「おあい」(正式キャラ画像・背景透過)。
export function Mascot({ size = 48 }: { size?: number }) {
  return (
    <img
      src={charaImg}
      width={size}
      height={size}
      alt={TUTORIAL_TEXTS.mascotName}
      style={{ objectFit: "contain" }}
    />
  );
}
