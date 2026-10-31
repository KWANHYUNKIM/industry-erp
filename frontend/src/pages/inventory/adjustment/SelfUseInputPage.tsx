import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import Modal from '../../../components/Modal'
import GridCode from '../../../components/codepicker/GridCode'
import EcSlipShell from '../../../components/EcSlipShell'
import { EcCond } from '../../../components/EcStatusPanel'
import { ymd } from '../../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../../api/client'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import { useCondPickers } from '../../../utils/useCondPickers'
import { dateNo } from '../../../utils/dateNo'
import type { StockAdjustmentSlip } from '../../../types/api'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'
import { SlipHistoryModal, slipHeadLabel } from '../../../features/sliphistory/SlipHistoryModal'
import { useRequired } from '../../../utils/useRequired'
import EcGridToolbar, { EcWebUploadButton } from '../../../components/EcGridToolbar'
import { useMyItemsPick, MyItemsNote } from '../../../components/codepicker/MyItemsButton'
import EcDateInput from '../../../components/ui/EcDateInput'
import GridSortModal from '../../../components/GridSortModal'
import { fmtNumber } from '../../../utils/format'

/** reason = 줄 [새로운 항목 추가](줄 적요 — 원본 '다양한 내역을 입력해보세요'). */
type Line = { itemId: string; quantity: string; kind: string; reason: string }
type Grid = 'defect' | 'normal'
const blank = (): Line => ({ itemId: '', quantity: '', kind: '', reason: '' })
/** 원본 격자는 빈 줄 셋으로 뜬다. */
const blankLines = () => [blank(), blank(), blank()]

