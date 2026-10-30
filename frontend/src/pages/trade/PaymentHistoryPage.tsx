import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { periodOf } from '../../components/EcPeriodPicks'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { Link } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import { INQUIRY_PICKS } from '../../utils/periods'
import { loadSupplierParty, printDocuments } from '../../utils/printDocument'
import { useNavigate } from 'react-router-dom'
import { EcDateRange } from '../../components/ui/EcDateInput'

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

/*
 * 2026-10-22 원본(loginaa E040254) 다시 잼 — 머리 Search(F3) · Option · 도움말(빠른 검색칸 없음), 조건 판은 접혀서 시작.
 * 탭 전체 · 미반영*(기본) · 회계반영 · 강제회계반영. 열 14(☐+번호 · 결제요청일시 '2026/10/22 오전 11:06:59' · 결제요청자ID ·
 * 거래처 · 품목 · 결제금액 · 결제방법 · 결제상태 · 승인번호 · 재고전표 · 상태별처리기능 · 회계전표 · 내역 '보기' · 영수증인쇄),
 * 합계줄 없음, 아래 버튼 입금보고서작성 · 신규(F2) · Excel. 빈 결과 '등록된 데이터가 없습니다.'
 * 우리 결제 = 수금/지급 전표라 품목 · 결제상태 · 승인번호 · 재고전표는 값이 생기지 않는다(PG 연동 없음 — 지어내지 않는다).
 * 원본 [상태별처리기능] 칸(승인실패 → '재결제')에 우리 일(회계반영 · 반영취소)을 둔다 — 결제를 회계로 넘기는 곳이 이 화면뿐이다.
 */
const TABS = ['전체', '미반영', '회계반영', '강제회계반영'] as const
type Tab = typeof TABS[number]

/** 원본 기간 빠른선택(결제요청일자): 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일 · 최근7일. */
const PICKS = [...INQUIRY_PICKS, '최근7일'] as const

const initP = periodOf('최근7일')!
const initCond = {
  from: initP.from, to: initP.to,
  /** 원본 [전표일자] 는 '사용안함' 으로 시작한다. */
  slipUse: false, slipFrom: initP.from, slipTo: initP.to,
  status: '', partnerName: '', warehouse: '', approval: '', card: '', amtFrom: '', amtTo: '', lastOnly: false, item: '',
}

/** 원본 결제요청일시 꼴 '2026/10/22 오전 11:06:59'. */
function requestedAt(r: SettlementRow): string {
  if (!r.createdAt) return r.slipDate.replace(/-/g, '/')
  const [d, t = ''] = r.createdAt.split('T')
  const [hh = '0', mm = '00', ss = '00'] = t.slice(0, 8).split(':')
  const h = Number(hh)
  return `${d.replace(/-/g, '/')} ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${mm}:${ss.padStart(2, '0')}`
}

