import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import EcNumInput from '../../components/EcNumInput'
import EcEmptyRow from '../../components/ui/EcEmptyRow'
import EcPeriodPicks, { periodOf, ymd } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateNo } from '../../utils/dateNo'
import { useShortcut } from '../../utils/useShortcut'
import { useTableSort } from '../../utils/useTableSort'
import { fillAndPrint, openPrintWindow } from '../../utils/print'
import { releaseSlipHtml, type ReleaseSlip } from '../../utils/releaseSlipDocument'

/**
 * 주문서출고처리(원본 E040230 · 재고 I › 영업관리 › 주문서). 2026-10-13 loginaa 직접 써 보며 잰 것:
 *
 * - 알약 [미처리] · [처리]. 조건(Search(F3) 로 내려오는 판): 기준일자(기본 최근30일) · 내.외자구분 · 창고 · 프로젝트 · 거래처 ·
 *   품목코드 · 기타(수정일자순(정렬)). 판 아래 기간 단추 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일 · 최근30일.
 * - 미처리: [체크] · 일자-No. · 거래처명 · 품목명[규격명] · 잔량 · 출고수량(입력) · 납기일자 · 적요. 체크하면 출고수량이 잔량으로 찬다.
 *   하단 [출고] · [Excel]. [출고] → '출고등록' 창(일자 · 거래처 · 처리구분 '처리') [저장(F8)] — 안내 없이 닫히고 잔량이 준다.
 * - 처리: [체크] · 일자-No.(출고) · 일자-No.(주문) · 거래처명 · 품목 · 출고수량합계 · 판매('입력' 또는 판매 일자-No.) · 인쇄.
 *   하단 [판매입력] · Email · 인쇄 · Excel · 처리구분변경 · [처리취소].
 *   [처리취소] 는 판매가 있으면 '이미 판매입력된 전표가 있습니다. 진행하겠습니까?' 를 묻고, 처리만 지운다(판매는 남고 잔량이 돌아온다).
 *
 * 2026-10-13 둘째 실측(QA재고1 주문 -5 · -6 을 함께 출고):
 * - 여러 주문을 한 번에 [출고] 하면 <b>주문마다 한 건</b>(목록 위의 -6 이 출고 -1, -5 가 -2). 출고등록 창의 거래처 칸은 비어 있다.
 * - 출고등록 창 [판매입력] 을 켜고 저장하면 판매입력 창이 <b>두 주문의 품목을 한꺼번에</b> 담아 뜨고, 저장하면 두 처리 건의
 *   [판매] 칸이 같은 판매(2026/10/13-7)를 가리킨다. 처리 탭에서 둘을 골라 하단 [판매입력] 해도 같다.
 * - [인쇄] 열 → '출 고 증' 미리보기(창고 · 출고일자 · 납품처 · 품목코드 · 품목명 · 수량 · 인수). [처리취소] 는 '처리취소하겠습니까?'.
 *
 * 2026-10-13 셋째 실측(데모 주문 2026/10/13-1 울트라 로션 잔량 10 으로 써 보고 지움):
 * - 잔량 10 에 출고수량 15 를 넣고 [출고] 해도 막지 않는다 — 저장되고 그 줄이 미처리에서 사라진다.
 * - 처리 탭 첫 [일자-No.](출고) 도 링크 → '주문서출고처리수정' 창: 일자 · 주문번호 · 거래처 · 처리구분 + 줄(품목 · 규격 ·
 *   추가수량 · 수량). 수량 15 → 4 로 [저장(F8)] 하면 안내 없이 닫히고 미처리 잔량이 6. 0 으로 저장해도 받고 합계가 빈칸.
 *   창의 [처리취소] 는 '전표를 삭제하겠습니까?' 를 묻고 지운다.
 * - [처리구분변경] → '처리구분변경' 창(처리구분: 처리 하나) [저장(F8)] · [닫기].
 * - 하단 버튼은 잠그지 않는다. 안 고르고 누르면 [출고] · [판매입력] · [인쇄] 는 '리스트에 선택된 자료가 없습니다.…',
 *   [처리구분변경] · [처리취소] 는 '선택된 자료가 없습니다.\n<버튼>할 자료를 체크한 후 다시 시도 바랍니다.'
 * - 번호 칸이 체크 칸이다(form-checkbox-numbered — 흰 동그라미 안 회색 번호, 고르면 파랑). 미처리 머리는 출고수량 말고 ▼ 정렬.
 *
 * 아직 없는 것: Email(바깥 발송) · 수정 창의 [저장/전표(F7)] · [H](안 눌러 봄).
 */
