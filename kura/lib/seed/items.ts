// 商品マスタ 620 SKU（すべて架空。業種の世界観を持たせる）
// SKU はカテゴリ番号 × 1000 + 連番。SKU-1042 と SKU-2011 は5章のフローで使う固定商品
import type { Item, PackUnit, StorageCondition } from '@/lib/types'
import type { Rng } from './rng'
import { suppliersByCategory, partners } from './partners'

type BaseSpec = { name: string; unit: string; cost: [number, number]; variants: string[] }

type CategorySpec = {
  id: string
  no: number
  count: number
  bases: BaseSpec[]
  packs: PackUnit[][]
  lot?: { shelfLife: [number, number] }
  storage?: StorageCondition
}

const COLORS = ['マット黒', 'ホワイト', 'サンドベージュ', 'ネイビー', 'セージ', 'テラコッタ', 'チャコール']
const sized = (sizes: string[], colors = COLORS) => sizes.flatMap((s) => colors.map((c) => `${s} ${c}`))

const SPECS: CategorySpec[] = [
  {
    id: 'cat-bottle',
    no: 1,
    count: 100,
    bases: [
      {
        name: 'ステンレスボトル',
        unit: '本',
        cost: [1100, 1600],
        variants: sized(['350ml', '500ml', '600ml', '750ml', '1L']),
      },
      {
        name: '真空断熱タンブラー',
        unit: '個',
        cost: [900, 1400],
        variants: sized(['300ml', '420ml', '600ml']),
      },
      {
        name: 'スポーツボトル',
        unit: '本',
        cost: [600, 900],
        variants: sized(['500ml', '750ml', '1L'], ['クリア', 'スモーク', 'ネイビー', 'ライム']),
      },
      {
        name: 'キッズボトル',
        unit: '本',
        cost: [700, 1000],
        variants: sized(['350ml', '450ml', '600ml'], ['ミント', 'さくら', 'そら', 'ひまわり']),
      },
      {
        name: '炭酸対応ボトル',
        unit: '本',
        cost: [1400, 1900],
        variants: sized(['500ml', '750ml', '1L'], ['マット黒', 'ホワイト', 'セージ']),
      },
      { name: 'ステンレスマグ', unit: '個', cost: [700, 1100], variants: sized(['250ml', '350ml']) },
    ],
    packs: [
      [
        { name: 'ケース', qtyInBase: 24 },
        { name: 'ボール', qtyInBase: 6 },
      ],
      [{ name: 'ケース', qtyInBase: 12 }],
    ],
  },
  {
    id: 'cat-parts',
    no: 2,
    count: 70,
    bases: [
      {
        name: '替えキャップ',
        unit: '個',
        cost: [180, 320],
        variants: [
          '黒（500ml用）',
          '白（500ml用）',
          '黒（350ml用）',
          '白（350ml用）',
          'ネイビー（750ml用）',
          'セージ（1L用）',
          'ハンドル付 黒',
          'ハンドル付 白',
          '広口 グレー',
          'ワンタッチ 黒',
          'ワンタッチ 白',
          '炭酸用 黒',
          '炭酸用 白',
        ],
      },
      {
        name: 'シリコンパッキンセット',
        unit: '組',
        cost: [90, 160],
        variants: [
          '350ml用',
          '500ml用',
          '750ml用',
          '1L用',
          'タンブラー用',
          '炭酸ボトル用',
          'キッズ用',
          '共通 3組入',
        ],
      },
      {
        name: 'ストローキャップ',
        unit: '個',
        cost: [240, 380],
        variants: [
          'キッズ用 ミント',
          'キッズ用 さくら',
          'キッズ用 そら',
          '500ml用 黒',
          '500ml用 白',
          '替えストロー 4本入',
          '替えストロー 8本入',
        ],
      },
      {
        name: 'ボトルカバー',
        unit: '枚',
        cost: [300, 520],
        variants: [
          '500ml用 帆布 生成り',
          '500ml用 帆布 墨',
          '750ml用 ネオプレン 黒',
          '1L用 ネオプレン 黒',
          '350ml用 ニット 杢グレー',
          'ショルダー付 カーキ',
        ],
      },
      {
        name: '洗浄ブラシ',
        unit: '本',
        cost: [120, 220],
        variants: ['ロング', 'ショート', 'パッキン用 細', 'ストロー用 3本組', 'スポンジ付', '柄付 天然毛'],
      },
      { name: 'ボトルポーチ', unit: '個', cost: [420, 680], variants: COLORS.map((c) => `帆布 ${c}`) },
      {
        name: 'ショルダーストラップ',
        unit: '本',
        cost: [380, 600],
        variants: ['黒', 'カーキ', 'ネイビー', '杢グレー', '細 黒', '細 生成り'],
      },
      {
        name: '飲み口カバー',
        unit: '個',
        cost: [120, 200],
        variants: ['黒', '白', 'グレー', 'キッズ用 ミント', 'キッズ用 さくら'],
      },
      {
        name: 'タンブラー用フタ',
        unit: '個',
        cost: [260, 420],
        variants: [
          '300ml用',
          '420ml用',
          '600ml用',
          'スライド式 420ml用',
          'ストロー穴付 600ml用',
          '透明 420ml用',
        ],
      },
      {
        name: 'ボトル乾燥スタンド',
        unit: '台',
        cost: [680, 1100],
        variants: ['2本掛け', '4本掛け', '6本掛け', '折りたたみ'],
      },
      {
        name: '替えパッキン 単品',
        unit: '個',
        cost: [60, 110],
        variants: ['フタ用 350ml', 'フタ用 500ml', 'フタ用 750ml', '中栓用', '炭酸ボトル用', 'タンブラー用'],
      },
    ],
    packs: [[{ name: 'ケース', qtyInBase: 50 }], [{ name: 'ボール', qtyInBase: 10 }], []],
  },
  {
    id: 'cat-kitchen',
    no: 3,
    count: 90,
    bases: [
      {
        name: '密閉保存容器',
        unit: '個',
        cost: [320, 680],
        variants: [
          '角型 400ml',
          '角型 800ml',
          '角型 1.4L',
          '丸型 300ml',
          '丸型 700ml',
          '深型 2.2L',
          '浅型 500ml',
          '3個組',
        ],
      },
      {
        name: 'シリコンヘラ',
        unit: '本',
        cost: [260, 420],
        variants: ['S 生成り', 'M 生成り', 'L 生成り', 'S 墨', 'M 墨', 'L 墨', 'ジャム用 細'],
      },
      {
        name: 'ステンレストング',
        unit: '本',
        cost: [380, 560],
        variants: ['18cm', '23cm', '30cm', '盛り付け用 細', 'パスタ用', '先端シリコン 23cm'],
      },
      {
        name: 'ひのきまな板',
        unit: '枚',
        cost: [1200, 2200],
        variants: ['小 24×15cm', '中 36×21cm', '大 42×24cm', '薄型 30×20cm', 'スタンド付 中'],
      },
      {
        name: 'アルミ弁当箱',
        unit: '個',
        cost: [880, 1300],
        variants: ['小判型 550ml', '小判型 750ml', '角型 600ml', '2段 800ml', '深型 900ml', 'ミニ 380ml'],
      },
      {
        name: '耐熱計量カップ',
        unit: '個',
        cost: [220, 360],
        variants: ['200ml', '500ml', '1L', '目盛り刻印 300ml', '注ぎ口付 500ml'],
      },
      {
        name: '木製菜箸',
        unit: '膳',
        cost: [160, 280],
        variants: ['30cm', '33cm', '揚げ物用 36cm', '盛り付け用 先細 24cm', '2膳組'],
      },
      {
        name: '鍋敷き',
        unit: '枚',
        cost: [280, 520],
        variants: [
          'コルク 丸 18cm',
          'コルク 角 20cm',
          '竹 丸 20cm',
          '鋳物 S',
          '鋳物 L',
          'シリコン 折りたたみ',
        ],
      },
      {
        name: '琺瑯バット',
        unit: '個',
        cost: [620, 1100],
        variants: ['手札', 'キャビネ', '六切', '八切', '深型 キャビネ', 'フタ付 手札'],
      },
      {
        name: 'ステンレスボウル',
        unit: '個',
        cost: [380, 820],
        variants: ['16cm', '18cm', '21cm', '24cm', '27cm', '注ぎ口付 21cm'],
      },
      {
        name: '竹ざる',
        unit: '枚',
        cost: [380, 720],
        variants: ['丸 21cm', '丸 27cm', '角 小', '角 大', '盛りざる 18cm'],
      },
      {
        name: '木製しゃもじ',
        unit: '本',
        cost: [180, 320],
        variants: ['21cm', '24cm', '穴あき 24cm', '業務用 36cm'],
      },
      {
        name: '密閉ガラス保存瓶',
        unit: '個',
        cost: [420, 780],
        variants: ['250ml', '500ml', '1L', '1.5L', 'スパイス用 100ml', '広口 750ml'],
      },
      {
        name: 'ランチクロス',
        unit: '枚',
        cost: [220, 380],
        variants: ['綿 生成り', '綿 藍', '綿 墨', 'ガーゼ 白', 'リネン 生成り', 'リネン 墨'],
      },
      { name: 'キッチンタイマー', unit: '個', cost: [680, 1100], variants: ['白', '黒', 'マグネット式'] },
      {
        name: 'スパイスボトル',
        unit: '個',
        cost: [180, 320],
        variants: ['ガラス 100ml', 'ガラス 150ml', 'ステンレス蓋 80ml', '3本組'],
      },
      {
        name: '綿ふきん',
        unit: '枚',
        cost: [140, 260],
        variants: ['白 2枚組', '生成り 2枚組', '藍 1枚', '業務用 10枚', '蚊帳生地 5枚'],
      },
    ],
    packs: [[{ name: 'ケース', qtyInBase: 20 }], [{ name: 'ボール', qtyInBase: 5 }], []],
  },
  {
    id: 'cat-food',
    no: 4,
    count: 70,
    lot: { shelfLife: [90, 300] },
    bases: [
      {
        name: 'デュラム小麦パスタ',
        unit: '袋',
        cost: [160, 240],
        variants: [
          '1.6mm 500g',
          '1.8mm 500g',
          '1.4mm 500g',
          'リングイネ 500g',
          'ペンネ 500g',
          'フジッリ 500g',
          '1.6mm 業務用 3kg',
          'タリアテッレ 250g',
        ],
      },
      {
        name: '完熟トマト缶',
        unit: '缶',
        cost: [110, 170],
        variants: ['ダイス 400g', 'ホール 400g', 'ダイス 2.5kg 業務用', 'パッサータ 690g'],
      },
      {
        name: '国産そば乾麺',
        unit: '袋',
        cost: [220, 320],
        variants: ['200g', '十割 180g', '業務用 1kg', '更科 200g'],
      },
      {
        name: '有機ミックスナッツ',
        unit: '袋',
        cost: [480, 760],
        variants: ['無塩 200g', '無塩 500g', '素焼き 1kg', '小分け 25g×10袋'],
      },
      {
        name: '干し椎茸',
        unit: '袋',
        cost: [380, 620],
        variants: ['スライス 40g', 'どんこ 70g', '業務用 500g'],
      },
      { name: '黒糖かりんとう', unit: '袋', cost: [140, 220], variants: ['150g', '300g', '小袋 10袋入'] },
      {
        name: 'レトルトカレー',
        unit: '箱',
        cost: [180, 280],
        variants: ['中辛 200g', '辛口 200g', '甘口 200g', 'キーマ 180g', '業務用 1kg'],
      },
      {
        name: 'ピザ用強力粉',
        unit: '袋',
        cost: [260, 420],
        variants: ['1kg', '2.5kg', '業務用 10kg', '全粒粉ブレンド 1kg'],
      },
      { name: 'セミドライトマト', unit: '袋', cost: [420, 680], variants: ['オイル漬け 100g', '業務用 1kg'] },
      {
        name: '発酵バター風味クッキー',
        unit: '箱',
        cost: [220, 360],
        variants: ['12枚入', '24枚入', 'アソート 20枚'],
      },
      {
        name: '国産はちみつ',
        unit: '本',
        cost: [780, 1280],
        variants: ['百花 300g', 'アカシア 300g', 'みかん 300g', '業務用 1kg'],
      },
      {
        name: 'オートミール',
        unit: '袋',
        cost: [280, 460],
        variants: ['ロールド 500g', 'クイック 300g', '業務用 1kg'],
      },
      { name: '国産大豆水煮', unit: '袋', cost: [120, 200], variants: ['150g', '300g', '業務用 1kg'] },
      { name: '十六穀米', unit: '袋', cost: [380, 620], variants: ['25g×12袋', '450g', '業務用 1kg'] },
      { name: '玄米フレーク', unit: '袋', cost: [320, 480], variants: ['無糖 220g', 'はちみつ 220g'] },
      { name: 'ドライいちじく', unit: '袋', cost: [420, 680], variants: ['120g', '業務用 1kg'] },
      { name: '長ひじき', unit: '袋', cost: [260, 420], variants: ['30g', '業務用 500g'] },
      { name: '切り干し大根', unit: '袋', cost: [180, 300], variants: ['80g', '業務用 1kg'] },
      {
        name: 'ローストアーモンド',
        unit: '袋',
        cost: [480, 780],
        variants: ['無塩 200g', '有塩 200g', '業務用 1kg'],
      },
      { name: '米粉パンケーキミックス', unit: '袋', cost: [280, 420], variants: ['200g', '業務用 1kg'] },
      { name: '雑穀せんべい', unit: '袋', cost: [180, 280], variants: ['12枚', '24枚', '小袋 8袋'] },
      { name: '国産チーズせんべい', unit: '袋', cost: [220, 340], variants: ['10枚', '20枚'] },
    ],
    packs: [[{ name: 'ケース', qtyInBase: 12 }], [{ name: 'ケース', qtyInBase: 24 }]],
  },
  {
    id: 'cat-drink',
    no: 5,
    count: 60,
    lot: { shelfLife: [150, 360] },
    bases: [
      {
        name: '天然水',
        unit: '本',
        cost: [38, 60],
        variants: ['500ml', 'ラベルレス 500ml', '2L', '1L', '軟水 550ml'],
      },
      {
        name: '緑茶',
        unit: '本',
        cost: [52, 78],
        variants: ['525ml', '2L', '280ml', '濃いめ 525ml', '抹茶入り 500ml'],
      },
      {
        name: '焙じ茶',
        unit: '本',
        cost: [52, 78],
        variants: ['500ml', '2L', '280ml 温冷兼用', 'ラベルレス 500ml'],
      },
      {
        name: '強炭酸水',
        unit: '本',
        cost: [44, 66],
        variants: ['500ml', 'レモン 500ml', 'グレープフルーツ 500ml', '1L', 'ラベルレス 500ml'],
      },
      {
        name: '六条麦茶',
        unit: '本',
        cost: [40, 62],
        variants: ['650ml', '2L', 'ラベルレス 650ml', '水出しパック 52袋'],
      },
      {
        name: '水出しコーヒー',
        unit: '本',
        cost: [90, 140],
        variants: ['無糖 500ml', '微糖 500ml', '無糖 1L', 'カフェオレベース 500ml'],
      },
      {
        name: 'りんごストレート果汁',
        unit: '本',
        cost: [160, 260],
        variants: ['ふじ 1L', '紅玉 1L', 'ブレンド 180ml'],
      },
      { name: '甘酒', unit: '本', cost: [120, 200], variants: ['米麹 125ml', '米麹 500ml', '玄米 500ml'] },
      { name: 'ルイボスティー', unit: '本', cost: [60, 90], variants: ['500ml', '2L', 'ティーバッグ 30袋'] },
      { name: '黒豆茶', unit: '本', cost: [60, 90], variants: ['500ml', '2L', 'ティーバッグ 20袋'] },
      {
        name: 'ジンジャーエール',
        unit: '本',
        cost: [70, 110],
        variants: ['辛口 250ml', '甘口 250ml', '業務用 1L'],
      },
      {
        name: 'スポーツドリンク',
        unit: '本',
        cost: [60, 90],
        variants: ['500ml', '2L', '粉末 1L用×5袋', 'ゼリー 180g'],
      },
      {
        name: '野菜ジュース',
        unit: '本',
        cost: [80, 130],
        variants: ['食塩無添加 200ml', 'トマト 190g', '業務用 1L'],
      },
      { name: 'ゆず果汁サイダー', unit: '本', cost: [110, 170], variants: ['250ml', '500ml'] },
      {
        name: 'ドリップバッグコーヒー',
        unit: '箱',
        cost: [480, 820],
        variants: ['中深煎り 10袋', '深煎り 10袋', 'デカフェ 10袋', '業務用 50袋'],
      },
      {
        name: '無調整豆乳',
        unit: '本',
        cost: [90, 160],
        variants: ['200ml', '1L', '業務用 1L', 'バリスタ用 1L'],
      },
      { name: 'ほうじ茶ラテベース', unit: '本', cost: [380, 560], variants: ['500ml', '業務用 1L'] },
    ],
    packs: [[{ name: 'ケース', qtyInBase: 24 }], [{ name: 'ケース', qtyInBase: 6 }]],
  },
  {
    id: 'cat-season',
    no: 6,
    count: 56,
    lot: { shelfLife: [270, 540] },
    bases: [
      {
        name: '再仕込み醤油',
        unit: '本',
        cost: [380, 620],
        variants: ['300ml', '500ml', '1L', '業務用 1.8L'],
      },
      { name: '麦味噌', unit: '個', cost: [420, 680], variants: ['500g', '1kg', '減塩 500g', '業務用 4kg'] },
      { name: '本みりん', unit: '本', cost: [360, 540], variants: ['500ml', '1L', '業務用 1.8L'] },
      {
        name: 'エキストラバージンオリーブオイル',
        unit: '本',
        cost: [780, 1280],
        variants: ['250ml', '500ml', '業務用 1L', '早摘み 250ml', 'スプレー 200ml'],
      },
      { name: '藻塩', unit: '袋', cost: [240, 380], variants: ['100g', '500g', '業務用 1kg', 'ミル付 80g'] },
      { name: '柚子胡椒', unit: '個', cost: [280, 420], variants: ['青 50g', '赤 50g', '業務用 1kg'] },
      { name: '白だし', unit: '本', cost: [320, 480], variants: ['300ml', '500ml', '業務用 1.8L'] },
      { name: '白ワインビネガー', unit: '本', cost: [420, 680], variants: ['500ml', '業務用 1L'] },
      { name: '乾燥オレガノ', unit: '袋', cost: [240, 380], variants: ['10g', '業務用 100g'] },
      {
        name: '粗挽き黒胡椒',
        unit: '袋',
        cost: [260, 420],
        variants: ['ミル付 35g', '詰替 80g', '業務用 500g'],
      },
      { name: '純米酢', unit: '本', cost: [260, 420], variants: ['500ml', '900ml', '業務用 1.8L'] },
      { name: '太白ごま油', unit: '本', cost: [480, 780], variants: ['200g', '450g', '業務用 1.5kg'] },
      { name: '国産米油', unit: '本', cost: [380, 620], variants: ['600g', '1.5kg', '業務用 16.5kg'] },
      { name: '練りごま', unit: '個', cost: [380, 560], variants: ['白 150g', '黒 150g'] },
      {
        name: '本枯れ鰹節',
        unit: '袋',
        cost: [480, 880],
        variants: ['削り 50g', '花かつお 100g', '業務用 500g'],
      },
      {
        name: '日高昆布',
        unit: '袋',
        cost: [480, 780],
        variants: ['100g', 'だし用 カット 50g', '業務用 1kg'],
      },
      { name: '魚醤', unit: '本', cost: [380, 560], variants: ['150ml', '業務用 1L'] },
      {
        name: '無添加トマトケチャップ',
        unit: '本',
        cost: [260, 420],
        variants: ['300g', '500g', '業務用 1kg'],
      },
      { name: '粒マスタード', unit: '個', cost: [320, 480], variants: ['180g', '業務用 1kg'] },
      { name: 'バジルペースト', unit: '個', cost: [420, 680], variants: ['90g', '業務用 500g'] },
    ],
    packs: [[{ name: 'ケース', qtyInBase: 12 }], [{ name: 'ボール', qtyInBase: 6 }]],
  },
  {
    id: 'cat-daily',
    no: 7,
    count: 94,
    bases: [
      {
        name: '食器用洗剤 詰替',
        unit: '袋',
        cost: [140, 220],
        variants: ['無香料 400ml', '無香料 1L', 'グレープフルーツ 400ml', 'ハーブ 400ml', '業務用 4L'],
      },
      {
        name: 'ニトリル手袋',
        unit: '箱',
        cost: [480, 720],
        variants: ['S 100枚', 'M 100枚', 'L 100枚', 'S 200枚 黒', 'M 200枚 黒', 'L 200枚 黒', 'XL 100枚'],
      },
      {
        name: '厚手キッチンペーパー',
        unit: 'パック',
        cost: [180, 280],
        variants: ['2ロール', '4ロール', '2倍巻 4ロール', '業務用 12ロール', 'ボックス 150組'],
      },
      {
        name: '半透明ゴミ袋',
        unit: 'パック',
        cost: [160, 260],
        variants: [
          '20L 10枚',
          '30L 10枚',
          '45L 10枚',
          '70L 10枚',
          '90L 10枚',
          '45L 50枚 業務用',
          '70L 50枚 業務用',
        ],
      },
      {
        name: '抗菌スポンジ',
        unit: '個',
        cost: [60, 110],
        variants: ['グレー', 'ネイビー', '3個組', '5個組', '研磨面付'],
      },
      {
        name: '業務用ラップ',
        unit: '本',
        cost: [420, 680],
        variants: ['22cm×100m', '30cm×100m', '45cm×100m', '30cm×50m'],
      },
      {
        name: 'アルコール除菌スプレー',
        unit: '本',
        cost: [380, 620],
        variants: ['500ml', '詰替 1L', '業務用 5L', '携帯 60ml'],
      },
      {
        name: 'ペーパーナプキン',
        unit: 'パック',
        cost: [220, 380],
        variants: ['2プライ 100枚 白', '2プライ 100枚 生成り', '業務用 1000枚', '紙おしぼり 100枚'],
      },
      {
        name: 'ハンドソープ 詰替',
        unit: '袋',
        cost: [180, 300],
        variants: ['無香料 450ml', 'ベルガモット 450ml', '業務用 2L'],
      },
      {
        name: '竹割り箸',
        unit: '袋',
        cost: [180, 320],
        variants: ['天削 100膳', '双生 100膳', '個包装 100膳', '業務用 3000膳'],
      },
      {
        name: '再生紙トイレットペーパー',
        unit: 'パック',
        cost: [380, 620],
        variants: ['シングル 12ロール', 'ダブル 12ロール', '芯なし 6ロール', '業務用 48ロール'],
      },
      {
        name: '使い捨てマスク',
        unit: '箱',
        cost: [380, 620],
        variants: ['ふつう 50枚', '小さめ 50枚', '大きめ 50枚', '個包装 30枚'],
      },
      {
        name: 'マイクロファイバークロス',
        unit: '枚',
        cost: [120, 220],
        variants: ['30cm 青', '30cm 黄', '30cm 緑', '5枚組'],
      },
      {
        name: '酸素系漂白剤',
        unit: '袋',
        cost: [320, 520],
        variants: ['粉末 500g', '粉末 1kg', '業務用 4kg'],
      },
      {
        name: 'ノンアルコールウェットティッシュ',
        unit: 'パック',
        cost: [160, 280],
        variants: ['80枚', '3個組', '個包装 50枚', '業務用 詰替 250枚'],
      },
      { name: '紙軸綿棒', unit: '箱', cost: [120, 200], variants: ['200本', '個包装 100本'] },
      {
        name: 'ポリ規格袋',
        unit: '袋',
        cost: [140, 280],
        variants: ['8号 100枚', '10号 100枚', '12号 100枚', '13号 100枚', '15号 100枚', '厚手 13号 50枚'],
      },
      {
        name: 'アルミホイル',
        unit: '本',
        cost: [160, 380],
        variants: ['25cm×8m', '25cm×25m', '30cm×50m', '業務用 45cm×50m'],
      },
      {
        name: 'クッキングシート',
        unit: '本',
        cost: [220, 420],
        variants: ['30cm×5m', '30cm×20m', '業務用 33cm×50m'],
      },
      {
        name: '紙コップ',
        unit: 'パック',
        cost: [180, 320],
        variants: ['205ml 50個', '275ml 50個', '断熱 260ml 25個', '業務用 205ml 1000個'],
      },
      {
        name: '食品用ポリ手袋',
        unit: '箱',
        cost: [180, 320],
        variants: ['M 100枚', 'L 100枚', '業務用 M 1000枚'],
      },
      {
        name: '消臭ビーズ',
        unit: '個',
        cost: [280, 420],
        variants: ['無香料 400g', 'せっけん 400g', '詰替 1kg'],
      },
      {
        name: '紙ストロー',
        unit: '袋',
        cost: [180, 320],
        variants: ['6mm 100本', '個包装 100本', '太口 12mm 50本'],
      },
    ],
    packs: [
      [
        { name: 'ケース', qtyInBase: 30 },
        { name: 'ボール', qtyInBase: 10 },
      ],
      [{ name: 'ケース', qtyInBase: 20 }],
    ],
  },
  {
    id: 'cat-pack',
    no: 8,
    count: 80,
    bases: [
      {
        name: '段ボール箱',
        unit: '枚',
        cost: [55, 140],
        variants: ['60サイズ', '80サイズ', '100サイズ', '120サイズ', '140サイズ', 'A4 薄型', '宅配 60 白'],
      },
      {
        name: 'エアクッション',
        unit: '巻',
        cost: [900, 1600],
        variants: ['幅300mm×42m', '幅600mm×42m', '幅1200mm×42m', '三層 幅600mm', '袋タイプ 100枚'],
      },
      {
        name: 'OPPテープ',
        unit: '巻',
        cost: [70, 120],
        variants: ['透明 幅48mm', '透明 幅24mm', '茶 幅48mm', '静音 幅48mm', '印刷「取扱注意」'],
      },
      {
        name: '角2封筒 クラフト',
        unit: '束',
        cost: [380, 620],
        variants: ['100枚', '50枚', 'テープ付 100枚', '厚手 100枚', '白 100枚'],
      },
      {
        name: '宅配ビニール袋',
        unit: '束',
        cost: [420, 700],
        variants: ['A4 100枚', 'B4 100枚', 'A3 100枚', '乳白 A4 100枚', '厚手 B4 50枚'],
      },
      {
        name: 'ストレッチフィルム',
        unit: '巻',
        cost: [780, 1200],
        variants: ['幅500mm 15μ', '幅500mm 20μ', 'ハンディ 幅300mm', '黒 幅500mm'],
      },
      {
        name: '紙製ピザボックス',
        unit: '枚',
        cost: [55, 110],
        variants: ['8インチ 無地', '10インチ 無地', '12インチ 無地', '8インチ 窓付'],
      },
      {
        name: 'テイクアウト紙袋',
        unit: '束',
        cost: [380, 640],
        variants: ['S 100枚', 'M 100枚', 'L 50枚', '手提げ M 50枚'],
      },
      {
        name: '結束バンド',
        unit: '袋',
        cost: [180, 320],
        variants: ['150mm 100本', '200mm 100本', '300mm 100本', '耐候 黒 200mm'],
      },
      {
        name: 'クラフト緩衝紙',
        unit: '巻',
        cost: [680, 1200],
        variants: ['幅500mm×100m', '幅380mm×200m', 'シート 500枚'],
      },
      { name: '保冷バッグ', unit: '枚', cost: [120, 260], variants: ['S', 'M', 'L', 'マチ付 L'] },
      { name: '保冷剤', unit: '個', cost: [30, 70], variants: ['50g', '100g', '300g', 'ソフト 200g'] },
      { name: '発泡スチロール箱', unit: '個', cost: [180, 420], variants: ['6L', '15L', '25L', '45L'] },
      {
        name: 'ギフトボックス',
        unit: '個',
        cost: [120, 280],
        variants: ['ボトル1本用', 'ボトル2本用', '小 白', '中 白'],
      },
      {
        name: 'ラッピングリボン',
        unit: '巻',
        cost: [220, 420],
        variants: ['サテン 生成り', 'サテン 墨', '麻ひも'],
      },
      {
        name: '宛名ラベル',
        unit: '箱',
        cost: [480, 880],
        variants: ['A4 12面 100枚', 'A4 24面 100枚', 'ロール 1000枚'],
      },
      {
        name: '段ボール仕切り',
        unit: '束',
        cost: [380, 620],
        variants: ['ボトル6本用', 'ボトル12本用', '瓶 24本用'],
      },
      {
        name: '布ガムテープ',
        unit: '巻',
        cost: [180, 320],
        variants: ['茶 50mm', '白 50mm', '養生用 緑 50mm'],
      },
      { name: 'PPバンド', unit: '巻', cost: [780, 1200], variants: ['白 15mm', '黒 15mm', '手締め用 12mm'] },
      {
        name: 'OPPクリア袋',
        unit: '袋',
        cost: [140, 260],
        variants: [
          'A4 テープ付 100枚',
          'B5 100枚',
          'ボトル用 細長 100枚',
          '平袋 小 100枚',
          'ギフト用 マチ付 50枚',
        ],
      },
    ],
    packs: [[{ name: '束', qtyInBase: 20 }], [{ name: 'ケース', qtyInBase: 50 }], []],
  },
]

