'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'

import { useRouter } from 'next/navigation'
import { SkeletonOrdersPage } from '@/components/Skeleton'
import {
  CreditCardIcon,
  ClockIcon,
  TrashIcon,
  PackageIcon,
  CheckCircleIcon,
  CartIcon,
  HistoryIcon,
  LinkIcon,
  QrCodeIcon,
  GiftIcon,
  WalletIcon,
} from '@/components/Icons'
import { useToast } from '@/context/ToastContext'
import ConfirmModal from '@/components/ConfirmModal'
import { apiFetch } from '@/lib/apiFetch'
import { useShop } from '../layout'
import { ORDER_CONFIG } from '@/lib/orderConfig'
import { getShopConfig } from '@/lib/config'
import { logger } from '@/lib/logger'
import { usePendingOrders, useShopInit } from '@/lib/swr-hooks'
import StripePaymentForm from '@/components/StripePaymentForm'
import PromptPayForm from '@/components/PromptPayForm'
import './orders.css'

type PaymentMethod = 'stripe' | 'promptpay' | 'truewallet' | 'coin'

interface OrderItem {
  productId: string
  name: string
  price: number
  quantity: number
}

interface PaymentInfo {
  id: string
  paymentId: number
}

interface Order {
  id: string
  orderId: number
  items: OrderItem[]
  total: number
  status: string
  createdAt: string
  isTopUp?: boolean
  payment?: PaymentInfo
}

interface User {
  id: string
  minecraftName: string
}

