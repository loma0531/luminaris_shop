import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'

export interface PromptPayQROptions {
  amount?: number
  promptPayId?: string
  orderId?: string  // Kept for reference but PromptPay doesn't support ref1
}

/**
 * Generate PromptPay QR payload
 * Note: Standard PromptPay (phone/national ID) does NOT support ref1/ref2
 * We verify payment by checking the receiver matches our PromptPay ID
 */
export function generatePromptPayPayload(options: PromptPayQROptions = {}): string {
  const promptPayId = options.promptPayId || process.env.PROMPTPAY_ID || ''
  
  if (!promptPayId) {
    throw new Error('PromptPay ID is not configured')
  }

  // Generate payload - amount is optional
  if (options.amount && options.amount > 0) {
    return generatePayload(promptPayId, { amount: options.amount })
  }
  
  return generatePayload(promptPayId, {})
}

export async function generatePromptPayQRCode(options: PromptPayQROptions = {}): Promise<string> {
  const payload = generatePromptPayPayload(options)
  
  // Generate QR code as base64 data URL
  const qrCodeDataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  })
  
  return qrCodeDataUrl
}

export async function generatePromptPayQRCodeBuffer(options: PromptPayQROptions = {}): Promise<Buffer> {
  const payload = generatePromptPayPayload(options)
  
  // Generate QR code as buffer
  const buffer = await QRCode.toBuffer(payload, {
    errorCorrectionLevel: 'M',
    type: 'png',
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
  })
  
  return buffer
}
