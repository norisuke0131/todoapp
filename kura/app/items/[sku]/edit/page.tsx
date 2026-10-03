'use client'
// SC-013 商品の編集
import { useParams, useRouter } from 'next/navigation'
import { getItem, getItemMetrics, getMasters, getSession, updateItem } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { PageTitle } from '@/components/layout/PageTitle'
import { PermissionGate } from '@/components/demo/PermissionGate'
import { ItemForm } from '@/components/domain/ItemForm'
import { SkeletonBlock } from '@/components/domain/Skeleton'
import { useToast } from '@/components/ui/toast'

export default function EditItemPage() {
  const { sku } = useParams<{ sku: string }>()
  const router = useRouter()
  const toast = useToast()
  const session = useRepo(getSession)
  const item = useRepo(() => getItem(sku), [sku])
  const masters = useRepo(getMasters)
  const metrics = useRepo(() => getItemMetrics(sku), [sku])
  const i = item.data
  return (
    <>
      <PageTitle title="商品の編集" lead={i ? `${i.sku} ${i.name}` : ' '} />
      <PermissionGate session={session.data} need="master.write" title="商品マスタの編集">
        {!i || !masters.data ? (
          <SkeletonBlock className="h-[640px] w-full rounded" />
        ) : (
          <ItemForm
            mode="edit"
            categories={masters.data.categories}
            suppliers={masters.data.suppliers}
            hint={
              metrics.data
                ? `直近${metrics.data.periodDays}日の出庫から計算した推奨の発注点は ${metrics.data.suggestedReorderPoint} です（リードタイム × 平均出庫 ＋ 安全在庫）。`
                : undefined
            }
            defaultValues={{
              sku: i.sku,
              name: i.name,
              jan: i.jan ?? '',
              categoryId: i.categoryId,
              baseUnit: i.baseUnit,
              caseName: i.packUnits[0]?.name ?? '',
              caseQty: i.packUnits[0]?.qtyInBase ?? '',
              cost: i.cost ?? 0,
              price: i.price,
              reorderPoint: i.reorderPoint,
              safetyStock: i.safetyStock,
              orderLot: i.orderLot,
              leadTimeDays: i.leadTimeDays,
              defaultSupplierId: i.defaultSupplierId ?? '',
              isLotManaged: i.isLotManaged,
              shelfLifeDays: i.shelfLifeDays ?? '',
              isActive: i.isActive,
            }}
            onCancel={() => router.push(`/items/${sku}`)}
            onSubmit={async (v) => {
              const packUnits =
                v.caseName && v.caseQty !== ''
                  ? [{ name: v.caseName, qtyInBase: v.caseQty }, ...i.packUnits.slice(1)]
                  : i.packUnits.slice(1)
              const r = await updateItem(sku, {
                name: v.name,
                jan: v.jan || undefined,
                categoryId: v.categoryId,
                price: v.price,
                reorderPoint: v.reorderPoint,
                safetyStock: v.safetyStock,
                orderLot: v.orderLot,
                leadTimeDays: v.leadTimeDays,
                defaultSupplierId: v.defaultSupplierId || undefined,
                isActive: v.isActive,
                packUnits,
              })
              if (!r.ok) return r.error
              toast.show({ message: `${sku} を保存しました` })
              router.push(`/items/${sku}`)
            }}
          />
        )}
      </PermissionGate>
    </>
  )
}
