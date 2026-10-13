import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CodePickerField from '../../components/CodePickerField'
import EcSlipShell from '../../components/EcSlipShell'
import { EcCond } from '../../components/EcStatusPanel'
import { ymd } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateNo } from '../../utils/dateNo'
import type { StockAdjustmentSlip } from '../../types/api'
import { ecConfirm } from '../../components/EcDialog'

type Line = { itemId: string; quantity: string; kind: string }
type Grid = 'defect' | 'normal'
const blank = (): Line => ({ itemId: '', quantity: '', kind: '' })
/** 원본 격자는 빈 줄 셋으로 뜬다. */
const blankLines = () => [blank(), blank(), blank()]
const num = (n: number) => n.toLocaleString('ko-KR')

/**
 * 재고 I › 기타이동 › 자가사용 › <b>자가사용입력</b>(E040503) · 자가사용조회에서 연 <b>자가사용수정</b> — 2026-10-12 loginaa 실측.
 *
 * <p>머리 [일자 · 거래처 / 담당자 · 창고 / 프로젝트], 아래 격자 [품목코드 · 품목명 · 규격 · 수량 · 사용유형] 에 품목을 여러 줄 넣어
 * 전표 한 장으로 저장한다. 사용유형은 코드도움(원본 회사: 100 고객샘플용 · 200 직원증정용 · 300 연구개발용) — 우리는 공통코드 '사용유형'.
 * 창고를 비우고 저장하면 막힌다. 저장하면 일자 · 창고는 그대로 두고 격자만 비운다. 격자 밑 합계줄은 수량 합.
 * 수정 창은 일자가 잠기고 버튼이 [저장(F8) · 삭제 · 닫기], 삭제는 '전표를 삭제하겠습니까?' 를 묻는다.
 *
 * <p>원본에 있는데 두지 않은 것: 격자 위 [찾기(F3) · 정렬 · My품목 · 주문 · 구매 · 재고불러오기 · 바코드 · 전표 바코드 · 검증 · 전표불러오기],
 * [새로운 항목 추가] 열, 아래 [저장/전표(F7) · 웹자료올리기], 수정 창의 [복사 · 이전 · 다음 · 보내기].
 *
 * <p><b>불량처리입력</b>(E040507)도 이 화면이다(kind=DEFECT) — 같은 날 실측. 머리 [일자 · 담당자 / <b>발견창고</b> · <b>처리방법</b> / 프로젝트],
 * [거래처]는 없고 격자 끝 칸이 [불량유형]. 처리방법은 폐기(기본) · 품목대체 · 정상사용. 폐기로 저장하면 발견창고 재고가 수량만큼 빠지고
 * (재고수불부 '[불량] - 폐기' 출고 1) <b>폐기현황</b>에 그 줄이 선다.
 *
 * <p>품목대체를 고르면 격자 위에 알약 [불량품목 · 정상품목] 이 서고, [정상품목] 격자(품목코드 · 품목명 · 규격 · 수량 · 불량유형)에
 * 넣은 품목은 <b>발견창고로 들어온다</b>(같은 날 실측: 포장김치 1 불량 + 배추 3 정상 → 재고수불부 포장김치 출고 1 · 배추 입고 3,
 * 대체사용현황 '불량수량 1 · 정상수량 3'). 정상사용은 격자가 하나뿐이고 같은 품목이 출고 1 · 입고 1 로 남아 재고가 그대로다.
 * 원본 품목대체의 [▸불량품목] 접힌 판(BOM풀기 · 바코드 · 입력자료불러오기)은 두지 않았다 — BOM 이 있는 품목(PC-STD)으로
 * BOM풀기를 눌러도 원본 격자에 아무것도 안 들어와 무엇을 하는지 재지 못했다.
 */
type MoveKind = 'SELF_USE' | 'DEFECT'
const LABEL: Record<MoveKind, { name: string; list: string; warehouse: string; kind: string; kindCodes: string }> = {
  SELF_USE: { name: '자가사용', list: '/inventory/self-use', warehouse: '창고', kind: '사용유형', kindCodes: '사용유형' },
  DEFECT: { name: '불량처리', list: '/inventory/defect', warehouse: '발견창고', kind: '불량유형', kindCodes: '불량유형' },
}
/** 원본 불량처리입력 [처리방법] 후보 — 차례도 원본 그대로, 기본은 폐기. */
const HANDLINGS = ['폐기', '품목대체', '정상사용'] as const

