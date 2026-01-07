import generatePayload from 'promptpay-qr'
import QRCode from 'qrcode'

export interface PromptPayQROptions {
  amount?: number
  promptPayId?: string
  refNo?: string
}

export function generatePromptPayPayload(options: PromptPayQROptions = {}): string {
  const promptPayId = options.promptPayId || process.env.PROMPTPAY_ID || ''
  
  if (!promptPayId) {
    throw new Error('PromptPay ID is not configured')
  }

  const payloadOptions: { amount?: number; ref1?: string } = {}
  
  if (options.amount && options.amount > 0) {
    payloadOptions.amount = options.amount
  }

  // Use Order ID as Ref1 if provided (only works if library supports it/Bill Payment structure, 
  // but passing it for attempt)
  if (options.refNo) {
    payloadOptions.ref1 = options.refNo
  }
  
  // Generate payload
  return generatePayload(promptPayId, payloadOptions)
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
