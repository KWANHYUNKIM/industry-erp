/**
 * 회계거래현황 ○집계 — 전표를 집계조건(최대 4개)으로 묶어 집계대상 합을 낸다(2026-10-22 loginaa 실측).
 *
 * 실측: 월별 + 거래처 + [공급가액 · 합계] 는 '월 칸 rowSpan · 거래처 · 공급가액 · 합계' 에 달마다 [YYYY/MM 계](앞 칸들 묶음) · 끝 [합계].
 * 거래처 없는 전표는 이름이 빈 묶음으로 달 안에서 맨 앞(코드순에서 빈 코드가 먼저). 비교기간은 같은 길이의 지난 구간을 옆에 붙인다
 * (전월 = 시작 · 끝을 한 달씩 앞으로). 비율은 전체 합 대비 정수 %(0 이면 빈칸). 코드포함은 이름 앞에 코드 칸.
 */
export const DATE_KEYS = ['일별', '주차별', '월별', '분기별', '반기별', '연별'] as const
export interface AggGroupDef { group: string; items: string[] }
export const AGG_GROUPS: AggGroupDef[] = [
  { group: '기준일자', items: [...DATE_KEYS] },
  { group: '회계 I', items: ['부서', '관리번호', '부가세유형'] },
  { group: '거래처', items: ['거래처', '거래처그룹1', '거래처그룹2'] },
  { group: '프로젝트', items: ['프로젝트', '프로젝트그룹1', '프로젝트그룹2'] },
]
/** 회계거래현황의 집계대상(2026-10-22 실측). 지출결의서이체리스트는 금액 · 외화금액 · 수수료 셋이다. */
export const TARGETS = ['공급가액', '부가세', '수수료', '원천징수', '합계(수수료포함)', '외화금액', '외화차손익합계', '합계'] as const
export const TRANSFER_TARGETS = ['금액', '외화금액', '수수료'] as const
export type Target = string
export const isDateKey = (k: string) => (DATE_KEYS as readonly string[]).includes(k)
/** 지출결의서이체리스트의 집계조건(2026-10-22 실측) — 일별 … 연별 · 계정 · 부서 · 거래처(+그룹) · 프로젝트(+그룹), 소제목 없이 한 줄씩. */
export const TRANSFER_GROUPS: AggGroupDef[] = [
  { group: '', items: [...DATE_KEYS, '계정', '부서', '거래처', '거래처그룹1', '거래처그룹2', '프로젝트', '프로젝트그룹1', '프로젝트그룹2'] },
]
export const COMPARES = ['사용안함', '전년동일기간', '전월동일기간', '전주동일기간', '전일동일기간'] as const
export type Compare = (typeof COMPARES)[number]

/** 집계에 들어가는 전표 한 장(화면이 회계전표에서 만든다). */
export interface AggEntry {
  date: string // yyyy-MM-dd
  partner: string; partnerCode: string
  dept: string; deptCode: string
  project: string; projectCode: string
  account?: string; accountCode?: string
  /** 집계대상 이름 → 값 */
  vals: Record<string, number>
}

export interface AggCond { key: string; sort: string; desc: boolean }
export interface AggNode {
  key: string; label: string; code: string
  /** 기간(비교기간이면 둘)마다 집계대상 합 */
  sums: Record<string, number>[]
  children: AggNode[]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 날짜 묶음 이름. 일별 2026/09/28 · 월별 2026/09 · 연별 2026 (나머지는 원본 모양을 못 재서 짐작). */
export function dateLabel(key: string, d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  if (key === '일별') return `${y}/${pad(m)}/${pad(day)}`
  if (key === '월별') return `${y}/${pad(m)}`
  if (key === '분기별') return `${y}/${Math.ceil(m / 3)}분기`
  if (key === '반기별') return `${y}/${m <= 6 ? '상' : '하'}반기`
  if (key === '연별') return `${y}`
  const t = new Date(y, m - 1, day)
  const jan1 = new Date(y, 0, 1)
  const week = Math.floor(((t.getTime() - jan1.getTime()) / 86400000 + jan1.getDay()) / 7) + 1
  return `${y}/${pad(week)}주`
}

function groupOf(key: string, e: AggEntry): { label: string; code: string } {
  if (isDateKey(key)) { const l = dateLabel(key, e.date); return { label: l, code: l } }
  if (key === '부서') return { label: e.dept, code: e.deptCode }
  if (key === '계정') return { label: e.account ?? '', code: e.accountCode ?? '' }
  if (key === '프로젝트') return { label: e.project, code: e.projectCode }
  if (key === '거래처') return { label: e.partner, code: e.partnerCode }
  return { label: '', code: '' } // 관리번호 · 부가세유형 · 그룹 — 전표에 이 값이 아직 없다
}

/** 기간별 전표 목록 → 묶음 나무. periods[0] 이 조회 기간, 그 뒤는 비교기간. */
export function buildTree(periods: AggEntry[][], conds: AggCond[], targets: Target[]): AggNode {
  const root: AggNode = { key: '', label: '', code: '', sums: periods.map(() => ({})), children: [] }
  const add = (n: AggNode, p: number, e: AggEntry) => {
    for (const t of targets) n.sums[p][t] = (n.sums[p][t] ?? 0) + (e.vals[t] ?? 0)
  }
  periods.forEach((es, p) => {
    for (const e of es) {
      add(root, p, e)
      let node = root
      for (const c of conds) {
        const g = groupOf(c.key, e)
        let child = node.children.find((x) => x.key === g.label)
        if (!child) {
          child = { key: g.label, label: g.label, code: g.code, sums: periods.map(() => ({})), children: [] }
          node.children.push(child)
        }
        add(child, p, e)
        node = child
      }
    }
  })
  const sortLevel = (n: AggNode, depth: number) => {
    const c = conds[depth]
    if (!c) return
    const dir = c.desc ? -1 : 1
    n.children.sort((a, b) => {
      if (c.sort === '시간순' || c.sort === '코드순') return a.code < b.code ? -dir : a.code > b.code ? dir : 0
      if (c.sort === '시간역순' || c.sort === '코드역순') return a.code < b.code ? dir : a.code > b.code ? -dir : 0
      const av = a.sums[0][c.sort] ?? 0
      const bv = b.sums[0][c.sort] ?? 0
      return (bv - av) * dir
    })
    n.children.forEach((x) => sortLevel(x, depth + 1))
  }
  sortLevel(root, 0)
  return root
}

/** 비교기간 — 조회 구간을 한 단위 앞으로 민다(전월은 시작 · 끝 각각 한 달). */
export function shiftPeriod(from: string, to: string, kind: Compare): { from: string; to: string } {
  const sh = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    if (kind === '전년동일기간') return fmt(new Date(y - 1, m - 1, Math.min(day, new Date(y - 1, m, 0).getDate())))
    if (kind === '전월동일기간') return fmt(new Date(y, m - 2, Math.min(day, new Date(y, m - 1, 0).getDate())))
    return fmt(new Date(y, m - 1, day - (kind === '전주동일기간' ? 7 : 1)))
  }
  return { from: sh(from), to: sh(to) }
}
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 비율표시 — 전체 합 대비 정수 %. 0 이면 빈칸(원본 건축자재판매장 0.38% → 빈칸). */
export function percentOf(v: number, total: number): string {
  if (!total) return ''
  const p = Math.round((v / total) * 100)
  return p === 0 ? '' : String(p)
}
