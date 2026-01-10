import * as z from 'zod'

// MongoDB ID
export const ObjectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ID format')

// User Validation
export const MinecraftNameSchema = z.string()
  .min(3, 'Name too short')
  .max(16, 'Name too long')
  .regex(/^([a-zA-Z0-9_]{3,16}|BR_[a-zA-Z0-9_]{3,16})$/, 'Invalid Minecraft name')

// Pagination
export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(50),
})

// Cart & Order
export const CartItemSchema = z.object({
  productId: ObjectIdSchema,
  quantity: z.coerce.number().min(1).max(100).int(),
  customInput: z.string().max(2000).nullable().optional(),  // สำหรับบริการที่ต้องการ input เพิ่มเติม
})

export const CheckoutSchema = z.object({
  minecraftName: MinecraftNameSchema,
  items: z.array(z.object({
    productId: ObjectIdSchema,
    name: z.string().max(100),
    price: z.number().min(0),
    quantity: z.number().min(1).max(99).int(),
    commands: z.array(z.string()).max(20).optional().default([]),
    customInput: z.string().max(2000).nullable().optional(),  // เช่น โค้ดสี
  })).min(1),
  total: z.number().min(0),
  action: z.literal('create'),
  // CSRF Protection
  sessionId: z.string().length(32),
  csrfToken: z.string().length(64),
})

// RCON
export const RconExecuteSchema = z.object({
  playerName: MinecraftNameSchema,
  commands: z.array(z.string()).min(1),
  orderId: ObjectIdSchema.optional(),
  adminOverride: z.boolean().optional(),
})

export const RconVerifySchema = z.object({
  playerName: MinecraftNameSchema.optional(),
  action: z.enum(['test', 'verify']).optional(),
}).refine(data => data.action === 'test' || data.playerName, {
  message: 'playerName is required unless action is test',
})
