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
 * Verify slip by file buffer
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
    const formData = new FormData()
    formData.append('files', fileBuffer, {
      filename: 'slip.jpg',
      contentType: 'image/jpeg',
    })
    formData.append('log', 'true')
    
    if (expectedAmount) {
      formData.append('amount', expectedAmount.toString())
    }

    const url = `https://api.slipok.com/api/line/apikey/${config.branchId}`
    logger.debug(`Calling SlipOK API: ${url}`, 200)

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

/**
 * Verify a slip from a File object (for use in API routes with FormData)
 */
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
