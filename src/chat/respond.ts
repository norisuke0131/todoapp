import { STORE } from "./store-info";

/**
 * お客様からの問い合わせに返信する（ルールベースの応答）。
 *
 * 生成AIに自由に答えさせず、店舗情報（store-info.ts）にあることだけを返す。
 * 該当しない・確認が要る内容（アレルギー・苦情・貸切など）は、
 * 推測せず店舗スタッフへの引き継ぎ（handoff）に回す。
 */
export interface ChatReply {
  text: string;
  /** 店舗スタッフへの引き継ぎが必要か（画面側で電話案内などを出す）。 */
  handoff: boolean;
  /** 次に聞かれそうな話題（クイック返信ボタン用）。 */
  suggestions: string[];
}

const DEFAULT_SUGGESTIONS = ["営業時間", "予約", "アクセス", "メニュー"];

const CONFIRM_AT_STORE = "こちらの情報は現在確認中です。お手数ですが店舗へ直接お問い合わせください。";

/** 店舗情報の項目を返す。未設定なら店舗確認の案内に置き換える。 */
function fact(value: string, lead: string): string {
  return value ? `${lead}${value}` : CONFIRM_AT_STORE;
}

interface Rule {
  id: string;
  match: RegExp;
  reply: () => string;
  handoff?: boolean;
  suggestions?: string[];
}

/** 判定順が重要。苦情・アレルギーなど安全に関わるものを先に判定する。 */
const RULES: Rule[] = [
  {
    id: "complaint",
    match: /クレーム|苦情|最悪|ひどい|困っ|対応が悪|不快|許せ|返金/,
    reply: () =>
      "ご不快な思いをおかけして申し訳ございません。詳しい内容は、店舗へ直接お伝えください。",
    handoff: true,
    suggestions: ["店舗へ電話したい"],
  },
  {
    id: "allergy",
    match: /アレルギー|アレルゲン|グルテン|卵|乳製品|ナッツ|エビ|カニ|そば|小麦|ヴィーガン|ベジタリアン|宗教|ハラール/,
    reply: () => STORE.allergyNote,
    handoff: true,
    suggestions: ["営業時間", "メニュー"],
  },
  {
    id: "private",
    match: /貸切|貸し切り|貸切り|パーティー|宴会|団体|イベント/,
    reply: () =>
      STORE.privateDining ||
      "貸切や団体のご利用は内容によって対応が異なります。店舗スタッフが詳しくご案内しますので、お問い合わせください。",
    handoff: true,
    suggestions: ["予約", "営業時間"],
  },
  {
    id: "hours",
    match: /営業時間|何時|何時まで|開店|閉店|ラストオーダー|ラスト|L\.O/,
    reply: () => fact(STORE.hours, "営業時間は次のとおりです。\n"),
    suggestions: ["定休日", "予約", "アクセス"],
  },
  {
    id: "closed",
    match: /定休|休み|休業|お休み|休日/,
    reply: () => fact(STORE.closedDays, "定休日は次のとおりです。\n"),
    suggestions: ["営業時間", "予約"],
  },
  {
    id: "reservation",
    match: /予約|席|空き|満席|何名|人数/,
    reply: () => fact(STORE.reservation, "ご予約について：\n"),
    suggestions: ["営業時間", "アクセス"],
  },
  {
    id: "access",
    match: /住所|場所|どこ|アクセス|行き方|駐車|車で|バス|道の駅/,
    reply: () =>
      [
        STORE.address && `住所：${STORE.address}`,
        STORE.access && `アクセス：${STORE.access}`,
        STORE.parking && `駐車場：${STORE.parking}`,
      ]
        .filter(Boolean)
        .join("\n") || `当店は${STORE.facility}の店舗です。${CONFIRM_AT_STORE}`,
    suggestions: ["営業時間", "予約"],
  },
  {
    id: "phone",
    match: /電話|番号|tel|連絡先|連絡/i,
    reply: () =>
      STORE.phone
        ? `お電話でのお問い合わせは ${STORE.phone} までお願いいたします。`
        : CONFIRM_AT_STORE,
    handoff: true,
    suggestions: ["営業時間", "予約"],
  },
  {
    id: "takeout",
    match: /テイクアウト|持ち帰り|持ち帰|デリバリー|出前/,
    reply: () => fact(STORE.takeout, "テイクアウトについて：\n"),
    suggestions: ["営業時間", "メニュー"],
  },
  {
    id: "payment",
    match: /支払|決済|カード|PayPay|paypay|現金|クレジット|電子マネー|QR/i,
    reply: () => fact(STORE.payment, "お支払い方法：\n"),
    suggestions: ["営業時間", "メニュー"],
  },
  {
    id: "menu",
    match: /メニュー|パスタ|ピザ|ピッツァ|値段|価格|料金|いくら|ランチ|コース|ドリンク|おすすめ/,
    reply: () => STORE.menuNote,
    suggestions: ["営業時間", "予約", "テイクアウト"],
  },
  {
    id: "human",
    match: /担当者|人と話|スタッフ|店長|責任者|直接/,
    reply: () =>
      STORE.phone
        ? `担当者への直接のご相談は、お電話（${STORE.phone}）またはご来店時にお申し付けください。`
        : `担当者への直接のご相談は、ご来店時に店舗スタッフへお申し付けください。`,
    handoff: true,
    suggestions: ["営業時間", "予約"],
  },
  {
    id: "greeting",
    match: /こんにちは|こんばんは|はじめまして|もしもし|ありがとう|よろしく/,
    reply: () =>
      `${STORE.name}へようこそ。営業時間・ご予約・アクセス・メニューなど、お気軽にご質問ください。`,
  },
];

const FALLBACK = {
  text: `ご質問の内容を理解できませんでした。「営業時間」「予約」「アクセス」「メニュー」などのキーワードでお尋ねいただくか、店舗へ直接お問い合わせください。`,
  handoff: true,
  suggestions: DEFAULT_SUGGESTIONS,
};

/** 全角英数・記号を半角に寄せ、前後の空白を除く（判定の表記ゆれ対策）。 */
export function normalize(message: string): string {
  return message.normalize("NFKC").trim();
}

export function replyTo(rawMessage: string): ChatReply {
  const message = normalize(rawMessage);
  if (!message) {
    return {
      text: "ご質問をご入力ください。",
      handoff: false,
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  for (const rule of RULES) {
    if (rule.match.test(message)) {
      return {
        text: rule.reply(),
        handoff: rule.handoff ?? false,
        suggestions: rule.suggestions ?? DEFAULT_SUGGESTIONS,
      };
    }
  }
  return { ...FALLBACK };
}
