'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { SearchIcon, PackageIcon, CheckCircleIcon, WalletIcon } from '@/components/Icons'
import { adminGet, adminPost } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'
import { SkeletonAdminTable } from '@/components/Skeleton'

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
  coins?: number
  createdAt: string
  orders?: Order[]
}

import { apiFetch } from '@/lib/apiFetch'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userOrders, setUserOrders] = useState<Map<string, Order[]>>(new Map())
  const [loadingOrders, setLoadingOrders] = useState<string | null>(null)

  // Coin States
  const [selectedUserForCoins, setSelectedUserForCoins] = useState<string | null>(null)
  const [currentCoinsValue, setCurrentCoinsValue] = useState(0)
  const [coinActionAmount, setCoinActionAmount] = useState('')
  const [coinActionType, setCoinActionType] = useState<'ADD' | 'SUB'>('ADD')
  const [coinActionDesc, setCoinActionDesc] = useState('')
  const [coinActionLoading, setCoinActionLoading] = useState(false)
  const [coinActionError, setCoinActionError] = useState('')

  const fetchUsers = useCallback(async () => {
    try {
      const res = await adminGet(`/api/users?page=${page}&limit=10&search=${encodeURIComponent(search)}`)
      const data = await res.json()
      setUsers(data.users || [])
      setTotalPages(data.totalPages || 1)
      setTotal(data.total || 0)
    } catch (error) {
      logger.error(`Error fetching users: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  // Reset page to 1 on search queries
  useEffect(() => {
    setPage(1)
  }, [search])

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

  const handleCoinAction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedUserForCoins) return
    setCoinActionLoading(true)
    setCoinActionError('')

    const numAmount = parseFloat(coinActionAmount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setCoinActionError('กรุณากรอกจำนวนเหรียญให้ถูกต้อง')
      setCoinActionLoading(false)
      return
    }

    const finalAmount = coinActionType === 'ADD' ? numAmount : -numAmount

    try {
      const res = await adminPost('/api/admin/coins/give', {
        minecraftName: selectedUserForCoins,
        amount: finalAmount,
        description: coinActionDesc
      })

      if (res.ok) {
        const data = await res.json()
        const newBalance = data.newBalance
        setUsers(prev => prev.map(u => {
          if (u.minecraftName === selectedUserForCoins) {
            return { ...u, coins: newBalance }
          }
          return u
        }))
        setSelectedUserForCoins(null)
        setCoinActionAmount('')
        setCoinActionDesc('')
        // Refetch to ensure data is in sync with DB
        fetchUsers()
      } else {
        const data = await res.json()
        setCoinActionError(data.error || 'เกิดข้อผิดพลาดในการทำรายการ')
      }
    } catch (err) {
      setCoinActionError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์')
    } finally {
      setCoinActionLoading(false)
    }
  }



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
        <SkeletonAdminTable cols={[25, 20, 20, 20, 15]} />
      ) : (
        <>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Minecraft Name</th>
                  <th>ยอดซื้อสะสม</th>
                  <th>Coin สะสม</th>
                  <th>วันที่ลงทะเบียน</th>
                  <th>การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center p-8">
                      ไม่พบผู้ใช้
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <React.Fragment key={user.id}>
                      <tr>
                        <td className="font-semibold">{user.minecraftName}</td>
                        <td>{(user.totalSpent || 0).toLocaleString()} ฿</td>
                        <td className="font-semibold text-primary">{(user.coins || 0).toLocaleString()} Coin</td>
                        <td className="text-sm text-muted-foreground">
                          {new Date(user.createdAt).toLocaleDateString('th-TH')}
                        </td>
                        <td>
                          <div className="flex gap-2">
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
                            <button
                              className="btn btn-sm btn-outline flex items-center gap-1"
                              onClick={() => {
                                setSelectedUserForCoins(user.minecraftName)
                                setCurrentCoinsValue(user.coins || 0)
                                setCoinActionType('ADD')
                              }}
                            >
                              <WalletIcon size={12} className="text-primary" />
                              จัดการ Coin
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Expanded Order History */}
                      {expandedUser === user.minecraftName && (
                        <tr>
                          <td colSpan={5} className="bg-muted p-4">
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
            <div className="flex items-center justify-between w-full bg-slate-950 p-4 border border-slate-800 rounded-xl mt-6">
              <span className="text-xs text-slate-400">
                แสดง {total === 0 ? 0 : (page - 1) * 10 + 1} - {Math.min(page * 10, total)} จาก {total} รายการ
              </span>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:bg-slate-800 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                >
                  ย้อนกลับ
                </button>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .map((p, idx, arr) => {
                    const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                    return (
                      <React.Fragment key={p}>
                        {showEllipsis && <span className="text-slate-500 text-xs px-1">...</span>}
                        <button
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                            page === p 
                              ? 'bg-indigo-600 text-white' 
                              : 'text-slate-400 hover:bg-slate-800'
                          }`}
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    )
                  })
                }

                <button
                  className="px-3 py-1.5 rounded-lg border border-slate-800 text-slate-200 hover:bg-slate-800 text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal จัดการ Coin */}
      {selectedUserForCoins !== null && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div 
            className="bg-card border border-border w-full max-w-[450px] rounded-xl p-6 shadow-xl animate-scale-in"
            style={{ backgroundColor: 'var(--card-bg-solid, #060607)', opacity: 0.99 }}
          >
            <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
              <WalletIcon size={18} className="text-primary" />
              จัดการเหรียญ Coin : <span className="text-primary font-bold">{selectedUserForCoins}</span>
            </h3>
            
            <div className="mb-4 bg-muted/40 p-3 rounded-lg border border-border/30 text-sm">
              ยอดเหรียญปัจจุบัน: <span className="font-semibold text-primary">{currentCoinsValue.toLocaleString()} Coin</span>
            </div>

            <form onSubmit={handleCoinAction} className="flex flex-col gap-4">
              <div className="form-group flex flex-col gap-1">
                <label className="form-label text-xs text-muted-foreground font-medium">ประเภทการดำเนินการ</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`btn py-2 text-sm font-semibold rounded-lg border transition-all ${coinActionType === 'ADD' ? 'btn-primary border-primary' : 'bg-transparent border-border'}`}
                    onClick={() => setCoinActionType('ADD')}
                  >
                    เสกเหรียญ (เพิ่ม)
                  </button>
                  <button
                    type="button"
                    className={`btn py-2 text-sm font-semibold rounded-lg border transition-all ${coinActionType === 'SUB' ? 'btn-destructive border-destructive' : 'bg-transparent border-border'}`}
                    onClick={() => setCoinActionType('SUB')}
                  >
                    หักเหรียญ (ลด)
                  </button>
                </div>
              </div>

              <div className="form-group flex flex-col gap-1">
                <label className="form-label text-xs text-muted-foreground font-medium">จำนวน Coin</label>
                <input
                  type="number"
                  className="input"
                  placeholder="กรอกจำนวน Coin"
                  value={coinActionAmount}
                  onChange={(e) => setCoinActionAmount(e.target.value)}
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>

              <div className="form-group flex flex-col gap-1">
                <label className="form-label text-xs text-muted-foreground font-medium">เหตุผลการบันทึก (ระบุหรือไม่ระบุก็ได้)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="เช่น Event Reward, ชดเชยระบบ"
                  value={coinActionDesc}
                  onChange={(e) => setCoinActionDesc(e.target.value)}
                />
              </div>

              {coinActionError && (
                <div className="bg-destructive/15 text-destructive border border-destructive/25 p-3 rounded-lg text-xs">
                  {coinActionError}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setSelectedUserForCoins(null)
                    setCoinActionAmount('')
                    setCoinActionDesc('')
                  }}
                  disabled={coinActionLoading}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className={`btn ${coinActionType === 'ADD' ? 'btn-primary' : 'btn-destructive'}`}
                  disabled={coinActionLoading}
                >
                  {coinActionLoading ? (
                    <>
                      <div className="spinner w-4 h-4 mr-2" />
                      กำลังดำเนินการ...
                    </>
                  ) : (
                    coinActionType === 'ADD' ? 'ยืนยันเพิ่ม Coin' : 'ยืนยันหัก Coin'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
