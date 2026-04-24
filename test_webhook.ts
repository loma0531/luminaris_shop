import { PaymentService } from './src/core/services/PaymentService';
async function main() {
  try {
    await PaymentService.handleStripeWebhook({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_3TPT8z5LmrdWZ6KZ0rdeoWoj',
          metadata: { orderId: '154', paymentId: '154' },
          status: 'succeeded'
        }
      }
    });
    console.log("SUCCESS");
  } catch(e) {
    console.error("ERROR:", e);
  }
}
main();
