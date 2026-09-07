import { Fragment, useEffect, useMemo, useState, useRef} from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Partner, SalesDoc } from '../../api/types'
import { loadSupplierParty, printDocuments, type DocParty, type PrintDocumentOptions } from '../../utils/printDocument'
import { partnerCodeItems } from '../../utils/codeItems'
import { useCondPickers } from '../../utils/useCondPickers'
import { subtotalBy } from '../../utils/subtotalBy'
import { dateText } from '../../utils/dateText'

/**
 * 영업 > 거래명세서인쇄 (이카운트 E040210)
 *
 * 판매 전표를 명세서 단위로 조회하고, **실제 거래명세서 서식**으로 인쇄한다
 * (공급자/공급받는자 + 품목 명세 + 합계 + 한글금액 + 결재란). 여러 건을 고르면 전표마다 페이지가 나뉜다.
 * 서식은 `utils/printDocument.ts` 템플릿을 공유한다 — 견적서·발주서도 같은 템플릿을 쓴다.
 *
 * <p>원본 결과 열 실측(사본): 거래처명 · <b>품목명[규격명]</b> · 수량 · 금액 · 부가세 ·
 * 합계 · 상세. 우리는 품목 자리에 <b>'품목수'</b> 숫자만 있었다 — 명세서를 고르는 화면에서
 * "무엇을 판 명세서인지" 를 못 보고 건수만 보는 셈이었다.
 *
 * <p>원본 [기타] 조건에 <b>미수금집계</b>가 있다. 거래명세서는 대개 "지난 미수 + 이번 거래" 를
 * 함께 찍어 보내는 문서라 이 옵션이 핵심이다. 우리에겐 아예 없었다.
 */
