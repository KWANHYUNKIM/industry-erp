import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useNavigate } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { printDocuments } from '../../utils/printDocument'

/**
 * 생산관리 > 생산입고조회 — 완제품 생산입고 내역 조회 (/api/productions 연동).
 *
 * 원본 열 실측(사본): 일자-No. · <b>생산된공장명</b> · <b>받는창고명</b> · 품목명[규격] ·
 * 수량 · 담당자명. 우리는 [생산된공장]과 [담당자]가 빠져 있어 붙인다 — 자재가 어느 공장에서
 * 빠졌는지 여기서 못 보면 공장별 재고가 왜 줄었는지 되짚을 자리가 없다.
 */
interface Row {
  id: number
  prodNo: string
  workOrderNo: string
  productCode: string
  productName: string
  productUnit: string
  warehouseName: string
  fromWarehouseName: string | null
  producedQty: number
  productionDate: string
  createdBy: string | null
}

/**
 * 원본 생산입고조회 격자의 마지막 열 <b>[인쇄]</b> — 그 한 건을 생산입고증으로 찍는다.
 * 금액 칸은 안 그린다(생산입고는 사내 이동이라 금액이 없다 — 0 으로 채우면 0원 거래로 읽힌다).
 */
async function printOne(r: Row) {
  await printDocuments([{
    title: '생산입고증',
    docNo: r.prodNo,
    docDate: r.productionDate,
    hideAmounts: true,
    hideParties: true,
    supplier: { label: '', name: '' },
    customer: { label: '', name: '' },
    extra: [
      { label: '생산된공장', value: r.fromWarehouseName ?? r.warehouseName },
      { label: '받는창고', value: r.warehouseName },
      { label: '작업지시서', value: r.workOrderNo },
      { label: '담당자', value: r.createdBy },
    ],
    lines: [{
      itemCode: r.productCode, itemName: r.productName, unit: r.productUnit,
      quantity: r.producedQty, unitPrice: 0, supplyAmount: 0, vatAmount: 0,
    }],
  }])
}

export default function ReceiptInquiryPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<Row[]>('/productions')
      setRows([...res.data].sort((a, b) => (a.productionDate < b.productionDate ? 1 : a.productionDate > b.productionDate ? -1 : b.id - a.id)))
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  /**
   * 원본은 목록 첫 칸에서 줄을 골라 [선택삭제] 한다(사본 실측: CHK_H 열).
   * 우리는 줄마다 지우거나 아예 못 지웠다 — 잘못 넣은 열 건을 치우려면 열 번 눌러야 했다.
   */
  const [checked, setChecked] = useState<Set<number>>(new Set())

  async function removeChecked() {
    const targets = shown.filter((x) => checked.has(x.id))
    if (targets.length === 0) { setError('지울 줄을 고르세요.'); return }
    if (!confirm(`고른 ${targets.length}건을 삭제할까요? 생산으로 늘었던 완제품과 줄었던 자재가 되돌아갑니다.`)) return
    setError('')
    const results = await Promise.allSettled(targets.map((x) => api.delete(`/productions/${x.id}`)))
    const failed = results.filter((x) => x.status === 'rejected').length
    setChecked(new Set())
    await load()
    if (failed > 0) setError(`${targets.length - failed}건 삭제, ${failed}건 실패(참조 중이면 못 지운다).`)
  }

  const shown = rows.filter((r) => !keyword || r.productName.includes(keyword) || r.prodNo.includes(keyword) || r.workOrderNo.includes(keyword))

  return (
    <EcListShell
      title="생산입고조회"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      /*
       * 원본 생산입고조회의 버튼은 신규(F2) · 진행상태변경 · 보내기 · 인쇄 · 바코드(품목) ·
       * 전자결재 · 선택삭제 · 이력조회다. 우리에겐 [신규(F2)] 자리가 비어 있었다 —
       * 조회에서 "하나 더 넣자" 가 되면 메뉴를 다시 뒤져야 했다.
       * 원본의 신규는 생산입고 I(BOM기준소모)로 간다.
       */
      onNew={() => navigate('/production/receipt-bom')}
      actions={[{ label: '검색(F8)', onClick: load },
                { label: `선택삭제${checked.size ? ` (${checked.size})` : ''}`, onClick: removeChecked },
                { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34, textAlign: 'center' }}>
              <input type="checkbox"
                     checked={shown.length > 0 && shown.every((x) => checked.has(x.id))}
                     onChange={() => setChecked(
                       shown.every((x) => checked.has(x.id)) ? new Set() : new Set(shown.map((x) => x.id)),
                     )} />
            </th>
            <th>일자</th>
            <th>입고번호</th>
            <th>작업지시번호</th>
            <th>완제품명</th>
            <th style={{ textAlign: 'right' }}>입고수량</th>
            <th>단위</th>
            <th>생산된공장</th>
            <th>받는창고</th>
            <th>담당자</th>
            {/* 원본 생산입고조회의 마지막 열 [인쇄]. */}
            <th style={{ width: 60, textAlign: 'center' }}>인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={11} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                  return next
                })} />
              </td>
              <td style={{ fontFamily: 'monospace' }}>{r.productionDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.prodNo}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.workOrderNo}</td>
              <td>[{r.productCode}] {r.productName}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.producedQty.toLocaleString()}</td>
              <td>{r.productUnit}</td>
              <td>{r.fromWarehouseName ?? r.warehouseName}</td>
              <td>{r.warehouseName}</td>
              <td>{r.createdBy ?? ''}</td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => printOne(r)} style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>인쇄</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
