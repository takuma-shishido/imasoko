import type { RoomVals } from "@/state/RoomEngine";

// チュートリアルの1ステップ。実UIのボタンを実際に押してもらいながら進む。
// anchor: ハイライトする実UI(data-tutorial 属性の値)。無ければ吹き出しのみ。
// done:   実操作の完了判定(RoomContext の状態で検知)。無ければ吹き出し内の「次へ」で進む。
export interface TutorialStep {
  speech: string;
  anchor?: string;
  done?: (v: RoomVals) => boolean;
}

// ルーム作成 → 参加 → 地図 → 共有 → 集合場所 → まとめ の流れ。
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    speech: "こんにちは!実際に使いながら「いまそこ」を案内するね。まずは「ルームを作る」をタップ!",
    anchor: "create-room",
    done: (v) => v.isJoin || v.isMap,
  },
  {
    speech:
      "ルームができたよ。名前を入れて「参加する」をタップ!位置情報を許可すると、自分のピンが地図に出るよ。",
    anchor: "join-submit",
    done: (v) => v.isMap,
  },
  {
    speech: "ここがルームの地図。参加したみんなの現在地が、リアルタイムでこの地図に表示されるよ。",
  },
  {
    speech:
      "「共有」をタップしてみて!ルームのリンクを友だちに送れば、URLを開くだけで参加できるよ。",
    anchor: "share-btn",
    done: (v) => v.shShare,
  },
  {
    speech: "次は「集合場所」をタップ!待ち合わせ地点を決めると、全員の地図にピンが立つよ。",
    anchor: "meeting-btn",
    done: (v) => v.shMeeting,
  },
  {
    speech: "これで基本はばっちり!ルームは時間が来たら自動で消えるから、後片付けも要らないよ。",
  },
];
