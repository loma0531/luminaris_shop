'use client'

/**
 * StripePaymentForm
 * Embedded Payment Element สำหรับบัตรเครดิต/เดบิตเท่านั้น
 * PromptPay ถูกแยกไปใช้ PromptPayForm component แทน
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js'
import { CreditCardIcon } from '@/components/Icons'

// Lazy load Stripe.js
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
)

// =============================================
// Inner Form Component
// =============================================

interface PaymentFormProps {
  amount: number
  onSuccess: () => void
  onError: (message: string) => void
}

function PaymentForm({ amount, onSuccess, onError }: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [ready, setReady] = useState(false)

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) return

    setProcessing(true)

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/shop/orders`,
          payment_method_data: {
            billing_details: {
              address: {
                country: 'TH',
              },
            },
          },
        },
        redirect: 'if_required',
      })

      if (error) {
        if (error.type === 'validation_error' || error.type === 'card_error') {
          onError(error.message || 'การชำระเงินล้มเหลว')
        }
        setProcessing(false)
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess()
      } else {
        setProcessing(false)
      }
    } catch {
      onError('เกิดข้อผิดพลาด กรุณาลองใหม่')
      setProcessing(false)
    }
  }, [stripe, elements, onSuccess, onError])

  return (
    <form onSubmit={handleSubmit} className="stripe-payment-form">
      <div className="payment-element-wrapper">
        <PaymentElement
          onReady={() => setReady(true)}
          options={{
            layout: 'tabs',
            fields: {
              billingDetails: {
                address: {
                  country: 'never',
                },
              },
            },
            wallets: {
              applePay: 'auto',
              googlePay: 'auto'
            }
          }}
        />
      </div>

      {ready && (
        <button
          type="submit"
          disabled={!stripe || processing}
          className="stripe-submit-btn"
        >
          {processing ? (
            <span className="btn-loading">
              <span className="spinner" />
              กำลังดำเนินการ...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <CreditCardIcon size={20} />
              ชำระเงิน {amount.toLocaleString()}฿
            </span>
          )}
        </button>
      )}

      {!ready && (
        <div className="stripe-loading">
          <div className="stripe-loading-spinner" />
        </div>
      )}

      <style jsx>{`
        .stripe-payment-form {
          width: 100%;
        }

        .payment-element-wrapper {
          margin-bottom: 16px;
        }

        .stripe-submit-btn {
          width: 100%;
          padding: 14px 24px;
          background: #ffffff;
          color: #000000;
          border: none;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .stripe-submit-btn:hover:not(:disabled) {
          background: #e5e5e5;
        }

        .stripe-submit-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-loading {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(0, 0, 0, 0.15);
          border-top-color: #000;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        .stripe-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3rem;
        }

        .stripe-loading-spinner {
          width: 28px;
          height: 28px;
          border: 2.5px solid rgba(255, 255, 255, 0.1);
          border-top-color: rgba(255, 255, 255, 0.6);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </form>
  )
}

// =============================================
// Main Component (Wrapper with Elements provider)
// =============================================

interface StripePaymentFormProps {
  clientSecret: string
  amount: number
  onSuccess: () => void
  onError: (message: string) => void
}

export default function StripePaymentForm({
  clientSecret,
  amount,
  onSuccess,
  onError,
}: StripePaymentFormProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'night',
      variables: {
        colorPrimary: '#ffffff',
        colorBackground: '#060607',
        colorText: '#ffffff',
        colorDanger: '#ef4444',
        fontFamily: 'Inter, system-ui, sans-serif',
        borderRadius: '8px',
        spacingUnit: '4px',
      },
      rules: {
        '.Input': {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#ffffff',
          padding: '12px',
          fontSize: '14px',
        },
        '.Input:focus': {
          borderColor: 'rgba(255, 255, 255, 0.4)',
          boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.08)',
        },
        '.Label': {
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '13px',
          fontWeight: '500',
        },
        '.Tab': {
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          color: 'rgba(255, 255, 255, 0.4)',
        },
        '.Tab--selected': {
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          borderColor: 'rgba(255, 255, 255, 0.25)',
          color: '#ffffff',
        },
        '.Tab:hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          color: 'rgba(255, 255, 255, 0.7)',
        },
        '.Block': {
          backgroundColor: 'transparent',
          border: 'none',
        },
      },
    },
    locale: 'th',
  }

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentForm
        amount={amount}
        onSuccess={onSuccess}
        onError={onError}
      />
    </Elements>
  )
}