export default function OrdersPage() {
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null)
  const [uploading, setUploading] = useState(false)
  const [clientSecret, setClientSecret] = useState('')
  const [timeLeft, setTimeLeft] = useState('')
  const [step, setStep] = useState<'pending' | 'success'>('pending')
  const [user, setUser] = useState<User | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [voucherUrl, setVoucherUrl] = useState('')
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { updatePendingCount } = useShop()
  const hasLoadedStripe = useRef(false)
  
  // Fetch shop data including coins using SWR
  const { data: shopData } = useShopInit(user?.minecraftName || null)
  
  // Confirm Modal State
  const [showConfirm, setShowConfirm] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)

  // Load user from localStorage
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

  // Handle Stripe Redirect Status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const redirectStatus = urlParams.get('redirect_status')
      
      if (redirectStatus === 'succeeded') {
        setStep('success')
        success('ชำระเงินสำเร็จ! ไอเทมกำลังถูกจัดส่ง')
        window.history.replaceState({}, '', '/shop/orders')
      } else if (redirectStatus === 'failed' || redirectStatus === 'requires_payment_method') {
        toastError('การชำระเงินไม่สำเร็จ หรือถูกยกเลิก')
        window.history.replaceState({}, '', '/shop/orders')
      }
    }
  }, [success, toastError])

  // SWR: ดึง pending orders อัตโนมัติ (refresh ทุก 10 วินาที)
  const { data: ordersData, isLoading: loading, mutate: mutatePendingOrders } = usePendingOrders(user?.minecraftName || null)

  // Derive pending order from SWR data
  useEffect(() => {
    if (ordersData?.orders && ordersData.orders.length > 0) {
      const pending = ordersData.orders.find((o: Order) => 
        o.status === 'AWAITING_PAYMENT' || o.status === 'PENDING'
      )
      if (pending) {
        setPendingOrder(pending)
      } else {
        setPendingOrder(null)
      }
    } else if (ordersData) {
      // Data loaded but no orders
      setPendingOrder(null)
    }
  }, [ordersData])

  // Init Stripe Checkout
  const initStripeCheckout = useCallback(async () => {
    if (!pendingOrder || !pendingOrder.payment || hasLoadedStripe.current) return
    
    hasLoadedStripe.current = true
    try {
      const res = await apiFetch('/api/checkout/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          orderId: pendingOrder.orderId,
          paymentId: pendingOrder.payment.paymentId
        }),
      })
      const data = await res.json()
      if (data.clientSecret) {
        setClientSecret(data.clientSecret)
      } else if (data.error) {
        toastError(data.error)
        hasLoadedStripe.current = false
      }
    } catch (e) {
      logger.error(`Error init Stripe: ${e}`)
      toastError('เกิดข้อผิดพลาดในการโหลดช่องทางชำระเงิน')
      hasLoadedStripe.current = false
    }
  }, [pendingOrder, toastError])

  useEffect(() => {
    if (paymentMethod === 'stripe' && pendingOrder) {
      initStripeCheckout()
    }
  }, [paymentMethod, pendingOrder, initStripeCheckout])

  // Timer Effect
  useEffect(() => {
    if (!pendingOrder) return

    const interval = setInterval(() => {
      const created = new Date(pendingOrder.createdAt).getTime()
      const expires = created + ORDER_CONFIG.PAYMENT_TIMEOUT_MS
      const now = Date.now()
      const diff = expires - now

      if (diff <= 0) {
        setTimeLeft('00:00')
        clearInterval(interval)
        return
      }

      const minutes = Math.floor(diff / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
    }, 1000)

    return () => clearInterval(interval)
  }, [pendingOrder])

  // Order Status Polling (Every 3 seconds)
  useEffect(() => {
    if (!pendingOrder || step === 'success') return

    const pollInterval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/orders/${pendingOrder.id}`)
        if (res.ok) {
          const data = await res.json()
          if (data.order && data.order.status === 'COMPLETED') {
            success('ชำระเงินสำเร็จ! ไอเทมถูกส่งไปยังตัวละครแล้ว')
            setStep('success')
            updatePendingCount()
            mutatePendingOrders()
          }
        }
      } catch {
        // Ignore fetch errors during polling
      }
    }, 3000)

    return () => clearInterval(pollInterval)
  }, [pendingOrder, step, success, updatePendingCount, mutatePendingOrders])

  const handleCoinPayment = async () => {
    if (!user || !pendingOrder || !pendingOrder.payment) return

    setUploading(true)

    try {
      const res = await apiFetch('/api/checkout/coins/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: pendingOrder.orderId,
          paymentId: pendingOrder.payment.paymentId,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        toastError(data.error || 'เกิดข้อผิดพลาดในการหักเหรียญ Coin')
        setUploading(false)
        return
      }

      // Success
      success('ชำระเงินด้วย Coin สำเร็จ! ไอเทมถูกส่งไปยังตัวละครแล้ว')
      setStep('success')
      updatePendingCount()
    } catch (err) {
      logger.error(`Error with Coin payment: ${err}`)
      toastError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์')
    } finally {
      setUploading(false)
    }
  }

  const handleStripeSuccess = () => {
    success('ชำระเงินสำเร็จ! ไอเทมถูกส่งไปยังตัวละครแล้ว')
    setStep('success')
    updatePendingCount()
  }

  const handleVerifyStripePayment = async () => {
    if (!pendingOrder || !pendingOrder.payment || isVerifying) return

    setIsVerifying(true)
    try {
      const res = await apiFetch('/api/checkout/stripe/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: pendingOrder.orderId,
          paymentId: pendingOrder.payment.paymentId,
        }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        success(data.message || 'ชำระเงินสำเร็จ! ไอเทม/เหรียญถูกจัดส่งแล้ว')
        setStep('success')
        updatePendingCount()
        mutatePendingOrders()
      } else {
        toastError(data.message || data.error || 'ตรวจสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      }
    } catch (err) {
      logger.error(`Error verifying Stripe payment: ${err}`)
      toastError('เกิดข้อผิดพลาดในการตรวจสอบสถานะชำระเงิน')
    } finally {
      setIsVerifying(false)
    }
  }

  const handleTruewalletPayment = async () => {
    if (!user || !pendingOrder || !pendingOrder.payment || !voucherUrl.trim()) return

    // Validate URL format
    if (!voucherUrl.includes('gift.truemoney.com')) {
      toastError('กรุณาใส่ลิงก์ซองอั่งเปาที่ถูกต้อง')
      return
    }

    setUploading(true)

    try {
      const res = await apiFetch('/api/payments/truewallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voucherUrl: voucherUrl.trim(),
          orderId: pendingOrder.orderId,
          paymentId: pendingOrder.payment.paymentId,
          minecraftName: user.minecraftName,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        toastError(data.error || 'ไม่สามารถ redeem ซองอั่งเปาได้')
        setUploading(false)
        return
      }

      // Success
      success(`ชำระเงินสำเร็จ! ได้รับ ${data.amount} บาท`)
      setStep('success')
      updatePendingCount()
    } catch (err) {
      logger.error(`Error with Truewallet payment: ${err}`)
      toastError('เกิดข้อผิดพลาดในการชำระเงิน')
    } finally {
      setUploading(false)
    }
  }

  const handleCancelOrder = async () => {
    if (!pendingOrder || !user) return
    setShowConfirm(false)

    try {
      const res = await apiFetch(`/api/orders/${pendingOrder.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.success) {
        success('ยกเลิกรายการเรียบร้อยแล้ว')
        setPendingOrder(null)
        mutatePendingOrders()
        updatePendingCount()
        router.push('/shop/cart')
      } else {
        toastError(data.error || 'ไม่สามารถยกเลิกรายการได้')
      }
    } catch (error) {
      logger.error(`Error cancelling order: ${error}`)
      toastError('เกิดข้อผิดพลาด')
    }
  }

  const isExpired = timeLeft === '00:00'

  // ========== RENDER ==========

  // Loading skeleton
  if (loading) {
    return <SkeletonOrdersPage />
  }

  // Success state
  if (step === 'success') {
    return (
      <div className="checkout-page">
        <div className="checkout-success">
          <div className="success-icon-wrap">
            <CheckCircleIcon size={40} />
          </div>
          <h2>ชำระเงินสำเร็จ!</h2>
          <p className="success-subtitle">
            ไอเทมถูกส่งไปยังตัวละครของคุณแล้ว
          </p>
          <div className="success-order-badge">
            <PackageIcon size={16} />
            หมายเลขคำสั่งซื้อ: <strong>#{pendingOrder?.orderId}</strong>
          </div>
          <div className="success-actions">
            <Link href="/shop" className="btn btn-primary btn-lg">
              <CartIcon size={18} />
              กลับไปร้านค้า
            </Link>
            <Link href="/shop/history" className="btn btn-lg">
              <HistoryIcon size={18} />
              ดูประวัติการซื้อ
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Empty state
  if (!pendingOrder) {
    return (
      <div className="checkout-page">
        {/* <div className="checkout-header">
          <CreditCardIcon size={24} />
          <h1>รายการรอชำระเงิน</h1>
        </div> */}
        <div className="checkout-empty-container">
          <div className="checkout-empty-card">
            <div className="checkout-empty-icon-wrap">
              <PackageIcon size={44} />
            </div>
            <h3>ไม่มีรายการรอชำระเงิน</h3>
            <p>
              คุณไม่มีรายการสั่งซื้อที่ค้างชำระในขณะนี้ เลือกซื้อไอเทมสุดพิเศษหรือตรวจสอบสินค้าในตะกร้าของคุณเพื่อดำเนินการชำระเงินได้ทันที
            </p>
            <div className="checkout-empty-actions">
              <Link href="/shop" className="btn btn-primary btn-lg empty-action-primary">
                <CartIcon size={18} />
                เลือกซื้อสินค้า
              </Link>
              <Link href="/shop/cart" className="btn btn-lg empty-action-secondary">
                ดูตะกร้าสินค้า
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Main checkout view
  return (
    <div className="checkout-page">
      {/* Header */}
      <div className="checkout-header">
        <CreditCardIcon size={24} />
        <h1>รายการรอชำระเงิน</h1>
      </div>

      {/* Timer */}
      <div className={`checkout-timer ${isExpired ? 'expired' : ''}`}>
        <ClockIcon size={18} />
        {isExpired ? (
          'หมดเวลาชำระเงิน'
        ) : (
          <>
            เหลือเวลา <span className="timer-value">{timeLeft}</span> นาที
          </>
        )}
      </div>

      {/* Two-column grid */}
      <div className="checkout-grid">
        {/* LEFT — Order Summary */}
        <div className="checkout-panel order-summary">
          <div className="panel-label">สรุปคำสั่งซื้อ</div>

          <div className="order-meta">
            <h2>Order #{pendingOrder.orderId}</h2>
            <span className="order-date">
              {new Date(pendingOrder.createdAt).toLocaleString('th-TH')}
            </span>
          </div>

          <div className="order-items">
            {pendingOrder.items.map((item, idx) => (
              <div key={idx} className="order-item-row">
                <span className="item-name">{item.name} × {item.quantity}</span>
                <span className="item-price">{(item.price * item.quantity).toLocaleString()} ฿</span>
              </div>
            ))}
          </div>

          <div className="order-total">
            <span className="total-label">รวมทั้งสิ้น</span>
            <span className="total-value">{pendingOrder.total.toLocaleString()} ฿</span>
          </div>
        </div>

        {/* RIGHT — Payment */}
        <div className="checkout-panel payment-panel">
          <div className="panel-label">ช่องทางชำระเงิน</div>

          {/* เมื่อหมดเวลาชำระเงิน */}
          {isExpired && (
            <div className="stripe-section animate-scale-in" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ marginBottom: '1.5rem', color: 'var(--muted-foreground)' }}>
                <ClockIcon size={48} style={{ margin: '0 auto 1rem', opacity: 0.5, color: '#ef4444' }} />
                <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#f87171' }}>หมดเวลาชำระเงิน</h3>
                <p>คำสั่งซื้อนี้หมดเวลาชำระเงินแล้ว</p>
                <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>กรุณากดยกเลิกรายการสั่งซื้อเพื่อล้างข้อมูลและสามารถสั่งซื้อใหม่อีกครั้ง</p>
              </div>
              <button
                type="button"
                className="btn btn-primary w-full py-3 rounded-xl font-bold"
                onClick={() => setShowConfirm(true)}
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              >
                <TrashIcon size={16} className="inline mr-2" />
                ยกเลิกรายการสั่งซื้อ
              </button>
            </div>
          )}

          {/* Step 1: Method Selection */}
          {!isExpired && !paymentMethod && (() => {
            const shopConfig = getShopConfig()
            const enabledPayments = shopConfig.orders.payments

            return (
              <>
                <div className="method-grid">
                  {enabledPayments.promptpay?.enabled && (
                    <button
                      className="method-card"
                      onClick={() => setPaymentMethod('promptpay')}
                    >
                      <div className="method-logo">
                        <QrCodeIcon size={22} />
                      </div>
                      <div className="method-info">
                        <h3>พร้อมเพย์</h3>
                        <p>สแกน QR Code</p>
                      </div>
                      <div className="method-radio">
                        <div className="method-radio-dot" />
                      </div>
                    </button>
                  )}

                  {enabledPayments.creditCard?.enabled && (
                    <button
                      className="method-card"
                      onClick={() => setPaymentMethod('stripe')}
                    >
                      <div className="method-logo">
                        <CreditCardIcon size={24} />
                      </div>
                      <div className="method-info">
                        <h3>บัตรเครดิต / เดบิต</h3>
                        <p>Visa, Mastercard</p>
                      </div>
                      <div className="method-radio">
                        <div className="method-radio-dot" />
                      </div>
                    </button>
                  )}

                  {/* ชำระด้วย Coin สะสม */}
                  {!pendingOrder.isTopUp && (() => {
                    const userCoins = shopData?.coins || 0
                    const isCoinDisabled = userCoins < pendingOrder.total
                    
                    return (
                      <button
                        className={`method-card ${isCoinDisabled ? 'disabled opacity-50' : ''}`}
                        onClick={() => setPaymentMethod('coin')}
                        type="button"
                      >
                        <div className="method-logo">
                          <WalletIcon size={20} className="text-primary" />
                        </div>
                        <div className="method-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <h3>ชำระด้วย Coin สะสม</h3>
                          <p>ยอดของคุณ: {userCoins.toLocaleString()} Coin (ใช้ {pendingOrder.total.toLocaleString()} Coin)</p>
                          {isCoinDisabled && (
                            <span className="text-danger flex items-center gap-1 text-[0.7rem] mt-1" style={{ color: '#ef4444' }}>
                              ยอด Coin ไม่เพียงพอ (ขาดอีก {(pendingOrder.total - userCoins).toLocaleString()} Coin)
                            </span>
                          )}
                        </div>
                        <div className="method-radio">
                          <div className="method-radio-dot" />
                        </div>
                      </button>
                    )
                  })()}

                  {enabledPayments.truewallet?.enabled && (() => {
                    const twMinAmount = enabledPayments.truewallet.minAmount || 10
                    const isTwDisabled = pendingOrder.total < twMinAmount
                    
                    return (
                      <button
                        className={`method-card ${isTwDisabled ? 'disabled opacity-40 cursor-not-allowed' : ''}`}
                        onClick={() => !isTwDisabled && setPaymentMethod('truewallet')}
                        disabled={isTwDisabled}
                        title={isTwDisabled ? `ยอดชำระเงินต่ำกว่าขั้นต่ำ ${twMinAmount} บาท` : ''}
                        type="button"
                      >
                        <div className="method-logo">
                          <GiftIcon size={22} />
                        </div>
                        <div className="method-info" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <h3>TrueMoney</h3>
                          <p>ใช้ลิงก์ซองอั่งเปา</p>
                          {isTwDisabled && (
                            <span className="text-danger flex items-center gap-1 text-[0.7rem] mt-1" style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                              </svg>
                              ยอดชำระขั้นต่ำ {twMinAmount} บาท
                            </span>
                          )}
                        </div>
                        <div className="method-radio">
                          <div className={`method-radio-dot ${isTwDisabled ? 'bg-neutral-600' : ''}`} />
                        </div>
                      </button>
                    )
                  })()}
                </div>

                <button
                  className="cancel-btn"
                  onClick={() => setShowConfirm(true)}
                  disabled={uploading}
                >
                  <TrashIcon size={15} />
                  ยกเลิกรายการ
                </button>
              </>
            )
          })()}

          {/* Step 2a: PromptPay (Custom QR) */}
          {!isExpired && paymentMethod === 'promptpay' && pendingOrder.payment && (
            <div className="stripe-section">
              <button
                onClick={() => setPaymentMethod(null)}
                className="back-link"
              >
                ← เปลี่ยนวิธีชำระเงิน
              </button>

              <PromptPayForm
                orderId={pendingOrder.orderId}
                paymentId={pendingOrder.payment.paymentId}
                onSuccess={handleStripeSuccess}
                onError={(msg) => toastError(msg)}
              />

              <button
                className="verify-btn"
                onClick={handleVerifyStripePayment}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <>
                    <div className="verify-spinner" />
                    กำลังตรวจสอบสถานะ...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon size={16} />
                    ฉันชำระเงินแล้ว ตรวจสอบสถานะ
                  </>
                )}
              </button>

              <button
                className="cancel-btn"
                onClick={() => setShowConfirm(true)}
              >
                <TrashIcon size={15} />
                ยกเลิกรายการ
              </button>
            </div>
          )}

          {/* Step 2b: Card (Stripe PaymentElement) */}
          {!isExpired && paymentMethod === 'stripe' && (
            <div className="stripe-section">
              <button
                onClick={() => { setPaymentMethod(null); hasLoadedStripe.current = false; setClientSecret(''); }}
                className="back-link"
              >
                ← เปลี่ยนวิธีชำระเงิน
              </button>

              <div className="stripe-embed">
                {clientSecret ? (
                  <>
                    <StripePaymentForm
                      clientSecret={clientSecret}
                      amount={pendingOrder.total}
                      onSuccess={handleStripeSuccess}
                      onError={(msg) => toastError(msg)}
                    />

                    <button
                      className="verify-btn"
                      onClick={handleVerifyStripePayment}
                      disabled={isVerifying}
                    >
                      {isVerifying ? (
                        <>
                          <div className="verify-spinner" />
                          กำลังตรวจสอบสถานะ...
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon size={16} />
                          ฉันชำระเงินแล้ว ตรวจสอบสถานะ
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="stripe-loading-state">
                    <div className="spinner-ring" />
                  </div>
                )}
              </div>

              <button
                className="cancel-btn"
                onClick={() => setShowConfirm(true)}
              >
                <TrashIcon size={15} />
                ยกเลิกรายการ
              </button>
            </div>
          )}

          {/* Step 2b: Coin Payment */}
          {!isExpired && !pendingOrder.isTopUp && paymentMethod === 'coin' && (() => {
            const userCoins = shopData?.coins || 0
            const isCoinDisabled = userCoins < pendingOrder.total

            if (isCoinDisabled) {
              return (
                <div className="stripe-section animate-scale-in">
                  <button
                    onClick={() => setPaymentMethod(null)}
                    className="back-link"
                  >
                    ← เปลี่ยนวิธีชำระเงิน
                  </button>
                  <div className="alert-box error" style={{ padding: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.5rem', color: '#f87171', display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
                    <span>ยอด Coin สะสมของคุณไม่เพียงพอสำหรับการชำระเงิน กรุณาเติม Coin ก่อน</span>
                  </div>
                  <Link href="/shop/coins" className="btn btn-primary mt-4 w-full text-center py-2.5 rounded-xl flex items-center justify-center gap-2 font-semibold">
                    <WalletIcon size={16} />
                    ไปหน้าเติม Coin
                  </Link>
                </div>
              )
            }

            return (
              <div className="stripe-section animate-scale-in">
                <button
                  onClick={() => setPaymentMethod(null)}
                  className="back-link"
                >
                  ← เปลี่ยนวิธีชำระเงิน
                </button>

                <div className="tw-amount-display" style={{ background: 'rgba(var(--primary-rgb), 0.1)' }}>
                  <div className="tw-amount-label">ยอดที่ต้องชำระ (Coin)</div>
                  <div className="tw-amount-value" style={{ color: 'var(--primary)' }}>{pendingOrder.total.toLocaleString()} Coin</div>
                </div>

                <div className="mt-4 bg-muted/40 p-4 rounded-xl border border-border/30 text-sm flex flex-col gap-2">
                  <p><b>รายละเอียดการชำระเงิน:</b></p>
                  <div className="flex justify-between text-muted-foreground">
                    <span>ยอดเหรียญของคุณตอนนี้:</span>
                    <span className="font-semibold">{userCoins.toLocaleString()} Coin</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>ยอดเหรียญหลังการชำระเงิน:</span>
                    <span className="font-semibold text-success">{(userCoins - pendingOrder.total).toLocaleString()} Coin</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-primary w-full mt-6 py-3 rounded-xl font-bold"
                  onClick={handleCoinPayment}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <div className="spinner w-4 h-4 mr-2" />
                      กำลังประมวลผลการชำระเงิน...
                    </>
                  ) : (
                    `ยืนยันจ่ายด้วย Coin (${pendingOrder.total} Coin)`
                  )}
                </button>

                <button
                  className="cancel-btn"
                  onClick={() => setShowConfirm(true)}
                >
                  <TrashIcon size={15} />
                  ยกเลิกรายการ
                </button>
              </div>
            )
          })()}

          {/* Step 2b: TrueWallet */}
          {!isExpired && paymentMethod === 'truewallet' && (() => {
            const twMinAmount = getShopConfig().orders.payments.truewallet?.minAmount || 10
            const isTwDisabled = pendingOrder.total < twMinAmount

            if (isTwDisabled) {
              return (
                <div className="truewallet-section">
                  <button
                    onClick={() => { setPaymentMethod(null); setVoucherUrl(''); }}
                    className="back-link"
                  >
                    ← เปลี่ยนวิธีชำระเงิน
                  </button>
                  
                  <div className="alert-box error" style={{ padding: '1rem', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.5rem', color: '#f87171', display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>ยอดเงินของออเดอร์นี้คือ {pendingOrder.total} ฿ ซึ่งต่ำกว่าเกณฑ์ขั้นต่ำของ TrueMoney ({twMinAmount} ฿) กรุณาใช้ช่องทางการชำระเงินอื่น</span>
                  </div>
                </div>
              )
            }

            return (
              <div className="truewallet-section">
                <button
                  onClick={() => { setPaymentMethod(null); setVoucherUrl(''); }}
                  className="back-link"
                >
                  ← เปลี่ยนวิธีชำระเงิน
                </button>

                <div className="tw-amount-display">
                  <div className="tw-amount-label">ยอดที่ต้องชำระ</div>
                  <div className="tw-amount-value">{pendingOrder.total.toLocaleString()} ฿</div>
                </div>

                <div className="tw-input-group">
                  <div className="tw-icon">
                    <LinkIcon size={18} />
                  </div>
                  <input
                    type="url"
                    value={voucherUrl}
                    onChange={(e) => setVoucherUrl(e.target.value)}
                    placeholder="https://gift.truemoney.com/campaign/?v=..."
                    disabled={uploading}
                  />
                </div>

                <button
                  onClick={handleTruewalletPayment}
                  disabled={uploading || !voucherUrl.trim()}
                  className="tw-submit-btn"
                >
                  {uploading ? (
                    <>
                      <div className="spinner-ring" style={{ width: 18, height: 18, borderWidth: 2 }} />
                      กำลังตรวจสอบ...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon size={18} />
                      ยืนยันการชำระเงิน
                    </>
                  )}
                </button>
                {!uploading && (
                  <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.5rem' }}>
                    ระบบจะตรวจสอบซองอั่งเปาโดยอัตโนมัติ
                  </div>
                )}

                <button
                  className="cancel-btn"
                  onClick={() => setShowConfirm(true)}
                  disabled={uploading}
                >
                  <TrashIcon size={15} />
                  ยกเลิกรายการ
                </button>
              </div>
            )
          })()}
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirm}
        title="ต้องการยกเลิกรายการ?"
        content="รายการคำสั่งซื้อนี้จะถูกลบออกจากระบบและสินค้าจะกลับไปอยู่ในตะกร้า"
        confirmText="ยืนยันการยกเลิก"
        onConfirm={handleCancelOrder}
        onCancel={() => setShowConfirm(false)}
        isDestructive={true}
      />
    </div>
  )
}
