import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, Partner } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/codepicker/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { ymd } from '../../components/EcPeriodPicks'
import { dateNo } from '../../utils/dateNo'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import { ecAlert, ecConfirm, requireSelection } from '../../components/EcDialog'
import { SlipMenuHistoryModal, EMAIL_NOT_HERE, BARCODE_NOT_HERE } from '../../features/sliphistory/SlipMenuHistoryModal'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { usePartnerManagers } from '../../utils/partnerManagers'
import { EcDateRange } from '../../components/ui/EcDateInput'
import EcIcon from '../../components/ui/EcIcon'
import SlipWindow from '../../components/SlipWindow'
import ShipmentOrderEntry from './ShipmentOrderEntry'

/**
 * 재고 I › 영업관리 › 출하지시서조회(E040221) · 출하지시서입력(E040220) — 2026-10-20 loginaa 실측(plans/재고1/E040221.md).
 *
 * <p>원본은 출하지시서와 출하가 <b>다른 전표</b>다(판매/주문 → 출하지시서 → 출하). 그래서 이 화면은
 * `/api/shipment-orders` 를 본다 — 예전에는 출하(`/api/shipments`) 한 줄의 READY/SHIPPED 로 겸했다.
 * 단가 · 금액은 없다(수량만). 미출하 잔량은 출하지시서 줄 - 이어진 출하.
 *
 * <p>조회: 알약 전체 · 결재중 · 확인 ▸ · 진행중 · 완료 · 미확인(2026-10-31 loginad 차례 그대로), 열 일곱(☐ · 일자-No. · 창고명 · 품목명(요약) · 수량합계 · 진행상태 · 인쇄),
 * 합계줄 없음, 일자 내림차순, 조건 판은 접혀서 시작. 진행상태 링크 → 펼침 [진행중 · 완료] 로 확인 창 없이 바뀐다.
 * [신규(F2)] · [일자-No.] 는 목록 위에 떠 있는 '출하지시서입력' 창(ShipmentOrderEntry popup — 견적서 · 주문서조회와 같다).
 * 메뉴 [출하지시서입력] 은 큰 화면(/sales/shipment-order-entry) 그대로다.
 */
type Status = 'IN_PROGRESS' | 'COMPLETED'
interface SoLine { id: number; itemId: number; itemCode: string; itemName: string; spec: string | null; unit: string; quantity: number; shippedQty: number; unshippedQty: number; remark: string | null }
interface ShipmentOrder {
  id: number; orderNo: string; orderDate: string
  partnerId: number; partnerCode: string; partnerName: string
  employeeId: number | null; employeeName: string | null
  warehouseId: number | null; warehouseName: string | null
  projectId: number | null; projectName: string | null
  contact: string | null; dueDate: string | null; postalCode: string | null; address: string | null; remark: string | null
  status: Status; statusName: string; totalQuantity: number; createdBy: string | null
  createdAt: string | null; updatedAt: string | null
  lines: SoLine[]
}
/* 원본 알약 차례(2026-10-31 loginad): 전체 · 결재중 · 확인 ▸ – 진행중 – 완료 · 미확인. 결재 · 미확인은 우리 지시서에 그 단계가 없어 늘 빈다. */
const TABS = ['전체', '결재중', '확인', '진행중', '완료', '미확인'] as const
type Tab = typeof TABS[number]
const notHere = (what: string) => () => void ecAlert(`이 기능은 이 ERP 에서 제공하지 않습니다.\n(${what})`)
/** 원본 진행상태변경 › 미확인 — 우리 지시서는 진행중 · 완료 두 단계뿐이라 원본 막힘 알림과 같은 글을 낸다. */
const NO_UNCONFIRMED = '전표상태관리유형 설정으로 인해 전표상태를 변경할 수 없습니다.'
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 원본 기준일자 기본 — 2026/10/20 에 2026/09/20 ~ 2026/11/19(한 달 전 ~ 한 달 뒤 전날). */
function defaultPeriod(): [string, string] {
  const d = new Date()
  const from = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate())
  const to = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate() - 1)
  return [ymd(from), ymd(to)]
}
const summary = (s: ShipmentOrder) => {
  const first = s.lines[0]
  if (!first) return ''
  const name = first.spec ? `${first.itemName} [${first.spec}]` : first.itemName
  return s.lines.length > 1 ? `${name} 외 ${s.lines.length - 1}건` : name
}

