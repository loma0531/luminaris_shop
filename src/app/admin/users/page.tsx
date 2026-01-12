'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { SearchIcon, PackageIcon, CheckCircleIcon } from '@/components/Icons'
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
  total: number
  status: string
  createdAt: string
  items: OrderItem[]
}

interface User {
  id: string
  minecraftName: string
  totalSpent: number
  createdAt: string
  orders?: Order[]
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userOrders, setUserOrders] = useState<Map<string, Order[]>>(new Map())
  const [loadingOrders, setLoadingOrders] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await adminGet(`/api/users?page=${page}&limit=10`)
      const data = await res.json()
      setUsers(data.users || [])
      setTotalPages(data.totalPages || 1)
    } catch (error) {
      logger.error(`Error fetching users: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const fetchUserOrders = async (minecraftName: string) => {
    if (userOrders.has(minecraftName)) {
      setExpandedUser(expandedUser === minecraftName ? null : minecraftName)
      return
    }

    setLoadingOrders(minecraftName)
    try {
      const res = await adminGet(`/api/orders?minecraftName=${encodeURIComponent(minecraftName)}&limit=50`)
      const data = await res.json()
      const completedOrders = (data.orders || []).filter((o: Order) => o.status === 'COMPLETED')
      setUserOrders(prev => new Map(prev).set(minecraftName, completedOrders))
      setExpandedUser(minecraftName)
    } catch (error) {
      logger.error(`Error fetching user orders: ${error}`)
    } finally {
      setLoadingOrders(null)
    }
  }

  const filteredUsers = users.filter((u) =>
    u.minecraftName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <h1 className="admin-title mb-6">จัดการผู้ใช้</h1>

      <div className="search-box mb-6">
        <span className="search-icon"><SearchIcon size={16} /></span>
        <input
          type="text"
          className="input"
          placeholder="ค้นหาผู้ใช้"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
                  <th>Minecraft Name</th>
                  <th>ยอดซื้อสะสม</th>
                  <th>วันที่ลงทะเบียน</th>
                  <th>ประวัติการซื้อ</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center p-8">
                      ไม่พบผู้ใช้
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <React.Fragment key={user.id}>
                      <tr>
                        <td className="font-semibold">{user.minecraftName}</td>
                        <td>{(user.totalSpent || 0).toLocaleString()} ฿</td>
                        <td className="text-sm text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString('th-TH')}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm"
                            onClick={() => fetchUserOrders(user.minecraftName)}
                            disabled={loadingOrders === user.minecraftName}
                          >
                            {loadingOrders === user.minecraftName ? (
                              <div className="spinner w-3.5 h-3.5" />
                            ) : (
                              <PackageIcon size={14} />
                            )}
                            {expandedUser === user.minecraftName ? 'ซ่อน' : 'ดูประวัติ'}
                          </button>
                        </td>
                      </tr>
                      {/* Expanded Order History */}
                      {expandedUser === user.minecraftName && (
                        <tr>
                          <td colSpan={4} className="bg-muted p-4">
                            {userOrders.get(user.minecraftName)?.length === 0 ? (
                              <p className="text-center text-muted-foreground">
                                ยังไม่มีประวัติการซื้อ
                              </p>
                            ) : (
                              <div className="flex flex-col gap-3">
                                {userOrders.get(user.minecraftName)?.map((order) => (
                                  <div 
                                    key={order.id} 
                                    className="bg-card px-4 py-3 rounded-lg border border-border"
                                  >
                                    <div className="flex justify-between items-center mb-2">
                                      <span className="font-semibold">Order #{order.orderId}</span>
                                      <div className="flex items-center gap-2">
                                        <span className="badge badge-success">
                                          <CheckCircleIcon size={12} /> สำเร็จ
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {new Date(order.createdAt).toLocaleString('th-TH')}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {order.items.map((item, idx) => (
                                        <span
                                          key={idx}
                                          className="text-xs px-2 py-1 bg-muted rounded"
                                        >
                                          {item.name} x{item.quantity}
                                        </span>
                                      ))}
                                    </div>
                                    <div className="text-right mt-2 font-semibold text-primary">
                                      {order.total.toLocaleString()} ฿
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
