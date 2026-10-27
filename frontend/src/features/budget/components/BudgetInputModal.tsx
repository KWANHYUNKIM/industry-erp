import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import CodePickerField, { type CodeItem } from '../../../components/CodePickerField'
import { extractErrorMessage } from '../../../api/client'
import NumCheck from '../../../components/NumCheck'
import { fetchBudgetAccount, saveBudgetAccount } from '../api'
import { won } from '../types'
import BudgetMonthModal from './BudgetMonthModal'

interface Row { key: number; id: number | null; dept: string; project: string; remark: string; months: number[] }

/** 원본 예산 칸 — 정해진 줄은 주황 알약(.text-warning-inverse), 없으면 파란 '입력' 링크(견적서 · 특별단가와 같은 알약). */
const SET_TAG = 'inline-block rounded-[6px] px-[1.8px] py-[0.9px] text-[12px] leading-[13.2px] bg-[var(--ec-tag-warn)] text-[var(--ec-bg-panel)] no-underline'
const EMPTY = () => Array(12).fill(0) as number[]
const total = (m: number[]) => m.reduce((s, v) => s + v, 0)

/**
 * 예산입력 창 — 원본 E020201 목록의 [계정명] 링크(2026-10-14 loginaa 실측).
 * 판 기준년도 · 계정(글자) / 격자 (체크) · 부서명 · 프로젝트명 · 예산(있으면 주황 알약 금액, 없으면 파란 '입력').
 * 줄 예산을 누르면 월별예산입력 창. [저장(F8)] 하면 안내 없이 닫힌다. 줄을 지우는 단추는 원본에도 없다.
 */
export default function BudgetInputModal({ open, year, accountId, departments, projects, onClose, onSaved }: {
  open: boolean
  year: number
  accountId: number | null
  departments: CodeItem[]
  projects: CodeItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [initial, setInitial] = useState<Row[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || accountId == null) return
    setError('')
    setPicked(new Set())
    fetchBudgetAccount(year, accountId).then((d) => {
      setLabel(`[${d.accountCode}]${d.accountName}`)
      const saved: Row[] = d.lines.map((l, i) => ({
        key: i, id: l.id, dept: l.departmentId == null ? '' : String(l.departmentId),
        project: l.projectId == null ? '' : String(l.projectId), remark: l.remark ?? '', months: l.months.map(Number),
      }))
      // 원본: 줄이 하나 이하면 빈 줄을 채워 3줄, 저장한 줄이 여럿이면 그 뒤에 빈 줄 3
      const n = saved.length <= 1 ? 3 : saved.length + 3
      const all = [...saved]
      for (let i = saved.length; i < n; i++) all.push({ key: i, id: null, dept: '', project: '', remark: '', months: EMPTY() })
      setRows(all)
      setInitial(all)
    }).catch((e) => setError(extractErrorMessage(e)))
  }, [open, year, accountId])

  const nameOf = (items: CodeItem[], v: string) => {
    const it = items.find((x) => x.value === v)
    return it ? `[${it.code ?? ''}]${it.name}` : '[00]기타'
  }
  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function save() {
    if (accountId == null) return
    setError('')
    try {
      await saveBudgetAccount(year, accountId, rows
        .filter((r) => r.id != null || total(r.months) > 0)
        .map((r) => ({ id: r.id, departmentId: r.dept ? Number(r.dept) : null, projectId: r.project ? Number(r.project) : null,
          remark: r.remark || null, months: r.months })))
      onSaved()
      onClose()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const cur = rows.find((r) => r.key === editing) ?? null
  const sum = rows.reduce((s, r) => s + total(r.months), 0)

  return (
    <Modal open={open} title="예산입력" width={760} error={error} onClose={onClose}>
      <div onKeyDown={(e) => { if (e.key === 'F8' && editing == null) { e.preventDefault(); void save() } }}>
        <ul className="ec-form mb-[8px]">
          <li className="flex items-center gap-[6px] mb-[4px]"><span className="w-[110px] font-bold">기준년도</span><span>{year}</span></li>
          <li className="flex items-center gap-[6px]"><span className="w-[110px] font-bold">계정</span><span>{label}</span></li>
        </ul>
        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[40px]">
                <NumCheck no="" head label="전체선택" on={rows.length > 0 && rows.every((r) => picked.has(r.key))}
                          onChange={(v) => setPicked(v ? new Set(rows.map((r) => r.key)) : new Set())} />
              </th>
              <th>부서명</th>
              <th>프로젝트명</th>
              <th className="text-right w-[160px]">예산</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key}>
                <td className="text-center">
                  <NumCheck no={i + 1} label={`${i + 1}줄 선택`} on={picked.has(r.key)}
                            onChange={(v) => setPicked((s) => { const n = new Set(s); if (v) n.add(r.key); else n.delete(r.key); return n })} />
                </td>
                <td>
                  <CodePickerField label="부서" hideLabel fill emptyLabel="기타" value={r.dept} items={departments}
                                   disabled={r.id != null} onChange={(v) => set(r.key, { dept: v })} />
                </td>
                <td>
                  <CodePickerField label="프로젝트" hideLabel fill emptyLabel="기타" value={r.project} items={projects}
                                   disabled={r.id != null} onChange={(v) => set(r.key, { project: v })} />
                </td>
                <td className="text-right">
                  <button type="button" className={r.id != null || total(r.months) > 0 ? `ec-link ${SET_TAG}` : 'ec-link'}
                          onClick={() => setEditing(r.key)}>
                    {r.id != null || total(r.months) > 0 ? won(total(r.months)) : '입력'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="ec-total">
              <td colSpan={3} className="text-center">합계</td>
              <td className="text-right">{won(sum)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="flex gap-[5px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setRows(initial)}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </div>
      <BudgetMonthModal open={cur != null} year={year} accountLabel={label}
                        deptLabel={cur ? nameOf(departments, cur.dept) : ''} projectLabel={cur ? nameOf(projects, cur.project) : ''}
                        months={cur?.months ?? EMPTY()} remark={cur?.remark ?? ''}
                        onApply={(months, remark) => { if (cur) set(cur.key, { months, remark }); setEditing(null) }}
                        onClose={() => setEditing(null)} />
    </Modal>
  )
}
