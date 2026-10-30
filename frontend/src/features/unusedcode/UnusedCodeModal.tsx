import { useEffect, useRef, useState, type ReactNode } from 'react'
import Modal from '../../components/Modal'
import NumCheck from '../../components/NumCheck'
import { EcCond } from '../../components/EcStatusPanel'
import { ecAlert } from '../../components/EcDialog'
import { api, extractErrorMessage } from '../../api/client'
import { exportTableToXlsx } from '../../utils/excel'
import { EcDateRange } from '../../components/ui/EcDateInput'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * 기준일자 처음값 — 원본(2026-10 loginaa 실측 '2025/10 ~ 2026/12'): 열두 달 전 달 1일 ~ 올해 12월 31일.
 * (원본이 오늘로 이 값을 만드는지 고정값인지는 못 쟀다 — 오늘이 2026/10 이라 이 식과 맞는다.)
 */
function defaultRange(): [string, string] {
  const t = new Date()
  return [ymd(new Date(t.getFullYear() - 1, t.getMonth(), 1)), ymd(new Date(t.getFullYear(), 11, 31))]
}

export interface UnusedColumn<R> { head: string; cell: (r: R) => ReactNode }

/**
 * 원본 [미사용코드조회](재고1 거래처 · 프로젝트 · 품목 · 관리항목 리스트의 [사용중단/재사용 ▴] 펼침).
 * 조건 코드 · 이름 · 기준일자(from ~ to) → [검색(F8)] 하면 그 기간 안 전표에 한 번도 안 쓰인 코드가 리스트와 같은 열로 뜬다.
 * 하단 [사용중단] · [Excel] · [닫기]. 쓰임 판정은 서버(`endpoint?from&to` → 안 쓰인 id 목록)가 한다.
 */
export default function UnusedCodeModal<R extends { id: number; code: string; name: string; active: boolean }>({
  open, title, codeLabel, nameLabel, endpoint, rows, columns, onStop, onClose,
}: {
  open: boolean
  title: string
  codeLabel: string
  nameLabel: string
  /** 안 쓰인 id 목록을 주는 GET 주소 (예: /partners/unused) */
  endpoint: string
  rows: R[]
  columns: UnusedColumn<R>[]
  /** 고른 줄을 사용중단 처리(각 화면이 자기 방식으로). 끝나면 목록을 다시 불러온다. */
  onStop: (targets: R[]) => Promise<void>
  onClose: () => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [[from, to], setRange] = useState<[string, string]>(defaultRange)
  const [ids, setIds] = useState<Set<number> | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)

  useEffect(() => {
    if (open) { setIds(null); setPicked(new Set()); setError('') }
  }, [open])

  async function search() {
    setError('')
    if (!from || !to) { setError('기준일자를 입력 바랍니다.'); return }
    if (from > to) { setError('기준일자의 시작일이 종료일보다 큽니다.'); return }
    try {
      const { data } = await api.get<number[]>(endpoint, { params: { from, to } })
      setIds(new Set(data)); setPicked(new Set())
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  const shown = ids == null ? [] : rows
    .filter((r) => ids.has(r.id) && r.code.includes(code.trim()) && r.name.includes(name.trim()))
    .sort((a, b) => a.code.localeCompare(b.code))
  const allOn = shown.length > 0 && shown.every((r) => picked.has(r.id))

  async function stop() {
    const targets = shown.filter((r) => picked.has(r.id))
    if (targets.length === 0) { void ecAlert('리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.'); return }
    try {
      await onStop(targets)
      setIds((s) => (s ? new Set([...s].filter((id) => !targets.some((t) => t.id === id))) : s))
      setPicked(new Set())
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  return (
    <Modal open={open} title={title} width={900} error={error} onClose={onClose}>
      <ul className="ec-form">
        <EcCond label={codeLabel}><input className="ec-input w-full" value={code} onChange={(e) => setCode(e.target.value)} /></EcCond>
        <EcCond label={nameLabel}><input className="ec-input w-full" value={name} onChange={(e) => setName(e.target.value)} /></EcCond>
        <EcCond label="기준일자" span={2}>
          <EcDateRange from={{ className: "ec-input w-[140px]", 'aria-label': "기준일자 시작", value: from, onChange: (e) => setRange([e.target.value, to]) }} to={{ className: "ec-input w-[140px]", 'aria-label': "기준일자 종료", value: to, onChange: (e) => setRange([from, e.target.value]) }} />
        </EcCond>
      </ul>
      <div className="my-[8px] flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void search()}>검색(F8)</button>
      </div>
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full">
          <thead>
            <tr>
              <th className="w-[34px] text-center">
                <NumCheck tone="plain" no="" label="전체 선택" on={allOn}
                          onChange={() => setPicked(allOn ? new Set() : new Set(shown.map((r) => r.id)))} />
              </th>
              {columns.map((c) => <th key={c.head}>{c.head}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={columns.length + 1} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id} className={r.active ? undefined : 'text-ec-hint'}>
                <td className="text-center">
                  <NumCheck tone="plain" no={i + 1} label="선택" on={picked.has(r.id)}
                            onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                </td>
                {columns.map((c) => <td key={c.head}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-[12px] flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void stop()}>사용중단</button>
        <button type="button" className="ec-btn" onClick={() => { if (tableRef.current) void exportTableToXlsx(tableRef.current, title) }}>Excel</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
