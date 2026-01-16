import { logger } from '@/lib/logger'

interface PurchaseLogData {
  orderId: number
  minecraftName: string
  amount: number
  items: Array<{
    name: string
    quantity: number
    price: number
  }>
  transRef?: string
  ref1?: string
  slipBuffer?: Buffer
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL'
  paymentMethod?: 'promptpay' | 'truewallet' // เพิ่มช่องทางชำระเงิน
}

interface DiscordEmbed {
  title: string
  description?: string
  color: number
  fields: Array<{
    name: string
    value: string
    inline?: boolean
  }>
  thumbnail?: { url: string }
  image?: { url: string }
  timestamp?: string
  footer?: { text: string }
}

interface DiscordWebhookPayload {
  content?: string
  embeds?: DiscordEmbed[]
  username?: string
  avatar_url?: string
}

const COLORS = {
  SUCCESS: 0x00ff00,  // Green
  FAILED: 0xff0000,   // Red
  PARTIAL: 0xffaa00,  // Orange
  INFO: 0x0099ff,     // Blue
}

/**
 * Send a purchase log to Discord webhook
 */
export async function sendPurchaseLog(data: PurchaseLogData): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  
  if (!webhookUrl) {
    logger.warn('Discord webhook URL not configured, skipping notification', 200)
    return false
  }

  try {
    // Build items list
    const itemsList = data.items
      .map(item => `• ${item.name} x${item.quantity} (${item.price.toLocaleString()}฿)`)
      .join('\n')

    // Build embed
    const embed: DiscordEmbed = {
      title: `🛒 คำสั่งซื้อ #${data.orderId}`,
      color: COLORS[data.status],
      fields: [
        {
          name: '👤 ผู้เล่น',
          value: `\`${data.minecraftName}\``,
          inline: true,
        },
        {
          name: '💰 ยอดเงิน',
          value: `**${data.amount.toLocaleString()}฿**`,
          inline: true,
        },
        {
          name: '📊 สถานะ',
          value: data.status === 'SUCCESS' ? '✅ สำเร็จ' : 
                 data.status === 'FAILED' ? '❌ ล้มเหลว' : '⚠️ บางส่วน',
          inline: true,
        },
        {
          name: '📦 รายการสินค้า',
          value: itemsList || 'ไม่มีรายการ',
          inline: false,
        },
        {
          name: '💳 ช่องทาง',
          value: '🔵 PromptPay',
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Luminaris Shop',
      },
    }

    // Add transaction reference if available
    if (data.transRef) {
      embed.fields.push({
        name: '🔗 Transaction Ref',
        value: `\`${data.transRef}\``,
        inline: true,
      })
    }

    const payload: DiscordWebhookPayload = {
      username: 'Luminaris Shop',
      embeds: [embed],
    }

    // If we have a slip image, we need to send as multipart/form-data
    if (data.slipBuffer) {
      const formData = new FormData()
      formData.append('payload_json', JSON.stringify(payload))
      formData.append('file', new Blob([new Uint8Array(data.slipBuffer)], { type: 'image/jpeg' }), 'slip.jpg')

      const response = await fetch(webhookUrl, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        logger.warn(`Discord webhook failed: ${response.status} ${response.statusText}`, response.status)
        return false
      }
    } else {
      // Send as JSON if no image
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        logger.warn(`Discord webhook failed: ${response.status} ${response.statusText}`, response.status)
        return false
      }
    }

    logger.info(`Discord notification sent for order #${data.orderId}`, 200)
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Discord webhook error: ${errorMessage}`, 500)
    return false
  }
}

/**
 * Send a security alert to Discord
 */
export async function sendSecurityAlert(
  type: 'DUPLICATE_SLIP' | 'WRONG_RECEIVER' | 'REF_MISMATCH' | 'AMOUNT_MISMATCH',
  details: {
    orderId?: number
    minecraftName: string
    message: string
    transRef?: string
  }
): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  
  if (!webhookUrl) {
    return false
  }

  try {
    const alertTitles = {
      DUPLICATE_SLIP: '🚨 พบสลิปซ้ำ!',
      WRONG_RECEIVER: '🚨 โอนผิดบัญชี!',
      REF_MISMATCH: '🚨 Ref ไม่ตรง!',
      AMOUNT_MISMATCH: '🚨 ยอดเงินไม่ตรง!',
    }

    const embed: DiscordEmbed = {
      title: alertTitles[type],
      description: details.message,
      color: COLORS.FAILED,
      fields: [
        {
          name: '👤 ผู้เล่น',
          value: `\`${details.minecraftName}\``,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: '⚠️ Security Alert',
      },
    }

    if (details.orderId) {
      embed.fields.push({
        name: '📦 Order ID',
        value: `#${details.orderId}`,
        inline: true,
      })
    }

    if (details.transRef) {
      embed.fields.push({
        name: '🔗 Transaction Ref',
        value: `\`${details.transRef}\``,
        inline: true,
      })
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Luminaris Security',
        embeds: [embed],
      }),
    })

    return response.ok
  } catch {
    return false
  }
}

