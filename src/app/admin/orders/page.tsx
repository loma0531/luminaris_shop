'use client'

import { useState, useEffect, useCallback } from 'react'
import { SearchIcon, CheckIcon, CloseIcon, CreditCardIcon, ClockIcon } from '@/components/Icons'
import { adminGet } from '@/lib/adminFetch'
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
  userId: string
  total: number
  status: 'PENDING' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'CANCELLED'
  createdAt: string
  items: OrderItem[]
  minecraftName: string
}

type StatusFilter = 'ALL' | 'PENDING' | 'AWAITING_PAYMENT' | 'COMPLETED' | 'CANCELLED'

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchOrders = useCallback(async () => {
    try {
      let url = `/api/orders?page=${page}&limit=20`
      if (statusFilter !== 'ALL') {
        url += `&status=${statusFilter}`
      }
      const res = await adminGet(url)
      const data = await res.json()
      setOrders(data.orders || [])
      setTotalPages(data.totalPages || 1)
    } catch (error) {
      logger.error(`Error fetching orders: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Filter by search (name or orderId)
  const filteredOrders = orders.filter((o) =>
    o.minecraftName.toLowerCase().includes(search.toLowerCase()) ||
    o.orderId.toString().includes(search)
  )

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><CheckIcon size={12} /> สำเร็จ</span>
      case 'CANCELLED':
        return <span className="badge badge-error" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><CloseIcon size={12} /> ยกเลิก</span>
      case 'AWAITING_PAYMENT':
        return <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><CreditCardIcon size={12} /> รอชำระ</span>
      case 'PENDING':
      default:
        return <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}><ClockIcon size={12} /> รอดำเนินการ</span>
    }
  }

  return (
    <div>
      <h1 className="admin-title" style={{ marginBottom: '1.5rem' }}>จัดการคำสั่งซื้อ</h1>

      {/* Filters */}
      <div style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        {/* Search */}
        <div className="search-box" style={{ flex: '1', minWidth: '200px' }}>
          <span className="search-icon"><SearchIcon size={16} /></span>
          <input
            type="text"
            className="input"
            placeholder="ค้นหาชื่อผู้เล่นหรือ Order ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <select
          className="input"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter)
            setPage(1)
          }}
          style={{ 
            minWidth: '160px',
            padding: '0.5rem 1rem',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '0.375rem',
            color: 'var(--foreground)',
          }}
        >
          <option value="ALL">ทุกสถานะ</option>
          <option value="COMPLETED">สำเร็จ</option>
          <option value="AWAITING_PAYMENT">รอชำระ</option>
          <option value="CANCELLED">ยกเลิก</option>
        </select>
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>ชื่อผู้เล่น</th>
                  <th>สินค้า</th>
                  <th>ราคารวม</th>
                  <th>สถานะ</th>
                  <th>เวลา</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                      ไม่พบรายการ
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        #{order.orderId}
                      </td>
                      <td>{order.minecraftName}</td>
                      <td>
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '0.25rem',
                          maxWidth: '300px',
                        }}>
                          {order.items.map((item, idx) => (
                            <div key={idx} style={{ 
                              fontSize: '0.875rem',
                              padding: '0.25rem 0.5rem',
                              background: 'var(--muted)',
                              borderRadius: '0.25rem',
                            }}>
                              {item.name} <span style={{ color: 'var(--muted-foreground)' }}>x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{order.total.toLocaleString()} ฿</td>
                      <td>{getStatusBadge(order.status)}</td>
                      <td style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                        {new Date(order.createdAt).toLocaleString('th-TH')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <span>หน้า</span>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`pagination-btn ${page === p ? 'active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              {totalPages > 5 && <span>...{totalPages}</span>}
              <button
                className="pagination-btn"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                {'<'}
              </button>
              <button
                className="pagination-btn"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
              >
                {'>'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
