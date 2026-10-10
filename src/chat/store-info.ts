/**
 * お客様向けチャットが回答に使う店舗情報。
 *
 * ここが回答内容の唯一の出典（情報源）。空文字の項目は「未設定」とみなし、
 * チャットは推測せず「店舗へ直接ご確認ください」と案内する（誤情報を出さないため）。
 * 各値の出典と、未確定の項目は docs/qa-source.md を参照。
 */
export interface StoreInfo {
  name: string;
  /** 所在施設の名称（道の駅内の店舗であることを明示する）。 */
  facility: string;
  hours: string;
  closedDays: string;
  address: string;
  access: string;
  parking: string;
  phone: string;
  reservation: string;
  takeout: string;
  payment: string;
  menuNote: string;
  allergyNote: string;
  privateDining: string;
  pets: string;
  seating: string;
}

export const STORE: StoreInfo = {
  name: "base",
  facility: "庭園の郷 道の駅保内",
  hours: "11:00〜16:00\n土曜日は夜も営業しています：11:00〜20:00（ラストオーダー 19:30）",
  // 未確定：定休日の有無（docs/qa-source.md 参照）
  closedDays: "",
  address: "新潟県三条市下保内4035 道の駅 庭園の郷 保内 ガーデン内",
  access: "",
  parking: "道の駅の大型駐車場をご利用いただけます。",
  phone: "0256-46-8277",
  // 未確定：予約の受付方法。電話での問い合わせに誘導する。
  reservation: "ご予約・空席状況はお電話（0256-46-8277）でお問い合わせください。",
  takeout:
    "ピザはお持ち帰りいただけます（「保内野菜と熟成生ハムのサラダピッツァ」を除く）。お急ぎの場合はお電話でご注文ください。",
  // 未確定：対応している決済手段
  payment: "",
  menuNote: [
    "パスタとピザを中心にご用意しています（価格は税込）。",
    "・ピッツァ（直径約25cm・もちもちのナポリタイプ）¥1,650〜",
    "・パスタ ¥1,480〜",
    "・平日限定ランチセット ¥1,680／¥1,980／¥2,280（平日 11:00〜16:00）",
    "スマートミール★★★の認証店です。季節によりメニューが変わることがあります。",
  ].join("\n"),
  allergyNote:
    "アレルギーをお持ちの方は、ご来店前に必ず店舗へお電話ください（0256-46-8277）。原材料の詳細は店舗スタッフがご案内します。",
  // 貸切は内容によって対応が変わるため、既定文言で店舗へ誘導する。
  privateDining: "",
  pets: "ワンちゃんとご一緒にご来店いただけます。ワンちゃん用のおやつもご用意しています。",
  seating: "テーブル席と畳席がございます。",
};
