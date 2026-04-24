/**
 * Stripe Server SDK Instance
 * Singleton สำหรับใช้งาน Stripe API ฝั่ง Server
 */

import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey || secretKey === 'sk_test_REPLACE_ME') {
      throw new Error(
        'STRIPE_SECRET_KEY is not configured. Set it in .env file.'
      )
    }

    stripeInstance = new Stripe(secretKey, {
      typescript: true,
    })
  }
  return stripeInstance
}

export default getStripe
