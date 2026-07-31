import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, SalesDoc } from '../../api/types'
import { loadSupplierParty, printDocuments, type DocParty, type PrintDocumentOptions } from '../../utils/printDocument'

/**
 * 영업 > 거래명세서인쇄 (이카운트 E040210)
 *
 * 판매 전표를 명세서 단위로 조회하고, **실제 거래명세서 서식**으로 인쇄한다
 * (공급자/공급받는자 + 품목 명세 + 합계 + 한글금액 + 결재란). 여러 건을 고르면 전표마다 페이지가 나뉜다.
 * 서식은 `utils/printDocument.ts` 템플릿을 공유한다 — 견적서·발주서도 같은 템플릿을 쓴다.
 */
export default function StatementPrintPage() {
  const [docs, setDocs] = useState<SalesDoc[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [supplier, setSupplier] = useState<DocParty | null>(null)
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [checked, setChecked] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [salesRes, partnerRes] = await Promise.all([
        api.get<SalesDoc[]>('/sales'),
        api.get<Partner[]>('/partners'),
      ])
      setPartners(partnerRes.data)
      const sorted = [...salesRes.data].sort((a, b) =>
        a.saleDate < b.saleDate ? 1 : a.saleDate > b.saleDate ? -1 : b.id - a.id)
      setDocs(sorted)
      setChecked([])
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    loadSupplierParty().then(setSupplier)
  }, [])

  const selectedPartner = partners.find((p) => p.id === partnerId)
  const shown = docs.filter((d) =>
    (!selectedPartner || d.partnerId === selectedPartner.id)
    && (!fromDate || d.saleDate >= fromDate)
    && (!toDate || d.saleDate <= toDate)
    && (!keyword || d.partnerName.includes(keyword) || d.docNo.includes(keyword)))
  const total = useMemo(() => shown.reduce((s, d) => s + d.supplyAmount + d.vatAmount, 0), [shown])

  /** 판매 전표 → 거래명세서 서식 */
  function toDocument(d: SalesDoc): PrintDocumentOptions {
    const p = partners.find((x) => x.id === d.partnerId)
    return {
      title: '거래명세서',
      docNo: d.docNo,
      docDate: d.saleDate,
      supplier: supplier ?? { label: '공급자', name: '(회사정보 미등록)' },
      customer: {
        label: '공급받는자',
        name: d.partnerName,
        bizRegNo: p?.bizRegNo,
        ceo: p?.ceoName,
        bizType: p?.bizType,
        bizItem: p?.bizItem,
        tel: p?.phone,
        address: p?.address,
      },
      extra: [
        { label: '창고', value: d.warehouseName },
        { label: '담당', value: d.employeeName },
      ],
      remark: d.remark,
      lines: d.lines.map((l) => ({
        itemCode: l.itemCode,
        itemName: l.itemName,
        spec: l.spec,
        unit: l.unit,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        supplyAmount: l.supplyAmount,
        vatAmount: l.vatAmount,
      })),
      footNote: '위와 같이 거래하였음을 확인합니다.',
    }
  }

  async function printSelected() {
    const targets = shown.filter((d) => checked.includes(d.id))
    if (targets.length === 0) return alert('인쇄할 명세서를 선택하세요.')
    await printDocuments(targets.map(toDocument))
  }

  async function printAllShown() {
    if (shown.length === 0) return alert('인쇄할 명세서가 없습니다.')
    if (shown.length > 30 && !window.confirm(`${shown.length}건을 한 번에 인쇄합니다. 계속할까요?`)) return
    await printDocuments(shown.map(toDocument))
  }

  const toggle = (id: number) =>
    setChecked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))

  return (
    <EcListShell
      title="거래명세서인쇄"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[
        { label: '명세서 인쇄(선택)', onClick: printSelected, primary: true },
        { label: '조회분 전체 인쇄', onClick: printAllShown },
        { label: '새로고침', onClick: load },
        { label: 'Excel' },
      ]}
      help={
        <p style={{ fontSize: 12.5, lineHeight: 1.7 }}>
          판매 전표를 거래명세서 서식(공급자·공급받는자·품목 명세·합계·한글금액·결재란)으로 인쇄합니다.
          여러 건을 고르면 전표마다 페이지가 나뉩니다. 공급자 정보는 <b>Self-Customizing &gt; 회사정보관리</b>에서
          등록한 내용을 씁니다.
        </p>
      }
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {!supplier && !loading && (
        <p style={{ background: '#fff7e6', color: '#8a5a00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>
          회사정보가 등록돼 있지 않아 공급자 칸이 비어 인쇄됩니다. Self-Customizing &gt; 회사정보관리에서 먼저 등록하세요.
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <CodePickerField label="거래처" value={partnerId === '' ? '' : String(partnerId)} width={180}
                         onChange={(v) => setPartnerId(v ? Number(v) : '')}
                         items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name, sub: p.typeName }))} />
        <span style={{ fontSize: 12.5, color: '#5a626e', marginLeft: 6 }}>기간</span>
        <input type="date" className="ec-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <span style={{ color: '#9aa1ab' }}>~</span>
        <input type="date" className="ec-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#5a626e' }}>
          {checked.length > 0 && <>선택 <b style={{ color: 'var(--ec-blue)' }}>{checked.length}</b>건 · </>}
          합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString()}</b>
        </span>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}>
              <input type="checkbox" checked={shown.length > 0 && checked.length === shown.length}
                     onChange={(e) => setChecked(e.target.checked ? shown.map((d) => d.id) : [])} />
            </th>
            <th style={{ width: 110 }}>일자</th>
            <th style={{ width: 170 }}>명세서번호</th>
            <th>거래처</th>
            <th style={{ width: 80, textAlign: 'right' }}>품목수</th>
            <th style={{ width: 120, textAlign: 'right' }}>공급가액</th>
            <th style={{ width: 110, textAlign: 'right' }}>부가세</th>
            <th style={{ width: 120, textAlign: 'right' }}>합계</th>
            <th style={{ width: 70, textAlign: 'center' }}>인쇄</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>발행할 명세서가 없습니다.</td></tr>
          ) : shown.map((d) => (
            <tr key={d.id}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.includes(d.id)} onChange={() => toggle(d.id)} />
              </td>
              <td style={{ fontFamily: 'monospace' }}>{d.saleDate}</td>
              <td style={{ fontFamily: 'monospace' }}>{d.docNo}</td>
              <td>{d.partnerName}</td>
              <td style={{ textAlign: 'right' }}>{d.lines.length.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{d.supplyAmount.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{d.vatAmount.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{d.totalAmount.toLocaleString()}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 6px' }}
                        onClick={() => printDocuments([toDocument(d)])}>인쇄</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
