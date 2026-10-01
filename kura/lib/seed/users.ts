import type { User } from '@/lib/types'

export const users: User[] = [
  { id: 'u-staff-1', name: '高瀬 湊', role: 'staff', warehouseIds: ['wh-tokyo'], isActive: true },
  { id: 'u-staff-2', name: '真壁 ひより', role: 'staff', warehouseIds: ['wh-tokyo'], isActive: true },
  { id: 'u-staff-3', name: '久住 岳', role: 'staff', warehouseIds: ['wh-osaka'], isActive: true },
  {
    id: 'u-keeper-1',
    name: '日向 千景',
    role: 'keeper',
    warehouseIds: ['wh-tokyo', 'wh-osaka'],
    isActive: true,
  },
  {
    id: 'u-keeper-2',
    name: '芦田 蒼',
    role: 'keeper',
    warehouseIds: ['wh-tokyo', 'wh-osaka'],
    isActive: true,
  },
  { id: 'u-admin-1', name: '若林 紬', role: 'admin', warehouseIds: ['wh-tokyo', 'wh-osaka'], isActive: true },
]
