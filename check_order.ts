import prisma from './src/lib/prisma';
async function main() {
  const order = await prisma.order.findUnique({ where: { orderId: 154 }, include: { payment: true } });
  console.log(order);
}
main();
