import { useEffect, useMemo, useState, Fragment } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'
import { useNavigate } from 'react-router-dom'
import { dateText } from '../../utils/dateText'

/**
 * 영업 > 출하조회 (E040226) — 전표(출하) 단위 조회. 행 클릭 시 품목 상세 펼침.
 * 판매조회/구매조회(TradeInquiryPage)의 출하판. 출하현황(ShipmentPage)이 상태 집계 뷰라면
 * 이 화면은 기준일자 범위·발송여부 검색폼 + 라인 상세를 가진 전표 조회다.
 * 백엔드 무변경 — `/shipments` 가 이미 라인까지 반환한다.
 *
 * <p><b>여기 적혀 있던 말이 틀렸다.</b> "창고·프로젝트는 Shipment 엔티티에 필드가 없어
 * 의도적 제외" 라고 적어 두고 있었는데, 엔티티에도 응답에도 <b>둘 다 있다</b>
 * (<code>warehouse</code>·<code>project</code>, <code>warehouseName</code>·<code>projectName</code>).
 * 값이 오는데 화면이 받아 두지 않아 못 거르고 있었을 뿐이다. 조건으로 걸었다.
 * [관리항목]만 여전히 없다 — 그건 품목 마스터에 붙는 값이라 출하 전표에는 없다.
 */
type ShipStatus = 'READY' | 'SHIPPED' | 'CANCELED'
const STATUS_COLOR: Record<ShipStatus, string> = { READY: '#b6791b', SHIPPED: '#1c7c3c', CANCELED: '#8a929c' }

interface ShipLine { itemCode: string; itemName: string; unit: string; quantity: number; unitPrice: number; amount: number }
interface Shipment {
  id: number; shipNo: string; partnerName: string; shipDate: string
  salesOrderNo: string | null
  /**
   * 창고·프로젝트는 <b>응답에 이미 오고 있었는데</b> 이 화면이 받아 두지 않았다 —
   * 원본 출하조회는 둘 다 조회 조건이다. 값이 오는데 못 거르고 있었던 셈이다.
   */
  warehouseName: string | null
  projectName: string | null
  /**
   * 출하 <b>담당자</b>. 목록의 [담당] 칸이 이제까지 <code>createdBy</code>(전표를 친 계정)를
   * 찍고 있었는데, 그건 <b>다른 사람</b>이다 — 출하지시서에 담당자를 따로 고르게 해 두고
   * 목록에서는 그 값을 안 보여 주고 있었다. 응답에는 실려 오고 있었다.
   */
  employeeName: string | null
  status: ShipStatus; statusName: string; totalQuantity: number; totalAmount: number
  remark: string | null; createdBy: string | null; lines: ShipLine[]
}

// 이카운트 출하조회 '발송여부' 필터 = 우리 상태로 매핑.
const SEND_TABS = ['전체', '미발송', '발송', '취소'] as const
type SendTab = (typeof SEND_TABS)[number]
const TAB_STATUS: Record<Exclude<SendTab, '전체'>, ShipStatus> = { 미발송: 'READY', 발송: 'SHIPPED', 취소: 'CANCELED' }

const won = (n: number) => n.toLocaleString('ko-KR')

