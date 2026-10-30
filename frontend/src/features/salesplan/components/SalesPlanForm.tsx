import { useEffect, useRef, useState, type ReactNode } from 'react'
import GridFindButton from '../../../components/GridFindButton'
import { api, extractErrorMessage } from '../../../api/client'
import CodePickerField from '../../../components/CodePickerField'
import { ymd } from '../../../components/EcPeriodPicks'
import { ecConfirm } from '../../../components/EcDialog'
import { useCondPickers } from '../../../utils/useCondPickers'
import { useShortcut } from '../../../utils/useShortcut'
import EcDateInput from '../../../components/ui/EcDateInput'

/** 서버 한 줄 — 같은 planNo 의 줄들이 한 전표다(매출계획조회 · 입력이 같이 쓴다). */
export interface SalesPlanRow {
  id: number; planNo: string; planDate: string; lineNo: number
  itemId: number; itemCode: string; itemName: string
  employeeId: number | null; employeeName: string | null
  partnerId: number | null; partnerName: string | null
  warehouseId: number | null; warehouseName: string | null
  projectId: number | null; projectName: string | null
  planQty: number; unitPrice: number; planAmount: number; remark: string | null
}
export interface SalesPlanDoc { planNo: string; planDate: string; lines: SalesPlanRow[]; amount: number }

interface LineForm { partnerId: string; employeeId: string; itemId: string; planQty: string; unitPrice: string; planAmount: string; remark: string }
const emptyLine = (): LineForm => ({ partnerId: '', employeeId: '', itemId: '', planQty: '', unitPrice: '', planAmount: '', remark: '' })
/* 원본 매출계획입력 격자는 빈 줄 셋으로 시작한다(2026-10-14 실측). */
const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]
const num = (v: string) => Number(v || 0)
const won = (n: number) => Math.round(n).toLocaleString('ko-KR')

/**
 * 매출계획 입력 폼 — 재고 II › 계획관리 › 매출계획 › <b>매출계획입력</b>(E040624) 화면과 매출계획조회(E040625)의 수정 창이 같이 쓴다.
 *
 * <p>원본 입력 화면(2026-10-14 실측): 머리 [예상매출일자] 하나, 격자 빈 줄 셋 — 거래처코드 · 거래처명 · 담당자명 · 품목코드 · 품목명 ·
 * 수량 · 단가 · 예상매출액 · 새로운 항목 추가, 합계줄에 예상매출액 합. 코드칸에 코드를 쳐서 Enter 하면 한 건이면 바로 고른다
 * (우리 코드도움 <code>pair</code> 칸). 단추 저장(F8) · 다시 작성 · 리스트 · 웹자료올리기. 저장하면 안내 없이 빈 입력이 남는다.
 * 수정 창 단추: 저장(F8) · 복사 · 닫기 · 삭제 · 보내기 · H(복사 · 보내기 · H 는 없다).
 */
