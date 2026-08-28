import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { ymd, INQUIRY_FULL_PICKS } from '../../components/EcPeriodPicks'

/**
 * 품질 > A/S소모현황 (이카운트 E040641 A/S소모현황)
 * A/S 수리에 소모된 부품을 품목별로 집계 — 소모수량·소모금액·해당 A/S 건수.
 * 소스: A/S 접수·수리 관리(AsManagePage)에서 등록한 소모부품(재고 차감분).
 * 백엔드 `GET /api/as-requests/parts/consumption` (품목별 집계).
 */
interface Row { itemId: number; itemName: string; asCount: number; totalQty: number; totalAmount: number }
const won = (n: number) => n.toLocaleString('ko-KR')

export default function AsConsumptionPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [keyword, setKeyword] = useState('')
  /*
   * 원본 A/S소모현황 조건 실측(사본): 접수일자 · 창고 · 프로젝트 · 수리담당자 ·
   * 접수담당자 · 수리유형 · 거래처 · 수리품목.
   *
   * <p>우리 화면은 <b>조건이 하나도 없었다</b> — 서버가 전체를 품목별로 합쳐 주는 것을
   * 그대로 받아 품목명 검색만 했다. 언제 쓴 부품인지, 어느 창고에서 나갔는지로
   * 좁힐 수가 없었다. 우리가 가진 넷을 서버에 넘긴다 — <b>합친 뒤에는 못 거른다.</b>
   * [프로젝트]·[수리유형]은 A/S 전표에 그 값이 없고, 담당자는 우리 쪽이 하나뿐이라
   * 원본의 수리·접수 둘로 가를 수 없다.
   */
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(ymd(new Date()))
  const [warehouseId, setWarehouseId] = useState('')
  const [partnerId, setPartnerId] = useState('')
  const [repairItemId, setRepairItemId] = useState('')
  const pickers = useCondPickers(['warehouses', 'partners', 'items'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const params = { from, to, warehouseId: warehouseId || undefined,
        partnerId: partnerId || undefined, repairItemId: repairItemId || undefined }
      setRows((await api.get<Row[]>('/as-requests/parts/consumption', { params })).data)
    }
    catch (err) { setError(extractErrorMessage(err)); setRows([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const shown = useMemo(() => rows.filter((r) => !keyword || r.itemName.includes(keyword)), [rows, keyword])
  const totals = useMemo(() => shown.reduce((a, r) => ({ qty: a.qty + r.totalQty, amount: a.amount + r.totalAmount }), { qty: 0, amount: 0 }), [shown])

  return (
    <EcListShell title="A/S소모현황" search={keyword} onSearchChange={setKeyword} onSearch={load}
      onNew={undefined} actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <EcStatusPanel from={from} to={to} onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_FULL_PICKS} dateLabel="접수일자">
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseId} onChange={setWarehouseId} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerId} onChange={setPartnerId} items={pickers.partners} />
        </EcCond>
        <EcCond label="수리품목" pick>
          <CodePickerField label="수리품목" hideLabel width={170} emptyLabel="전체"
                           value={repairItemId} onChange={setRepairItemId} items={pickers.items} />
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#9aa1ab' }}>A/S 수리에 소모된 부품을 품목별로 집계. 소모부품은 A/S 관리에서 등록합니다.</span>
        <span style={{ marginLeft: 'auto' }}>
          품목 <b style={{ color: '#3c4553' }}>{shown.length}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          소모수량 <b style={{ color: '#c07a00', fontSize: 14 }}>{won(totals.qty)}</b>
          <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
          소모금액 <b style={{ color: 'var(--ec-blue)', fontSize: 14 }}>{won(totals.amount)}</b>
        </span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>품목</th>
            <th style={{ textAlign: 'right' }}>A/S 건수</th>
            <th style={{ textAlign: 'right' }}>소모수량</th>
            <th style={{ textAlign: 'right' }}>소모금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.itemId}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td>{r.itemName}</td>
              <td style={{ textAlign: 'right' }}>{won(r.asCount)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: '#c07a00' }}>{won(r.totalQty)}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
        {shown.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
              <td colSpan={3} style={{ textAlign: 'right' }}>합계</td>
              <td style={{ textAlign: 'right', color: '#c07a00' }}>{won(totals.qty)}</td>
              <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.amount)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}
