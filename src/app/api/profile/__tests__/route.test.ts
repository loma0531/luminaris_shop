import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock MySQL
vi.mock('@/lib/mysql', () => ({
  getPlayerProfile: vi.fn(),
}))

vi.mock('@/lib/adminAuth', () => ({
  requireUserAuth: vi.fn(() => null),
}))

// Import after mocks
import { getPlayerProfile } from '@/lib/mysql'
import { POST } from '../route'

describe('Profile API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 400 if minecraftName missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/profile', {
      method: 'POST',
      body: JSON.stringify({})
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('should return 404 if player not found in MySQL', async () => {
    vi.mocked(getPlayerProfile).mockResolvedValue(null)

    const req = new NextRequest('http://localhost:3000/api/profile', {
      method: 'POST',
      body: JSON.stringify({ minecraftName: 'UnknownPlayer' })
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('should return profile data for valid player', async () => {
    const mockProfile = {
      playerUuid: 'uuid-123',
      displayName: 'TestPlayer',
      balance: 1000,
      jobs: ['Miner'],
      lastLoginTime: Date.now(),
      lastLogoffTime: Date.now(),
      totalPlayTime: 3600
    }
    vi.mocked(getPlayerProfile).mockResolvedValue(mockProfile as never)

    const req = new NextRequest('http://localhost:3000/api/profile', {
      method: 'POST',
      body: JSON.stringify({ minecraftName: 'TestPlayer' })
    })
    const res = await POST(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.profile).toEqual(mockProfile)
  })
})
