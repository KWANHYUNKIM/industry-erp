import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../../components/EcStatusPanel'
import { dateNo } from '../../../utils/dateNo'
import { COMPARE_PICKS, periodOf } from '../../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../../api/client'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { useCondPickers } from '../../../utils/useCondPickers'
import EcRowCap, { capRows } from '../../../components/EcRowCap'

/**
 * 영업 > 결제내역자료비교.
 *
 * <p>원본 결과 열 실측(사본): 왼쪽 <b>[결제내역]</b> 결제요청일시 · 거래처 · 공급가액 ·
 * 부가세 · 합계, 오른쪽 <b>[판매전표II]</b> 일자-No. · 거래처명 · 공급가액합계 ·
 * 부가세합계 · 금액합계, 그리고 <b>차이</b>. 즉 <b>받은 돈과 판 금액을 맞대는</b> 화면이다.
 *
 * <p>우리 화면은 "장부금액 대 통장금액" 을 비교했는데, 통장금액을 <b>결제수단 문자열로
 * 추정</b>했다 — 계좌이체·카드면 통장에서 확인된 것으로 치고 현금·어음이면 0 으로 쳤다.
 * 은행 거래 자료를 읽은 것이 아니라 글자만 보고 지어낸 값이라, 현금으로 받은 돈은
 * 전부 '불일치' 로 찍혔다. 대사표가 늘 틀리면 아무도 안 본다.
 *
 * <p>이제 원본대로 <b>판매전표 금액과 결제(수금) 금액</b>을 맞댄다. 둘 다 우리가 실제로
 * 가진 자료다. 한 줄은 (일자 × 거래처)이고, 차이는 판매 − 수금이다 — 양수면 아직 못 받은 돈.
 */
interface SettlementRow {
  id: number
  docNo: string
  typeName: string
  partnerId: number
  partnerName: string
  settleDate: string
  amount: number
  method: string | null
}

interface SalesDoc {
  id: number
  docNo: string
  partnerId: number
  partnerName: string
  saleDate: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
}

/** 한 줄 = 일자 × 거래처. 판매와 수금을 같은 칸에 맞댄다. */
interface CompareRow {
  key: string
  date: string
  /** 줄을 묶고 거래처 조건을 거는 축. 이름은 겹칠 수 있어 id 로 묶는다. */
  partnerId: number
  partnerName: string
  saleDocNos: string[]
  supplyAmount: number
  vatAmount: number
  saleTotal: number
  payDocNos: string[]
  payTotal: number
}


/**
 * 원본 조건 판 실측(사본 · 결제내역자료비교):
 *   기준일자(금월(~오늘)) · 거래처 · [자료기준] 전체 | 일치 | 불일치 ·
 *   양식 · 정렬/소계기준
 *   기간 빠른선택에 <b>이번기수(~전월)</b> 가 있다.
 *
 * <p>우리는 검색어 한 칸이 전부였다. 대사는 "안 맞는 것만 골라 보는" 화면인데
 * 정작 불일치만 볼 방법이 없었다.
 */
type Basis = '전체' | '일치' | '불일치'