/**
 * Truewallet payment log data
 */
interface TruewalletLogData {
  orderId: number
  minecraftName: string
  amount: number
  voucherUrl: string
  voucherCode?: string
  ownerFullName?: string
  items: Array<{
    name: string
    quantity: number
    price: number
  }>
  status: 'SUCCESS' | 'FAILED'
  errorMessage?: string
}

/**
 * Send a Truewallet payment log to Discord webhook
 */
export async function sendTruewalletLog(data: TruewalletLogData): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  
  if (!webhookUrl) {
    logger.warn('Discord webhook URL not configured, skipping notification', 200)
    return false
  }

  try {
    // Build items list
    const itemsList = data.items
      .map(item => `• ${item.name} x${item.quantity} (${item.price.toLocaleString()}฿)`)
      .join('\n')

    // Build embed based on status
    const embed: DiscordEmbed = {
      title: `🛒 คำสั่งซื้อ #${data.orderId}`,
      color: data.status === 'SUCCESS' ? 0xf97316 : COLORS.FAILED, // Orange for Truewallet
      fields: [
        {
          name: '👤 ผู้เล่น',
          value: `\`${data.minecraftName}\``,
          inline: true,
        },
        {
          name: '💰 ยอดเงิน',
          value: `**${data.amount.toLocaleString()}฿**`,
          inline: true,
        },
        {
          name: '📊 สถานะ',
          value: data.status === 'SUCCESS' ? '✅ สำเร็จ' : '❌ ล้มเหลว',
          inline: true,
        },
        {
          name: '📦 รายการสินค้า',
          value: itemsList || 'ไม่มีรายการ',
          inline: false,
        },
        {
          name: '💳 ช่องทาง',
          value: '🟠 TrueMoney',
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'Luminaris Shop',
      },
    }

    // Add voucher code
    if (data.voucherCode) {
      embed.fields.push({
        name: '🔑 รหัสซอง',
        value: `\`${data.voucherCode}\``,
        inline: true,
      })
    }

    // Add voucher URL for verification
    embed.fields.push({
      name: '🔗 ลิงก์ซอง',
      value: `[คลิกเพื่อตรวจสอบ](${data.voucherUrl})`,
      inline: false,
    })

    // Add owner name if available
    if (data.ownerFullName) {
      embed.fields.push({
        name: '🎁 ผู้ให้ซอง',
        value: data.ownerFullName,
        inline: true,
      })
    }

    // Add error message if failed
    if (data.status === 'FAILED' && data.errorMessage) {
      embed.fields.push({
        name: '⚠️ สาเหตุ',
        value: data.errorMessage,
        inline: false,
      })
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Luminaris Shop - TrueMoney',
        embeds: [embed],
      }),
    })

    if (!response.ok) {
      logger.warn(`Discord webhook failed: ${response.status} ${response.statusText}`, response.status)
      return false
    }

    logger.info(`Discord TrueMoney notification sent for order #${data.orderId}`, 200)
    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`Discord webhook error: ${errorMessage}`, 500)
    return false
  }
}
