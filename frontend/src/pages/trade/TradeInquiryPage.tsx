import { useEffect, useMemo, useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CustomFieldsPanel from '../../components/CustomFieldsPanel'
import EvidencePanel from '../../components/EvidencePanel'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import type { SalesConfirmStatus, SalesDoc, PurchaseDoc, Partner, TradeLine } from '../../api/types'

/** 판매조회 / 구매조회 — 전표(문서) 단위 조회. 행 클릭 시 품목 상세 펼침. */
type Mode = 'sales' | 'purchase'
interface NormalDoc {
  id: number; docNo: string; partnerId: number; partnerName: string; warehouseName: string
  date: string; supplyAmount: number; vatAmount: number; totalAmount: number
  createdBy: string | null; remark: string | null
  confirmStatus?: SalesConfirmStatus; confirmStatusName?: string
  // 라인은 공용 타입을 그대로 쓴다 — 여기서 좁게 다시 적어 두면 백엔드가 필드를 늘려도 화면이 못 본다
  // (실제로 lotNo·부대비용·불러온전표가 늘었는데 이 화면만 모르고 있었다).
  lines: TradeLine[]
}

// 판매조회 탭 (이카운트). '결재중'은 전자결재 진행중, '확인/미확인'은 확인상태.
const SALES_TABS = ['전체', '결재중', '미확인', '확인'] as const
type SalesTab = (typeof SALES_TABS)[number]
const TAB_STATUS: Record<Exclude<SalesTab, '전체'>, SalesConfirmStatus> = {
  결재중: 'IN_APPROVAL',
  미확인: 'UNCONFIRMED',
  확인: 'CONFIRMED',
}
const confirmColor = (s?: SalesConfirmStatus) =>
  s === 'CONFIRMED' ? '#1c7c3c' : s === 'IN_APPROVAL' ? 'var(--ec-blue)' : '#8a929c'

const won = (n: number) => n.toLocaleString('ko-KR')
const CFG: Record<Mode, { title: string; url: string; dateKey: 'saleDate' | 'purchaseDate'; partnerLabel: string; accent: string }> = {
  sales: { title: '판매조회', url: '/sales', dateKey: 'saleDate', partnerLabel: '매출처', accent: 'var(--ec-blue)' },
  purchase: { title: '구매조회', url: '/purchases', dateKey: 'purchaseDate', partnerLabel: '매입처', accent: '#a5561b' },
}

export default function TradeInquiryPage({ mode }: { mode: Mode }) {
  const cfg = CFG[mode]
  const isSales = mode === 'sales'
  const navigate = useNavigate()
  const [docs, setDocs] = useState<NormalDoc[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState<SalesTab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  // 이번 세션에서 세금계산서를 발행한 전표 id (버튼 중복 클릭 방지)
  const [taxIssued, setTaxIssued] = useState<Set<number>>(new Set())
  // 명세서 인쇄용 — 우리 회사(공급자) 정보와 거래처 상세
  const [company, setCompany] = useState<DocParty | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])

  function load() {
    setError('')
    api.get<(SalesDoc | PurchaseDoc)[]>(cfg.url)
      .then((res) => setDocs(res.data.map((d) => ({
        id: d.id, docNo: d.docNo, partnerId: d.partnerId, partnerName: d.partnerName, warehouseName: d.warehouseName,
        date: (d as never)[cfg.dateKey] as string,
        supplyAmount: d.supplyAmount, vatAmount: d.vatAmount, totalAmount: d.totalAmount,
        createdBy: d.createdBy, remark: d.remark,
        confirmStatus: (d as SalesDoc).confirmStatus,
        confirmStatusName: (d as SalesDoc).confirmStatusName,
        // 라인은 그대로 넘긴다. 필드를 골라 담으면 백엔드가 늘린 것을 화면이 못 본다.
        lines: d.lines,
      }))))
      .catch((err) => setError(extractErrorMessage(err)))
  }

  useEffect(() => {
    loadSupplierParty().then(setCompany)
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    setTab('전체')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.url, cfg.dateKey])

  async function confirmAct(d: NormalDoc, kind: 'confirm' | 'unconfirm') {
    try {
      await api.post(`/sales/${d.id}/${kind}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /** 전표 수정 — 입력 화면을 수정 모드로 연다. 원본도 조회에서 전표번호를 누르면 입력 팝업이 뜬다. */
  function editDoc(d: NormalDoc) {
    navigate(`${isSales ? '/sales/sell' : '/sales/buy'}?edit=${d.id}`)
  }

  /**
   * 전표 삭제. 서버가 재고를 되돌리고 지운다. 회계반영·확인·세금계산서 발행 전표는 서버가 거부한다.
   * 되돌릴 수 없는 조작이라 한 번 더 묻는다.
   */
  async function deleteDoc(d: NormalDoc) {
    const ok = window.confirm(
      `${d.docNo} 전표를 삭제합니다.\n\n`
      + `${isSales ? '출고' : '입고'}했던 재고가 되돌아갑니다 (품목 ${d.lines.length}건, 합계 ${won(d.totalAmount)}원).\n`
      + '이 작업은 되돌릴 수 없습니다. 진행할까요?',
    )
    if (!ok) return
    try {
      await api.delete(`${cfg.url}/${d.id}`)
      setOpenId(null)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  async function issueTaxInvoice(d: NormalDoc) {
    try {
      await api.post('/tax-invoices', { type: isSales ? 'SALES' : 'PURCHASE', sourceId: d.id })
      setTaxIssued((s) => new Set(s).add(d.id))
      alert(`${d.docNo} 세금계산서를 발행했습니다. (${isSales ? '매출' : '매입'} 세금계산서 화면에서 진행단계 관리)`)
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /**
   * 전표를 명세서 서식으로 인쇄한다.
   * 판매는 우리가 공급자, 구매는 <b>거래처가 공급자</b>다 — 양쪽을 바꿔 넣어야 서식이 사실과 맞는다.
   */
  async function printStatement(d: NormalDoc) {
    const p = partners.find((x) => x.id === d.partnerId)
    const partnerParty = {
      label: isSales ? '공급받는자' : '공급자',
      name: d.partnerName,
      bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem,
      tel: p?.phone, address: p?.address,
    }
    const ourParty: DocParty = company
      ? { ...company, label: isSales ? '공급자' : '공급받는자' }
      : { label: isSales ? '공급자' : '공급받는자', name: '(회사정보 미등록)' }

    await printDocuments([{
      title: isSales ? '거래명세서' : '매입명세서',
      docNo: d.docNo,
      docDate: d.date,
      supplier: isSales ? ourParty : partnerParty,
      customer: isSales ? partnerParty : ourParty,
      extra: [{ label: '창고', value: d.warehouseName }, { label: '담당', value: d.createdBy }],
      remark: d.remark,
      lines: d.lines,
      footNote: isSales ? '위와 같이 거래하였음을 확인합니다.' : undefined,
    }])
  }

  const shown = useMemo(() => docs
    .filter((d) => !keyword || d.partnerName.includes(keyword) || d.docNo.includes(keyword))
    .filter((d) => !from || d.date >= from)
    .filter((d) => !to || d.date <= to)
    .filter((d) => !isSales || tab === '전체' || d.confirmStatus === TAB_STATUS[tab])
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), [docs, keyword, from, to, tab, isSales])

  const tabCount = (t: SalesTab) =>
    docs.filter((d) => t === '전체' || d.confirmStatus === TAB_STATUS[t]).length

  const totals = shown.reduce((a, d) => ({ supply: a.supply + d.supplyAmount, vat: a.vat + d.vatAmount, total: a.total + d.totalAmount }), { supply: 0, vat: 0, total: 0 })

  // 판매조회는 확인상태·확인버튼 2컬럼 + 세금계산서 1컬럼, 구매조회는 세금계산서 1컬럼이 더 붙는다.
  // 번호 + 전표번호·일자·거래처·품목명(요약)·창고·공급가액·부가세·합계·담당·불러온전표·세금계산서
  // + 판매만 있는 확인상태·확인 2개
  const colCount = 12 + (isSales ? 2 : 0)

  return (
    <EcListShell title={cfg.title} search={keyword} onSearchChange={setKeyword} actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>기간</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <span style={{ marginLeft: 8, color: '#9aa1ab' }}>총 {shown.length}건 · 행을 클릭하면 품목 상세가 펼쳐집니다.</span>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {isSales && (
        // 원본은 밑줄 탭이 아니라 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다.
        <div className="ec-pills" style={{ marginBottom: 6 }}>
          {SALES_TABS.map((t) => (
            <button
              key={t} type="button" onClick={() => setTab(t)}
              className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
            >
              {t} ({tabCount(t)})
            </button>
          ))}
        </div>
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>전표번호 ▼</th><th>{mode === 'sales' ? '판매일' : '구매일'} ▼</th><th>{cfg.partnerLabel}</th>
            {/* 원본 목록에 있는 열 — 무슨 물건을 판 전표인지 열지 않고도 알아야 한다 */}
            <th>품목명(요약)</th>
            <th>창고</th>
            <th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th><th style={{ textAlign: 'right' }}>합계</th><th>담당</th>
            {/* 원본 목록의 '불러온전표' — 이 전표가 어느 수주/발주에서 왔는지 */}
            <th>불러온전표</th>
            {isSales && <><th style={{ textAlign: 'center' }}>확인상태</th><th style={{ textAlign: 'center' }}>확인</th></>}
            <th style={{ textAlign: 'center' }}>세금계산서</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={colCount} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>조회 내역이 없습니다.</td></tr>
          ) : shown.map((d, i) => (
            <Fragment key={d.id}>
              <tr onClick={() => setOpenId(openId === d.id ? null : d.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: cfg.accent, fontWeight: 600 }}>{openId === d.id ? '▾ ' : '▸ '}{d.docNo}</td>
                <td>{d.date}</td>
                <td>{d.partnerName}</td>
                <td style={{ color: '#5a626e' }}>
                  {d.lines[0]?.itemName ?? ''}{d.lines.length > 1 ? ` 외 ${d.lines.length - 1}건` : ''}
                </td>
                <td>{d.warehouseName}</td>
                <td style={{ textAlign: 'right' }}>{won(d.supplyAmount)}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(d.vatAmount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: cfg.accent }}>{won(d.totalAmount)}</td>
                <td>{d.createdBy ?? ''}</td>
                <td style={{ fontFamily: 'monospace', color: '#8a929c' }}>
                  {/* 한 전표의 라인들이 서로 다른 근거전표에서 올 수 있다 — 중복을 없애고 요약한다 */}
                  {(() => {
                    const nos = [...new Set(d.lines.map((l) => l.sourceDocNo).filter(Boolean))] as string[]
                    if (nos.length === 0) return ''
                    return nos.length === 1 ? nos[0] : `${nos[0]} 외 ${nos.length - 1}건`
                  })()}
                </td>
                {isSales && (
                  <>
                    <td style={{ textAlign: 'center', color: confirmColor(d.confirmStatus), fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>
                      {d.confirmStatusName ?? '미확인'}
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      {d.confirmStatus === 'CONFIRMED' ? (
                        <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => confirmAct(d, 'unconfirm')}>확인취소</button>
                      ) : d.confirmStatus === 'IN_APPROVAL' ? (
                        <span style={{ color: '#c9ced6' }}>—</span>
                      ) : (
                        <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => confirmAct(d, 'confirm')}>확인</button>
                      )}
                    </td>
                  </>
                )}
                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                  {taxIssued.has(d.id) ? (
                    <span style={{ color: '#1c7c3c', fontSize: 11.5 }}>발행됨</span>
                  ) : (
                    <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => issueTaxInvoice(d)}>발행</button>
                  )}
                </td>
              </tr>
              {openId === d.id && (
                <tr className="no-ec">
                  <td colSpan={colCount} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        <tr><th style={{ width: 34 }}></th><th>품목코드</th><th>품목명</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>공급가액</th><th style={{ textAlign: 'right' }}>부가세</th></tr>
                      </thead>
                      <tbody>
                        {d.lines.map((l, li) => (
                          <tr key={li}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{li + 1}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.quantity)} {l.unit}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.unitPrice)}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.supplyAmount)}</td>
                            <td style={{ textAlign: 'right', color: '#8a929c' }}>{won(l.vatAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ padding: '4px 10px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <button className="ec-btn ec-btn-primary" onClick={() => printStatement(d)}>
                        {isSales ? '거래명세서 인쇄' : '매입명세서 인쇄'}
                      </button>
                      <button className="ec-btn" onClick={() => editDoc(d)}>수정</button>
                      <button
                        className="ec-btn"
                        style={{ color: '#c60a2e', borderColor: '#e2b4bc' }}
                        onClick={() => deleteDoc(d)}
                      >
                        삭제
                      </button>
                      <span style={{ fontSize: 11.5, color: '#8a929c' }}>
                        삭제하면 {isSales ? '출고' : '입고'}분이 재고로 되돌아갑니다.
                        회계반영·확인{isSales ? '' : ''}·세금계산서 발행 전표는 먼저 취소해야 합니다.
                      </span>
                    </div>
                    {d.remark && <div style={{ padding: '2px 10px 8px', fontSize: 12, color: '#5a626e' }}>비고: {d.remark}</div>}
                    {isSales && <div style={{ padding: '0 10px 8px' }}><CustomFieldsPanel entityType="SALES" entityId={d.id} /></div>}
                    <div style={{ padding: '0 10px 8px' }}>
                      <EvidencePanel
                        entityType={isSales ? 'SALES' : 'PURCHASE'}
                        entityId={d.id}
                        docNo={d.docNo}
                        docDate={d.date}
                      />
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
            <td style={{ textAlign: 'right' }}>{won(totals.supply)}</td>
            <td style={{ textAlign: 'right' }}>{won(totals.vat)}</td>
            <td style={{ textAlign: 'right', color: cfg.accent }}>{won(totals.total)}</td>
            <td colSpan={(isSales ? 3 : 1) + 1}></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
