
import prisma from '@/lib/prisma'

export async function getNextSequence(counterName: string): Promise<number> {
  const counter = await prisma.counter.upsert({
    where: { name: counterName },
    update: {
      seq: {
        increment: 1,
      },
    },
    create: {
      name: counterName,
      seq: 1,
    },
  })

  return counter.seq
}
