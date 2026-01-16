declare module 'melody191-fetcher' {
  interface MelodyVoucherSuccessResult {
    ok: 'success';
    message: string;
    amount: string;
    name_owner: string;
    my_phone: string;
    code: string;
  }

  interface MelodyVoucherErrorResult {
    errorData: number;
    mes_err: string;
  }

  type MelodyVoucherResult = MelodyVoucherSuccessResult | MelodyVoucherErrorResult;

  export function Melodyshop_Voucher(
    voucherUrl: string,
    phoneNumber: string
  ): Promise<MelodyVoucherResult>;
}
