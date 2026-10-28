import { useCallback, useRef, useState, type FormEvent } from 'react'

/**
 * 저장 요청이 도는 동안 두 번째 저장을 막는다.
 *
 * 2026-10-28 구매조회 › [복사] › [저장(F8)] 이 4초 넘게 아무 표시 없이 있다가, 한 번 더 누르자 같은 전표가
 * 두 건(PO-20261017-0001 · -0002) 저장됐다. [저장] 단추 · ▲메뉴 · F8 · [저장/전표(F7)] 이 모두 form 제출 한 길로
 * 모이므로 그 onSubmit 을 `wrap` 으로 감싸면 다 막힌다.
 *
 * <b>상태가 아니라 ref 로 막는 이유:</b> 같은 틱에 두 번 누르면 두 번째 클릭이 아직 옛 렌더(busy=false)를 본다.
 * `busy` 상태는 단추를 흐리게(disabled) 그리는 데만 쓴다.
 *
 * 막힌 제출도 `preventDefault` 는 한다 — 안 하면 브라우저가 form 을 진짜로 보내 화면이 새로 고쳐진다.
 */
export function useSubmitting() {
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)

  /** 비동기 저장을 한 번에 하나만 돌린다. 돌고 있으면 아무것도 안 하고 undefined. */
  const run = useCallback(async <R>(fn: () => Promise<R>): Promise<R | undefined> => {
    if (busyRef.current) return undefined
    busyRef.current = true
    setBusy(true)
    try { return await fn() } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  /** form onSubmit 용. */
  const wrap = useCallback((fn: (e: FormEvent<HTMLFormElement>) => Promise<unknown>) =>
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      void run(() => fn(e))
    }, [run])

  /** 저장이 도는 중인가 — 클릭 순간에 인쇄창을 미리 여는 [저장/전표(F7)] 처럼 제출 전에 물어야 할 때. */
  const isBusy = useCallback(() => busyRef.current, [])

  return { busy, run, wrap, isBusy }
}
