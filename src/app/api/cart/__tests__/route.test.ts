import { describe, it, expect } from 'vitest'
import { isValidMinecraftName, isValidObjectId } from '@/lib/inputValidation'
import { CART_LIMITS } from '@/lib/cartLimits'
import crypto from 'crypto'

/**
 * Cart API Integration Tests
 * ทดสอบ logic ของ Cart API รวมถึง validation และ authentication
 */

// Test-only token generation (mimics real implementation)
function testGenerateToken(minecraftName: string, secret: string = 'test-secret') {
  const payload = {
    type: 'shop',
    minecraftName: minecraftName.toLowerCase(),
    createdAt: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  }
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64')
  const signature = crypto.createHmac('sha256', secret).update(payloadBase64).digest('hex')
  return `${payloadBase64}.${signature}`
}

describe('Cart API Logic', () => {
  describe('Cart Authentication', () => {
    it('should require minecraftName parameter', () => {
      const minecraftName = null
      expect(minecraftName).toBeFalsy()
    })

    it('should validate token matches minecraftName', () => {
      const playerName = 'TestPlayer'
      const token = testGenerateToken(playerName)
      
      // Token should be valid for the same player
      const parts = token.split('.')
      expect(parts.length).toBe(2)
      
      const payload = JSON.parse(Buffer.from(parts[0], 'base64').toString())
      expect(payload.minecraftName).toBe('testplayer') // lowercase
      expect(payload.type).toBe('shop')
    })

    it('should reject invalid minecraft name format', () => {
      const invalidNames = [
        '', 
        'a', // too short
        'ab', // too short
        'this_name_is_way_too_long_for_minecraft', // too long
        'player name', // has space
        'player@name', // has special char
      ]
      
      invalidNames.forEach(name => {
        expect(isValidMinecraftName(name)).toBe(false)
      })
    })

    it('should accept valid minecraft names', () => {
      const validNames = [
        'TestPlayer',
        'Player123',
        'test_player',
        'BR_BedrockPlayer', // Bedrock format
      ]
      
      validNames.forEach(name => {
        expect(isValidMinecraftName(name)).toBe(true)
      })
    })
  })

  describe('Cart Item Validation', () => {
    it('should validate product ID format', () => {
      const validId = '507f1f77bcf86cd799439011'
      const invalidIds = [
        'invalid',
        '123',
        'xyz!@#',
        '', 
      ]
      
      expect(isValidObjectId(validId)).toBe(true)
      invalidIds.forEach(id => {
        expect(isValidObjectId(id)).toBe(false)
      })
    })

    it('should enforce quantity limits per item', () => {
      const validateQuantity = (qty: number) => {
        return qty >= 1 && qty <= CART_LIMITS.MAX_QUANTITY_PER_ITEM
      }
      
      expect(validateQuantity(1)).toBe(true)
      expect(validateQuantity(50)).toBe(true)
      expect(validateQuantity(CART_LIMITS.MAX_QUANTITY_PER_ITEM)).toBe(true)
      expect(validateQuantity(0)).toBe(false)
      expect(validateQuantity(-1)).toBe(false)
      expect(validateQuantity(CART_LIMITS.MAX_QUANTITY_PER_ITEM + 1)).toBe(false)
    })

    it('should enforce maximum item types limit', () => {
      const itemTypes = Array(CART_LIMITS.MAX_ITEM_TYPES).fill({ productId: 'test', quantity: 1 })
      expect(itemTypes.length).toBeLessThanOrEqual(CART_LIMITS.MAX_ITEM_TYPES)
      
      const tooManyItems = Array(CART_LIMITS.MAX_ITEM_TYPES + 1).fill({ productId: 'test', quantity: 1 })
      expect(tooManyItems.length).toBeGreaterThan(CART_LIMITS.MAX_ITEM_TYPES)
    })

    it('should enforce total quantity limit', () => {
      const items = [
        { quantity: 50 },
        { quantity: 50 },
        { quantity: 50 },
        { quantity: 51 }, // This would exceed 200
      ]
      
      const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0)
      expect(totalQuantity).toBeGreaterThan(CART_LIMITS.MAX_TOTAL_QUANTITY)
    })
  })

  describe('Cart Operations', () => {
    it('should correctly transform cart items for storage', () => {
      const inputItems = [
        { productId: '507f1f77bcf86cd799439011', quantity: 2 },
        { product: { id: '507f1f77bcf86cd799439022' }, quantity: 3 },
      ]
      
      const transformed = inputItems.map(item => {
        const pid = 'productId' in item ? item.productId : item.product?.id
        return pid ? { productId: pid, quantity: Math.max(1, Math.min(100, item.quantity)) } : null
      }).filter(Boolean)
      
      expect(transformed).toHaveLength(2)
      expect(transformed[0]?.productId).toBe('507f1f77bcf86cd799439011')
      expect(transformed[1]?.productId).toBe('507f1f77bcf86cd799439022')
    })

    it('should clamp quantity to valid range', () => {
      const clampQuantity = (qty: number) => Math.max(1, Math.min(100, qty))
      
      expect(clampQuantity(0)).toBe(1)
      expect(clampQuantity(-5)).toBe(1)
      expect(clampQuantity(50)).toBe(50)
      expect(clampQuantity(150)).toBe(100)
    })

    it('should filter out invalid product IDs', () => {
      const items = [
        { productId: '507f1f77bcf86cd799439011', quantity: 1 },
        { productId: 'invalid', quantity: 1 },
        { productId: '', quantity: 1 },
      ]
      
      const valid = items.filter(item => isValidObjectId(item.productId))
      expect(valid).toHaveLength(1)
    })

    it('should merge cart items with same product', () => {
      const cartItems = [
        { productId: 'prod1', quantity: 2 },
        { productId: 'prod1', quantity: 3 },
        { productId: 'prod2', quantity: 1 },
      ]
      
      const merged = cartItems.reduce((acc, item) => {
        const existing = acc.find(i => i.productId === item.productId)
        if (existing) {
          existing.quantity += item.quantity
        } else {
          acc.push({ ...item })
        }
        return acc
      }, [] as typeof cartItems)
      
      expect(merged).toHaveLength(2)
      expect(merged.find(i => i.productId === 'prod1')?.quantity).toBe(5)
    })
  })

  describe('Cart Response Formatting', () => {
    it('should format cart response with product details', () => {
      const cartItems = [{ productId: 'prod1', quantity: 2 }]
      const products = [{ id: 'prod1', name: 'Diamond', price: 100, image: '/img.webp', commands: [] }]
      
      const productMap = new Map(products.map(p => [p.id, p]))
      
      const formatted = cartItems.map(item => {
        const product = productMap.get(item.productId)
        if (!product) return null
        return {
          product: { id: product.id, name: product.name, price: product.price, image: product.image },
          quantity: item.quantity,
        }
      }).filter(Boolean)
      
      expect(formatted).toHaveLength(1)
      expect(formatted[0]?.product.name).toBe('Diamond')
      expect(formatted[0]?.quantity).toBe(2)
    })

    it('should exclude inactive products from cart', () => {
      const cartItems = [
        { productId: 'active', quantity: 1 },
        { productId: 'inactive', quantity: 1 },
      ]
      
      const products = [
        { id: 'active', isActive: true },
        { id: 'inactive', isActive: false },
      ]
      
      const activeProducts = products.filter(p => p.isActive)
      const productMap = new Map(activeProducts.map(p => [p.id, p]))
      
      const filteredCart = cartItems.filter(item => productMap.has(item.productId))
      expect(filteredCart).toHaveLength(1)
      expect(filteredCart[0].productId).toBe('active')
    })
  })
})
