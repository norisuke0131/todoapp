// SC-001 ダッシュボード / SC-900 埋め込みモード（?embed=1）
// 埋め込みは検索エンジンに載せない（EMB-08）。振り分けはサーバー側で行う
import type { Metadata } from 'next'
import { DashboardView } from './dashboard-view'
import { EmbedPanel } from '@/components/embed/EmbedPanel'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const embed = (await searchParams).embed === '1'
  return embed
    ? { title: '在庫の水位デモ（埋め込み）', robots: { index: false, follow: false } }
    : { title: 'ダッシュボード' }
}

export default async function Page({ searchParams }: Props) {
  return (await searchParams).embed === '1' ? <EmbedPanel /> : <DashboardView />
}
