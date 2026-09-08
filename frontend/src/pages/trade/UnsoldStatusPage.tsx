import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_FULL_PICKS, periodOf } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { usePartnerManagers } from '../../utils/partnerManagers'
import EcBarChart from '../../components/EcBarChart'

/**
 * 영업관리 > 미판매현황 (이카운트 E040212)
 *
 * 미주문(견적→수주)·미출하(수주→출하)는 있었는데 <b>미판매(수주→매출)</b>만 없었다.
 * 셋은 다른 질문이다 — 물건은 나갔는데 매출을 못 잡은 건은 미출하에는 안 잡히고 여기 남는다.
 *
 * 미판매수량 = 주문수량 − 그 수주를 근거전표로 끊은 판매 라인의 같은 품목 수량 합.
 * 판매 라인은 수주 <b>헤더</b>만 가리키므로(SalesLine.sourceOrder) 라인 대 라인이 아니라
 * 품목으로 맞춘다. 주문보다 많이 판 경우는 음수 대신 0 으로 둔다(GET /api/sales-orders/unsold).
 *
 * <p>2026-09-08 에 원본을 열어 접힌 줄까지 재니 조건은 <b>스물둘</b>이다(사본에는 없었다):
 * 구분 · 기준일자(영업주기) · 품목별납기일자 · 창고 · 프로젝트 · 거래처 · 품목 · 담당자 ·
 * 거래처관리담당자 · 미판매수량 · 오더관리번호 · 적요 · 수량 · 내.외자구분 · 거래유형 ·
 * 규격 · 진행상태 · 작성자 · 최종수정자 · 적용양식 · 정렬기준 · 데이터 보기형식.
 *
 * <p>머리말에 "창고·프로젝트·담당자·거래처관리담당자는 수주 라인에 없어 넣지 않았다" 고
 * 적혀 있었는데 <b>수주 전표에는 다 있다</b> — 이 응답만 안 실었을 뿐이고,
 * <b>같은 파일의 미출하 응답은 이미 싣고 있었다</b>(미출하와 미판매는 같은 수주를
 * 다른 잣대로 보는 화면이라 조건도 거의 같다). <code>UnsoldLineResponse</code> 를
 * 미출하와 같은 모양으로 넓히고 여섯을 만들었다 —
 * 창고 · 프로젝트 · 담당자 · 적요 · 규격 · 작성자.
 */
interface UnsoldLine {
  orderId: number
  orderNo: string
  orderLineId: number
  partnerId: number
  partnerName: string
  orderDate: string
  dueDate: string | null
  status: 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
  statusName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  orderQty: number
  soldQty: number
  unsoldQty: number
  unitPrice: number
  unsoldAmount: number
  /* 2026-09-08 에 응답을 넓혀 받은 것들 — 수주 전표와 품목 마스터가 진작 들던 값이다. */
  warehouseName: string | null
  projectName: string | null
  employeeName: string | null
  remark: string | null
  spec: string | null
  createdBy: string | null
  /**
   * 원본 [거래유형] — 과세 · 면세. 줄에는 부가세가 없어(미판매수량·금액만 낸다)
   * 화면이 스스로 되짚을 수 없다 — 서버가 전표 부가세로 되짚어 실어 준다.
   */
  taxable: boolean
}

const num = (n: number) => n.toLocaleString()

/*
 * 원본 미판매현황은 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간을 비워 두어 주문이 쌓일수록 열자마자 몇 해치가 쏟아졌다.
 */
const init = periodOf('금월(~오늘)')!

