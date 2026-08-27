import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
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
  itemSummary: string
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
      { label: '결제방법', value: r.itemSummary },
      { label: '결제요청자', value: r.createdBy },
    ],
    remark: r.note,
    lines: [{
      itemName: `${r.vatType}${r.itemSummary ? ` (${r.itemSummary})` : ''}`,
      quantity: 1, unitPrice: r.totalAmount, supplyAmount: r.totalAmount, vatAmount: 0,
    }],
    footNote: received ? '위 금액을 정히 영수함.' : '위 금액을 정히 지급함.',
  }])
}

const TABS = ['전체', '미반영', '회계반영'] as const
type Tab = typeof TABS[number]

export default function PaymentHistoryPage() {
  /** 원본 [입금보고서작성] — FastEntry 의 입금보고서 화면을 연다. */
  const navigate = useNavigate()
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<Tab>('전체')
  const [picked, setPicked] = useState<number[]>([])

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<SettlementRow[]>('/accounting-reflection?kind=SETTLEMENT')
      const list = [...res.data].sort((a, b) =>
        (a.slipDate < b.slipDate ? 1 : a.slipDate > b.slipDate ? -1 : b.id - a.id))
      setRows(list)
      setPicked([])
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const shown = rows
    .filter((r) => tab === '전체' || (tab === '미반영' ? !r.reflected : r.reflected))
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.docNo.includes(keyword))
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
      setOk(`${res.data.reflectedCount}건 회계${reverse ? '반영취소' : '반영'} 완료`)
      await load()
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
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf5ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      {/* 원본 위쪽 탭. 미반영이 몇 건인지 붙여 둔다 — 안 보이면 끝난 줄 안다. */}
      <ul className="ec-tabs" style={{ marginBottom: 8 }}>
        {TABS.map((t) => (
          <li key={t} className={`ec-tab${tab === t ? ' active' : ''}`}
              onClick={() => { setTab(t); setPicked([]) }}>
            {t}{t === '미반영' && unreflected > 0 ? ` (${unreflected})` : ''}
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <button className="ec-btn ec-btn-primary" disabled={picked.length === 0}
                onClick={() => reflect(false)}>회계반영</button>
        <button className="ec-btn" disabled={picked.length === 0}
                onClick={() => reflect(true)}>반영취소</button>
        <span style={{ fontSize: 11.5, color: '#8a929c' }}>
          수금 차)현금·예금 / 대)외상매출금 · 지급 차)외상매입금 / 대)현금·예금
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b>
        </span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 30, textAlign: 'center' }}></th>
            {/* 원본 첫 열은 [결제요청일시] 다 — 날짜만 있으면 같은 날 여러 건의 순서가 안 보인다. */}
            <th style={{ width: 135 }}>결제요청일시</th>
            <th style={{ width: 150 }}>전표번호</th>
            <th>거래처</th>
            <th style={{ width: 60, textAlign: 'center' }}>구분</th>
            <th style={{ width: 110 }}>결제방법</th>
            <th style={{ width: 130, textAlign: 'right' }}>결제금액</th>
            <th style={{ width: 110 }}>결제요청자</th>
            <th style={{ width: 90, textAlign: 'center' }}>회계반영</th>
            <th style={{ width: 150 }}>회계전표No.</th>
            <th>내역</th>
            {/* 원본 결제내역조회의 마지막 열 [영수증인쇄]. */}
            <th style={{ width: 80, textAlign: 'center' }}>영수증인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={13} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />
              </td>
              <td style={{ fontFamily: 'monospace' }}>
                {r.slipDate}
                {r.createdAt && (
                  <span style={{ color: '#9aa1ab', marginLeft: 4 }}>{r.createdAt.slice(11, 16)}</span>
                )}
              </td>
              <td style={{ fontFamily: 'monospace' }}>{r.docNo}</td>
              <td>{r.partnerName}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: r.vatType === '수금' ? '#1c7c3c' : '#c60a2e' }}>{r.vatType}</td>
              <td>{r.itemSummary || '-'}</td>
              <td style={{ textAlign: 'right' }}>{r.totalAmount.toLocaleString()}</td>
              <td style={{ color: '#5a626e', fontSize: 11.5 }}>{r.createdBy ?? ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, fontSize: 11.5,
                           color: r.reflected ? '#1c7c3c' : '#c07a00' }}>
                {r.reflected ? '반영' : '미반영'}
              </td>
              {/* 원본 [회계전표No.]. 반영했다는 표시만 있고 어느 분개인지 없으면 찾아갈 길이 없다. */}
              <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                {r.journalDocNo ? (
                  <Link to={`/accounting/journals?entryId=${r.journalEntryId}`}
                        style={{ color: 'var(--ec-blue)' }}>{r.journalDocNo}</Link>
                ) : <span style={{ color: '#c9ced6' }}>—</span>}
              </td>
              <td style={{ color: '#8a929c' }}>{r.note ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => printReceipt(r)} style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  {r.vatType === '수금' ? '영수증' : '지급증'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={7} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{total.toLocaleString()}</td>
              <td colSpan={5}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