export default function PaymentComparePage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['partners'])
  const [rows, setRows] = useState<SettlementRow[]>([])
  const [sales, setSales] = useState<SalesDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /*
   * 원본 기준일자는 <b>[금월(~오늘)]</b> 로 열린다(2026-10-20 loginaa E040255 실측: 2026/10/01 ~ 2026/10/20).
   * 사본에는 [이번기수(~전월)] 이 눌려 있었는데 메뉴에서 새로 연 원본은 금월이다. [이번기수(~전월)] 은
   * 빠른선택에 그대로 있다(회사 회계연도 시작월로 계산 — 실측 2026/01/01 ~ 2026/09).
   */
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partner, setPartner] = useState('')
  const [basis, setBasis] = useState<Basis>('전체')
  /*
   * 원본 조건 <b>[거래처그룹1]</b>. 2026-09-09 에 원본(E040255)을 열어 재니 조건이
   * 아홉이고([기준일자]·[거래처]·<b>[거래처그룹1]·[거래처그룹2]·[거래처계층그룹]</b>·
   * [자료기준]·양식·[적용양식]·[정렬/소계기준]) 대조표에는 다섯만 적혀 있었다.
   * 이 화면은 <b>대사</b> 화면이라 "이 그룹 거래처들만 맞춰 보자" 가 늘 있는 물음인데
   * 거래처 하나씩만 좁힐 수 있었다. 거래처그룹은 마스터에 진작 있다.
   * (거래처그룹2·거래처계층그룹은 우리 그룹이 하나뿐이라 전역 예외다.)
   */
  // '이번기수(~전월)' 은 회사 회계연도 시작월을 알아야 계산된다. 1월로 넘겨짚지 않는다.
  const [fiscalStart, setFiscalStart] = useState<number | undefined>(undefined)

  async function load() {
    setLoading(true)
    try {
      const period: Record<string, string> = {}
      if (from) period.from = from
      if (to) period.to = to
      const [res, sl] = await Promise.all([
        /*
       * <b>고른 기간을 서버에도 보낸다.</b> 여태 전표를 통째로 받아 아래에서 걸렀다 —
       * 화면은 [기간]을 묻고 서버에는 아무것도 안 보내는 꼴이었다.
         * 판매는 saleDate, 결제는 settleDate 로 거른다 — 둘 다 자기 날짜다.
         */
        api.get<SettlementRow[]>('/settlements', { params: period }),
        api.get<SalesDoc[]>('/sales', { params: period }),
      ])
      const list = [...res.data].sort((a, b) => (a.settleDate < b.settleDate ? 1 : a.settleDate > b.settleDate ? -1 : 0))
      setRows(list)
      setSales(sl.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /* 기간을 바꾸면 그 기간으로 다시 받는다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  useEffect(() => {
    api.get<{ fiscalStart?: string } | null>('/preferences')
      .then((r) => {
        const m = Number(r.data?.fiscalStart)
        if (m >= 1 && m <= 12) setFiscalStart(m)
      })
      .catch(() => { /* 못 받으면 기수 버튼만 안 눌린다 */ })
  }, [])


  /**
   * 한 줄 = 일자 × 거래처. 판매전표 금액과 그날 받은 결제(수금)를 맞댄다.
   *
   * <p>수금만 있고 판매가 없는 날(선수금)도, 판매만 있고 수금이 없는 날(외상)도 한 줄로 낸다 —
   * 한쪽만 있는 것이야말로 대사에서 봐야 할 것이다.
   */
  const compared = useMemo(() => {
    const m = new Map<string, CompareRow>()
    const at = (date: string, partnerId: number, partnerName: string) => {
      const key = `${date}|${partnerId}`
      const cur = m.get(key) ?? {
        key, date, partnerId, partnerName,
        saleDocNos: [], supplyAmount: 0, vatAmount: 0, saleTotal: 0,
        payDocNos: [], payTotal: 0,
      }
      m.set(key, cur)
      return cur
    }
    for (const d of sales) {
      if (d.saleDate < from || d.saleDate > to) continue
      const r = at(d.saleDate, d.partnerId, d.partnerName)
      r.saleDocNos.push(d.docNo)
      r.supplyAmount += d.supplyAmount
      r.vatAmount += d.vatAmount
      r.saleTotal += d.totalAmount
    }
    for (const p of rows) {
      if (p.settleDate < from || p.settleDate > to) continue
      // 지급(구매 대금)은 판매와 맞댈 것이 아니다 — 수금만 본다.
      if (p.typeName !== '수금') continue
      const r = at(p.settleDate, p.partnerId, p.partnerName)
      r.payDocNos.push(p.docNo)
      r.payTotal += p.amount
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.partnerName.localeCompare(b.partnerName)))
  }, [sales, rows, from, to])

  /*
   * 원본 [정렬/소계기준]. 줄이 (일자 × 거래처)라 한 거래처가 여러 줄로 흩어진다 —
   * 고르면 그 기준으로 줄을 모아 세운다.
   */
  const SUBTOTALS = ['거래처', '일자'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('거래처')

  const shown = useMemo(() => compared.filter((r) => {
    if (partner && String(r.partnerId) !== partner) return false
    if (basis !== '전체') {
      const same = Math.abs(r.saleTotal - r.payTotal) < 0.005
      if (basis === '일치' ? !same : same) return false
    }
    return true
  }).sort((a, b) => (subtotal === '거래처'
    ? a.partnerName.localeCompare(b.partnerName) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
    : 0)), [compared, partner, basis, subtotal])

  /* 그리는 줄만 자른다 — 아래 합계는 자르기 전 전부로 낸 값이다. 자른 것은 표 위에 적는다. */
  const capped = capRows(shown, 300)

  const totals = useMemo(() => shown.reduce(
    (a, r) => ({ pay: a.pay + r.payTotal, supply: a.supply + r.supplyAmount, vat: a.vat + r.vatAmount, sale: a.sale + r.saleTotal }),
    { pay: 0, supply: 0, vat: 0, sale: 0 },
  ), [shown])
  const won = (n: number) => n.toLocaleString('ko-KR')

  return (
    <EcListShell
      title="결제내역자료비교"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => {
          setFrom(init.from); setTo(init.to); setPartner(''); setBasis('전체')
        } },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={COMPARE_PICKS}
        fiscalStart={fiscalStart}
        subtotal={subtotal} subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}
      >
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                           value={partner} onChange={(v) => setPartner(v)}
                           items={pickers.partners} />
        </EcCond>
        {/* [거래처그룹1] 은 원본 판에 없다(2026-10-22 loginaa 다시 잼: 기준일자 · 거래처 · 자료기준 · 양식 · 정렬/소계기준). */}
        <EcCond label="자료기준">
          <div className="ec-pills">
            {(['전체', '일치', '불일치'] as const).map((b) => (
              <button key={b} type="button" className={`ec-pill no-ec${basis === b ? ' active' : ''}`}
                      onClick={() => setBasis(b)}>{b}</button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {/*
        * 원본 격자(2026-10-20 loginaa E040255 실측): 머리 두 줄 — [결제내역 5 | 판매전표II 5 | 차이 3] 아래
        * 결제요청일시 160 · 거래처 120 · 공급가액 80 · 부가세 74 · 합계 80 · 일자-No. · 거래처명 · 공급가액합계 ·
        * 부가세합계 · 금액합계 · 공급가액 · 부가세 · 합계(각 100). 번호 · 상태 열은 없다. 표 폭 1315 — 틀보다 넓어 옆으로 민다.
        * 결제(수금)에는 공급가액 · 부가세가 갈려 있지 않다 — 그 칸과 차이의 같은 칸은 지어내지 않고 비운다.
        */}
      <div className="overflow-x-auto">
        <EcRowCap capped={capped.capped} shown={capped.rows.length} total={capped.total}
                  hint="기간을 좁혀 보세요." />
        <table className="text-left ec-report ec-report-fixed">
          {/* 첫 머리 줄이 묶음 칸(colSpan)이라 table-fixed 는 둘째 줄 폭을 안 본다 — 열 폭은 colgroup 으로 */}
          <colgroup>
            <col className="w-[160px]" /><col className="w-[120px]" /><col className="w-[80px]" />
            <col className="w-[74px]" /><col className="w-[80px]" />
            {Array.from({ length: 8 }, (_, i) => <col key={i} className="w-[100px]" />)}
          </colgroup>
          <thead>
            {/* 원본 묶음 머리 줄은 높이 44 고정, 아랫줄 27.14(출력물 머리) */}
            <tr className="h-[44px]">
              <th colSpan={5} className="text-center">결제내역</th>
              <th colSpan={5} className="text-center">판매전표II</th>
              <th colSpan={3} className="text-center">차이</th>
            </tr>
            <tr>
              <th className="text-center">결제요청일시</th>
              <th className="text-center">거래처</th>
              <th className="text-center">공급가액</th>
              <th className="text-center">부가세</th>
              <th className="text-center">합계</th>
              <th className="text-center">일자-No.</th>
              <th className="text-center">거래처명</th>
              <th className="text-center">공급가액합계</th>
              <th className="text-center">부가세합계</th>
              <th className="text-center">금액합계</th>
              <th className="text-center">공급가액</th>
              <th className="text-center">부가세</th>
              <th className="text-center">합계</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={13} className="ec-empty">불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={13} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : capped.rows.map((r) => {
              const paid = r.payDocNos.length > 0
              const sold = r.saleDocNos.length > 0
              return (
                <tr key={r.key}>
                  <td className="text-center">{paid ? r.date.replace(/-/g, '/') : ''}</td>
                  <td>{paid ? r.partnerName : ''}</td>
                  <td className="text-right"></td>
                  <td className="text-right"></td>
                  <td className="text-right">{paid ? won(r.payTotal) : ''}</td>
                  <td className="text-center">
                    {sold ? `${dateNo(r.date, r.saleDocNos[0])}${r.saleDocNos.length > 1 ? ` 외 ${r.saleDocNos.length - 1}` : ''}` : ''}
                  </td>
                  <td>{sold ? r.partnerName : ''}</td>
                  <td className="text-right">{sold ? won(r.supplyAmount) : ''}</td>
                  <td className="text-right">{sold ? won(r.vatAmount) : ''}</td>
                  <td className="text-right">{sold ? won(r.saleTotal) : ''}</td>
                  <td className="text-right"></td>
                  <td className="text-right"></td>
                  {/* 판매 − 결제: 양수는 아직 못 받은 돈, 음수는 판 것보다 더 받은 돈(선수금) */}
                  <td className="text-right">{won(r.saleTotal - r.payTotal)}</td>
                </tr>
              )
            })}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="font-bold">
                <td colSpan={4} className="text-center">합계</td>
                <td className="text-right">{won(totals.pay)}</td>
                <td colSpan={2}></td>
                <td className="text-right">{won(totals.supply)}</td>
                <td className="text-right">{won(totals.vat)}</td>
                <td className="text-right">{won(totals.sale)}</td>
                <td colSpan={2}></td>
                <td className="text-right">{won(totals.sale - totals.pay)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}
