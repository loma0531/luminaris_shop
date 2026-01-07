import { describe, it, expect } from 'vitest'
import { CART_LIMITS, canAddToCart } from './cartLimits'

describe('cartLimits', () => {
  describe('CART_LIMITS constants', () => {
    it('has correct MAX_QUANTITY_PER_ITEM', () => {
      expect(CART_LIMITS.MAX_QUANTITY_PER_ITEM).toBe(99)
    })

    it('has correct MAX_TOTAL_QUANTITY', () => {
      expect(CART_LIMITS.MAX_TOTAL_QUANTITY).toBe(200)
    })

    it('has correct MAX_ITEM_TYPES', () => {
      expect(CART_LIMITS.MAX_ITEM_TYPES).toBe(50)
    })
  })

  describe('canAddToCart', () => {
    it('allows adding when under all limits', () => {
      const currentCart = [{ quantity: 10 }, { quantity: 5 }]
      const result = canAddToCart(currentCart, 5, 1)
      
      expect(result.allowed).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('rejects when item quantity exceeds per-item limit', () => {
      const currentCart = [{ quantity: 10 }]
      const result = canAddToCart(currentCart, 99, 1) // 99 + 1 = 100 > 99
      
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('99')
    })

    it('allows at exactly per-item limit', () => {
      const currentCart = [{ quantity: 10 }]
      const result = canAddToCart(currentCart, 98, 1) // 98 + 1 = 99 = max
      
      expect(result.allowed).toBe(true)
    })

    it('rejects when total quantity exceeds limit', () => {
      // Create cart with 195 items
      const currentCart = [
        { quantity: 50 },
        { quantity: 50 },
        { quantity: 50 },
        { quantity: 45 }
      ] // total = 195
      
      const result = canAddToCart(currentCart, 5, 10) // 195 + 10 = 205 > 200
      
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('200')
    })

    it('allows at exactly total limit', () => {
      const currentCart = [{ quantity: 195 }]
      const result = canAddToCart(currentCart, 0, 5) // 195 + 5 = 200 = max
      
      expect(result.allowed).toBe(true)
    })

    it('uses default addQuantity of 1', () => {
      const currentCart = [{ quantity: 10 }]
      const result = canAddToCart(currentCart, 98) // 98 + 1 = 99 = max
      
      expect(result.allowed).toBe(true)
    })

    it('handles empty cart', () => {
      const result = canAddToCart([], 0, 1)
      
      expect(result.allowed).toBe(true)
    })

    it('prioritizes per-item limit over total limit', () => {
      const currentCart = [{ quantity: 10 }]
      // Both limits would be exceeded, but per-item check comes first
      const result = canAddToCart(currentCart, 99, 1)
      
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('99') // per-item message
    })
  })
})
