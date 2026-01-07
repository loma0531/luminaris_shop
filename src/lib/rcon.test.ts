import { describe, it, expect } from 'vitest'
import { RconExecuteSchema, RconVerifySchema } from '@/lib/schemas'
import { isValidMinecraftName } from '@/lib/inputValidation'

/**
 * RCON Integration Tests
 * ทดสอบ logic ของ RCON execution รวมถึง command filtering, player verification
 */

describe('RCON Logic', () => {
  describe('RCON Schema Validation', () => {
    it('should validate correct execute payload', () => {
      const payload = {
        playerName: 'TestPlayer',
        commands: ['give {player} diamond 1'],
        orderId: '507f1f77bcf86cd799439011',
      }
      
      const result = RconExecuteSchema.safeParse(payload)
      expect(result.success).toBe(true)
    })

    it('should reject empty commands array', () => {
      const payload = {
        playerName: 'TestPlayer',
        commands: [],
      }
      
      const result = RconExecuteSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })

    it('should validate verify payload', () => {
      const payload = {
        playerName: 'TestPlayer',
        action: 'verify',
      }
      
      const result = RconVerifySchema.safeParse(payload)
      expect(result.success).toBe(true)
    })

    it('should allow test action without playerName', () => {
      const payload = {
        action: 'test',
      }
      
      const result = RconVerifySchema.safeParse(payload)
      expect(result.success).toBe(true)
    })

    it('should require playerName for verify action', () => {
      const payload = {
        action: 'verify',
        // missing playerName
      }
      
      const result = RconVerifySchema.safeParse(payload)
      expect(result.success).toBe(false)
    })
  })

  describe('Command Replacement', () => {
    it('should replace {player} placeholder', () => {
      const command = 'give {player} diamond 1'
      const playerName = 'TestPlayer'
      
      const finalCommand = command.replace(/\{player\}/gi, playerName)
      expect(finalCommand).toBe('give TestPlayer diamond 1')
    })

    it('should replace multiple {player} occurrences', () => {
      const command = 'msg {player} Hello {player}!'
      const playerName = 'TestPlayer'
      
      const finalCommand = command.replace(/\{player\}/gi, playerName)
      expect(finalCommand).toBe('msg TestPlayer Hello TestPlayer!')
    })

    it('should handle case-insensitive replacement', () => {
      const commands = [
        'give {PLAYER} diamond 1',
        'give {Player} diamond 1',
        'give {player} diamond 1',
      ]
      
      commands.forEach(cmd => {
        const result = cmd.replace(/\{player\}/gi, 'Test')
        expect(result).toBe('give Test diamond 1')
      })
    })
  })

  describe('Dangerous Command Filtering', () => {
    const dangerousPatterns = [
      /^op\s+/i,
      /^deop\s+/i,
      /^stop$/i,
      /^ban\s+/i,
      /^pardon\s+/i,
      /^whitelist\s+/i,
      /^kick\s+/i,
      /^gamemode\s+/i,
      /^tp\s+/i,
    ]

    const isDangerous = (cmd: string) => 
      dangerousPatterns.some(pattern => pattern.test(cmd))

    it('should block op commands', () => {
      expect(isDangerous('op TestPlayer')).toBe(true)
      expect(isDangerous('OP TestPlayer')).toBe(true)
    })

    it('should block deop commands', () => {
      expect(isDangerous('deop TestPlayer')).toBe(true)
    })

    it('should block stop command', () => {
      expect(isDangerous('stop')).toBe(true)
      expect(isDangerous('STOP')).toBe(true)
    })

    it('should block ban commands', () => {
      expect(isDangerous('ban TestPlayer')).toBe(true)
      expect(isDangerous('ban TestPlayer Cheating')).toBe(true)
    })

    it('should block whitelist commands', () => {
      expect(isDangerous('whitelist add TestPlayer')).toBe(true)
      expect(isDangerous('whitelist remove TestPlayer')).toBe(true)
    })

    it('should block tp commands', () => {
      expect(isDangerous('tp TestPlayer 0 64 0')).toBe(true)
      expect(isDangerous('tp Player1 Player2')).toBe(true)
    })

    it('should block gamemode commands', () => {
      expect(isDangerous('gamemode creative TestPlayer')).toBe(true)
      expect(isDangerous('gamemode 1 TestPlayer')).toBe(true)
    })

    it('should allow safe give commands', () => {
      expect(isDangerous('give TestPlayer diamond 64')).toBe(false)
      expect(isDangerous('give TestPlayer minecraft:diamond_sword 1')).toBe(false)
    })

    it('should allow title commands', () => {
      expect(isDangerous('title TestPlayer title {"text":"Welcome!"}')).toBe(false)
    })

    it('should allow playsound commands', () => {
      expect(isDangerous('playsound minecraft:entity.player.levelup master TestPlayer')).toBe(false)
    })
  })

  describe('Player Verification', () => {
    it('should validate minecraft name format', () => {
      expect(isValidMinecraftName('ValidPlayer')).toBe(true)
      expect(isValidMinecraftName('BR_BedrockPlayer')).toBe(true)
      expect(isValidMinecraftName('')).toBe(false)
      expect(isValidMinecraftName('a')).toBe(false)
    })

    it('should check player name matches order', () => {
      const orderName = 'TestPlayer'
      const requestName = 'TestPlayer'
      
      const matches = orderName.toLowerCase() === requestName.toLowerCase()
      expect(matches).toBe(true)
    })

    it('should detect player name mismatch', () => {
      const orderName = 'Player1'
      const requestName = 'Player2'
      
      const matches = orderName.toLowerCase() === requestName.toLowerCase()
      expect(matches).toBe(false)
    })
  })

  describe('Replay Attack Prevention', () => {
    it('should block already delivered orders', () => {
      const order = {
        id: 'order123',
        status: 'COMPLETED',
        isDelivered: true,
      }
      
      const canDeliver = order.status === 'COMPLETED' && !order.isDelivered
      expect(canDeliver).toBe(false)
    })

    it('should allow first-time delivery', () => {
      const order = {
        id: 'order123',
        status: 'COMPLETED',
        isDelivered: false,
      }
      
      const canDeliver = order.status === 'COMPLETED' && !order.isDelivered
      expect(canDeliver).toBe(true)
    })

    it('should block non-completed orders', () => {
      const order = {
        id: 'order123',
        status: 'AWAITING_PAYMENT',
        isDelivered: false,
      }
      
      const canDeliver = order.status === 'COMPLETED' && !order.isDelivered
      expect(canDeliver).toBe(false)
    })
  })

  describe('Command Verification', () => {
    it('should verify commands match order items', () => {
      const orderCommands = [
        'give {player} diamond 1',
        'give {player} emerald 5',
      ]
      
      const requestCommands = ['give {player} diamond 1']
      
      const allMatch = requestCommands.every(cmd => orderCommands.includes(cmd))
      expect(allMatch).toBe(true)
    })

    it('should reject commands not in order', () => {
      const orderCommands = ['give {player} diamond 1']
      const requestCommands = ['give {player} diamond 64'] // Different quantity
      
      const allMatch = requestCommands.every(cmd => orderCommands.includes(cmd))
      expect(allMatch).toBe(false)
    })
  })

  describe('Batch Execution Logic', () => {
    it('should collect commands from all order items', () => {
      const orderItems = [
        { name: 'Diamond', quantity: 2, commands: ['give {player} diamond 1'] },
        { name: 'Gold', quantity: 1, commands: ['give {player} gold_block 1'] },
      ]
      
      const allCommands: string[] = []
      orderItems.forEach(item => {
        for (let i = 0; i < item.quantity; i++) {
          item.commands.forEach(cmd => allCommands.push(cmd))
        }
      })
      
      expect(allCommands).toHaveLength(3) // 2 diamonds + 1 gold
      expect(allCommands.filter(c => c.includes('diamond'))).toHaveLength(2)
    })

    it('should handle items without commands', () => {
      const orderItems = [
        { name: 'Diamond', quantity: 2, commands: ['give {player} diamond 1'] },
        { name: 'Cosmetic', quantity: 3, commands: [] },
      ]
      
      const itemsWithCommands = orderItems.filter(item => item.commands && item.commands.length > 0)
      expect(itemsWithCommands).toHaveLength(1)
    })
  })
})
