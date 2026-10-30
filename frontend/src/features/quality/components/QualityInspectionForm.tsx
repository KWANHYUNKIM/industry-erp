import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import type { CommonCode, Item, QualityCheckValue, QualityInspection, QualityInspectionLine, QualityInspectionRequest, QualityItemCheck } from '../../../types/api'
import { dateNo } from '../../../utils/dateNo'
import Modal from '../../../components/Modal'
import CodePickerField from '../../../components/CodePickerField'
import { ymd } from '../../../components/EcPeriodPicks'
import { useShortcut } from '../../../utils/useShortcut'
import { ecConfirm } from '../../../components/EcDialog'
import { DocPullButton, type PulledLine } from '../DocPull'
import EcDateInput from '../../../components/ui/EcDateInput'

/**
 * 품질검사 입력 폼 — 원본 <b>품질검사입력</b>(E040621) 의 머리 · 줄 · 불러오기 · [검사항목] 창 · 단추.
 *
 * <p>두 곳이 같이 쓴다: 품질검사조회의 줄을 눌러 여는 수정 창, 메뉴 [품질검사입력] 의 따로 된 입력 화면
 * (품질검사요청입력과 같은 꼴 — features/quality/components/QualityRequestForm). 새 입력은 저장하면 그 자리에 빈 입력으로 남는다.
 *
 * <ul>
 *   <li>품목 줄: 검사방법(전수 · 샘플링) · 품목 · 수량 · 시료 · 적격 · 부적격 · 합격여부(해당없음 · 합격 · 불합격) · 검사항목 · 부적격관리.
 *       전수면 시료 = 수량이고 칸이 막힌다. 적격 = 시료 − 부적격.</li>
 *   <li>빈 저장 — '자료를 입력 바랍니다.', 시료 &gt; 수량 — '시료는 수량보다 클 수 없습니다.',
 *       [내역] 에서 검사항목 일부만 적용 — '검사항목을 입력 바랍니다.'(2026-10-14).</li>
 *   <li>[검사요청] — 진행중 요청을 띄워 [잔량적용] 으로 남은 수량을 줄로 불러온다. 불러오면 불러오기 단추를 거둔다.</li>
 *   <li>수정 창의 [삭제] 확인 — '선택한 전표를 삭제 하겠습니까?'</li>
 * </ul>
 */
type Method = QualityInspectionLine['method']
type Pass = QualityInspectionLine['passResult']
/* slotCount — [내역] 창에서 적용할 때 본 그 품목의 검사항목 칸 수(검증용, 서버로 안 보낸다). */
interface LineForm { method: Method; itemId: string; quantity: string; sampleQty: string; defectQty: string; passResult: Pass; defectType: string; checks: QualityCheckValue[]; slotCount?: number }
const emptyLine = (): LineForm => ({ method: 'FULL', itemId: '', quantity: '', sampleQty: '', defectQty: '', passResult: 'NA', defectType: '', checks: [] })
const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]
const num = (v: string) => Number(v || 0)
const qty0 = (n: number) => Math.round(n).toLocaleString('ko-KR')
/* 전수면 시료 = 수량(원본은 시료 칸을 막고 수량을 그대로 찍는다). 적격 = 시료 − 부적격. */
const sampleOf = (l: LineForm) => (l.method === 'FULL' ? num(l.quantity) : num(l.sampleQty))
const today = () => ymd(new Date())
const headOf = (r: QualityInspection | null) => r
  ? { inspectionDate: r.inspectionDate, inspector: r.inspector ?? '', remark: r.remark ?? '' }
  : { inspectionDate: today(), inspector: '', remark: '' }
const linesOf = (r: QualityInspection | null): LineForm[] => r
  ? [...r.lines.map((l) => ({
      method: l.method, itemId: String(l.itemId), quantity: String(l.quantity), sampleQty: String(l.sampleQty),
      defectQty: l.defectQty ? String(l.defectQty) : '', passResult: l.passResult, defectType: l.defectType ?? '',
      checks: l.checks ?? [],
    })), emptyLine()]
  : emptyLines()

