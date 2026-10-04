import ExcelJS from "exceljs";

/**
 * 分類結果の表（レコード配列）を、Excelでそのまま開けるネイティブ .xlsx として書き出す。
 *
 * CSV(+BOM)でもExcelで開けるが、ネイティブ形式にすることで
 * 「太字ヘッダ／列幅／オートフィルタ／要確認行のハイライト」までこちらで作り込める。
 */

/** 要確認の値を持つ行に付ける背景色（薄い黄色）。 */
const REVIEW_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2CC" },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F2937" },
};

/** 列名から適度な幅を決める（内容の長さに応じた簡易ヒューリスティック）。 */
function columnWidth(header: string, values: string[]): number {
  const maxLen = Math.max(header.length, ...values.map((v) => v.length), 4);
  const width = Math.min(maxLen + 4, 40);
  // exceljs は内部デフォルト幅と厳密一致する 9 を customWidth として書き出さない癖がある
  // （列がExcelの既定幅に戻ってしまう）ため、その値だけ避ける。
  return width === 9 ? 9.5 : width;
}

/**
 * レコード配列から、書式（太字ヘッダ／列幅／オートフィルタ／要確認ハイライト）
 * 付きの ExcelJS ワークブックを組み立てる。ファイルに書くか、ブラウザへ
 * バッファとして返すかは呼び出し側（writeXlsx / buildXlsxBuffer）が選ぶ。
 */
function buildWorkbook(
  rows: Record<string, string>[],
  reviewColumn = "要確認",
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "todoapp";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("分類結果", {
    views: [{ state: "frozen", ySplit: 1 }], // 先頭行を固定
  });

  const header = rows.length > 0 ? Object.keys(rows[0]) : [];
  sheet.columns = header.map((h) => ({
    header: h,
    key: h,
    width: columnWidth(h, rows.map((r) => r[h] ?? "")),
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = HEADER_FILL;
  headerRow.alignment = { vertical: "middle" };

  for (const rec of rows) {
    const row = sheet.addRow(rec);
    if ((rec[reviewColumn] ?? "").trim() !== "") {
      row.eachCell((cell) => (cell.fill = REVIEW_FILL));
    }
  }

  if (header.length > 0 && rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: header.length },
    };
  }

  return workbook;
}

/**
 * レコード配列を .xlsx ファイルとして書き出す（CLI向け）。
 * reviewColumn の値が非空の行は背景色でハイライトする。
 */
export async function writeXlsx(
  rows: Record<string, string>[],
  filePath: string,
  reviewColumn = "要確認",
): Promise<void> {
  await buildWorkbook(rows, reviewColumn).xlsx.writeFile(filePath);
}

/**
 * レコード配列を .xlsx のバイナリバッファとして返す（Web API向け）。
 * サーバーレス関数はファイルシステムに永続化せず、そのままレスポンスで返す。
 */
export async function buildXlsxBuffer(
  rows: Record<string, string>[],
  reviewColumn = "要確認",
): Promise<Buffer> {
  const buffer = await buildWorkbook(rows, reviewColumn).xlsx.writeBuffer();
  return Buffer.from(buffer);
}