/** シミュレーション用の需要プロファイル（Item には持たせない） */
export type ItemProfile = { dailyRate: number }

/** 店内用 JAN（先頭 20 は社内コード用の領域）。チェックデジット付き */
function janFor(n: number): string {
  const body = `20${String(n).padStart(10, '0')}`
  const sum = body.split('').reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return body + String((10 - (sum % 10)) % 10)
}

const roundCost = (v: number) => (v >= 500 ? Math.round(v / 10) * 10 : Math.round(v))

export function buildItems(rng: Rng): { items: Item[]; profiles: Map<string, ItemProfile> } {
  const items: Item[] = []
  const profiles = new Map<string, ItemProfile>()

  for (const spec of SPECS) {
    const forced: Record<string, string> = { 'SKU-1042': '500ml マット黒', 'SKU-2011': '黒（500ml用）' }
    const forcedNames = new Set(Object.values(forced).map((v) => `${spec.bases[0]?.name} ${v}`))
    const combos = rng
      .shuffle(spec.bases.flatMap((b) => b.variants.map((v) => ({ b, v }))))
      .filter((c) => !forcedNames.has(`${c.b.name} ${c.v}`))
    if (combos.length < spec.count) throw new Error(`${spec.id}: 商品名の組み合わせが足りません`)
    let cursor = 0
    for (let n = 0; n < spec.count; n++) {
      const sku = `SKU-${spec.no * 1000 + n}`
      const fixed = forced[sku]
      // 5章のフローで使う固定商品
      const combo = fixed ? { b: spec.bases[0]!, v: fixed } : combos[cursor++]
      if (!combo) throw new Error('combo')

      const cost = roundCost(combo.b.cost[0] + rng.next() * (combo.b.cost[1] - combo.b.cost[0]))
      const packs = rng.pick(spec.packs)
      // 需要は品目ごとに大きくばらつかせる（ABC分析に意味のある偏りを出す）
      const dailyRate = Math.round(Math.exp(rng.next() * 3.4 - 1.2) * 10) / 10
      const leadTimeDays = rng.int(3, 14)
      const caseQty = packs[0]?.qtyInBase ?? 10
      const safetyStock = Math.max(2, Math.ceil(dailyRate * 3))
      const reorderPoint = Math.max(safetyStock + 2, Math.ceil(dailyRate * leadTimeDays) + safetyStock)
      const orderLot = Math.max(caseQty, Math.ceil((dailyRate * 14) / caseQty) * caseQty)
      const supplierId = rng.pick(suppliersByCategory[spec.id] ?? ['sup-01'])
      const supplierLt = partners.find((p) => p.id === supplierId)?.leadTimeDays

      const item: Item = {
        id: `item-${sku.slice(4)}`,
        sku,
        name: `${combo.b.name} ${combo.v}`,
        jan: janFor(spec.no * 100000 + n),
        categoryId: spec.id,
        baseUnit: combo.b.unit,
        packUnits: packs,
        cost,
        price: roundCost(cost * (1.6 + rng.next() * 0.6)),
        reorderPoint,
        safetyStock,
        orderLot,
        defaultSupplierId: supplierId,
        leadTimeDays: supplierLt ?? leadTimeDays,
        isLotManaged: Boolean(spec.lot),
        isSerialManaged: false,
        shelfLifeDays: spec.lot ? rng.int(spec.lot.shelfLife[0], spec.lot.shelfLife[1]) : undefined,
        storageCondition: spec.storage ?? 'normal',
        isActive: true,
      }

      // フロー A/C の数字（実在庫120・引当30・入荷予定60・発注点60）を再現できるよう固定
      if (sku === 'SKU-1042') {
        Object.assign(item, {
          cost: 1300,
          price: 2480,
          reorderPoint: 60,
          safetyStock: 40,
          orderLot: 70,
          leadTimeDays: 10,
        })
        profiles.set(item.id, { dailyRate: 4 })
      } else if (sku === 'SKU-2011') {
        Object.assign(item, { reorderPoint: 50, safetyStock: 20, orderLot: 44 })
        profiles.set(item.id, { dailyRate: 3 })
      } else {
        profiles.set(item.id, { dailyRate })
      }
      items.push(item)
    }
  }
  return { items, profiles }
}
