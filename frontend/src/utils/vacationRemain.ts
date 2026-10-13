/**
 * 휴가사용실적현황의 <b>쓸 때마다 줄어드는 잔여</b>.
 *
 * <p>연차 잔여에서 빠지는 것은 <b>승인된 연차·반차</b>뿐이다 — 서버 휴가잔여일수현황
 * (HrService.DEDUCTS_ANNUAL)과 같은 규칙이다. 예전 화면은 승인된 줄이면 종류를 안 보고
 * 다 뺐다. 경조휴가 3일을 쓰면 이 화면의 마지막 잔여는 9일, 휴가잔여일수현황은 12일 —
 * 같은 사람의 같은 연차를 두 화면이 다르게 말했다.
 */
export const DEDUCTS_ANNUAL: ReadonlySet<string> = new Set(['연차', '반차'])

export interface VacationUseRow {
  id: number
  empName: string
  type: string
  startDate: string
  days: number
  status: string
}

export interface RemainLine<R> {
  row: R
  /** 사원 첫 줄에만 휴가일수(부여)를 싣는다. */
  grant: number | null
  /** 이 줄까지 뺀 잔여. 부여일수를 모르면 null. */
  remain: number | null
  first: boolean
}

/** 사원별로 묶고(이름순), 사원 안에서는 시작일·id 순으로 잔여를 누적해 뺀다. */
export function withRemain<R extends VacationUseRow>(rows: R[], grants: Map<string, number>): RemainLine<R>[] {
  const byEmp = new Map<string, R[]>()
  for (const r of rows) {
    if (!byEmp.has(r.empName)) byEmp.set(r.empName, [])
    byEmp.get(r.empName)!.push(r)
  }
  const out: RemainLine<R>[] = []
  for (const [name, list] of [...byEmp.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id)
    const grant = grants.get(name)
    let remain = grant ?? null
    list.forEach((row, idx) => {
      if (remain != null && row.status === 'APPROVED' && DEDUCTS_ANNUAL.has(row.type)) {
        remain = Math.round((remain - row.days) * 1000) / 1000
      }
      out.push({ row, grant: idx === 0 ? (grant ?? null) : null, remain, first: idx === 0 })
    })
  }
  return out
}
