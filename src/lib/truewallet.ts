/**
 * Truewallet Voucher Redemption Library
 * ใช้สำหรับ redeem ซองอั่งเปา Truewallet
 * 
 * ใช้ melody191-fetcher package เพื่อ bypass Cloudflare protection
 */
import { logger } from '@/lib/logger'

export interface TruewalletRedeemResult {
  success: boolean;
  code?: string;
  ownerFullName?: string;
  amount?: number;
  error?: string;
}

/**
 * Map error codes จาก melody191-fetcher เป็นข้อความภาษาไทย
 */
const errorMessages: Record<number, string> = {
  1000: 'ไม่สามารถรับซองของตัวเองได้',
  1001: 'ไม่พบเบอร์นี้ในระบบ TrueMoney',
  1002: 'ไม่พบซองอั่งเปาในระบบ',
  1003: 'ซองอั่งเปานี้หมดอายุแล้ว',
  1004: 'ซองอั่งเปานี้ถูกใช้งานไปแล้ว',
  1005: 'ไม่พบซองนี้ในระบบ หรือ URL ไม่ถูกต้อง',
  1006: 'เบอร์โทรศัพท์ผู้รับเงินไม่ถูกต้อง',
  [-1]: 'เกิดข้อผิดพลาดที่ไม่รู้จัก',
};

interface MelodyVoucherResult {
  ok?: string;
  amount?: string;
  name_owner?: string;
  my_phone?: string;
  code?: string;
  errorData?: number;
  mes_err?: string;
}

/**
 * Redeem Truewallet voucher จาก URL
 * @param phoneNumber เบอร์โทรศัพท์ที่เปิดใช้ Truewallet (format: 0812345678)
 * @param voucherUrl URL ซองอั่งเปา เช่น https://gift.truemoney.com/campaign/?v=xxxxx
 * @returns ผลลัพธ์การ redeem
 */
export async function redeemTruewalletVoucher(
  phoneNumber: string,
  voucherUrl: string
): Promise<TruewalletRedeemResult> {
  // Validate phone number
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    return {
      success: false,
      error: 'เบอร์โทรศัพท์ไม่ถูกต้อง',
    };
  }

  // Validate URL format
  try {
    const parsedUrl = new URL(voucherUrl)
    if (parsedUrl.hostname !== 'gift.truemoney.com') {
      return { success: false, error: 'รูปแบบ URL ไม่ถูกต้อง กรุณาใช้ลิงก์จาก TrueMoney Gift' }
    }
  } catch {
    return { success: false, error: 'รูปแบบ URL ไม่ถูกต้อง' }
  }

  logger.debug(`[Truewallet] Attempting redeem with melody191-fetcher`, 200)
  logger.debug(`[Truewallet] Phone: ${cleanPhone.slice(0, 3)}****${cleanPhone.slice(-3)}`, 200)

  try {
    // ใช้ require แทน dynamic import เพื่อหลีกเลี่ยงปัญหา Turbopack
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Melodyshop_Voucher } = require('melody191-fetcher');
    
    // ใช้ melody191-fetcher สำหรับ redeem
    const result: MelodyVoucherResult = await Melodyshop_Voucher(voucherUrl, cleanPhone);

    // ตรวจสอบผลลัพธ์สำเร็จ
    if (result.ok === 'success') {
      const amount = parseFloat(result.amount || '0') || 0;
      logger.info(`[Truewallet] Success! Amount: ${amount} THB, Owner: ${result.name_owner}`, 200);
      
      return {
        success: true,
        code: result.code || voucherUrl,
        ownerFullName: result.name_owner || 'Unknown',
        amount: amount,
      };
    }

    // Handle error cases
    const errorCode = result.errorData || -1;
    const errorMsg = result.mes_err || errorMessages[errorCode] || 'เกิดข้อผิดพลาดที่ไม่รู้จัก';
    
    logger.warn(`[Truewallet] Redeem failed - Code: ${errorCode}, Message: ${errorMsg}`, 400);
    
    return {
      success: false,
      error: errorMsg,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`[Truewallet] Exception: ${errorMessage}`, 500);
    
    return {
      success: false,
      error: `ไม่สามารถเชื่อมต่อกับ Truewallet ได้: ${errorMessage}`,
    };
  }
}
