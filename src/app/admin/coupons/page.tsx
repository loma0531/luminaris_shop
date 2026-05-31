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

const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

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
}

export default function AdminCouponsPage() {
  const router = useRouter()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const { error: toastError } = useToast()

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
    <div className="admin-form-page" style={{ maxWidth: '960px' }}>
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
        <div className="admin-loading">
          <div className="spinner" style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : filteredCoupons.length === 0 ? (
        <div className="section-card" style={{ textAlign: 'center', padding: '3rem 1.5rem', borderStyle: 'dashed' }}>
          <p style={{ color: 'var(--muted-foreground)', marginTop: '0.75rem', fontSize: '0.875rem' }}>ไม่มีข้อมูลคูปองส่วนลดในระบบ</p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={() => router.push('/admin/coupons/new')}>
            <PlusIcon size={14} /> สร้างคูปองตัวแรก
          </button>
        </div>
      ) : (
        <div className="coupon-cards">
          {filteredCoupons.map((coupon) => {
            const isLimitReached = coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses
            const isExpired = coupon.endDate && new Date() > new Date(coupon.endDate)
            const isSystemActive = coupon.isActive && !isLimitReached && !isExpired

            return (
              <div key={coupon.id} className="coupon-card-item">
                <div className="coupon-card-left">
                  <span className="coupon-code-badge">{coupon.code}</span>
                  <div className="coupon-card-meta">
                    {/* Type badge */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                      padding: '0.15rem 0.4rem', borderRadius: '0.25rem', fontSize: '0.7rem', fontWeight: 600,
                      background: coupon.discountType === 'PERCENTAGE' ? 'rgba(59,130,246,0.1)' : 'rgba(234,179,8,0.1)',
                      color: coupon.discountType === 'PERCENTAGE' ? '#60a5fa' : '#facc15',
                      border: `1px solid ${coupon.discountType === 'PERCENTAGE' ? 'rgba(59,130,246,0.15)' : 'rgba(234,179,8,0.15)'}`,
                    }}>
                      {coupon.discountType === 'PERCENTAGE' ? `${coupon.discountValue}%` : `฿${coupon.discountValue}`}
                      {coupon.discountType === 'PERCENTAGE' && coupon.maxDiscount ? ` (สูงสุด ฿${coupon.maxDiscount})` : ''}
                    </span>

                    {/* Usage */}
                    <span style={{ fontSize: '0.7rem' }}>
                      ใช้ {coupon.usedCount}/{coupon.maxUses !== null ? coupon.maxUses : '∞'}
                    </span>

                    {/* Min spend */}
                    {coupon.minSpend > 0 && (
                      <span style={{ fontSize: '0.7rem' }}>ขั้นต่ำ ฿{coupon.minSpend.toLocaleString()}</span>
                    )}

                    {/* Expiry */}
                    {coupon.endDate && (
                      <span style={{ fontSize: '0.7rem' }}>
                        หมดอายุ {new Date(coupon.endDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="coupon-card-right">
                  {/* Status */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                    padding: '0.15rem 0.45rem', borderRadius: '9999px', fontSize: '0.675rem', fontWeight: 600,
                    background: isSystemActive ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: isSystemActive ? '#4ade80' : '#f87171',
                    border: `1px solid ${isSystemActive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                  }}>
                    {isSystemActive ? <CheckIcon size={9} /> : <CloseIcon size={9} />}
                    {isSystemActive ? 'ใช้ได้' : isLimitReached ? 'สิทธิ์เต็ม' : isExpired ? 'หมดอายุ' : 'ปิดใช้'}
                  </span>

                  <button className="btn btn-sm" onClick={() => router.push(`/admin/coupons/${coupon.id}`)}>
                    <EditIcon size={13} /> แก้ไข
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