export default function QualityInspectionForm({ editing, items, defectTypes, active = true, onSaved, onDeleted, extraButtons }: {
  /** 고칠 검사 — 없으면 새 입력. */
  editing: QualityInspection | null
  items: Item[]
  /** 원본 [부적격관리] 의 불량유형 — 공통코드 그룹 DEFECT_TYPE. */
  defectTypes: CommonCode[]
  /** F8 단축키를 걸 때(창이 열려 있을 때 · 입력 화면). */
  active?: boolean
  /** 저장 뒤 — 새 입력이면 폼은 스스로 비운다. */
  onSaved: () => void
  onDeleted?: () => void
  /** 단추줄 끝에 붙일 것(창은 [닫기], 입력 화면은 [리스트]). */
  extraButtons?: React.ReactNode
}) {
  const [f, setF] = useState(() => headOf(editing))
  const [lines, setLines] = useState<LineForm[]>(() => linesOf(editing))
  /*
   * 원본 입력 판의 [검사요청] — 진행중 요청을 띄워 [잔량적용] 으로 남은 수량을 줄로 불러온다(2026-10-04 실측: 검색창
   * '품질검사요청검색창(조회)', 알약 진행중, 단추 잔량적용 · 전체적용).
   */
  const [requestId, setRequestId] = useState<number | null>(editing?.requestId ?? null)
  /* 원본 입력 판 단추 차례: 판매 · 검사요청 · 발주 · 주문 · 작업지시서 · 구매 · 생산 · 이동 · 재고불러오기(2026-10-04 실측).
     판매 · 발주 · 주문 · 구매는 features/quality/DocPull — 품목 · 수량을 줄로 들이고 단추를 거둔다(검사요청과 이어지지 않는다). */
  const [pulled, setPulled] = useState(false)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setF(headOf(editing)); setLines(linesOf(editing)); setRequestId(editing?.requestId ?? null); setPulled(false); setFormError('')
  }, [editing])

  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const itemPicks = useMemo(() => items.filter((it) => it.active !== false)
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword })), [items])

  function reset() { setF(headOf(null)); setLines(emptyLines()); setRequestId(null); setPulled(false); setFormError('') }
  function applyPull(ls: PulledLine[]) {
    setLines([...ls.map((l) => ({ ...emptyLine(), itemId: String(l.itemId), quantity: String(Number(l.quantity)) })), emptyLine()])
    setRequestId(null)
    setPulled(true)
  }
  const setLine = (i: number, patch: Partial<LineForm>) =>
    setLines((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l))
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
  const filled = lines.filter((l) => l.itemId)
  const sums = filled.reduce((s, l) => ({
    qty: s.qty + num(l.quantity), sample: s.sample + sampleOf(l),
    good: s.good + sampleOf(l) - num(l.defectQty), defect: s.defect + num(l.defectQty),
  }), { qty: 0, sample: 0, good: 0, defect: 0 })

  /*
   * 원본 [검사항목] [내역] 창(2026-10-12 실측) — 제목 '검사항목', '품목명:○○', 품목에 붙은 품질검사유형의 칸
   * (코드형 1~4 · 숫자형 1~4 · 문자형 1~4 차례). 코드형식은 상세항목을 고르고 나머지는 적는다. [적용(F8)] · [닫기].
   * 유형이 없는 품목이면 '등록된 검사항목이 없습니다.' 창. 다 비워 두면 막지 않고, 일부만 적으면 저장 때 막는다(2026-10-14).
   */
  const [checkLine, setCheckLine] = useState<number | null>(null)
  const [checkSlots, setCheckSlots] = useState<QualityItemCheck[]>([])
  const [checkDraft, setCheckDraft] = useState<Record<number, { detailId: string; value: string }>>({})
  const [noChecks, setNoChecks] = useState(false)
  async function openChecks(i: number) {
    const l = lines[i]
    if (!l.itemId) return
    try {
      const r = await api.get<QualityItemCheck[]>(`/quality-types/item-checks/${l.itemId}`)
      if (r.data.length === 0) return setNoChecks(true)
      setCheckSlots(r.data)
      setCheckDraft(Object.fromEntries(r.data.map((s) => {
        const v = l.checks.find((c) => c.checkItemId === s.checkItemId)
        return [s.checkItemId, { detailId: v?.detailId ? String(v.detailId) : '', value: v && !v.detailId ? v.value : '' }]
      })))
      setCheckLine(i)
    } catch (err) { setFormError(extractErrorMessage(err)) }
  }
  function applyChecks() {
    if (checkLine == null) return
    const checks: QualityCheckValue[] = []
    for (const s of checkSlots) {
      const d = checkDraft[s.checkItemId]
      if (!d) continue
      if (s.format === 'CODE') {
        const det = s.details.find((x) => String(x.id) === d.detailId)
        if (det) checks.push({ checkItemId: s.checkItemId, detailId: det.id, value: det.name })
      } else if (d.value.trim()) {
        checks.push({ checkItemId: s.checkItemId, detailId: null, value: d.value.trim() })
      }
    }
    setLine(checkLine, { checks, slotCount: checkSlots.length })
    setCheckLine(null)
  }

  const [pullOpen, setPullOpen] = useState(false)
  const [openRequests, setOpenRequests] = useState<QualityInspectionRequest[]>([])
  const [pullPick, setPullPick] = useState<number | null>(null)
  async function openPull() {
    setPullPick(null)
    try {
      const r = await api.get<QualityInspectionRequest[]>('/quality-inspection-requests', { params: { status: 'REQUESTED' } })
      setOpenRequests(r.data.filter((x) => x.remainingQty > 0))
      setPullOpen(true)
    } catch (err) { setFormError(extractErrorMessage(err)) }
  }
  /* [잔량적용] — 아직 검사 안 한 수량만큼. 줄이 하나면 남은 수량, 여럿이면 요청 줄을 그대로(남은 만큼 고쳐 쓴다). */
  function applyRequest() {
    const r = openRequests.find((x) => x.id === pullPick)
    if (!r) return
    const partial = r.inspectedQty > 0
    setLines([...r.lines.map((l) => ({
      ...emptyLine(), method: l.method, itemId: String(l.itemId),
      quantity: String(partial && r.lines.length === 1 ? r.remainingQty : l.quantity),
    })), emptyLine()])
    setRequestId(r.id)
    /* 원본은 불러온 뒤 불러오기 단추(판매 · 검사요청 · 발주 …)를 거둔다 — 찾기 · 정렬 · My품목 · 재고불러오기 · 바코드 · 검증만 남는다(2026-10-14). */
    setPulled(true)
    setPullOpen(false)
  }

  async function save() {
    setFormError('')
    if (filled.length === 0) return setFormError('자료를 입력 바랍니다.')
    if (filled.some((l) => sampleOf(l) > num(l.quantity))) return setFormError('시료는 수량보다 클 수 없습니다.')
    /* 2026-10-14 원본 실측: [내역] 에서 외관검사만 고르고 적용 → 저장하면 그 칸이 빨개지며 '검사항목을 입력 바랍니다.'
       (셋 다 채우면 저장). 하나도 안 적은 줄은 예전 실측대로 막지 않는다. */
    if (filled.some((l) => l.slotCount != null && l.checks.length > 0 && l.checks.length < l.slotCount)) return setFormError('검사항목을 입력 바랍니다.')
    const body = {
      inspectionDate: f.inspectionDate,
      inspector: f.inspector || undefined,
      remark: f.remark || undefined,
      requestId: requestId ?? undefined,
      lines: filled.map((l) => ({
        itemId: Number(l.itemId), method: l.method, quantity: num(l.quantity),
        sampleQty: sampleOf(l), defectQty: num(l.defectQty), passResult: l.passResult,
        defectType: l.defectType || undefined,
        checks: l.checks.map((c) => ({ checkItemId: c.checkItemId, detailId: c.detailId ?? undefined, value: c.value })),
      })),
    }
    setSaving(true)
    try {
      if (editing) await api.put(`/quality-inspections/${editing.id}`, body)
      else await api.post('/quality-inspections', body)
      if (!editing) reset()
      onSaved()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  useShortcut('F8', applyChecks, active && checkLine != null)
  useShortcut('F8', save, active && checkLine == null && !pullOpen)

  async function remove() {
    if (!editing || !(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
    try {
      await api.delete(`/quality-inspections/${editing.id}`)
      onDeleted?.()
    } catch (err) { setFormError(extractErrorMessage(err)) }
  }

  return (
    <div>
      {formError && <p className="ec-alert ec-alert-danger mb-[8px]">{formError}</p>}
      <ul className="ec-form">
        <li><div className="title">일자</div><div className="form">
          {/* 수정 창은 일자를 잠근다 — 번호가 일자를 문다. */}
          <EcDateInput className="ec-input w-[150px]" aria-label="일자" value={f.inspectionDate} disabled={!!editing} onChange={(e) => setF((x) => ({ ...x, inspectionDate: e.target.value }))} />
        </div></li>
        <li><div className="title">담당자</div><div className="form">
          <input className="ec-input w-full" placeholder="담당자" aria-label="담당자" value={f.inspector}
                 onChange={(e) => setF((x) => ({ ...x, inspector: e.target.value }))} />
        </div></li>
      </ul>

      <div className="flex gap-[4px] items-center mt-[8px]">
        {!pulled && (<>
          <DocPullButton kind="판매" onApply={applyPull} />
          <button type="button" className="ec-btn ec-btn-sm" onClick={openPull}>검사요청</button>
          <DocPullButton kind="발주" onApply={applyPull} />
          <DocPullButton kind="주문" onApply={applyPull} />
          <DocPullButton kind="작업지시서" onApply={applyPull} />
          <DocPullButton kind="구매" onApply={applyPull} />
          <DocPullButton kind="생산" onApply={applyPull} />
          <DocPullButton kind="이동" onApply={applyPull} />
        </>)}
        {requestId != null && <span className="text-ec-hint text-[12px]">
          검사요청 {(() => { const r = openRequests.find((x) => x.id === requestId); return r ? dateNo(r.requestDate, r.requestNo) : (editing?.requestNo ?? '') })()}
        </span>}
      </div>
      <table className="w-full ec-head700 mt-[8px]">
        <thead><tr>
          <th className="w-[34px]"></th>
          <th className="w-[96px]">검사방법</th>
          <th className="w-[180px]">품목코드</th>
          <th>품목명</th>
          <th className="w-[80px] text-right">수량</th>
          <th className="w-[80px] text-right">시료</th>
          <th className="w-[70px] text-right">적격</th>
          <th className="w-[80px] text-right">부적격</th>
          <th className="w-[100px]">합격여부</th>
          <th className="w-[110px] text-center">검사항목</th>
          <th className="w-[120px]">부적격관리</th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const it = itemById.get(l.itemId)
            const sample = sampleOf(l)
            return (
              <tr key={i}>
                <td className="text-center">{i + 1}</td>
                <td>
                  <select className="ec-input w-full" aria-label={`${i + 1}줄 검사방법`} value={l.method} onChange={(e) => setLine(i, { method: e.target.value as Method })}>
                    <option value="FULL">전수</option>
                    <option value="SAMPLING">샘플링</option>
                  </select>
                </td>
                <td>
                  <CodePickerField label="품목" hideLabel fill emptyLabel="지우기" placeholder="품목코드" value={l.itemId}
                                   onChange={(v) => setLine(i, { itemId: v, checks: v === l.itemId ? l.checks : [] })} items={itemPicks} />
                </td>
                <td>{it ? it.name : ''}</td>
                <td><input className="ec-input w-full text-right" aria-label={`${i + 1}줄 수량`} value={l.quantity} disabled={!l.itemId}
                           onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                <td><input className="ec-input w-full text-right" aria-label={`${i + 1}줄 시료`} disabled={!l.itemId || l.method === 'FULL'}
                           value={l.method === 'FULL' ? (l.quantity || '') : l.sampleQty}
                           onChange={(e) => setLine(i, { sampleQty: e.target.value })} /></td>
                <td className="text-right">{l.itemId ? qty0(sample - num(l.defectQty)) : ''}</td>
                <td><input className="ec-input w-full text-right" aria-label={`${i + 1}줄 부적격`} value={l.defectQty} disabled={!l.itemId}
                           onChange={(e) => setLine(i, { defectQty: e.target.value })} /></td>
                <td>
                  <select className="ec-input w-full" aria-label={`${i + 1}줄 합격여부`} value={l.passResult} disabled={!l.itemId}
                          onChange={(e) => setLine(i, { passResult: e.target.value as Pass })}>
                    <option value="NA">해당없음</option>
                    <option value="PASS">합격</option>
                    <option value="FAIL">불합격</option>
                  </select>
                </td>
                <td className="text-center">
                  {/* 원본 [검사항목] — 값을 적었으면 주황 꼬리표에 값을 잇고, 아니면 [내역]. 품목이 없으면 눌러도 안 열린다. */}
                  <button type="button" className={l.checks.length
                            ? 'inline-block max-w-full truncate rounded-[6px] px-[4px] leading-[15.3px] bg-[var(--ec-bg-tag)] text-white'
                            : 'ec-link'}
                          onClick={() => void openChecks(i)}>
                    {l.checks.length ? l.checks.map((c) => c.value).join(' ') : '내역'}
                  </button>
                </td>
                <td>
                  {/* 원본 [부적격관리] 는 불량유형마다 수량을 나눈다 — 우리는 주된 유형 하나를 고른다. */}
                  <select className="ec-input w-full" value={l.defectType} disabled={num(l.defectQty) <= 0}
                          onChange={(e) => setLine(i, { defectType: e.target.value })}>
                    <option value="">(불량유형)</option>
                    {defectTypes.map((d) => <option key={d.id} value={d.code}>{d.name}</option>)}
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot><tr>
          <td colSpan={4}></td>
          <td className="text-right">{qty0(sums.qty)}</td>
          <td className="text-right">{qty0(sums.sample)}</td>
          <td className="text-right">{qty0(sums.good)}</td>
          <td className="text-right">{qty0(sums.defect)}</td>
          <td colSpan={3}></td>
        </tr></tfoot>
      </table>

      <div className="flex gap-[4px] mt-[9px]">
        <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
        {editing
          ? <button className="ec-btn" onClick={() => void remove()}>삭제</button>
          : <button className="ec-btn" onClick={reset}>다시 작성</button>}
        {extraButtons}
      </div>

      <Modal open={checkLine != null} width={640} title="검사항목" error={formError} onClose={() => setCheckLine(null)}>
        <p className="mb-[8px]">품목명:{checkLine != null ? itemById.get(lines[checkLine]?.itemId ?? '')?.name ?? '' : ''}</p>
        <ul className="ec-form">
          {checkSlots.map((s) => (
            <li key={s.checkItemId}><div className="title">{s.name}</div><div className="form">
              {s.format === 'CODE'
                ? <CodePickerField label={s.name} hideLabel fill placeholder={s.name} emptyLabel="지우기"
                                   value={checkDraft[s.checkItemId]?.detailId ?? ''}
                                   onChange={(v) => setCheckDraft((d) => ({ ...d, [s.checkItemId]: { ...d[s.checkItemId], detailId: v } }))}
                                   items={s.details.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                : <input className={`ec-input w-full${s.format === 'NUMBER' ? ' text-right' : ''}`} placeholder={s.name}
                         inputMode={s.format === 'NUMBER' ? 'decimal' : undefined}
                         value={checkDraft[s.checkItemId]?.value ?? ''}
                         onChange={(e) => setCheckDraft((d) => ({ ...d, [s.checkItemId]: { ...d[s.checkItemId], value: e.target.value } }))} />}
            </div></li>
          ))}
        </ul>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={applyChecks}>적용(F8)</button>
          <button className="ec-btn" onClick={() => setCheckLine(null)}>닫기</button>
        </div>
      </Modal>
      <Modal open={noChecks} width={420} title="검사항목" error={formError} onClose={() => setNoChecks(false)}>
        <p className="text-center whitespace-pre-line my-[12px]">{'등록된 검사항목이 없습니다.\n품질검사유형등록에서 검사항목을 등록 바랍니다.'}</p>
        <div className="flex justify-center">
          <button className="ec-btn ec-btn-primary" onClick={() => setNoChecks(false)}>확인</button>
        </div>
      </Modal>

      <Modal open={pullOpen} width={760} title="품질검사요청검색창(조회)" error={formError} onClose={() => setPullOpen(false)}>
        <table className="w-full text-left">
          <thead><tr>
            <th className="w-[34px]"></th>
            <th className="text-center">검사요청번호</th>
            <th>담당자명</th>
            <th>품목</th>
            <th className="text-right">수량</th>
            <th className="text-right">잔량</th>
          </tr></thead>
          <tbody>
            {openRequests.length === 0
              ? <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              : openRequests.map((r) => (
                <tr key={r.id}>
                  <td className="text-center"><input type="radio" name="qi-pull" checked={pullPick === r.id} onChange={() => setPullPick(r.id)} /></td>
                  <td className="text-center">{dateNo(r.requestDate, r.requestNo)}</td>
                  <td>{r.requester ?? ''}</td>
                  <td>{r.lines.length > 1 ? `${r.lines[0].itemName} 외 ${r.lines.length - 1}건` : r.itemName}</td>
                  <td className="text-right">{qty0(r.requestQty)}</td>
                  <td className="text-right">{qty0(r.remainingQty)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" disabled={pullPick == null} onClick={applyRequest}>잔량적용(F8)</button>
          <button className="ec-btn" onClick={() => setPullOpen(false)}>닫기</button>
        </div>
      </Modal>
    </div>
  )
}
