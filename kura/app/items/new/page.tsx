'use client'
// SC-013 商品の登録
import { useRouter } from 'next/navigation'
import { createItem, getMasters, getSession } from '@/lib/repo'
import { useRepo } from '@/lib/repo/react'
import { PageTitle } from '@/components/layout/PageTitle'
import { PermissionGate } from '@/components/demo/PermissionGate'
import { ItemForm } from '@/components/domain/ItemForm'
import { SkeletonBlock } from '@/components/domain/Skeleton'
import { useToast } from '@/components/ui/toast'

export default function NewItemPage() {
  const router = useRouter()
  const toast = useToast()
  const session = useRepo(getSession)
  const masters = useRepo(getMasters)
  return (
    <>
      <PageTitle
        title="商品の登録"
        lead="登録しただけでは在庫は 0 です。在庫は入庫か、CSV の期首棚卸で入れます。"
      />
      <PermissionGate session={session.data} need="master.write" title="商品マスタの登録">
        {!masters.data ? (
          <SkeletonBlock className="h-[640px] w-full rounded" />
        ) : (
          <ItemForm
            mode="new"
            categories={masters.data.categories}
            suppliers={masters.data.suppliers}
            defaultValues={{
              sku: '',
              name: '',
              jan: '',
              categoryId: masters.data.categories[0]?.id ?? '',
              baseUnit: '',
              caseName: 'ケース',
              caseQty: '',
              cost: 0,
              price: 0,
              reorderPoint: 0,
              safetyStock: 0,
              orderLot: 1,
              leadTimeDays: 7,
              defaultSupplierId: '',
              isLotManaged: false,
              shelfLifeDays: '',
              isActive: true,
            }}
            onCancel={() => router.push('/stock')}
            onSubmit={async (v) => {
              const r = await createItem({
                sku: v.sku,
                name: v.name,
                jan: v.jan || undefined,
                categoryId: v.categoryId,
                baseUnit: v.baseUnit,
                packUnits: v.caseName && v.caseQty !== '' ? [{ name: v.caseName, qtyInBase: v.caseQty }] : [],
                cost: v.cost,
                price: v.price,
                reorderPoint: v.reorderPoint,
                safetyStock: v.safetyStock,
                orderLot: v.orderLot,
                leadTimeDays: v.leadTimeDays,
                defaultSupplierId: v.defaultSupplierId || undefined,
                isLotManaged: v.isLotManaged,
                shelfLifeDays: v.shelfLifeDays === '' ? undefined : v.shelfLifeDays,
                storageCondition: 'normal',
                isActive: true,
              })
              if (!r.ok) return r.error
              toast.show({ message: `${r.data.sku} を登録しました` })
              router.push(`/items/${r.data.sku}`)
            }}
          />
        )}
      </PermissionGate>
    </>
  )
}
