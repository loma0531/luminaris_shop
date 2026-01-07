'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  HistoryIcon,
  PackageIcon,
  CheckCircleIcon,
  CloseIcon,
  CartIcon,
} from '@/components/Icons'
import { apiFetch } from '@/lib/apiFetch'
import { logger } from '@/lib/logger'


interface OrderItem {
  productId: string
  name: string
  price: number
  quantity: number
}

interface Order {
  id: string
  orderId: number
  items: OrderItem[]
  total: number
  status: string
  createdAt: string
}

interface User {
  id: string
  minecraftName: string
}

export default function HistoryPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [, setUser] = useState<User | null>(null)
  const router = useRouter()
  const currentUserRef = useRef<string | null>(null)

  const fetchHistory = useCallback(async (userObj: User) => {
    // Reset state for new user
    setOrders([])
    setLoading(true)

    try {
      const res = await apiFetch(`/api/orders/user?minecraftName=${encodeURIComponent(userObj.minecraftName)}&status=history`)
      const data = await res.json()
      
      if (data.orders) {
        setOrders(data.orders)
      }
    } catch (error) {
      logger.error(`Error fetching history: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (!storedUser) {
      router.push('/shop')
      return
    }
    const userObj = JSON.parse(storedUser)
    
    // Check if user changed - reset and fetch new data
    if (currentUserRef.current !== userObj.minecraftName) {
      currentUserRef.current = userObj.minecraftName
      setUser(userObj)
      fetchHistory(userObj)
    }
  }, [router, fetchHistory])

  return (
    <div>
      <h1 style={{ 
        fontSize: '1.5rem', 
        fontWeight: 600, 
        marginBottom: '1.5rem', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem' 
      }}>
        <HistoryIcon size={24} />
        ประวัติการซื้อ
      </h1>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card" style={{ padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div className="skeleton" style={{ width: 120, height: '1.25rem' }} />
                  <div className="skeleton" style={{ width: 80, height: '1.5rem', borderRadius: 20 }} />
                </div>
                <div className="skeleton" style={{ width: '100%', height: 60, marginBottom: '1rem' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="skeleton" style={{ width: 100, height: '1rem' }} />
                  <div className="skeleton" style={{ width: 80, height: '1.25rem' }} />
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <PackageIcon size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
            <p style={{ marginBottom: '1rem' }}>ยังไม่มีประวัติการซื้อ</p>
            <Link href="/shop" className="btn btn-primary">
              <CartIcon size={16} />
              ไปซื้อสินค้า
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {orders.map((order) => (
              <div key={order.id} className="card">
                {/* Order Header */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '1rem',
                  paddingBottom: '1rem',
                  borderBottom: '1px solid var(--border)'
                }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '1.125rem' }}>
                      Order #{order.orderId}
                    </span>
                    <span style={{ 
                      fontSize: '0.875rem', 
                      color: 'var(--muted-foreground)', 
                      marginLeft: '1rem' 
                    }}>
                      {new Date(order.createdAt).toLocaleString('th-TH')}
                    </span>
                  </div>
                  {order.status === 'COMPLETED' ? (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      color: '#22c55e',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}>
                      <CheckCircleIcon size={16} />
                      สำเร็จ
                    </div>
                  ) : (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      color: '#ef4444',
                      fontSize: '0.875rem',
                      fontWeight: 500,
                    }}>
                      <CloseIcon size={16} />
                      ยกเลิก
                    </div>
                  )}
                </div>

                {/* Order Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {order.items.map((item, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      background: 'var(--muted)',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <PackageIcon size={14} />
                        <span>{item.name}</span>
                        <span style={{ color: 'var(--muted-foreground)' }}>x{item.quantity}</span>
                      </div>
                      <span style={{ fontWeight: 500 }}>
                        {(item.price * item.quantity).toLocaleString()} บาท
                      </span>
                    </div>
                  ))}
                </div>

                {/* Order Total */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  marginTop: '1rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--border)',
                  fontSize: '1.125rem',
                  fontWeight: 600,
                }}>
                  <span>รวมทั้งสิ้น</span>
                  <span style={{ color: 'var(--primary)' }}>
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
