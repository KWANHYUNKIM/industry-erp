import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { periodOf } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { Link } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, printDocuments } from '../../utils/printDocument'
import { useNavigate } from 'react-router-dom'

/**
 * 영업 > <b>결제내역조회</b> — 거래처별 수금/지급 결제 이력.
 *
 * <p>원본 열 실측(사본): 결제요청일시 · <b>결제요청자ID</b> · 거래처 · 품목 · 결제금액 ·
 * 결제방법 · 결제상태 · 승인번호 · 재고전표 · 상태별처리기능 · <b>회계전표</b> · 내역.
 * 위쪽 탭은 전체 · <b>미반영 · 회계반영</b> · 강제회계반영이다.
 *
 * <p>그 탭과 [회계전표] 열이 말하는 것은 <b>결제 전표도 회계로 넘어간다</b>는 것이다.
 * 우리는 넘기지 않았다 — JournalSourceType 에 결제가 아예 없었다. 그래서 판매하면
 * 외상매출금이 잡히는데 수금해도 안 줄어, 원장의 외상매출금이 한 방향으로만 쌓였다.
 * 채권현황은 따로 세니까 맞고, 어긋난 것은 원장뿐이라 결산할 때까지 아무도 모른다.
 *
 * <p>승인번호·재고전표·상태별처리기능은 만들지 않았다. 원본의 결제내역은 PG(카드결제)
 * 연동에서 들어오는 자료인데 우리에겐 그 연동이 없다 — 칸만 만들면 늘 비어 있다.
 *
 * <p>조건 판이 <b>통째로 없었다.</b> 원본 조건 실측(사본): 전표일자(기간) · 결제상태 ·
 * 거래처명 · 창고명 · 승인번호 · 카드/식별번호 · <b>결제금액(범위)</b> · 기타 · 품목명.
 * 우리에겐 위쪽 검색 한 칸뿐이라 <b>기간을 못 잘랐다</b> — 결제가 쌓일수록 화면이
 * 전부를 받아 와 첫 화면에서부터 몇 해 치가 한꺼번에 떴다.
 *
 * <p>[결제금액]은 열로 찍으면서 거를 수는 없었다. 금액으로 못 거는 결제 목록은
 * "백만원 넘는 수금만" 같은 가장 흔한 물음에 답을 못 한다.
 *
 * <p>못 만든 것과 이유 — <b>결제상태</b>는 원본에서 PG 결제 상태(승인·취소)를 고르는
 * 코드도움이다. 우리 전표에는 그 상태가 없다(회계반영 여부는 다른 것이라 위 탭이 맡는다).
 * <b>창고명</b>은 결제가 돈이라 창고를 안 탄다. <b>승인번호·카드/식별번호·품목명</b>은
 * 위와 같은 이유로 값이 아예 생기지 않는다.
 */
/*
 * 목록은 /accounting-reflection?kind=SETTLEMENT 에서 받는다. /settlements 가 아니다.
 * 원본 [회계전표No.] 를 실으려면 분개를 알아야 하는데, trade 는 accounting 을 참조할 수
 * 없다(CLAUDE.md 4.1 — accounting → trade 가 이미 있어 맞물리면 순환이다).
 * 반대쪽인 accounting 이 결제를 읽어 회계전표번호까지 붙여 내려 준다.
 */
interface SettlementRow {
  id: number
  docNo: string
  slipDate: string
  partnerName: string
  /** 수금 · 지급. 결제에는 부가세유형이 없어 이 자리에 구분이 온다. */
  vatType: string
  /** 결제방법. 결제에는 품목이 없어 이 자리에 온다. */
  /**
   * <b>이름과 달리 품목이 아니라 [결제방법] 글자다.</b> 결제 전표에는 품목이 없다 —
   * 이 이름 때문에 [품목] 열을 만들 뻔했다(그러면 머리는 품목인데 값은 결제방법이 된다).
   */
  methodText: string
  totalAmount: number
  createdBy: string | null
  /** 전표를 만든 시각. 원본 첫 열이 [결제요청일시] 라 날짜만으로는 그 이름을 못 지킨다. */
  createdAt: string | null
  note: string | null
  reflected: boolean
  journalEntryId: number | null
  journalDocNo: string | null
}

