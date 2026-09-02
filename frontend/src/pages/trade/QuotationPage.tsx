import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import type { Item, Partner, Quotation, QuotationStatus } from '../../api/types'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())

const TABS = ['전체', '작성', '발송', '수주전환', '취소'] as const
type Tab = (typeof TABS)[number]
const TAB_STATUS: Record<Exclude<Tab, '전체'>, QuotationStatus> = {
  작성: 'DRAFT', 발송: 'SENT', 수주전환: 'CONVERTED', 취소: 'CANCELLED',
}
const statusColor = (s: QuotationStatus) =>
  s === 'CONVERTED' ? '#1c7c3c' : s === 'CANCELLED' ? '#8a929c' : s === 'SENT' ? 'var(--ec-blue)' : '#5a626e'

interface LineForm { itemId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineForm => ({ itemId: '', quantity: '', unitPrice: '' })

/** 견적서 — 영업 흐름의 시작점. 작성→발송→수주전환. 부가세 10% 자동. */
export default function QuotationPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Quotation[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<{ id: number; code: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [tab, setTab] = useState<Tab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  /*
   * 원본 견적서조회는 <b>기준일자</b>를 들고 [최근30일(+1개월)] 로 열린다(사본 실측 —
   * 달 스핀박스가 06·08 셋이라 한 달 뒤까지 본다). 견적은 <b>앞으로</b>의 일이라
   * 아직 안 온 날짜까지 봐야 한다.
   *
   * <p>우리는 기간 칸이 <b>아예 없어서</b> 견적이 쌓이면 목록이 통째로 길어졌고,
   * "이번 달에 낸 견적" 을 볼 방법이 없었다.
   */
  const [from, setFrom] = useState(periodOf('최근30일(+1개월)')!.from)
  const [to, setTo] = useState(periodOf('최근30일(+1개월)')!.to)
  const [itemCond, setItemCond] = useState('')
  /* 원본 견적서 조건 차례의 둘째 <b>[견적No.]</b>. 번호를 알아도 눈으로 찾아야 했다. */
  const [noCond, setNoCond] = useState('')
  /* 원본 견적서 조건 차례: … <b>창고</b> · <b>프로젝트</b> · 관리항목 · 거래처 · 품목 · 발송여부. */
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  /*
   * 원본 견적서 조건의 맨 뒤 <b>[발송여부]</b>. 우리 견적은 [발송] 을 눌러 상태가
   * <b>발송</b> 으로 가고, 수주로 전환된 것도 <b>보낸 뒤</b>의 일이라 보낸 것으로 친다.
   * 여태 알약(진행 단계)으로만 갈라서 "아직 안 보낸 견적" 을 한 번에 볼 수가 없었다.
   */
  const [sentCond, setSentCond] = useState<'전체' | '발송' | '미발송'>('전체')
  const [company, setCompany] = useState<DocParty | null>(null)

  /*
   * 원본 <b>[다시 작성]</b> — 조건을 처음 상태로 되돌린다. 조건이 여덟 칸이라
   * 하나씩 지우게 두면 무엇이 남았는지 모른 채 빈 표를 보게 된다.
   */
  function reset() {
    const p = periodOf('최근30일(+1개월)')!
    setFrom(p.from); setTo(p.to)
    setItemCond(''); setNoCond(''); setWhCond(''); setProjCond(''); setSentCond('전체')
  }

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<Quotation[]>('/quotations', { params: { from: from || undefined, to: to || undefined } }).then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  /*
   * <b>기간을 서버에 보낸다.</b> 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내
   * 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() }, [from, to])

  useEffect(() => {
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data.filter((p) => p.type !== 'SUPPLIER'))).catch(() => {})
    api.get<{ id: number; code: string; name: string }[]>('/warehouses').then((r) => setWarehouses(r.data)).catch(() => {})
    api.get<{ id: number; code: string; name: string }[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
  }, [])

  /** 원본은 일자와 번호를 '2026/08/03 -1' 로 한 칸에 적는다(판매조회와 같은 규칙). */
  const dateNo = (q: { quoteDate: string; quoteNo: string }) => {
    const seq = q.quoteNo.split('-').pop() ?? ''
    return `${q.quoteDate.replace(/-/g, '/')} -${Number(seq) || seq}`
  }

  /*
   * 원본 견적서 조건 차례: 기준일자 · 견적No. · 내.외자구분 · 창고 · 프로젝트 ·
   * 관리항목 · 거래처 · <b>품목</b> · 발송여부.
   *
   * <p>품목은 목록에 <b>[품목명(요약)]</b> 으로 찍히는데 그것으로 거를 수가 없었다 —
   * 그 품목이 든 견적을 찾으려면 한 줄씩 펼쳐 봐야 했다. 요약에는 첫 줄만 보이므로
   * <b>모든 줄</b>을 훑는다(요약만 보고 거르면 둘째 줄부터가 안 걸린다).
   */
  const shown = useMemo(() => rows
    .filter((r) => tab === '전체' || r.status === TAB_STATUS[tab])
    .filter((r) => (!from || r.quoteDate >= from) && (!to || r.quoteDate <= to))
    .filter((r) => !noCond || r.quoteNo.includes(noCond))
    .filter((r) => !whCond || r.warehouseName === whCond)
    .filter((r) => !projCond || r.projectName === projCond)
    .filter((r) => !itemCond || r.lines.some((l) => l.itemName.includes(itemCond)))
    .filter((r) => sentCond === '전체'
      || (sentCond === '발송') === (r.status === 'SENT' || r.status === 'CONVERTED')),
    [rows, tab, from, to, itemCond, sentCond, whCond, projCond, noCond])
  const tabCount = (t: Tab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length

  async function send(q: Quotation) {
    try { await api.post(`/quotations/${q.id}/send`); flash(`${q.quoteNo} 발송`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  useEffect(() => { loadSupplierParty().then(setCompany) }, [])

  /** 견적서 서식 인쇄 — 거래명세서와 같은 템플릿을 쓴다(제목·유효기간만 다르다). */
  async function printQuote(q: Quotation) {
    const p = partners.find((x) => x.id === q.partnerId)
    await printDocuments([{
      title: '견 적 서',
      docNo: q.quoteNo,
      docDate: q.quoteDate,
      supplier: company ?? { label: '공급자', name: '(회사정보 미등록)' },
      customer: {
        label: '수신처', name: q.partnerName,
        bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem,
        tel: p?.phone, address: p?.address,
      },
      extra: [{ label: '유효기간', value: q.validUntil }, { label: '담당', value: q.createdBy }],
      remark: q.remark,
      lines: q.lines.map((l) => ({
        itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
        quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount,
      })),
      footNote: '아래와 같이 견적합니다.',
    }])
  }

  async function convert(q: Quotation) {
    if (!window.confirm(`${q.quoteNo}을(를) 수주로 전환할까요?`)) return
    try {
      const r = await api.post(`/quotations/${q.id}/convert`)
      flash(`수주 ${r.data.orderNo} 생성됨`)
      load()
      if (window.confirm('생성된 수주 화면으로 이동할까요?')) navigate('/sales/orders')
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  async function cancel(q: Quotation) {
    if (!window.confirm(`${q.quoteNo}을(를) 취소할까요?`)) return
    try { await api.post(`/quotations/${q.id}/cancel`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  // 취소는 문서를 남긴 채 상태만 바꾼다. 잘못 만든 견적서는 지우는 게 맞다 —
  // 취소로 덮어 두면 목록이 죽은 문서로 계속 불어난다.
  async function remove(q: Quotation) {
    if (!window.confirm(`${q.quoteNo}을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return
    try { await api.delete(`/quotations/${q.id}`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  /*
   * 원본 하단 단추줄의 <b>[선택삭제]</b> — 고른 줄을 한 번에 지운다. 줄마다 [삭제]는
   * 진작 있었지만, 잘못 올린 견적서 열 줄을 지우려면 열 번 묻고 열 번 눌러야 했다.
   *
   * <p>하나가 막혀도 <b>거기서 멈추지 않는다</b> — 나머지는 지우고 몇 건이 남았는지 알려 준다.
   */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const pick = (id: number) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  /*
   * 원본 하단 단추줄의 <b>[진행상태변경]</b> — 고른 줄을 한 번에 <b>발송</b> 으로 넘긴다.
   * 수주전환은 한꺼번에 하지 않는다 — 전환은 수주를 새로 만드는 일이라, 열 건을 한 번에
   * 누르면 무엇이 만들어졌는지 사람이 못 따라간다.
   */
  async function bulkStatus() {
    const targets = shown.filter((q) => picked.has(q.id) && q.status === 'DRAFT')
    const skipped = picked.size - targets.length
    if (targets.length === 0) { setError('아직 안 보낸 견적서를 고르세요 — 그 줄만 한 번에 발송합니다.'); return }
    const results = await Promise.allSettled(targets.map((q) => api.post(`/quotations/${q.id}/send`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError([
      failed ? `${failed}건은 발송하지 못했습니다.` : '',
      skipped ? `${skipped}건은 이미 보낸 견적서라 건너뛰었습니다.` : '',
    ].filter(Boolean).join(' '))
    load()
  }

  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) { setError('삭제할 견적서을(를) 고르세요.'); return }
    if (!window.confirm(`고른 ${ids.length}건을 삭제할까요?`)) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/quotations/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError(failed ? `${failed}건은 삭제하지 못했습니다(이미 수주로 넘어간 견적서일 수 있습니다).` : '')
    load()
  }

  return (
    <EcListShell
      title="견적서"
      /* 원본 [신규(F2)] 는 아래 단추줄 맨 앞이다 — 표 위에 따로 두지 않는다. */
      newLabel={showForm ? '입력닫기' : '신규 견적(F2)'}
      onNew={() => setShowForm((v) => !v)}
      actions={[
      /* 원본 차례: 신규(F2) · 다시 작성 · 진행상태변경 · 인쇄 · 선택삭제 · Excel (사본 실측) */
      { label: '다시 작성', onClick: reset },
      { label: `진행상태변경${picked.size ? ` (${picked.size})` : ''}`, onClick: bulkStatus },
      { label: '인쇄' },
      { label: `선택삭제${picked.size ? ` (${picked.size})` : ''}`, onClick: removeChecked },
      { label: 'Excel' },
    ]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button className="ec-btn" onClick={load}>새로고침</button>
        <span style={{ marginLeft: 8, fontSize: 12, color: '#9aa1ab' }}>견적 → 발송 → 수주전환. 부가세 10% 자동.</span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {/* 상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다. */}
      {/* 원본 조건 차례: … 거래처 · <b>품목</b> · 발송여부 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 조건 차례의 첫째 <b>[기준일자]</b>. 단추는 원본대로 종료일 다음에 최근30일(+1개월). */}
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from}
                 onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="견적No.">
          <input className="ec-input" value={noCond} placeholder="견적No."
                 onChange={(e) => setNoCond(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond}
                           items={warehouses.map((w) => ({ value: w.name, code: w.code, name: w.name }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projCond} onChange={setProjCond}
                           items={projects.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={190} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={items.map((x) => ({ value: x.name, code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="발송여부">
          <select className="ec-input" value={sentCond} style={{ width: 100 }}
                  onChange={(e) => setSentCond(e.target.value as '전체' | '발송' | '미발송')}>
            <option>전체</option><option>발송</option><option>미발송</option>
          </select>
        </EcCond>
      </ul>

      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t} ({tabCount(t)})
          </button>
        ))}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            {/*
              원본 견적서조회(E040202) 열과 순서 그대로다(실측 74·295·297·236·533·236·277·106·106·106).
              일자와 번호는 원본처럼 한 칸에 적는다('2026/08/03 -1').
            */}
            <th style={{ width: 28, textAlign: 'center' }}></th>
            <th style={{ width: 34 }}></th>
            <th>일자-No.</th>
            <th>거래처명</th>
            <th>사원(담당)명</th>
            <th>품목명(요약)</th>
            <th>유효기간</th>
            <th style={{ textAlign: 'right' }}>견적금액합계</th>
            <th style={{ textAlign: 'center' }}>진행상태</th>
            <th style={{ textAlign: 'center' }}>생성한전표</th>
            <th style={{ textAlign: 'center' }}>인쇄</th>
            {/* 아래는 원본에 없지만 우리가 더 보여 주는 열이다. 원본 열을 밀어내지 않도록 뒤에 둔다. */}
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th>
            <th style={{ textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={14} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((q, i) => (
            <Fragment key={q.id}>
              <tr onClick={() => setOpenId(openId === q.id ? null : q.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={picked.has(q.id)} onChange={() => pick(q.id)} />
                </td>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>
                  {openId === q.id ? '▾ ' : '▸ '}{dateNo(q)}
                </td>
                <td>{q.partnerName}</td>
                <td>{q.createdBy ?? ''}</td>
                <td style={{ color: '#5a626e' }}>
                  {q.lines[0]?.itemName ?? ''}{q.lines.length > 1 ? ` 외 ${q.lines.length - 1}건` : ''}
                </td>
                <td>{q.validUntil ?? ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{won(q.totalAmount)}</td>
                <td style={{ textAlign: 'center' }}><span style={{ color: statusColor(q.status) }}>{q.statusName}</span></td>
                <td style={{ textAlign: 'center', color: '#1c7c3c', fontSize: 11.5 }}>
                  {/* 원본 '생성한전표' — 이 견적서에서 만들어진 전표. 우리는 수주만 만든다. */}
                  {q.convertedOrderId ? `수주 #${q.convertedOrderId}` : ''}
                </td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <button className="ec-btn ec-btn-sm" onClick={() => printQuote(q)}>인쇄</button>
                </td>
                <td style={{ textAlign: 'right' }}>{won(q.supplyAmount)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(q.vatAmount)}</td>
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    {q.status === 'DRAFT' && <button className="ec-btn ec-btn-sm" onClick={() => send(q)}>발송</button>}
                    {(q.status === 'DRAFT' || q.status === 'SENT') && <button className="ec-btn ec-btn-sm ec-btn-primary" onClick={() => convert(q)}>수주전환</button>}
                    {q.status !== 'CONVERTED' && q.status !== 'CANCELLED' && <button className="ec-btn ec-btn-sm" style={{ color: '#c60a2e' }} onClick={() => cancel(q)}>취소</button>}
                    <button className="ec-btn ec-btn-sm" style={{ color: '#c60a2e' }} onClick={() => remove(q)}>삭제</button>
                  </div>
                </td>
              </tr>
              {openId === q.id && (
                <tr className="no-ec">
                  <td colSpan={14} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead><tr><th style={{ width: 34 }}></th><th>품목코드</th><th>품목명</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th></tr></thead>
                      <tbody>
                        {q.lines.map((l) => (
                          <tr key={l.id}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{l.lineNo}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.quantity)} {l.unit}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.unitPrice)}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.supplyAmount)}</td>
                            <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(l.vatAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {showForm && <QuotationForm items={items} partners={partners} warehouses={warehouses} projects={projects} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); flash('견적서를 작성했습니다.'); load() }} />}
    </EcListShell>
  )
}

function QuotationForm({ items, partners, warehouses, projects, onClose, onSaved }: {
  items: Item[]; partners: Partner[]
  warehouses: { id: number; code: string; name: string }[]
  projects: { id: number; code: string; name: string }[]
  onClose: () => void; onSaved: () => void
}) {
  const [partnerId, setPartnerId] = useState('')
  const [quoteDate, setQuoteDate] = useState(today())
  /* 원본 견적서의 [창고]·[프로젝트]. 판매전표는 이미 물고 있는데 견적만 없었다. */
  const [fWarehouse, setFWarehouse] = useState('')
  const [fProject, setFProject] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [lines, setLines] = useState<LineForm[]>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function pickItem(i: number, itemId: string) {
    const it = items.find((x) => String(x.id) === itemId)
    setLine(i, { itemId, unitPrice: it ? String(it.unitPrice) : '' })
  }

  const calc = lines.map((l) => (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0))
  const supply = calc.reduce((a, b) => a + b, 0)
  const vat = Math.round(supply * 0.1)

  async function save() {
    setError('')
    if (!partnerId) return setError('거래처를 선택하세요.')
    const payload = lines
      .filter((l) => l.itemId && Number(l.quantity) > 0 && Number(l.unitPrice) > 0)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }))
    if (payload.length === 0) return setError('품목을 1개 이상 입력하세요.')
    setSaving(true)
    try {
      await api.post('/quotations', { partnerId: Number(partnerId), quoteDate,
        warehouseId: fWarehouse ? Number(fWarehouse) : undefined,
        projectId: fProject ? Number(fProject) : undefined,
        validUntil: validUntil || undefined, taxable: true, lines: payload })
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 720, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--ec-border)', background: '#f5f7fa' }}>
          <span style={{ fontWeight: 800, color: 'var(--ec-blue-dark)' }}>견적서 작성</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 18, color: '#8a929c' }}>×</span>
        </div>
        <div style={{ padding: 16 }}>
          {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
          <table className="w-full text-left" style={{ marginBottom: 12 }}>
            <tbody>
              <tr>
                <th style={{ width: 90, background: '#f5f7fa' }}>거래처<span style={{ color: '#c60a2e' }}>*</span></th>
                <td>
                  <select className="ec-input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} style={{ width: 240 }}>
                    <option value="">매출처 선택</option>
                    {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <th style={{ width: 70, background: '#f5f7fa' }}>견적일</th>
                <td><input type="date" className="ec-input" value={dateText(quoteDate)} onChange={(e) => setQuoteDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>유효기한</th>
                <td><input type="date" className="ec-input" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={{ width: 150 }} /></td>
                <th style={{ background: '#f5f7fa' }}>창고</th>
                <td>
                  <CodePickerField label="창고" hideLabel width={200} emptyLabel="선택 안 함"
                                   value={fWarehouse} onChange={setFWarehouse}
                                   items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
                </td>
              </tr>
              <tr>
                <th style={{ background: '#f5f7fa' }}>프로젝트</th>
                <td colSpan={3}>
                  <CodePickerField label="프로젝트" hideLabel width={240} emptyLabel="선택 안 함"
                                   value={fProject} onChange={setFProject}
                                   items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
                </td>
              </tr>
            </tbody>
          </table>

          <table className="w-full text-left">
            <thead><tr><th style={{ width: 34 }}></th><th>품목</th><th style={{ width: 90, textAlign: 'right' }}>수량</th><th style={{ width: 110, textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>공급가액</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                  <td>
                    <CodePickerField label="품목" hideLabel fill placeholder="품목 선택" emptyLabel="선택 해제"
                                     value={l.itemId} onChange={(v) => pickItem(i, v)}
                                     items={items.map((it) => ({ value: String(it.id), code: it.code, name: it.name, alias: it.searchKeyword, sub: it.spec }))} />
                  </td>
                  <td><input className="ec-input" type="number" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td><input className="ec-input" type="number" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} style={{ width: '100%', textAlign: 'right' }} /></td>
                  <td style={{ textAlign: 'right' }}>{won(calc[i])}</td>
                  <td style={{ textAlign: 'center' }}>{lines.length > 1 && <button className="ec-btn" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>×</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>공급가액 / 부가세 / 합계</td>
                <td style={{ textAlign: 'right' }} colSpan={2}>{won(supply)} / {won(vat)} / <span style={{ color: 'var(--ec-blue-dark)' }}>{won(supply + vat)}</span></td>
              </tr>
            </tfoot>
          </table>
          <button className="ec-btn" style={{ marginTop: 8 }} onClick={() => setLines((ls) => [...ls, emptyLine()])}>+ 행 추가</button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderTop: '1px solid var(--ec-border)' }}>
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
