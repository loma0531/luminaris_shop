import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isValidMinecraftName, isValidObjectId } from '@/lib/inputValidation'
import { CACHE_HEADERS } from '@/lib/cacheHeaders'
import { requireUserAuth } from '@/lib/adminAuth'
import { logger, createTimer } from '@/lib/logger'
import { CartItemData } from '@/lib/types'
import { getCachedCart, setCachedCart, CachedCartItem, getCachedProducts } from '@/lib/redis'



export async function GET(request: NextRequest) {
  const timer = createTimer()
  try {
    const { searchParams } = new URL(request.url)
    const minecraftName = searchParams.get('minecraftName')

    if (!minecraftName) {
      return NextResponse.json({ error: 'minecraftName required' }, { status: 400 })
    }

    const authError = await requireUserAuth(request, minecraftName)
    if (authError) return authError

    if (!isValidMinecraftName(minecraftName)) {
      return NextResponse.json({ error: 'Invalid minecraft name format' }, { status: 400 })
    }

    // Load raw cart items from Cache or DB
    let cartItems: { productId: string; quantity: number; customInput: string | null }[] = []
    let isFromCache = false

    const cachedCart = await getCachedCart(minecraftName)
    if (cachedCart && cachedCart.items) {
      isFromCache = true
      cartItems = cachedCart.items.map(item => ({
        productId: item.productId || (item as { product?: { id: string } }).product?.id || '',
        quantity: item.quantity,
        customInput: item.customInput || null
      })).filter(item => item.productId && isValidObjectId(item.productId))
    } else {
      const cart = await prisma.cart.findUnique({
        where: { minecraftName },
        select: { items: true }
      })
      if (cart && cart.items) {
        cartItems = cart.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          customInput: item.customInput || null
        })).filter(item => item.productId && isValidObjectId(item.productId))
      }
    }

    if (cartItems.length === 0) {
      logger.cart.loaded(minecraftName, 0, timer())
      return NextResponse.json({ items: [] }, { headers: CACHE_HEADERS.NONE })
    }

    const productIds = cartItems.map(item => item.productId)

    // Revalidate and Hydrate cart with LATEST product pricing and active status from DB
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: {
        id: true,
        name: true,
        price: true,
        image: true,
        commands: true,
        requiresInput: true,
        inputLabel: true,
        inputPlaceholder: true,
        saleActive: true,
        discountType: true,
        discountValue: true,
        saleStart: true,
        saleEnd: true
      }
    })

    const productMap = new Map(products.map((p) => [p.id, p]))

    // Map and recalculate active promotional price (Filter out deleted or isActive=false products)
    const validatedItems = cartItems
      .map(item => {
        const product = productMap.get(item.productId)
        if (!product) return null // Auto-remove from cart if product is deleted or disabled
        

        
        return {
          productId: product.id,
          product: { 
            id: product.id, 
            name: product.name, 
            price: product.price, // Keep original regular price, let front-end apply the discount
            originalPrice: product.price, 
            image: product.image, 
            commands: product.commands,
            requiresInput: product.requiresInput,
            inputLabel: product.inputLabel,
            inputPlaceholder: product.inputPlaceholder,
            saleActive: product.saleActive,
            discountType: product.discountType,
            discountValue: product.discountValue,
            saleStart: product.saleStart,
            saleEnd: product.saleEnd
          },
          quantity: Math.max(1, Math.min(100, item.quantity || 1)),
          customInput: item.customInput || null,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    // Sync validated and cleaned cart back to Cache and MongoDB
    const cachedMapItems = validatedItems.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      customInput: item.customInput,
      product: item.product
    }))

    await setCachedCart(minecraftName, { 
      items: cachedMapItems as unknown as CachedCartItem[], 
      timestamp: Date.now() 
    })

    const dbSaveItems = validatedItems.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      customInput: item.customInput
    }))

    prisma.cart.upsert({
      where: { minecraftName },
      update: { items: dbSaveItems },
      create: { minecraftName, items: dbSaveItems },
    }).catch(error => {
      logger.system.error(`Background MongoDB cart revalidation sync failed for ${minecraftName}: ${error}`)
    })

    logger.cart.loaded(minecraftName, validatedItems.length, timer())

    return NextResponse.json(
      { items: validatedItems }, 
      { 
        headers: { 
          ...CACHE_HEADERS.NONE, 
          'X-Cache': isFromCache ? 'HIT-REVALIDATED' : 'MISS' 
        } 
      }
    )
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

    const authError = await requireUserAuth(request, minecraftName)
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

    // Fetch products from cache (Redis) or DB to map details and get names
    const cachedProducts = await getCachedProducts<{ id: string; name: string; [key: string]: unknown }>()
    let productMap = new Map<string, { id: string; name: string; [key: string]: unknown }>()
    
    if (cachedProducts && cachedProducts.length > 0) {
      productMap = new Map(cachedProducts.map((p) => [p.id, p]))
    } else {
      // Fallback: Fetch all active products
      const dbProducts = await prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          price: true,
          image: true,
          commands: true,
          requiresInput: true,
          inputLabel: true,
          inputPlaceholder: true,
          saleActive: true,
          discountType: true,
          discountValue: true,
          saleStart: true,
          saleEnd: true
        }
      })
      productMap = new Map(dbProducts.map((p: { id: string; name: string; [key: string]: unknown }) => [p.id, p]))
    }

    // Get old items before writing if we need to do comparison (Full Mode)
    let oldItems: { productId: string; quantity: number }[] = []
    if (!quickMode) {
      const cachedCart = await getCachedCart(minecraftName)
      if (cachedCart) {
        oldItems = cachedCart.items.map(i => ({
          productId: i.productId || i.product?.id || '',
          quantity: i.quantity
        })).filter(i => i.productId !== '')
      } else {
        const currentCart = await prisma.cart.findUnique({
          where: { minecraftName },
          select: { items: true }
        })
        oldItems = currentCart?.items || []
      }
    }

    // Build the updated CachedCartItem list
    const updatedCachedItems: CachedCartItem[] = cartItems
      .map(item => {
        const product = productMap.get(item.productId)
        if (!product) return null
        

        
        return {
          productId: product.id,
          quantity: item.quantity,
          customInput: item.customInput || null,
          product: {
            id: product.id,
            name: product.name,
            price: product.price, // Save original regular price, let front-end apply the discount
            originalPrice: product.price, 
            image: product.image,
            commands: product.commands,
            requiresInput: product.requiresInput,
            inputLabel: product.inputLabel,
            inputPlaceholder: product.inputPlaceholder,
            saleActive: product.saleActive,
            discountType: product.discountType,
            discountValue: product.discountValue,
            saleStart: product.saleStart,
            saleEnd: product.saleEnd
          }
        } as CachedCartItem
      })
      .filter((item): item is CachedCartItem => item !== null)

    // Save immediately to Redis Cache (<1ms)
    await setCachedCart(minecraftName, {
      items: updatedCachedItems,
      timestamp: Date.now()
    })

    // Start background asynchronous MongoDB update (non-blocking)
    prisma.cart.upsert({
      where: { minecraftName },
      update: { items: cartItems },
      create: { minecraftName, items: cartItems },
    }).catch(error => {
      logger.system.error(`Background MongoDB cart sync failed for ${minecraftName}: ${error}`)
    })

    // Quick mode: minimal processing, return success immediately
    if (quickMode) {
      logger.debug(`Cart updated in cache for ${minecraftName}: ${cartItems.length} items`, 200, timer())
      return NextResponse.json({ success: true })
    }

    // Full mode: detailed logging (for cart page saves, etc.)
    // Detect what changed
    const oldItemMap = new Map(oldItems.map(i => [i.productId, i.quantity]))
    const newItemMap = new Map(cartItems.map(i => [i.productId, i.quantity]))
    
    // Log changes using cached product map
    for (const [pid, newQty] of newItemMap.entries()) {
      const oldQty = oldItemMap.get(pid) || 0
      const productName = productMap.get(pid)?.name || 'Unknown'
      
      if (oldQty === 0) {
        logger.cart.itemAdded(minecraftName, productName, newQty)
      } else if (newQty !== oldQty) {
        logger.cart.quantityChanged(minecraftName, productName, oldQty, newQty)
      }
    }

    for (const [pid] of oldItemMap.entries()) {
      if (!newItemMap.has(pid)) {
        const productName = productMap.get(pid)?.name || 'Unknown'
        logger.cart.itemRemoved(minecraftName, productName)
      }
    }

    // Check if cart was cleared
    if (cartItems.length === 0 && oldItems.length > 0) {
      logger.cart.cleared(minecraftName, oldItems.length)
    }

    logger.cart.saved(minecraftName, cartItems.length, timer())

    return NextResponse.json({ success: true })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.system.error(`Failed to save cart: ${errorMessage}`)
    return NextResponse.json({ error: 'Failed to save cart' }, { status: 500 })
  }
}

