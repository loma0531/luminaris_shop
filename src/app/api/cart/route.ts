import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isValidMinecraftName, isValidObjectId } from '@/lib/inputValidation'
import { CACHE_HEADERS } from '@/lib/cache'
import { requireUserAuth } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'
import { CartItemData } from '@/lib/types'

export async function GET(request: NextRequest) {
  const timer = createTimer()
  try {
    const { searchParams } = new URL(request.url)
    const minecraftName = searchParams.get('minecraftName')

    if (!minecraftName) {
      return NextResponse.json({ error: 'minecraftName required' }, { status: 400 })
    }

    const authError = requireUserAuth(request, minecraftName)
    if (authError) return authError

    if (!isValidMinecraftName(minecraftName)) {
      return NextResponse.json({ error: 'Invalid minecraft name format' }, { status: 400 })
    }

    const cart = await prisma.cart.findUnique({
      where: { minecraftName },
      select: { items: true }
    })

    if (!cart || !cart.items || cart.items.length === 0) {
      logger.cart.loaded(minecraftName, 0, timer())
      return NextResponse.json({ items: [] }, { headers: CACHE_HEADERS.NONE })
    }

    const productIds = cart.items
      .map(item => item.productId)
      .filter(id => isValidObjectId(id))

    if (productIds.length === 0) {
      return NextResponse.json({ items: [] })
    }

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, name: true, price: true, image: true, commands: true, requiresInput: true, inputLabel: true, inputPlaceholder: true }
    })

    const productMap = new Map(products.map((p) => [p.id, p]))

    const items = cart.items
      .map(item => {
        const product = productMap.get(item.productId)
        if (!product) return null
        return {
          product: { 
            id: product.id, 
            name: product.name, 
            price: product.price, 
            image: product.image, 
            commands: product.commands,
            requiresInput: product.requiresInput,
            inputLabel: product.inputLabel,
            inputPlaceholder: product.inputPlaceholder
          },
          quantity: Math.max(1, Math.min(100, item.quantity || 1)),
          customInput: item.customInput || null,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    logger.cart.loaded(minecraftName, items.length, timer())

    return NextResponse.json({ items }, { headers: CACHE_HEADERS.NONE })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Failed to fetch cart: ${errorMessage}`)
    return NextResponse.json({ error: 'Failed to fetch cart' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const timer = createTimer()
  try {
    const { searchParams } = new URL(request.url)
    const quickMode = searchParams.get('quick') === 'true'
    
    const body = await request.json()
    const { minecraftName, items } = body

    if (!minecraftName) {
      return NextResponse.json({ error: 'minecraftName required' }, { status: 400 })
    }

    const authError = requireUserAuth(request, minecraftName)
    if (authError) return authError

    if (!isValidMinecraftName(minecraftName)) {
      logger.security.invalidInput('minecraftName', minecraftName)
      return NextResponse.json({ error: 'Invalid minecraft name format' }, { status: 400 })
    }

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Invalid items format' }, { status: 400 })
    }

    // Transform and validate items
    interface CartItemInput extends Partial<CartItemData> {
      product?: { id: string }
    }
    
    const cartItems = items
      .map((item: CartItemInput) => {
        const pid = item.productId || item.product?.id
        if (!pid || !isValidObjectId(pid)) return null
        const quantity = Math.max(1, Math.min(100, parseInt(String(item.quantity)) || 1))
        if (quantity <= 0) return null
        return { productId: pid, quantity, customInput: item.customInput || null }
      })
      .filter((item): item is { productId: string; quantity: number; customInput: string | null } => item !== null)

    // Quick mode: minimal processing, just save directly
    if (quickMode) {
      await prisma.cart.upsert({
        where: { minecraftName },
        update: { items: cartItems },
        create: { minecraftName, items: cartItems },
      })
      
      // Simple log: just count
      logger.debug(`Cart updated for ${minecraftName}: ${cartItems.length} items`, 200, timer())
      
      return NextResponse.json({ success: true })
    }

    // Full mode: detailed logging (for cart page saves, etc.)
    // Get current cart and product names for comparison
    const currentCart = await prisma.cart.findUnique({
      where: { minecraftName },
      select: { items: true }
    })
    const oldItems = currentCart?.items || []

    // Detect what changed
    const oldItemMap = new Map(oldItems.map(i => [i.productId, i.quantity]))
    const newItemMap = new Map(cartItems.map(i => [i.productId, i.quantity]))
    
    // Get product names for logging
    const allProductIds = [...new Set([...oldItemMap.keys(), ...newItemMap.keys()])]
    const products = await prisma.product.findMany({
      where: { id: { in: allProductIds } },
      select: { id: true, name: true }
    })
    const productNames = new Map(products.map(p => [p.id, p.name]))

    // Log changes
    for (const [pid, newQty] of newItemMap.entries()) {
      const oldQty = oldItemMap.get(pid) || 0
      const productName = productNames.get(pid) || 'Unknown'
      
      if (oldQty === 0) {
        logger.cart.itemAdded(minecraftName, productName, newQty)
      } else if (newQty !== oldQty) {
        logger.cart.quantityChanged(minecraftName, productName, oldQty, newQty)
      }
    }

    for (const [pid] of oldItemMap.entries()) {
      if (!newItemMap.has(pid)) {
        const productName = productNames.get(pid) || 'Unknown'
        logger.cart.itemRemoved(minecraftName, productName)
      }
    }

    // Check if cart was cleared
    if (cartItems.length === 0 && oldItems.length > 0) {
      logger.cart.cleared(minecraftName, oldItems.length)
    }

    // Update cart
    await prisma.cart.upsert({
      where: { minecraftName },
      update: { items: cartItems },
      create: { minecraftName, items: cartItems },
    })

    logger.cart.saved(minecraftName, cartItems.length, timer())

    return NextResponse.json({ success: true })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Failed to save cart: ${errorMessage}`)
    return NextResponse.json({ error: 'Failed to save cart' }, { status: 500 })
  }
}
