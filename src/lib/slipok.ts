import axios from 'axios'
import FormData from 'form-data'
import { logger } from '@/lib/logger'

interface SlipVerifyResponse {
  success: boolean
  data?: {
    transRef: string
    date: string
    time: string
    sendingBank: string
    receivingBank: string
    sender: {
      displayName: string
      name: string
      proxy: {
        type: string
        value: string
      }
      account: {
        type: string
        value: string
      }
    }
    receiver: {
      displayName: string
      name: string
      proxy: {
        type: string
        value: string
      }
      account: {
        type: string
        value: string
      }
    }
    amount: number
    ref1?: string
    ref2?: string
    ref3?: string
  }
  error?: {
    code: string
    message: string
  }
}

interface SlipOKConfig {
  branchId: string
  apiKey: string
}

/**
 * Get SlipOK API configuration
 * Returns null if not properly configured
 */
function getSlipOKConfig(): SlipOKConfig | null {
  let branchId = process.env.SLIPOK_BRANCH_ID?.trim()
  const apiKey = process.env.SLIPOK_API_KEY?.trim()

  // Handle case where user provided full URL as branch ID
  if (branchId?.startsWith('http')) {
    const parts = branchId.split('/')
    branchId = parts[parts.length - 1]
  }

  if (!branchId || !apiKey) {
    return null
  }

  return { branchId, apiKey }
}

/**
 * Handle axios errors consistently
 */
function handleAxiosError(error: unknown): SlipVerifyResponse {
  if (axios.isAxiosError(error) && error.response) {
    logger.warn(`SlipOK API error: ${error.response.data?.message || 'Unknown error'}`, 400)
    return {
      success: false,
      error: {
        code: error.response.data?.code || 'UNKNOWN_ERROR',
        message: error.response.data?.message || 'Failed to verify slip',
      },
    }
  }
  
  return {
    success: false,
    error: {
      code: 'NETWORK_ERROR',
      message: 'Network error occurred while verifying slip',
    },
  }
}

/**
 * Detect content type from buffer magic bytes
 * Returns appropriate MIME type for SlipOK API
 */
function detectContentType(buffer: Buffer): { mimeType: string; extension: string } {
  // Check magic bytes for common image formats
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { mimeType: 'image/png', extension: 'png' }
  }
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { mimeType: 'image/jpeg', extension: 'jpg' }
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    // RIFF header, could be WebP
    if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return { mimeType: 'image/webp', extension: 'webp' }
    }
  }
  // Default to PNG as it's lossless and better for QR codes
  return { mimeType: 'image/png', extension: 'png' }
}

/**
 * Verify slip by file buffer
 * Preserves original image format for better QR code scanning
 */
async function verifySlipByFile(
  fileBuffer: Buffer,
  expectedAmount?: number
): Promise<SlipVerifyResponse> {
  const config = getSlipOKConfig()
  
  if (!config) {
    return {
      success: false,
      error: {
        code: 'CONFIG_ERROR',
        message: 'SlipOK API credentials not configured',
      },
    }
  }

  try {
    // Detect original content type - DON'T convert to JPEG as it loses QR quality
    const { mimeType, extension } = detectContentType(fileBuffer)
    
    const formData = new FormData()
    formData.append('files', fileBuffer, {
      filename: `slip.${extension}`,
      contentType: mimeType,
    })
    formData.append('log', 'true')
    
    if (expectedAmount) {
      formData.append('amount', expectedAmount.toString())
    }

    const url = `https://api.slipok.com/api/line/apikey/${config.branchId}`
    logger.debug(`Calling SlipOK API: ${url} (${mimeType}, ${fileBuffer.length} bytes)`, 200)

    const response = await axios.post(
      url,
      formData,
      {
        headers: {
          'x-authorization': config.apiKey,
          ...formData.getHeaders(),
        },
      }
    )

    return {
      success: true,
      data: response.data.data,
    }
  } catch (error) {
    return handleAxiosError(error)
  }
}

export async function verifySlip(
  file: File,
  expectedAmount?: number
): Promise<SlipVerifyResponse> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return verifySlipByFile(buffer, expectedAmount)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Error processing slip file: ${errorMessage}`, 500)
    return {
      success: false,
      error: {
        code: 'FILE_ERROR',
        message: 'Failed to process slip file',
      },
    }
  }
}

// Export the SlipData type for use in other modules
export type SlipData = NonNullable<SlipVerifyResponse['data']>

/**
 * Validate that the slip's ref1 matches the expected order ID
 * This ensures the slip was generated from scanning our QR code
 */
export function validateSlipRef1(
  slipData: SlipData,
  expectedOrderId: string | number
): { valid: boolean; error?: string; slipRef1?: string } {
  const slipRef1 = slipData.ref1?.trim()
  const expectedRef1 = String(expectedOrderId).trim()

  // If no ref1 in slip, it might be from a personal PromptPay transfer
  if (!slipRef1) {
    return {
      valid: false,
      error: 'สลิปนี้ไม่มี Reference Number (ไม่ได้สแกนจาก QR ของร้าน)',
      slipRef1: undefined,
    }
  }

  // Check if ref1 matches order ID
  if (slipRef1 !== expectedRef1) {
    return {
      valid: false,
      error: `Reference ไม่ตรงกับ Order (คาดหวัง: ${expectedRef1}, สลิป: ${slipRef1})`,
      slipRef1,
    }
  }

  return { valid: true, slipRef1 }
}

/**
 * Validate that the slip's receiver matches our PromptPay ID
 * This ensures money was sent to our account
 */
export function validateSlipReceiver(
  slipData: SlipData,
  expectedPromptPayId?: string
): { valid: boolean; error?: string } {
  const promptPayId = expectedPromptPayId || process.env.PROMPTPAY_ID
  
  if (!promptPayId) {
    // If no PromptPay ID configured, skip receiver validation
    logger.warn('PROMPTPAY_ID not configured, skipping receiver validation', 200)
    return { valid: true }
  }

  // Get receiver info - could be in proxy.value or account.value
  const receiverProxyValue = slipData.receiver?.proxy?.value?.replace(/-/g, '') || ''
  const receiverAccountValue = slipData.receiver?.account?.value?.replace(/-/g, '') || ''
  const normalizedPromptPayId = promptPayId.replace(/-/g, '')

  // Check if the receiver matches our PromptPay ID (phone or national ID)
  const matchesProxy = receiverProxyValue.includes(normalizedPromptPayId) || 
                       normalizedPromptPayId.includes(receiverProxyValue)
  const matchesAccount = receiverAccountValue.includes(normalizedPromptPayId) || 
                         normalizedPromptPayId.includes(receiverAccountValue)

  if (!matchesProxy && !matchesAccount && receiverProxyValue && receiverAccountValue) {
    logger.security.suspiciousActivity(
      `Receiver mismatch - Expected: ${normalizedPromptPayId}, Got proxy: ${receiverProxyValue}, account: ${receiverAccountValue}`,
      'unknown'
    )
    return {
      valid: false,
      error: 'สลิปนี้ไม่ได้โอนมายังบัญชีของร้าน',
    }
  }

  return { valid: true }
}