/**
 * 원본 결제내역조회 격자의 마지막 열 <b>[영수증인쇄]</b> — 그 결제 한 건의 영수증.
 *
 * <p>받은 돈(수금)은 영수증을, 준 돈(지급)은 지급증을 찍는다. 이름이 갈리는 이유는
 * <b>누가 누구에게 준 돈인지가 반대</b>라서다 — 한 이름으로 뭉치면 받은 쪽과 준 쪽이
 * 같은 종이를 들게 된다.
 *
 * <p>결제에는 품목이 없다. 그래서 줄 하나에 결제방법·내역을 적고 금액을 싣는다 —
 * 없는 품목을 지어내지 않는다.
 */
async function printReceipt(r: SettlementRow) {
  const received = r.vatType === '수금'
  const ours = await loadSupplierParty(received ? '수령자' : '지급자')
  await printDocuments([{
    title: received ? '영 수 증' : '지 급 증',
    docNo: r.docNo,
    docDate: r.slipDate,
    supplier: ours ?? { label: received ? '수령자' : '지급자', name: '(회사정보 미등록)' },
    customer: { label: received ? '납부자' : '수령자', name: r.partnerName },
    extra: [
      { label: '결제방법', value: r.methodText },
      { label: '결제요청자', value: r.createdBy },
    ],
    remark: r.note,
    lines: [{
      itemName: `${r.vatType}${r.methodText ? ` (${r.methodText})` : ''}`,
      quantity: 1, unitPrice: r.totalAmount, supplyAmount: r.totalAmount, vatAmount: 0,
    }],
    footNote: received ? '위 금액을 정히 영수함.' : '위 금액을 정히 지급함.',
  }])
}

const TABS = ['전체', '미반영', '회계반영'] as const
type Tab = typeof TABS[number]

const initP = periodOf('최근7일')!