type Tab = 'PENDING' | 'DONE'

interface PendingLine {
  orderId: number; orderNo: string; orderDate: string; orderLineId: number
  partnerId: number; partnerName: string; warehouseId: number | null; projectId: number | null
  itemId: number; itemCode: string; itemName: string; spec: string | null
  orderQty: number; releasedQty: number; remainQty: number
  dueDate: string | null; remark: string | null; orderUpdatedAt: string | null
}

interface ReleaseEditLine { lineId: number; itemName: string; spec: string | null; addableQty: number; quantity: number }
interface ReleaseEdit {
  id: number; releaseNo: string; releaseDate: string; orderNo: string; orderDate: string; partnerName: string
  lines: ReleaseEditLine[]
}

interface ReleaseRow {
  id: number; releaseNo: string; releaseDate: string
  orderId: number; orderNo: string; orderDate: string
  partnerName: string; itemSummary: string; totalQty: number
  saleId: number | null; saleNo: string | null; saleDate: string | null
}

const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일', '최근30일'] as const
const NO_PICK = '리스트에 선택된 자료가 없습니다.\n\n체크박스에 체크한 후 다시 시도 바랍니다.'
/** 원본 [처리구분변경] · [처리취소] 는 버튼 이름을 넣어 묻는다. */
const noPickFor = (what: string) => `선택된 자료가 없습니다.\n${what}할 자료를 체크한 후 다시 시도 바랍니다.`
const qtyText = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const slash = (d: string | null) => (d ? d.replace(/-/g, '/') : '')
/** 수량 칸 — 원본은 0 을 빈칸으로 그린다(수정 창에서 0 으로 저장한 건의 출고수량합계). */
const qtyOrBlank = (n: number) => (n === 0 ? '' : qtyText(n))

/** 원본 번호 칸(form-checkbox-numbered) — 번호가 곧 체크 칸이다. 안 고르면 흰 동그라미에 회색 번호, 고르면 파랑. */
function NumCheck({ no, on, onChange, label }: { no: number | ''; on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <label className="relative inline-block align-middle cursor-pointer">
      <input type="checkbox" aria-label={label} checked={on} onChange={(e) => onChange(e.target.checked)}
        className="absolute inset-0 m-0 opacity-0 cursor-pointer" />
      <span className={`inline-block w-[18px] leading-[17px] text-center rounded-[6px] border-[length:var(--ec-hair)] ${
        on ? 'bg-ec-blue border-ec-blue text-ec-panel' : 'bg-ec-panel border-ec-line text-ec-icon'}`}>{no}</span>
    </label>
  )
}

