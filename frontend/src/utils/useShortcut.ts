import { useEffect, useRef } from 'react'

/**
 * 화면 단축키(F2·F3·F4·F7 …)를 window 에 건다.
 *
 * <b>window 에 거는 이유:</b> 이 단축키들은 조건 입력칸이나 그리드 셀 안에서 눌러도 먹어야 한다.
 * 그게 단축키를 쓰는 이유다. 요소에 걸면 포커스가 입력칸에 있을 때 안 먹는다.
 *
 * <b>핸들러를 ref 로 들고 리스너는 한 번만 거는 이유:</b> 호출부가 인라인 화살표 함수를
 * 넘기면 매 렌더 새 함수라, 그걸 의존성으로 쓰면 렌더마다 리스너를 뗐다 붙인다.
 *
 * `enabled` 를 false 로 주면 안 먹는다 — 모달이 열려 있을 때처럼 뒤쪽 화면이
 * 바뀌면 안 되는 상황에 쓴다.
 */
export function useShortcut(key: string, handler: (() => void) | undefined, enabled = true) {
  const ref = useRef<(() => void) | undefined>(undefined)
  ref.current = enabled ? handler : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== key || e.repeat || !ref.current) return
      e.preventDefault()
      ref.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key])
}
