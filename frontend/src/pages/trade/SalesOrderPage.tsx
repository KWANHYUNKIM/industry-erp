import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { Partner } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import EcPeriodPicks, { ORDER_LIST_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { dateText } from '../../utils/dateText'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import { ecAlert, ecConfirm, requireSelection } from '../../components/EcDialog'
import { SlipMenuHistoryModal, EMAIL_NOT_HERE, BARCODE_NOT_HERE } from '../../features/sliphistory/SlipMenuHistoryModal'
import { EcDateRange } from '../../components/ui/EcDateInput'

type OrderStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
/**
 * 원본 진행상태는 <b>미확인 / 확인(진행중 · 완료)</b> 두 단계다(2026-10-13 [진행상태변경] 메뉴 실측:
 * '▾미확인 › 미확인', '▾확인 › 진행중 · 완료'). 우리 접수(RECEIVED)가 원본 미확인 자리다. 취소는 원본에 없다(예전 자료만).
 */
const STATUS_LABEL: Record<OrderStatus, string> = { RECEIVED: '미확인', IN_PROGRESS: '진행중', COMPLETED: '완료', CANCELED: '취소' }
/** 위 탭 — 원본 '전체 · 결재중 · C-Portal · 미확인 · 확인 ▸ 진행중 – 완료'. 결재 · C-Portal 은 우리에게 그 경로가 없어 늘 비어 있다. */
type Tab = 'ALL' | 'APPROVAL' | 'CPORTAL' | 'RECEIVED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'
const TAB_MATCH: Record<Tab, (s: OrderStatus) => boolean> = {
  ALL: () => true, APPROVAL: () => false, CPORTAL: () => false, RECEIVED: (s) => s === 'RECEIVED',
  CONFIRMED: (s) => s === 'IN_PROGRESS' || s === 'COMPLETED', IN_PROGRESS: (s) => s === 'IN_PROGRESS', COMPLETED: (s) => s === 'COMPLETED',
}
/** [생성한전표] → '조회' 창 한 줄(서버 GeneratedSlipRow). */
interface GeneratedRow { itemCode: string; itemName: string; spec: string | null; quantity: number; remaining: number; slipType: string | null; slipDate: string | null; slipNo: string | null }

interface OrderLine { itemId: number; itemCode?: string; itemName: string; spec?: string | null; unit: string; quantity: number; unitPrice: number; supplyAmount: number; vatAmount: number }
interface SalesOrder {
  id: number; orderNo: string; partnerId: number; partnerName: string
  orderDate: string; dueDate: string | null; status: OrderStatus; statusName: string
  /** 수주의 [창고]·[프로젝트]·[담당자]. 견적에서 전환하면 그 값이 따라온다. */
  warehouseId?: number | null
  warehouseName: string | null
  projectId?: number | null
  projectName: string | null
  /** 원본 [기타]의 [수정일자순(정렬)] 축. */
  updatedAt?: string | null
  employeeId?: number | null
  employeeName: string | null
  supplyAmount: number; vatAmount: number; totalAmount: number; remark: string | null; lines: OrderLine[]
}

const won = (n: number) => n.toLocaleString('ko-KR')
/** 서버(SalesOrderService.delete)가 막을 때 첫 줄 — 원본 '알림' 창의 첫 줄 그대로. */
const BLOCKED_HEAD = '아래의 경우 처리가 불가능합니다.'

/**
 * 오더관리(수주) — 원본 영업관리 &gt; 주문서 &gt; <b>주문서조회</b>(E040204) 자리. 2026-10-03 loginaa 실측(자료가 든 판):
 * 기간 기본 <b>최근30일(+1개월)</b>, 열 일자-No. · 거래처명 · 사원(담당)명 · 품목명 · 납기일자 · 주문금액합계 · 진행상태 · 생성한전표 · 인쇄,
 * 위 탭 전체 · 결재중 · C-Portal · 미확인 · 확인 ▸ 진행중 – 완료. 창고 · 프로젝트는 [일자-No.] 로 여는 주문서입력(수정)에서 본다.
 */
export default function SalesOrderPage() {
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  /* 원본 조건 [창고] · [프로젝트] · [거래처] · [품목코드] · [기타](수정일자순). */
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [error, setError] = useState('')
  /** 지우기가 막힌 줄(구분 · 해당 메뉴 · 사유) — 원본 '알림' 창의 표. */
  const [blocked, setBlocked] = useState<string[][] | null>(null)
  /** 원본 목록 첫 칸의 체크 — [선택삭제] 가 이것을 지운다. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<Tab>('ALL')
  /** 하단 [진행상태변경 ▴] 메뉴 — 원본처럼 버튼 위로 뜬다. */
  const [historyWin, setHistoryWin] = useState(false)
  const [statusMenu, setStatusMenu] = useState<{ left: number; bottom: number } | null>(null)
  /** [생성한전표] 의 '조회' 창. */
  const [generated, setGenerated] = useState<{ order: SalesOrder; rows: GeneratedRow[] } | null>(null)
  const [company, setCompany] = useState<DocParty | null>(null)
  useEffect(() => { loadSupplierParty().then(setCompany) }, [])

  const navigate = useNavigate()
  /**
   * 주문서 입력 · 수정은 큰 화면(주문서입력 /sales/order-entry)이 한다. 다른 화면이 쓰던 주소를 그대로 받아 넘긴다:
   * `?edit=<id>`(그룹웨어 일정관리 납기 막대) · `?fromQuotes=<id,id>`(견적서조회 [다른전표생성] › 주문서 › 1장라인별).
   */
  const [params] = useSearchParams()
  const editParam = params.get('edit')
  const quotesParam = params.get('fromQuotes')
  useEffect(() => {
    if (editParam) navigate(`/sales/order-entry?edit=${editParam}`, { replace: true })
    else if (quotesParam) navigate(`/sales/order-entry?fromQuotes=${quotesParam}`, { replace: true })
  }, [editParam, quotesParam, navigate])

  const pickers = useCondPickers(['warehouses', 'projects', 'employees', 'partners', 'items'])

  async function load() {
    try {
      const [o, p] = await Promise.all([
        api.get<SalesOrder[]>('/sales-orders', { params: { from, to } }),
        api.get<Partner[]>('/partners'),
      ])
      setOrders(o.data); setPartners(p.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  /**
   * 지우기가 막혔을 때. 원본(2026-10-14 실측)은 출고처리한 주문서를 지우면 630×450 '알림' 창에
   * '아래의 경우 처리가 불가능합니다.' 세 줄과 표(구분 · 해당 메뉴 · 사유 — 20261014-3 · 주문 · 주문출고처리된 내역), [닫기] 를 띄운다.
   * 서버가 그 표의 줄을 '구분 · 메뉴 · 사유' 로 보내므로 그것을 표로 펴고, 다른 거절은 그대로 알린다.
   */
  function showDeleteFails(msgs: string[]) {
    const rows: string[][] = []
    const other: string[] = []
    for (const m of msgs) {
      const [head, ...rest] = m.split('\n')
      if (head === BLOCKED_HEAD) rest.forEach((l) => rows.push(l.split(' · ')))
      else other.push(m)
    }
    if (rows.length) setBlocked(rows)
    if (other.length) void ecAlert(other.join('\n'))
  }

  /** [선택삭제] — 고른 주문을 하나씩 지운다. 막힌 것(출하 · 판매가 붙은 것)은 이유를 모아 알린다. */
  async function removeChecked() {
    const ids = [...checked]
    if (ids.length === 0) return ecAlert('선택된 전표가 없습니다.')
    if (!(await ecConfirm(`전표를 삭제하겠습니까?\n- 주문서 ${ids.length}건`))) return
    const fails: string[] = []
    for (const id of ids) {
      try { await api.delete(`/sales-orders/${id}`) }
      catch (err) { fails.push(extractErrorMessage(err)) }
    }
    setChecked(new Set())
    load()
    if (fails.length) showDeleteFails(fails)
  }

  /**
   * 하단 [진행상태변경] — 버튼 위에 상태 메뉴를 띄운다. 원본은 안 고르고 누르면 '리스트에 선택된 자료가 없습니다.' 를 띄우지만
   * 우리 셸은 고른 줄이 있어야 도는 버튼을 미리 잠근다(ui-check 1-s13). 문구는 잠금이 풀린 채 불릴 때를 위해 남긴다.
   */
  /* 원본은 고른 줄이 없어도 메뉴를 먼저 띄우고, 알림은 고를 때 낸다(2026-10-30 클릭 대조). */
  function openStatusMenu() {
    const btn = [...document.querySelectorAll<HTMLButtonElement>('.ec-footer button')].find((b) => b.textContent?.trim() === '진행상태변경')
    const r = btn?.getBoundingClientRect()
    setStatusMenu({ left: r?.left ?? 200, bottom: r ? window.innerHeight - r.top + 4 : 48 })
  }
  async function changeStatus(status: OrderStatus) {
    setStatusMenu(null)
    if (!requireSelection(checked.size)) return
    const fails: string[] = []
    for (const id of checked) {
      try { await api.patch(`/sales-orders/${id}/status`, { status }) }
      catch (err) { fails.push(extractErrorMessage(err)) }
    }
    setChecked(new Set())
    load()
    if (fails.length) void ecAlert(fails.join('\n'))
  }

  async function openGenerated(o: SalesOrder) {
    try { setGenerated({ order: o, rows: (await api.get<GeneratedRow[]>(`/sales-orders/${o.id}/generated`)).data }) }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  /** 줄의 [인쇄] — 원본 '주 문 서' 양식(수신 · 납기일자 · 일련번호 · 담당자 · 금액 한글 · 품목코드 · 품목명[규격] …). */
  async function printOrder(o: SalesOrder) {
    const p = partners.find((x) => x.id === o.partnerId)
    await printDocuments([{
      title: '주 문 서',
      docNo: dateNo(o.orderDate, o.orderNo),
      docDate: o.orderDate,
      supplier: company ?? { label: '공급자', name: '(회사정보 미등록)' },
      customer: {
        label: '수신', name: o.partnerName,
        bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem, tel: p?.phone, address: p?.address,
      },
      extra: [{ label: '납기일자', value: dateText(o.dueDate) }, { label: '담당자', value: o.employeeName }],
      remark: o.remark,
      lines: o.lines.map((l) => ({
        itemCode: l.itemCode, itemName: l.itemName, spec: l.spec, unit: l.unit,
        quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount,
      })),
    }])
  }

  const shownRows = orders
    .filter((o) => TAB_MATCH[tab](o.status))
    .filter((o) => !whCond || String(o.warehouseId) === whCond)
    .filter((o) => !projCond || String(o.projectId) === projCond)
    .filter((o) => !partnerCond || String(o.partnerId) === partnerCond)
    .filter((o) => !itemCond || o.lines.some((l) => String(l.itemId) === itemCond))
    .filter((o) => !keyword || o.partnerName.includes(keyword) || o.orderNo.includes(keyword))

  /* 세 칸에 <b>▼ 만 그려 놓고</b> 정렬은 없었다. */
  const sort = useTableSort(shownRows, {
    수주일: (o) => o.orderDate,
    거래처: (o) => o.partnerName,
  })
  /* [수정일자순]을 켜면 고친 시각이 늦은 것부터 — 머리 정렬보다 먼저다(원본도 조건 판에서 고른다). */
  const shown = byUpdated ? [...shownRows].sort((a, b) => ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : (a.updatedAt ?? '') > (b.updatedAt ?? '') ? -1 : 0)) : sort.sorted


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '주문서조회', [])

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title="주문서조회"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel="신규(F2)"
      onNew={() => navigate('/sales/order-entry')}
      /* 원본 차례: 신규(F2) · Email · 진행상태변경 · 보내기 · 인쇄 · 바코드 · 다른전표생성 · 전자결재 · 선택삭제 · Excel · 이력조회 — 바깥 발송 · 결재는 뺀다. */
      actions={[{ label: 'Email', onClick: () => void ecAlert(EMAIL_NOT_HERE) },
        { label: '진행상태변경', onClick: openStatusMenu }, { label: '인쇄' },
        { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE), selected: checked.size },
        { label: '선택삭제', onClick: removeChecked, selected: checked.size }, { label: 'Excel' },
        { label: '이력조회', onClick: () => setHistoryWin(true) }]}
    >
      {historyWin && <SlipMenuHistoryModal menu="주문서" statusLabel="확인" onClose={() => setHistoryWin(false)} />}
      {statusMenu && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setStatusMenu(null)} />
          <div className="ec-menu fixed" style={{ left: statusMenu.left, bottom: statusMenu.bottom }} role="menu" aria-label="진행상태변경">
            <div className="px-[10px] pt-[4px] text-ec-label">▾ 미확인</div>
            <button onClick={() => changeStatus('RECEIVED')}>미확인</button>
            <div className="px-[10px] pt-[4px] text-ec-label">▾ 확인</div>
            <button onClick={() => changeStatus('IN_PROGRESS')}>진행중</button>
            <button onClick={() => changeStatus('COMPLETED')}>완료</button>
          </div>
        </>
      )}

      <Modal open={generated != null} title="생성한 전표" width={760} onClose={() => setGenerated(null)}>{generated && (
        <div>
          <p className="mb-[6px]">주문서조회 : {dateNo(generated.order.orderDate, generated.order.orderNo)}</p>
          <table className="w-full text-left">
            <thead><tr>
              <th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th className="text-right">잔량</th>
              <th>생성한 전표</th><th>생성한 전표일자-No.</th>
            </tr></thead>
            <tbody>
              {generated.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.itemCode}</td><td>{r.itemName}</td><td>{r.spec ?? ''}</td>
                  <td className="text-right">{won(r.quantity)}</td><td className="text-right">{won(r.remaining)}</td>
                  <td>{r.slipType ?? ''}</td><td>{r.slipDate && r.slipNo ? dateNo(r.slipDate, r.slipNo) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[8px]"><button type="button" className="ec-btn" onClick={() => setGenerated(null)}>닫기</button></div>
        </div>
      )}</Modal>

      <Modal open={blocked != null} title="알림" width={630} error={error} onClose={() => setBlocked(null)}>{blocked && (
        <div>
          <p className="m-0 leading-[18px]">{BLOCKED_HEAD}<br />자세한 내용은 아래의 사항을 참고하시기 바랍니다.<br />아래 사항을 수정 후 다시 진행하시기 바랍니다.</p>
          <table className="w-full text-left mt-[9px]">
            <thead><tr><th>구분</th><th>해당 메뉴</th><th>사유</th></tr></thead>
            <tbody>
              {blocked.map((r, i) => <tr key={i}><td>{r[0]}</td><td>{r[1] ?? ''}</td><td>{r[2] ?? ''}</td></tr>)}
            </tbody>
          </table>
          <div className="mt-[9px]">
            <button type="button" className="ec-btn" onClick={() => setBlocked(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={ORDER_LIST_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={projCond} onChange={setProjCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      {/* 원본 제목 옆 알약: 전체 · 결재중 · C-Portal · 미확인 · 확인 ▸ 진행중 – 완료 */}
      <div className="ec-pills mb-[8px]">
        {([['ALL', '전체'], ['APPROVAL', '결재중'], ['CPORTAL', 'C-Portal'], ['RECEIVED', '미확인'], ['CONFIRMED', '확인 ▸'], ['IN_PROGRESS', '진행중'], ['COMPLETED', '완료']] as const).map(([k, label]) => (
          <button key={k} type="button" className={`ec-pill no-ec${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((o) => checked.has(o.id))}
                onChange={(e) => setChecked(e.target.checked ? new Set(shown.map((o) => o.id)) : new Set())} />
            </th>
            {/* 원본 주문서조회 차례: 일자-No. · 거래처명 · 사원(담당)명 · 품목명 · 납기일자 · 주문금액합계 · 진행상태 (2026-10-03 실측). */}
            <th className="cursor-pointer" onClick={() => sort.toggle('수주일')}>일자-No. {sort.mark('수주일')}</th>
            <th className="cursor-pointer" onClick={() => sort.toggle('거래처')}>거래처명 {sort.mark('거래처')}</th>
            <th className="w-[90px]">사원(담당)명</th><th>품목명(요약)</th><th>납기일자</th>
            <th className="text-right">주문금액합계</th>
            <th className="text-center">진행상태</th>
            <th className="text-center">생성한전표</th>
            <th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((o, i) => (
            <tr key={o.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-center">
                <input type="checkbox" aria-label="선택" checked={checked.has(o.id)}
                  onChange={(e) => setChecked((cur) => { const n = new Set(cur); if (e.target.checked) n.add(o.id); else n.delete(o.id); return n })} />
              </td>
              {/* 원본은 [일자-No.] 를 누르면 주문수정 창이 뜬다. */}
              <td><a className="cursor-pointer" onClick={() => navigate(`/sales/order-entry?edit=${o.id}`)}>{dateNo(o.orderDate, o.orderNo)}</a></td>
              <td>{o.partnerName}</td>
              <td>{o.employeeName ?? ''}</td>
              {/* 원본 '코카콜라 [355ml] 외 1건' — 첫 품목에 규격을 대괄호로 붙인다. */}
              <td>{o.lines[0]?.itemName}{o.lines[0]?.spec ? ` [${o.lines[0].spec}]` : ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td>{dateText(o.dueDate) || ''}</td>
              <td className="text-right">{won(o.totalAmount)}</td>
              <td className="text-center text-ec-navy">{STATUS_LABEL[o.status]}</td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => openGenerated(o)}>조회</a></td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => void printOrder(o)}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
