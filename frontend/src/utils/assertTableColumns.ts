import { useEffect, type RefObject } from 'react'

/**
 * 표의 `colgroup` · `thead` · `tbody` · `tfoot` 칸 수가 서로 맞는지 개발 모드에서 검사한다.
 *
 * <p><b>왜 필요한가.</b> 그리드에 열을 하나 더할 때 머리글·본문·`colgroup` 은 눈에 보여서 같이 고치는데
 * <b>합계행(tfoot)은 빠뜨리기 쉽다.</b> 그러면 합계 숫자가 엉뚱한 열 아래에 서는데,
 * 기본 상태에서는 칸 수가 우연히 맞아 안 보이고 <b>선택 열을 켤 때만</b> 어긋난다.
 * 실제로 판매입력·판매조회 두 곳에서 이 실수가 났고, 사람 눈이 아니라 이 검사로 잡혔다.
 *
 * <p>API 테스트(qa/qa.mjs)로는 잡을 수 없는 종류다 — 렌더된 DOM 을 봐야 안다.
 * 운영 빌드에서는 아무 일도 하지 않는다.
 *
 * @param ref  검사할 `<table>` 을 담은 컨테이너(또는 table 자체)
 * @param name 어긋났을 때 콘솔에 찍을 이름
 * @param deps 열 구성이 바뀌는 값들(예: 선택 열 상태). 바뀔 때마다 다시 잰다.
 */
export function useTableColumnCheck(
  ref: RefObject<HTMLElement | null>,
  name: string,
  deps: unknown[],
) {
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const root = ref.current
    if (!root) return
    const table = root instanceof HTMLTableElement ? root : root.querySelector('table')
    if (!table) return

    const span = (tr: HTMLTableRowElement | null) =>
      tr ? [...tr.cells].reduce((a, c) => a + (c.colSpan || 1), 0) : 0

    const col = table.querySelectorAll('colgroup col').length
    const th = span(table.tHead?.rows[0] ?? null)
    // "내역이 없습니다" 같은 한 칸짜리 안내행은 건너뛴다
    const bodyRow = [...(table.tBodies[0]?.rows ?? [])].find((r) => r.cells.length > 1) ?? null
    const td = span(bodyRow)
    const tf = span(table.tFoot?.rows[0] ?? null)

    const parts = { colgroup: col, thead: th, tbody: td, tfoot: tf }
    const counts = Object.values(parts).filter((v) => v > 0)
    if (new Set(counts).size > 1) {
      console.error(
        `[표 열 어긋남] ${name} — 합계행이나 colgroup 을 같이 안 고쳤을 가능성이 큽니다.`,
        parts,
      )
    }
  }, deps)   // eslint-disable-line react-hooks/exhaustive-deps
}
