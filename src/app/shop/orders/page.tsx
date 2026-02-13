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
  LinkIcon,
} from '@/components/Icons'
import { useToast } from '@/context/ToastContext'
import ConfirmModal from '@/components/ConfirmModal'
import { apiFetch } from '@/lib/apiFetch'
import { useShop } from '../layout'
import { ORDER_CONFIG } from '@/lib/orderConfig'
import { logger } from '@/lib/logger'
import { usePendingOrders } from '@/lib/swr-hooks'

type PaymentMethod = 'promptpay' | 'truewallet'

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
  const [uploading, setUploading] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [timeLeft, setTimeLeft] = useState('')
  const [step, setStep] = useState<'pending' | 'success'>('pending')
  const [user, setUser] = useState<User | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [voucherUrl, setVoucherUrl] = useState('')
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const { updatePendingCount } = useShop()
  const hasLoadedQR = useRef(false)
  
  // Confirm Modal State
  const [showConfirm, setShowConfirm] = useState(false)

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

  // Load QR when PromptPay is selected
  const loadQRCode = useCallback(async () => {
    if (!pendingOrder || hasLoadedQR.current) return
    
    hasLoadedQR.current = true
    try {
      const qrRes = await apiFetch('/api/promptpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: pendingOrder.total,
          orderId: pendingOrder.orderId 
        }),
      })
      const qrData = await qrRes.json()
      if (qrData.success) {
        setQrCode(qrData.qrCode)
      }
    } catch (e) {
      logger.error(`Error generating QR: ${e}`)
    }
  }, [pendingOrder])

  useEffect(() => {
    if (paymentMethod === 'promptpay' && pendingOrder) {
      loadQRCode()
    }
  }, [paymentMethod, pendingOrder, loadQRCode])

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

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleSlipUpload(file)
  }

  // Handle paste event for clipboard images
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Only handle paste when we're on PromptPay and not expired
      if (!pendingOrder || isExpired || uploading || paymentMethod !== 'promptpay') return
      
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
  }, [pendingOrder, isExpired, uploading, paymentMethod])

  // Payment Method Selection Card Component
  const PaymentMethodCard = ({ 
    method, 
    logo, 
    title, 
    subtitle,
    color 
  }: { 
    method: PaymentMethod
    logo: string
    title: string
    subtitle: string
    color: string
  }) => (
    <button
      onClick={() => setPaymentMethod(method)}
      className={`
        relative flex items-center gap-4 p-5 rounded-2xl border-2 transition-colors duration-200
        hover:border-white/50
        ${paymentMethod === method 
          ? `border-${color} bg-gradient-to-br from-${color}/10 to-${color}/5 shadow-lg shadow-${color}/20` 
          : 'border-border bg-card'
        }
      `}
      style={{
        borderColor: paymentMethod === method ? (color === 'orange' ? '#f97316' : '#3b82f6') : undefined,
        background: paymentMethod === method 
          ? (color === 'orange' 
              ? 'linear-gradient(135deg, rgba(249,115,22,0.15) 0%, rgba(249,115,22,0.05) 100%)' 
              : 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 100%)')
          : undefined,
        boxShadow: paymentMethod === method 
          ? (color === 'orange' 
              ? '0 10px 40px rgba(249,115,22,0.2)' 
              : '0 10px 40px rgba(59,130,246,0.2)')
          : undefined,
      }}
    >
      {/* Selection Indicator */}
      <div 
        className={`
          absolute top-3 right-3 w-6 h-6 rounded-full border-2 flex items-center justify-center
          transition-all duration-300
        `}
        style={{
          borderColor: paymentMethod === method ? (color === 'orange' ? '#f97316' : '#3b82f6') : '#6b7280',
          background: paymentMethod === method ? (color === 'orange' ? '#f97316' : '#3b82f6') : 'transparent',
        }}
      >
        {paymentMethod === method && (
          <CheckCircleIcon size={14} className="text-white" />
        )}
      </div>

      {/* Logo */}
      <div className="w-16 h-16 rounded-xl overflow-hidden bg-white flex items-center justify-center shadow-md flex-shrink-0">
        <Image 
          src={logo} 
          alt={title} 
          width={48} 
          height={48} 
          className="object-contain"
        />
      </div>

      {/* Text */}
      <div className="text-left flex-1">
        <h3 className="font-bold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  )

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
            {/* Payment method skeleton */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="skeleton h-24 rounded-2xl" />
              <div className="skeleton h-24 rounded-2xl" />
            </div>
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
            <div className={`p-3 rounded-xl mb-6 text-center text-xl font-bold flex items-center justify-center gap-2 ${isExpired ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
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
                  <div key={idx} className="flex justify-between text-sm p-3 bg-muted/50 rounded-lg">
                    <span>{item.name} x {item.quantity}</span>
                    <span className="font-medium">{(item.price * item.quantity).toLocaleString()} บาท</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-4 pt-4 border-t border-border text-xl font-bold">
                <span>รวมทั้งสิ้น</span>
                <span className="text-primary">{pendingOrder.total.toLocaleString()} บาท</span>
              </div>
            </div>

            {/* Payment Method Selection */}
            {!isExpired && !paymentMethod && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4 text-center">
                  เลือกวิธีชำระเงิน
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PaymentMethodCard
                    method="promptpay"
                    logo="/promptpay-logo.png"
                    title="PromptPay"
                    subtitle="สแกน QR โอนเงินผ่านธนาคาร"
                    color="blue"
                  />
                  <PaymentMethodCard
                    method="truewallet"
                    logo="/truewallet-logo.png"
                    title="TrueMoney"
                    subtitle="ใช้ลิงก์ซองอั่งเปา"
                    color="orange"
                  />
                </div>
                <button 
                  className="btn btn-danger w-full mt-4"
                  onClick={() => setShowConfirm(true)}
                  disabled={uploading}
                >
                  <TrashIcon size={16} />
                  ยกเลิกรายการ
                </button>
              </div>
            )}

            {/* PromptPay Section */}
            {!isExpired && paymentMethod === 'promptpay' && (
              <div className="mb-6">
                {/* Back Button */}
                <button 
                  onClick={() => { setPaymentMethod(null); hasLoadedQR.current = false; setQrCode(''); }}
                  className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
                >
                  ← เปลี่ยนวิธีชำระเงิน
                </button>

                <div className="text-center p-6 bg-black rounded-2xl">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Image src="/promptpay-logo.png" alt="PromptPay" width={32} height={32} />
                    <h3 className="font-bold text-lg text-white">PromptPay</h3>
                  </div>
                  <p className="text-sm text-gray-300 mb-4">
                    สแกน QR Code เพื่อชำระเงิน
                  </p>
                  
                  {qrCode ? (
                    <div className="bg-white p-4 rounded-xl inline-block mb-4">
                      <Image src={qrCode} alt="PromptPay QR Code" width={200} height={200} />
                    </div>
                  ) : (
                    <div className="p-8">
                      <div className="spinner" />
                    </div>
                  )}

                  <p className="text-2xl font-bold text-white mt-2">
                    {pendingOrder.total.toLocaleString()} บาท
                  </p>

                  <p className="text-xs text-gray-400 mt-4">
                    ต้องเป็นสลิปธนาคารที่มี QR Code ในสลิปเท่านั้น
                  </p>
                </div>

                {/* Upload Button */}
                <label
                  className={`btn btn-primary btn-lg w-full flex-col gap-1 justify-center mt-4 ${uploading ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
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

                {/* Cancel Button - inside promptpay section */}
                <button 
                  className="btn btn-danger w-full mt-4"
                  onClick={() => setShowConfirm(true)}
                  disabled={uploading}
                >
                  <TrashIcon size={16} />
                  ยกเลิกรายการ
                </button>
              </div>
            )}

            {/* Truewallet Section */}
            {!isExpired && paymentMethod === 'truewallet' && (
              <div className="mb-6">
                {/* Back Button */}
                <button 
                  onClick={() => { setPaymentMethod(null); setVoucherUrl(''); }}
                  className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
                >
                  ← เปลี่ยนวิธีชำระเงิน
                </button>

                <div className="p-6 bg-black rounded-2xl">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Image src="/truewallet-logo.png" alt="TrueMoney" width={32} height={32} />
                    <h3 className="font-bold text-lg text-white">TrueMoney Wallet</h3>
                  </div>
                  
                  <p className="text-center text-sm text-gray-300 mb-6">
                    วางลิงก์ซองอั่งเปาด้านล่าง
                  </p>

                  <p className="text-center text-2xl font-bold text-white mb-4">
                    {pendingOrder.total.toLocaleString()} บาท
                  </p>
                  
                  {/* Voucher URL Input */}
                  <div className="relative mb-4">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-500">
                      <LinkIcon size={20} />
                    </div>
                    <input
                      type="url"
                      value={voucherUrl}
                      onChange={(e) => setVoucherUrl(e.target.value)}
                      placeholder="https://gift.truemoney.com/campaign/?v=..."
                      className="w-full pl-12 pr-4 py-4 rounded-xl bg-white/10 text-white placeholder-gray-400 focus:bg-white/20 focus:outline-none transition-colors text-sm"
                      disabled={uploading}
                    />
                  </div>

                  {/* Submit Button - styled like PromptPay upload button */}
                  <button
                    onClick={handleTruewalletPayment}
                    disabled={uploading || !voucherUrl.trim()}
                    className={`btn btn-primary btn-lg w-full flex-col gap-1 justify-center ${uploading || !voucherUrl.trim() ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                  >
                    {uploading ? (
                      <>
                        <div className="spinner w-4 h-4" />
                        กำลังตรวจสอบ...
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <CheckCircleIcon size={20} />
                          ยืนยันการชำระเงิน
                        </div>
                        <span className="text-xs opacity-70 font-normal">
                          ระบบจะตรวจสอบซองอั่งเปาโดยอัตโนมัติ
                        </span>
                      </>
                    )}
                  </button>
                  {/* Cancel Button - inside truewallet section like promptpay */}
                <button 
                  className="btn btn-danger w-full mt-4"
                  onClick={() => setShowConfirm(true)}
                  disabled={uploading}
                >
                  <TrashIcon size={16} />
                  ยกเลิกรายการ
                </button>
                </div>
              </div>
            )}
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
