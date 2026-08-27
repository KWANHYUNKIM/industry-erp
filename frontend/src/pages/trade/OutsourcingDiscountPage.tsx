import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import type { PurchaseDoc } from '../../api/types'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'

/**
 * 생산/외주 > 외주비할인현황.
 *
 * <p><b>이름만 '할인'이고 하는 일은 다르다.</b> 원본 사본의 표 열 id 가 그것을 말해 준다 —
 * CUST(거래처명) · ORG_AMT(생산금액) · REQ_AMT(회계반영금액) · ORG_SUB_REQ(차액) · REMARKS(적요).
 * 즉 <b>외주 생산금액 중 아직 회계로 넘어가지 않은 금액</b>을 일자·거래처로 묶어 보는 화면이다.
 * 메뉴에서도 [지급현황] · [외주비할인현황] · [외주비회계반영] 이 나란히 붙어 있다.
 *
 * <p>우리 화면은 "품목 기준단가 대비 실매입가 차이"를 할인이라 부르며 라인별로 늘어놓았다.
 * 이름은 같은데 뜻이 달랐고, 게다가 기준단가로 <b>판매단가</b>를 읽었다 — 매입가가 판매가보다
 * 높은 것이 이상할 이유가 없어서 개발 자료가 통째로 '할증' 으로 찍혔다. 같은 실수를 서버의
 * 구매할인현황에서 이미 한 번 고쳤는데, 이 화면은 서버를 안 쓰고 프론트에서 따로 계산해서
 * 고친 것이 여기까지 오지 않았다.
 *
 * <p>원본 조건 판 실측(사본): 기준일자(금월(~오늘)) · 창고 · 거래처 · 거래처관리담당자 ·
 * <b>할인금액</b> · 양식 · 정렬/소계기준.
 * '할인금액' 은 원본 그대로 두되 이 화면에서 뜻하는 값(차액)의 하한으로 쓴다.
 *
 * <p>외주 전용 도메인이 없으므로 외주비는 <b>구매전표</b>로 본다. 회계반영은 전표 단위라
 * 반영금액은 '반영됐으면 전액, 아니면 0' 이다 — 부분반영이라는 것이 없다.
 */
interface Row {
  date: string
  partner: string
  warehouse: string | null
  employee: string | null
  /** 외주(구매) 공급가액 합 */
  orgAmount: number
  /** 그중 회계로 넘어간 금액 */
  reflectedAmount: number
  remarks: string[]
  docNos: string[]
}

export default function OutsourcingDiscountPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['warehouses', 'partners', 'employees'])
  const [docs, setDocs] = useState<PurchaseDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [employee, setEmployee] = useState('')
  const [minDiff, setMinDiff] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<PurchaseDoc[]>('/purchases')
      setDocs(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  /** 원본은 한 줄이 <b>일자 × 거래처</b>다. 전표가 여럿이면 합쳐 한 줄로 낸다. */
  const rows = useMemo(() => {
    const m = new Map<string, Row>()
    for (const d of docs) {
      if (d.purchaseDate < from || d.purchaseDate > to) continue
      const key = `${d.purchaseDate}|${d.partnerName}`
      const cur = m.get(key) ?? {
        date: d.purchaseDate, partner: d.partnerName,
        warehouse: d.warehouseName, employee: d.employeeName,
        orgAmount: 0, reflectedAmount: 0, remarks: [], docNos: [],
      }
      cur.orgAmount += d.supplyAmount
      if (d.accountingReflected) cur.reflectedAmount += d.supplyAmount
      if (d.remark) cur.remarks.push(d.remark)
      cur.docNos.push(d.docNo)
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.partner.localeCompare(b.partner)))
  }, [docs, from, to])

  const min = Number(minDiff)
  const shown = rows.filter((r) => {
    if (keyword && !r.partner.includes(keyword)) return false
    if (warehouse && !(r.warehouse ?? '').includes(warehouse)) return false
    if (employee && !(r.employee ?? '').includes(employee)) return false
    if (minDiff && !Number.isNaN(min) && r.orgAmount - r.reflectedAmount < min) return false
    return true
  })

  const [view, setView] = useState<'표' | '그래프'>('표')
  /*
   * 원본 [그래프로 보기]. 외주비는 <b>어느 외주처에 얼마가 아직 회계로 안 넘어갔나</b> 를
   * 보는 화면이다. 그래서 공급가액이 아니라 <b>미반영 금액</b>을 그린다 —
   * 총액을 그리면 이미 처리한 것과 남은 것이 섞여 이 화면을 여는 이유가 사라진다.
   */
  const chartRows = useMemo(
    () => shown.map((r) => ({ label: r.partner, value: r.orgAmount - r.reflectedAmount })),
    [shown])

  const totals = shown.reduce(
    (a, r) => ({ org: a.org + r.orgAmount, ref: a.ref + r.reflectedAmount }),
    { org: 0, ref: 0 },
  )
  const won = (n: number) => n.toLocaleString('ko-KR')
  /** 원본 [월/일] 은 연도를 빼고 적는다(조회 기간이 이미 연도를 말해 준다). */
  const monthDay = (d: string) => d.slice(5).replace('-', '/')

  return (
    <EcListShell
      title="외주비할인현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => {
          setFrom(init.from); setTo(init.to)
          setKeyword(''); setWarehouse(''); setEmployee(''); setMinDiff('')
        } },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        view={view} onViewChange={setView}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={warehouse} onChange={(v) => setWarehouse(v)}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={keyword} onChange={(v) => setKeyword(v)}
                           items={pickers.partners} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={200} placeholder="전체" emptyLabel="전체"
                           value={employee} onChange={(v) => setEmployee(v)}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="할인금액">
          <input className="ec-input" type="number" placeholder="차액 이상" value={minDiff}
                 onChange={(e) => setMinDiff(e.target.value)} style={{ width: 130, textAlign: 'right' }} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {shown.length}줄
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        회계로 안 넘어간 금액 <b style={{ color: totals.org - totals.ref > 0 ? '#c60a2e' : '#1c7c3c', fontSize: 14 }}>
          {won(totals.org - totals.ref)}
        </b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 원" emptyText="조회된 외주비가 없습니다." />
      ) : (
      <table className="ec-grid w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 80 }}>월/일</th>
            <th>거래처명</th>
            <th style={{ width: 130, textAlign: 'right' }}>생산금액</th>
            <th style={{ width: 130, textAlign: 'right' }}>회계반영금액</th>
            <th style={{ width: 130, textAlign: 'right' }}>차액</th>
            <th>적요</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => {
            const diff = r.orgAmount - r.reflectedAmount
            return (
              <tr key={`${r.date}-${r.partner}`}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{monthDay(r.date)}</td>
                <td>{r.partner}</td>
                <td style={{ textAlign: 'right' }}>{won(r.orgAmount)}</td>
                <td style={{ textAlign: 'right', color: r.reflectedAmount === 0 ? '#c9ced6' : undefined }}>
                  {won(r.reflectedAmount)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: diff > 0 ? '#c60a2e' : '#8a929c' }}>{won(diff)}</td>
                <td style={{ color: '#5a626e' }} title={r.docNos.join(', ')}>
                  {r.remarks.length > 0 ? r.remarks.join(' / ') : r.docNos.join(', ')}
                </td>
              </tr>
            )
          })}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right' }}>{won(totals.org)}</td>
              <td style={{ textAlign: 'right' }}>{won(totals.ref)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue-dark)' }}>{won(totals.org - totals.ref)}</td>
              <td></td>
            </tr>
          </tfoot>
        )}
      </table>
      )}
    </EcListShell>
  )
}
