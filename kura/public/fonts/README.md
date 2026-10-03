# PDF 用の日本語フォント

発注書・ピッキングリストの PDF（@react-pdf/renderer）に埋め込むためのフォントです。

- 元のフォント：Noto Sans JP（Regular 400 / Bold 700）。SIL Open Font License 1.1（`OFL-NotoSansJP.txt`）
- 取得元：npm パッケージ `@expo-google-fonts/noto-sans-jp@0.4.3` に含まれる TTF
- 加工：`pyftsubset` で、JIS X 0208 の1〜15区（記号・英数字・かな）と第1水準の漢字、ASCII・全角英数・半角カナ、
  初期データ（lib/seed）に出てくる文字、飲食・物流でよく使う第2水準の一部に絞ったもの（各 約1MB）
- 収録していない漢字は PDF では表示されません（画面表示は通常のフォントなので影響しません）
