import { baseFetch } from './fetchUtils'

// Define FetchOptions to include token
interface FetchOptions extends RequestInit {
  token?: string | null
}

export const apiFetch = async (url: string, options: FetchOptions = {}) => {
  let token: string | null = options.token || null
  const authHeader = (options.headers as Record<string, string> | undefined)?.['Authorization']

  // Add shop session token if it exists in localStorage AND no other token/auth provided
  if (!token && !authHeader && typeof window !== 'undefined') {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        if (user.shopToken) {
          token = user.shopToken
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return baseFetch(url, { ...options, token })
}
