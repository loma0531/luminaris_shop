
export interface FetchOptions extends RequestInit {
  token?: string | null
}

export const createBaseHeaders = (options: FetchOptions): HeadersInit => {
  const headers: HeadersInit = {
    ...options.headers,
  }

  if (options.token && !(headers as Record<string, string>)['Authorization']) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${options.token}`
  }

  // Only set Content-Type to application/json if body is NOT FormData
  if (options.method !== 'GET' && !(options.body instanceof FormData) && !(headers as Record<string, string>)['Content-Type']) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json'
  }

  return headers
}

export const baseFetch = async (url: string, options: FetchOptions = {}) => {
  const headers = createBaseHeaders(options)
  
  const finalOptions: RequestInit = {
    ...options,
    headers,
  }

  return fetch(url, finalOptions)
}
