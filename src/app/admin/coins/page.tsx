'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { adminGet, adminPost, adminFetch, adminDelete } from '@/lib/adminFetch'
import { logger } from '@/lib/logger'
import { useToast } from '@/context/ToastContext'
import ConfirmModal from '@/components/ConfirmModal'
import {
  WalletIcon, CheckCircleIcon, TrashIcon, GiftIcon,
  InfoIcon, ClockIcon, EditIcon
} from '@/components/Icons'

interface Promotion {
  id: string
  name: string
  description?: string | null
  promoType: 'MULTIPLIER' | 'BONUS_CASH'
  value: number
  minSpend: number
  isActive: boolean
  startDate?: string | null
  endDate?: string | null
}

export default function AdminCoinsPage() {
  const router = useRouter()
  const { success: toastSuccess, error: toastError } = useToast()
  // ── Coin Rate ──
  const [coinRate, setCoinRate] = useState('1')
  const [rateSaving, setRateSaving] = useState(false)
  const [rateSuccess, setRateSuccess] = useState(false)
  const [rateError, setRateError] = useState('')

  // ── Promotions ──
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [promoLoading, setPromoLoading] = useState(true)

  // ── Delete Confirmation ──
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [promoToDelete, setPromoToDelete] = useState<string | null>(null)

  const fetchSettingsAndPromotions = async () => {
    try {
      const settingsRes = await adminGet('/api/admin/coins/settings')
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        setCoinRate(String(settingsData.coinRate ?? '1'))
      }
      const promoRes = await adminGet('/api/admin/coins/promotions?limit=100')
      if (promoRes.ok) {
        const promoData = await promoRes.json()
        setPromotions(promoData.promotions || [])
      }
    } catch (err) {
      logger.error(`Error loading coin settings: ${err}`)
      setRateError('ไม่สามารถโหลดข้อมูลการตั้งค่าได้')
    } finally {
      setPromoLoading(false)
    }
  }

  useEffect(() => { fetchSettingsAndPromotions() }, [])

  const handleRateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setRateSaving(true)
    setRateError('')
    setRateSuccess(false)
    try {
      const res = await adminPost('/api/admin/coins/settings', { coinRate: parseFloat(coinRate) || 1.0 })
      if (res.ok) {
        setRateSuccess(true)
        setTimeout(() => setRateSuccess(false), 3000)
      } else {
        const data = await res.json()
        setRateError(data.error || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล')
      }
    } catch (err) {
      logger.error(`Error saving coin rate: ${err}`)
      setRateError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์')
    } finally {
      setRateSaving(false)
    }
  }

  const handleDeletePromoClick = (id: string) => {
    setPromoToDelete(id)
    setShowConfirmDelete(true)
  }

  const confirmDeletePromo = async () => {
    if (!promoToDelete) return
    try {
      const res = await adminDelete(`/api/admin/coins/promotions?id=${promoToDelete}`)
      if (res.ok) {
        fetchSettingsAndPromotions()
        toastSuccess('ลบโปรโมชั่นสำเร็จ')
      } else {
        const data = await res.json()
        toastError(data.error || 'ไม่สามารถลบโปรโมชั่นได้')
      }
    } catch {
      toastError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์')
    } finally {
      setShowConfirmDelete(false)
      setPromoToDelete(null)
    }
  }

  const handleToggleActive = async (p: Promotion) => {
    try {
      const res = await adminFetch('/api/admin/coins/promotions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, isActive: !p.isActive }),
      })
      if (res.ok) {
        setPromotions(prev => prev.map(item => item.id === p.id ? { ...item, isActive: !item.isActive } : item))
        toastSuccess(`${p.isActive ? 'ปิด' : 'เปิด'}การใช้งานโปรโมชั่นสำเร็จ`)
      }
    } catch {
      // silent fail
    }
  }

  const getPromoStatus = (p: Promotion) => {
    const now = Date.now()
    if (!p.isActive) return { label: 'ปิดใช้งาน', color: 'hsl(var(--muted-foreground))', bg: 'hsl(var(--muted)/0.3)' }
    if (p.endDate && new Date(p.endDate).getTime() < now) return { label: 'หมดอายุ', color: 'hsl(var(--destructive))', bg: 'hsl(var(--destructive)/0.15)' }
    if (p.startDate && new Date(p.startDate).getTime() > now) return { label: 'รอเริ่ม', color: 'hsl(220 80% 65%)', bg: 'hsl(220 80% 65%/0.15)' }
    return { label: 'กำลังจัด', color: 'hsl(142 70% 50%)', bg: 'hsl(142 70% 50%/0.15)' }
  }

  return (
    <div className="max-w-[1240px] mx-auto p-4 flex flex-col gap-6">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="admin-title flex items-center gap-2.5 text-2xl font-bold text-primary">
            <WalletIcon size={26} />
            ระบบ Coin และโปรโมชั่น
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">จัดการอัตราแลกเปลี่ยนและโปรโมชั่นเติมเงินสำหรับผู้เล่น</p>
        </div>
        <Link
          id="btn-new-promotion"
          href="/admin/coins/promotions/new"
          className="btn btn-primary flex items-center gap-2 px-5 py-2.5 font-bold text-sm rounded-xl flex-shrink-0"
        >
          <GiftIcon size={16} />
          + สร้างโปรโมชั่นใหม่
        </Link>
      </div>

      {/* Legacy Form removed */}

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Left: Coin Rate + Formula ── */}
        <div className="flex flex-col gap-5">

          {/* Coin Rate Card */}
          <form onSubmit={handleRateSubmit} className="card p-5">
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2 text-foreground border-b border-border/40 pb-3">
              <WalletIcon size={16} className="text-primary" />
              อัตราแลกเปลี่ยนหลัก
            </h2>

            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold text-muted-foreground">เรทแลกเปลี่ยน (Coin ต่อ 1 บาท)</label>
              <div className="flex items-center gap-3">
                <div className="w-20 flex-shrink-0">
                  <input
                    type="number"
                    step="0.1"
                    className="input text-base font-bold text-center w-full"
                    value={coinRate}
                    onChange={(e) => setCoinRate(e.target.value)}
                    required
                    min="0.1"
                    aria-label="Coin Rate"
                  />
                </div>
                <div className="text-sm text-muted-foreground flex flex-col justify-center flex-1 min-w-0">
                  <div className="font-bold text-foreground text-sm flex items-center gap-2 flex-wrap">
                    <span>Coin / บาท</span>
                    <span className="text-xs font-normal text-muted-foreground bg-white/5 px-2.5 py-0.5 rounded-full flex-shrink-0">
                      เติม 100฿ = <span className="text-primary font-bold">{(100 * (parseFloat(coinRate) || 0)).toLocaleString()} Coin</span>
                    </span>
                  </div>
                </div>
              </div>

              {rateError && (
                <div className="bg-destructive/10 text-destructive border border-destructive/20 p-2.5 rounded-lg text-xs">{rateError}</div>
              )}
              {rateSuccess && (
                <div className="bg-success/15 text-success border border-success/20 p-2.5 rounded-lg text-xs flex items-center gap-1.5">
                  <CheckCircleIcon size={13} /> บันทึกสำเร็จ!
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full py-2.5 rounded-xl text-xs font-bold mt-1"
                disabled={rateSaving}
              >
                {rateSaving ? 'กำลังบันทึก...' : 'บันทึกอัตราแลกเปลี่ยน'}
              </button>
            </div>
          </form>

          {/* Formula Info */}
          <div className="card p-5 text-xs flex flex-col gap-2.5">
            <h3 className="font-bold flex items-center gap-1.5 text-foreground text-sm">
              <InfoIcon size={14} className="text-primary" />
              สูตรคำนวณ Coin
            </h3>
            <div className="bg-white/5 p-3 rounded-xl font-mono text-[10px] text-foreground/80 leading-relaxed backdrop-blur-md">
              {'Coin = ยอดเงิน × เรทหลัก × Σ(Multiplier) + Σ(Bonus)'}
            </div>
            <p className="text-muted-foreground leading-relaxed">
              โปรโมชั่นหลายตัวสามารถทำงานพร้อมกันได้ โดย Multiplier จะคูณรวมกัน และ Bonus จะนำมาบวกสุดท้าย
            </p>
          </div>
        </div>

        {/* ── Right: Promotions Card List ── */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <GiftIcon size={16} className="text-primary" />
              รายการโปรโมชั่น
              {!promoLoading && (
                <span className="text-xs text-muted-foreground font-normal">({promotions.length} รายการ)</span>
              )}
            </h2>
          </div>

          {promoLoading ? (
            <div className="flex justify-center py-12">
              <div className="spinner" />
            </div>
          ) : promotions.length === 0 ? (
            <div className="card border-dashed border-border/50 rounded-2xl p-10 text-center flex flex-col items-center gap-3">
              <GiftIcon size={32} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">ยังไม่มีโปรโมชั่นในระบบ</p>
              <Link
                href="/admin/coins/promotions/new"
                className="btn btn-primary text-xs px-4 py-2 font-semibold rounded-xl"
              >
                + สร้างโปรโมชั่นแรก
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {promotions.map((p) => {
                const status = getPromoStatus(p)
                const isMult = p.promoType === 'MULTIPLIER'
                return (
                  <div
                    key={p.id}
                    className="card p-4 transition-all hover:border-border/80"
                    style={{ animation: 'fadeIn 0.3s ease both' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left Info */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className="font-extrabold text-base md:text-lg text-foreground tracking-tight">{p.name}</span>
                            <span
                              className="text-[10px] md:text-xs font-bold px-2.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: status.bg, color: status.color }}
                            >
                              {status.label}
                            </span>
                          </div>
                          {p.description && (
                            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{p.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2 text-xs md:text-sm">
                            <span className="font-bold px-3 py-1.5 rounded-lg bg-white/5 text-foreground flex items-center gap-1">
                              <span className="text-muted-foreground font-normal">เงื่อนไข:</span>
                              <span style={{ color: isMult ? 'hsl(var(--primary))' : 'hsl(142 70% 55%)' }}>
                                {isMult ? `คูณ ×${p.value}` : `แถม +${p.value} Coin`}
                                {!isMult && p.minSpend > 0 && ` (เติมขั้นต่ำ ${p.minSpend}฿)`}
                              </span>
                            </span>
                            <span className="font-medium px-3 py-1.5 rounded-lg bg-white/5 text-muted-foreground flex items-center gap-1.5">
                              <ClockIcon size={12} className="text-primary" />
                              <span className="font-normal text-muted-foreground">ระยะเวลา:</span>
                              <span className="text-foreground font-semibold">
                                {p.startDate ? new Date(p.startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : 'ทันที'}
                                {' → '}
                                {p.endDate ? new Date(p.endDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : 'ถาวร'}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right Actions */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {/* Toggle with status text */}
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-extrabold ${p.isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                            {p.isActive ? 'เปิดอยู่' : 'ปิดอยู่'}
                          </span>
                          <button
                            type="button"
                            aria-label={p.isActive ? 'ปิดโปรโมชั่น' : 'เปิดโปรโมชั่น'}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                              p.isActive ? 'bg-primary shadow-lg shadow-primary/20' : 'bg-white/10'
                            }`}
                            onClick={() => handleToggleActive(p)}
                          >
                            <span
                              className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                              style={{ transform: p.isActive ? 'translateX(18px)' : 'translateX(3px)' }}
                            />
                          </button>
                        </div>
                        {/* Edit + Delete */}
                        <div className="flex gap-1.5">
                          <Link
                            id={`edit-promo-${p.id}`}
                            href={`/admin/coins/promotions/${p.id}`}
                            className="btn btn-sm btn-muted py-1 px-2.5 text-[10px] rounded-lg flex items-center gap-1"
                            title="แก้ไขโปรโมชั่น"
                          >
                            <EditIcon size={11} />
                            แก้ไข
                          </Link>
                          <button
                            type="button"
                            id={`delete-promo-${p.id}`}
                            className="btn btn-sm btn-danger py-1 px-2.5 text-[10px] rounded-lg flex items-center justify-center font-semibold"
                            onClick={() => handleDeletePromoClick(p.id)}
                            title="ลบโปรโมชั่น"
                          >
                            <TrashIcon size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirmDelete}
        title="ยืนยันการลบโปรโมชั่น"
        content="คุณแน่ใจว่าต้องการลบโปรโมชั่นนี้? การกระทำนี้ไม่สามารถย้อนกลับได้"
        confirmText="ใช่, ลบเลย"
        cancelText="ยกเลิก"
        isDestructive={true}
        onConfirm={confirmDeletePromo}
        onCancel={() => { setShowConfirmDelete(false); setPromoToDelete(null) }}
      />

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        :global(.card) {
          background: rgba(255, 255, 255, 0.03) !important;
          border: none !important;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
          backdrop-filter: blur(20px) !important;
          -webkit-backdrop-filter: blur(20px) !important;
        }
        :global(.card:hover) {
          background: rgba(255, 255, 255, 0.05) !important;
          border: none !important;
        }
        :global(.border),
        :global(.border-border/30),
        :global(.border-border/40),
        :global(.border-border/50) {
          border-color: transparent !important;
        }
        :global(.input) {
          background: rgba(255, 255, 255, 0.02) !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
        }
        :global(.input:focus) {
          border-color: rgba(139, 92, 246, 0.5) !important;
          box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.15) !important;
        }
      `}</style>
    </div>
  )
}
