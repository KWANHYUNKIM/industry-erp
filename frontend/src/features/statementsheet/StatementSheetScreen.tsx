import { useCallback, useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcNumInput from '../../components/EcNumInput'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcDateInput from '../../components/ui/EcDateInput'
import { pad2 } from '../../utils/periods'

/**
 * 회계기수마다 한 장을 저장하는 재무제표 — 현금흐름표(E010861) · 이익잉여금처분계산서(E010817). 2026-10-20 loginaa 실측.
 *
 * <p>원본: 목록(회계기수마다 한 줄, 빈 목록 '등록된 데이터가 없습니다.') · 아래 [신규(F2)] · [Excel](현금흐름표).
 * [신규(F2)] 창 — 현금흐름표: 회계기수 [17] 기 · 기간 2026/01 ~ 2026/12 · 대상항목 ◉전체 ○선택 / 이익잉여금처분계산서: 회계기수 · 기간 ·
 * 처분확정일(기본 오늘). [저장(F8)] [닫기]. 줄의 [입력](현금흐름) · 회계기수 글자(이익잉여금)를 누르면 항목 금액 창 — 항목명 | 금액,
 * [계산식 적용] [저장(F8)] [삭제] [닫기]. 회계기수 글자를 누르면 머리 창에 [삭제] 가 붙고, 여기서 지우면 그 줄이 목록에서 빠진다
 * (금액 창의 [삭제] 는 금액만 비운다 — 줄은 남았다).
 * 원본 [계산식 적용] 은 계산식을 설정하지 않은 판에서 0 그대로였다. 우리는 세부 줄을 묶음 줄로 더한다(아래 sum).
 */
export interface SheetItem {
  key: string
  label: string
  /** 묶음 · 계산 줄(굵게, 원본 이익잉여금은 오른쪽 칸) — sum 이 있으면 [계산식 적용] 이 채운다. */
  group?: boolean
  /** 빈 과목 줄 — 과목명을 손으로 넣는다(원본 이익잉여금 빈 줄). */
  free?: boolean
  /** 들여쓰기 단계 1 · 2 */
  indent?: 1 | 2
  sum?: { key: string; sign: 1 | -1 }[]
}

export interface SheetConfig {
  kind: 'CASH_FLOW' | 'RETAINED_EARNINGS'
  title: string
  items: SheetItem[]
  /** 목록 열 — 항목 key 와 머리 글자 */
  listCols: { key: string; label: string }[]
  /** 현금흐름표는 [입력] 열 · 대상항목, 이익잉여금은 처분확정일 · 두 칸 금액 */
  inputColumn: boolean
  settleDate: boolean
  twoColumns: boolean
}

interface Line { key: string; label: string | null; amount: number | null }
interface Sheet {
  id: number; kind: string; termNo: number; fromYm: string; toYm: string
  settleDate: string | null; allItems: boolean; lines: Line[]
}

const ymText = (ym: string) => ym.replace('-', '/')
const fmt = (n: number) => (n ? n.toLocaleString('ko-KR') : '0')
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

function amountOf(s: Sheet, key: string) {
  return Number(s.lines.find((l) => l.key === key)?.amount ?? 0)
}

/** 묶음 줄을 세부 줄 합으로 — 뒤 묶음이 앞 묶음을 쓰므로 차례대로 두 번 돈다. */
function applyFormulas(items: SheetItem[], values: Record<string, string>) {
  const next = { ...values }
  for (let pass = 0; pass < 2; pass++) {
    for (const it of items) {
      if (!it.sum) continue
      const v = it.sum.reduce((a, s) => a + s.sign * Number(next[s.key] || 0), 0)
      next[it.key] = String(v)
    }
  }
  return next
}

export default function StatementSheetScreen({ config }: { config: SheetConfig }) {
  const now = new Date()
  const [rows, setRows] = useState<Sheet[]>([])
  const [head, setHead] = useState<{ id?: number; termNo: string; fromY: number; fromM: number; toY: number; toM: number; settleDate: string; allItems: boolean } | null>(null)
  const [detail, setDetail] = useState<Sheet | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, config.title, [])

  const load = useCallback(() => {
    api.get<Sheet[]>('/statement-sheets', { params: { kind: config.kind } })
      .then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }, [config.kind])
  useEffect(load, [load])

  function openNew() {
    const nextTerm = rows.length ? Math.max(...rows.map((r) => r.termNo)) + 1 : 1
    setError('')
    setHead({ termNo: String(nextTerm), fromY: now.getFullYear(), fromM: 1, toY: now.getFullYear(), toM: 12, settleDate: todayIso(), allItems: true })
  }

  function openHead(s: Sheet) {
    setError('')
    const [fy, fm] = s.fromYm.split('-').map(Number)
    const [ty, tm] = s.toYm.split('-').map(Number)
    setHead({ id: s.id, termNo: String(s.termNo), fromY: fy, fromM: fm, toY: ty, toM: tm, settleDate: s.settleDate ?? todayIso(), allItems: s.allItems })
  }

  async function saveHead() {
    if (!head) return
    if (!head.termNo || Number(head.termNo) < 1) { await ecAlert('회계기수를 입력 바랍니다.'); return }
    const body = {
      kind: config.kind, termNo: Number(head.termNo),
      fromYm: `${head.fromY}-${pad2(head.fromM)}`, toYm: `${head.toY}-${pad2(head.toM)}`,
      settleDate: config.settleDate ? head.settleDate || null : null, allItems: head.allItems,
    }
    try {
      if (head.id) await api.put(`/statement-sheets/${head.id}`, body)
      else await api.post('/statement-sheets', body)
      setHead(null)
      load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  async function deleteSheet(id: number) {
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try {
      await api.delete(`/statement-sheets/${id}`)
      setHead(null)
      setDetail(null)
      load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  function openDetail(s: Sheet) {
    setError('')
    const v: Record<string, string> = {}
    const lb: Record<string, string> = {}
    for (const l of s.lines) { v[l.key] = l.amount == null ? '' : String(l.amount); if (l.label) lb[l.key] = l.label }
    setValues(v)
    setLabels(lb)
    setDetail(s)
  }

  async function saveDetail() {
    if (!detail) return
    const lines = config.items.map((it) => ({
      key: it.key, label: it.free ? labels[it.key] || null : null, amount: Number(values[it.key] || 0),
    }))
    try {
      await api.put(`/statement-sheets/${detail.id}/lines`, { lines, settleDate: null })
      setDetail(null)
      load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  async function clearDetail() {
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    setValues({})
    setLabels({})
    if (!detail) return
    try {
      await api.put(`/statement-sheets/${detail.id}/lines`, { lines: [], settleDate: null })
      setDetail(null)
      load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }

  const termText = (s: Sheet) => config.kind === 'CASH_FLOW'
    ? `${s.termNo}(${ymText(s.fromYm)} ~ ${ymText(s.toYm)})`
    : `${s.termNo} (${ymText(s.fromYm)} ~ ${ymText(s.toYm)} )`
  const colCount = 1 + (config.inputColumn ? 1 : 0) + config.listCols.length + 1
  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <EcListShell
      title={config.title}
      onNew={openNew}
      newLabel="신규(F2)"
      actions={config.inputColumn ? [{ label: 'Excel' }] : []}
    >
      {error && !head && !detail && <p className="ec-alert mb-[6px]">{error}</p>}
      <table ref={tableRef} className="ec-head700 w-full text-left">
        <thead>
          <tr>
            {config.inputColumn ? <th className="text-center">회계기수(기간)</th> : <th className="text-center">회계기수</th>}
            {config.inputColumn && <th className="text-center">입력</th>}
            {config.listCols.map((c) => <th key={c.key} className="text-center">{c.label}</th>)}
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={colCount} className="ec-empty">등록된 데이터가 없습니다.</td></tr>}
          {rows.map((s) => (
            <tr key={s.id}>
              <td className="text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); if (config.inputColumn) openHead(s); else openDetail(s) }}>{termText(s)}</a>
              </td>
              {config.inputColumn && (
                <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); openDetail(s) }}>입력</a></td>
              )}
              {config.listCols.map((c) => (
                <td key={c.key} className="text-right">{s.lines.length || !config.inputColumn ? fmt(amountOf(s, c.key)) : ''}</td>
              ))}
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); openDetail(s) }}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={head != null} title={config.title} width={560} error={error} onClose={() => setHead(null)}>
        {head && (
          <>
            <ul className="ec-cond mb-[10px]">
              <li className="flex items-center gap-[6px] mb-[6px]">
                <span className="w-[93px]">회계기수</span>
                <input className="ec-input w-[120px] text-right" aria-label="회계기수" value={head.termNo}
                  onChange={(e) => setHead({ ...head, termNo: e.target.value.replace(/[^0-9]/g, '') })} />
                {config.inputColumn && <span>기</span>}
              </li>
              <li className="flex items-center gap-[4px] mb-[6px]">
                <span className="w-[93px]">기간</span>
                <select className="ec-input w-[80px]" aria-label="시작년" value={head.fromY} onChange={(e) => setHead({ ...head, fromY: Number(e.target.value) })}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>/
                <select className="ec-input w-[60px]" aria-label="시작월" value={head.fromM} onChange={(e) => setHead({ ...head, fromM: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{pad2(m)}</option>)}
                </select>
                <span className="mx-[4px]">~</span>
                <select className="ec-input w-[80px]" aria-label="끝년" value={head.toY} onChange={(e) => setHead({ ...head, toY: Number(e.target.value) })}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>/
                <select className="ec-input w-[60px]" aria-label="끝월" value={head.toM} onChange={(e) => setHead({ ...head, toM: Number(e.target.value) })}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{pad2(m)}</option>)}
                </select>
              </li>
              {config.settleDate && (
                <li className="flex items-center gap-[6px] mb-[6px]">
                  <span className="w-[93px]">처분확정일</span>
                  <EcDateInput className="ec-input w-[145px]" aria-label="처분확정일" value={head.settleDate} onChange={(e) => setHead({ ...head, settleDate: e.target.value })} />
                </li>
              )}
              {config.inputColumn && (
                <li className="flex items-center gap-[10px]">
                  <span className="w-[93px]">대상항목</span>
                  <label><input type="radio" checked={head.allItems} onChange={() => setHead({ ...head, allItems: true })} /> 전체</label>
                  <label><input type="radio" checked={!head.allItems} onChange={() => setHead({ ...head, allItems: false })} /> 선택</label>
                </li>
              )}
            </ul>
            <div className="flex gap-[4px]">
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveHead()}>저장(F8)</button>
              {head.id != null && <button type="button" className="ec-btn" onClick={() => void deleteSheet(head.id!)}>삭제</button>}
              <button type="button" className="ec-btn" onClick={() => setHead(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={detail != null} title={config.title} width={config.twoColumns ? 720 : 560} error={error} onClose={() => setDetail(null)}>
        {detail && (
          <>
            {config.settleDate && (
              <p className="mb-[6px]">
                회계기수 {detail.termNo} · 기간 {ymText(detail.fromYm)} ~ {ymText(detail.toYm)} · 처분확정일 {detail.settleDate ?? ''}
                {' '}<a href="#" onClick={(e) => { e.preventDefault(); openHead(detail) }}>수정</a>
              </p>
            )}
            <table className="w-full text-left mb-[8px]">
              <thead>
                <tr>
                  <th>{config.twoColumns ? '과목' : '항목명'}</th>
                  <th className="text-center" colSpan={config.twoColumns ? 2 : 1}>금액</th>
                </tr>
              </thead>
              <tbody>
                {config.items.map((it) => {
                  const cell = (
                    <EcNumInput className="ec-input w-full text-right" aria-label={`${it.label || it.key} 금액`}
                      value={values[it.key] ?? '0'} onValue={(v) => setValues({ ...values, [it.key]: v })} />
                  )
                  return (
                    <tr key={it.key}>
                      <td className={`${it.group ? 'font-bold' : ''} ${it.indent === 2 ? 'pl-[30px]' : it.indent === 1 ? 'pl-[15px]' : ''}`}>
                        {it.free
                          ? <input className="ec-input w-full" aria-label="과목명" value={labels[it.key] ?? ''} onChange={(e) => setLabels({ ...labels, [it.key]: e.target.value })} />
                          : it.label}
                      </td>
                      {config.twoColumns
                        ? (<><td className="w-[150px]">{!it.group && cell}</td><td className="w-[150px]">{it.group && cell}</td></>)
                        : <td className="w-[180px]">{cell}</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex gap-[4px]">
              {config.inputColumn && (
                <button type="button" className="ec-btn" onClick={() => setValues(applyFormulas(config.items, values))}>계산식 적용</button>
              )}
              <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveDetail()}>저장(F8)</button>
              <button type="button" className="ec-btn" onClick={() => void (config.inputColumn ? clearDetail() : deleteSheet(detail.id))}>삭제</button>
              <button type="button" className="ec-btn" onClick={() => setDetail(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>
    </EcListShell>
  )
}
