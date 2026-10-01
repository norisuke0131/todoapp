import type { ReasonCode } from '@/lib/types'

// adjust：在庫調整の理由（FR-314）／ variance：棚卸差異の原因（FR-406）
export const reasonCodes: ReasonCode[] = [
  { id: 'adj-damage', kind: 'adjust', name: '破損', sortOrder: 1 },
  { id: 'adj-lost', kind: 'adjust', name: '紛失', sortOrder: 2 },
  { id: 'adj-expired', kind: 'adjust', name: '期限切れ廃棄', sortOrder: 3 },
  { id: 'adj-correction', kind: 'adjust', name: '誤記訂正', sortOrder: 4 },
  { id: 'adj-other', kind: 'adjust', name: 'その他', sortOrder: 5 },
  { id: 'var-unrecorded', kind: 'variance', name: '記録漏れ', sortOrder: 1 },
  { id: 'var-damage', kind: 'variance', name: '破損', sortOrder: 2 },
  { id: 'var-lost', kind: 'variance', name: '紛失', sortOrder: 3 },
  { id: 'var-misship', kind: 'variance', name: '誤出荷', sortOrder: 4 },
  { id: 'var-misplace', kind: 'variance', name: '棚違い', sortOrder: 5 },
  { id: 'var-unknown', kind: 'variance', name: '不明', sortOrder: 6 },
]