/**
 * 재고 I › 기타이동 › 자가사용 › <b>자가사용입력</b>(E040503) · 자가사용조회에서 연 <b>자가사용수정</b> — 2026-10-12 loginaa 실측.
 *
 * <p>머리 [일자 · 거래처 / 담당자 · 창고 / 프로젝트], 아래 격자 [품목코드 · 품목명 · 규격 · 수량 · 사용유형] 에 품목을 여러 줄 넣어
 * 전표 한 장으로 저장한다. 사용유형은 코드도움(원본 회사: 100 고객샘플용 · 200 직원증정용 · 300 연구개발용) — 우리는 공통코드 '사용유형'.
 * 창고를 비우고 저장하면 막힌다. 저장하면 일자 · 창고는 그대로 두고 격자만 비운다. 격자 밑 합계줄은 수량 합.
 * 수정 창은 일자가 잠기고 버튼이 [저장(F8) · 삭제 · 닫기], 삭제는 '전표를 삭제하겠습니까?' 를 묻는다.
 *
 * <p>격자 위 도구줄 [찾기(F3) · 정렬 · My품목 · 주문 · 구매 · 재고불러오기 · 바코드 · 전표 바코드 · 검증 · 전표불러오기](불량처리는 주문 · 구매 대신
 * 판매 · 구매 · 생산 · 이동), 끝 [새로운 항목 추가] 열, 아래 [웹자료올리기] 는 원본처럼 모양을 둔다(EcGridToolbar — 찾기 · My품목만 동작).
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

export default function SelfUseInputPage({ adjustNo: openedNo, onDone: onDoneProp, onNav, kind = 'SELF_USE' }: {
  adjustNo?: string; onDone?: () => void; kind?: MoveKind
  /** 수정 창 [이전] · [다음] — 목록이 일자 차례로 한 장 앞 · 뒤 전표를 연다. */
  onNav?: (dir: -1 | 1) => void
} = {}) {
  const navigate = useNavigate()
  /* [복사] — 원본은 같은 머리 · 줄을 든 채 입력 창이 된다(저장하면 새 번호). */
  const [copied, setCopied] = useState(false)
  /*
   * 원본 [저장(F8)▲] › [저장/내용유지] — 저장한 그 전표의 수정 화면으로 바뀐다(판매입력과 같은 메뉴, 2026-10-30 클릭 대조).
   * 입력 화면에서 그렇게 바뀐 전표 번호를 들고, [닫기] 는 빈 입력 화면으로 돌아온다.
   */
  const [keptNo, setKeptNo] = useState<string | null>(null)
  const adjustNo = openedNo ?? keptNo ?? undefined
  const onDone = onDoneProp ?? (keptNo ? () => { setKeptNo(null); setSlip(null); reset(); setPartnerId(''); setHeaderNote('') } : undefined)
  const editing = !!adjustNo && !copied
  const L = LABEL[kind]
  const selfUse = kind === 'SELF_USE'
  const [handling, setHandling] = useState<string>('폐기')
  const pickers = useCondPickers(['partners', 'warehouses', 'projects', 'items', 'employees'])
  const [date, setDate] = useState(ymd(new Date()))
  const [partnerId, setPartnerId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [projectId, setProjectId] = useState('')
  /* 원본 자가사용입력 머리 [새로운 항목 추가] — 전표 비고(2026-10-30 클릭 대조: 수정 창에 저장한 글이 그대로 든다). */
  const [headerNote, setHeaderNote] = useState('')
  const [lines, setLines] = useState<Line[]>(blankLines())
  /* 품목대체의 [정상품목] 격자 — 발견창고로 들어오는 품목. */
  const [normals, setNormals] = useState<Line[]>(blankLines())
  const [grid, setGrid] = useState<Grid>('defect')
  const substitute = !selfUse && handling === '품목대체'
  const showNormal = substitute && grid === 'normal'
  const rows = showNormal ? normals : lines
  const setRows = showNormal ? setNormals : setLines
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [kinds, setKinds] = useState<{ code: string; name: string }[]>([])
  const [error, setError] = useState('')
  /* 빈 저장 — 원본은 글 없이 필수칸만 빨간 테두리(재고1 plans 자가사용 ② · 불량처리 ①: 창고 · 첫 품목코드 칸, 2026-10-21 실측). */
  const req = useRequired()
  const [notice, setNotice] = useState('')
  /* 수정 창에 연 전표 — [H] 이력이 쓴다. [저장/전표(F7)] 는 저장한 전표를 인쇄 창으로 연다. */
  const [slip, setSlip] = useState<StockAdjustmentSlip | null>(null)
  const [printSlip, setPrintSlip] = useState<StockAdjustmentSlip | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)

  /* 공통코드 그룹(사용유형 · 불량유형) — [신규(F2)] 가 같은 그룹에 코드를 더한다(Self-Customizing 공통코드와 같은 API). */
  const [kindGroupId, setKindGroupId] = useState<number | null>(null)
  const [newKind, setNewKind] = useState<{ line: number; code: string; name: string } | null>(null)
  const loadKinds = () =>
    api.get<{ id: number; name: string; codes: { code: string; name: string }[] }[]>('/codes')
      .then((r) => {
        const g = r.data.find((x) => x.name === L.kindCodes)
        setKindGroupId(g?.id ?? null)
        setKinds((g?.codes ?? []).map((c) => ({ code: c.code, name: c.name })))
      })
      .catch(() => setKinds([]))
  useEffect(() => { void loadKinds() }, [L.kindCodes])
  async function saveNewKind() {
    if (!newKind || kindGroupId == null) return
    if (!newKind.code.trim() || !newKind.name.trim()) { void ecAlert('코드와 코드명을 입력하세요.'); return }
    try {
      await api.post(`/codes/groups/${kindGroupId}/codes`, { code: newKind.code.trim(), name: newKind.name.trim(), value1: null, sortOrder: 0 })
      await loadKinds()
      setLine(newKind.line, { kind: newKind.name.trim() })
      setNewKind(null)
    } catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  useEffect(() => {
    if (!adjustNo) return
    setCopied(false)
    api.get<StockAdjustmentSlip>(`/stock-adjustments/slips/${encodeURIComponent(adjustNo)}`)
      .then(({ data: s }) => {
        setSlip(s)
        setDate(s.date)
        setPartnerId(s.partnerId != null ? String(s.partnerId) : '')
        setEmployeeId(s.employeeId != null ? String(s.employeeId) : '')
        setWarehouseId(String(s.warehouseId))
        setProjectId(s.projectId != null ? String(s.projectId) : '')
        if (s.handling) setHandling(s.handling)
        setHeaderNote(s.headerNote ?? '')
        const toLine = (l: StockAdjustmentSlip['lines'][number]) => ({ itemId: String(l.itemId), quantity: String(Math.abs(Number(l.quantityChange))), kind: l.kind ?? '', reason: l.reason ?? '' })
        setLines([...s.lines.filter((l) => !l.normal).map(toLine), blank()])
        /* 정상사용의 정상품목 줄은 서버가 불량 줄을 따라 붙인 것이라 격자로 펴지 않는다. */
        if (s.handling === '품목대체') setNormals([...s.lines.filter((l) => l.normal).map(toLine), blank()])
      })
      .catch((e) => setError(extractErrorMessage(e)))
  }, [adjustNo])

  const itemById = useMemo(() => new Map(pickers.items.map((i) => [i.value, i])), [pickers.items])
  /* 담당자는 id 로 든다(inventory 는 hr 을 모른다) — 후보 값도 id 로 바꿔 준다. */
  const employeeItems = useMemo(() => pickers.employees.map((e) => ({ ...e, value: String(e.id) })), [pickers.employees])
  /* 인쇄 [출고처] '거래처(코드)' — 원본 꼴(원본 거래처코드가 사업자번호라 '의료기기판매점(123-45-67012)'). */
  const partnerText = (id: number | null) => {
    const p = id != null ? pickers.partners.find((x) => x.value === String(id)) : undefined
    return p ? `${p.name}${p.code ? `(${p.code})` : ''}` : ''
  }
  const kindItems = useMemo(() => kinds.map((k) => ({ value: k.name, code: k.code, name: k.name })), [kinds])

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
    req.reset()
  }

  async function save(andPrint = false, keep = false) {
    setError(''); setNotice('')
    const filled = lines.filter((l) => l.itemId || l.quantity)
    const filledNormal = substitute ? normals.filter((l) => l.itemId || l.quantity) : []
    const need: Record<string, boolean> = { warehouse: !!warehouseId }
    if (filled.length === 0) need.item0 = false
    lines.forEach((l, i) => { if (l.itemId || l.quantity) { need[`item${i}`] = !!l.itemId; need[`qty${i}`] = Number(l.quantity) > 0 } })
    normals.forEach((l, i) => { if (substitute && (l.itemId || l.quantity)) { need[`nitem${i}`] = !!l.itemId; need[`nqty${i}`] = Number(l.quantity) > 0 } })
    if (!req.check(need)) return
    const body = {
      type: kind, date,
      partnerId: selfUse && partnerId ? Number(partnerId) : null,
      handling: selfUse ? null : handling,
      headerNote: selfUse && headerNote.trim() ? headerNote.trim() : null,
      employeeId: employeeId ? Number(employeeId) : null,
      warehouseId: Number(warehouseId),
      projectId: projectId ? Number(projectId) : null,
      lines: [
        ...filled.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), kind: l.kind || null, reason: l.reason.trim() || null })),
        ...filledNormal.map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), kind: l.kind || null, reason: l.reason.trim() || null, normal: true })),
      ],
    }
    try {
      const { data } = editing
        ? await api.put<StockAdjustmentSlip>(`/stock-adjustments/slips/${encodeURIComponent(adjustNo!)}`, body)
        : await api.post<StockAdjustmentSlip>('/stock-adjustments/slips', body)
      if (andPrint) setPrintSlip(data)
      if (keep && !editing) { setCopied(false); setKeptNo(data.adjustNo); return }
      if (editing || copied) { if (!andPrint) onDone?.(); return }
      /*
       * 원본 자가사용입력 · 불량처리입력은 저장하면 말 없이 일자 · 창고를 둔 채 격자를 비운다(2026-10-21 실측).
       * 머리 [거래처] · [새로운 항목 추가] 도 비운다 — 판매 · 구매입력과 같은 저장 뒤 모양(TradeEntry, 2026-10-22 · 10-28 실측):
       * 예전엔 거래처가 남아 '저장했는데 화면이 그대로' 로 보였다(데이터이관 루프 110).
       */
      reset()
      setPartnerId('')
      setHeaderNote('')
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  async function remove() {
    if (!adjustNo || !(await ecConfirm(selfUse ? '전표를 삭제하겠습니까?\n- 자가' : '전표를 삭제하겠습니까?\n- 불량처리'))) return
    try {
      await api.delete(`/stock-adjustments/slips/${encodeURIComponent(adjustNo)}`)
      onDone?.()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  const tableRef = useRef<HTMLTableElement>(null)
  /* [My품목] — 담아 둔 품목을 빈 줄에 붓는다(담는 쪽은 판매 · 구매입력 명세의 ★). */
  const myItems = useMyItemsPick((picked) => setRows((ls) => {
    const next = ls.filter((l) => l.itemId || l.quantity)
    for (const m of picked) next.push({ ...blank(), itemId: String(m.itemId) })
    next.push(blank())
    return next
  }))
  useTableColumnCheck(tableRef, `${L.name}${editing ? '수정' : '입력'}`, [rows])
  const totalQty = rows.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
  const allPicked = rows.length > 0 && picked.size === rows.length
  /* 원본 불량처리입력: 빈 저장이면 빨간 칸이 든 탭 오른쪽 위에 '!'(plans 재고1 불량처리 ①, 2026-10-21 실측). */
  const bang = !selfUse && (req.on('warehouse', !!warehouseId)
    || lines.some((l, i) => req.on(`item${i}`, !!l.itemId) || req.on(`qty${i}`, Number(l.quantity) > 0))
    || normals.some((l, i) => req.on(`nitem${i}`, !!l.itemId) || req.on(`nqty${i}`, Number(l.quantity) > 0)))

  return (
    <EcSlipShell
      title={`${L.name}${editing ? '수정' : '입력'}`}
      formTabs={[{ id: 'basic', label: `${L.name}입력`, bang }]} activeFormTab="basic"
      actions={editing
        /* 원본 자가사용수정 · 불량처리수정 버튼 아홉(2026-10-21 실측) — 창고이동수정과 같다. */
        ? [
              { label: '저장(F8)', primary: true, submit: true, onClick: () => void save() },
              { label: '저장/전표(F7)', onClick: () => void save(true) },
              { label: '복사', onClick: () => setCopied(true) },
              { label: '이전', onClick: () => onNav?.(-1) },
              { label: '다음', onClick: () => onNav?.(1) },
              { label: '닫기', onClick: () => onDone?.() },
              { label: '삭제', onClick: () => void remove() },
              /* 바깥 연동(메일 · 메신저로 보내기) — 모양만. */
              { label: '보내기' },
              { label: 'H', onClick: () => setShowHistory(true) },
            ]
        : [
            {
              label: '저장(F8)', primary: true, submit: true, onClick: () => void save(),
              /* 원본 [저장(F8)▲] 메뉴(2026-10-30 자가사용입력 E040503 실측): 저장/전자결재 · 저장/내용유지 · 저장/신규. */
              menu: [
                { label: '저장/전자결재', onClick: () => setNotice('전자결재 상신은 [그룹웨어 › 전자결재]에서 이 전표를 첨부해 올립니다(입력 화면에서 바로 올리는 길은 아직 없습니다).') },
                { label: '저장/내용유지', onClick: () => void save(false, true) },
                { label: '저장/신규', onClick: () => void save() },
              ],
            },
            { label: '저장/전표(F7)', onClick: () => void save(true) },
            { label: '다시 작성', onClick: reset },
            copied ? { label: '닫기', onClick: () => onDone?.() } : { label: '리스트', onClick: () => navigate(L.list) },
          ]}>
      <div>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        {notice && <p className="ec-alert mb-[8px]">{notice}</p>}

        <ul className="ec-form mb-[8px]">
          <EcCond label="일자">
            <EcDateInput className="ec-input w-[150px]" value={date} disabled={editing} onChange={(e) => setDate(e.target.value)} />
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
                             onChange={setWarehouseId} items={pickers.warehouses} invalid={req.on('warehouse', !!warehouseId)} />
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
          {selfUse && (
            <EcCond label="새로운 항목 추가">
              <input className="ec-input w-full" aria-label="새로운 항목 추가" placeholder="새로운 항목 추가" maxLength={300}
                     value={headerNote} onChange={(e) => setHeaderNote(e.target.value)} />
            </EcCond>
          )}
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
        <EcGridToolbar tableRef={tableRef} slipKinds={selfUse ? ['주문', '구매'] : ['판매', '구매', '생산', '이동']}
                       onMyItems={myItems.pick} myItemsBusy={myItems.busy} onSort={() => setSortOpen(true)}
                       onPull={(pulled) => setRows((ls) => {
                         /* 원본: 고른 전표의 품목 · 수량이 빈 줄 자리에 들어온다. */
                         const next = ls.filter((l) => l.itemId || l.quantity)
                         for (const p of pulled) next.push({ ...blank(), itemId: String(p.itemId), quantity: String(p.quantity) })
                         next.push(blank())
                         return next
                       })}>
          <button type="button" className="ec-btn ec-btn-sm" disabled={picked.size === 0}
                  onClick={() => { setRows((ls) => { const n = ls.filter((_, i) => !picked.has(i)); return n.length ? n : blankLines() }); setPicked(new Set()) }}>
            선택삭제
          </button>
          <MyItemsNote note={myItems.note} />
        </EcGridToolbar>
        <GridSortModal open={sortOpen} error={error} keys={['품목코드', '품목명', '규격'] as const} initial={['품목코드', '품목명']} rows={rows}
                       keyOf={(r, k) => { const it = itemById.get(r.itemId); return (k === '품목코드' ? it?.code : k === '품목명' ? it?.name : it?.sub) ?? '' }}
                       isFilled={(r) => !!(r.itemId || r.quantity)}
                       onApply={(sorted) => { setRows(sorted); setSortOpen(false) }} onClose={() => setSortOpen(false)} />
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
                {/* 원본 폭(2026-10-30 실측): 사용유형 182 · 새로운 항목 추가가 남은 폭 전부. */}
                <th className="w-[182px]">{selfUse ? '사용유형' : '불량유형'}</th>
                <th>새로운 항목 추가</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => {
                const it = itemById.get(l.itemId)
                const pre = showNormal ? 'n' : ''
                return (
                  <tr key={i}>
                    <td className="text-center whitespace-nowrap">
                      <input type="checkbox" aria-label={`${i + 1}줄 선택`} checked={picked.has(i)}
                             onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
                      {' '}{i + 1}
                    </td>
                    <td>
                      {/* 원본처럼 코드를 쳐서 Enter — 한 건이면 줄이 채워지고, 여럿이면 품목검색 창(2026-10-21 실측). */}
                      <div className={req.cls(`${pre}item${i}`, !!l.itemId)}>
                        <GridCode title="품목검색" codeHead="품목코드" nameHead="품목명" items={pickers.items}
                                  value={l.itemId} onPick={(v) => setLine(i, { itemId: v })} />
                      </div>
                    </td>
                    <td>{it?.name ?? ''}</td>
                    <td>{it?.sub ?? ''}</td>
                    <td>
                      <div className={req.cls(`${pre}qty${i}`, Number(l.quantity) > 0)}>
                        <input className="ec-input w-full text-right" inputMode="decimal" aria-label={`${i + 1}줄 수량`}
                               value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value.replace(/[^\d.]/g, '') })} />
                      </div>
                    </td>
                    <td>
                      <CodePickerField label={L.kind} hideLabel fill value={l.kind}
                                       onChange={(v) => setLine(i, { kind: v })} items={kindItems}
                                       onNew={kindGroupId == null ? undefined : () => setNewKind({ line: i, code: '', name: '' })} />
                    </td>
                    <td>
                      {/* 줄 [새로운 항목 추가] — 원본은 글칸(줄 적요). 예전엔 빈 칸이라 칠 수 없었다(루프 107). */}
                      <input className="ec-input w-full" aria-label={`${i + 1}줄 새로운 항목 추가`} maxLength={300}
                             value={l.reason} onChange={(e) => setLine(i, { reason: e.target.value })} />
                    </td>
                  </tr>
                )
              })}
              <tr className="ec-total">
                <td colSpan={4} />
                <td className="text-right">{fmtNumber(totalQty)}</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <EcWebUploadButton />
        <Modal open={newKind != null} error={error} title={`${L.kind} 신규`} width={360} onClose={() => setNewKind(null)}>
          {newKind && (
            <div className="grid grid-cols-[80px_1fr] items-center gap-[6px]">
              <label className="text-ec-label">코드</label>
              <input className="ec-input" aria-label="코드" value={newKind.code} onChange={(e) => setNewKind({ ...newKind, code: e.target.value })} />
              <label className="text-ec-label">{L.kind}명</label>
              <input className="ec-input" aria-label={`${L.kind}명`} value={newKind.name} onChange={(e) => setNewKind({ ...newKind, name: e.target.value })}
                     onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveNewKind() } }} />
              <div className="col-span-2 flex gap-[6px]">
                <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveNewKind()}>저장(F8)</button>
                <button type="button" className="ec-btn" onClick={() => setNewKind(null)}>닫기</button>
              </div>
            </div>
          )}
        </Modal>
        <Modal open={!!printSlip} title={selfUse ? '자가사용전표' : '불량처리'} error={error} onClose={() => { setPrintSlip(null); if (editing || copied) onDone?.() }}>
          {printSlip && (
            <SelfUsePrint slip={printSlip} partnerText={partnerText}
                          employeeText={employeeItems.find((e) => e.value === String(printSlip.employeeId))?.name ?? ''}
                          whCode={pickers.warehouses.find((w) => w.value === String(printSlip.warehouseId))?.code ?? ''}
                          onClose={() => { setPrintSlip(null); if (editing || copied) onDone?.() }} />
          )}
        </Modal>
        {/* [H] — 서버가 적은 작업 이력(StockAdjustmentService.HISTORY_TARGET, 전표번호로 연다). */}
        {showHistory && slip && adjustNo && (
          <SlipHistoryModal target="STOCK_ADJUSTMENT" docNo={adjustNo} head={slipHeadLabel(date, adjustNo)}
                            onClose={() => setShowHistory(false)} />
        )}
      </div>
    </EcSlipShell>
  )
}