export default function PaymentHistoryPage() {
  /** 원본 [입금보고서작성] — FastEntry 의 입금보고서 화면을 연다. */
  const navigate = useNavigate()
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cond, setCond] = useState(initCond)
  const setC = (p: Partial<typeof cond>) => setCond((c) => ({ ...c, ...p }))
  /** 원본은 [미반영] 탭이 켜진 채로 열린다. */
  const [tab, setTab] = useState<Tab>('미반영')
  const [picked, setPicked] = useState<number[]>([])

  async function load(): Promise<SettlementRow[]> {
    setLoading(true)
    try {
      // 결제요청일자 = 우리 전표일자(수금/지급은 그날 만든다) — 서버가 그 기간만 준다.
      const res = await api.get<SettlementRow[]>('/accounting-reflection', {
        params: { kind: 'SETTLEMENT', from: cond.from || undefined, to: cond.to || undefined },
      })
      const key = (r: SettlementRow) => r.createdAt ?? r.slipDate
      const list = [...res.data].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : b.id - a.id))
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

  useEffect(() => { load() }, [cond.from, cond.to])

  // 값이 생기지 않는 조건(결제상태 · 창고명 · 승인번호 · 카드/식별번호 · 품목명)에 글자를 넣으면 맞는 결제가 없다.
  const noValue = !!(cond.status || cond.warehouse || cond.approval || cond.card || cond.item)
  const shown = noValue ? [] : rows
    .filter((r) => tab === '전체' || (tab === '미반영' ? !r.reflected : tab === '회계반영' ? r.reflected : false))
    .filter((r) => !cond.slipUse || ((!cond.slipFrom || r.slipDate >= cond.slipFrom) && (!cond.slipTo || r.slipDate <= cond.slipTo)))
    // 원본 [거래처명] 은 코드도움이 아니라 이름 일부(글자 칸)다.
    .filter((r) => !cond.partnerName || r.partnerName.includes(cond.partnerName))
    .filter((r) => (!cond.amtFrom || r.totalAmount >= Number(cond.amtFrom))
      && (!cond.amtTo || r.totalAmount <= Number(cond.amtTo)))
    // 원본 [기타] ☐ 최종결제상태만 — 같은 결제의 재결제 · 취소 줄 가운데 마지막 것만. 우리 결제는 전표 하나가 한 상태라
    // 전표번호마다 마지막(가장 늦게 만든) 줄만 남기는 것과 같다.
    .filter((r, _i, all) => !cond.lastOnly || all.find((x) => x.docNo === r.docNo) === r)

  /** 고른(또는 그 줄) 전표를 회계로 넘긴다. 수금은 차)현금 / 대)외상매출금. */
  async function reflect(ids: number[], reverse: boolean) {
    if (ids.length === 0) return
    setError('')
    if (!await ecConfirm(reverse ? '회계반영을 취소하겠습니까?' : '회계반영하겠습니까?')) return
    try {
      await api.post(`/accounting-reflection/${reverse ? 'unreflect' : 'reflect'}`, { kind: 'SETTLEMENT', ids })
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const allPicked = shown.length > 0 && shown.every((r) => picked.includes(r.id))

  return (
    <EcListShell title="결제내역조회" searchable={false} collapseConditions onSearch={load}
                 onReset={() => setCond(initCond)}
                 // 원본 [신규(F2)] — 결제는 수금/지급 입력에서 만든다. 그 화면을 연다.
                 onNew={() => navigate('/sales/settlement')}
                 /* 원본은 고른 줄이 없으면 '리스트에 선택된 자료가 없습니다.' 알림(2026-10-30 클릭 대조) — 바로 넘어가던 것. */
                 actions={[{ label: '입금보고서작성', onClick: () => navigate('/accounting/vouchers?type=DEPOSIT_REPORT'), selected: picked.length },
                           { label: 'Excel' }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <EcStatusPanel from={cond.from} to={cond.to} dateLabel="결제요청일자" picks={PICKS}
                     onPeriod={(r) => setC({ from: r.from, to: r.to })}>
        <EcCond label="전표일자">
          <select className="ec-input w-[90px]" value={cond.slipUse ? 'Y' : ''}
                  onChange={(e) => setC({ slipUse: e.target.value === 'Y' })}>
            <option value="">사용안함</option>
            <option value="Y">사용</option>
          </select>
          <EcDateRange from={{ className: "ec-input w-[130px]", disabled: !cond.slipUse, value: cond.slipFrom, onChange: (e) => setC({ slipFrom: e.target.value }) }} to={{ className: "ec-input w-[130px]", disabled: !cond.slipUse, value: cond.slipTo, onChange: (e) => setC({ slipTo: e.target.value }) }} />
        </EcCond>
        <EcCond label="결제상태">
          <input className="ec-input w-[200px]" placeholder="결제상태" value={cond.status} onChange={(e) => setC({ status: e.target.value })} />
        </EcCond>
        <EcCond label="거래처명">
          <input className="ec-input w-[200px]" placeholder="거래처명"
                 value={cond.partnerName} onChange={(e) => setC({ partnerName: e.target.value })} />
        </EcCond>
        <EcCond label="창고명">
          <input className="ec-input w-[200px]" placeholder="창고명" value={cond.warehouse} onChange={(e) => setC({ warehouse: e.target.value })} />
        </EcCond>
        <EcCond label="승인번호">
          <input className="ec-input w-[200px]" placeholder="승인번호" value={cond.approval} onChange={(e) => setC({ approval: e.target.value })} />
        </EcCond>
        <EcCond label="카드/식별번호">
          <input className="ec-input w-[200px]" placeholder="카드/식별번호" value={cond.card} onChange={(e) => setC({ card: e.target.value })} />
        </EcCond>
        <EcCond label="결제금액">
          <input className="ec-input w-[130px] text-right" type="number" placeholder="결제금액"
                 value={cond.amtFrom} onChange={(e) => setC({ amtFrom: e.target.value })} />
          <span className="text-ec-label">~</span>
          <input className="ec-input w-[130px] text-right" type="number"
                 value={cond.amtTo} onChange={(e) => setC({ amtTo: e.target.value })} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[4px]">
            <input type="checkbox" checked={cond.lastOnly} onChange={(e) => setC({ lastOnly: e.target.checked })} />최종결제상태만
          </label>
        </EcCond>
        <EcCond label="품목명">
          <input className="ec-input w-[200px]" placeholder="품목명" value={cond.item} onChange={(e) => setC({ item: e.target.value })} />
        </EcCond>
        <EcCond label="양식">
          <span className="text-ec-label mr-[6px]">적용양식</span>
          <select className="ec-input w-[150px]" disabled><option>기본(수정불가)</option></select>
        </EcCond>
      </EcStatusPanel>

      <ul className="ec-tabs mb-[8px]">
        {TABS.map((t) => (
          <li key={t} className={`ec-tab${tab === t ? ' active' : ''}`}
              onClick={() => { setTab(t); setPicked([]) }}>{t}</li>
        ))}
      </ul>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[25px] text-center">
              <input type="checkbox" checked={allPicked}
                     onChange={() => setPicked(allPicked ? [] : shown.map((r) => r.id))} />
            </th>
            <th className="w-[160px]">결제요청일시</th>
            <th className="w-[100px]">결제요청자ID</th>
            <th className="w-[120px]">거래처</th>
            <th className="w-[120px]">품목</th>
            <th className="w-[80px] text-right">결제금액</th>
            <th className="w-[80px]">결제방법</th>
            <th className="w-[80px]">결제상태</th>
            <th className="w-[100px]">승인번호</th>
            <th className="w-[100px]">재고전표</th>
            <th className="w-[100px] text-center">상태별처리기능</th>
            <th className="w-[100px]">회계전표</th>
            <th className="w-[100px] text-center">내역</th>
            <th className="w-[100px] text-center">영수증인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={14} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={14} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center">
                <label className="inline-flex items-center gap-[2px]">
                  <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} />{i + 1}
                </label>
              </td>
              <td>{requestedAt(r)}</td>
              <td>{r.createdBy ?? ''}</td>
              <td>{r.partnerName}</td>
              <td></td>
              <td className="text-right">{r.totalAmount.toLocaleString()}</td>
              <td>{r.methodText || ''}</td>
              <td></td>
              <td></td>
              <td></td>
              <td className="text-center">
                <a className="cursor-pointer" onClick={() => reflect(picked.includes(r.id) ? picked : [r.id], r.reflected)}>
                  {r.reflected ? '반영취소' : '회계반영'}
                </a>
              </td>
              {/* 원본 [회계전표] — 어느 분개인지 찾아간다. */}
              <td>
                {r.journalDocNo && <Link to={`/accounting/journals?entryId=${r.journalEntryId}`}>{r.journalDocNo}</Link>}
              </td>
              <td className="text-center">
                <a className="cursor-pointer"
                   onClick={() => ecAlert(`${r.docNo} · ${r.vatType}${r.methodText ? ` (${r.methodText})` : ''}${r.note ? `\n${r.note}` : ''}`)}>보기</a>
              </td>
              <td className="text-center">
                <a className="cursor-pointer" onClick={() => printReceipt(r)}>{r.vatType === '수금' ? '영수증' : '지급증'}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
