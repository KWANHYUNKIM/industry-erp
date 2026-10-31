import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import GridFindButton from '../../../components/codepicker/GridFindButton'
import { api, extractErrorMessage } from '../../../api/client'
import type { Item, QualityInspectionRequest } from '../../../types/api'
import CodePickerField from '../../../components/CodePickerField'
import { useShortcut } from '../../../utils/useShortcut'
import { ecConfirm } from '../../../components/EcDialog'
import { DocPullButton, type PullKind, type PulledLine } from '../DocPull'
import EcDateInput from '../../../components/ui/EcDateInput'
import { todayYmd } from '../../../utils/periods'

/**
 * 품질검사요청 입력 폼 — 원본 <b>품질검사요청입력</b>(E040628) 의 머리 · 줄 · 단추.
 *
 * <p>두 곳이 같이 쓴다: 품질검사요청조회의 줄을 눌러 여는 수정 창, 메뉴 [품질검사요청입력] 의 따로 된 입력 화면.
 * 원본 입력 화면은 저장하면 그 자리에 빈 입력으로 남는다(2026-10-14 실측 — 저장한 요청은 조회 · 현황에 생긴다).
 *
 * <ul>
 *   <li>줄이 하나도 없으면 원본은 '그리드(표)에 최소 1줄 이상 입력되어야 합니다.'(2026-10-14) 로 막는다.</li>
 *   <li>담당자를 비우면 담당자명도 빈칸이다 — 빈 글자를 그대로 보낸다(서버는 안 보낼 때만 로그인 사용자로 채운다).</li>
 *   <li>수정 창의 [삭제] 확인 문구 '전표를 삭제하겠습니까? / - 품질검사요청'(2026-10-14).</li>
 * </ul>
 */
type Method = 'FULL' | 'SAMPLING'
/* [추가수량](2026-10-13 원본 실측) — 넣으면 [수량] 이 그 값으로 바뀐다(거꾸로는 안 바뀐다). 저장 뒤 다시 열어도 남는다. */
interface LineForm { method: Method; itemId: string; extraQty: string; quantity: string }
const emptyLine = (): LineForm => ({ method: 'FULL', itemId: '', extraQty: '', quantity: '' })
const emptyLines = () => [emptyLine(), emptyLine(), emptyLine()]
const headOf = (r: QualityInspectionRequest | null) => r
  ? { requestDate: r.requestDate, requester: r.requester ?? '', projectId: r.projectId ? String(r.projectId) : '', remark: r.remark ?? '' }
  : { requestDate: todayYmd(), requester: '', projectId: '', remark: '' }
const linesOf = (r: QualityInspectionRequest | null): LineForm[] => r
  ? [...r.lines.map((l) => ({ method: l.method as Method, itemId: String(l.itemId), extraQty: l.extraQty == null ? '' : String(Number(l.extraQty)), quantity: String(l.quantity) })), emptyLine()]
  : emptyLines()