/**
 * 자가사용전표 — 원본 목록 [인쇄] · 수정 창 [저장/전표(F7)] 의 '기본(수정불가)' 양식(2026-10-21 실측):
 * 전표번호 · 출고창고 '이름(코드)' · DATE '2026. 10. 20' · 출고처 '거래처(사업자번호)',
 * 순번 · 품목코드 · 품목명[규격] · 수량 · 적요, 감소수량 합 · 인수 인. 버튼 인쇄 · 닫기(Email · Excel 은 바깥 연동 · 파일이라 뺌).
 */
export function SelfUsePrint({ slip, partnerText, employeeText = '', whCode, onClose }: {
  slip: StockAdjustmentSlip; partnerText: (id: number | null) => string; employeeText?: string; whCode: string; onClose: () => void
}) {
  const fix2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const lines = slip.lines.filter((l) => !l.normal)
  const total = lines.reduce((a, l) => a + Math.abs(Number(l.quantityChange)), 0)
  if (slip.type === 'DEFECT') return <DefectPrint slip={slip} employeeText={employeeText} whCode={whCode} onClose={onClose} />
  return (
    <div>
      <div className="text-center font-bold text-[18px] mb-[8px]">자 가 사 용 전 표</div>
      <table className="w-full text-left mb-[6px]">
        <tbody>
          <tr><th className="w-[90px]">전표번호</th><td>{dateNo(slip.date, slip.adjustNo)}</td><th className="w-[70px]">출고창고</th><td>{slip.warehouseName}({whCode})</td></tr>
          <tr><th>DATE</th><td>{slip.date.replaceAll('-', '. ')}</td><th>출고처</th><td>{partnerText(slip.partnerId)}</td></tr>
        </tbody>
      </table>
      <table className="w-full text-left">
        <thead><tr><th className="w-[44px] text-center">순번</th><th className="w-[110px]">품목코드</th><th>품목명[규격]</th><th className="w-[90px] text-right">수량</th><th>적요</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td className="text-center">{i + 1}</td><td>{l.itemCode}</td>
              <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''}</td>
              <td className="text-right">{fix2(Math.abs(Number(l.quantityChange)))}</td><td>{l.reason ?? ''}</td>
            </tr>
          ))}
          <tr><td colSpan={3} className="text-right font-semibold">감소수량</td><td className="text-right font-semibold">{fix2(total)}</td><td>인수 <span className="ml-[24px]">인</span></td></tr>
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[10px]">
        <button className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