export default function SalesPlanForm({ editing, onSaved, onClose, extraButtons, active = true, slim = false, onError }: {
  /** 고치는 전표. null 이면 새로 넣는다. */
  editing: SalesPlanDoc | null
  /** 저장(또는 삭제)한 뒤. 입력 화면은 폼이 스스로 빈 입력으로 돌아간다. */
  onSaved: () => void
  /** 창으로 띄웠을 때의 [닫기]. 없으면 단추를 안 그린다. */
  onClose?: () => void
  /** 입력 화면의 [리스트] 처럼 폼 밖으로 가는 단추. */
  extraButtons?: ReactNode
  /** F8 을 받을지(창이 닫혀 있으면 false). */
  active?: boolean
  /** 원본 [매출계획입력] 머리는 예상매출일자 하나다 — 창고 · 프로젝트 칸을 뺀다(조회 쪽 창은 둔다). */
  slim?: boolean
  /** 창으로 띄웠을 때 오류를 창의 오류 줄(Modal error)로 올린다. 없으면 폼 위에 직접 그린다. */
  onError?: (message: string) => void
}) {
  const pickers = useCondPickers(['items', 'partners', 'warehouses', 'employees', 'projects'], { withStopped: true })
  const [f, setF] = useState({ expectedDate: ymd(new Date()), warehouseId: '', projectId: '' })
  const [lines, setLines] = useState<LineForm[]>(emptyLines())
  const [error, setErrorRaw] = useState('')
  const setError = (m: string) => { setErrorRaw(m); onError?.(m) }
  const [saving, setSaving] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)
  const nameOf = (list: { value: string; name: string }[], id: string) => list.find((x) => x.value === id)?.name ?? ''

  /* 원본: 품목을 골라도 [단가] 는 비어 있다(2026-10-29 데이터이관 QA B9 — 원본 11/23-1 F001 수량 0 · 단가 0 · 예상매출액 16,000).
     예상매출액은 손으로 치거나, 수량 · 단가를 치면 수량 × 단가. */

  function reset() {
    setError('')
    if (!editing) {
      setF((x) => ({ ...x, warehouseId: '', projectId: '' }))
      setLines(emptyLines())
      return
    }
    const h = editing.lines[0]
    setF({ expectedDate: editing.planDate, warehouseId: h.warehouseId ? String(h.warehouseId) : '', projectId: h.projectId ? String(h.projectId) : '' })
    setLines([...editing.lines.map((l) => ({
      partnerId: l.partnerId ? String(l.partnerId) : '', employeeId: l.employeeId ? String(l.employeeId) : '',
      itemId: String(l.itemId), planQty: l.planQty ? String(l.planQty) : '', unitPrice: l.unitPrice ? String(l.unitPrice) : '',
      planAmount: String(l.planAmount), remark: l.remark ?? '',
    })), emptyLine()])
  }
  useEffect(() => { reset() }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const setLine = (i: number, patch: Partial<LineForm>) =>
    setLines((ls) => {
      const next = ls.map((l, j) => {
        if (j !== i) return l
        const n = { ...l, ...patch }
        /* 원본처럼 수량 · 단가를 고치면 예상매출액이 수량 × 단가로 다시 선다. */
        if (('planQty' in patch || 'unitPrice' in patch) && (num(n.planQty) || num(n.unitPrice))) n.planAmount = String(num(n.planQty) * num(n.unitPrice))
        return n
      })
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
  const filled = lines.filter((l) => l.itemId)
  const total = filled.reduce((s, l) => s + num(l.planAmount), 0)

  async function save() {
    setError('')
    if (filled.length === 0) return setError('자료를 입력 바랍니다.')
    const body = {
      expectedDate: f.expectedDate,
      warehouseId: f.warehouseId ? Number(f.warehouseId) : undefined,
      projectId: f.projectId ? Number(f.projectId) : undefined,
      lines: filled.map((l) => ({
        partnerId: l.partnerId ? Number(l.partnerId) : undefined, employeeId: l.employeeId ? Number(l.employeeId) : undefined,
        itemId: Number(l.itemId), planQty: num(l.planQty), unitPrice: num(l.unitPrice), planAmount: num(l.planAmount),
        remark: l.remark || undefined,
      })),
    }
    setSaving(true)
    try {
      if (editing) await api.put(`/sales-plans/docs/${encodeURIComponent(editing.planNo)}`, body)
      else await api.post('/sales-plans/docs', body)
      /* 원본 입력 화면: 저장하면 안내 없이 빈 입력이 남는다(일자는 그대로). */
      if (!editing) reset()
      onSaved()
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }
  useShortcut('F8', save, active)

  async function remove() {
    if (!editing || !(await ecConfirm('전표를 삭제하겠습니까?\n- 매출계획'))) return
    try { await api.delete(`/sales-plans/docs/${encodeURIComponent(editing.planNo)}`); onSaved() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  return (
    <div>
      {error && !onError && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-form">
        <li><div className="title">예상매출일자</div><div className="form">
          <EcDateInput className="ec-input w-[150px]" value={f.expectedDate} disabled={!!editing} aria-label="예상매출일자" onChange={(e) => setF((x) => ({ ...x, expectedDate: e.target.value }))} />
        </div></li>
        {/* 원본 입력 머리에는 없다 — 조회 목록의 [창고명] · [프로젝트명] 열이 쓰는 우리 칸. */}
        {!slim && <li><div className="title">창고</div><div className="form">
          <CodePickerField label="창고" hideLabel fill emptyLabel="선택 안 함" placeholder="창고" value={f.warehouseId}
                           onChange={(v) => setF((x) => ({ ...x, warehouseId: v }))} items={pickers.warehouses} />
        </div></li>}
        {!slim && <li><div className="title">프로젝트</div><div className="form">
          <CodePickerField label="프로젝트" hideLabel fill emptyLabel="선택 안 함" placeholder="프로젝트" value={f.projectId}
                           onChange={(v) => setF((x) => ({ ...x, projectId: v }))} items={pickers.projects} />
        </div></li>}
      </ul>
      {/* 원본 격자 위 도구줄(2026-10-21 실측): 찾기(F3) · 정렬 · My품목 — 모양만. */}
      {slim && <div className="ec-toolbar mt-[8px]">
        <GridFindButton tableRef={tableRef} />
        <button type="button" className="ec-btn ec-btn-sm">정렬</button>
        <button type="button" className="ec-btn ec-btn-sm">My품목</button>
      </div>}
      <table ref={tableRef} className="w-full ec-head700 mt-[8px]">
        <thead><tr>
          <th className="w-[34px]"></th>
          {/* 원본 열: 거래처코드 · 거래처명 · 담당자명 · 품목코드 · 품목명 · 수량 · 단가 · 예상매출액 · 새로운 항목 추가 */}
          <th className="w-[130px]">거래처코드</th>
          <th className="w-[130px]">거래처명</th>
          <th className="w-[110px]">담당자명</th>
          <th className="w-[130px]">품목코드</th>
          <th className="w-[130px]">품목명</th>
          <th className="w-[80px] text-right">수량</th>
          <th className="w-[100px] text-right">단가</th>
          <th className="w-[110px] text-right">예상매출액</th>
          {slim ? <th className="w-[110px]">새로운 항목 추가</th> : <th>비고</th>}
        </tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="text-center">{i + 1}</td>
              <td className="[&_.name]:hidden [&_button.ec-btn]:hidden"><CodePickerField label="거래처" hideLabel fill pair emptyLabel="지우기" placeholder="거래처" value={l.partnerId}
                                   onChange={(v) => setLine(i, { partnerId: v })} items={pickers.partners} /></td>
              <td>{nameOf(pickers.partners, l.partnerId)}</td>
              <td><CodePickerField label="담당자" hideLabel fill emptyLabel="지우기" placeholder="담당자" value={l.employeeId}
                                   onChange={(v) => setLine(i, { employeeId: v })} items={pickers.employees} /></td>
              <td className="[&_.name]:hidden [&_button.ec-btn]:hidden"><CodePickerField label="품목" hideLabel fill pair emptyLabel="지우기" placeholder="품목" value={l.itemId}
                                   onChange={(v) => setLine(i, { itemId: v })} items={pickers.items} /></td>
              <td>{nameOf(pickers.items, l.itemId)}</td>
              <td><input className="ec-input w-full text-right" aria-label="수량" value={l.planQty} disabled={!l.itemId} onChange={(e) => setLine(i, { planQty: e.target.value })} /></td>
              <td><input className="ec-input w-full text-right" aria-label="단가" value={l.unitPrice} disabled={!l.itemId} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
              <td><input className="ec-input w-full text-right" aria-label="예상매출액" value={l.planAmount} disabled={!l.itemId} onChange={(e) => setLine(i, { planAmount: e.target.value })} /></td>
              <td>{!slim && <input className="ec-input w-full" aria-label="비고" value={l.remark} disabled={!l.itemId} onChange={(e) => setLine(i, { remark: e.target.value })} />}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={8}></td><td className="text-right">{won(total)}</td><td></td></tr></tfoot>
      </table>
      <div className="flex gap-[4px] mt-[9px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()} disabled={saving}>저장(F8)</button>
        {!editing && <button type="button" className="ec-btn" onClick={reset}>다시 작성</button>}
        {extraButtons}
        {slim && <button type="button" className="ec-btn">웹자료올리기</button>}
        {onClose && <button type="button" className="ec-btn" onClick={onClose}>닫기</button>}
        {editing && <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>}
      </div>
    </div>
  )
}