export default function ShipmentInquiryPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Shipment[]>([])
  const [keyword, setKeyword] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [tab, setTab] = useState<SendTab>('전체')
  const [shipNoCond, setShipNoCond] = useState('')
  const [warehouseCond, setWarehouseCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects'])
  const [openId, setOpenId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function load() {
    setLoading(true); setError('')
    api.get<Shipment[]>('/shipments', { params: { from: from || undefined, to: to || undefined } })
      .then((res) => setRows(res.data))
      .catch((err) => { setError(extractErrorMessage(err)); setRows([]) })
      .finally(() => setLoading(false))
  }
  /*
   * <b>기간을 서버에 보낸다.</b> 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내
   * 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() }, [from, to])

  /*
   * 원본 출하조회의 조건은 <b>기준일자·출하No.·창고·프로젝트·거래처·품목·발송여부</b> 다(사본 실측).
   * 우리는 기준일자와 발송여부(알약)뿐이라, 나머지 다섯은 <b>검색상자 하나</b>로 뭉뚱그렸다.
   * 출하가 쌓이면 "저 창고에서 나간 것만" 을 물을 방법이 없다 — 창고·프로젝트는
   * <b>응답에 이미 오고 있었는데</b> 화면이 받아 두지도 않고 있었다.
   */
  const shownRows = useMemo(() => rows
    .filter((r) => tab === '전체' || r.status === TAB_STATUS[tab])
    .filter((r) => !keyword || r.partnerName.includes(keyword) || r.shipNo.includes(keyword) || r.lines.some((l) => l.itemName.includes(keyword)))
    .filter((r) => !from || r.shipDate >= from)
    .filter((r) => !to || r.shipDate <= to)
    .filter((r) => !shipNoCond || r.shipNo.includes(shipNoCond))
    .filter((r) => !warehouseCond || (r.warehouseName ?? '').includes(warehouseCond))
    .filter((r) => !projectCond || (r.projectName ?? '').includes(projectCond))
    .filter((r) => !partnerCond || r.partnerName.includes(partnerCond))
    .filter((r) => !itemCond || r.lines.some((l) => l.itemName.includes(itemCond) || l.itemCode.includes(itemCond)))
    .sort((a, b) => b.shipDate.localeCompare(a.shipDate) || b.id - a.id),
  [rows, keyword, from, to, tab, shipNoCond, warehouseCond, projectCond, partnerCond, itemCond])

  /*
   * 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. 머리를 안 누른 동안은 위의 기본 차례
   * (출하일 내림차순)를 그대로 쓴다 — 열지 마자 최신 건이 위에 서는 것이 이 화면의 기본이다.
   */
  const sort = useTableSort(shownRows, {
    출하번호: (r) => r.shipNo,
    출하일: (r) => r.shipDate,
    거래처: (r) => r.partnerName,
  })
  const shown = sort.sorted

  const tabCount = (t: SendTab) => rows.filter((r) => t === '전체' || r.status === TAB_STATUS[t]).length
  const totals = useMemo(() => shown.reduce((a, r) => ({ qty: a.qty + r.totalQuantity, amount: a.amount + r.totalAmount }), { qty: 0, amount: 0 }), [shown])

  return (
    <EcListShell title="출하조회" search={keyword} onSearchChange={setKeyword} onSearch={load} /*
        원본 출하조회의 버튼은 신규(F2)·진행상태변경·보내기·인쇄·바코드(품목)·전자결재·
        선택삭제·이력조회다. [신규(F2)] 자리가 비어 있었다 — 조회에서 "하나 더 넣자" 가 되면
        메뉴를 다시 뒤져야 했다. 우리 출하 등록은 출하지시서조회 화면이 겸한다.
      */
      onNew={() => navigate('/sales/shipment-order')}
      actions={[{ label: '검색(F8)', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12.5, color: '#5a626e' }}>
        <span>기준일자</span>
        <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span>~</span>
        <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <span style={{ marginLeft: 8, color: '#9aa1ab' }}>총 {shown.length}건 · 행을 클릭하면 품목 상세가 펼쳐집니다.</span>
      </div>

      {/* 원본 조건 차례: 기준일자 · 출하No. · 창고 · 프로젝트 · 거래처 · 품목 · 발송여부 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="출하No.">
          <input className="ec-input" value={shipNoCond} onChange={(e) => setShipNoCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        {/* 마스터를 고르는 조건은 직접 입력이 아니라 코드도움이다 — 다른 화면과 같은 규칙. */}
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseCond} onChange={setWarehouseCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projectCond} onChange={setProjectCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
      </ul>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/*
        상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다.
        원본은 이 줄에 <b>[발송여부]</b> 라는 이름표를 붙인다. 이름이 없으면 무엇을 고르는
        알약인지 화면만 보고는 알 수 없다.
      */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: 'var(--ec-label)', minWidth: 62 }}>발송여부</span>
      <div className="ec-pills">
        {SEND_TABS.map((t) => (
          <button
            key={t} type="button" onClick={() => setTab(t)}
            className={`ec-pill no-ec${tab === t ? ' active' : ''}`}
          >
            {t} ({tabCount(t)})
          </button>
        ))}
      </div>
      </div>

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('출하번호')}>출하번호 {sort.mark('출하번호')}</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('출하일')}>출하일 {sort.mark('출하일')}</th><th style={{ width: 130 }}>근거주문</th><th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('거래처')}>거래처 {sort.mark('거래처')}</th><th>품목</th>
            <th style={{ textAlign: 'right' }}>출하수량</th><th style={{ textAlign: 'right' }}>출하금액</th>
            <th style={{ textAlign: 'center' }}>발송여부</th><th>담당</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <Fragment key={r.id}>
              <tr onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--ec-blue)', fontWeight: 600 }}>{openId === r.id ? '▾ ' : '▸ '}{r.shipNo}</td>
                <td>{dateText(r.shipDate)}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11.5, color: r.salesOrderNo ? 'var(--ec-blue-dark)' : '#b6bcc4' }}>{r.salesOrderNo ?? '직접등록'}</td>
                <td>{r.partnerName}</td>
                <td>{r.lines[0]?.itemName}{r.lines.length > 1 ? ` 외 ${r.lines.length - 1}건` : ''}</td>
                <td style={{ textAlign: 'right' }}>{won(r.totalQuantity)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue)' }}>{won(r.totalAmount)}</td>
                <td style={{ textAlign: 'center', color: STATUS_COLOR[r.status], fontWeight: 700 }}>{r.statusName}</td>
                <td>{r.employeeName ?? ''}</td>
              </tr>
              {openId === r.id && (
                <tr className="no-ec">
                  <td colSpan={10} style={{ padding: 0, background: '#fafbfc' }}>
                    <table className="w-full text-left" style={{ margin: '4px 0' }}>
                      <thead>
                        <tr><th style={{ width: 34 }}></th><th>품목코드</th><th>품목명</th><th style={{ textAlign: 'right' }}>수량</th><th style={{ textAlign: 'right' }}>단가</th><th style={{ textAlign: 'right' }}>금액</th></tr>
                      </thead>
                      <tbody>
                        {r.lines.map((l, li) => (
                          <tr key={li}>
                            <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{li + 1}</td>
                            <td style={{ fontFamily: 'monospace' }}>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.quantity)} {l.unit}</td>
                            <td style={{ textAlign: 'right' }}>{won(l.unitPrice)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{won(l.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.remark && <div style={{ padding: '2px 10px 8px', fontSize: 12, color: '#5a626e' }}>비고: {r.remark}</div>}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700, background: '#f7f9fb' }}>
            <td colSpan={6} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
            <td style={{ textAlign: 'right' }}>{won(totals.qty)}</td>
            <td style={{ textAlign: 'right', color: 'var(--ec-blue)' }}>{won(totals.amount)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
