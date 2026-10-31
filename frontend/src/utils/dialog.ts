/**
 * 화면 안 '알림' 창 — 브라우저 기본 alert · confirm 대신(원본 이카운트도 화면 안 창이다).
 *
 * 기본 alert · confirm 은 그 탭의 JS 를 통째로 멈춘다. 여러 작업자(사람 · 자동 검사)가 같은 Chrome 을 쓰는데,
 * 창 하나가 떠 있으면 그 탭은 아무 명령도 못 받는다 — 그래서 바꾼다.
 *
 * 원본(2026-10-13 loginaa 구매조회 [선택삭제] 를 아무것도 안 고르고 누름) 실측: 창 385×260 · 바탕 회색(--ec-bg-page) · 둥글기 20,
 * 머리 31 파란 바탕 흰 글자 '알림' + 오른쪽 ✕(36), 글 12px · 줄 18, 하단 왼쪽 [확인](primary 26) — confirm 은 [확인][취소].
 *
 *   await ecAlert('저장했습니다.')
 *   if (!(await ecConfirm('삭제하시겠습니까?'))) return
 *
 * 창 틀은 앱에 한 번 둔 EcDialogHost(components/EcDialog, app/App.tsx)가 그린다. 이 파일은 상태와 부르는 함수만 —
 * utils(인쇄 등)도 알림을 띄울 수 있게 components 밖에 둔다(utils → components 역방향 import 를 끊으려고, 2026-10-31).
 */
export interface Pending {
  id: number
  kind: 'alert' | 'confirm'
  message: string
  resolve: (ok: boolean) => void
}

let queue: Pending[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/**
 * 자동 검사(qa/flows)가 <code>window.confirm = () =&gt; true</code> 처럼 바꿔 끼운 것이 있으면 그것을 부른다 —
 * 흐름 159개가 그렇게 '확인' 을 미리 눌러 두고 있다. 브라우저 것(native)이면 부르지 않는다(탭을 멈추므로).
 */
function stubbed(kind: Pending['kind']): ((m: string) => unknown) | null {
  const f = kind === 'confirm' ? window.confirm : window.alert
  try { return /\[native code\]/.test(Function.prototype.toString.call(f)) ? null : f } catch { return null }
}

function push(kind: Pending['kind'], message: unknown): Promise<boolean> {
  const stub = stubbed(kind)
  if (stub) return Promise.resolve(kind === 'confirm' ? Boolean(stub.call(window, String(message ?? ''))) : (stub.call(window, String(message ?? '')), true))
  /* 같은 알림이 이미 떠 있으면 또 띄우지 않는다 — 권한 거부는 api/client 가 띄우고 화면도 같은 글을 띄운다. */
  if (kind === 'alert' && queue.some((p) => p.kind === 'alert' && p.message === String(message ?? ''))) {
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    queue = [...queue, { id: ++seq, kind, message: String(message ?? ''), resolve }]
    emit()
  })
}

/** 원본 [선택삭제] 등 고른 줄에 대고 하는 버튼을, 아무것도 안 고르고 눌렀을 때의 글(구매조회 실측). */
export const NO_SELECTION_MESSAGE = '리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.'

/** 알림 — [확인] 을 누르면 풀린다. */
export function ecAlert(message: unknown): Promise<void> {
  return push('alert', message).then(() => undefined)
}

/** 확인 — [확인] 이면 true, [취소] · ✕ · Esc 면 false. */
export function ecConfirm(message: unknown): Promise<boolean> {
  return push('confirm', message)
}

/** 고른 줄 수가 0 이면 원본 알림을 띄우고 false — 버튼을 미리 잠그지 않는다(원본 구매조회 [선택삭제]). */
export function requireSelection(count: number): boolean {
  if (count > 0) return true
  void ecAlert(NO_SELECTION_MESSAGE)
  return false
}

export function close(p: Pending, ok: boolean) {
  queue = queue.filter((x) => x.id !== p.id)
  emit()
  p.resolve(ok)
}

export const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const snapshot = () => queue