/**
 * 불량발견보고서 — 원본 불량처리조회 [인쇄] 의 '기본(수정불가)' 양식(2026-10-21 실측, 창 제목 '불량처리'):
 * 전표번호 · 담당자 '( )' · 처리방법 · 발견창고 '이름(코드)', 순번 · 품목코드 · 품목명[규격] · 감소수량 · 증가수량 · 적요,
 * 감소수량 · 증가수량 합 · 인수 인. 불량품목 줄은 감소, 품목대체 · 정상사용의 정상품목 줄은 증가.
 */
function DefectPrint({ slip, employeeText, whCode, onClose }: {
  slip: StockAdjustmentSlip; employeeText: string; whCode: string; onClose: () => void
}) {
  const fix2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const qty = (l: StockAdjustmentSlip['lines'][number]) => Math.abs(Number(l.quantityChange))
  const dec = slip.lines.filter((l) => !l.normal).reduce((a, l) => a + qty(l), 0)
  const inc = slip.lines.filter((l) => l.normal).reduce((a, l) => a + qty(l), 0)
  return (
    <div>
      <div className="text-center font-bold text-[18px] mb-[8px]">불 량 발 견 보 고 서</div>
      <table className="w-full text-left mb-[6px]">
        <tbody>
          <tr><th className="w-[90px]">전표번호</th><td>{dateNo(slip.date, slip.adjustNo)}</td><th className="w-[70px]">담당자</th><td>{employeeText} ( )</td></tr>
          <tr><th>처리방법</th><td>{slip.handling ?? ''}</td><th>발견창고</th><td>{slip.warehouseName}({whCode})</td></tr>
        </tbody>
      </table>
      <table className="w-full text-left">
        <thead><tr><th className="w-[44px] text-center">순번</th><th className="w-[110px]">품목코드</th><th>품목명[규격]</th><th className="w-[90px] text-right">감소수량</th><th className="w-[90px] text-right">증가수량</th><th>적요</th></tr></thead>
        <tbody>
          {slip.lines.map((l, i) => (
            <tr key={l.id}>
              <td className="text-center">{i + 1}</td><td>{l.itemCode}</td>
              <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''}</td>
              <td className="text-right">{l.normal ? '' : fix2(qty(l))}</td>
              <td className="text-right">{l.normal ? fix2(qty(l)) : ''}</td><td>{l.reason ?? ''}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} className="text-right font-semibold">감소수량 · 증가수량</td>
            <td className="text-right font-semibold">{fix2(dec)}</td><td className="text-right font-semibold">{inc ? fix2(inc) : ''}</td>
            <td>인수 <span className="ml-[24px]">인</span></td>
          </tr>
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[10px]">
        <button className="ec-btn ec-btn-primary" onClick={() => window.print()}>인쇄</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}