export default function StatementPrintPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['warehouses', 'projects', 'items', 'employees'])
  const [docs, setDocs] = useState<SalesDoc[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  /** 원본 거래명세서인쇄 조건의 [거래처관리담당자]. 거래처에 달려 있다. */
  const [partnerManager, setPartnerManager] = useState('')
  const [supplier, setSupplier] = useState<DocParty | null>(null)
  /*
   * 원본 조건 판 실측(사본 · 거래명세서인쇄):
   *   기준일자(금월(~오늘)) · [내.외자구분] 전체 | 내자 | 외자 · 창고 · 프로젝트 ·
   *   거래처 · 품목 · 담당자
   *
   * 우리는 거래처와 날짜 두 칸이 전부였고 기간 빠른선택도 없었다.
   * 내·외자구분은 우리 판매전표에 그 개념이 없어 칸을 만들지 않는다.
   */
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const init = periodOf('금월(~오늘)')!
  const [fromDate, setFromDate] = useState(init.from)
  const [toDate, setToDate] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [item, setItem] = useState('')
  const [employee, setEmployee] = useState('')
  const [checked, setChecked] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  /** 원본 [기타] 미수금집계. 켜면 목록과 인쇄물에 그 거래처의 미수금을 함께 싣는다. */
  const [withReceivable, setWithReceivable] = useState(false)
  const [balances, setBalances] = useState<Map<number, number>>(new Map())
  /** 품목을 펼쳐 본 명세서 */
  const [openId, setOpenId] = useState<number | null>(null)

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

  /**
   * 미수금은 <b>기준일자 끝</b> 시점의 채권 잔액이다. 지금 시점으로 잡으면
   * 지난달 명세서를 다시 뽑을 때 그 뒤에 들어온 수금까지 빠져 숫자가 달라진다.
   */
  useEffect(() => {
    if (!withReceivable) return
    api.get<{ partnerId: number; receivable: number }[]>('/ledger/partner-balances', { params: { asOf: toDate } })
      .then((r) => setBalances(new Map(r.data.map((b) => [b.partnerId, b.receivable]))))
      .catch(() => setBalances(new Map()))
  }, [withReceivable, toDate])

  /*
   * 원본 [정렬/소계기준]. 명세서를 뽑기 전에 <b>어느 거래처에 얼마를 보내는지</b>를
   * 눈으로 모아 봐야 하는데, 줄이 전표마다 하나씩이라 같은 거래처가 흩어져 있었다.
   */
  const SUBTOTALS = ['거래처', '거래처관리담당자', '창고'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('거래처')

  const selectedPartner = partners.find((p) => p.id === partnerId)
  const shown = docs.filter((d) => {
    if (selectedPartner && d.partnerId !== selectedPartner.id) return false
    if (fromDate && d.saleDate < fromDate) return false
    if (toDate && d.saleDate > toDate) return false
    if (keyword && !(d.partnerName.includes(keyword) || d.docNo.includes(keyword))) return false
    if (warehouse && !(d.warehouseName ?? '').includes(warehouse)) return false
    if (partnerManager && !(partners.find((p) => p.id === d.partnerId)?.manager ?? '').includes(partnerManager)) return false
    if (project && !(d.projectName ?? '').includes(project)) return false
    if (employee && !(d.employeeName ?? '').includes(employee)) return false
    if (item && !d.lines.some((l) => `${l.itemCode ?? ''} ${l.itemName}`.includes(item))) return false
    return true
  })
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
      /*
       * 미수금집계를 켜면 명세서 아래에 지난 미수와 이번 거래를 합쳐 찍는다.
       * 받는 쪽이 "그래서 얼마를 보내면 되나" 를 이 한 줄에서 안다.
       */
      footNote: withReceivable && balances.has(d.partnerId)
        ? `미수금 ${Math.round(balances.get(d.partnerId) ?? 0).toLocaleString('ko-KR')}원 (기준일 ${toDate}) · `
          + `이번 거래 ${Math.round(d.supplyAmount + d.vatAmount).toLocaleString('ko-KR')}원. `
          + '위와 같이 거래하였음을 확인합니다.'
        : '위와 같이 거래하였음을 확인합니다.',
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


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '거래명세서인쇄', [])

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

      <EcStatusPanel
        from={fromDate} to={toDate}
        onPeriod={(r) => { setFromDate(r.from); setToDate(r.to) }}
        picks={STATUS_PICKS}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouse} onChange={(v) => setWarehouse(v)}
                           items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel value={partnerId === '' ? '' : String(partnerId)} width={220}
                           onChange={(v) => setPartnerId(v ? Number(v) : '')}
                           items={partnerCodeItems(partners)} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체"
                           value={employee} onChange={(v) => setEmployee(v)}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={200} emptyLabel="전체"
                           value={partnerManager} onChange={(v) => setPartnerManager(v)}
                           items={[...new Set(partners.map((p) => p.manager).filter(Boolean))]
                             .map((m) => ({ value: m as string, name: m as string }))} />
        </EcCond>
        {/* 원본 [정렬/소계기준]. 데이터 보기형식 앞줄이다(사본 실측). */}
        <EcCond label="기타">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={withReceivable} onChange={(e) => setWithReceivable(e.target.checked)} />
            미수금집계
          </label>
        </EcCond>
        <EcCond label="정렬/소계기준">
          <div className="ec-pills">
            {SUBTOTALS.map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${subtotal === v ? ' active' : ''}`}
                      onClick={() => setSubtotal(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        명세서 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        {checked.length > 0 && <> · 선택 <b style={{ color: 'var(--ec-blue)' }}>{checked.length}</b>건</>}
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        합계 <b style={{ color: 'var(--ec-blue-dark)', fontSize: 14 }}>{total.toLocaleString('ko-KR')}</b>
      </div>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}>
              <input type="checkbox" checked={shown.length > 0 && checked.length === shown.length}
                     onChange={(e) => setChecked(e.target.checked ? shown.map((d) => d.id) : [])} />
            </th>
            <th style={{ width: 100 }}>일자</th>
            <th style={{ width: 160 }}>명세서번호</th>
            <th style={{ width: 150 }}>거래처명</th>
            <th>품목명[규격명]</th>
            <th style={{ width: 80, textAlign: 'right' }}>수량</th>
            <th style={{ width: 120, textAlign: 'right' }}>금액</th>
            <th style={{ width: 100, textAlign: 'right' }}>부가세</th>
            <th style={{ width: 120, textAlign: 'right' }}>합계</th>
            {withReceivable && <th style={{ width: 120, textAlign: 'right' }}>미수금</th>}
            <th style={{ width: 100, textAlign: 'center' }}>상세</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={withReceivable ? 11 : 10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={withReceivable ? 11 : 10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((d) => (
            <Fragment key={d.id}>
            <tr>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.includes(d.id)} onChange={() => toggle(d.id)} />
              </td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(d.saleDate)}</td>
              <td style={{ fontFamily: 'monospace' }}>{d.docNo}</td>
              <td>{d.partnerName}</td>
              {/* 원본은 품목명[규격명] 을 이 자리에 적는다. 여러 줄이면 첫 품목 외 n. */}
              <td>
                {d.lines.length === 0 ? <span style={{ color: '#c9ced6' }}>-</span> : (
                  <>
                    {d.lines[0].itemName}
                    {d.lines[0].spec && <span style={{ color: '#8a929c' }}>[{d.lines[0].spec}]</span>}
                    {d.lines.length > 1 && <span style={{ color: '#8a929c' }}> 외 {d.lines.length - 1}</span>}
                  </>
                )}
              </td>
              <td style={{ textAlign: 'right' }}>
                {d.lines.reduce((n, l) => n + l.quantity, 0).toLocaleString('ko-KR')}
              </td>
              <td style={{ textAlign: 'right' }}>{d.supplyAmount.toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'right', color: '#8a929c' }}>{d.vatAmount.toLocaleString('ko-KR')}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{d.totalAmount.toLocaleString('ko-KR')}</td>
              {withReceivable && (
                <td style={{ textAlign: 'right', color: (balances.get(d.partnerId) ?? 0) > 0 ? '#c60a2e' : '#8a929c' }}>
                  {balances.has(d.partnerId)
                    ? Math.round(balances.get(d.partnerId) ?? 0).toLocaleString('ko-KR')
                    : '-'}
                </td>
              )}
              <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                <button onClick={() => setOpenId(openId === d.id ? null : d.id)}
                        style={{ color: 'var(--ec-blue)', marginRight: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                  {openId === d.id ? '접기' : '상세'}
                </button>
                <button className="ec-btn" style={{ height: 20, padding: '0 6px' }}
                        onClick={() => printDocuments([toDocument(d)])}>인쇄</button>
              </td>
            </tr>
            {openId === d.id && d.lines.map((l, k) => (
              <tr key={`${d.id}-${k}`} style={{ background: '#fafbfc' }}>
                <td colSpan={4}></td>
                <td style={{ paddingLeft: 18, color: '#5a626e' }}>
                  └ {l.itemName}{l.spec ? `[${l.spec}]` : ''}
                </td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{l.quantity.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right', color: '#5a626e' }}>{l.supplyAmount.toLocaleString('ko-KR')}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{(l.vatAmount ?? 0).toLocaleString('ko-KR')}</td>
                <td colSpan={withReceivable ? 3 : 2}></td>
              </tr>
            ))}
          </Fragment>
          ))}
        </tbody>
      </table>

      {shown.length > 0 && (() => {
        const managerOf = new Map(partners.map((p) => [p.id, p.manager ?? '']))
        const groups = subtotalBy(shown,
          (d) => (subtotal === '거래처관리담당자' ? (managerOf.get(d.partnerId) || null)
            : subtotal === '창고' ? d.warehouseName : d.partnerName),
          { supply: (d) => d.supplyAmount, vat: (d) => d.vatAmount })
        return (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th style={{ width: 90, textAlign: 'right' }}>건수</th>
                <th style={{ width: 150, textAlign: 'right' }}>공급가액</th>
                <th style={{ width: 130, textAlign: 'right' }}>부가세</th>
                <th style={{ width: 150, textAlign: 'right' }}>합계</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td style={{ fontWeight: 600 }}>{g.label}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.sums.supply.toLocaleString('ko-KR')}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.sums.vat.toLocaleString('ko-KR')}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>
                      {(g.sums.supply + g.sums.vat).toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      })()}
    </EcListShell>
  )
}
