'use client'

/**
 * PromptPayForm
 * Custom PromptPay QR — ไม่ใช้ Stripe PaymentElement
 * แสดง QR inline (พื้นดำ QR ขาว) + poll สถานะอัตโนมัติ
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { logger } from '@/lib/logger'

interface PromptPayFormProps {
  orderId: number
  paymentId: number
  amount: number
  onSuccess: () => void
  onError: (message: string) => void
}

export default function PromptPayForm({
  orderId,
  paymentId,
  amount,
  onSuccess,
  onError,
}: PromptPayFormProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const hasFetched = useRef(false)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Poll สถานะ payment ผ่าน Stripe
  const startPolling = useCallback((secret: string) => {
    if (pollRef.current) return

    // Dynamic import loadStripe เพื่อ poll
    import('@stripe/stripe-js').then(({ loadStripe }) => {
      loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!).then((stripe) => {
        if (!stripe) return

        pollRef.current = setInterval(async () => {
          try {
            const { paymentIntent } = await stripe.retrievePaymentIntent(secret)
            if (paymentIntent?.status === 'succeeded') {
              if (pollRef.current) clearInterval(pollRef.current)
              pollRef.current = null
              onSuccess()
            }
          } catch {
            // Ignore polling errors
          }
        }, 3000)
      })
    })
  }, [onSuccess])

  // สร้าง QR Code อัตโนมัติเมื่อ component mount
  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    const generateQR = async () => {
      setLoading(true)
      try {
        const res = await apiFetch('/api/checkout/stripe/promptpay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, paymentId }),
        })

        const data = await res.json()

        if (data.qrCodeUrl) {
          setQrCodeUrl(data.qrCodeUrl)
          setClientSecret(data.clientSecret)
          if (data.clientSecret) {
            startPolling(data.clientSecret)
          }
        } else {
          onError(data.error || 'ไม่สามารถสร้าง QR Code ได้')
        }
      } catch (err) {
        logger.error(`PromptPay QR error: ${err}`)
        onError('เกิดข้อผิดพลาดในการสร้าง QR Code')
      } finally {
        setLoading(false)
      }
    }

    generateQR()
  }, [orderId, paymentId, onError, startPolling])

  return (
    <div className="promptpay-form">
      {loading && (
        <div className="promptpay-loading">
          <div className="promptpay-spinner" />
        </div>
      )}

      {qrCodeUrl && (
        <div className="promptpay-qr-container">
          <img
            src={qrCodeUrl}
            alt="PromptPay QR"
            className="promptpay-qr-image"
          />
        </div>
      )}

      <style jsx>{`
        .promptpay-form {
          width: 100%;
        }

        .promptpay-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3rem;
        }

        .promptpay-spinner {
          width: 28px;
          height: 28px;
          border: 2.5px solid rgba(255, 255, 255, 0.1);
          border-top-color: rgba(255, 255, 255, 0.6);
          border-radius: 50%;
          animation: promptpay-spin 0.7s linear infinite;
        }

        .promptpay-qr-container {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          background: #0a0a0a;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .promptpay-qr-image {
          width: 100%;
          max-width: 260px;
          height: auto;
          filter: invert(1);
        }

        @keyframes promptpay-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