export default function OrderReleasePage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === '처리' ? 'DONE' : 'PENDING'
  const setTab = (t: Tab) => { setChecked(new Set()); setParams(t === 'DONE' ? { tab: '처리' } : {}, { replace: true }) }

  const init = periodOf('최근30일')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [domestic, setDomestic] = useState(true)
  const [foreign, setForeign] = useState(true)
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const pickers = useCondPickers(['warehouses', 'projects', 'partners', 'items'])

  const [pending, setPending] = useState<PendingLine[]>([])
  const [done, setDone] = useState<ReleaseRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  /** 미처리 줄의 [출고수량] — 주문 줄 id 별. */
  const [qty, setQty] = useState<Record<number, string>>({})
  /** '출고등록' 창. */
  const [regOpen, setRegOpen] = useState(false)
  const [regDate, setRegDate] = useState(ymd(new Date()))
  const [regError, setRegError] = useState('')
  /** 출고등록 창의 [판매입력] — 켜고 저장하면 방금 만든 처리 건들로 판매입력을 연다. */
  const [regSale, setRegSale] = useState(false)
  useShortcut('F8', () => void saveRelease(), regOpen)
  /** '주문서출고처리수정' 창 — 처리 탭 첫 [일자-No.]. */
  const [edit, setEdit] = useState<ReleaseEdit | null>(null)
  const [editQty, setEditQty] = useState<Record<number, string>>({})
  const [editError, setEditError] = useState('')
  useShortcut('F8', () => void saveEdit(), edit != null)
  /** '처리구분변경' 창 — 처리구분이 '처리' 하나뿐이라 저장해도 바뀌는 것이 없다. */
  const [kindOpen, setKindOpen] = useState(false)
  useShortcut('F8', () => setKindOpen(false), kindOpen)

  async function load() {
    setLoading(true); setError('')
    try {
      if (tab === 'PENDING') setPending((await api.get<PendingLine[]>('/order-releases/pending', { params: { from, to } })).data)
      else setDone((await api.get<ReleaseRow[]>('/order-releases', { params: { from, to } })).data)
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [tab, from, to])

  /** 우리 주문서는 통화가 없어 전부 내자다 — [내자] 를 끄면 다 빠지고 [외자] 만으로는 아무것도 안 걸린다. */
  const isForeign = (_p: PendingLine) => false
  const shownPending = useMemo(() => [...pending]
    // [수정일자순(정렬)] — 주문을 마지막으로 고친 때가 최근인 것부터.
    .sort((a, b) => (byUpdated ? (b.orderUpdatedAt ?? '').localeCompare(a.orderUpdatedAt ?? '') : 0))
    .filter((p) => (isForeign(p) ? foreign : domestic))
    .filter((p) => !whCond || String(p.warehouseId) === whCond)
    .filter((p) => !projCond || String(p.projectId) === projCond)
    .filter((p) => !partnerCond || String(p.partnerId) === partnerCond)
    .filter((p) => !itemCond || String(p.itemId) === itemCond), [pending, byUpdated, domestic, foreign, whCond, projCond, partnerCond, itemCond])

  const sort = useTableSort(shownPending, {
    '일자-No.': (p) => `${p.orderDate} ${p.orderNo}`,
    거래처명: (p) => p.partnerName,
    품목명: (p) => p.itemName,
    잔량: (p) => p.remainQty,
    납기일자: (p) => p.dueDate,
    적요: (p) => p.remark,
  })

  function toggle(id: number, on: boolean, remain?: number) {
    setChecked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n })
    // 원본: 체크하면 비어 있던 [출고수량] 이 잔량으로 찬다.
    if (on && remain != null) setQty((q) => (q[id] ? q : { ...q, [id]: String(remain) }))
  }

  async function saveRelease() {
    setRegError('')
    const lines = shownPending.filter((p) => checked.has(p.orderLineId))
      .map((p) => ({ orderLineId: p.orderLineId, quantity: Number(qty[p.orderLineId] || p.remainQty) }))
    try {
      const made = (await api.post<ReleaseRow[]>('/order-releases', { releaseDate: regDate, lines })).data
      setRegOpen(false); setChecked(new Set()); setQty({})
      if (regSale && made.length > 0) { navigate(`/sales/sell?fromRelease=${made.map((r) => r.id).join(',')}`); return }
      void load()
    } catch (err) { setRegError(extractErrorMessage(err)) }
  }

  /** [출고] — 안 고르고 누르면 원본처럼 알린다(버튼을 잠그지 않는다). */
  function openRegister() {
    if (checked.size === 0) return alert(NO_PICK)
    setRegError(''); setRegDate(ymd(new Date())); setRegOpen(true)
  }

  /** 처리 탭 첫 [일자-No.] → '주문서출고처리수정'. */
  async function openEdit(id: number) {
    setEditError('')
    try {
      const d = (await api.get<ReleaseEdit>(`/order-releases/${id}`)).data
      setEdit(d)
      setEditQty(Object.fromEntries(d.lines.map((l) => [l.lineId, String(l.quantity)])))
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function saveEdit() {
    if (!edit) return
    setEditError('')
    try {
      await api.put(`/order-releases/${edit.id}`, {
        lines: edit.lines.map((l) => ({ lineId: l.lineId, quantity: Number(editQty[l.lineId] || 0) })),
      })
      setEdit(null)
      void load()
    } catch (err) { setEditError(extractErrorMessage(err)) }
  }

  /** 수정 창 [처리취소] — 원본 문구 '전표를 삭제하겠습니까?'. */
  async function deleteEdit() {
    if (!edit || !confirm('전표를 삭제하겠습니까?\n- 주문서출고처리수정')) return
    try {
      await api.delete(`/order-releases/${edit.id}`)
      setEdit(null)
      void load()
    } catch (err) { setEditError(extractErrorMessage(err)) }
  }

  /** [처리취소] — 판매가 걸린 건이 있으면 원본 문구로 묻는다. */
  async function cancelChecked() {
    const rows = done.filter((r) => checked.has(r.id))
    if (rows.length === 0) return alert(noPickFor('처리취소'))
    if (rows.some((r) => r.saleId != null)
      ? !confirm('이미 판매입력된 전표가 있습니다.\n진행하겠습니까?')
      : !confirm('처리취소하겠습니까?')) return
    const fails: string[] = []
    for (const r of rows) {
      try { await api.delete(`/order-releases/${r.id}`) } catch (err) { fails.push(extractErrorMessage(err)) }
    }
    setChecked(new Set())
    void load()
    if (fails.length) alert(fails.join('\n'))
  }

  /** 하단 [판매입력] — 고른 건 중 아직 판매가 없는 것들을 <b>한 판매로 묶어</b> 판매입력을 연다(원본도 그렇다). */
  function saleFromChecked() {
    const rs = done.filter((x) => checked.has(x.id) && x.saleId == null)
    if (rs.length === 0) return alert(checked.size === 0 ? NO_PICK : '이미 판매입력된 전표가 있습니다.')
    navigate(`/sales/sell?fromRelease=${rs.map((r) => r.id).join(',')}`)
  }

  /** [인쇄] — 출고증 미리보기. 창은 누른 순간 열어 두고(팝업 차단) 내용은 받아 와서 채운다. */
  async function printSlips(ids: number[]) {
    if (ids.length === 0) return alert(NO_PICK)
    const win = openPrintWindow()
    if (!win) return
    try {
      const ds = await Promise.all(ids.map((id) => api.get<ReleaseSlip>(`/order-releases/${id}`)))
      fillAndPrint(win, releaseSlipHtml(ds.map((d) => d.data)), false)
    } catch (err) { win.close(); setError(extractErrorMessage(err)) }
  }

  const rows = tab === 'PENDING' ? shownPending : done
  const allChecked = rows.length > 0 && rows.every((r) => checked.has('orderLineId' in r ? r.orderLineId : r.id))

  return (
    <EcListShell
      title="주문서출고처리"
      collapseConditions
      onSearch={load}
      actions={tab === 'PENDING'
        ? [
            { label: '출고', primary: true, onClick: openRegister },
            { label: 'Excel' },
          ]
        : [
            { label: '판매입력', primary: true, onClick: saleFromChecked },
            { label: '인쇄', onClick: () => void printSlips(done.filter((r) => checked.has(r.id)).map((r) => r.id)) },
            { label: 'Excel' },
            { label: '처리구분변경', onClick: () => (checked.size === 0 ? alert(noPickFor('처리구분변경')) : setKindOpen(true)) },
            { label: '처리취소', onClick: () => void cancelChecked() },
          ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond mb-[8px]">
        <EcCond label="기준일자">
          <input type="date" className="ec-input w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="내.외자구분">
          <label className="inline-flex items-center gap-[3px] mr-[10px]">
            <input type="checkbox" checked={domestic && foreign} onChange={(e) => { setDomestic(e.target.checked); setForeign(e.target.checked) }} /> 전체
          </label>
          <label className="inline-flex items-center gap-[3px] mr-[10px]">
            <input type="checkbox" checked={domestic} onChange={(e) => setDomestic(e.target.checked)} /> 내자
          </label>
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={foreign} onChange={(e) => setForeign(e.target.checked)} /> 외자
          </label>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={projCond} onChange={setProjCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      <div className="ec-pills mb-[8px]">
        <button type="button" className={`ec-pill no-ec${tab === 'PENDING' ? ' active' : ''}`} onClick={() => setTab('PENDING')}>미처리</button>
        <button type="button" className={`ec-pill no-ec${tab === 'DONE' ? ' active' : ''}`} onClick={() => setTab('DONE')}>처리</button>
      </div>
      <div className="text-right mb-[4px]">{slash(from)} ~{slash(to)}</div>

      {tab === 'PENDING' ? (
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-[48px] text-center">
                <NumCheck no="" label="전체 선택" on={allChecked}
                  onChange={(on) => shownPending.forEach((p) => toggle(p.orderLineId, on, p.remainQty))} />
              </th>
              <th className="cursor-pointer" onClick={() => sort.toggle('일자-No.')}>일자-No. {sort.mark('일자-No.')}</th>
              <th className="cursor-pointer" onClick={() => sort.toggle('거래처명')}>거래처명 {sort.mark('거래처명')}</th>
              <th className="cursor-pointer" onClick={() => sort.toggle('품목명')}>품목명[규격명] {sort.mark('품목명')}</th>
              <th className="text-right cursor-pointer" onClick={() => sort.toggle('잔량')}>잔량 {sort.mark('잔량')}</th>
              <th className="text-right">출고수량</th>
              <th className="cursor-pointer" onClick={() => sort.toggle('납기일자')}>납기일자 {sort.mark('납기일자')}</th>
              <th className="cursor-pointer" onClick={() => sort.toggle('적요')}>적요 {sort.mark('적요')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <EcEmptyRow colSpan={8} loading /> : shownPending.length === 0 && <EcEmptyRow colSpan={8} />}
            {!loading && sort.sorted.map((p, i) => (
              <tr key={p.orderLineId}>
                <td className="text-center">
                  <NumCheck no={i + 1} label="선택" on={checked.has(p.orderLineId)}
                    onChange={(on) => toggle(p.orderLineId, on, p.remainQty)} />
                </td>
                <td><a className="cursor-pointer" onClick={() => navigate(`/sales/orders?edit=${p.orderId}`)}>{dateNo(p.orderDate, p.orderNo)}</a></td>
                <td>{p.partnerName}</td>
                <td>{p.itemName}{p.spec ? ` [${p.spec}]` : ''}</td>
                <td className="text-right">{qtyText(p.remainQty)}</td>
                <td className="w-[130px]">
                  <EcNumInput className="ec-input w-full text-right" value={qty[p.orderLineId] ?? ''}
                    onValue={(v) => setQty((q) => ({ ...q, [p.orderLineId]: v }))} />
                </td>
                <td>{slash(p.dueDate)}</td>
                <td>{p.remark ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-[48px] text-center">
                <NumCheck no="" label="전체 선택" on={allChecked} onChange={(on) => done.forEach((r) => toggle(r.id, on))} />
              </th>
              <th>일자-No.</th>
              <th>일자-No.</th>
              <th>거래처명</th>
              <th>품목</th>
              <th className="text-right">출고수량합계</th>
              <th className="text-center">판매</th>
              <th className="text-center">인쇄</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <EcEmptyRow colSpan={8} loading /> : done.length === 0 && <EcEmptyRow colSpan={8} />}
            {!loading && done.map((r, i) => (
              <tr key={r.id}>
                <td className="text-center">
                  <NumCheck no={i + 1} label="선택" on={checked.has(r.id)} onChange={(on) => toggle(r.id, on)} />
                </td>
                <td><a className="cursor-pointer" onClick={() => void openEdit(r.id)}>{dateNo(r.releaseDate, r.releaseNo)}</a></td>
                <td><a className="cursor-pointer" onClick={() => navigate(`/sales/orders?edit=${r.orderId}`)}>{dateNo(r.orderDate, r.orderNo)}</a></td>
                <td>{r.partnerName}</td>
                <td>{r.itemSummary}</td>
                <td className="text-right">{qtyOrBlank(r.totalQty)}</td>
                <td className="text-center">
                  {r.saleId != null && r.saleNo && r.saleDate
                    ? <a className="cursor-pointer" onClick={() => navigate(`/sales/sell?edit=${r.saleId}`)}>{dateNo(r.saleDate, r.saleNo).replace(' -', '-')}</a>
                    : <a className="cursor-pointer" onClick={() => navigate(`/sales/sell?fromRelease=${r.id}`)}>입력</a>}
                </td>
                <td className="text-center"><a className="cursor-pointer" onClick={() => void printSlips([r.id])}>인쇄</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={regOpen} error={regError} title="출고등록" width={760} onClose={() => setRegOpen(false)}>
        <div className="ec-form">
          <div className="grid grid-cols-2 gap-[6px] items-center">
            <label className="flex items-center gap-[10px]">
              <span className="w-[93px] text-ec-label">일자</span>
              <input type="date" className="ec-input w-[160px]" value={regDate} onChange={(e) => setRegDate(e.target.value)} />
            </label>
            <span />
            <span className="flex items-center gap-[10px]"><span className="w-[93px] text-ec-label">거래처</span></span>
            <label className="flex items-center gap-[10px]">
              <span className="w-[93px] text-ec-label">처리구분</span>
              <select className="ec-input flex-1" value="처리" onChange={() => {}}><option>처리</option></select>
            </label>
          </div>
        </div>
        <div className="flex gap-[4px] mt-[9px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveRelease()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setRegOpen(false)}>닫기</button>
          <label className="inline-flex items-center gap-[3px] ml-[6px]">
            <input type="checkbox" checked={regSale} onChange={(e) => setRegSale(e.target.checked)} /> 판매입력
          </label>
        </div>
      </Modal>

      <Modal open={edit != null} error={editError} title="주문서출고처리수정" width={760} onClose={() => setEdit(null)}>
        {edit && (<>
          <div className="ec-form">
            <div className="grid grid-cols-2 gap-[6px] items-center">
              <span className="flex items-center gap-[10px]">
                <span className="w-[93px] text-ec-label">일자</span>{dateNo(edit.releaseDate, edit.releaseNo)}
              </span>
              <span />
              <span className="flex items-center gap-[10px]">
                <span className="w-[93px] text-ec-label">주문번호</span>{dateNo(edit.orderDate, edit.orderNo)}
              </span>
              <span className="flex items-center gap-[10px]">
                <span className="w-[93px] text-ec-label">거래처</span>{edit.partnerName}
              </span>
              <label className="flex items-center gap-[10px]">
                <span className="w-[93px] text-ec-label">처리구분</span>
                <select className="ec-input flex-1" value="처리" onChange={() => {}}><option>처리</option></select>
              </label>
            </div>
          </div>
          <table className="w-full mt-[9px]">
            <thead>
              <tr><th className="w-[48px]" /><th>품목</th><th>규격</th><th className="text-right">추가수량</th><th>수량</th></tr>
            </thead>
            <tbody>
              {edit.lines.map((l, i) => (
                <tr key={l.lineId}>
                  <td className="text-center"><NumCheck no={i + 1} label="선택" on={false} onChange={() => {}} /></td>
                  <td>{l.itemName}</td>
                  <td>{l.spec ?? ''}</td>
                  <td className="text-right">{l.addableQty.toLocaleString('ko-KR')}</td>
                  <td className="w-[130px]">
                    <EcNumInput className="ec-input w-full text-right" value={editQty[l.lineId] ?? ''}
                      onValue={(v) => setEditQty((q) => ({ ...q, [l.lineId]: v }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[4px] mt-[9px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveEdit()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setEdit(null)}>닫기</button>
            <button type="button" className="ec-btn" onClick={() => void deleteEdit()}>처리취소</button>
          </div>
        </>)}
      </Modal>

      <Modal open={kindOpen} error={error} title="처리구분변경" width={760} onClose={() => setKindOpen(false)}>
        <div className="ec-form">
          <label className="flex items-center gap-[10px]">
            <span className="w-[93px] text-ec-label">처리구분</span>
            <select className="ec-input flex-1" value="처리" onChange={() => {}}><option>처리</option></select>
          </label>
        </div>
        <div className="flex gap-[4px] mt-[9px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => setKindOpen(false)}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setKindOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
