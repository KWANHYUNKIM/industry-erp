import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import type { JournalEntry } from '../../types/api'

interface JournalList { rows: JournalEntry[]; totalRows: number; truncated: boolean }

const thisMonth = () => new Date().toISOString().slice(0, 7)
const slashMonth = (m: string) => m.replace('-', '/')

/**
 * 회계 I &gt; 출력물 &gt; 기타 &gt; <b>잔액재집계</b>(E010705) — 2026-10-20 loginaa 실측(버튼은 누르지 않음 — 회사 전체 잔액을 다시 매긴다).
 *
 * <p>원본 판: 시작월(2026/03) · 종료월(2026/10, 금월) 두 칸, 그 아래 안내 한 줄
 * '2026/03 이후에 수정된 전표가 있으므로 재집계를 해야 정확한 잔액을 확인할 수 있습니다.', 그 아래 [잔액재집계(F8)] 하나. 머리는 도움말만.
 * 시작월은 <b>잔액을 다시 매겨야 하는 가장 이른 달</b> — 고친 전표 가운데 전표일자가 가장 이른 달이다.
 *
 * <p>우리는 잔액을 따로 쌓아 두지 않고 장부 · 시산표를 열 때마다 분개에서 바로 더한다 — 다시 매길 것이 없다.
 * 그래서 [잔액재집계(F8)]는 확인 창을 띄우고, 확인하면 다 되었다고만 알린다(원본과 같은 자리에서 같은 말이 나오게).
 */
export default function BalanceRecalcPage() {
  const [fromM, setFromM] = useState(thisMonth())
  const [toM, setToM] = useState(thisMonth())
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const year = new Date().getFullYear()
    api.get<JournalList>('/journals', { params: { from: `${year}-01-01`, to: `${year}-12-31`, all: true } })
      .then((r) => {
        const touched = r.data.rows.filter((e) => e.updatedAt && e.createdAt && e.updatedAt.slice(0, 19) !== e.createdAt.slice(0, 19))
        if (touched.length === 0) return
        const first = touched.map((e) => e.entryDate.slice(0, 7)).sort()[0]
        setFromM(first)
        setDirty(true)
      })
      .catch(() => setDirty(false))
  }, [])

  async function recalc() {
    if (!(await ecConfirm(`${slashMonth(fromM)} ~ ${slashMonth(toM)} 잔액을 재집계하시겠습니까?`))) return
    setDirty(false)
    await ecAlert('잔액재집계가 완료되었습니다.')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F8') { e.preventDefault(); void recalc() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
