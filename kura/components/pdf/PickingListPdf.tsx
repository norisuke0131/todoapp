// SC-103 ピッキングリストの PDF：棚番の巡回順、バーコードつき、日本語フォントを埋め込む
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { PickingList } from '@/lib/repo'
import { PdfBarcode } from './Barcode'

const s = StyleSheet.create({
  page: { fontFamily: 'NotoSansJP', fontSize: 9, padding: 28, color: '#10161C' },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 2,
    borderBottomColor: '#10161C',
    paddingBottom: 8,
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: 700 },
  meta: { fontSize: 9, color: '#4E585F', marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#B9C0C5',
    paddingVertical: 6,
    minHeight: 44,
  },
  th: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#10161C',
    paddingBottom: 4,
    fontSize: 8,
    color: '#4E585F',
    fontWeight: 700,
  },
  no: { width: 18, color: '#4E585F' },
  loc: { width: 120 },
  locCode: { fontSize: 15, fontWeight: 700, marginBottom: 2 },
  item: { flex: 1, paddingRight: 8 },
  sku: { fontSize: 8, color: '#4E585F' },
  qty: { width: 54, textAlign: 'right', fontSize: 14, fontWeight: 700 },
  box: { width: 54, marginLeft: 10, height: 24, borderWidth: 1, borderColor: '#10161C' },
  lot: { fontSize: 8, color: '#4E585F', marginTop: 2 },
  foot: {
    position: 'absolute',
    bottom: 18,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#8B959C',
  },
})

export function PickingListPdf({ list, printedAt }: { list: PickingList; printedAt: string }) {
  const o = list.order
  return (
    <Document title={`ピッキングリスト ${o.code}`} author="KURA デモ">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            <Text style={s.title}>ピッキングリスト</Text>
            <Text style={s.meta}>
              {o.code}　{o.customerName}　{o.warehouseName}　出荷期日 {o.shipBy?.slice(0, 10) ?? '—'}
            </Text>
          </View>
          <PdfBarcode value={o.code} width={150} height={30} />
        </View>
        <View style={s.th}>
          <Text style={s.no}>#</Text>
          <Text style={s.loc}>棚番（巡回順）</Text>
          <Text style={s.item}>商品</Text>
          <Text style={{ width: 54, textAlign: 'right' }}>指示数</Text>
          <Text style={{ width: 54, marginLeft: 10 }}>実数</Text>
        </View>
        {list.lines.map((l, i) => (
          <View key={l.itemId} style={s.row} wrap={false}>
            <Text style={s.no}>{i + 1}</Text>
            <View style={s.loc}>
              <Text style={s.locCode}>{l.locationCode ?? '未設定'}</Text>
              {l.locationCode && <PdfBarcode value={l.locationCode} width={100} height={14} />}
            </View>
            <View style={s.item}>
              <Text style={s.sku}>{l.sku}</Text>
              <Text>{l.name}</Text>
              {l.isLotManaged && l.lots.some((x) => x.recommended > 0) && (
                <Text style={s.lot}>
                  期限の近いロットから：
                  {l.lots
                    .filter((x) => x.recommended > 0)
                    .map((x) => `${x.lotNo}（${x.expiryDate ?? '期限なし'}）×${x.recommended}`)
                    .join('、')}
                </Text>
              )}
            </View>
            <Text style={s.qty}>
              {l.qty}
              <Text style={{ fontSize: 8, fontWeight: 400 }}> {l.baseUnit}</Text>
            </Text>
            <View style={s.box} />
          </View>
        ))}
        <View style={s.foot} fixed>
          <Text>KURA 在庫管理デモ — これはデモです。実在の取引ではありません</Text>
          <Text render={({ pageNumber, totalPages }) => `${printedAt}　${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
