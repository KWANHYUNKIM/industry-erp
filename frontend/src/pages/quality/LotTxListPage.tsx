import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import { dateNo } from '../../utils/dateNo'
import type { Lot, LotTransaction } from '../../types/api'
import Modal from '../../components/Modal'
import { useShortcut } from '../../utils/useShortcut'
import { ymd } from '../../components/EcPeriodPicks'
import { ecConfirm } from '../../components/EcDialog'

/*
 * 원본 '시리얼/로트No.내역입력' [전표구분] 후보 — 차례 그대로(2026-10-12 실측, 기본 견적).
 * 로트 재고 방향은 서버(LotService.MANUAL_DOC_SIGN)가 정한다.
 */
const DOC_TYPES = ['견적', '주문', '판매', '출하지시', '출하', '발주', '구매', '생산입고', '생산소모', 'A/S접수', 'A/S수리',
  '창고이동', '생산불출', '자가사용', '불량-품목대체(불량품목)', '불량-품목대체(정상품목)', '불량-정상사용', '불량-폐기',
  '품질검사요청', '품질검사', 'Invoice/Packing List'] as const
interface TxForm {
  txDate: string; docType: string; warehouseId: string; itemId: string; quantity: string; lotNo: string
  partnerId: string; mgmtId: string; chargeName: string; projectId: string; note: string
}
const emptyForm = (): TxForm => ({ txDate: ymd(new Date()), docType: '견적', warehouseId: '', itemId: '', quantity: '', lotNo: '',
  partnerId: '', mgmtId: '', chargeName: '', projectId: '', note: '' })

/** 원본 [유효기한] 후보 — 시리얼/로트No.재고현황과 같다(2026-10-02 실측). */
const EXPIRY_OPTS = ['사용안함', '직접입력', '금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월'] as const

/**
 * 재고 II &gt; 시리얼/로트No. &gt; <b>시리얼/로트No.내역조회</b>(E040618) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>) · 유효기한(기본 [사용안함]) · 거래처그룹1 · 품목.
 * 열: 일자-No. · 품목명[규격] · 시리얼/로트No. · 수량 · 전표구분 · 연결전표-No. · 유효기한. 원본은 줄이 일자 내림차순이다.
 *
 * <p>한 줄은 시리얼/로트 하나의 움직임이다. 구매 · 판매 전표의 로트No. 줄이 남긴 것이면 [전표구분] 은 '구매' · '판매',
 * [연결전표-No.] 는 그 전표다(2026-10-03 원본 실측 — 예전엔 로트등록에서 손으로 넣은 것만 보였다). 직접 남긴 줄(로트등록 ·
 * 소모 · 실사조정)은 입고 · 출고 · 조정으로 찍고 연결전표가 없다. 수량은 원본처럼 부호 없이 소수 둘째 자리까지(1.00).
 * [일자-No.] 의 번호는 원본처럼 그날 시리얼/로트 줄의 차례(먼저 남긴 것이 1)다.
 * [거래처그룹1] 은 로트 줄이 거래처 이름만 들고 있어(그룹 없음) 두지 않았다.
 */
