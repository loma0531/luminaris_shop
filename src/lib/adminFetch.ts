import { baseFetch } from './fetchUtils'

/**
 * Utility function to make authenticated admin API calls
 * Automatically adds the Authorization header with the admin token
 */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_session') : null
  return baseFetch(url, { ...options, token })
}

/**
 * Helper for GET requests
 */
export async function adminGet(url: string): Promise<Response> {
  return adminFetch(url, { method: 'GET' })
}

/**
 * Helper for POST requests with JSON body
 */
export async function adminPost(url: string, data: unknown): Promise<Response> {
  return adminFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

/**
 * Helper for PUT requests with JSON body
 */
export async function adminPut(url: string, data: unknown): Promise<Response> {
  return adminFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

/**
 * Helper for DELETE requests
 */
export async function adminDelete(url: string): Promise<Response> {
  return adminFetch(url, { method: 'DELETE' })
}
