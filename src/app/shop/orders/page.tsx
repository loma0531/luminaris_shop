'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  CreditCardIcon,
  ClockIcon,
  TrashIcon,
  PackageIcon,
  UploadIcon,
  CheckCircleIcon,
  CartIcon,
  HistoryIcon,
} from '@/components/Icons'
import { useToast } from '@/context/ToastContext'
import ConfirmModal from '@/components/ConfirmModal'
import { apiFetch } from '@/lib/apiFetch'
import { useShop } from '../layout'
import { ORDER_CONFIG } from '@/lib/orderConfig'
import { logger } from '@/lib/logger'

// Paste zone ref
const pasteZoneRef = { current: null as HTMLDivElement | null }



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
  payment?: PaymentInfo
}

interface User {
  id: string
  minecraftName: string
}

export default function OrdersPage() {
  const [pendingOrder, setPendingOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [timeLeft, setTimeLeft] = useState('')
  const [step, setStep] = useState<'pending' | 'success'>('pending')
  const [user, setUser] = useState<User | null>(null)
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { updatePendingCount } = useShop()
  const hasLoadedQR = useRef(false)
  const currentUserRef = useRef<string | null>(null)
  
  // Confirm Modal State
  const [showConfirm, setShowConfirm] = useState(false)

  const fetchPendingOrder = useCallback(async (userObj: User) => {
    // Reset state for new user
    setPendingOrder(null)
    setQrCode('')
    setStep('pending')
    hasLoadedQR.current = false
    setLoading(true)

    try {
      const res = await apiFetch(`/api/orders/user?minecraftName=${encodeURIComponent(userObj.minecraftName)}&status=pending`)
      const data = await res.json()
      
      if (data.orders && data.orders.length > 0) {
        // Get the most recent pending order
        const pending = data.orders.find((o: Order) => 
          o.status === 'AWAITING_PAYMENT' || o.status === 'PENDING'
        )
        if (pending) {
          setPendingOrder(pending)
          
          // Generate QR code if not already loaded
          if (!hasLoadedQR.current) {
            hasLoadedQR.current = true
            try {
              const qrRes = await apiFetch('/api/promptpay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  amount: pending.total,
                  orderId: pending.orderId 
                }),
              })
              const qrData = await qrRes.json()
              if (qrData.success) {
                setQrCode(qrData.qrCode)
              }
            } catch (e) {
              logger.error(`Error generating QR: ${e}`)
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error fetching orders: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (!storedUser) {
      router.push('/shop')
      return
    }
    const userObj = JSON.parse(storedUser)
    
    // Check if user changed - reset everything
    if (currentUserRef.current !== userObj.minecraftName) {
      currentUserRef.current = userObj.minecraftName
      setUser(userObj)
      fetchPendingOrder(userObj)
    }
  }, [router, fetchPendingOrder])

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

  const handleSlipUpload = async (file: File) => {
    if (!file || !user || !pendingOrder || !pendingOrder.payment) return

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('amount', pendingOrder.total.toString())
      formData.append('minecraftName', user.minecraftName)
      formData.append('paymentId', pendingOrder.payment.paymentId.toString())
      formData.append('orderId', pendingOrder.orderId.toString())

      const res = await apiFetch('/api/orders/checkout', {
        method: 'PUT',
        body: formData,
      })

      const data = await res.json()

      if (data.error) {
        toastError(data.error)
        setUploading(false)
        return
      }

      // Success
      success('ชำระเงินสำเร็จ! สินค้าถูกส่งเข้าตัวแล้ว')
      setStep('success')
      updatePendingCount() // Refresh pending badge immediately
    } catch (err) {
      logger.error(`Error uploading slip: ${err}`)
      toastError('ไม่สามารถอัปโหลดสลิปได้')
    } finally {
      setUploading(false)
    }
  }

  const handleCancelOrder = async () => {
    if (!pendingOrder || !user) return
    setShowConfirm(false)

    try {
      // Auth is now handled by shopToken in header, no need for query param
      const res = await apiFetch(`/api/orders/${pendingOrder.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (data.success) {
        success('ยกเลิกรายการเรียบร้อยแล้ว')
        setPendingOrder(null)
        updatePendingCount() // Refresh pending badge
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

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleSlipUpload(file)
  }

  // Handle paste event for clipboard images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only handle paste when we're on pending order and not expired
      if (!pendingOrder || isExpired || uploading) return
      
      const items = e.clipboardData?.items
      if (!items) return
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile()
          if (file) {
            e.preventDefault()
            handleSlipUpload(file)
            break
          }
        }
      }
    }
    
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [pendingOrder, isExpired, uploading])

  return (
    <div>
      <h1 style={{ 
        fontSize: '1.5rem', 
        fontWeight: 600, 
        marginBottom: '1.5rem', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '0.5rem' 
      }}>
        <CreditCardIcon size={24} />
        รายการรอชำระเงิน
      </h1>

        {loading ? (
          <div className="card" style={{ padding: '1.5rem' }}>
            {/* Timer skeleton */}
            <div className="skeleton" style={{ width: '100%', height: 50, marginBottom: '1.5rem', borderRadius: '0.375rem' }} />
            {/* Order info skeleton */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div className="skeleton" style={{ width: 150, height: '1.25rem', marginBottom: '0.5rem' }} />
                <div className="skeleton" style={{ width: 100, height: '0.875rem' }} />
              </div>
            </div>
            {/* Items skeleton */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div className="skeleton" style={{ width: 100, height: '1rem', marginBottom: '0.75rem' }} />
              <div className="skeleton" style={{ width: '100%', height: 44, marginBottom: '0.5rem' }} />
              <div className="skeleton" style={{ width: '100%', height: 44, marginBottom: '0.5rem' }} />
            </div>
            {/* QR skeleton */}
            <div style={{ textAlign: 'center', padding: '1.5rem', background: 'var(--muted)', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
              <div className="skeleton" style={{ width: 200, height: 200, margin: '0 auto 1rem' }} />
              <div className="skeleton" style={{ width: 100, height: '1.5rem', margin: '0 auto' }} />
            </div>
            {/* Buttons skeleton */}
            <div className="skeleton" style={{ width: '100%', height: 48, marginBottom: '0.75rem' }} />
            <div className="skeleton" style={{ width: '100%', height: 40 }} />
          </div>
        ) : step === 'success' ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="success-icon">
              <CheckCircleIcon size={48} />
            </div>
            <h2 style={{ marginBottom: '0.5rem', fontSize: '1.5rem', fontWeight: 600 }}>
              ชำระเงินสำเร็จ!
            </h2>
            <p style={{ color: 'var(--muted-foreground)', marginBottom: '2rem' }}>
              ไอเทมถูกส่งไปยังตัวละครของคุณแล้ว
            </p>
            <div style={{ 
              background: 'var(--muted)', 
              padding: '1rem', 
              borderRadius: '0.5rem', 
              marginBottom: '2rem' 
            }}>
              <p>หมายเลขคำสั่งซื้อ: <strong>#{pendingOrder?.orderId}</strong></p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <Link href="/shop" className="btn btn-primary btn-lg">
                <CartIcon size={20} />
                กลับไปร้านค้า
              </Link>
              <Link href="/shop/history" className="btn btn-lg">
                <HistoryIcon size={20} />
                ดูประวัติการซื้อ
              </Link>
            </div>
          </div>
        ) : !pendingOrder ? (
          <div className="empty-state">
            <PackageIcon size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
            <p style={{ marginBottom: '1rem' }}>ไม่มีรายการรอชำระเงิน</p>
            <Link href="/shop/cart" className="btn btn-primary">
              <CartIcon size={16} />
              ไปที่ตะกร้าสินค้า
            </Link>
          </div>
        ) : (
          <div className="card">
            {/* Timer */}
            <div style={{ 
              background: isExpired ? 'rgba(255, 68, 68, 0.1)' : 'var(--primary)', 
              color: isExpired ? '#ff4444' : 'var(--primary-foreground)', 
              padding: '0.75rem', 
              borderRadius: '0.375rem',
              marginBottom: '1.5rem',
              textAlign: 'center',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}>
              <ClockIcon size={20} />
              {isExpired ? 'หมดเวลาชำระเงิน' : `เหลือเวลา ${timeLeft} นาที`}
            </div>

            {/* Order Info */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--border)'
            }}>
              <div>
                <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                  Order #{pendingOrder.orderId}
                </h2>
                <span style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                  {new Date(pendingOrder.createdAt).toLocaleString('th-TH')}
                </span>
              </div>
            </div>

            {/* Items */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ 
                fontSize: '0.875rem', 
                fontWeight: 600, 
                marginBottom: '0.75rem', 
                color: 'var(--muted-foreground)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <PackageIcon size={14} />
                รายการสินค้า
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {pendingOrder.items.map((item, idx) => (
                  <div key={idx} style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    fontSize: '0.875rem',
                    padding: '0.5rem',
                    background: 'var(--muted)',
                    borderRadius: '0.375rem',
                  }}>
                    <span>{item.name} x {item.quantity}</span>
                    <span style={{ fontWeight: 500 }}>{(item.price * item.quantity).toLocaleString()} บาท</span>
                  </div>
                ))}
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                marginTop: '1rem',
                paddingTop: '1rem',
                borderTop: '1px solid var(--border)',
                fontSize: '1.25rem',
                fontWeight: 600,
              }}>
                <span>รวมทั้งสิ้น</span>
                <span style={{ color: 'var(--primary)' }}>{pendingOrder.total.toLocaleString()} บาท</span>
              </div>
            </div>

            {/* QR Code Section */}
            {!isExpired && (
              <div style={{ 
                textAlign: 'center', 
                padding: '1.5rem',
                background: 'var(--muted)',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem',
              }}>
                <h3 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                  สแกน QR Code เพื่อชำระเงิน
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                  ต้องเป็นสลิปธนาคารที่มี QR Code ในสลิปเท่านั้น ไม่รองรับ True money
                </p>
                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                  PromptPay
                </p>
                
                {qrCode ? (
                  <div style={{
                    background: 'white',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    display: 'inline-block',
                    marginBottom: '1rem',
                  }}>
                    <Image src={qrCode} alt="PromptPay QR Code" width={200} height={200} />
                  </div>
                ) : (
                  <div style={{ padding: '2rem' }}>
                    <div className="spinner" />
                  </div>
                )}

                <p style={{ fontSize: '1.125rem', fontWeight: 600, marginTop: '0.5rem' }}>
                  {pendingOrder.total.toLocaleString()} บาท
                </p>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {!isExpired && (
              <label
                  className="btn btn-primary btn-lg"
                  style={{ 
                    width: '100%', 
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  {uploading ? (
                    <>
                      <div className="spinner" style={{ width: 16, height: 16 }} />
                      กำลังตรวจสอบสลิป...
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <UploadIcon size={20} />
                        อัปโหลดสลิปการโอนเงิน
                      </div>
                      <span style={{ fontSize: '0.75rem', opacity: 0.7, fontWeight: 400 }}>
                        หรือกด Ctrl+V เพื่อวางรูปจาก clipboard
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileInputChange}
                    style={{ display: 'none' }}
                    disabled={uploading}
                  />
                </label>
              )}
              
              <button 
                className="btn btn-danger"
                style={{ width: '100%' }}
                onClick={() => setShowConfirm(true)}
                disabled={uploading}
              >
                <TrashIcon size={16} />
                ยกเลิกรายการ
              </button>
            </div>
          </div>
        )}

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