export default function LotTxListPage() {
  const pickers = useCondPickers(['items', 'warehouses', 'partners', 'projects', 'employees'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [expiryOpt, setExpiryOpt] = useState<typeof EXPIRY_OPTS[number]>('사용안함')
  const [expFrom, setExpFrom] = useState('')
  const [expTo, setExpTo] = useState('')
  const [item, setItem] = useState('')
  const [rows, setRows] = useState<LotTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())

  /*
   * 원본 [신규(F2)] = '시리얼/로트No.내역입력' 창(2026-10-12 실측). 빈 저장은 [창고 · 품목코드 · 수량 · 시리얼/로트No.] 가
   * 빨개진다. 저장하면 창이 닫히고 목록에 그 줄(연결전표 없음)이 생긴다. 구매 3 → 그 로트 재고 +3, 판매 3 → −3, 견적 → 그대로.
   * 손으로 넣은 줄을 누르면 같은 창이 수정으로 열리고 [일자] · [전표구분] 이 잠긴다. [삭제] 는 '전표를 삭제하겠습니까?'.
   */
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LotTransaction | null>(null)
  const [f, setF] = useState<TxForm>(emptyForm())
  const [tried, setTried] = useState(false)
  const [formError, setFormError] = useState('')
  const [lots, setLots] = useState<Lot[]>([])
  const [mgmts, setMgmts] = useState<{ id: number; code: string; name: string }[]>([])
  function openNew() {
    setEditing(null); setF(emptyForm()); setTried(false); setFormError(''); setOpen(true)
    void api.get<Lot[]>('/lots').then((r) => setLots(r.data)).catch(() => {})
    void api.get<{ id: number; code: string; name: string }[]>('/management-items').then((r) => setMgmts(r.data)).catch(() => {})
  }
  function openEdit(r: LotTransaction) {
    openNew()
    setEditing(r)
    setF({
      txDate: r.txDate, docType: r.docType ?? '견적', warehouseId: r.txWarehouseId ? String(r.txWarehouseId) : '',
      itemId: String(r.itemId), quantity: String(Math.abs(Number(r.quantityChange))), lotNo: r.lotNo,
      partnerId: String(pickers.partners.find((p) => p.name === r.partnerName)?.value ?? ''),
      mgmtId: '', chargeName: r.chargeName ?? '', projectId: r.projectId ? String(r.projectId) : '', note: r.note ?? '',
    })
  }
  const lotPicks = useMemo(() => lots.filter((l) => !f.itemId || String(l.itemId) === f.itemId)
    .map((l) => ({ value: l.lotNo, code: l.lotNo, name: `${l.lotNo} (${Number(l.stockQty).toLocaleString('ko-KR', { minimumFractionDigits: 2 })})` })), [lots, f.itemId])
  const missing = (v: string) => tried && !v
  async function saveTx() {
    setTried(true); setFormError('')
    if (!f.warehouseId || !f.itemId || !f.quantity || !f.lotNo) return
    const partner = pickers.partners.find((p) => String(p.value) === f.partnerId)
    const mgmt = mgmts.find((m) => String(m.id) === f.mgmtId)
    const body = {
      txDate: f.txDate, docType: f.docType, warehouseId: Number(f.warehouseId), itemId: Number(f.itemId),
      quantity: Number(f.quantity), lotNo: f.lotNo, partnerName: partner?.name, mgmtName: mgmt?.name ?? (editing?.mgmtName ?? undefined),
      chargeName: f.chargeName || undefined, projectId: f.projectId ? Number(f.projectId) : undefined, note: f.note || undefined,
    }
    try {
      if (editing) await api.put(`/lots/transactions/${editing.id}`, body)
      else await api.post('/lots/transactions', body)
      setOpen(false)
      await load()
    } catch (e) { setFormError(extractErrorMessage(e)) }
  }
  useShortcut('F8', saveTx, open)
  async function removeTx(ids: number[]) {
    try {
      await api.post('/lots/transactions/delete', { ids })
      setOpen(false)
      await load()
    } catch (e) { setError(extractErrorMessage(e)) }
  }
  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) return setError('리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.')
    if ((await ecConfirm('한번 지워진 자료는 복구될 수 없습니다.\n선택한 항목을 삭제 하겠습니까?'))) void removeTx(ids)
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<LotTransaction[]>('/lots/transactions', { params: { from, to } })
      setRows(r.data)
      setPicked(new Set())
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  /* 그날 안에서 먼저 남긴 줄이 1 — 원본 '2026/10/09 -1 … -6' 이 한 구매의 시리얼 여섯이다. */
  const seqOf = useMemo(() => {
    const m = new Map<number, number>()
    const byDay = new Map<string, number>()
    for (const r of [...rows].sort((a, b) => a.id - b.id)) {
      const n = (byDay.get(r.txDate) ?? 0) + 1
      byDay.set(r.txDate, n)
      m.set(r.id, n)
    }
    return m
  }, [rows])
  const specOf = useMemo(() => new Map(pickers.items.map((i) => [i.value, (i as { sub?: string | null }).sub ?? ''])), [pickers.items])
  const shown = useMemo(() => rows
    .filter((r) => r.txDate >= from && r.txDate <= to)
    .filter((r) => expiryOpt === '사용안함' || (!!r.expireDate && (!expFrom || r.expireDate >= expFrom) && (!expTo || r.expireDate <= expTo)))
    .filter((r) => !item || String(r.itemId) === item)
    .sort((a, b) => (a.txDate > b.txDate ? -1 : a.txDate < b.txDate ? 1 : b.id - a.id)),
  [rows, from, to, expiryOpt, expFrom, expTo, item])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '시리얼/로트No.내역조회', [shown.length])

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="시리얼/로트No.내역조회"
      searchable={false}
      onNew={openNew}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '선택삭제', onClick: removeChecked, selected: picked.size },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setExpiryOpt('사용안함'); setExpFrom(''); setExpTo(''); setItem('') } },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px] whitespace-pre-line">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="유효기한">
          <select className="ec-input" value={expiryOpt} style={{ width: 120 }}
                  onChange={(e) => {
                    const v = e.target.value as typeof EXPIRY_OPTS[number]
                    setExpiryOpt(v)
                    const r = v === '사용안함' || v === '직접입력' ? null : periodOf(v)
                    if (r) { setExpFrom(r.from); setExpTo(r.to) }
                    if (v === '사용안함') { setExpFrom(''); setExpTo('') }
                  }}>
            {EXPIRY_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {expiryOpt !== '사용안함' && (<>
            <input type="date" className="ec-input" value={expFrom} onChange={(e) => { setExpFrom(e.target.value); setExpiryOpt('직접입력') }} style={{ width: 145, marginLeft: 6 }} />
            <span className="my-0 mx-[4px]">~</span>
            <input type="date" className="ec-input" value={expTo} onChange={(e) => { setExpTo(e.target.value); setExpiryOpt('직접입력') }} style={{ width: 145 }} />
          </>)}
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
      </ul>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] text-center">
              <input type="checkbox" checked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
                     onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} />
            </th>
            <th className="text-center">일자-No.</th>
            <th>품목명[규격]</th>
            <th>시리얼/로트No.</th>
            <th className="text-right">수량</th>
            <th className="text-center">전표구분</th>
            <th className="text-center">연결전표-No.</th>
            <th className="text-center">유효기한</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const spec = specOf.get(String(r.itemId))
            return (
              <tr key={r.id}>
                <td className="text-center">
                  <input type="checkbox" aria-label={`${i + 1}`} checked={picked.has(r.id)} onChange={() => setPicked((s) => {
                    const n = new Set(s)
                    if (n.has(r.id)) n.delete(r.id); else n.add(r.id)
                    return n
                  })} />
                </td>
                <td className="text-center">
                  {/* 손으로 넣은 줄만 열린다 — 전표가 남긴 줄은 그 전표에서 고친다. */}
                  {r.manual
                    ? <button type="button" className="ec-link" onClick={() => openEdit(r)}>{`${dateText(r.txDate)} -${seqOf.get(r.id) ?? ''}`}</button>
                    : `${dateText(r.txDate)} -${seqOf.get(r.id) ?? ''}`}
                </td>
                <td>{r.itemName}{spec ? ` [${spec}]` : ''}</td>
                <td>{r.lotNo}</td>
                <td className="text-right">{Math.abs(Number(r.quantityChange)).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="text-center">{r.docType ?? r.typeName}</td>
                <td className="text-center">{r.sourceNo ? dateNo(r.txDate, r.sourceNo) : ''}</td>
                <td className="text-center">{r.expireDate ? dateText(r.expireDate) : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Modal open={open} width={640} title="시리얼/로트No.내역입력" error={formError} onClose={() => setOpen(false)}>
        <ul className="ec-form">
          <li><div className="title">일자</div><div className="form">
            <input type="date" className="ec-input w-[150px]" value={f.txDate} disabled={!!editing}
                   onChange={(e) => setF((x) => ({ ...x, txDate: e.target.value }))} />
          </div></li>
          <li><div className="title">전표구분</div><div className="form">
            <select className="ec-input w-full" aria-label="전표구분" value={f.docType} disabled={!!editing}
                    onChange={(e) => setF((x) => ({ ...x, docType: e.target.value }))}>
              {DOC_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div></li>
          <li><div className="title">창고</div><div className={`form${missing(f.warehouseId) ? ' [&_input]:border-ec-danger' : ''}`}>
            <CodePickerField label="창고" hideLabel fill pair value={f.warehouseId} items={pickers.warehouses}
                             onChange={(v) => setF((x) => ({ ...x, warehouseId: v }))} />
          </div></li>
          <li><div className="title">품목코드</div><div className={`form${missing(f.itemId) ? ' [&_input]:border-ec-danger' : ''}`}>
            <CodePickerField label="품목코드" hideLabel fill pair value={f.itemId} items={pickers.items}
                             onChange={(v) => setF((x) => ({ ...x, itemId: v, lotNo: v === x.itemId ? x.lotNo : '' }))} />
          </div></li>
          <li><div className="title">수량</div><div className="form">
            <input className={`ec-input w-full text-right${missing(f.quantity) ? ' border-ec-danger' : ''}`} aria-label="수량" inputMode="decimal"
                   value={f.quantity} onChange={(e) => setF((x) => ({ ...x, quantity: e.target.value }))} />
          </div></li>
          <li><div className="title">시리얼/로트No.</div><div className={`form${missing(f.lotNo) ? ' [&_input]:border-ec-danger' : ''}`}>
            <CodePickerField label="시리얼/로트No." hideLabel fill pair value={f.lotNo} items={lotPicks}
                             onChange={(v) => setF((x) => ({ ...x, lotNo: v }))} />
          </div></li>
          <li><div className="title">거래처</div><div className="form">
            <CodePickerField label="거래처" hideLabel fill pair value={f.partnerId} items={pickers.partners}
                             onChange={(v) => setF((x) => ({ ...x, partnerId: v }))} />
          </div></li>
          <li><div className="title">관리항목</div><div className="form">
            <CodePickerField label="관리항목" hideLabel fill pair value={f.mgmtId}
                             items={mgmts.map((m) => ({ value: String(m.id), code: m.code, name: m.name }))}
                             onChange={(v) => setF((x) => ({ ...x, mgmtId: v }))} />
          </div></li>
          <li><div className="title">담당자</div><div className="form">
            <CodePickerField label="담당자" hideLabel fill pair value={f.chargeName} items={pickers.employees}
                             onChange={(v) => setF((x) => ({ ...x, chargeName: v }))} />
          </div></li>
          <li><div className="title">프로젝트</div><div className="form">
            <CodePickerField label="프로젝트" hideLabel fill pair value={f.projectId} items={pickers.projects}
                             onChange={(v) => setF((x) => ({ ...x, projectId: v }))} />
          </div></li>
          <li><div className="title">적요</div><div className="form">
            <input className="ec-input w-full" aria-label="적요" placeholder="적요" value={f.note}
                   onChange={(e) => setF((x) => ({ ...x, note: e.target.value }))} />
          </div></li>
        </ul>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={() => void saveTx()}>저장(F8)</button>
          {editing
            ? <button className="ec-btn" onClick={async () => { if ((await ecConfirm('전표를 삭제하겠습니까?'))) void removeTx([editing.id]) }}>삭제</button>
            : <button className="ec-btn" onClick={() => { setF(emptyForm()); setTried(false) }}>다시 작성</button>}
          <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
