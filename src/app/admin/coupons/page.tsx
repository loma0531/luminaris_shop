'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  PlusIcon,
  SearchIcon,
  TagIcon,
  EditIcon,
  CloseIcon,
} from '@/components/Icons'
import { adminGet } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'
import { useToast } from '@/context/ToastContext'
import { SkeletonAdminCouponGrid } from '@/components/Skeleton'

const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const CopyIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

interface CouponUsage {
  id: string
  minecraftName: string
  orderId: string
  discountedAmt: number
  usedAt: string
}

interface Coupon {
  id: string
  code: string
  discountType: string
  discountValue: number
  maxDiscount: number | null
  minSpend: number
  maxUses: number | null
  maxUsesPerUser: number
  usedCount: number
  isActive: boolean
  startDate: string | null
  endDate: string | null
  createdAt: string
  usages?: CouponUsage[]
}

export default function AdminCouponsPage() {
  const router = useRouter()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const { success: toastSuccess, error: toastError } = useToast()

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    toastSuccess('คัดลอกรหัสคูปองสำเร็จ!')
  }

  const fetchCoupons = useCallback(async (bustCache = false) => {
    try {
      setLoading(true)
      const url = bustCache ? `/api/coupons?_t=${Date.now()}` : '/api/coupons'
      const res = await adminGet(url)
      const data = await res.json()
      setCoupons(Array.isArray(data) ? data : [])
    } catch (error) {
      logger.error(`Error fetching coupons: ${error}`)
      toastError('เกิดข้อผิดพลาดในการโหลดข้อมูลคูปอง')
    } finally {
      setLoading(false)
    }
  }, [toastError])

  useEffect(() => {
    fetchCoupons()
  }, [fetchCoupons])

  const filteredCoupons = coupons.filter((c) =>
    c.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="admin-form-page" style={{ maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.375rem', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>จัดการคูปองส่วนลด</h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0.1rem 0 0' }}>สร้างและจัดการรหัสส่วนลดสำหรับหน้าร้านค้า</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => router.push('/admin/coupons/new')}>
          <PlusIcon size={16} /> เพิ่มคูปองใหม่
        </button>
      </div>

      {/* Search */}
      <div className="search-box" style={{ marginBottom: '1.25rem', maxWidth: '100%' }}>
        <span className="search-icon"><SearchIcon size={16} /></span>
        <input
          type="text"
          className="input"
          placeholder="ค้นหารหัสคูปอง..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonAdminCouponGrid />
      ) : filteredCoupons.length === 0 ? (
        <div className="section-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', borderStyle: 'dashed' }}>
          <p style={{ color: 'var(--muted-foreground)', marginTop: '0.75rem', fontSize: '0.875rem' }}>ไม่มีข้อมูลคูปองส่วนลดในระบบ</p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={() => router.push('/admin/coupons/new')}>
            <PlusIcon size={14} /> สร้างคูปองตัวแรก
          </button>
        </div>
      ) : (
        <div className="coupon-grid">
          {filteredCoupons.map((coupon) => {
            const isLimitReached = coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses
            const isExpired = coupon.endDate && new Date() > new Date(coupon.endDate)
            const isSystemActive = coupon.isActive && !isLimitReached && !isExpired

            return (
              <div key={coupon.id} className="coupon-grid-card">
                {/* Header: Code & Action (Copy / Edit) */}
                <div className="card-header-row">
                  <div className="code-container">
                    <span className="coupon-code-badge">{coupon.code}</span>
                    <button
                      className="btn-copy animate-pulse-subtle"
                      onClick={() => handleCopy(coupon.code)}
                      title="คัดลอกรหัสคูปอง"
                    >
                      <CopyIcon size={14} />
                    </button>
                  </div>
                  <button className="btn-icon-only" onClick={() => router.push(`/admin/coupons/${coupon.id}`)} title="แก้ไขคูปอง">
                    <EditIcon size={13} /> แก้ไข
                  </button>
                </div>

                {/* Body details */}
                <div className="card-info-body">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="discount-badge" style={{
                      padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem', fontWeight: 700,
                      background: coupon.discountType === 'PERCENTAGE' ? 'rgba(59,130,246,0.15)' : coupon.discountType === 'COIN' ? 'rgba(168,85,247,0.15)' : 'rgba(234,179,8,0.15)',
                      color: coupon.discountType === 'PERCENTAGE' ? '#60a5fa' : coupon.discountType === 'COIN' ? '#c084fc' : '#facc15',
                      border: `1px solid ${coupon.discountType === 'PERCENTAGE' ? 'rgba(59,130,246,0.2)' : coupon.discountType === 'COIN' ? 'rgba(168,85,247,0.2)' : 'rgba(234,179,8,0.2)'}`,
                    }}>
                      {coupon.discountType === 'PERCENTAGE' 
                        ? `ลด ${coupon.discountValue}%` 
                        : coupon.discountType === 'COIN' 
                          ? `แจก +${coupon.discountValue.toLocaleString()} Coin` 
                          : `ลด ฿${coupon.discountValue.toLocaleString()}`}
                    </span>
                    
                    <span className="status-pill" style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                      padding: '0.15rem 0.55rem', borderRadius: '9999px', fontSize: '0.675rem', fontWeight: 600,
                      background: isSystemActive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      color: isSystemActive ? '#4ade80' : '#f87171',
                      border: `1px solid ${isSystemActive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                    }}>
                      {isSystemActive ? <CheckIcon size={9} /> : <CloseIcon size={9} />}
                      {isSystemActive ? 'ใช้ได้' : isLimitReached ? 'เต็ม' : isExpired ? 'หมดอายุ' : 'ปิด'}
                    </span>
                  </div>

                  <div className="limits-list">
                    {coupon.discountType !== 'COIN' && coupon.minSpend > 0 && <div>• ขั้นต่ำ <strong>฿{coupon.minSpend.toLocaleString()}</strong></div>}
                    {coupon.discountType === 'PERCENTAGE' && coupon.maxDiscount && <div>• ลดสูงสุด <strong>฿{coupon.maxDiscount.toLocaleString()}</strong></div>}
                    {coupon.endDate && (
                      <div>• หมดอายุ <strong>{new Date(coupon.endDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</strong></div>
                    )}
                    <div>• จำกัดสิทธิ์ <strong>{coupon.maxUsesPerUser} ครั้ง/คน</strong></div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="usage-progress">
                  <div className="progress-text">
                    <span>การใช้งานสิทธิ์</span>
                    <span>{coupon.usedCount} / {coupon.maxUses !== null ? coupon.maxUses : '∞'}</span>
                  </div>
                  <div className="progress-track">
                    <div 
                      className="progress-fill" 
                      style={{ 
                        width: coupon.maxUses !== null ? `${Math.min(100, (coupon.usedCount / coupon.maxUses) * 100)}%` : '0%' 
                      }} 
                    />
                  </div>
                </div>

                {/* Usages History (Who used it) */}
                <div className="usages-section">
                  <div className="usages-title">ประวัติการใช้งาน ({coupon.usages?.length || 0})</div>
                  {coupon.usages && coupon.usages.length > 0 ? (
                    <div className="usages-list-scroll">
                      {coupon.usages.map((use) => (
                        <div key={use.id} className="usage-item">
                          <span className="player-name">{use.minecraftName}</span>
                          <span className="used-amount">
                            {coupon.discountType === 'COIN' ? `+${use.discountedAmt.toLocaleString()} Coin` : `-฿${use.discountedAmt.toLocaleString()}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-usages-text">ยังไม่มีประวัติการใช้งาน</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style jsx>{`
        .coupon-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
          gap: 1.25rem;
          margin-top: 1.5rem;
        }

        .coupon-grid-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, var(--shadow-opacity));
          transition: all 0.2s ease;
          position: relative;
        }

        .coupon-grid-card:hover {
          transform: translateY(-2px);
          border-color: var(--primary);
          box-shadow: 0 8px 24px rgba(0, 0, 0, calc(var(--shadow-opacity) * 1.5));
        }

        .card-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0.625rem;
        }

        .code-container {
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }

        .btn-copy {
          background: transparent;
          border: none;
          color: var(--muted-foreground);
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        }

        .btn-copy:hover {
          color: var(--foreground);
          background: var(--muted);
        }

        .btn-icon-only {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--muted-foreground);
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          transition: all 0.15s ease;
          font-size: 0.75rem;
        }

        .btn-icon-only:hover {
          color: var(--foreground);
          border-color: var(--border-hover);
          background: var(--muted);
        }

        .card-info-body {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }

        .limits-list {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.75rem;
          color: var(--muted-foreground);
        }

        .usage-progress {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .progress-text {
          display: flex;
          justify-content: space-between;
          font-size: 0.7rem;
          color: var(--muted-foreground);
        }

        .progress-track {
          height: 6px;
          background: var(--muted);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          background: var(--primary);
          border-radius: 3px;
        }

        .usages-section {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 8px;
          padding: 0.625rem;
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
          border: 1px solid rgba(255, 255, 255, 0.03);
        }

        :global(html[data-theme="light"]) .usages-section {
          background: rgba(0, 0, 0, 0.03);
          border: 1px solid rgba(0, 0, 0, 0.03);
        }

        .usages-title {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .usages-list-scroll {
          max-height: 80px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding-right: 0.25rem;
        }

        .usages-list-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .usages-list-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .usages-list-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
        }
        :global(html[data-theme="light"]) .usages-list-scroll::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.1);
        }

        .usage-item {
          display: flex;
          justify-content: space-between;
          font-size: 0.7rem;
          padding: 0.125rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }
        
        .usage-item:last-child {
          border-bottom: none;
        }

        .usage-item .player-name {
          color: var(--foreground);
          font-weight: 500;
        }

        .usage-item .used-amount {
          color: #ef4444;
          font-weight: 500;
        }

        .no-usages-text {
          font-size: 0.7rem;
          color: var(--muted-foreground);
          font-style: italic;
          padding: 0.25rem 0;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