export default function SelfUseInputPage({ adjustNo, onDone, kind = 'SELF_USE' }: { adjustNo?: string; onDone?: () => void; kind?: MoveKind } = {}) {
  const navigate = useNavigate()
  const editing = !!adjustNo
  const L = LABEL[kind]
  const selfUse = kind === 'SELF_USE'
  const [handling, setHandling] = useState<string>('폐기')
  const pickers = useCondPickers(['partners', 'warehouses', 'projects', 'items', 'employees'])
  const [date, setDate] = useState(ymd(new Date()))
  const [partnerId, setPartnerId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [lines, setLines] = useState<Line[]>(blankLines())
  /* 품목대체의 [정상품목] 격자 — 발견창고로 들어오는 품목. */
  const [normals, setNormals] = useState<Line[]>(blankLines())
  const [grid, setGrid] = useState<Grid>('defect')
  const substitute = !selfUse && handling === '품목대체'
  const showNormal = substitute && grid === 'normal'
  const rows = showNormal ? normals : lines
  const setRows = showNormal ? setNormals : setLines
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [kinds, setKinds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api.get<{ name: string; codes: { name: string }[] }[]>('/codes')
      .then((r) => setKinds((r.data.find((g) => g.name === L.kindCodes)?.codes ?? []).map((c) => c.name)))
      .catch(() => setKinds([]))
  }, [L.kindCodes])

  useEffect(() => {
    if (!adjustNo) return
    api.get<StockAdjustmentSlip>(`/stock-adjustments/slips/${encodeURIComponent(adjustNo)}`)
      .then(({ data: s }) => {
        setDate(s.date)
        setPartnerId(s.partnerId != null ? String(s.partnerId) : '')
        setEmployeeId(s.employeeId != null ? String(s.employeeId) : '')
        setWarehouseId(String(s.warehouseId))
        setProjectId(s.projectId != null ? String(s.projectId) : '')
        if (s.handling) setHandling(s.handling)
        const toLine = (l: StockAdjustmentSlip['lines'][number]) => ({ itemId: String(l.itemId), quantity: String(Math.abs(Number(l.quantityChange))), kind: l.kind ?? '' })
        setLines([...s.lines.filter((l) => !l.normal).map(toLine), blank()])
        /* 정상사용의 정상품목 줄은 서버가 불량 줄을 따라 붙인 것이라 격자로 펴지 않는다. */
        if (s.handling === '품목대체') setNormals([...s.lines.filter((l) => l.normal).map(toLine), blank()])
      })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [adjustNo])

  const itemById = useMemo(() => new Map(pickers.items.map((i) => [i.value, i])), [pickers.items])
  /* 담당자는 id 로 든다(inventory 는 hr 을 모른다) — 후보 값도 id 로 바꿔 준다. */
  const employeeItems = useMemo(() => pickers.employees.map((e) => ({ ...e, value: String(e.id) })), [pickers.employees])
  const kindItems = useMemo(() => kinds.map((k) => ({ value: k, name: k })), [kinds])

  function setLine(i: number, patch: Partial<Line>) {
    setRows((ls) => {
      const next = ls.map((l, j) => (j === i ? { ...l, ...patch } : l))
      // 마지막 줄에 품목을 넣으면 빈 줄을 하나 더 단다(원본 격자처럼 끝이 늘 비어 있다).
      if (next[next.length - 1].itemId) next.push(blank())
      return next
    })
  }

  function reset() {
    setLines(blankLines())
    setNormals(blankLines())
    setGrid('defect')
    setPicked(new Set())
    setError('')
  }

  async function save() {
    setError(''); setNotice('')
    if (!warehouseId) return setError(`${L.warehouse}를 입력하세요.`)
    const filled = lines.filter((l) => l.itemId || l.quantity)
    const filledNormal = substitute ? normals.filter((l) => l.itemId || l.quantity) : []
    if (filled.length === 0 || [...filled, ...filledNormal].some((l) => !l.itemId)) return setError('품목을 입력하세요.')
    if ([...filled, ...filledNormal].some((l) => !(Number(l.quantity) > 0))) return setError('수량을 입력하세요.')
    const body = {
      type: kind, date,
      partnerId: selfUse && partnerId ? Number(partnerId) : null,
      handling: selfUse ? null : handling,
      employeeId: employeeId ? Number(employeeId) : null,
      warehouseId: Number(warehouseId),
      projectId: projectId ? Number(projectId) : null,
      lines: [
        ...filled.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), kind: l.kind || null })),
        ...filledNormal.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), kind: l.kind || null, normal: true })),
      ],
    }
    try {
      const { data } = editing
        ? await api.put<StockAdjustmentSlip>(`/stock-adjustments/slips/${encodeURIComponent(adjustNo!)}`, body)
        : await api.post<StockAdjustmentSlip>('/stock-adjustments/slips', body)
      if (editing) { onDone?.(); return }
      setNotice(`${dateNo(data.date, data.adjustNo)} 저장되었습니다.`)
      reset()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function remove() {
    if (!adjustNo || !(await ecConfirm('전표를 삭제하겠습니까?'))) return
    try {
      await api.delete(`/stock-adjustments/slips/${encodeURIComponent(adjustNo)}`)
      onDone?.()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, `${L.name}${editing ? '수정' : '입력'}`, [rows])
  const totalQty = rows.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
  const allPicked = rows.length > 0 && picked.size === rows.length

  return (
    <EcSlipShell
      title={`${L.name}${editing ? '수정' : '입력'}`}
      formTabs={[{ id: 'basic', label: `${L.name}입력` }]} activeFormTab="basic"
      actions={editing
        ? [
            { label: '저장(F8)', primary: true, submit: true, onClick: () => void save() },
            { label: '삭제', onClick: () => void remove() },
            { label: '닫기', onClick: () => onDone?.() },
          ]
        : [
            { label: '저장(F8)', primary: true, submit: true, onClick: () => void save() },
            { label: '다시 작성', onClick: reset },
            { label: '리스트', onClick: () => navigate(L.list) },
          ]}>
      <div>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        {notice && <p className="ec-alert mb-[8px]">{notice}</p>}

        <ul className="ec-form mb-[8px]">
          <EcCond label="일자">
            <input type="date" className="ec-input w-[150px]" value={date} disabled={editing}
                   onChange={(e) => setDate(e.target.value)} />
            {editing && adjustNo && <span className="ml-[6px]">-{Number(adjustNo.split('-').pop()) || ''}</span>}
          </EcCond>
          {selfUse && (
            <EcCond label="거래처" pick>
              <CodePickerField label="거래처" hideLabel fill pair placeholder="거래처" value={partnerId}
                               onChange={setPartnerId} items={pickers.partners} />
            </EcCond>
          )}
          <EcCond label="담당자" pick>
            <CodePickerField label="담당자" hideLabel fill pair placeholder="담당자" value={employeeId}
                             onChange={setEmployeeId} items={employeeItems} />
          </EcCond>
          <EcCond label={L.warehouse} pick>
            <CodePickerField label={L.warehouse} hideLabel fill pair placeholder={L.warehouse} value={warehouseId}
                             onChange={setWarehouseId} items={pickers.warehouses} />
          </EcCond>
          {!selfUse && (
            <EcCond label="처리방법">
              <select className="ec-input w-full" value={handling} onChange={(e) => setHandling(e.target.value)}>
                {HANDLINGS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </EcCond>
          )}
          <EcCond label="프로젝트" pick>
            <CodePickerField label="프로젝트" hideLabel fill pair placeholder="프로젝트" value={projectId}
                             onChange={setProjectId} items={pickers.projects} />
          </EcCond>
        </ul>

        {substitute && (
          <div className="ec-pills mb-[6px]" role="tablist">
            {([['defect', '불량품목'], ['normal', '정상품목']] as const).map(([g, label]) => (
              <button key={g} type="button" role="tab" aria-selected={grid === g}
                      className={`ec-pill${grid === g ? ' active' : ''}`}
                      onClick={() => { setGrid(g); setPicked(new Set()) }}>{label}</button>
            ))}
          </div>
        )}
        <div className="flex gap-[4px] mb-[4px]">
          <button type="button" className="ec-btn ec-btn-sm" disabled={picked.size === 0}
                  onClick={() => { setRows((ls) => { const n = ls.filter((_, i) => !picked.has(i)); return n.length ? n : blankLines() }); setPicked(new Set()) }}>
            선택삭제
          </button>
        </div>
        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full">
            <thead>
              <tr>
                <th className="w-[44px] text-center">
                  <input type="checkbox" aria-label="전체 선택" checked={allPicked}
                         onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((_, i) => i)))} />
                </th>
                <th className="w-[176px]">품목코드</th>
                <th className="w-[194px]">품목명</th>
                <th className="w-[133px]">규격</th>
                <th className="w-[101px] text-right">수량</th>
                <th>{selfUse ? '사용유형' : '불량유형'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => {
                const it = itemById.get(l.itemId)
                return (
                  <tr key={i}>
                    <td className="text-center whitespace-nowrap">
                      <input type="checkbox" aria-label={`${i + 1}줄 선택`} checked={picked.has(i)}
                             onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
                      {' '}{i + 1}
                    </td>
                    <td>
                      <CodePickerField label="품목코드" hideLabel fill value={l.itemId}
                                       onChange={(v) => setLine(i, { itemId: v })} items={pickers.items} />
                    </td>
                    <td>{it?.name ?? ''}</td>
                    <td>{it?.sub ?? ''}</td>
                    <td>
                      <input className="ec-input w-full text-right" inputMode="decimal" aria-label={`${i + 1}줄 수량`}
                             value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value.replace(/[^\d.]/g, '') })} />
                    </td>
                    <td>
                      <CodePickerField label={L.kind} hideLabel fill value={l.kind}
                                       onChange={(v) => setLine(i, { kind: v })} items={kindItems} />
                    </td>
                  </tr>
                )
              })}
              <tr className="ec-total">
                <td colSpan={4} />
                <td className="text-right">{num(totalQty)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </EcSlipShell>
  )
}
