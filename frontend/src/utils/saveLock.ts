/**
 * 저장 중복 잠금 — 공용 전표 셸(EcSlipShell)의 [저장] · [저장/…] · F8 · F7 · 폼 제출이 함께 쓴다.
 *
 * 저장을 한 번 받으면 잠그고, <b>그 뒤로 도는 요청이 다 끝날 때까지</b> 다음 저장을 버린다.
 * 화면이 저장 요청을 언제 끝내는지 셸은 모르므로, 공용 API 클라이언트의 도는 요청 수(api/client
 * requestsInFlight · onRequestsIdle)로 본다. 화면이 useSubmitting 으로 따로 막고 있어도 겹쳐서 문제없다.
 *
 * - <b>같은 작업(task) 안</b>에서 다시 부르면 통과시킨다: type="submit" 단추는 click(onClick) 다음에 바로
 *   submit 이벤트가 이어지는데, 둘 다 같은 한 번의 누름이다.
 * - 저장 처리가 첫 요청을 내기 전에 확인 창(ecConfirm)을 띄우면 그동안은 요청이 없어 잠금이 풀린다 —
 *   창이 화면을 덮으므로 두 번 누를 수 없다.
 * - 놓기는 setTimeout(0) 뒤에 다시 센다: 응답 하나가 끝난 직후 화면이 다음 요청(조회 → 저장)을
 *   마이크로태스크에서 내는 사이에 풀리지 않게.
 */
export interface SaveLockDeps {
  inFlight: () => number
  onIdle: (fn: () => void) => () => void
  /** 테스트용 — 기본 setTimeout(fn, 0) */
  later?: (fn: () => void) => void
}

export function createSaveLock(deps: SaveLockDeps, onChange?: (locked: boolean) => void) {
  const later = deps.later ?? ((fn: () => void) => { setTimeout(fn, 0) })
  let locked = false
  let sameTask = false
  let cancelIdle: (() => void) | null = null

  const release = () => {
    cancelIdle = null
    locked = false
    onChange?.(false)
  }
  const check = () => later(() => {
    if (deps.inFlight() > 0) cancelIdle = deps.onIdle(check)
    else release()
  })

  return {
    /** 저장을 받아도 되나. true 면 잠그고 진행, false 면 버린다. */
    tryLock(): boolean {
      if (locked) return sameTask
      locked = true
      sameTask = true
      later(() => { sameTask = false })
      onChange?.(true)
      check()
      return true
    },
    isLocked: () => locked,
    /** 화면이 사라질 때 */
    dispose() { cancelIdle?.(); cancelIdle = null },
  }
}
