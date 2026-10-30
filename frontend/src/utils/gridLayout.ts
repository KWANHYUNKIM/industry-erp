/**
 * MyPage 위젯 격자 배치 — 원본 ec56 홈의 gridstack 과 같은 규칙(2026-10-30 loginaa 실측).
 *
 *   - 칸 단위: 가로 60px(열 수는 판 폭 ÷ 60) · 세로 60px(사이 10 포함 → 높이 h·60−10).
 *   - 위젯끼리 겹치지 않는다. 옮기거나 늘린 위젯이 자리를 먼저 잡고, 나머지는 비켜 아래로 간다.
 *   - 빈 줄이 생기면 위로 떠오른다(gridstack float:false).
 *
 * 화면(pages/MyPageDashboard.tsx)은 이 순수 함수로만 배치를 바꾼다 — utils/gridLayout.test.ts 가 못 박는다.
 */

export interface GridItem {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** 원본 data-gs-min-height=2. 폭은 원본에 값이 없어 제목 · 아이콘 넷이 들어가는 4칸으로 둔다 */
export const MIN_W = 4
export const MIN_H = 2

export function collides(a: GridItem, b: GridItem): boolean {
  return a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** 판 폭에 맞춰 줄인다 — 열이 줄면 폭을 깎고 왼쪽으로 민다 */
export function clampItem(it: GridItem, cols: number): GridItem {
  const w = Math.max(Math.min(MIN_W, cols), Math.min(Math.round(it.w), cols))
  const h = Math.max(MIN_H, Math.round(it.h))
  const x = Math.max(0, Math.min(Math.round(it.x), cols - w))
  const y = Math.max(0, Math.round(it.y))
  return { ...it, x, y, w, h }
}

/** 이미 놓인 것과 겹치지 않는 가장 위 줄 */
function lowestFreeY(it: GridItem, placed: GridItem[]): number {
  let y = 0
  for (;;) {
    const cand = { ...it, y }
    const hit = placed.filter((p) => collides(cand, p))
    if (hit.length === 0) return y
    y = Math.max(...hit.map((p) => p.y + p.h))
  }
}

const byPos = (a: GridItem, b: GridItem) => a.y - b.y || a.x - b.x

/** 위로 떠오르게 다시 쌓는다(위 → 아래, 왼쪽 → 오른쪽 차례) */
export function compact(items: GridItem[]): GridItem[] {
  const placed: GridItem[] = []
  for (const it of [...items].sort(byPos)) placed.push({ ...it, y: lowestFreeY(it, placed) })
  return items.map((it) => placed.find((p) => p.id === it.id)!)
}

/**
 * 한 위젯을 (x, y, w, h) 로 옮기거나 늘린다. 그 위젯이 자리를 먼저 잡고 나머지는 비켜 쌓인 뒤,
 * 전체가 위로 떠오른다. active 가 목록에 없으면 새로 넣는다(My위젯선택에서 끌어다 놓기).
 */
export function place(items: GridItem[], active: GridItem, cols: number): GridItem[] {
  const a = clampItem(active, cols)
  const others = items.filter((it) => it.id !== a.id).map((it) => clampItem(it, cols)).sort(byPos)
  const placed: GridItem[] = [a]
  for (const it of others) {
    // 원래 자리가 비어 있으면 그대로, 막혔으면 막은 것 아래로
    let y = it.y
    for (;;) {
      const hit = placed.filter((p) => collides({ ...it, y }, p))
      if (hit.length === 0) break
      y = Math.max(...hit.map((p) => p.y + p.h))
    }
    placed.push({ ...it, y })
  }
  const order = items.some((it) => it.id === a.id) ? items.map((it) => it.id) : [...items.map((it) => it.id), a.id]
  const done = compact(placed)
  return order.map((id) => done.find((p) => p.id === id)!)
}

/** 판 폭이 바뀌었거나 저장된 배치가 어긋났을 때 — 줄이고, 겹친 것을 풀고, 띄운다 */
export function normalize(items: GridItem[], cols: number): GridItem[] {
  const placed: GridItem[] = []
  for (const it of items.map((i) => clampItem(i, cols)).sort(byPos)) {
    let y = it.y
    for (;;) {
      const hit = placed.filter((p) => collides({ ...it, y }, p))
      if (hit.length === 0) break
      y = Math.max(...hit.map((p) => p.y + p.h))
    }
    placed.push({ ...it, y })
  }
  const done = compact(placed)
  return items.map((it) => done.find((p) => p.id === it.id)!)
}

/** 순서대로 두 단에 나눠 쌓는다 — 처음 배치 · 옛 순서(mypage-widgets-v1) 옮기기 */
export function twoColumns(ids: string[], cols: number, heightOf: (id: string) => number): GridItem[] {
  const left = Math.max(Math.min(MIN_W, cols), Math.ceil(cols / 2))
  const right = cols - left
  if (right < MIN_W) {
    let y = 0
    return ids.map((id) => { const h = heightOf(id); const it = { id, x: 0, y, w: cols, h }; y += h; return it })
  }
  const bottom = [0, 0]
  return ids.map((id) => {
    const c = bottom[0] <= bottom[1] ? 0 : 1
    const h = heightOf(id)
    const it = { id, x: c === 0 ? 0 : left, y: bottom[c], w: c === 0 ? left : right, h }
    bottom[c] += h
    return it
  })
}

/** 맨 아래 줄 — 판 높이 · 클릭으로 더한 위젯이 놓일 곳 */
export function bottomRow(items: GridItem[]): number {
  return items.reduce((m, it) => Math.max(m, it.y + it.h), 0)
}

/**
 * 원본 기본 배치(28칸 폭에서 잰 것)를 지금 판 폭에 맞춰 줄인다 — 줄이지 않으면 오른쪽 위젯이 판을 넘어
 * 왼쪽으로 밀리며 겹쳐 아래로 떨어진다(26칸에서 전자결재 · 공지사항이 일정관리 밑으로 갔다). 넓으면 그대로.
 */
export function fitWidth(items: GridItem[], cols: number, base: number): GridItem[] {
  if (cols >= base) return items
  const k = cols / base
  return items.map((it) => {
    const x = Math.round(it.x * k)
    return { ...it, x, w: Math.max(Math.min(MIN_W, cols), Math.round((it.x + it.w) * k) - x) }
  })
}
