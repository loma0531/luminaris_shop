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
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const statusParam = statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''
      const res = await adminGet(`/api/orders?page=${page}&limit=50${statusParam}`)
      const data = await res.json()
      
      if (data.orders) {
        setOrders(data.orders)
        setTotalPages(data.totalPages || 1)
      }
    } catch (error) {
      logger.error(`Failed to fetch orders: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Filter by search (name or orderId) - client-side filtering
  const filteredOrders = orders.filter((o: Order) =>
    o.minecraftName.toLowerCase().includes(search.toLowerCase()) ||
    o.orderId.toString().includes(search)
  )

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="badge badge-success inline-flex items-center gap-1"><CheckIcon size={12} /> สำเร็จ</span>
      case 'CANCELLED':
        return <span className="badge badge-error inline-flex items-center gap-1"><CloseIcon size={12} /> ยกเลิก</span>
      case 'AWAITING_PAYMENT':
        return <span className="badge badge-warning inline-flex items-center gap-1"><CreditCardIcon size={12} /> รอชำระ</span>
      case 'PENDING':
      default:
        return <span className="badge badge-warning inline-flex items-center gap-1"><ClockIcon size={12} /> รอดำเนินการ</span>
    }
  }

  return (
    <div>
      <h1 className="admin-title mb-6">จัดการคำสั่งซื้อ</h1>

      {/* Filters */}
      <div className="flex gap-4 mb-6 flex-wrap items-center">
        {/* Search */}
        <div className="search-box flex-1 min-w-[200px]">
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
          className="input min-w-[160px] px-4 py-2 bg-card border border-border rounded-md text-foreground"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter)
            setPage(1)
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
                    <td colSpan={6} className="text-center p-8">
                      ไม่พบรายการ
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order: Order) => (
                    <tr key={order.id}>
                      <td className="font-mono font-semibold">
                        #{order.orderId}
                      </td>
                      <td>{order.minecraftName}</td>
                      <td>
                        <div className="flex flex-col gap-1 max-w-[300px]">
                          {order.items.map((item: OrderItem, idx: number) => (
                            <div key={idx} className="text-sm px-2 py-1 bg-muted rounded">
                              {item.name} <span className="text-muted-foreground">x{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="font-semibold">{order.total.toLocaleString()} ฿</td>
                      <td>{getStatusBadge(order.status)}</td>
                      <td className="text-sm text-muted-foreground">
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
