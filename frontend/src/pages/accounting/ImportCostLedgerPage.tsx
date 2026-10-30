import { useEffect, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcListShell from '../../components/EcListShell'
import EcPeriodPicks, { periodOf } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner } from '../../types/api'
import { money, type ImportCostItem, type ImportLedgerRow, type ImportLot } from '../../features/importcost/api'
import { EcDateRange } from '../../components/ui/EcDateInput'

const PICKS = ['금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '전월+금월', '이번기수', '직전기수', '종료일', '최근30일'] as const

/**
 * 회계 II › 수입비용 › 수입비용출력물 › <b>수입관리대장</b>(원본 E060209) — 2026-10-14 loginaa 실측.
 *
 * 조건 관리번호 · 기준일자(처음 전월+금월) · 거래처 · 기타(잔액0포함 · 사용중단포함 켜짐). 열:
 * 관리번호 | 관리명 | 거래처 | 이월잔액 | 상품대금 | 외화금액 | 외화종류 | <비용항목 — 비용항목등록 정렬순서대로> | 합계 | 대체금액 | 잔액 |
 * 최초대금지급일 | 통관일 | 거래대금지급 | 관세사에지급, 끝 줄 '합계'. 0 은 빈칸.
 * 원본 흐름: 청구서 100,000 · 계산서 20,000 · 영수증 10,000 → 상품대금 100,000 · 직접설정가능 30,000 · 합계 130,000,
 * 대체 130,000 → 대체금액 130,000 · 잔액 빈칸 · 통관일, 대체를 지우면 잔액 130,000.
 */
export default function ImportCostLedgerPage() {
  const init = periodOf('전월+금월')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [lot, setLot] = useState('')
  const [partner, setPartner] = useState('')
  const [includeZero, setIncludeZero] = useState(true)
  const [includeInactive, setIncludeInactive] = useState(true)
  const [items, setItems] = useState<ImportCostItem[]>([])
  const [rows, setRows] = useState<ImportLedgerRow[]>([])
  const [lots, setLots] = useState<ImportLot[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [error, setError] = useState('')
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '수입관리대장', [items.length, rows.length])

  async function load() {
    setError('')
    try {
      const { data } = await api.get<{ items: ImportCostItem[]; rows: ImportLedgerRow[] }>('/import-costs/ledger', {
        params: { from, to, lotId: lot || undefined, partnerId: partner || undefined, includeZero, includeInactive },
      })
      setItems(data.items); setRows(data.rows)
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }
  useEffect(() => {
    void load()
    Promise.all([api.get<ImportLot[]>('/import-costs/lots'), api.get<Partner[]>('/partners')])
      .then(([l, p]) => { setLots(l.data); setPartners(p.data) }).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sum = (f: (r: ImportLedgerRow) => number) => rows.reduce((a, r) => a + (f(r) || 0), 0)
  const date = (d: string | null) => (d ? d.replace(/-/g, '/') : '')
  const box = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label className="inline-flex items-center gap-[3px] mr-[10px]">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {label}
    </label>
  )

  return (
    <EcListShell
      title="수입관리대장"
      searchable={false}
      onSearch={() => void load()}
      onReset={() => { setFrom(init.from); setTo(init.to); setLot(''); setPartner(''); setIncludeZero(true); setIncludeInactive(true) }}
      actions={[{ label: '인쇄' }, { label: 'Excel' }]}
    >
      <ul className="ec-cond">
        <EcCond label="관리번호" pick>
          <CodePickerField label="관리번호" hideLabel width={220} emptyLabel="전체" value={lot} onChange={setLot}
                           items={lots.map((l) => ({ value: String(l.id), code: l.code, name: l.name }))} />
        </EcCond>
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[145px]", 'aria-label': "시작일", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[145px]", 'aria-label': "종료일", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]"><EcPeriodPicks labels={PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} /></span>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner}
                           items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name }))} />
        </EcCond>
        <EcCond label="기타">
          {box('잔액0포함', includeZero, setIncludeZero)}
          {box('사용중단포함', includeInactive, setIncludeInactive)}
        </EcCond>
      </ul>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="overflow-x-auto">
        <table ref={tableRef} className="ec-report w-full">
          <thead>
            <tr>
              <th>관리번호</th><th>관리명</th><th>거래처</th><th className="text-right">이월잔액</th><th className="text-right">상품대금</th>
              <th className="text-right">외화금액</th><th>외화종류</th>
              {items.map((i) => <th key={i.id} className="text-right">{i.name}</th>)}
              <th className="text-right">합계</th><th className="text-right">대체금액</th><th className="text-right">잔액</th>
              <th className="text-center">최초대금지급일</th><th className="text-center">통관일</th>
              <th className="text-right">거래대금지급</th><th className="text-right">관세사에지급</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={14 + items.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.lotId}>
                <td>{r.lotCode}</td><td>{r.lotName}</td><td>{r.partnerName}</td>
                {/* 원본 2026-10-20: 이월잔액만은 0 도 '0' 으로 찍는다 */}
                <td className="text-right">{money(r.carry) || '0'}</td>
                <td className="text-right">{money(r.goods)}</td>
                <td className="text-right"></td><td></td>
                {items.map((i) => <td key={i.id} className="text-right">{money(r.costs[String(i.id)])}</td>)}
                <td className="text-right">{money(r.total)}</td>
                <td className="text-right">{money(r.transfer)}</td>
                <td className="text-right">{money(r.balance)}</td>
                <td className="text-center">{date(r.firstPaymentDate)}</td>
                <td className="text-center">{date(r.clearanceDate)}</td>
                <td className="text-right">{money(r.tradePaid)}</td>
                <td className="text-right">{money(r.brokerPaid)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="font-bold">
                <td colSpan={3} className="text-center">합계</td>
                <td className="text-right">{money(sum((r) => r.carry))}</td>
                <td className="text-right">{money(sum((r) => r.goods))}</td>
                <td></td><td></td>
                {items.map((i) => <td key={i.id} className="text-right">{money(sum((r) => r.costs[String(i.id)]))}</td>)}
                <td className="text-right">{money(sum((r) => r.total))}</td>
                <td className="text-right">{money(sum((r) => r.transfer))}</td>
                <td className="text-right">{money(sum((r) => r.balance))}</td>
                <td></td><td></td>
                <td className="text-right">{money(sum((r) => r.tradePaid))}</td>
                <td className="text-right">{money(sum((r) => r.brokerPaid))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </EcListShell>
  )
}