async function printOne(s: ShipmentOrder, company: DocParty | null) {
  await printDocuments([{
    title: '출하지시서', docNo: dateNo(s.orderDate, s.orderNo), docDate: s.orderDate, hideAmounts: true,
    supplier: company ? { ...company, label: '지시자' } : { label: '지시자', name: '(회사정보 미등록)' },
    customer: { label: '납품처', name: s.partnerName },
    extra: [
      { label: '출하예정일', value: s.dueDate }, { label: '출하창고', value: s.warehouseName },
      { label: '담당자', value: s.employeeName }, { label: '연락처', value: s.contact },
      { label: '배송지', value: [s.postalCode, s.address].filter(Boolean).join(' ') },
    ],
    remark: s.remark,
    lines: s.lines.map((l) => ({ itemCode: l.itemCode, itemName: l.itemName, spec: l.spec, unit: l.unit, quantity: l.quantity, unitPrice: 0, supplyAmount: 0, vatAmount: 0, remark: l.remark })),
    footNote: '위와 같이 출하하여 주시기 바랍니다.',
  }])
}

export default function ShipmentOrderPage() {
  const [rows, setRows] = useState<ShipmentOrder[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [company, setCompany] = useState<DocParty | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('전체')
  const [keyword, setKeyword] = useState('')
  const [menuHistory, setMenuHistory] = useState(false)
  const [period0] = useState(defaultPeriod)
  const [from, setFrom] = useState(period0[0])
  const [to, setTo] = useState(period0[1])
  const [noCond, setNoCond] = useState('')
  const [whCond, setWhCond] = useState('')
  const [pjCond, setPjCond] = useState('')
  const [ptCond, setPtCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  /* 원본 Option 으로 펼치는 조건(2026-09-07 실측) — 관리항목 · 발송여부 · 규격 · 거래처관리담당자 · 적요 · 작성자 · 최초작성일자 · 최종작업일자. */
  const [mgmtCond, setMgmtCond] = useState('')
  const [sendCond, setSendCond] = useState<'' | '미발송' | '발송'>('')
  const [specCond, setSpecCond] = useState('')
  const [pmgrCond, setPmgrCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [dueCond, setDueCond] = useState(['', ''])
  const [empCond, setEmpCond] = useState('')
  const [contactCond, setContactCond] = useState('')
  const [addrCond, setAddrCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const [made, setMade] = useState(['', ''])
  const [edited, setEdited] = useState(['', ''])
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [statusMenu, setStatusMenu] = useState<number | null>(null)
  /* 원본 조건 판은 7칸 + 발송여부 + 기타 뿐이다 — 나머지는 접힌 줄(⌄) 안에(견적서 · 주문서조회와 같다). */
  const [moreConds, setMoreConds] = useState(false)
  /** [신규(F2)] · [일자-No.] — 목록 위 '출하지시서입력' 창. id 가 null 이면 새 지시서. */
  const [popup, setPopup] = useState<{ id: number | null; copied: boolean } | null>(null)
  const pickers = useCondPickers(['partners', 'items', 'warehouses', 'projects', 'employees'])

  const mgmt = useItemMgmt(items)
  const pmgr = usePartnerManagers(partners)

  async function load() {
    try {
      const res = await api.get<ShipmentOrder[]>('/shipment-orders', { params: { from: from || undefined, to: to || undefined } })
      setRows(res.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])
  useEffect(() => {
    loadSupplierParty().then(setCompany)
    Promise.all([
      api.get<Partner[]>('/partners'), api.get<Item[]>('/items'),
    ]).then(([p, i]) => { setPartners(p.data); setItems(i.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  const filtered = rows
    .filter((s) => !keyword || s.partnerName.includes(keyword) || dateNo(s.orderDate, s.orderNo).includes(keyword) || s.lines.some((l) => l.itemName.includes(keyword)))
    .filter((s) => !noCond || dateNo(s.orderDate, s.orderNo).includes(noCond) || s.orderNo.includes(noCond))
    .filter((s) => !whCond || String(s.warehouseId) === whCond)
    .filter((s) => !pjCond || String(s.projectId) === pjCond)
    .filter((s) => !ptCond || String(s.partnerId) === ptCond)
    .filter((s) => !itemCond || s.lines.some((l) => String(l.itemId) === itemCond))
    .filter((s) => mgmt.hits(s.lines.map((l) => l.itemId), mgmtCond))
    /* 발송(Email · 보내기)은 바깥 발송이라 우리에게 없다 — 모두 미발송이다. */
    .filter((s) => sendCond !== '발송' || !s)
    .filter((s) => !specCond || s.lines.some((l) => (l.spec ?? '') === specCond))
    .filter((s) => !pmgrCond || pmgr.managerOfName(s.partnerName) === pmgrCond)
    .filter((s) => !dueCond[0] || (s.dueDate ?? '') >= dueCond[0])
    .filter((s) => !dueCond[1] || ((s.dueDate ?? '') !== '' && s.dueDate! <= dueCond[1]))
    .filter((s) => !empCond || (s.employeeName ?? '') === empCond)
    .filter((s) => !contactCond || (s.contact ?? '').includes(contactCond))
    .filter((s) => !addrCond || (s.address ?? '').includes(addrCond))
    .filter((s) => !remarkCond || (s.remark ?? '').includes(remarkCond) || s.lines.some((l) => (l.remark ?? '').includes(remarkCond)))
    .filter((s) => !authorCond || (s.createdBy ?? '') === authorCond)
    .filter((s) => !made[0] || (s.createdAt ?? '').slice(0, 10) >= made[0])
    .filter((s) => !made[1] || ((s.createdAt ?? '') !== '' && s.createdAt!.slice(0, 10) <= made[1]))
    .filter((s) => !edited[0] || (s.updatedAt ?? '').slice(0, 10) >= edited[0])
    .filter((s) => !edited[1] || ((s.updatedAt ?? '') !== '' && s.updatedAt!.slice(0, 10) <= edited[1]))
  /* 결재중 · 확인 탭은 전자결재 · 확인 기능이 붙어야 찬다(원본도 이번 자료로는 비어 있었다). */
  const tabbed = filtered.filter((s) => tab === '전체' || (tab === '확인' && (s.status === 'IN_PROGRESS' || s.status === 'COMPLETED'))
    || (tab === '진행중' && s.status === 'IN_PROGRESS') || (tab === '완료' && s.status === 'COMPLETED'))
  const shown = byUpdated ? [...tabbed].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')) : tabbed

  async function removeChecked() {
    const targets = shown.filter((s) => checked.has(s.id))
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 출하지시서'))) return
    try { for (const t of targets) await api.delete(`/shipment-orders/${t.id}`); setChecked(new Set()); load() }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }
  /** 창의 [이전] · [다음] — 견적서 · 주문서조회 창과 같은 잣대(일자-No. 차례, 끝이면 알림 뒤 창 닫힘). */
  async function movePopup(dir: 'prev' | 'next') {
    const ordered = [...shown].sort((a, b) => a.orderDate.localeCompare(b.orderDate) || a.orderNo.localeCompare(b.orderNo))
    const i = ordered.findIndex((o) => o.id === popup?.id)
    const next = ordered[dir === 'prev' ? i - 1 : i + 1]
    if (i < 0 || !next) {
      await ecAlert(`${dir === 'prev' ? '이전' : '다음'} 자료가 없습니다.`)
      setPopup(null)
      return
    }
    setPopup({ id: next.id, copied: false })
  }
  function closePopup(changed: boolean) {
    setPopup(null)
    if (changed) void load()
  }
  async function setStatus(ids: number[], status: Status) {
    setStatusMenu(null)
    try { for (const id of ids) await api.patch(`/shipment-orders/${id}/status`, { status }); setChecked(new Set()); load() }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell
      title="출하지시서조회"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      newLabel="신규(F2)"
      onNew={() => setPopup({ id: null, copied: false })}
      formMenu={{ current: '기본(수정불가)' }}
      /* 원본 Option(2026-10-31 loginad 출하지시서조회): 업무설정 · 검색항목설정 · 양식설정▶ · 조건양식설정 · 문서발송내역. */
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
      onReset={() => { setFrom(period0[0]); setTo(period0[1]); setNoCond(''); setWhCond(''); setPjCond(''); setPtCond(''); setItemCond(''); setByUpdated(false); setMgmtCond(''); setSendCond(''); setSpecCond(''); setPmgrCond(''); setRemarkCond(''); setAuthorCond(''); setDueCond(['', '']); setEmpCond(''); setContactCond(''); setAddrCond(''); setMade(['', '']); setEdited(['', '']) }}
      /*
       * 원본 하단(2026-10-31 loginad): 신규(F2) · [Email│▲](카카오톡) · [진행상태변경 ▲](▾미확인 › 미확인 / ▾확인 › 진행중 · 완료) ·
       * [보내기 ▲](E Note · 대화방 · 사용자 · 북마크) · [인쇄│▲](프린트문제해결) · [바코드(품목)│▲](바코드(전표) · 바코드(시리얼/로트No.)) ·
       * 전자결재 · 선택삭제 · Excel · 이력조회 · 웹자료올리기. 펼침의 묶음 머리(▾미확인 · ▾확인)는 공용 셸이 아직 못 그린다.
       * [진행상태변경] 은 고른 줄 없이도 펼침이 뜨고(menuOnly), 항목을 고를 때 셸 · requireSelection 이 원본 알림을 낸다.
       */
      actions={[
        { label: 'Email', onClick: () => void ecAlert(EMAIL_NOT_HERE), menu: [{ label: '카카오톡', onClick: notHere('카카오톡') }] },
        { label: '진행상태변경', menuOnly: true, selected: checked.size, menu: [
          { label: '미확인', onClick: () => { if (requireSelection(checked.size)) void ecAlert(NO_UNCONFIRMED) } },
          { label: '진행중', onClick: () => { if (requireSelection(checked.size)) void setStatus([...checked], 'IN_PROGRESS') } },
          { label: '완료', onClick: () => { if (requireSelection(checked.size)) void setStatus([...checked], 'COMPLETED') } },
        ] },
        { label: '보내기', menuOnly: true, menu: ['E Note', '대화방', '사용자', '북마크'].map((l) => ({ label: l, onClick: notHere(`보내기 › ${l}`) })) },
        { label: '인쇄', selected: checked.size, onClick: () => { shown.filter((s) => checked.has(s.id)).forEach((s) => void printOne(s, company)) },
          menu: [{ label: '프린트문제해결', onClick: notHere('프린트문제해결') }] },
        { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE), selected: checked.size, menu: [
          { label: '바코드(전표)', onClick: notHere('바코드(전표)') },
          { label: '바코드(시리얼/로트No.)', onClick: notHere('바코드(시리얼/로트No.)') },
        ] },
        { label: '전자결재', onClick: notHere('전자결재') },
        { label: '선택삭제', selected: checked.size, onClick: removeChecked },
        { label: 'Excel' },
        { label: '이력조회', onClick: () => setMenuHistory(true) },
        { label: '웹자료올리기', onClick: notHere('웹자료올리기') },
      ]}
    >
      {popup && (
        <SlipWindow title={popup.id != null && !popup.copied ? '출하지시서입력(수정)' : '출하지시서입력'}
                              popout={popup.id != null && !popup.copied ? `/sales/shipment-order-entry?edit=${popup.id}` : '/sales/shipment-order-entry'}
                              onClose={() => closePopup(false)}>
          <ShipmentOrderEntry key={popup.id ?? 'new'} popup={{
            editId: popup.copied ? null : popup.id,
            onClose: closePopup,
            onMove: (dir) => void movePopup(dir),
            onCopy: () => setPopup((p) => (p ? { ...p, copied: true } : p)),
            onEdit: (id) => { void load(); setPopup({ id, copied: false }) },
          }} />
        </SlipWindow>
      )}
      {menuHistory && <SlipMenuHistoryModal menu="출하지시서" statusLabel="확인" onClose={() => setMenuHistory(false)} />}
      <ul className="ec-cond">
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input w-[140px]", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input w-[140px]", value: to, onChange: (e) => setTo(e.target.value) }} />
        </EcCond>
        <EcCond label="출하지시No.">
          <input className="ec-input w-[170px]" value={noCond} onChange={(e) => setNoCond(e.target.value)} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체" value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체" value={pjCond} onChange={setPjCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체" value={mgmtCond} onChange={setMgmtCond} items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체" value={ptCond} onChange={setPtCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체" value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        <EcCond label="발송여부">
          <div className="ec-pills">
            {(['', '미발송', '발송'] as const).map((v) => (
              <button key={v || 'all'} type="button" className={`ec-pill no-ec${sendCond === v ? ' active' : ''}`} onClick={() => setSendCond(v)}>{v || '전체'}</button>
            ))}
          </div>
        </EcCond>
        {/*
          원본 접힌 줄(⌄) 안의 칸(ecount-form-fields 출하지시서조회): 출하예정일 · 오더관리번호 · 규격 · 담당자 · 거래처관리담당자 · 연락처 · 주소 · 적요 ·
          작성자 · 최종수정자 · 최초작성일자 · 최종작업일자 …. 오더관리번호 · 최종수정자 · 입력경로 · 삭제구분 · 제목은 지시서에 그 값이 없어 칸을 두지 않는다.
        */}
        {moreConds && <>
          <EcCond label="출하예정일">
            <EcDateRange from={{ className: "ec-input w-[140px]", value: dueCond[0], onChange: (e) => setDueCond([e.target.value, dueCond[1]]) }} to={{ className: "ec-input w-[140px]", value: dueCond[1], onChange: (e) => setDueCond([dueCond[0], e.target.value]) }} />
          </EcCond>
          <EcCond label="규격" pick>
            <CodePickerField label="규격" hideLabel width={170} emptyLabel="전체" value={specCond} onChange={setSpecCond}
                             items={[...new Set(rows.flatMap((s) => s.lines.map((l) => l.spec)).filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="담당자" pick>
            <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체" value={empCond} onChange={setEmpCond} items={pickers.employees} />
          </EcCond>
          <EcCond label="거래처관리담당자" pick>
            <CodePickerField label="거래처관리담당자" hideLabel width={170} emptyLabel="전체" value={pmgrCond} onChange={setPmgrCond} items={pmgr.options.map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="연락처"><input className="ec-input w-[170px]" value={contactCond} onChange={(e) => setContactCond(e.target.value)} /></EcCond>
          <EcCond label="주소"><input className="ec-input w-[170px]" value={addrCond} onChange={(e) => setAddrCond(e.target.value)} /></EcCond>
          <EcCond label="적요"><input className="ec-input w-[170px]" value={remarkCond} onChange={(e) => setRemarkCond(e.target.value)} /></EcCond>
          <EcCond label="작성자" pick>
            <CodePickerField label="작성자" hideLabel width={170} emptyLabel="전체" value={authorCond} onChange={setAuthorCond}
                             items={[...new Set(rows.map((s) => s.createdBy).filter(Boolean) as string[])].sort().map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="최초작성일자">
            <EcDateRange from={{ className: "ec-input w-[140px]", value: made[0], onChange: (e) => setMade([e.target.value, made[1]]) }} to={{ className: "ec-input w-[140px]", value: made[1], onChange: (e) => setMade([made[0], e.target.value]) }} />
          </EcCond>
          <EcCond label="최종작업일자">
            <EcDateRange from={{ className: "ec-input w-[140px]", value: edited[0], onChange: (e) => setEdited([e.target.value, edited[1]]) }} to={{ className: "ec-input w-[140px]", value: edited[1], onChange: (e) => setEdited([edited[0], e.target.value]) }} />
          </EcCond>
        </>}
        {/* 원본 [기타] 는 접힌 줄을 펴도 맨 끝이다. */}
        <EcCond label="기타">
          <label className="flex items-center gap-[4px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
        <li className="full justify-center">
          <button type="button" className="ec-btn ec-btn-sm" aria-expanded={moreConds}
                  title={moreConds ? '조건 접기' : '조건 더 보기'} aria-label={moreConds ? '조건 접기' : '조건 더 보기'} onClick={() => setMoreConds((v) => !v)}>
            <EcIcon name={moreConds ? 'chevron-up' : 'chevron-down'} size={12} glyph={moreConds ? '▴' : '▾'} />
          </button>
        </li>
      </ul>

      {/* 원본 제목 옆 알약(2026-10-31 loginad): 전체 · 결재중 · 확인 ▸ – 진행중 – 완료 · 미확인 */}
      <div className="ec-pills mb-[8px]">
        {TABS.map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t === '확인' ? '확인 ▸' : t}</button>
        ))}
      </div>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <p className="mb-[4px] text-ec-label">{from.replace(/-/g, '/')} ~ {to.replace(/-/g, '/')}</p>

      <table className="w-full table-fixed text-left">
        <colgroup>
          <col className="w-[35px]" /><col className="w-[141px]" /><col className="w-[141px]" /><col className="w-[380px]" />
          <col className="w-[146px]" /><col className="w-[112px]" /><col className="w-[112px]" />
        </colgroup>
        <thead>
          <tr>
            <th className="text-center">
              <input type="checkbox" checked={shown.length > 0 && shown.every((s) => checked.has(s.id))}
                     onChange={() => setChecked(shown.every((s) => checked.has(s.id)) ? new Set() : new Set(shown.map((s) => s.id)))} />
            </th>
            <th className="text-center">일자-No.</th><th>창고명</th><th>품목명(요약)</th>
            <th className="text-right">수량합계</th><th className="text-center">진행상태</th><th className="text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((s) => (
            <tr key={s.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(s.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev); if (next.has(s.id)) next.delete(s.id); else next.add(s.id); return next
                })} />
              </td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); setPopup({ id: s.id, copied: false }) }}>{dateNo(s.orderDate, s.orderNo)}</a></td>
              <td>{s.warehouseName ?? ''}</td>
              <td>{summary(s)}</td>
              <td className="text-right">{qty2(s.totalQuantity)}</td>
              <td className="relative text-center">
                <a href="#" onClick={(e) => { e.preventDefault(); setStatusMenu(statusMenu === s.id ? null : s.id) }}>{s.statusName}</a>
                {statusMenu === s.id && (
                  <ul className="absolute left-[20px] top-[24px] z-10 min-w-[80px] p-[4px] list-none text-left bg-ec-panel border border-ec-line border-solid rounded-ec">
                    <li className="py-[4px] px-[8px]"><a href="#" onClick={(e) => { e.preventDefault(); void setStatus([s.id], 'IN_PROGRESS') }}>진행중</a></li>
                    <li className="py-[4px] px-[8px]"><a href="#" onClick={(e) => { e.preventDefault(); void setStatus([s.id], 'COMPLETED') }}>완료</a></li>
                  </ul>
                )}
              </td>
              <td className="text-center"><a href="#" onClick={(e) => { e.preventDefault(); void printOne(s, company) }}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>

    </EcListShell>
  )
}
