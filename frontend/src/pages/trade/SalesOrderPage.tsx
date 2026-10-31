import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import { dateNo } from '../../utils/dateNo'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import type { Partner } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import Modal from '../../components/Modal'
import EcPeriodPicks, { ORDER_LIST_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { EcCond } from '../../components/EcStatusPanel'
import { dateText } from '../../utils/dateText'
import { loadSupplierParty, type DocParty } from '../../utils/printDocument'
import EcSlipPrintModal, { type SlipPrintDoc } from '../../components/EcSlipPrintModal'
import { orderSlip } from '../../utils/slipLetter'
import { ecAlert, ecConfirm, requireSelection } from '../../components/EcDialog'
import { SlipMenuHistoryModal, EMAIL_NOT_HERE, BARCODE_NOT_HERE } from '../../features/sliphistory/SlipMenuHistoryModal'
import { EcDateRange } from '../../components/ui/EcDateInput'
import EcIcon from '../../components/ui/EcIcon'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'
import SlipWindow from '../../components/SlipWindow'
import SalesOrderEntry from './SalesOrderEntry'
import { fmtNumber } from '../../utils/format'

type OrderStatus = 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
/**
 * 원본 진행상태는 <b>미확인 / 확인(진행중 · 완료)</b> 두 단계다(2026-10-13 [진행상태변경] 메뉴 실측:
 * '▾미확인 › 미확인', '▾확인 › 진행중 · 완료'). 우리 접수(RECEIVED)가 원본 미확인 자리다. 취소는 원본에 없다(예전 자료만).
 */
const STATUS_LABEL: Record<OrderStatus, string> = { RECEIVED: '미확인', IN_PROGRESS: '진행중', COMPLETED: '완료', CANCELED: '취소' }
/**
 * 위 알약 — 원본 '전체 · 결재중 · 미확인 · 확인 ▸ 진행중 – 완료'(2026-10-31 loginad 주문서조회 — C-Portal 은 없다).
 * 결재는 우리에게 그 경로가 없어 늘 비어 있다.
 */
type Tab = 'ALL' | 'APPROVAL' | 'RECEIVED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'
const TAB_MATCH: Record<Tab, (s: OrderStatus) => boolean> = {
  ALL: () => true, APPROVAL: () => false, RECEIVED: (s) => s === 'RECEIVED',
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
  createdBy?: string | null
  /** 외화 주문이면 통화 코드(내자면 비어 있다). */
  currencyCode?: string | null
  supplyAmount: number; vatAmount: number; totalAmount: number; remark: string | null; lines: OrderLine[]
}

/** 서버(SalesOrderService.delete)가 막을 때 첫 줄 — 원본 '알림' 창의 첫 줄 그대로. */
const BLOCKED_HEAD = '아래의 경우 처리가 불가능합니다.'
const notHere = (what: string) => () => void ecAlert(`이 기능은 이 ERP 에서 제공하지 않습니다.\n(${what})`)

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
  /*
   * 원본 [내.외자구분] · [발송여부] 단추(2026-10-31 loginad). 우리 주문은 화면에서 내자만 넣고(currencyCode 가 있으면 외자로 본다),
   * 주문서를 밖으로 보내지 않아 모두 미발송이다.
   */
  const [fxCond, setFxCond] = useState<'전체' | '내자' | '외자'>('전체')
  const [sentCond, setSentCond] = useState<'전체' | '미발송' | '발송'>('전체')
  /* 원본 접힌 줄(⌄)을 펼치면 나오는 칸 중 우리 자료로 거를 수 있는 것: 납기일자 · 규격 · 담당자 · 거래처관리담당자 · 적요 · 작성자. */
  const [moreConds, setMoreConds] = useState(false)
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [pmCond, setPmCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  /** [신규(F2)] · [일자-No.] — 목록 위 '주문서입력' 창(원본 2026-10-31 loginad). id 가 null 이면 새 주문서. */
  const [popup, setPopup] = useState<{ id: number | null; copied: boolean } | null>(null)
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [error, setError] = useState('')
  /** 지우기가 막힌 줄(구분 · 해당 메뉴 · 사유) — 원본 '알림' 창의 표. */
  const [blocked, setBlocked] = useState<string[][] | null>(null)
  /** 원본 목록 첫 칸의 체크 — [선택삭제] 가 이것을 지운다. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<Tab>('ALL')
  const [historyWin, setHistoryWin] = useState(false)
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

  /* 하단 [진행상태변경 ▲] — 원본은 고른 줄이 없어도 메뉴를 먼저 띄우고, 알림은 고를 때 낸다(2026-10-30 클릭 대조). */
  async function changeStatus(status: OrderStatus) {
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

  /**
   * 주문서 [인쇄] — 원본은 목록 위 '주문서' 인쇄 미리보기 창이다(2026-10-31 loginad C000072 실측 — 수 신 · 참 조 · TEL/FAX · 결제조건 ·
   * 유효기간 · 납기일자 | 로고 · 일련번호 · 담당자, 금액 줄, 품목 격자(총합계에 수량), [✓내자기본 ⌄] [인쇄│▴] [Email│▴] [Excel] [닫기]).
   */
  const [slipDocs, setSlipDocs] = useState<SlipPrintDoc[] | null>(null)
  const toSlip = (o: SalesOrder) => {
    const p = partners.find((x) => x.id === o.partnerId)
    return orderSlip({ key: o.id, dateNo: dateNo(o.orderDate, o.orderNo), partnerName: o.partnerName, partnerTel: p?.phone, partnerFax: p?.fax,
      employeeName: o.employeeName, dueDate: o.dueDate, supplyAmount: o.supplyAmount, vatAmount: o.vatAmount,
      totalAmount: o.totalAmount, lines: o.lines }, company)
  }
  function printOrder(o: SalesOrder) { setSlipDocs([toSlip(o)]) }
  function printChecked() {
    const list = shown.filter((o) => checked.has(o.id))
    if (list.length) setSlipDocs(list.map(toSlip))
  }

  const shownRows = orders
    .filter((o) => TAB_MATCH[tab](o.status))
    .filter((o) => !whCond || String(o.warehouseId) === whCond)
    .filter((o) => !projCond || String(o.projectId) === projCond)
    .filter((o) => !partnerCond || String(o.partnerId) === partnerCond)
    .filter((o) => !itemCond || o.lines.some((l) => String(l.itemId) === itemCond))
    .filter((o) => !keyword || o.partnerName.includes(keyword) || o.orderNo.includes(keyword))
    .filter((o) => fxCond === '전체' || (fxCond === '외자') === !!o.currencyCode)
    .filter(() => sentCond !== '발송')
    .filter((o) => !dueFrom || (o.dueDate ?? '') >= dueFrom)
    .filter((o) => !dueTo || ((o.dueDate ?? '') !== '' && o.dueDate! <= dueTo))
    .filter((o) => !specCond || o.lines.some((l) => (l.spec ?? '').includes(specCond)))
    .filter((o) => !empCond || (o.employeeName ?? '') === empCond)
    .filter((o) => !pmCond || (partners.find((x) => x.id === o.partnerId)?.manager ?? '') === pmCond)
    .filter((o) => !remarkCond || (o.remark ?? '').includes(remarkCond))
    .filter((o) => !authorCond || (o.createdBy ?? '').includes(authorCond))

  /* 원본 표 머리는 글자만이다(정렬 화살표 없음, 2026-10-31 loginad). [수정일자순]을 켜면 고친 시각이 늦은 것부터. */
  const shown = byUpdated ? [...shownRows].sort((a, b) => ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : (a.updatedAt ?? '') > (b.updatedAt ?? '') ? -1 : 0)) : shownRows

  /** 창의 [이전] · [다음] — 판매조회 창과 같은 잣대(일자-No. 차례, 끝이면 '다음 자료가 없습니다.' 뒤 창 닫힘). */
  async function movePopup(dir: 'prev' | 'next') {
    const ordered = [...shown].sort((a, b) => a.orderDate.localeCompare(b.orderDate) || a.orderNo.localeCompare(b.orderNo))
    const i = ordered.findIndex((o) => o.id === popup?.id)
    const to = ordered[dir === 'prev' ? i - 1 : i + 1]
    if (i < 0 || !to) {
      await ecAlert(`${dir === 'prev' ? '이전' : '다음'} 자료가 없습니다.`)
      setPopup(null)
      return
    }
    setPopup({ id: to.id, copied: false })
  }
  function closePopup(changed: boolean) {
    setPopup(null)
    if (changed) void load()
  }


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
      onNew={() => setPopup({ id: null, copied: false })}
      formMenu={{ current: '기본(수정불가)' }}
      /* 원본 Option — 견적서조회 · 판매조회와 같은 꼴(주문서조회 Option 항목은 기록이 없어 견적서조회 것을 따른다). */
      optionMenu={[
        { label: '업무설정', onClick: notHere('업무설정') },
        { label: '검색항목설정', onClick: notHere('검색항목설정') },
        { label: '양식설정', sub: [
          { label: '기본(수정불가)', active: true, onClick: () => void ecAlert('양식은 하나만 지원합니다.') },
          { label: '신규양식추가', onClick: () => void ecAlert('신규양식추가는 지원하지 않습니다(양식 하나).') },
        ] },
        { label: '조건양식설정', onClick: notHere('조건양식설정') },
        { label: '문서발송내역', onClick: notHere('문서발송내역') },
      ]}
      /*
       * 원본 하단(2026-10-31 loginad C000072): 신규(F2) · [Email│▲] · [진행상태변경 ▲] · [보내기 ▲] · [인쇄│▲] · [바코드(품목)│▲] ·
       * [다른전표생성 ▲](발주요청 · 발주계획 · … · 전체메뉴) · 전자결재 · 선택삭제 · Excel(▲ 없음) · 이력조회.
       * ▲ 항목은 견적서조회와 같게 두고, 다른전표생성 펼침은 기록에 남은 것만(주문서에서 만드는 길이 우리에게 없어 안내만).
       */
      actions={[
        { label: 'Email', onClick: () => void ecAlert(EMAIL_NOT_HERE), menu: [{ label: '카카오톡', onClick: notHere('카카오톡') }] },
        /* selected — 펼침은 고른 줄 없이도 뜨고(menuOnly), 항목을 고를 때 changeStatus 가 원본 알림을 낸다. */
        { label: '진행상태변경', menuOnly: true, selected: checked.size, menu: [
          { label: '미확인', onClick: () => void changeStatus('RECEIVED') },
          { label: '진행중', onClick: () => void changeStatus('IN_PROGRESS') },
          { label: '완료', onClick: () => void changeStatus('COMPLETED') },
        ] },
        { label: '보내기', menuOnly: true, menu: ['E Note', '대화방', '사용자', '북마크'].map((l) => ({ label: l, onClick: notHere(`보내기 › ${l}`) })) },
        { label: '인쇄', onClick: printChecked, selected: checked.size, menu: [{ label: '프린트문제해결', onClick: notHere('프린트문제해결') }] },
        { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE), selected: checked.size, menu: [
          { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE) },
          { label: '바코드(사업장/번호No.)', onClick: notHere('바코드(사업장/번호No.)') },
        ] },
        { label: '다른전표생성', menuOnly: true, menu: ['발주요청', '발주계획', '전체메뉴'].map((l) => ({ label: l, onClick: notHere(`다른전표생성 › ${l}`) })) },
        { label: '전자결재', onClick: notHere('전자결재') },
        { label: '선택삭제', onClick: removeChecked, selected: checked.size }, { label: 'Excel' },
        { label: '이력조회', onClick: () => setHistoryWin(true) }]}
    >
      {popup && (
        <SlipWindow title={popup.id != null && !popup.copied ? '주문서입력(수정)' : '주문서입력'}
                              popout={popup.id != null && !popup.copied ? `/sales/order-entry?edit=${popup.id}` : '/sales/order-entry'}
                              onClose={() => closePopup(false)}>
          {/* 원본 주문수정 머리 [확인취소] — 판매입력(수정) 창과 같이 이 회사 설정으로는 알림만 뜬다. */}
          {popup.id != null && !popup.copied && (
            <div className="flex justify-end mb-[6px]">
              <button type="button" className="ec-btn ec-btn-sm"
                      onClick={() => void ecAlert('전표상태관리유형 설정으로 인해 전표상태를 변경할 수 없습니다.')}>확인취소</button>
            </div>
          )}
          <SalesOrderEntry key={popup.id ?? 'new'} popup={{
            editId: popup.copied ? null : popup.id,
            onClose: closePopup,
            onMove: (dir) => void movePopup(dir),
            onCopy: () => setPopup((p) => (p ? { ...p, copied: true } : p)),
          }} />
        </SlipWindow>
      )}
      {slipDocs && <EcSlipPrintModal title="주문서" docs={slipDocs} forms={['내자기본']} width={726} onClose={() => setSlipDocs(null)} />}
      {/* 원본 '주문서 이력조회' 창 둘째 열은 [전표번호](2026-10-31 loginad — 판매 이력조회와 같다). */}
      {historyWin && <SlipMenuHistoryModal menu="주문서" statusLabel="확인" noLabel="전표번호" onClose={() => setHistoryWin(false)} />}

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
                  <td className="text-right">{fmtNumber(r.quantity)}</td><td className="text-right">{fmtNumber(r.remaining)}</td>
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
        <EcCond label="내.외자구분">
          <div className="ec-pills">
            {(['전체', '내자', '외자'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${fxCond === v ? ' active' : ''}`} onClick={() => setFxCond(v)}>{v}</button>
            ))}
          </div>
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
        <EcCond label="발송여부">
          <div className="ec-pills">
            {(['전체', '미발송', '발송'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${sentCond === v ? ' active' : ''}`} onClick={() => setSentCond(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="기타">
          <label className="inline-flex items-center gap-[3px] text-[12.5px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)
          </label>
        </EcCond>
        {/*
          원본 접힌 줄(⌄)을 펼친 칸(2026-10-31 loginad): 납기일자 · 오더관리번호 · 규격 · 담당자 · 거래처관리담당자 · 거래유형 · 검색창내용 · 적요 · 참조 ·
          결제조건 · 유효기간 · 작성자 · 최종수정자 · 최초작성일자 …. 오더관리번호 · 검색창내용 · 참조 · 결제조건 · 유효기간 · 최종수정자는 주문에 그 값이 없어 칸을 두지 않는다.
        */}
        {moreConds && <>
          <EcCond label="납기일자">
            <EcDateRange from={{ className: 'ec-input', value: dueFrom, onChange: (e) => setDueFrom(e.target.value) }} to={{ className: 'ec-input', value: dueTo, onChange: (e) => setDueTo(e.target.value) }} />
          </EcCond>
          <EcCond label="규격">
            <ItemSuggestInput field="spec" value={specCond} placeholder="전체" onChange={(v) => setSpecCond(v)} width={130} />
          </EcCond>
          <EcCond label="담당자" pick>
            <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체" value={empCond} onChange={setEmpCond} items={pickers.employees} />
          </EcCond>
          <EcCond label="거래처관리담당자" pick>
            <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체" value={pmCond} onChange={setPmCond}
                             items={[...new Set(partners.map((x) => x.manager).filter(Boolean) as string[])].sort().map((m) => ({ value: m, name: m }))} />
          </EcCond>
          <EcCond label="적요">
            <input className="ec-input w-[190px]" value={remarkCond} onChange={(e) => setRemarkCond(e.target.value)} placeholder="전체" />
          </EcCond>
          <EcCond label="작성자">
            <input className="ec-input w-[110px]" value={authorCond} onChange={(e) => setAuthorCond(e.target.value)} placeholder="전체" />
          </EcCond>
        </>}
        <li className="full justify-center">
          <button type="button" className="ec-btn ec-btn-sm" aria-expanded={moreConds}
                  title={moreConds ? '조건 접기' : '조건 더 보기'} aria-label={moreConds ? '조건 접기' : '조건 더 보기'} onClick={() => setMoreConds((v) => !v)}>
            <EcIcon name={moreConds ? 'chevron-up' : 'chevron-down'} size={12} glyph={moreConds ? '▴' : '▾'} />
          </button>
        </li>
      </ul>

      {/* 원본 제목 옆 알약: 전체 · 결재중 · 미확인 · 확인 ▸ 진행중 – 완료 */}
      <div className="ec-pills mb-[8px]">
        {([['ALL', '전체'], ['APPROVAL', '결재중'], ['RECEIVED', '미확인'], ['CONFIRMED', '확인 ▸'], ['IN_PROGRESS', '진행중'], ['COMPLETED', '완료']] as const).map(([k, label]) => (
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
            <th>일자-No.</th>
            <th>거래처명</th>
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
              <td><a className="cursor-pointer" onClick={() => setPopup({ id: o.id, copied: false })}>{dateNo(o.orderDate, o.orderNo)}</a></td>
              <td>{o.partnerName}</td>
              <td>{o.employeeName ?? ''}</td>
              {/* 원본 '코카콜라 [355ml] 외 1건' — 첫 품목에 규격을 대괄호로 붙인다. */}
              <td>{o.lines[0]?.itemName}{o.lines[0]?.spec ? ` [${o.lines[0].spec}]` : ''}{o.lines.length > 1 ? ` 외 ${o.lines.length - 1}건` : ''}</td>
              <td>{dateText(o.dueDate) || ''}</td>
              <td className="text-right">{fmtNumber(o.totalAmount)}</td>
              <td className="text-center text-ec-navy">{STATUS_LABEL[o.status]}</td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => openGenerated(o)}>조회</a></td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => printOrder(o)}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
