'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { SearchIcon, CheckIcon, CloseIcon, CreditCardIcon, ClockIcon, PlusIcon } from '@/components/Icons'
import { adminGet, adminPost } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'
import { useToast } from '@/context/ToastContext'
import { SkeletonAdminTable } from '@/components/Skeleton'
import { useAdminData } from '../layout'

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

interface ManualItem {
  productId: string
  name: string
  price: number
  quantity: number
  commands: string[]
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  
  // Custom dropdown state
  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const statusDropdownRef = useRef<HTMLDivElement>(null)

  // Manual Order Modal
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualNote, setManualNote] = useState('')
  const [manualItems, setManualItems] = useState<ManualItem[]>([
    { productId: '', name: '', price: 0, quantity: 1, commands: [] }
  ])
  const [submitting, setSubmitting] = useState(false)
  
  // Custom Dropdown State & Ref for multiple items
  const [activeItemDropdown, setActiveItemDropdown] = useState<number | null>(null)
  const itemsDropdownRef = useRef<HTMLDivElement>(null)

  const { products } = useAdminData()
  const { success, error: toastError } = useToast()

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusOpen(false)
      }
      if (itemsDropdownRef.current && !itemsDropdownRef.current.contains(event.target as Node)) {
        setActiveItemDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const statusParam = statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''
      const res = await adminGet(`/api/orders?page=${page}&limit=50${statusParam}`)
      const data = await res.json()
      
      if (data.orders) {
        setOrders(data.orders)
        setTotalPages(data.totalPages || 1)
        setTotal(data.total || 0)
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
        return <span className="badge badge-warning animate-pulse-subtle inline-flex items-center gap-1"><CreditCardIcon size={12} /> รอชำระ</span>
      case 'PENDING':
      default:
        return <span className="badge badge-warning animate-pulse-subtle inline-flex items-center gap-1"><ClockIcon size={12} /> รอดำเนินการ</span>
    }
  }

  // === Manual Order Helpers ===
  const handleProductSelect = (index: number, productId: string) => {
    const newItems = [...manualItems]
    
    if (productId === '__custom__') {
      // Custom item — let user type name and price
      newItems[index] = {
        productId: '__custom__',
        name: newItems[index].name || '',
        price: newItems[index].price || 0,
        quantity: newItems[index].quantity || 1,
        commands: [],
      }
    } else {
      const product = products.find((p: { id: string; name: string; price: number; [key: string]: unknown }) => p.id === productId)
      if (!product) return
      newItems[index] = {
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity: newItems[index].quantity || 1,
        commands: product.commands || [],
      }
    }
    setManualItems(newItems)
  }

  const updateManualItem = (index: number, field: keyof ManualItem, value: string | number | string[]) => {
    const newItems = [...manualItems]
    newItems[index] = { ...newItems[index], [field]: value }
    setManualItems(newItems)
  }

  const addManualItem = () => {
    setManualItems([...manualItems, { productId: '', name: '', price: 0, quantity: 1, commands: [] }])
  }

  const removeManualItem = (index: number) => {
    if (manualItems.length <= 1) return
    setManualItems(manualItems.filter((_, i) => i !== index))
  }

  const manualTotal = manualItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)

  const resetManualForm = () => {
    setManualName('')
    setManualNote('')
    setManualItems([{ productId: '', name: '', price: 0, quantity: 1, commands: [] }])
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate
    if (!manualName.trim()) {
      toastError('กรุณากรอกชื่อผู้เล่น')
      return
    }
    const validItems = manualItems.filter(item => (item.productId && item.name) || (item.productId === '__custom__' && item.name.trim()))
    if (validItems.length === 0) {
      toastError('กรุณาเลือกหรือกรอกสินค้าอย่างน้อย 1 รายการ')
      return
    }

    setSubmitting(true)
    try {
      // For custom items, generate a dummy productId for validation
      const itemsToSend = validItems.map(item => ({
        ...item,
        productId: item.productId === '__custom__' ? '000000000000000000000000' : item.productId,
      }))
      const res = await adminPost('/api/admin/orders', {
        minecraftName: manualName.trim(),
        items: itemsToSend,
        total: manualTotal,
        note: manualNote.trim() || undefined,
      })

      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create order')
      }

      success(`สร้างออเดอร์ #${data.orderId} สำเร็จ (${manualTotal.toLocaleString()} ฿)`)
      setShowManualModal(false)
      resetManualForm()
      fetchOrders()
    } catch (error) {
      const err = error as Error
      toastError(err.message || 'เกิดข้อผิดพลาดในการสร้างออเดอร์')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="admin-header-actions">
        <h1 className="admin-title">จัดการคำสั่งซื้อ</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            resetManualForm()
            setShowManualModal(true)
          }}
        >
          <PlusIcon size={16} />
          เสกออเดอร์
        </button>
      </div>

      {/* Filters */}
      <div className="orders-filters">
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
        <div className="custom-dropdown min-w-[180px]" ref={statusDropdownRef}>
          <button 
            type="button"
            className={`dropdown-trigger ${isStatusOpen ? 'active' : ''}`}
            onClick={() => setIsStatusOpen(!isStatusOpen)}
          >
            <span>
              {statusFilter === 'ALL' && 'ทุกสถานะ'}
              {statusFilter === 'COMPLETED' && 'สำเร็จ'}
              {statusFilter === 'AWAITING_PAYMENT' && 'รอชำระ'}
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
                setPage(1)
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
                setPage(1)
                setIsStatusOpen(false)
              }}
            >
              <span>สำเร็จ</span>
              {statusFilter === 'COMPLETED' && <div className="item-check"><CheckIcon size={14} /></div>}
            </button>
            <button
              type="button"
              className={`dropdown-item ${statusFilter === 'AWAITING_PAYMENT' ? 'selected' : ''}`}
              onClick={() => {
                setStatusFilter('AWAITING_PAYMENT')
                setPage(1)
                setIsStatusOpen(false)
              }}
            >
              <span>รอชำระ</span>
              {statusFilter === 'AWAITING_PAYMENT' && <div className="item-check"><CheckIcon size={14} /></div>}
            </button>
            <button
              type="button"
              className={`dropdown-item ${statusFilter === 'CANCELLED' ? 'selected' : ''}`}
              onClick={() => {
                setStatusFilter('CANCELLED')
                setPage(1)
                setIsStatusOpen(false)
              }}
            >
              <span>ยกเลิก</span>
              {statusFilter === 'CANCELLED' && <div className="item-check"><CheckIcon size={14} /></div>}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonAdminTable cols={[12, 18, 30, 15, 13, 12]} />
      ) : (
        <>
          {/* Desktop: Table View */}
          <div className="orders-table-desktop">
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
                      <td colSpan={6} className="text-center p-8 animate-fade-in">
                        ไม่พบรายการ
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order: Order, idx: number) => (
                      <tr 
                        key={order.id}
                        className="animate-fade-in-up"
                        style={{ animationDelay: `${idx * 20}ms`, animationFillMode: 'both' }}
                      >
                        <td className="font-mono font-semibold">
                          #{order.orderId}
                        </td>
                        <td>{order.minecraftName}</td>
                        <td>
                          <div className="flex flex-col gap-1 max-w-[300px]">
                            {order.items.map((item: OrderItem, itemIdx: number) => (
                              <div key={itemIdx} className="text-sm px-2 py-1 bg-muted rounded">
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
          <div className="orders-cards-mobile">
            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <p>ไม่พบรายการ</p>
              </div>
            ) : (
              filteredOrders.map((order: Order, idx: number) => (
                <div 
                  key={order.id} 
                  className="order-card-mobile animate-fade-in-up"
                  style={{ animationDelay: `${idx * 20}ms`, animationFillMode: 'both' }}
                >
                  <div className="order-card-header">
                    <div>
                      <div className="order-card-id">#{order.orderId}</div>
                      <div className="order-card-player">{order.minecraftName}</div>
                    </div>
                    {getStatusBadge(order.status)}
                  </div>
                  <div className="order-card-items">
                    {order.items.map((item: OrderItem, itemIdx: number) => (
                      <div key={itemIdx} className="order-card-item">
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between w-full bg-slate-950 p-4 border border-slate-800 rounded-xl mt-6">
              <span className="text-xs text-slate-400">
                แสดง {total === 0 ? 0 : (page - 1) * 50 + 1} - {Math.min(page * 50, total)} จาก {total} รายการ
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

      {/* Manual Order Modal */}
      {showManualModal && (
        <div className="modal-backdrop" onClick={() => setShowManualModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">เสกออเดอร์ (Admin)</h2>
              <button 
                className="btn btn-icon btn-ghost" 
                onClick={() => setShowManualModal(false)}
                aria-label="ปิดหน้าต่างเสกออเดอร์"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="modal-form">
              {/* Player Name */}
              <div className="form-section">
                <div className="form-group">
                  <label className="form-label">ชื่อผู้เล่น <span className="text-red">*</span></label>
                  <input
                    type="text"
                    className="input"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="Minecraft Name"
                    required
                    autoFocus
                  />
                </div>
              </div>

              {/* Items */}
              <div className="form-section">
                <label className="form-label">สินค้า <span className="text-red">*</span></label>
                <div className="manual-items-list" ref={itemsDropdownRef}>
                  {manualItems.map((item, index) => (
                    <div key={index} className="manual-item-block">
                      <div className="manual-item-row">
                        <div className="custom-dropdown manual-product-select" style={{ minWidth: '220px' }}>
                          <button 
                            type="button"
                            className={`dropdown-trigger ${activeItemDropdown === index ? 'active' : ''}`}
                            onClick={() => setActiveItemDropdown(activeItemDropdown === index ? null : index)}
                          >
                            <span>
                              {item.productId 
                                ? (item.productId === '__custom__' ? '✏️ กำหนดเอง (Custom)' : products.find((p: { id: string; name: string }) => p.id === item.productId)?.name || 'เลือกสินค้า')
                                : 'เลือกสินค้า'}
                            </span>
                            <div className="dropdown-arrow">
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          </button>
                          
                          <div className={`dropdown-menu ${activeItemDropdown === index ? 'open' : ''}`} style={{ zIndex: 100 }}>
                            <button
                              type="button"
                              className={`dropdown-item ${!item.productId ? 'selected' : ''}`}
                              onClick={() => {
                                handleProductSelect(index, '')
                                setActiveItemDropdown(null)
                              }}
                            >
                              <span>เลือกสินค้า</span>
                              {!item.productId && <div className="item-check"><CheckIcon size={14} /></div>}
                            </button>
                            
                            {products.map((p: { id: string; name: string; price: number }) => (
                              <button
                                key={p.id}
                                type="button"
                                className={`dropdown-item ${item.productId === p.id ? 'selected' : ''}`}
                                onClick={() => {
                                  handleProductSelect(index, p.id)
                                  setActiveItemDropdown(null)
                                }}
                              >
                                <span>{p.name} ({p.price}฿)</span>
                                {item.productId === p.id && <div className="item-check"><CheckIcon size={14} /></div>}
                              </button>
                            ))}

                            <button
                              type="button"
                              className={`dropdown-item ${item.productId === '__custom__' ? 'selected' : ''}`}
                              onClick={() => {
                                handleProductSelect(index, '__custom__')
                                setActiveItemDropdown(null)
                              }}
                            >
                              <span>✏️ กำหนดเอง (Custom)</span>
                              {item.productId === '__custom__' && <div className="item-check"><CheckIcon size={14} /></div>}
                            </button>
                          </div>
                        </div>
                        <input
                          type="number"
                          className="input manual-qty-input"
                          value={item.quantity}
                          onChange={(e) => updateManualItem(index, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                          min={1}
                          max={99}
                        />
                        {item.productId && (
                          <span className="manual-item-subtotal">
                            {(item.price * item.quantity).toLocaleString()}฿
                          </span>
                        )}
                        {manualItems.length > 1 && (
                          <button 
                            type="button" 
                            className="btn btn-icon btn-danger-outline btn-sm" 
                            onClick={() => removeManualItem(index)}
                            aria-label={`ลบรายการสินค้าที่ ${index + 1}`}
                          >
                            <CloseIcon size={14} />
                          </button>
                        )}
                      </div>
                      {item.productId === '__custom__' && (
                        <div className="manual-custom-fields">
                          <input
                            type="text"
                            className="input"
                            value={item.name}
                            onChange={(e) => updateManualItem(index, 'name', e.target.value)}
                            placeholder="ชื่อสินค้า"
                            required
                          />
                          <input
                            type="number"
                            className="input manual-price-input"
                            value={item.price || ''}
                            onChange={(e) => updateManualItem(index, 'price', parseFloat(e.target.value) || 0)}
                            placeholder="ราคา (฿)"
                            min={0}
                            required
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-sm btn-secondary mt-2" onClick={addManualItem}>
                  <PlusIcon size={14} /> เพิ่มสินค้า
                </button>
              </div>

              {/* Note */}
              <div className="form-section">
                <div className="form-group">
                  <label className="form-label">หมายเหตุ</label>
                  <input
                    type="text"
                    className="input"
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    placeholder="เช่น เสกให้เป็นรางวัลกิจกรรม"
                  />
                </div>
              </div>

              {/* Total & Submit */}
              <div className="modal-footer">
                <div className="manual-total">
                  รวม: <strong>{manualTotal.toLocaleString()} ฿</strong>
                </div>
                <div className="footer-right">
                  <button type="button" className="btn btn-outline" onClick={() => setShowManualModal(false)}>
                    ยกเลิก
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary min-w-[140px]" 
                    disabled={submitting || !manualName.trim() || !manualItems.some(i => i.productId && (i.productId !== '__custom__' || i.name.trim()))}
                  >
                    {submitting ? (
                      <><div className="spinner w-4 h-4" /> กำลังสร้าง...</>
                    ) : (
                      'สร้างออเดอร์'
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .admin-header-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .text-red { color: #ef4444; margin-left: 2px; }
        .mt-2 { margin-top: 0.5rem; }

        /* Modal */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8); /* ทึบขึ้น 80% (เพิ่ม 10%) */
          backdrop-filter: blur(8px);      /* เบลอมากขึ้นเป็น 8px */
          -webkit-backdrop-filter: blur(8px);
          z-index: 50;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          animation: fadeIn 0.2s ease-out;
        }
        .modal-content {
          background: #0d0c0f;
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px);      /* เบลอเนื้อหากล่อง 20px */
          -webkit-backdrop-filter: blur(20px);
          border-radius: 1rem;
          width: 100%;
          max-width: 560px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        :global(html[data-theme="light"]) .modal-content {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(245, 245, 250, 0.96) 100%);
          border: 1px solid rgba(9, 9, 11, 0.08);
        }

        .modal-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .modal-title {
          font-size: 1.1rem;
          font-weight: 600;
        }
        .modal-form {
          padding: 1.5rem;
          overflow-y: auto;
          flex: 1;
        }
        .form-section {
          margin-bottom: 1.5rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--border);
        }
        .form-section:last-child {
          border-bottom: none;
          padding-bottom: 0;
          margin-bottom: 0;
        }
        .modal-footer {
          padding: 1.25rem 1.5rem;
          border-top: 1px solid var(--border);
          background: var(--muted);
          border-bottom-left-radius: 1rem;
          border-bottom-right-radius: 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .footer-right {
          display: flex;
          gap: 0.75rem;
        }

        /* Manual Order Items */
        .manual-items-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-top: 0.5rem;
        }
        .manual-item-block {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .manual-item-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .manual-product-select {
          flex: 1;
          min-width: 0;
        }
        .manual-qty-input {
          width: 70px;
          text-align: center;
        }
        .manual-custom-fields {
          display: flex;
          gap: 0.5rem;
          padding-left: 0.25rem;
        }
        .manual-custom-fields .input:first-child {
          flex: 1;
        }
        .manual-price-input {
          width: 100px;
        }
        .manual-item-subtotal {
          font-size: 0.85rem;
          color: var(--muted-foreground);
          min-width: 60px;
          text-align: right;
          font-weight: 500;
        }
        .manual-total {
          font-size: 1rem;
          color: var(--foreground);
        }
        .manual-total strong {
          color: var(--primary);
          font-size: 1.1rem;
        }

        /* Buttons */
        .btn-ghost { background: transparent; border: none; }
        .btn-ghost:hover { background: var(--muted); }
        .btn-danger-outline {
          color: #ef4444; border-color: rgba(239,68,68,0.3); background: transparent;
        }
        .btn-danger-outline:hover {
          background: rgba(239,68,68,0.1); border-color: #ef4444;
        }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  )
}