export default function UnsoldStatusPage() {
  const navigate = useNavigate()
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects'])
  const pmgr = usePartnerManagers()
  const [rows, setRows] = useState<UnsoldLine[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  /** 원본 [구분] — 품목별(품목으로 합침) / 라인별(주문 라인 그대로). */
  const [mode, setMode] = useState<'품목별' | '라인별'>('라인별')
  const [cond, setCond] = useState({
    from: init.from, to: init.to, partner: '', item: '', orderNo: '', qtyFrom: '', qtyTo: '',
    warehouse: '', project: '', employee: '', partnerMgr: '', remark: '', spec: '',
    status: '', createdBy: '', dueFrom: '', dueTo: '', orderQtyFrom: '', orderQtyTo: '',
    taxType: '',
  })
  /**
   * 원본 [정렬기준]·[데이터 보기형식] — 조건 판의 맨 끝 둘이다.
   * 미판매는 <b>어느 거래처의 수주가 얼마나 매출로 안 잡혔나</b> 를 보는 표라 거래처로 묶어 그린다.
   */
  const [byDue, setByDue] = useState(false)
  const [view, setView] = useState<'표' | '그래프'>('표')
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<UnsoldLine[]>('/sales-orders/unsold', { params: { from: cond.from || undefined, to: cond.to || undefined } })
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  /* 기간을 서버로 보낸다 — 조건 판에 물어 놓고 전 기간을 받아 브라우저에서 걸렀다. */
  useEffect(() => { load() }, [cond.from, cond.to])

  const shown = rows
    // 기준일자는 납기일로 본다 — '언제까지 매출을 잡아야 했나'가 이 화면의 질문이다.
    .filter((r) => !cond.from || (r.dueDate ?? r.orderDate) >= cond.from)
    .filter((r) => !cond.to || (r.dueDate ?? r.orderDate) <= cond.to)
    .filter((r) => !cond.partner || r.partnerName.includes(cond.partner))
    .filter((r) => !cond.item || r.itemName.includes(cond.item) || r.itemCode.includes(cond.item))
    .filter((r) => !cond.orderNo || r.orderNo.includes(cond.orderNo))
    .filter((r) => !cond.qtyFrom || r.unsoldQty >= Number(cond.qtyFrom))
    .filter((r) => !cond.qtyTo || r.unsoldQty <= Number(cond.qtyTo))
    /* 2026-09-08 실측으로 만든 것들. 응답을 넓혀 받은 값을 그대로 건다. */
    .filter((r) => !cond.warehouse || (r.warehouseName ?? '').includes(cond.warehouse))
    .filter((r) => !cond.project || (r.projectName ?? '').includes(cond.project))
    .filter((r) => !cond.employee || (r.employeeName ?? '') === cond.employee)
    .filter((r) => !cond.partnerMgr || pmgr.managerOfName(r.partnerName) === cond.partnerMgr)
    .filter((r) => !cond.remark || (r.remark ?? '').includes(cond.remark))
    .filter((r) => !cond.spec || (r.spec ?? '').includes(cond.spec))
    .filter((r) => !cond.status || r.status === cond.status)
    .filter((r) => !cond.createdBy || (r.createdBy ?? '') === cond.createdBy)
    /* 원본 [거래유형]. 서버가 전표 부가세로 되짚어 준 값을 그대로 쓴다. */
    .filter((r) => !cond.taxType || (r.taxable ? '과세' : '면세') === cond.taxType)
    /* 원본 [품목별납기일자] — 라인 납기가 없어 전표 납기로 본다(아래 [남은 것] 참고). */
    .filter((r) => !cond.dueFrom || (r.dueDate ?? '') >= cond.dueFrom)
    .filter((r) => !cond.dueTo || (r.dueDate ?? '') <= cond.dueTo)
    /* 원본 [수량] — 미판매수량이 아니라 <b>주문수량</b> 범위다. 둘은 다른 물음이다. */
    .filter((r) => !cond.orderQtyFrom || r.orderQty >= Number(cond.orderQtyFrom))
    .filter((r) => !cond.orderQtyTo || r.orderQty <= Number(cond.orderQtyTo))
    .slice()
    .sort((a, b) => (byDue
      ? ((a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : (a.dueDate ?? '') > (b.dueDate ?? '') ? 1 : 0)
      : 0))

  /** 품목별 보기 — 주문번호가 여럿 섞이므로 건수로 대신 보여 준다. */
  const byItem = useMemo(() => {
    const m = new Map<number, { itemCode: string; itemName: string; unit: string; orderQty: number; soldQty: number; unsoldQty: number; unsoldAmount: number; count: number }>()
    shown.forEach((r) => {
      const g = m.get(r.itemId) ?? { itemCode: r.itemCode, itemName: r.itemName, unit: r.unit, orderQty: 0, soldQty: 0, unsoldQty: 0, unsoldAmount: 0, count: 0 }
      g.orderQty += r.orderQty; g.soldQty += r.soldQty; g.unsoldQty += r.unsoldQty
      g.unsoldAmount += r.unsoldAmount; g.count += 1
      m.set(r.itemId, g)
    })
    return [...m.entries()].map(([itemId, g]) => ({ itemId, ...g }))
      .sort((a, b) => b.unsoldQty - a.unsoldQty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cond])

  /*
   * 원본 미판매현황(E040212)의 마지막 열 <b>[미판매부가세]</b>.
   * 줄에는 부가세가 오지 않는다(미판매수량·공급가액만). 대신 서버가 그 줄이
   * 과세인지(<code>taxable</code>)를 되짚어 실어 주므로, 저장소가 쓰는 식 그대로
   * 공급가액의 10%로 낸다(면세면 0). 판매·발주 입력 화면이 이미 같은 식을 쓴다.
   */
  const lineVat = (r: UnsoldLine) => (r.taxable ? Math.round(r.unsoldAmount * 0.1) : 0)
  const totals = shown.reduce(
    (a, r) => ({ qty: a.qty + r.unsoldQty, amount: a.amount + r.unsoldAmount, vat: a.vat + lineVat(r) }),
    { qty: 0, amount: 0, vat: 0 },
  )
  const reset = () => {
    setMode('라인별')
    setCond({
      from: init.from, to: init.to, partner: '', item: '', orderNo: '', qtyFrom: '', qtyTo: '',
      warehouse: '', project: '', employee: '', partnerMgr: '', remark: '', spec: '',
      status: '', createdBy: '', dueFrom: '', dueTo: '', orderQtyFrom: '', orderQtyTo: '',
      taxType: '',
    })
    setByDue(false); setView('표')
  }

  return (
    <EcListShell
      title="미판매현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        dateLabel="기준일자(영업주기)"
        view={view} onViewChange={setView}
        picks={INQUIRY_FULL_PICKS}
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {(['품목별', '라인별'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
        {/*
          원본 차례(2026-09-08 실측): 구분 · 기준일자(영업주기) · <b>품목별납기일자</b> ·
          <b>창고 · 프로젝트</b> · 거래처 · 품목 · <b>담당자 · 거래처관리담당자</b> ·
          미판매수량 · 오더관리번호 · <b>적요</b> · 수량 · … · <b>규격 · 진행상태 · 작성자</b>.
        */}
        <EcCond label="품목별납기일자">
          <input type="date" className="ec-input" value={cond.dueFrom}
                 onChange={(e) => setC({ dueFrom: e.target.value })} style={{ width: 140 }} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input type="date" className="ec-input" value={cond.dueTo}
                 onChange={(e) => setC({ dueTo: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={180} emptyLabel="전체"
                           value={cond.warehouse} onChange={(v) => setC({ warehouse: v })}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={180} emptyLabel="전체"
                           value={cond.project} onChange={(v) => setC({ project: v })}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={cond.partner} onChange={(v) => setC({ partner: v })}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={150} emptyLabel="전체"
                           value={cond.employee} onChange={(v) => setC({ employee: v })}
                           items={[...new Set(rows.map((r) => r.employeeName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={160} emptyLabel="전체"
                           value={cond.partnerMgr} onChange={(v) => setC({ partnerMgr: v })}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="주문번호">
          <input className="ec-input" placeholder="SO-…" value={cond.orderNo}
                 onChange={(e) => setC({ orderNo: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="미판매수량">
          <input className="ec-input" type="number" value={cond.qtyFrom}
                 onChange={(e) => setC({ qtyFrom: e.target.value })} style={{ width: 120 }} />
          <span style={{ color: 'var(--ec-label)' }}>~</span>
          <input className="ec-input" type="number" value={cond.qtyTo}
                 onChange={(e) => setC({ qtyTo: e.target.value })} style={{ width: 120 }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요" value={cond.remark}
                 onChange={(e) => setC({ remark: e.target.value })} style={{ width: 200 }} />
        </EcCond>
        <EcCond label="수량">
          <input className="ec-input" type="number" style={{ width: 100 }} value={cond.orderQtyFrom}
                 onChange={(e) => setC({ orderQtyFrom: e.target.value })} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" style={{ width: 100 }} value={cond.orderQtyTo}
                 onChange={(e) => setC({ orderQtyTo: e.target.value })} />
        </EcCond>
        {/* 원본 차례: [수량] 다음이 내.외자구분·<b>[거래유형]</b>·규격이다. */}
        <EcCond label="거래유형">
          <select className="ec-input" value={cond.taxType} style={{ width: 110 }}
                  onChange={(e) => setC({ taxType: e.target.value })}>
            <option value="">전체</option><option>과세</option><option>면세</option>
          </select>
        </EcCond>
        <EcCond label="규격">
          <input className="ec-input" placeholder="규격" value={cond.spec}
                 onChange={(e) => setC({ spec: e.target.value })} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="진행상태">
          <select className="ec-input" value={cond.status} style={{ width: 120 }}
                  onChange={(e) => setC({ status: e.target.value })}>
            <option value="">전체</option>
            {[...new Set(rows.map((r) => r.status))].map((k) => (
              <option key={k} value={k}>{rows.find((r) => r.status === k)?.statusName ?? k}</option>
            ))}
          </select>
        </EcCond>
        <EcCond label="작성자">
          <select className="ec-input" value={cond.createdBy} style={{ width: 140 }}
                  onChange={(e) => setC({ createdBy: e.target.value })}>
            <option value="">전체</option>
            {[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
              .map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </EcCond>
        {/* 원본 [정렬기준] — [데이터 보기형식] 바로 앞줄이다. */}
        <EcCond label="정렬기준">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={byDue} onChange={(e) => setByDue(e.target.checked)} />
            납기일순 (기본: 미판매수량순)
          </label>
        </EcCond>
      </EcStatusPanel>

      {/*
        원본 [데이터 보기형식]이 <b>그래프</b>면 거래처별 미판매금액을 막대로 그린다 —
        "어느 거래처의 수주가 얼마나 매출로 안 잡혔나" 가 이 화면의 물음이다.
      */}
      {view === '그래프' && (
        <EcBarChart unit=" 원" emptyText="조회된 미판매 수주가 없습니다."
                    rows={(() => {
                      const m = new Map<string, number>()
                      for (const r of shown) m.set(r.partnerName, (m.get(r.partnerName) ?? 0) + r.unsoldAmount)
                      return [...m].map(([label, value]) => ({ label, value }))
                    })()} />
      )}
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {mode === '품목별' ? '품목' : '라인'}{' '}
        <b style={{ color: '#3c4553' }}>{num(mode === '품목별' ? byItem.length : shown.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        미판매수량 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totals.qty)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        미판매금액 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{num(totals.amount)}</b>
      </div>

      <div className="overflow-x-auto">
        {mode === '라인별' ? (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '13%' }} /><col />
              <col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '10%' }} />
            </colgroup>
            {/*
              2026-09-09 원본 실측 — 격자 열은
              <b>일자-No. · 품목명(규격) · 수량 · 미판매수량 · 미판매공급가액 · 거래처명 ·
              적요 · 품목별납기일자 · 미판매부가세</b> 다([검색(F8)] 을 눌러야 머리가 나온다).
              우리 이름은 넷이 달랐고([주문번호]·[거래처]·[품목]·[주문수량]),
              <b>[적요]와 [미판매부가세]는 아예 없었다</b> — 적요는 응답이 진작 싣던 값이다.
              [판매수량]은 우리 것이라 그대로 둔다(미판매가 왜 그만큼인지 보는 칸이다).
            */}
            <thead>
              <tr>
                <th></th>
                <th>일자-No.</th>
                <th>품목명(규격)</th>
                <th style={{ textAlign: 'right' }}>수량</th>
                <th style={{ textAlign: 'right' }}>판매수량</th>
                <th style={{ textAlign: 'right' }}>미판매수량</th>
                <th style={{ textAlign: 'right' }}>미판매공급가액</th>
                <th>거래처명</th>
                <th>적요</th>
                {/* 원본 이름은 [품목별납기일자] 지만 우리 납기는 전표 단위 하나다 — 이름을 그대로 쓰면 거짓이 된다. */}
                <th>납기일자</th>
                <th style={{ textAlign: 'right' }}>미판매부가세</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={r.orderLineId} style={{ cursor: 'pointer' }}
                    onClick={() => navigate('/sales/order-status')}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)' }}>{r.orderDate.replace(/-/g, '/')} {r.orderNo}</td>
                  <td>{r.itemName}{r.spec ? ` (${r.spec})` : ''} <span style={{ fontSize: 11, color: '#9aa1ab' }}>{r.itemCode}</span></td>
                  <td style={{ textAlign: 'right' }}>{num(r.orderQty)}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(r.soldQty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#a5561b' }}>
                    {num(r.unsoldQty)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{r.unit}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{num(r.unsoldAmount)}</td>
                  <td>{r.partnerName}</td>
                  <td style={{ color: '#8a929c' }}>{r.remark ?? ''}</td>
                  <td>{(r.dueDate ?? r.orderDate).replace(/-/g, '/')}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(lineVat(r))}</td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: '#a5561b' }}>{num(totals.qty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{num(totals.amount)}</td>
                  <td colSpan={3} style={{ background: '#f5f7fa' }}></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: '#8a929c' }}>{num(totals.vat)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '14%' }} /><col />
              <col style={{ width: '8%' }} /><col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '10%' }} /><col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>품목코드</th>
                <th>품목명</th>
                <th style={{ textAlign: 'right' }}>건수</th>
                <th style={{ textAlign: 'right' }}>주문수량</th>
                <th style={{ textAlign: 'right' }}>판매수량</th>
                <th style={{ textAlign: 'right' }}>미판매수량</th>
                <th style={{ textAlign: 'right' }}>미판매금액</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : byItem.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : byItem.map((g, i) => (
                <tr key={g.itemId}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.itemCode}</td>
                  <td>{g.itemName}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                  <td style={{ textAlign: 'right' }}>{num(g.orderQty)}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.soldQty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#a5561b' }}>
                    {num(g.unsoldQty)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{g.unit}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>{num(g.unsoldAmount)}</td>
                </tr>
              ))}
            </tbody>
            {byItem.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: '#a5561b' }}>{num(totals.qty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: 'var(--ec-blue)' }}>{num(totals.amount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </EcListShell>
  )
}
