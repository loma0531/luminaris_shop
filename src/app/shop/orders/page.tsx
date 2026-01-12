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
      <h1 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <CreditCardIcon size={24} />
        รายการรอชำระเงิน
      </h1>

        {loading ? (
          <div className="card p-6">
            {/* Timer skeleton */}
            <div className="skeleton w-full h-[50px] mb-6 rounded-md" />
            {/* Order info skeleton */}
            <div className="flex justify-between mb-4 pb-4 border-b border-border">
              <div>
                <div className="skeleton w-[150px] h-5 mb-2" />
                <div className="skeleton w-[100px] h-3.5" />
              </div>
            </div>
            {/* Items skeleton */}
            <div className="mb-6">
              <div className="skeleton w-[100px] h-4 mb-3" />
              <div className="skeleton w-full h-11 mb-2" />
              <div className="skeleton w-full h-11 mb-2" />
            </div>
            {/* QR skeleton */}
            <div className="text-center p-6 bg-muted rounded-lg mb-6">
              <div className="skeleton w-[200px] h-[200px] mx-auto mb-4" />
              <div className="skeleton w-[100px] h-6 mx-auto" />
            </div>
            {/* Buttons skeleton */}
            <div className="skeleton w-full h-12 mb-3" />
            <div className="skeleton w-full h-10" />
          </div>
        ) : step === 'success' ? (
          <div className="card text-center">
            <div className="success-icon">
              <CheckCircleIcon size={48} />
            </div>
            <h2 className="mb-2 text-2xl font-semibold">
              ชำระเงินสำเร็จ!
            </h2>
            <p className="text-muted-foreground mb-8">
              ไอเทมถูกส่งไปยังตัวละครของคุณแล้ว
            </p>
            <div className="bg-muted p-4 rounded-lg mb-8">
              <p>หมายเลขคำสั่งซื้อ: <strong>#{pendingOrder?.orderId}</strong></p>
            </div>
            <div className="flex gap-4 justify-center">
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
            <PackageIcon size={48} className="opacity-50 mb-4" />
            <p className="mb-4">ไม่มีรายการรอชำระเงิน</p>
            <Link href="/shop/cart" className="btn btn-primary">
              <CartIcon size={16} />
              ไปที่ตะกร้าสินค้า
            </Link>
          </div>
        ) : (
          <div className="card">
            {/* Timer */}
            <div className={`p-3 rounded-md mb-6 text-center text-xl font-bold flex items-center justify-center gap-2 ${isExpired ? 'bg-red-500/10 text-red-500' : 'bg-primary text-primary-foreground'}`}>
              <ClockIcon size={20} />
              {isExpired ? 'หมดเวลาชำระเงิน' : `เหลือเวลา ${timeLeft} นาที`}
            </div>

            {/* Order Info */}
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-border">
              <div>
                <h2 className="text-lg font-semibold">
                  Order #{pendingOrder.orderId}
                </h2>
                <span className="text-sm text-muted-foreground">
                  {new Date(pendingOrder.createdAt).toLocaleString('th-TH')}
                </span>
              </div>
            </div>

            {/* Items */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground flex items-center gap-2">
                <PackageIcon size={14} />
                รายการสินค้า
              </h3>
              <div className="flex flex-col gap-2">
                {pendingOrder.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm p-2 bg-muted rounded-md">
                    <span>{item.name} x {item.quantity}</span>
                    <span className="font-medium">{(item.price * item.quantity).toLocaleString()} บาท</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-4 pt-4 border-t border-border text-xl font-semibold">
                <span>รวมทั้งสิ้น</span>
                <span className="text-primary">{pendingOrder.total.toLocaleString()} บาท</span>
              </div>
            </div>

            {/* QR Code Section */}
            {!isExpired && (
              <div className="text-center p-6 bg-muted rounded-lg mb-6">
                <h3 className="font-semibold mb-2">
                  สแกน QR Code เพื่อชำระเงิน
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  ต้องเป็นสลิปธนาคารที่มี QR Code ในสลิปเท่านั้น ไม่รองรับ True money
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  PromptPay
                </p>
                
                {qrCode ? (
                  <div className="bg-white p-4 rounded-lg inline-block mb-4">
                    <Image src={qrCode} alt="PromptPay QR Code" width={200} height={200} />
                  </div>
                ) : (
                  <div className="p-8">
                    <div className="spinner" />
                  </div>
                )}

                <p className="text-lg font-semibold mt-2">
                  {pendingOrder.total.toLocaleString()} บาท
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {!isExpired && (
              <label
                  className={`btn btn-primary btn-lg w-full flex-col gap-1 justify-center ${uploading ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {uploading ? (
                    <>
                      <div className="spinner w-4 h-4" />
                      กำลังตรวจสอบสลิป...
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <UploadIcon size={20} />
                        อัปโหลดสลิปการโอนเงิน
                      </div>
                      <span className="text-xs opacity-70 font-normal">
                        หรือกด Ctrl+V เพื่อวางรูปจาก clipboard
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileInputChange}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              )}
              
              <button 
                className="btn btn-danger w-full"
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
