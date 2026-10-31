import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { ecAlert } from '../../components/EcDialog'
import type { JournalEntry } from '../../types/api'
import { ymd, pad2 } from '../../utils/periods'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }

const thisMonth = () => ymd(new Date()).slice(0, 7)
const slashMonth = (m: string) => m.replace('-', '/')
const LAST_KEY = 'erp.balanceRecalcAt'
const lastRecalcAt = (): number | null => { try { return Number(localStorage.getItem(LAST_KEY)) || null } catch { return null } }
/** 원본 '2026-10-22 00:53:17' 꼴 */
const stamp = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` }
/** 시작월 ~ 종료월 사이의 달 목록 */
const monthsBetween = (a: string, b: string) => {
  const out: string[] = []
  let [y, m] = a.split('-').map(Number)
  const [ey, em] = b.split('-').map(Number)
  while ((y < ey || (y === ey && m <= em)) && out.length < 120) { out.push(`${y}-${pad2(m)}`); m += 1; if (m > 12) { m = 1; y += 1 } }
  return out
}

/**
 * 회계 I &gt; 출력물 &gt; 기타 &gt; <b>잔액재집계</b>(E010705) — 2026-10-20 loginaa 실측(버튼은 누르지 않음 — 회사 전체 잔액을 다시 매긴다).
 *
 * <p>원본 판: 시작월(2026/03) · 종료월(2026/10, 금월) 두 칸, 그 아래 안내 한 줄
 * '2026/03 이후에 수정된 전표가 있으므로 재집계를 해야 정확한 잔액을 확인할 수 있습니다.', 그 아래 [잔액재집계(F8)] 하나. 머리는 도움말만.
 * 시작월은 <b>잔액을 다시 매겨야 하는 가장 이른 달</b> — 고친 전표 가운데 전표일자가 가장 이른 달이다.
 *
 * <p>우리는 잔액을 따로 쌓아 두지 않고 장부 · 시산표를 열 때마다 분개에서 바로 더한다 — 다시 매길 것이 없다.
 * 그래서 [잔액재집계(F8)]는 다 되었다고만 알린다.
 *
 * <p>2026-10-22 원본 실측: 누르면 <b>확인 창 없이</b> 바로 돌고, 폼 자리에 판 하나 — '2026/08 부터 2026/10 까지 잔액 재집계가 되었습니다.' +
 * 달마다 한 칸(2026/08 ✓ · 2026/09 ✓ · 2026/10 ✓) + [이전]. 다시 열면 시작월이 금월로 돌아가고 안내 줄이 없다. 마지막 재집계 뒤 2분 안에 또 누르면
 * 알림 '최종 재집계 시간으로부터 2분이 경과한 후에 진행할 수 있습니다. 재집계 가능 시간 : 2026-10-22 00:53:17 이후' + [확인].
 */
export default function BalanceRecalcPage() {
  const [fromM, setFromM] = useState(thisMonth())
  const [toM, setToM] = useState(thisMonth())
  const [dirty, setDirty] = useState(false)
  /** 재집계를 마친 화면 — 원본은 폼 자리에 '… 잔액 재집계가 되었습니다.' 판과 [이전] 을 띄운다. */
  const [done, setDone] = useState<{ from: string; to: string } | null>(null)

  useEffect(() => {
    const year = new Date().getFullYear()
    api.get<JournalList>('/journals', { params: { from: `${year}-01-01`, to: `${year}-12-31`, all: true } })
      .then((r) => {
        /* 마지막 재집계 뒤에 고친 전표만 센다 — 재집계하면 시작월이 금월로 돌아간다(원본 실측) */
        const last = lastRecalcAt()
        const touched = r.data.rows.filter((e) => e.updatedAt && e.createdAt && e.updatedAt.slice(0, 19) !== e.createdAt.slice(0, 19)
          && (!last || new Date(e.updatedAt).getTime() > last))
        if (touched.length === 0) return
        const first = touched.map((e) => e.entryDate.slice(0, 7)).sort()[0]
        setFromM(first)
        setDirty(true)
      })
      .catch(() => setDirty(false))
  }, [])

  async function recalc() {
    /* 원본: 확인 창 없이 바로 돈다. 단 마지막 재집계 뒤 2분이 안 지났으면 막는다. */
    const last = lastRecalcAt()
    if (last && Date.now() - last < 120_000) {
      await ecAlert(`최종 재집계 시간으로부터 2분이 경과한 후에 진행할 수 있습니다.\n재집계 가능 시간 : ${stamp(last + 120_000)} 이후`)
      return
    }
    try { localStorage.setItem(LAST_KEY, String(Date.now())) } catch { /* 저장소가 막혀 있어도 재집계 자체는 된다 */ }
    setDirty(false)
    setDone({ from: fromM, to: toM })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); void recalc() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (done) {
    return (
      <EcListShell title="잔액재집계" searchable={false} option={false}>
        <div className="panel">
          <div className="panel-heading text-center mb-[8px]">{slashMonth(done.from)} 부터 {slashMonth(done.to)} 까지 잔액 재집계가 되었습니다.</div>
          <div className="panel-body text-center">
            {monthsBetween(done.from, done.to).map((m) => (
              <div key={m} className="mb-[4px]">{slashMonth(m)} <span className="text-ec-success" aria-label="완료">✓</span></div>
            ))}
            <button type="button" className="ec-btn mt-[8px]" onClick={() => { setDone(null); setFromM(thisMonth()) }}>이전</button>
          </div>
        </div>
      </EcListShell>
    )
  }
  return (
    <EcListShell title="잔액재집계" searchable={false} option={false}>
      <ul className="ec-cond mb-[8px]">
        <EcCond label="시작월">
          <input type="month" className="ec-input w-[130px]" aria-label="시작월" value={fromM} onChange={(e) => setFromM(e.target.value)} />
        </EcCond>
        <EcCond label="종료월">
          <input type="month" className="ec-input w-[130px]" aria-label="종료월" value={toM} onChange={(e) => setToM(e.target.value)} />
        </EcCond>
      </ul>
      {dirty && <p className="mb-[8px]">{slashMonth(fromM)} 이후에 수정된 전표가 있으므로 재집계를 해야 정확한 잔액을 확인할 수 있습니다.</p>}
      <button type="button" className="ec-btn ec-btn-primary" onClick={() => void recalc()}>잔액재집계(F8)</button>
    </EcListShell>
  )
}
