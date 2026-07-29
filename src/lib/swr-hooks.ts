/**
 * SWR Hooks — Client-side data caching & smart revalidation
 * 
 * ใช้ SWR (stale-while-revalidate) เพื่อ:
 * - Cache ข้อมูลที่ฝั่ง client → แสดงผลทันทีเมื่อ navigate กลับมา  
 * - Revalidate อัตโนมัติเมื่อ window focus / network reconnect
 * - Deduplicate requests — หลาย component ใช้ key เดียวกันจะ share request
 * - Background refresh ด้วย refreshInterval
 */
import useSWR, { type SWRConfiguration } from 'swr'
import { apiFetch } from '@/lib/apiFetch'

// ─── Fetcher ────────────────────────────────────────────────
// SWR fetcher ที่ใช้ apiFetch (มี auto-attach shopToken)
export async function swrFetcher<T>(url: string): Promise<T> {
  const res = await apiFetch(url)
  if (!res.ok) {
    const error = new Error('Fetch error') as Error & { status: number }
    error.status = res.status
    throw error
  }
  return res.json()
}

// ─── Types ──────────────────────────────────────────────────
export interface Product {
  id: string
  name: string
  price: number
  image: string | null
  categoryId: string
  description: string | null
  commands: string[]
  stock?: number | null
  requiresInput?: boolean
  requireInput?: boolean
  inputLabel?: string | null
  inputPlaceholder?: string | null
  isActive?: boolean
  category?: {
    id: string
    name: string
  }
  // === ฟิลด์โปรโมชันเพิ่มเติม ===
  saleActive?: boolean
  discountType?: string | null
  discountValue?: number | null
  saleStart?: string | null
  saleEnd?: string | null
}

export interface Category {
  id: string
  name: string
  slug?: string
  image?: string | null
  icon?: string | null
}

export interface CartItem {
  product: {
    id: string
    name: string
    price: number
    image: string | null
    commands: string[]
  }
  quantity: number
  customInput?: string | null
}

export interface CoinConfig {
  coinRate: number
  promoDouble: boolean
  promoBonusThreshold: number
  promoBonusAmount: number
}

export interface CoinPromotionData {
  id: string
  name: string
  description?: string | null
  promoType: string
  value: number
  minSpend: number
  startDate?: string | null
  endDate?: string | null
}

export interface ShopInitData {
  products: Product[]
  categories: Category[]
  cart?: CartItem[]
  pendingOrders?: number
  coins?: number
  coinConfig?: CoinConfig
  activePromotions?: CoinPromotionData[]
  hash?: string
  timestamp?: number
}

export interface OrderItem {
  productId: string
  name: string
  price: number
  quantity: number
}

export interface Order {
  id: string
  orderId: number
  items: OrderItem[]
  total: number
  status: string
  createdAt: string
  isTopUp?: boolean
  payment?: {
    id: string
    paymentId: number
  }
}

export interface ProfileData {
  displayName: string | null
  balance: number
  playerUuid: string | null
  jobs: string[]
  lastLoginTime: number | null
  lastLogoffTime: number | null
  totalPlayTime: number | null
}

// ─── Shop Init Hook ─────────────────────────────────────────
// ดึง products, categories, cart, pendingOrders ทั้งหมดในคำขอเดียว
// refreshInterval 30s สำหรับ background refresh
export function useShopInit(minecraftName: string | null, config?: SWRConfiguration) {
  const key = minecraftName
    ? `/api/shop/init?minecraftName=${encodeURIComponent(minecraftName)}`
    : '/api/shop/init'

  return useSWR<ShopInitData>(key, swrFetcher, {
    refreshInterval: 30_000,          // Refresh ทุก 30 วินาที
    revalidateOnFocus: true,          // Revalidate เมื่อกลับมาที่ tab
    revalidateOnReconnect: true,      // Revalidate เมื่อ network กลับมา
    dedupingInterval: 5_000,          // ไม่ fetch ซ้ำใน 5 วินาที
    keepPreviousData: true,           // แสดง data เก่าระหว่าง revalidate
    ...config,
  })
}

// ─── Cart Hook ──────────────────────────────────────────────
// สำหรับ cart page — ใช้ separate key เพื่อ revalidate แยกจาก shopInit

/** สร้าง SWR cache key สำหรับ cart — ใช้ร่วมกับ mutateCart() */
export function getCartKey(minecraftName: string): string {
  return `/api/cart?minecraftName=${encodeURIComponent(minecraftName)}`
}

export function useCart(minecraftName: string | null, config?: SWRConfiguration) {
  const key = minecraftName ? getCartKey(minecraftName) : null

  return useSWR<{ items: CartItem[]; count: number }>(key, swrFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 3_000,
    ...config,
  })
}

// ─── Order History Hook ─────────────────────────────────────
export function useOrderHistory(minecraftName: string | null, config?: SWRConfiguration) {
  const key = minecraftName
    ? `/api/orders/user?minecraftName=${encodeURIComponent(minecraftName)}&status=history`
    : null

  return useSWR<{ orders: Order[] }>(key, swrFetcher, {
    revalidateOnFocus: false,       // History ไม่ค่อยเปลี่ยน
    dedupingInterval: 10_000,
    ...config,
  })
}

// ─── Pending Orders Hook ────────────────────────────────────
export function usePendingOrders(minecraftName: string | null, config?: SWRConfiguration) {
  const key = minecraftName
    ? `/api/orders/user?minecraftName=${encodeURIComponent(minecraftName)}&status=pending`
    : null

  return useSWR<{ orders: Order[] }>(key, swrFetcher, {
    refreshInterval: 10_000,        // Refresh ทุก 10 วินาที (ข้อมูลเปลี่ยนบ่อย)
    revalidateOnFocus: true,
    dedupingInterval: 3_000,
    ...config,
  })
}

// ─── Profile Hook ───────────────────────────────────────────
// Profile ใช้ POST (ตาม API เดิม) จึงต้อง custom fetcher
export function useProfile(minecraftName: string | null, config?: SWRConfiguration) {
  const fetcher = async (key: string) => {
    // key is just for SWR cache key, we POST instead
    const name = key.split(':')[1]
    const res = await apiFetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minecraftName: name }),
    })
    if (!res.ok) throw new Error('Profile fetch failed')
    const data = await res.json()
    return data.profile as ProfileData
  }

  return useSWR<ProfileData>(
    minecraftName ? `profile:${minecraftName}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      ...config,
    }
  )
}