export default function PaymentHistoryPage() {
  /** 원본 [입금보고서작성] — FastEntry 의 입금보고서 화면을 연다. */
  const navigate = useNavigate()
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [keyword, setKeyword] = useState('')
  /** 원본 조건 판. 기간은 비워 두면 전체다 — 기본값으로 과거를 숨기지 않는다. */
  /*
   * 원본 결제내역조회는 <b>[최근7일]</b> 로 열린다(사본 실측). 다른 현황이 다 금월인데
   * 이 화면만 이레다 — 수금·지급은 <b>방금 들어온 돈</b>을 보는 자리라서다.
   * 우리는 비워 두어 열면 몇 해치 결제가 쏟아졌다.
   */
  const [cond, setCond] = useState({ from: initP.from, to: initP.to, partnerName: '', amtFrom: '', amtTo: '' })
  const setC = (p: Partial<typeof cond>) => setCond((c) => ({ ...c, ...p }))
  /*
   * 원본은 <b>[미반영]</b> 탭이 켜진 채로 열린다(사본 실측 — 그 탭에 active 가 붙어 있다).
   * 이 화면에 오는 까닭은 대개 <b>아직 회계로 안 넘긴 결제</b>를 찾으려는 것이라,
   * 전체로 열면 이미 끝난 것까지 섞여 그 사이에서 골라내야 한다.
   */
  const [tab, setTab] = useState<Tab>('미반영')
  const [picked, setPicked] = useState<number[]>([])

  async function load(): Promise<SettlementRow[]> {
    setLoading(true)
    try {
      const res = await api.get<SettlementRow[]>('/accounting-reflection?kind=SETTLEMENT')
      const list = [...res.data].sort((a, b) =>
        (a.slipDate < b.slipDate ? 1 : a.slipDate > b.slipDate ? -1 : b.id - a.id))
      setRows(list)
      setPicked([])
      return list
    } catch (err) {
      setError(extractErrorMessage(err))
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows
    .filter((r) => tab === '전체' || (tab === '미반영' ? !r.reflected : r.reflected))
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.docNo.includes(keyword))
    // 원본 [전표일자] — 비워 두면 그쪽 끝은 안 자른다.
    .filter((r) => (!cond.from || r.slipDate >= cond.from) && (!cond.to || r.slipDate <= cond.to))
    // 원본 [거래처명]. 코드도움이 아니라 <b>이름 일부</b>다(사본 실측 — 그냥 text 칸이다).
    .filter((r) => !cond.partnerName || r.partnerName.includes(cond.partnerName))
    // 원본 [결제금액] 은 칸이 둘에 사이가 '~' 인 <b>범위</b>다(사본 실측).
    .filter((r) => (!cond.amtFrom || r.totalAmount >= Number(cond.amtFrom))
      && (!cond.amtTo || r.totalAmount <= Number(cond.amtTo)))
  const total = useMemo(() => shown.reduce((s, r) => s + r.totalAmount, 0), [shown])
  const unreflected = rows.filter((r) => !r.reflected).length

  /** 고른 전표를 회계로 넘긴다. 수금은 차)현금 / 대)외상매출금. */
  async function reflect(reverse: boolean) {
    if (picked.length === 0) return
    setError(''); setOk('')
    try {
      const res = await api.post<{ reflectedCount: number }>(
        `/accounting-reflection/${reverse ? 'unreflect' : 'reflect'}`,
        { kind: 'SETTLEMENT', ids: picked })
      const ids = picked
      const list = await load()
      // 판매·구매일괄회계반영과 같이 만들어진 회계전표 번호를 붙인다(24회차 #74 와 같은 까닭).
      const nos = reverse ? [] : list.filter((r) => ids.includes(r.id) && r.journalDocNo).map((r) => r.journalDocNo as string)
      setOk(`${res.data.reflectedCount}건 회계${reverse ? '반영취소' : '반영'} 완료`
        + (nos.length ? ` — 회계전표 ${nos.slice(0, 5).join(', ')}${nos.length > 5 ? ` 외 ${nos.length - 5}건` : ''}` : ''))
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <EcListShell title="결제내역조회" search={keyword} onSearchChange={setKeyword} onSearch={load}
                 // 원본 [신규(F2)] — 결제는 수금/지급 입력에서 만든다. 그 화면을 연다.
                 onNew={() => navigate('/sales/settlement')}
                 actions={[{ label: '새로고침', onClick: load },
                           // 원본 [입금보고서작성] — FastEntry 의 입금보고서로 넘긴다.
                           { label: '입금보고서작성', onClick: () => navigate('/accounting/vouchers?type=DEPOSIT_REPORT') },
                           { label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p style={{ background: '#eaf5ec', color: 'var(--ec-success)', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <EcStatusPanel from={cond.from} to={cond.to} dateLabel="전표일자"
                     onPeriod={(r) => setC({ from: r.from, to: r.to })}>
        <EcCond label="거래처명">
          <input className="ec-input" style={{ width: 200 }} placeholder="거래처명"
                 value={cond.partnerName} onChange={(e) => setC({ partnerName: e.target.value })} />
        </EcCond>
        <EcCond label="결제금액">
          <input className="ec-input" type="number" style={{ width: 130, textAlign: 'right' }}
                 value={cond.amtFrom} onChange={(e) => setC({ amtFrom: e.target.value })} />
          <span className="text-ec-label">~</span>
          <input className="ec-input" type="number" style={{ width: 130, textAlign: 'right' }}
                 value={cond.amtTo} onChange={(e) => setC({ amtTo: e.target.value })} />
        </EcCond>
      </EcStatusPanel>

      {/* 원본 위쪽 탭. 미반영이 몇 건인지 붙여 둔다 — 안 보이면 끝난 줄 안다. */}
      <ul className="ec-tabs" style={{ marginBottom: 8 }}>
        {TABS.map((t) => (
          <li key={t} className={`ec-tab${tab === t ? ' active' : ''}`}
              onClick={() => { setTab(t); setPicked([]) }}>
            {t}{t === '미반영' && unreflected > 0 ? ` (${unreflected})` : ''}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-[8px] mb-[8px]">
        <button className="ec-btn ec-btn-primary" disabled={picked.length === 0}
                onClick={() => reflect(false)}>회계반영</button>
        <button className="ec-btn" disabled={picked.length === 0}
                onClick={() => reflect(true)}>반영취소</button>
        <span className="text-[11.5px] text-ec-hint">
          수금 차)현금·예금 / 대)외상매출금 · 지급 차)외상매입금 / 대)현금·예금
        </span>
        <span className="ml-auto text-[12.5px] text-ec-label">
          합계 <b className="text-ec-navy text-[14px]">{total.toLocaleString()}</b>
        </span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[30px] text-center"></th>
            {/* 원본 첫 열은 [결제요청일시] 다 — 날짜만 있으면 같은 날 여러 건의 순서가 안 보인다. */}
            {/* 원본 폭은 결제요청일시 160 · 회계전표 100 — 우리는 135 vs 150 으로 <b>앞뒤가 뒤집혀</b> 있었다. */}
            <th className="w-[160px]">결제요청일시</th>
            {/*
              원본 차례: 결제요청일시 · <b>결제요청자ID</b> · 거래처 · <b>품목</b> · 결제금액 ·
              결제방법 · … · <b>회계전표</b> · 내역 · 영수증인쇄 (사본 실측).
              요청자는 뒤에 가 있었고, 품목은 <b>값이 있는데 안 보여 줬다.</b>
            */}
            <th className="w-[110px]">결제요청자ID</th>
            <th className="w-[150px]">전표번호</th>
            <th>거래처</th>
            <th className="w-[60px] text-center">구분</th>
            {/* 원본 차례는 <b>결제금액 · 결제방법</b> 이다(사본 실측) — 우리는 뒤집혀 있었다. */}
            <th className="w-[130px] text-right">결제금액</th>
            <th className="w-[110px]">결제방법</th>
            <th className="w-[90px] text-center">회계반영</th>
            <th className="w-[100px]">회계전표</th>
            <th>내역</th>
            {/* 원본 결제내역조회의 마지막 열 [영수증인쇄]. */}
            <th className="w-[80px] text-center">영수증인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={13} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-center">
                <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
              </td>
              <td>
                {r.slipDate}
                {r.createdAt && (
                  <span className="text-ec-hint ml-[4px]">{r.createdAt.slice(11, 16)}</span>
                )}
              </td>
              <td className="text-ec-label text-[11.5px]">{r.createdBy ?? ''}</td>
              <td>{r.docNo}</td>
              <td>{r.partnerName}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: r.vatType === '수금' ? 'var(--ec-success)' : 'var(--ec-danger)' }}>{r.vatType}</td>
              <td className="text-right">{r.totalAmount.toLocaleString()}</td>
              <td>{r.methodText || ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 11.5,
                           color: r.reflected ? 'var(--ec-success)' : 'var(--ec-warn)' }}>
                {r.reflected ? '반영' : '미반영'}
              </td>
              {/* 원본 [회계전표No.]. 반영했다는 표시만 있고 어느 분개인지 없으면 찾아갈 길이 없다. */}
              <td className="text-[11.5px]">
                {r.journalDocNo ? (
                  <Link to={`/accounting/journals?entryId=${r.journalEntryId}`}
                        style={{ color: 'var(--ec-blue)' }}>{r.journalDocNo}</Link>
                ) : <span className="text-ec-off">—</span>}
              </td>
              <td className="text-ec-hint">{r.note ?? ''}</td>
              <td className="text-center">
                <button onClick={() => printReceipt(r)} style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  {r.vatType === '수금' ? '영수증' : '지급증'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={7} className="text-right">합계 ({shown.length}건)</td>
              <td className="text-right text-ec-navy">{total.toLocaleString()}</td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
