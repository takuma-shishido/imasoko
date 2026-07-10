import type { RoomVals } from "@/state/RoomEngine";
import { TUTORIAL_TEXTS } from "./texts";

// チュートリアルの1ステップ。実UIのボタンを実際に押してもらいながら進む。
// anchor: ハイライトする実UI(data-tutorial 属性の値)。無ければ吹き出しのみ。
// done:   実操作の完了判定(RoomContext の状態で検知)。無ければ吹き出し内の「次へ」で進む。
// 文言は texts.ts(TUTORIAL_TEXTS)で一元管理し、ここは進行ロジックだけを持つ。
export interface TutorialStep {
  speech: string;
  anchor?: string;
  done?: (v: RoomVals) => boolean;
}

// ルーム作成 → 参加 → 地図 → 共有 → 集合場所 → まとめ の流れ。
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    speech: TUTORIAL_TEXTS.steps.createRoom,
    anchor: "create-room",
    done: (v) => v.isJoin || v.isMap,
  },
  {
    speech: TUTORIAL_TEXTS.steps.join,
    anchor: "join-submit",
    done: (v) => v.isMap,
  },
  {
    speech: TUTORIAL_TEXTS.steps.map,
  },
  {
    speech: TUTORIAL_TEXTS.steps.share,
    anchor: "share-btn",
    done: (v) => v.shShare,
  },
  {
    speech: TUTORIAL_TEXTS.steps.meeting,
    anchor: "meeting-btn",
    done: (v) => v.shMeeting,
  },
  {
    speech: TUTORIAL_TEXTS.steps.finish,
  },
];
