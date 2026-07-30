'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useShop } from '../layout'
import { useShopInit } from '@/lib/swr-hooks'
import { apiFetch } from '@/lib/apiFetch'
import { useToast } from '@/context/ToastContext'
import { WalletIcon, GiftIcon, InfoIcon, ClockIcon, TagIcon } from '@/components/Icons'

const TOPUP_PRESETS = [50, 100, 300, 500, 1000]

export default function ShopCoinsPage() {
  const router = useRouter()
  const { user } = useShop()
  const { success: toastSuccess, error: toastError } = useToast()
  const minecraftName = user?.minecraftName || null
  const { data: shopData, mutate: revalidateShopData } = useShopInit(minecraftName)

  const coinConfig = shopData?.coinConfig || { coinRate: 1.0, promoDouble: false, promoBonusThreshold: 0, promoBonusAmount: 0 }
  const activePromotions = shopData?.activePromotions || []
  const currentCoins = shopData?.coins || 0.0

  const [amount, setAmount] = useState<number>(100)
  const [customAmount, setCustomAmount] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const [couponCode, setCouponCode] = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)

  const activeAmount = customAmount ? parseFloat(customAmount) || 0 : amount

  const calculateCoins = (amt: number) => {
    if (isNaN(amt) || amt <= 0) return { base: 0, multiplier: 1, bonus: 0, total: 0 }
    const base = amt * coinConfig.coinRate
    const multiplierPromos = activePromotions.filter((p: any) => p.promoType === 'MULTIPLIER')
    let totalMultiplier = 1.0
    for (const p of multiplierPromos) { totalMultiplier = totalMultiplier * (p as any).value }
    let total = base * totalMultiplier
    const bonusPromos = activePromotions.filter((p: any) => p.promoType === 'BONUS_CASH')
    let bonus = 0
    for (const p of bonusPromos) {
      if ((p as any).minSpend > 0 && amt >= (p as any).minSpend) { bonus += (p as any).value }
    }
    total += bonus
    return { base, multiplier: totalMultiplier, bonus, total }
  }

  const calculation = calculateCoins(activeAmount)

  const handleCreateTopupOrder = async () => {
    if (!minecraftName) return
    if (activeAmount < 10) { toastError('ยอดเติมเงินขั้นต่ำคือ 10 บาท'); return }
    setLoading(true)
    try {
      const res = await apiFetch('/api/checkout/coins/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minecraftName, amount: activeAmount })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        router.push('/shop/orders')
      } else {
        toastError(data.error || 'เกิดข้อผิดพลาดในการสร้างรายการเติมเงิน')
      }
    } catch {
      toastError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์')
    } finally {
      setLoading(false)
    }
  }

  const handleRedeemCoupon = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!minecraftName) return
    if (!couponCode.trim()) {
      toastError('กรุณากรอกรหัสคูปอง')
      return
    }
    setRedeemLoading(true)
    try {
      const res = await apiFetch('/api/coupons/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minecraftName,
          code: couponCode.trim(),
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toastSuccess(data.message || `แลกรับ ${data.coinsEarned} Coin สำเร็จ!`)
        setCouponCode('')
        revalidateShopData()
      } else {
        toastError(data.error || 'ไม่สามารถแลกคูปองได้')
      }
    } catch {
      toastError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์')
    } finally {
      setRedeemLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="card flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
        <WalletIcon size={48} className="text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">กรุณาเข้าสู่ระบบ</h2>
        <p className="text-muted-foreground text-sm max-w-xs mb-4">
          คุณจำเป็นต้องเข้าสู่ระบบก่อนจึงจะสามารถทำรายการเติมเงินสะสม Coin ได้
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-[1000px] mx-auto p-4 flex flex-col gap-5">

      {/* ── Hero: ยอดเงินคงเหลือ ── */}
      <div
        className="card relative overflow-hidden p-6 shadow-lg"
        style={{
          animation: 'fadeInUp 0.4s ease both',
          borderColor: 'rgba(139, 92, 246, 0.25)'
        }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{ background: 'radial-gradient(ellipse 60% 80% at 15% 50%, rgba(124, 58, 237, 0.08) 0%, transparent 70%)' }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <WalletIcon size={28} className="text-primary" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">ยอดเงินคงเหลือ</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-primary tabular-nums"
                  style={{ textShadow: '0 0 20px rgba(124, 58, 237, 0.3)' }}>
                  {currentCoins.toLocaleString()}
                </span>
                <span className="text-sm font-bold text-muted-foreground">Coin</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 backdrop-blur-md px-3 py-2 rounded-lg flex-shrink-0">
            <span className="font-semibold text-foreground">อัตราแลกเปลี่ยน:</span>{' '}
            1 บาท = <span className="text-primary font-bold">{coinConfig.coinRate} Coin</span>
          </div>
        </div>
      </div>

      {/* ── Promotions Banner (แยกออกจาก Hero) ── */}
      {activePromotions.length > 0 && (
        <div
          className="flex flex-wrap gap-2 items-center px-1"
          style={{ animation: 'fadeInUp 0.4s 0.08s ease both' }}
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground flex-shrink-0">
            <GiftIcon size={13} className="text-primary" />
            <span>โปรโมชั่นที่กำลังจัด:</span>
          </div>
          {activePromotions.map((p: any) => (
            <span
              key={p.id}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-bold backdrop-blur-md ${
                p.promoType === 'MULTIPLIER'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-emerald-500/10 text-emerald-500'
              }`}
            >
              <GiftIcon size={14} />
              {p.name}:{' '}
              {p.promoType === 'MULTIPLIER' ? `คูณ x${p.value}` : `แถม +${p.value} Coin (ขั้นต่ำ ${p.minSpend}฿)`}
              {p.endDate && (
                <span className="opacity-70">
                  · หมด {new Date(p.endDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

        {/* ฝั่งซ้าย: เลือกยอดเติมเงิน */}
        <div
          className="card flex flex-col gap-5 p-5"
          style={{ animation: 'fadeInUp 0.4s 0.12s ease both' }}
        >
          <div className="flex items-center gap-2 border-b border-border/30 pb-3">
            <h2 className="text-base font-bold text-foreground">เลือกยอดเติมเงิน</h2>
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2.5" role="group" aria-label="ยอดเติมเงินสำเร็จรูป">
            {TOPUP_PRESETS.map((val) => {
              const isSelected = amount === val && !customAmount
              return (
                <button
                  key={val}
                  type="button"
                  id={`preset-${val}`}
                  aria-pressed={isSelected}
                  className={`flex flex-col items-center justify-center py-3.5 rounded-xl backdrop-blur-md font-bold text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isSelected 
                      ? 'bg-primary/20 text-primary scale-105 shadow-md shadow-primary/10' 
                      : 'bg-muted/40 hover:bg-muted/60 border-border/50 text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => { setAmount(val); setCustomAmount('') }}
                >
                  <span className="text-base font-extrabold">{val}</span>
                  <span className="text-[10px] font-medium opacity-75 mt-0.5">บาท</span>
                </button>
              )
            })}
          </div>

          {/* Custom input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="custom-amount" className="text-xs font-semibold text-muted-foreground">
              ระบุยอดเองตามต้องการ <span className="font-normal opacity-70">(ขั้นต่ำ 10 บาท)</span>
            </label>
            <div className="relative">
              <input
                id="custom-amount"
                type="number"
                className="input pr-14 text-sm"
                placeholder="เช่น 250"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                min="10"
                aria-label="ระบุยอดเติมเงินเอง"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold pointer-events-none">
                บาท
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 bg-muted/30 backdrop-blur-md rounded-xl p-3 text-xs text-muted-foreground">
            <InfoIcon size={14} className="flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              เงินที่เติมจะเปลี่ยนเป็น Coin สำหรับแลกซื้อไอเทม ไม่ต้องสแกน QR ทุกครั้ง
            </span>
          </div>
        </div>

        {/* ฝั่งขวา: สรุปการชำระเงิน */}
        <div
          className="card flex flex-col gap-4 p-5"
          style={{ animation: 'fadeInUp 0.4s 0.18s ease both' }}
        >
          <div className="flex items-center gap-2 border-b border-border/30 pb-3">
            <InfoIcon size={18} className="text-primary flex-shrink-0" />
            <h2 className="text-base font-bold text-foreground">สรุปรายการชำระเงิน</h2>
          </div>

          {/* Amount */}
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">ยอดชำระจริง</span>
            <span className="text-2xl font-extrabold text-foreground tabular-nums">
              {activeAmount > 0 ? activeAmount.toLocaleString() : '—'}
              {activeAmount > 0 && <span className="text-sm font-semibold text-muted-foreground ml-1">บาท</span>}
            </span>
          </div>

          {/* Breakdown */}
          <div className="flex flex-col gap-2 text-xs border-t border-border/30 pt-3">
            <div className="flex justify-between items-center text-muted-foreground">
              <span>Coin พื้นฐาน ({coinConfig.coinRate}× ยอดเงิน)</span>
              <span className="font-semibold tabular-nums">{calculation.base > 0 ? calculation.base.toLocaleString() : '—'}</span>
            </div>
            {calculation.multiplier > 1.0 && (
              <div className="flex justify-between items-center text-primary font-semibold">
                <span>ตัวคูณโปรโมชั่น</span>
                <span className="tabular-nums">× {calculation.multiplier}</span>
              </div>
            )}
            {calculation.bonus > 0 && (
              <div className="flex justify-between items-center font-semibold" style={{ color: 'hsl(142 70% 55%)' }}>
                <span>โบนัสแถมพิเศษ</span>
                <span className="tabular-nums">+{calculation.bonus.toLocaleString()} Coin</span>
              </div>
            )}
          </div>

          {/* Total */}
          <div
            className="rounded-xl p-4 flex justify-between items-center backdrop-blur-md bg-success/10"
          >
            <span className="text-sm font-semibold text-foreground">Coin ที่จะได้รับ</span>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-3xl font-extrabold tabular-nums text-success"
                style={{
                  textShadow: calculation.total > 0 ? '0 0 16px rgba(16, 185, 129, 0.4)' : 'none',
                }}
              >
                {calculation.total > 0 ? calculation.total.toLocaleString() : '—'}
              </span>
              {calculation.total > 0 && (
                <span className="text-sm font-semibold text-success/80">Coin</span>
              )}
            </div>
          </div>

          {/* Note */}
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <ClockIcon size={13} className="flex-shrink-0 mt-0.5 text-primary" />
            <span className="leading-relaxed">
              เมื่อกดดำเนินการ ระบบจะสร้างคำสั่งซื้อและนำไปยังหน้าชำระเงิน
            </span>
          </div>

          {/* CTA Button */}
          <button
            id="btn-confirm-topup"
            type="button"
            className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${
              activeAmount >= 10 && !loading
                ? 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-lg shadow-emerald-500/25 active:translate-y-0.5'
                : 'bg-muted text-muted-foreground'
            }`}
            onClick={handleCreateTopupOrder}
            disabled={loading || activeAmount < 10}
            aria-busy={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                กำลังสร้างคำสั่งซื้อ...
              </span>
            ) : (
              `ดำเนินการชำระเงิน${activeAmount >= 10 ? ` ${activeAmount.toLocaleString()} บาท` : ''}`
            )}
          </button>
        </div>
      </div>

      {/* ── Coupon Redeem Card ── */}
      <div
        className="card flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-5 shadow-lg relative overflow-hidden"
        style={{
          animation: 'fadeInUp 0.4s 0.24s ease both',
          borderColor: 'rgba(168, 85, 247, 0.25)',
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.05) 0%, rgba(124, 58, 237, 0.02) 100%)'
        }}
      >
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-purple-400">
            <TagIcon size={22} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              มีรหัสคูปองแลก Coin?
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              ใส่รหัสคูปองส่วนลดหรือคูปองกิจกรรมเพื่อแลกรับ Coin เข้าบัญชีทันที
            </p>
          </div>
        </div>

        <form onSubmit={handleRedeemCoupon} className="flex items-center gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-64">
            <input
              type="text"
              className="input text-sm uppercase tracking-wider font-mono font-bold w-full pr-3"
              placeholder="กรอกรหัสคูปอง"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              disabled={redeemLoading}
              aria-label="รหัสคูปองแลก Coin"
            />
          </div>
          <button
            type="submit"
            disabled={redeemLoading || !couponCode.trim()}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white shadow-md shadow-purple-600/25 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center gap-2 flex-shrink-0"
          >
            {redeemLoading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                กำลังแลก...
              </>
            ) : (
              'แลกรับ Coin'
            )}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        :global(.card) {
          background: rgba(255, 255, 255, 0.03) !important;
          border: none !important;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
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
