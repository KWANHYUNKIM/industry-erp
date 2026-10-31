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

/*
 * 도는 요청 수 — 공용 저장 단추(EcSlipShell)가 [저장] 뒤 요청이 다 끝날 때까지 두 번째 저장을 막는 데 쓴다
 * (utils/saveLock). 늘리기는 아래 요청 인터셉터, 줄이기는 응답 인터셉터(성공 · 실패 둘 다)가 한다.
 */
let inFlight = 0
const idleWaiters = new Set<() => void>()
export const requestsInFlight = () => inFlight
/** 도는 요청이 0 이 되면 한 번 부른다(지금 0 이면 바로). 돌려준 함수로 취소. */
export function onRequestsIdle(fn: () => void): () => void {
  if (inFlight === 0) { fn(); return () => {} }
  idleWaiters.add(fn)
  return () => { idleWaiters.delete(fn) }
}
function requestSettled() {
  inFlight = Math.max(0, inFlight - 1)
  if (inFlight > 0) return
  const ws = [...idleWaiters]
  idleWaiters.clear()
  ws.forEach((f) => f())
}

// 모든 요청에 JWT 토큰 부착
api.interceptors.request.use((config) => {
  inFlight++
  const token = tokenStore.get()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  /* 어느 화면이 부르나 — 서버 인가(AuthorizationInterceptor)가 업무권한 · 예외(메뉴)와 곁다리 조회를 이것으로 가린다.
     공용 화면(대시보드 · 데이터센터)은 업무 '-'. */
  const here = window.location.pathname
  config.headers['X-Erp-Menu'] = here
  config.headers['X-Erp-Work'] = hooks.workOf(here) ?? '-'
  return config
})

/**
 * 화면 경로 → 업무, 권한 거부 알림 — 앱(AuthContext)이 끼운다. client 는 다른 모듈을 import 하지 않는다
 * (node --test 가 client.test.ts 를 그대로 읽는다).
 */
const hooks: { workOf: (path: string) => string | null; onDenied: (message: string) => void } = {
  workOf: () => null,
  onDenied: () => {},
}
export function setPermissionHooks(h: Partial<typeof hooks>) {
  Object.assign(hooks, h)
}

/** 업무권한 거부 본문(서버 PermissionDeniedException). */
export interface PermissionDenied { work: string; workName: string; kind: string; action: string; menu: string | null }

export function permissionDeniedOf(error: unknown): PermissionDenied | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 403) return null
  return (error.response.data?.permission as PermissionDenied | undefined) ?? null
}

// 401 응답 시 토큰 제거 후 로그인 페이지로
api.interceptors.response.use(
  (res) => { requestSettled(); return res },
  (error) => {
    requestSettled()
    /* 행위(입력 · 수정 · 삭제) 권한 거부 — 원본 알림 '권한이 없습니다. / 마스터에게 문의 바랍니다. / - 판매 업무권한 (삭제)'.
       화면이 같은 글로 또 띄워도 EcDialog 가 하나만 띄운다. 조회 거부는 자물쇠 화면이 맡는다. */
    const denied = permissionDeniedOf(error)
    if (denied && denied.action !== '조회') hooks.onDenied(error.response.data.message)
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