export default function QualityRequestForm({ editing, items, projects, active = true, slim = false, onSaved, onDeleted, extraButtons, listTo }: {
  /** 고칠 요청 — 없으면 새 입력. */
  editing: QualityInspectionRequest | null
  items: Item[]
  projects: { id: number; code: string; name: string }[]
  /** F8 단축키를 걸 때(창이 열려 있을 때 · 입력 화면). */
  active?: boolean
  /** 원본 [품질검사요청입력] 머리는 일자-No. · 담당자 둘뿐이다(2026-10-14 실측) — 프로젝트 · 적요 칸을 뺀다. 조회 쪽 창은 둔다. */
  slim?: boolean
  /** 저장 뒤 — 새 입력이면 폼은 스스로 비운다. */
  onSaved: (saved: QualityInspectionRequest) => void
  onDeleted?: () => void
  /** 단추줄 끝에 붙일 것(창은 [닫기], 입력 화면은 [리스트]). */
  extraButtons?: React.ReactNode
  /** 원본 [리스트] — 저장(F8) · 저장/전표(F7) 뒤에 선다(단추 차례가 원본과 같아야 한다). */
  listTo?: string
}) {
  const navigate = useNavigate()
  const [f, setF] = useState(() => headOf(editing))
  const [lines, setLines] = useState<LineForm[]>(() => linesOf(editing))
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const tableRef = useRef<HTMLTableElement>(null)
  /* 입력 판 [판매 · 발주 · 주문 · 구매] 불러오기(features/quality/DocPull) — 한 번 불러오면 단추가 사라진다. */
  const [pulled, setPulled] = useState(false)
  useEffect(() => { setF(headOf(editing)); setLines(linesOf(editing)); setFormError(''); setPulled(false) }, [editing])

  const itemById = useMemo(() => new Map(items.map((it) => [String(it.id), it])), [items])
  const itemPicks = useMemo(() => items.filter((it) => it.active !== false)
    .map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword })), [items])

  function reset() { setF(headOf(null)); setLines(emptyLines()); setPulled(false); setFormError('') }
  function applyPull(ls: PulledLine[]) {
    setLines([...ls.map((l) => ({ method: 'FULL' as Method, itemId: String(l.itemId), extraQty: '', quantity: String(Number(l.quantity)) })), emptyLine()])
    setPulled(true)
  }
  const setLine = (i: number, patch: Partial<LineForm>) =>
    setLines((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l))
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
  const filled = lines.filter((l) => l.itemId)
  const totalQty = filled.reduce((s, l) => s + Number(l.quantity || 0), 0)
  const totalExtra = filled.reduce((s, l) => s + Number(l.extraQty || 0), 0)

  async function save() {
    setFormError('')
    if (filled.length === 0) return setFormError('그리드(표)에 최소 1줄 이상 입력되어야 합니다.')
    if (filled.some((l) => !(Number(l.quantity) > 0))) return setFormError('수량은 0보다 커야 합니다.')
    const body = {
      requestDate: f.requestDate,
      requester: f.requester.trim(),
      projectId: f.projectId ? Number(f.projectId) : undefined,
      remark: f.remark || undefined,
      lines: filled.map((l) => ({ itemId: Number(l.itemId), method: l.method, quantity: Number(l.quantity), extraQty: l.extraQty === '' ? null : Number(l.extraQty) })),
    }
    setSaving(true)
    try {
      const r = editing
        ? await api.put<QualityInspectionRequest>(`/quality-inspection-requests/${editing.id}`, body)
        : await api.post<QualityInspectionRequest>('/quality-inspection-requests', body)
      if (!editing) reset()
      onSaved(r.data)
    } catch (err) { setFormError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }
  useShortcut('F8', save, active)

  async function remove() {
    if (!editing || !(await ecConfirm('전표를 삭제하겠습니까?\n- 품질검사요청'))) return
    try {
      await api.delete(`/quality-inspection-requests/${editing.id}`)
      onDeleted?.()
    } catch (err) { setFormError(extractErrorMessage(err)) }
  }

  return (
    <div>
      {formError && <p className="ec-alert ec-alert-danger mb-[8px]">{formError}</p>}
      <ul className="ec-form">
        <li><div className="title">일자-No.</div><div className="form">
          <EcDateInput className="ec-input w-[150px]" aria-label="일자" value={f.requestDate} disabled={!!editing} onChange={(e) => setF((x) => ({ ...x, requestDate: e.target.value }))} />
        </div></li>
        <li><div className="title">담당자</div><div className="form">
          <input className="ec-input w-full" placeholder="담당자" aria-label="담당자" value={f.requester}
                 onChange={(e) => setF((x) => ({ ...x, requester: e.target.value }))} />
        </div></li>
        {!slim && <li><div className="title">프로젝트</div><div className="form">
          <CodePickerField label="프로젝트" hideLabel fill emptyLabel="선택 안 함" placeholder="프로젝트" value={f.projectId}
                           onChange={(v) => setF((x) => ({ ...x, projectId: v }))}
                           items={projects.map((pj) => ({ value: String(pj.id), code: pj.code, name: pj.name }))} />
        </div></li>}
        {!slim && <li><div className="title">적요</div><div className="form">
          <input className="ec-input w-full" placeholder="적요" aria-label="적요" value={f.remark}
                 onChange={(e) => setF((x) => ({ ...x, remark: e.target.value }))} />
        </div></li>}
      </ul>
      {!editing && !pulled && (
        <div className="ec-toolbar mt-[8px]">
          {/* 원본 도구줄(2026-10-21 실측): 찾기(F3) · 정렬 · My품목 · 판매 · 발주 · 주문 · 구매 · 생산 · 이동 · A/S접수 · 재고불러오기 · 생성한 전표 · 바코드 · 검증 · 전표불러오기 */}
          {slim && <GridFindButton tableRef={tableRef} />}
          {slim && <button type="button" className="ec-btn ec-btn-sm">정렬</button>}
          {slim && <button type="button" className="ec-btn ec-btn-sm">My품목</button>}
          {(['판매', '발주', '주문', '구매', '생산', '이동', 'A/S접수'] as PullKind[]).map((k) => <DocPullButton key={k} kind={k} onApply={applyPull} />)}
          {slim && <button type="button" className="ec-btn ec-btn-sm">재고불러오기</button>}
          {slim && <button type="button" className="ec-btn ec-btn-sm">생성한 전표</button>}
          {slim && <button type="button" className="ec-btn ec-btn-sm">바코드</button>}
          {slim && <button type="button" className="ec-btn ec-btn-sm">검증</button>}
          {slim && <button type="button" className="ec-btn ec-btn-sm">전표불러오기</button>}
        </div>
      )}
      <table ref={tableRef} className="w-full ec-head700 mt-[8px]">
        <thead><tr>
          <th className="w-[34px]"></th>
          <th className="w-[100px]">검사방법</th>
          <th className="w-[180px]">품목코드</th>
          <th>품목명</th>
          <th className="w-[100px]">규격</th>
          <th className="w-[100px] text-right">추가수량</th>
          <th className="w-[100px] text-right">수량</th>
          {slim && <th className="w-[110px]">새로운 항목 추가</th>}
        </tr></thead>
        <tbody>
          {lines.map((l, i) => {
            const it = itemById.get(l.itemId)
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
                                   onChange={(v) => setLine(i, { itemId: v })} items={itemPicks} />
                </td>
                <td>{it ? it.name : ''}</td>
                <td>{it?.spec ?? ''}</td>
                <td><input className="ec-input w-full text-right" aria-label={`${i + 1}줄 추가수량`} value={l.extraQty} disabled={!l.itemId}
                           onChange={(e) => setLine(i, { extraQty: e.target.value, quantity: e.target.value })} /></td>
                <td><input className="ec-input w-full text-right" aria-label={`${i + 1}줄 수량`} value={l.quantity} disabled={!l.itemId}
                           onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                {slim && <td></td>}
              </tr>
            )
          })}
        </tbody>
        <tfoot><tr><td colSpan={5}></td><td className="text-right">{Math.round(totalExtra).toLocaleString('ko-KR')}</td><td className="text-right">{Math.round(totalQty).toLocaleString('ko-KR')}</td>{slim && <td></td>}</tr></tfoot>
      </table>
      <div className="flex gap-[4px] mt-[9px]">
        <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
        {slim && <button type="button" className="ec-btn">저장/전표(F7)</button>}
        {editing
          ? <button className="ec-btn" onClick={() => void remove()}>삭제</button>
          : <button className="ec-btn" onClick={reset}>다시 작성</button>}
        {extraButtons}
        {listTo && <button type="button" className="ec-btn" onClick={() => navigate(listTo)}>리스트</button>}
        {slim && <button type="button" className="ec-btn">웹자료올리기</button>}
      </div>
    </div>
  )
}
