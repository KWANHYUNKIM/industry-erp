import { useCallback, useState } from 'react'

/**
 * 빈 필수칸 표시 — 원본 `.control-set.has-error` (공용-디자인-정리 A 묶음, 2026-10-20).
 *
 * <p>원본은 필수칸을 비운 채 [저장] 하면 <b>글자 알림 없이</b> 그 칸만 빨간 테두리로 두르고 저장하지 않는다
 * (업무일지 E070304 실측 — 2.7px 바깥 0.5px rgb(215,62,62) · 둥글기 6, 모양은 index.css `.ec-invalid`).
 * 우리는 화면마다 `setError('거래처: 자료를 입력 바랍니다.')` 글줄을 띄웠다. 이 훅이 그 자리를 대신한다.
 *
 * <pre>
 * const req = useRequired()
 * if (!req.check({ partner: !!partnerId, amount: amount > 0 })) return   // 빈 칸이 있으면 표시하고 멈춘다
 * &lt;CodePickerField invalid={req.on('partner', !!partnerId)} … /&gt;
 * &lt;div className={req.cls('amount', amount > 0)}&gt;&lt;input … /&gt;&lt;/div&gt;
 * </pre>
 *
 * <p>check 의 키 차례대로 보고, 빈 칸을 <b>모두</b> 표시한 뒤 첫 빈 칸에 포커스를 둔다(원본도 여러 칸을 한꺼번에 두른다).
 * 칸을 채우면 그 칸의 테두리는 바로 사라진다(on 의 두 번째 인자). 원본 문구가 실측된 화면(말풍선 · 창)은 이 훅을 쓰지 않는다.
 */
export function useRequired() {
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(() => new Set())

  /** 필수칸 { 키: 채워졌나 } — 빈 칸이 하나라도 있으면 표시하고 false. */
  const check = useCallback((fields: Record<string, boolean>) => {
    const empty = Object.keys(fields).filter((k) => !fields[k])
    setInvalid(new Set(empty))
    if (empty.length) {
      // 다시 그린 뒤 첫 빨간 칸의 입력칸에 포커스(읽기 전용 코드도움 이름칸 말고 쓸 수 있는 칸 먼저)
      requestAnimationFrame(() => {
        const box = document.querySelector('.ec-invalid')
        const el = box?.querySelector<HTMLElement>('input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])')
          ?? box?.querySelector<HTMLElement>('input:not([disabled]), button:not([disabled])')
        el?.focus()
      })
    }
    return empty.length === 0
  }, [])

  /** 이 칸을 빨갛게 그릴까 — 마지막 check 에서 비었고, 지금도 비어 있으면. */
  const on = useCallback((key: string, filledNow = false) => invalid.has(key) && !filledNow, [invalid])
  /** 감싸는 상자에 붙일 클래스(`ec-invalid` 또는 ''). */
  const cls = useCallback((key: string, filledNow = false) => (invalid.has(key) && !filledNow ? 'ec-invalid' : ''), [invalid])
  /** [다시 작성] · 새 전표 — 표시를 지운다. */
  const reset = useCallback(() => setInvalid(new Set()), [])

  return { check, on, cls, reset }
}
