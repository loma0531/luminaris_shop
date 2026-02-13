'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  HistoryIcon,
  PackageIcon,
  CheckCircleIcon,
  CloseIcon,
  CartIcon,
} from '@/components/Icons'
import { useOrderHistory } from '@/lib/swr-hooks'


interface User {
  id: string
  minecraftName: string
}

export default function HistoryPage() {
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (!storedUser) {
      router.push('/shop')
      return
    }
    try {
      setUser(JSON.parse(storedUser))
    } catch {
      router.push('/shop')
    }
  }, [router])

  // SWR: ดึง order history อัตโนมัติเมื่อมี user
  const { data, isLoading: loading } = useOrderHistory(user?.minecraftName || null)
  const orders = data?.orders || []

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <HistoryIcon size={24} />
        ประวัติการซื้อ
      </h1>

        {loading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-4">
                <div className="flex justify-between mb-4">
                  <div className="skeleton w-[120px] h-5" />
                  <div className="skeleton w-20 h-6 rounded-full" />
                </div>
                <div className="skeleton w-full h-[60px] mb-4" />
                <div className="flex justify-between">
                  <div className="skeleton w-[100px] h-4" />
                  <div className="skeleton w-20 h-5" />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <PackageIcon size={48} className="opacity-50 mb-4" />
            <p className="mb-4">ยังไม่มีประวัติการซื้อ</p>
            <Link href="/shop" className="btn btn-primary">
              <CartIcon size={16} />
              ไปซื้อสินค้า
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {orders.map((order) => (
              <div key={order.id} className="card">
                {/* Order Header */}
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-border">
                  <div>
                    <span className="font-semibold text-lg">
                      Order #{order.orderId}
                    </span>
                    <span className="text-sm text-muted-foreground ml-4">
                      {new Date(order.createdAt).toLocaleString('th-TH')}
                    </span>
                  </div>
                  {order.status === 'COMPLETED' ? (
                    <div className="flex items-center gap-2 text-success text-sm font-medium">
                      <CheckCircleIcon size={16} />
                      สำเร็จ
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-error text-sm font-medium">
                      <CloseIcon size={16} />
                      ยกเลิก
                    </div>
                  )}
                </div>

                {/* Order Items */}
                <div className="flex flex-col gap-2">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center px-3 py-2 bg-muted rounded-md text-sm">
                      <div className="flex items-center gap-2">
                        <PackageIcon size={14} />
                        <span>{item.name}</span>
                        <span className="text-muted-foreground">x{item.quantity}</span>
                      </div>
                      <span className="font-medium">
                        {(item.price * item.quantity).toLocaleString()} บาท
                      </span>
                    </div>
                  ))}
                </div>

                {/* Order Total */}
                <div className="flex justify-between mt-4 pt-4 border-t border-border text-lg font-semibold">
                  <span>รวมทั้งสิ้น</span>
                  <span className="text-primary">
                    {order.total.toLocaleString()} บาท
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
