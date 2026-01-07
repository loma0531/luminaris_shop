import { describe, it, expect } from 'vitest'
import { MinecraftNameSchema, ObjectIdSchema, CheckoutSchema } from '@/lib/schemas'

describe('Validation Schemas', () => {
  describe('MinecraftNameSchema', () => {
    it('validates correct names', () => {
      expect(MinecraftNameSchema.safeParse('Loma').success).toBe(true)
      expect(MinecraftNameSchema.safeParse('Steve_123').success).toBe(true)
      expect(MinecraftNameSchema.safeParse('BR_Player').success).toBe(true)
    })

    it('rejects invalid names', () => {
      expect(MinecraftNameSchema.safeParse('A').success).toBe(false) // Too short
      expect(MinecraftNameSchema.safeParse('ThisNameIsWayTooLongForMinecraft').success).toBe(false)
      expect(MinecraftNameSchema.safeParse('Invalid@Name').success).toBe(false)
    })
  })

  describe('ObjectIdSchema', () => {
    it('validates correct MongoDB IDs', () => {
      expect(ObjectIdSchema.safeParse('507f1f77bcf86cd799439011').success).toBe(true)
    })

    it('rejects invalid IDs', () => {
      expect(ObjectIdSchema.safeParse('invalid-id').success).toBe(false)
    })
  })

  describe('CheckoutSchema', () => {
    it('validates a correct order', () => {
      const validOrder = {
        minecraftName: 'Loma',
        action: 'create',
        total: 100,
        items: [
          {
            productId: '507f1f77bcf86cd799439011',
            name: 'Diamond',
            price: 50,
            quantity: 2,
            commands: ['give Loma diamond 2']
          }
        ],
        sessionId: '12345678901234567890123456789012',
        csrfToken: '1234567890123456789012345678901212345678901234567890123456789012'
      }
      const result = CheckoutSchema.safeParse(validOrder)
      expect(result.success).toBe(true)
    })

    it('rejects orders with invalid specificities', () => {
        const invalidOrder = {
            minecraftName: 'Lo', // Too short
            action: 'create',
            total: -10, // Negative total
            items: []
        }
        const result = CheckoutSchema.safeParse(invalidOrder)
        expect(result.success).toBe(false)
    })
  })
})
