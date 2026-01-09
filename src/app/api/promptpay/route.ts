import { NextRequest, NextResponse } from 'next/server'
import { generatePromptPayQRCode } from '@/lib/promptpay'
import { logger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount, orderId } = body

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Valid amount is required' },
        { status: 400 }
      )
    }

    const qrCodeDataUrl = await generatePromptPayQRCode({ 
      amount,
      orderId: orderId ? String(orderId) : undefined 
    })
    
    return NextResponse.json({
      success: true,
      qrCode: qrCodeDataUrl,
      amount,
    })
  } catch (error) {
    logger.system.error(`PromptPay QR error: ${error}`)
    return NextResponse.json(
      { success: false, error: 'Failed to generate QR code' },
      { status: 500 }
    )
  }
}
