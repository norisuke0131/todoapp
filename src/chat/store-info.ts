/**
 * お客様向けチャットが回答に使う店舗情報。
 *
 * ここが回答内容の唯一の出典（情報源）。空文字の項目は「未設定」とみなし、
 * チャットは推測せず「店舗へ直接ご確認ください」と案内する（誤情報を出さないため）。
 * 実際の値は店舗側で確認のうえ、このファイルを書き換えてください。
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
}

export const STORE: StoreInfo = {
  name: "base（ベース）",
  facility: "庭園の郷 道の駅保内",
  hours: "",
  closedDays: "",
  address: "",
  access: "",
  parking: "",
  phone: "",
  reservation: "",
  takeout: "",
  payment: "",
  menuNote: "パスタとピザを中心にご用意しています。季節ごとにメニューが変わることがあります。",
  allergyNote:
    "アレルギーをお持ちの方は、ご来店前に必ず店舗へお電話ください。原材料の詳細は店舗スタッフがご案内します。",
  privateDining: "",
};
