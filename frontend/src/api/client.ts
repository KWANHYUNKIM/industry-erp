import axios from 'axios'

const TOKEN_KEY = 'erp_token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

// Vite 프록시가 /api 를 백엔드(8080)로 전달한다.
export const api = axios.create({
  baseURL: '/api',
})

// 모든 요청에 JWT 토큰 부착
api.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 응답 시 토큰 제거 후 로그인 페이지로
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      tokenStore.clear()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

/**
 * 화면에 보여 줄 오류 문구를 뽑는다. 거의 모든 화면이 이걸로 오류를 표시한다.
 *
 * <p>예전에는 응답이 없는 오류(서버가 안 떠 있거나 네트워크가 끊긴 경우)와
 * 일반 Error 를 똑같이 "오류가 발생했습니다." 로 뭉갰다. 쓰는 사람은 자기 입력이
 * 잘못된 건지 서버가 죽은 건지 알 수가 없어서, 같은 버튼만 계속 누르게 된다.
 */
export function extractErrorMessage(error: unknown, fallback = '오류가 발생했습니다.'): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    // 백엔드가 message 를 문자열이 아닌 것으로 주면 화면에 [object Object] 가 찍힌다.
    if (typeof message === 'string' && message.trim()) return message

    if (!error.response) {
      // 응답 자체가 없다 — 서버가 안 떴거나, 네트워크가 끊겼거나, 시간이 초과됐다.
      return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
        ? '서버 응답이 너무 늦습니다. 잠시 후 다시 시도해 주세요.'
        : '서버에 연결할 수 없습니다. 네트워크와 서버 상태를 확인해 주세요.'
    }
    // 응답은 왔는데 본문에 message 가 없다. 상태코드라도 알려 주는 편이 낫다.
    return `${fallback} (HTTP ${error.response.status})`
  }
  // 화면 코드가 직접 던진 Error 는 그 메시지가 제일 정확하다 — 버리지 않는다.
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}
