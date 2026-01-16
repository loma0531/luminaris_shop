/**
 * Truewallet Voucher Redemption Library
 * ใช้สำหรับ redeem ซองอั่งเปา Truewallet
 * 
 * Implement เองโดยตรงเพราะ library มีปัญหากับ Bun
 */

export interface TruewalletRedeemResult {
  success: boolean;
  code?: string;
  ownerFullName?: string;
  amount?: number;
  error?: string;
}

/**
 * Extract voucher code จาก URL
 * รองรับ format: https://gift.truemoney.com/campaign/?v=XXXXXXXXX
 */
function extractVoucherCode(voucherUrl: string): string | null {
  // ลอง extract จาก URL parameter
  const match = voucherUrl.match(/[?&]v=([0-9A-Za-z]+)/);
  if (match && match[1]) {
    return match[1];
  }
  
  // ลองเอาโค้ดตรงๆ ถ้าไม่ใช่ URL
  const codeMatch = voucherUrl.match(/^[0-9A-Za-z]{18}$/);
  if (codeMatch) {
    return codeMatch[0];
  }
  
  return null;
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

  // Extract voucher code
  const voucherCode = extractVoucherCode(voucherUrl);
  if (!voucherCode) {
    return {
      success: false,
      error: 'รูปแบบ URL ไม่ถูกต้อง กรุณาใช้ลิงก์จาก TrueMoney Gift',
    };
  }

  console.log(`[Truewallet] Attempting redeem - Phone: ${cleanPhone.slice(0, 3)}****${cleanPhone.slice(-3)}, Code: ${voucherCode.slice(0, 5)}...`);

  try {
    // เรียก API ของ Truewoney โดยตรง
    const response = await fetch(`https://gift.truemoney.com/campaign/vouchers/${voucherCode}/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://gift.truemoney.com',
        'Referer': `https://gift.truemoney.com/campaign/?v=${voucherCode}`,
      },
      body: JSON.stringify({
        mobile: cleanPhone,
        voucher_hash: voucherCode,
      }),
    });

    const data = await response.json();
    console.log('[Truewallet] API Response:', JSON.stringify(data, null, 2));

    // ตรวจสอบผลลัพธ์
    if (data.status?.code === 'SUCCESS') {
      return {
        success: true,
        code: voucherCode,
        ownerFullName: data.data?.owner_profile?.full_name || data.data?.voucher?.full_name || 'Unknown',
        amount: parseFloat(data.data?.my_ticket?.amount_baht?.replace(/,/g, '') || data.data?.voucher?.amount_baht || '0'),
      };
    }

    // Handle error cases
    const errorCode = data.status?.code || 'UNKNOWN_ERROR';
    const errorMessage = data.status?.message || 'Unknown error';
    
    console.error(`[Truewallet] Redeem failed - Code: ${errorCode}, Message: ${errorMessage}`);
    
    // Map error codes to Thai messages
    const errorMessages: Record<string, string> = {
      'VOUCHER_OUT_OF_STOCK': 'ซองอั่งเปานี้ถูกใช้หมดแล้ว',
      'VOUCHER_EXPIRED': 'ซองอั่งเปานี้หมดอายุแล้ว',
      'VOUCHER_NOT_FOUND': 'ไม่พบซองอั่งเปานี้',
      'VOUCHER_ALREADY_REDEEMED': 'ซองอั่งเปานี้ถูกใช้งานไปแล้ว',
      'TARGET_USER_REDEEMED': 'คุณได้รับซองนี้ไปแล้ว',
      'CANNOT_GET_OWN_VOUCHER': 'ไม่สามารถรับซองของตัวเองได้',
      'INVALID_MOBILE': 'เบอร์โทรศัพท์ไม่ถูกต้อง',
      'LIMIT_EXCEEDED': 'เกินจำนวนที่สามารถรับได้',
    };
    
    return {
      success: false,
      error: errorMessages[errorCode] || `เกิดข้อผิดพลาด: ${errorMessage} (${errorCode})`,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[Truewallet] Exception:', errorMessage, err);
    
    return {
      success: false,
      error: `ไม่สามารถเชื่อมต่อกับ Truewallet ได้: ${errorMessage}`,
    };
  }
}
