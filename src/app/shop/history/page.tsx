'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  HistoryIcon,
  PackageIcon,
  CloseIcon,
  CartIcon,
  SearchIcon,
  CheckIcon,
  CreditCardIcon,
  ClockIcon,
} from '@/components/Icons'
import { useOrderHistory } from '@/lib/swr-hooks'


interface User {
  id: string
  minecraftName: string
}

type StatusFilter = 'ALL' | 'COMPLETED' | 'CANCELLED'

export default function HistoryPage() {
  const [user, setUser] = useState<User | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)
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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // SWR: ดึง order history อัตโนมัติเมื่อมี user
  const { data, isLoading: loading } = useOrderHistory(user?.minecraftName || null)
  const orders = data?.orders || []

  // Filter orders by search & status
  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      search === '' ||
      order.orderId.toString().includes(search) ||
      order.items.some((item) => item.name.toLowerCase().includes(search.toLowerCase()))

    const matchesStatus =
      statusFilter === 'ALL' || order.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
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
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2 animate-fade-in-down">
        <HistoryIcon size={24} />
        ประวัติการซื้อ
      </h1>

      {/* Filters */}
      <div className="orders-filters">
        <div className="search-box flex-1 min-w-[200px]">
          <span className="search-icon"><SearchIcon size={16} /></span>
          <input
            type="text"
            className="input"
            placeholder="ค้นหา Order ID หรือชื่อสินค้า"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="custom-dropdown min-w-[160px]" ref={statusDropdownRef}>
          <button
            type="button"
            className={`dropdown-trigger ${isStatusOpen ? 'active' : ''}`}
            onClick={() => setIsStatusOpen(!isStatusOpen)}
          >
            <span>
              {statusFilter === 'ALL' && 'ทุกสถานะ'}
              {statusFilter === 'COMPLETED' && 'สำเร็จ'}
              {statusFilter === 'CANCELLED' && 'ยกเลิก'}
            </span>
            <div className="dropdown-arrow">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </button>

          <div className={`dropdown-menu ${isStatusOpen ? 'open' : ''}`}>
            <button
              type="button"
              className={`dropdown-item ${statusFilter === 'ALL' ? 'selected' : ''}`}
              onClick={() => {
                setStatusFilter('ALL')
                setIsStatusOpen(false)
              }}
            >
              <span>ทุกสถานะ</span>
              {statusFilter === 'ALL' && <div className="item-check"><CheckIcon size={14} /></div>}
            </button>
            <button
              type="button"
              className={`dropdown-item ${statusFilter === 'COMPLETED' ? 'selected' : ''}`}
              onClick={() => {
                setStatusFilter('COMPLETED')
                setIsStatusOpen(false)
              }}
            >
              <span>สำเร็จ</span>
              {statusFilter === 'COMPLETED' && <div className="item-check"><CheckIcon size={14} /></div>}
            </button>
            <button
              type="button"
              className={`dropdown-item ${statusFilter === 'CANCELLED' ? 'selected' : ''}`}
              onClick={() => {
                setStatusFilter('CANCELLED')
                setIsStatusOpen(false)
              }}
            >
              <span>ยกเลิก</span>
              {statusFilter === 'CANCELLED' && <div className="item-check"><CheckIcon size={14} /></div>}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      ) : orders.length === 0 ? (
        <div className="empty-state animate-scale-in">
          <PackageIcon size={48} className="opacity-50 mb-4" />
          <p className="mb-4">ยังไม่มีประวัติการซื้อ</p>
          <Link href="/shop" className="btn btn-primary">
            <CartIcon size={16} />
            ไปซื้อสินค้า
          </Link>
        </div>
      ) : (
        <>
          {/* Desktop: Table View */}
          <div className="orders-table-desktop animate-fade-in-up">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>สินค้า</th>
                    <th>ราคารวม</th>
                    <th>สถานะ</th>
                    <th>เวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center p-8">
                        ไม่พบรายการที่ตรงกับการค้นหา
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr key={order.id}>
                        <td className="font-mono font-semibold">
                          #{order.orderId}
                        </td>
                        <td>
                          <div className="flex flex-col gap-1 max-w-[300px]">
                            {order.items.map((item, idx) => (
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
          </div>

          {/* Mobile: Card View */}
          <div className="orders-cards-mobile animate-fade-in-up">
            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <p>ไม่พบรายการที่ตรงกับการค้นหา</p>
              </div>
            ) : (
              filteredOrders.map((order) => (
                <div key={order.id} className="order-card-mobile">
                  <div className="order-card-header">
                    <div className="order-card-id">#{order.orderId}</div>
                    {getStatusBadge(order.status)}
                  </div>
                  <div className="order-card-items">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="order-card-item">
                        <span className="order-card-item-name">{item.name}</span>
                        <span className="order-card-item-qty">x{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                  <div className="order-card-footer">
                    <div className="order-card-total">{order.total.toLocaleString()} ฿</div>
                    <div className="order-card-date">
                      {new Date(order.createdAt).toLocaleString('th-TH')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
