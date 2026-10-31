import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { COMPARE_PERIODS, comparePeriodOf, fetchWindow, type ComparePeriod } from '../../components/EcPeriodPicks'
import EcBarChart from '../../components/EcBarChart'
import CodePickerField from '../../components/CodePickerField'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, type DocParty } from '../../utils/printDocument'
import EcSlipPrintModal, { type SlipPrintDoc } from '../../components/EcSlipPrintModal'
import { quoteSlip } from '../../utils/slipLetter'
import type { Currency, Item, Partner, Quotation, QuotationStatus } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'
import { ecAlert, ecConfirm, requireSelection } from '../../components/EcDialog'
import { SlipMenuHistoryModal, EMAIL_NOT_HERE, BARCODE_NOT_HERE } from '../../features/sliphistory/SlipMenuHistoryModal'
import EcDateInput, { EcDateRange } from '../../components/ui/EcDateInput'
import EcIcon from '../../components/ui/EcIcon'
import ProductionSlipWindow from '../production/ProductionSlipWindow'
import QuotationEntry from './QuotationEntry'
import { fmtNumber } from '../../utils/format'


/**
 * 원본 견적서조회(E040202) 위 알약 — '전체 · 결재중 · 미확인 · 확인 ▸ 진행중 – 완료'(2026-10-14 loginaa 실측, C-Portal 은 견적에 없다).
 * 결재는 우리에게 그 길이 없어 늘 비어 있다. 취소(예전 자료)는 전체에서만 보인다.
 */
type Tab = 'ALL' | 'APPROVAL' | 'UNCONFIRMED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED'
const TABS: [Tab, string][] = [['ALL', '전체'], ['APPROVAL', '결재중'], ['UNCONFIRMED', '미확인'], ['CONFIRMED', '확인 ▸'], ['IN_PROGRESS', '진행중'], ['COMPLETED', '완료']]
const TAB_MATCH: Record<Tab, (s: QuotationStatus) => boolean> = {
  ALL: () => true, APPROVAL: () => false, UNCONFIRMED: (s) => s === 'UNCONFIRMED',
  CONFIRMED: (s) => s === 'IN_PROGRESS' || s === 'COMPLETED', IN_PROGRESS: (s) => s === 'IN_PROGRESS', COMPLETED: (s) => s === 'COMPLETED',
}
/** [생성한전표] → '생성한 전표' 창 한 줄(서버 QuotationDtos.GeneratedSlipRow). */
interface GeneratedRow { itemCode: string; itemName: string; spec: string | null; quantity: number; remaining: number; slipType: string | null; slipDate: string | null; slipNo: string | null }
/** 생성한전표가 있으면 원본처럼 주황 꼬리표(2026-10-14 실측: 바탕 rgb(246, 136, 45) · 흰 글자 · 여백 0.9px 1.8px · 높이 16.3). */
const GEN_TAG = 'inline-block rounded-[6px] px-[1.8px] py-[0.9px] text-[12px] leading-[13.2px] bg-[var(--ec-tag-warn)] text-[var(--ec-bg-panel)] no-underline'
const notHere = (what: string) => () => void ecAlert(`이 기능은 이 ERP 에서 제공하지 않습니다.\n(${what})`)


/** 견적서 — 영업 흐름의 시작점. 작성→발송→수주전환. 부가세 10% 자동. */
export default function QuotationPage() {
  const navigate = useNavigate()
  /*
   * 메뉴 [견적서현황](E040208)은 같은 자료를 <b>줄 단위</b>로 편다 — ?view=status 로 연다(판매일괄회계반영과 같은 방식).
   * 원본 현황 격자: 일자-No. · 품목명(규격) · 수량 · 단가 · 공급가액 · 거래처명 · 적요(2026-09-09 실측).
   */
  const [params] = useSearchParams()
  const statusView = params.get('view') === 'status'
  const [rows, setRows] = useState<Quotation[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [warehouses, setWarehouses] = useState<{ id: number; code: string; name: string; active?: boolean }[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  /** 다른전표생성 입력 창 [담당자] · [통화] 직접입력 후보. */
  const [genEmps, setGenEmps] = useState<{ id: number; code: string; name: string }[]>([])
  const [genCurrencies, setGenCurrencies] = useState<Currency[]>([])
  useEffect(() => {
    api.get<{ id: number; code: string; name: string; active?: boolean }[]>('/sales-reps').then((r) => setGenEmps(r.data.filter((e) => e.active !== false))).catch(() => setGenEmps([]))
    api.get<Currency[]>('/currencies').then((r) => setGenCurrencies(r.data.filter((c) => c.active))).catch(() => setGenCurrencies([]))
  }, [])
  const [tab, setTab] = useState<Tab>('ALL')
  /** 빠른 검색칸(Search(F3) 옆) — 거래처명 · 일자-No. */
  const [keyword, setKeyword] = useState('')
  /** 하단 [진행상태변경 ▴] · [다른전표생성 ▴] 메뉴 — 버튼 위로 뜬다. */
  const [historyWin, setHistoryWin] = useState(false)
  const [menuAt, setMenuAt] = useState<{ kind: 'gen'; left: number; bottom: number } | null>(null)
  /** [신규(F2)] · [일자-No.] — 목록 위 '견적서입력' 창(원본 2026-10-31 loginad). null 이면 닫힘, id 가 null 이면 새 견적. */
  const [popup, setPopup] = useState<{ id: number | null; copied: boolean } | null>(null)
  const [generated, setGenerated] = useState<{ quote: Quotation; rows: GeneratedRow[] } | null>(null)
  const [error, setError] = useState('')
  /*
   * 원본 견적서조회는 <b>기준일자</b>를 들고 [최근30일(+1개월)] 로 열린다(사본 실측 —
   * 달 스핀박스가 06·08 셋이라 한 달 뒤까지 본다). 견적은 <b>앞으로</b>의 일이라
   * 아직 안 온 날짜까지 봐야 한다.
   *
   * <p>우리는 기간 칸이 <b>아예 없어서</b> 견적이 쌓이면 목록이 통째로 길어졌고,
   * "이번 달에 낸 견적" 을 볼 방법이 없었다.
   */
  const [from, setFrom] = useState(periodOf('최근30일(+1개월)')!.from)
  const [to, setTo] = useState(periodOf('최근30일(+1개월)')!.to)
  const [itemCond, setItemCond] = useState('')
  /* 원본 견적서 조건 차례의 둘째 <b>[견적No.]</b>. 번호를 알아도 눈으로 찾아야 했다. */
  const [noCond, setNoCond] = useState('')
  /* 원본 견적서 조건 차례: … <b>창고</b> · <b>프로젝트</b> · 관리항목 · 거래처 · 품목 · 발송여부. */
  const [whCond, setWhCond] = useState('')
  const [projCond, setProjCond] = useState('')
  /*
   * 원본 견적서 조건의 맨 뒤 <b>[발송여부]</b>. 우리 견적은 [발송] 을 눌러 상태가
   * <b>발송</b> 으로 가고, 수주로 전환된 것도 <b>보낸 뒤</b>의 일이라 보낸 것으로 친다.
   * 여태 알약(진행 단계)으로만 갈라서 "아직 안 보낸 견적" 을 한 번에 볼 수가 없었다.
   */
  const [sentCond, setSentCond] = useState<'전체' | '발송' | '미발송'>('전체')
  /* 원본 [내.외자구분](전체 · 내자 · 외자 단추). 우리 견적은 통화 칸이 내자 하나라 모두 내자다 — 외자를 고르면 빈 목록. */
  const [fxCond, setFxCond] = useState<'전체' | '내자' | '외자'>('전체')
  /* 원본 조건 판은 [기타] 까지가 한 판이고, 규격 · 적요 · 유효기간 · 작성자 … 는 접힌 줄(⌄)을 펼쳐야 나온다(2026-10-31 loginad). */
  const [moreConds, setMoreConds] = useState(false)
  const [company, setCompany] = useState<DocParty | null>(null)

  /*
   * 원본 <b>[다시 작성]</b> — 조건을 처음 상태로 되돌린다. 조건이 여덟 칸이라
   * 하나씩 지우게 두면 무엇이 남았는지 모른 채 빈 표를 보게 된다.
   */
  function reset() {
    const p = periodOf('최근30일(+1개월)')!
    setFrom(p.from); setTo(p.to)
    setItemCond(''); setNoCond(''); setWhCond(''); setProjCond(''); setSentCond('전체'); setFxCond('전체')
    setAuthorCond(''); setSpecCond(''); setRemarkCond(''); setValidCond(''); setPmCond('')
    setUpFrom(''); setUpTo('')
  }

  /* 원본 [구분]의 비교기간 — load 가 그 구간까지 받으므로 load 보다 먼저 둔다. */
  const [compare, setCompare] = useState<ComparePeriod>('사용안함')

  function load() {
    setError('')
    api.get<Quotation[]>('/quotations', { params: fetchWindow(from, to, compare) }).then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  /*
   * <b>기간을 서버에 보낸다.</b> 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내
   * 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() }, [from, to, compare])

  useEffect(() => {
    api.get<Item[]>('/items').then((r) => setItems(r.data)).catch(() => {})
    api.get<Partner[]>('/partners').then((r) => setPartners(r.data.filter((p) => p.type !== 'SUPPLIER'))).catch(() => {})
    api.get<{ id: number; code: string; name: string; active?: boolean }[]>('/warehouses').then((r) => setWarehouses(r.data)).catch(() => {})
    api.get<{ id: number; code: string; name: string }[]>('/projects').then((r) => setProjects(r.data)).catch(() => {})
  }, [])

  /** 원본은 일자와 번호를 '2026/08/03 -1' 로 한 칸에 적는다(판매조회와 같은 규칙). */
  const dateNo = (q: { quoteDate: string; quoteNo: string }) => {
    const seq = q.quoteNo.split('-').pop() ?? ''
    return `${q.quoteDate.replace(/-/g, '/')} -${Number(seq) || seq}`
  }

  /*
   * 원본 견적서 조건 차례: 기준일자 · 견적No. · 내.외자구분 · 창고 · 프로젝트 ·
   * 관리항목 · 거래처 · <b>품목</b> · 발송여부.
   *
   * <p>품목은 목록에 <b>[품목명(요약)]</b> 으로 찍히는데 그것으로 거를 수가 없었다 —
   * 그 품목이 든 견적을 찾으려면 한 줄씩 펼쳐 봐야 했다. 요약에는 첫 줄만 보이므로
   * <b>모든 줄</b>을 훑는다(요약만 보고 거르면 둘째 줄부터가 안 걸린다).
   */
  /** 원본 [관리항목]. 이 화면은 품목 마스터를 진작 통째로 받아 두고 있다. */
  const mgmt = useItemMgmt(items)
  const [mgmtCond, setMgmtCond] = useState('')
  /*
   * 원본 [거래처] — 차례는 [관리항목] 다음, [품목] 앞이다(2026-09-08 견적서현황 실측).
   * 표에는 거래처명을 진작 찍고 있었는데 <b>그것으로 거를 자리가 없었다.</b>
   */
  const [partnerCond, setPartnerCond] = useState('')
  /*
   * 원본 [작성자] — 조건 판을 <b>펼쳐야</b> 나오는 뒤쪽 칸이다
   * (2026-09-09 견적서현황 실측: 닫힌 판 11칸, 펼치면 <b>44칸</b>).
   * 우리는 목록에 [사원(담당)명]으로 <b>진작 찍고 있었는데 그것으로 거를 수가 없었다</b> —
   * "내가 낸 견적" 을 보려면 눈으로 훑어야 했다.
   */
  const [authorCond, setAuthorCond] = useState('')
  /*
   * <b>2026-09-09 견적서조회(E040202) 조건 판을 펼쳐 쟀다 — 서른다섯 칸이다</b>
   * (닫힌 판은 열). 그중 <b>표에는 찍히는데 그것으로 거를 수 없던 셋</b>을 만든다:
   * [규격](줄의 <code>spec</code>) · [적요](<code>remark</code>) · [유효기간](<code>validUntil</code>).
   * ui-check 가 "열로는 찍는데 거를 수 없다" 고 짚어 준 자리가 그대로 이 둘이었다.
   * [거래처관리담당자]는 거래처 마스터에 붙는 값인데 이 화면이 거래처를 통째로
   * 받아 두고 있어 바로 이을 수 있었다.
   */
  const [specCond, setSpecCond] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  /** 유효기간이 이 날짜까지인 것만. 원본은 구간이지만 우리는 끝날짜 하나로 좁힌다. */
  const [validCond, setValidCond] = useState('')
  const [pmCond, setPmCond] = useState('')
  /**
   * 원본 조건 판 <b>[기타]</b>의 [수정일자순(정렬)]. 2026-09-07 에 켜져 있는 원본
   * (C000071 견적서조회)을 열어 쟀다 — [기타] 안에는 이 하나가 들어 있고 기본은 꺼짐이다.
   * 판매조회·구매조회와 같은 모양이다.
   */
  const [byUpdated, setByUpdated] = useState(false)
  /*
   * 원본 [최종수정일시] — 2026-09-09 견적서조회 실측에서 <b>날짜 구간 두 칸</b>이었다.
   * 앞 바퀴에는 목록(pending-conditions)에 남겨 두었는데, 값이 없어서가 아니라
   * 안 만들어서였다 — <code>updatedAt</code> 은 응답이 진작 싣고 바로 아래
   * [수정일자순(정렬)]이 그 값으로 줄을 세우고 있다. <b>정렬은 되는데 거를 수가 없었다.</b>
   * 시각까지 받지만 거르는 축은 원본과 같이 <b>날짜</b>다.
   */
  const [upFrom, setUpFrom] = useState('')
  const [upTo, setUpTo] = useState('')
  /*
   * 2026-09-08 에 <b>견적서현황(E040208)</b> 을 열어 재니 조건이 <b>열하나</b>다 —
   * 메뉴 · 구분 · 기준일자 · 견적No. · 내.외자구분 · 창고 · 프로젝트 · 관리항목 ·
   * 거래처 · 품목 · 시리얼/로트No.
   *
   * <p>맨 위 두 줄이 우리에게 없었다. <b>[메뉴]</b> 는 현황★·집계, <b>[구분]</b> 안에는
   * 라인별과 <b>비교기간</b>(사용안함★·전년/전월/전주/전일동일기간)이 들어 있다.
   * 한 화면이 입력·조회·현황을 겸하다 보니 <b>목록 하나만</b> 내고 있었다 —
   * "이번 달에 어느 거래처에 얼마나 견적을 냈나" 를 이 화면에서 못 봤다.
   */
  const [menu, setMenu] = useState<'현황' | '집계'>('현황')

  const shown = useMemo(() => rows
    .filter((r) => TAB_MATCH[tab](r.status))
    .filter((r) => !keyword || r.partnerName.includes(keyword) || dateNo(r).includes(keyword))
    .filter((r) => (!from || r.quoteDate >= from) && (!to || r.quoteDate <= to))
    .filter((r) => !noCond || r.quoteNo.includes(noCond))
    /* 이름은 겹칠 수 있다 — id 로 거른다(QA 9회차). */
    .filter((r) => !whCond || String(r.warehouseId) === whCond)
    .filter((r) => !projCond || String(r.projectId) === projCond)
    .filter((r) => !partnerCond || String(r.partnerId) === partnerCond)
    .filter((r) => !authorCond || (r.createdBy ?? '').includes(authorCond))
    .filter((r) => !specCond || r.lines.some((l) => (l.spec ?? '').includes(specCond)))
    .filter((r) => !remarkCond || (r.remark ?? '').includes(remarkCond))
    .filter((r) => !validCond || (r.validUntil ?? '') <= validCond)
    .filter((r) => !pmCond
      || (partners.find((x) => x.id === r.partnerId)?.manager ?? '') === pmCond)
    /* 안 고친 건은 updatedAt 이 없을 수 있다 — 구간을 걸면 그런 줄은 빠진다(원본도 같다). */
    .filter((r) => !upFrom || (r.updatedAt ?? '').slice(0, 10) >= upFrom)
    .filter((r) => !upTo || ((r.updatedAt ?? '') !== '' && r.updatedAt!.slice(0, 10) <= upTo))
    .filter((r) => !itemCond || r.lines.some((l) => String(l.itemId) === itemCond))
    .filter((r) => mgmt.hits(r.lines.map((l) => l.itemId), mgmtCond))
    /* 원본 [발송여부] 는 Email · 보내기로 내보냈는가다 — 우리는 견적을 밖으로 보내지 않으므로 모두 미발송이다. */
    .filter(() => sentCond !== '발송')
    .filter(() => fxCond !== '외자')
    /* 원본 [수정일자순(정렬)] — 고친 순으로 본다. 안 고친 건은 만든 때가 곧 고친 때다. */
    .sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id - a.id : 0)),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [rows, tab, keyword, from, to, itemCond, sentCond, fxCond, whCond, projCond, noCond, mgmtCond, mgmt.options,
      byUpdated, authorCond, partnerCond, specCond, remarkCond, validCond, pmCond, partners,
      upFrom, upTo])
  /**
   * 원본 [구분]의 <b>비교기간</b>. 같은 길이의 앞 구간을 같은 조건으로 다시 세어
   * <b>합계만</b> 견준다 — 목록을 두 벌 그리지 않는다(주문서현황과 같은 방식).
   */
  const prevRange = comparePeriodOf(from, to, compare)
  const prevTotals = useMemo(() => {
    if (!prevRange) return { count: 0, supply: 0 }
    return rows
      .filter((r) => r.quoteDate >= prevRange.from && r.quoteDate <= prevRange.to)
      .filter((r) => TAB_MATCH[tab](r.status))
      .filter((r) => !noCond || r.quoteNo.includes(noCond))
      .filter((r) => !whCond || String(r.warehouseId) === whCond)
      .filter((r) => !projCond || String(r.projectId) === projCond)
      .filter((r) => !itemCond || r.lines.some((l) => String(l.itemId) === itemCond))
      .reduce((a, r) => ({ count: a.count + 1, supply: a.supply + r.supplyAmount }), { count: 0, supply: 0 })
  }, [rows, prevRange, tab, noCond, whCond, projCond, itemCond])

  /** 원본 [메뉴]의 <b>집계</b> — 거래처별로 묶어 건수와 공급가액을 낸다. */
  const summary = useMemo(() => {
    const m = new Map<string, { partner: string; count: number; supply: number; vat: number }>()
    for (const r of shown) {
      const g = m.get(r.partnerName) ?? { partner: r.partnerName, count: 0, supply: 0, vat: 0 }
      g.count += 1; g.supply += r.supplyAmount; g.vat += r.vatAmount
      m.set(r.partnerName, g)
    }
    return [...m.values()].sort((a, b) => b.supply - a.supply)
  }, [shown])

  useEffect(() => { loadSupplierParty().then(setCompany) }, [])

  /**
   * 견적서 [인쇄] — 원본은 새 창이 아니라 목록 위 '견적서' 인쇄 미리보기 창이다(2026-10-31 loginad C000071 실측 — 머리 · 금액 줄 ·
   * 품목 격자 · 아래 상자, [✓내자기본 ⌄] [인쇄│▴] [Email│▴] [PDF] [Excel(표시형식)] [닫기]). 줄 [인쇄] 는 그 견적 하나, 하단 [인쇄] 는 고른 견적들.
   */
  const [slipDocs, setSlipDocs] = useState<SlipPrintDoc[] | null>(null)
  const toSlip = (q: Quotation) => {
    const p = partners.find((x) => x.id === q.partnerId)
    return quoteSlip({ key: q.id, dateNo: dateNo(q), partnerName: q.partnerName, partnerTel: p?.phone, partnerFax: p?.fax,
      employeeName: q.employeeName, validUntil: q.validUntil, supplyAmount: q.supplyAmount, vatAmount: q.vatAmount,
      totalAmount: q.totalAmount, lines: q.lines }, company)
  }
  function printQuote(q: Quotation) { setSlipDocs([toSlip(q)]) }
  function printChecked() {
    const list = shown.filter((q) => picked.has(q.id))
    if (list.length) setSlipDocs(list.map(toSlip))
  }

  /**
   * 하단 [다른전표생성 ▴] › 주문서 › <b>1장라인별</b> — 원본은 고른 견적으로 채운 '주문서입력' 창을 띄우고, [저장(F8)] 을 눌러야 주문서가 생긴다
   * (2026-10-14 원본에서 저장까지 실측: 일자 · 납기일자 오늘, 거래처 · 줄은 견적 그대로, 출하창고가 비면 그 칸만 빨갛게 · 저장 뒤 말 없이 닫힘).
   * 고른 견적 여럿은 주문서 한 장으로 모인다. 창은 주문서조회 화면의 입력 창을 쓴다.
   */
  function convertChecked() {
    setMenuAt(null)
    if (!requireSelection(picked.size)) return
    const ids = shown.filter((q) => picked.has(q.id)).map((q) => q.id)
    if (ids.length === 0) return
    navigate(`/sales/orders?fromQuotes=${ids.join(',')}`)
  }

  /*
   * 하단 [다른전표생성 ▴] › 주문서 › <b>전표라인별</b> — 원본 실측(2026-10-21): '다른전표생성 입력' 창(일자 · 거래처 · 담당자 · 출하창고 · 거래유형 · 통화 ·
   * 프로젝트 · 납기일자 · 새로운 항목 추가 마다 ◉기본입력 ○직접입력, [저장(F8)] [닫기]) → 저장하면 고른 견적마다 주문서가 한 장씩 바로 생기고
   * '알림 / 성공 : N건 / 실패 : M건 / [닫기]'. 같은 견적을 1장라인별로 다시 하면 막지 않고 줄이 빈 주문서입력 창이 뜬다.
   */
  const [lineWin, setLineWin] = useState(false)
  /* 직접설정 → '다른전표생성 설정' 창 → (집계면) '다른전표생성 집계' 창 → '다른전표생성 입력' 창 */
  const [setWin, setSetWin] = useState(false)
  const [aggWin, setAggWin] = useState(false)
  const [genCriteria, setGenCriteria] = useState<'ONE' | 'SUM'>('ONE')
  const [genGroup, setGenGroup] = useState<'LINE' | 'ITEM'>('LINE')
  const [genByItem, setGenByItem] = useState(false)
  /* 직접입력을 고른 칸만 값을 따로 받는다(원본: 라디오를 바꾸면 그 줄에 일자 · 코드도움 · 선택 칸이 나타난다). */
  const [genDirect, setGenDirect] = useState<Record<string, boolean>>({})
  /* 거래유형 · 통화 직접입력: 원본 select — 거래유형 '부가세율 적용'(기본) · '부가세율 미적용', 통화 '내자'(기본) · 외화등록 통화(2026-10-22 실측). */
  const [genVal, setGenVal] = useState<{ date: string; partner: string; wh: string; project: string; due: string; emp: string; taxable: boolean; currency: string }>({ date: '', partner: '', wh: '', project: '', due: '', emp: '', taxable: true, currency: '' })
  const GEN_FIELDS = ['일자', '거래처', '담당자', '출하창고', '거래유형', '통화', '프로젝트', '납기일자', '새로운 항목 추가']
  async function convertPerSlip(byItem = false) {
    const todayStr = ymd(new Date())
    const targets = shown.filter((q) => picked.has(q.id))
    let ok = 0
    let fail = 0
    for (const q of targets) {
      try {
        await api.post('/quotations/convert', {
          quotationIds: [q.id],
          order: {
            partnerId: genDirect['거래처'] && genVal.partner ? Number(genVal.partner) : q.partnerId,
            orderDate: genDirect['일자'] && genVal.date ? genVal.date : todayStr,
            dueDate: genDirect['납기일자'] ? (genVal.due || undefined) : todayStr,
            warehouseId: genDirect['출하창고'] && genVal.wh ? Number(genVal.wh) : q.warehouseId ?? undefined,
            projectId: genDirect['프로젝트'] && genVal.project ? Number(genVal.project) : q.projectId ?? undefined,
            employeeId: genDirect['담당자'] ? (genVal.emp ? Number(genVal.emp) : undefined) : q.employeeId ?? undefined,
            taxable: genDirect['거래유형'] ? genVal.taxable : q.vatAmount > 0,
            currencyCode: genDirect['통화'] ? genVal.currency : undefined,
            lines: byItem
              /* 자료묶음기준 [품목별] — 같은 품목 줄을 한 줄로(수량 합 · 단가는 가중평균, 원본 2026-10-21: 포장재 3 × 500 + 1 × 700 → 4 · 공급가 2,200). */
              ? [...q.lines.reduce((m, l) => {
                  const cur = m.get(l.itemId) ?? { itemId: l.itemId, quantity: 0, supply: 0 }
                  cur.quantity += l.quantity; cur.supply += l.quantity * l.unitPrice
                  return m.set(l.itemId, cur)
                }, new Map<number, { itemId: number; quantity: number; supply: number }>()).values()]
                  .map((v) => ({ itemId: v.itemId, quantity: v.quantity, unitPrice: v.supply / v.quantity }))
              : q.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice })),
          },
        })
        ok++
      } catch { fail++ }
    }
    setLineWin(false)
    setPicked(new Set())
    load()
    void ecAlert(`성공 : ${ok}건\n실패 : ${fail}건`)
  }

  /**
   * 하단 [다른전표생성 ▲] › 주문서 — 버튼 위에 '주문서 │ 1장라인별 · 전표라인별 · 직접설정' 판을 띄운다.
   * 원본은 고른 줄이 없어도 목록이 뜨고(2026-10-31 loginad), 실제로 만들려 할 때 고른 줄을 묻는다.
   */
  function openMenu(kind: 'gen', label: string) {
    const btn = [...document.querySelectorAll<HTMLButtonElement>('.ec-footer button')].find((b) => b.textContent?.trim().startsWith(label))
    const r = btn?.getBoundingClientRect()
    setMenuAt({ kind, left: r?.left ?? 200, bottom: r ? window.innerHeight - r.top + 4 : 48 })
  }
  /** 원본 메뉴 '▾미확인 › 미확인', '▾확인 › 진행중 · 완료' — 고르면 말 없이 목록이 바뀐다. */
  async function changeStatus(status: QuotationStatus) {
    /* 원본은 고른 줄이 없어도 [진행상태변경] 메뉴를 먼저 띄운다 — 알림은 고를 때(2026-10-30 클릭 대조). */
    if (!requireSelection(picked.size)) return
    const fails: string[] = []
    for (const id of picked) {
      try { await api.patch(`/quotations/${id}/status`, { status }) }
      catch (err) { fails.push(extractErrorMessage(err)) }
    }
    setPicked(new Set())
    load()
    if (fails.length) void ecAlert(fails.join('\n'))
  }

  /**
   * 창의 [이전] · [다음] — 판매조회 창과 같은 잣대: 일자-No. 차례로 바로 앞(더 옛) 견적이 [이전], 바로 뒤가 [다음].
   * 끝이면 '알림 / 다음 자료가 없습니다.' 를 띄우고 [확인] 하면 창도 닫힌다. 지금 걸러 보이는 견적 안에서만 옮긴다.
   */
  async function movePopup(dir: 'prev' | 'next') {
    const ordered = [...shown].sort((a, b) => a.quoteDate.localeCompare(b.quoteDate) || a.quoteNo.localeCompare(b.quoteNo))
    const i = ordered.findIndex((q) => q.id === popup?.id)
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
    if (changed) load()
  }

  async function openGenerated(q: Quotation) {
    try { setGenerated({ quote: q, rows: (await api.get<GeneratedRow[]>(`/quotations/${q.id}/generated`)).data }) }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  /*
   * 원본 하단 단추줄의 <b>[선택삭제]</b> — 고른 줄을 한 번에 지운다. 줄마다 [삭제]는
   * 진작 있었지만, 잘못 올린 견적서 열 줄을 지우려면 열 번 묻고 열 번 눌러야 했다.
   *
   * <p>하나가 막혀도 <b>거기서 멈추지 않는다</b> — 나머지는 지우고 몇 건이 남았는지 알려 준다.
   */
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const pick = (id: number) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  async function removeChecked() {
    const ids = [...picked]
    /* 원본 견적서조회 [선택삭제] 확인(2026-10-21 실측): '전표를 삭제하겠습니까?' 아래 줄 '- 견적서조회' [확인] [취소]. */
    if (!(await ecConfirm('전표를 삭제하겠습니까?\n- 견적서조회'))) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/quotations/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError(failed ? `${failed}건은 삭제하지 못했습니다(이미 수주로 넘어간 견적서일 수 있습니다).` : '')
    load()
  }

  return (
    <EcListShell
      onSearch={load}
      onReset={reset}
      title={statusView ? '견적서현황' : '견적서조회'}
      search={keyword}
      onSearchChange={setKeyword}
      newLabel="신규(F2)"
      onNew={() => setPopup({ id: null, copied: false })}
      formMenu={{ current: '기본(수정불가)' }}
      /* 원본 견적서조회 [Option](2026-10-31 loginad) — 판매조회와 같은 여섯. 우리에게 없는 설정이라 누르면 안내만 한다. */
      optionMenu={[
        { label: '업무설정', onClick: notHere('업무설정') },
        { label: '검색항목설정', onClick: notHere('검색항목설정') },
        { label: '양식설정', sub: [
          { label: '기본(수정불가)', active: true, onClick: () => void ecAlert('양식은 하나만 지원합니다.') },
          { label: '신규양식추가', onClick: () => void ecAlert('신규양식추가는 지원하지 않습니다(양식 하나).') },
        ] },
        { label: '조건양식설정', onClick: notHere('조건양식설정') },
        { label: '문서발송내역', onClick: notHere('문서발송내역') },
        { label: '견적서조회(OLD)', onClick: notHere('견적서조회(OLD)') },
      ]}
      /*
       * 원본 하단(2026-10-31 loginad C000071): 신규(F2) · [Email│▲] · [진행상태변경 ▲] · [보내기 ▲] · [인쇄│▲ 프린트문제해결] ·
       * [바코드(품목)│▲ 바코드(품목) · 바코드(사업장/번호No.)] · [다른전표생성 ▲ 주문서] · 전자결재 · 선택삭제 · [Excel(표시형식)│▲ Excel(데이터)] ·
       * 이력조회 · 웹자료올리기. │▲ 는 갈라진 단추, 글자 ▲ 는 한 단추(판매조회와 같은 FooterButton). Email ▲ 항목은 원본 기록이 없어 판매조회와 같게(카카오톡).
       * 보내기 · 전자결재 · 웹자료올리기 · 카카오톡 · 바코드는 받쳐 줄 것이 없어 안내만.
       */
      actions={[
        { label: 'Email', onClick: () => void ecAlert(EMAIL_NOT_HERE), menu: [{ label: '카카오톡', onClick: notHere('카카오톡') }] },
        /* 원본 펼침은 '▾ 미확인 › 미확인', '▾ 확인 › 진행중 · 완료' 두 묶음 — 셸 펼침에 묶음 머리가 없어 세 줄로 편다. 고른 줄은 고를 때 묻는다. */
        { label: '진행상태변경', menuOnly: true, selected: picked.size, menu: [
          { label: '미확인', onClick: () => void changeStatus('UNCONFIRMED') },
          { label: '진행중', onClick: () => void changeStatus('IN_PROGRESS') },
          { label: '완료', onClick: () => void changeStatus('COMPLETED') },
        ] },
        { label: '보내기', menuOnly: true, menu: ['E Note', '대화방', '사용자', '북마크'].map((l) => ({ label: l, onClick: notHere(`보내기 › ${l}`) })) },
        { label: '인쇄', onClick: printChecked, selected: picked.size, menu: [{ label: '프린트문제해결', onClick: notHere('프린트문제해결') }] },
        { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE), selected: picked.size, menu: [
          { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE) },
          { label: '바코드(사업장/번호No.)', onClick: notHere('바코드(사업장/번호No.)') },
        ] },
        { label: '다른전표생성', menuOnly: true, menu: [{ label: '주문서', onClick: () => openMenu('gen', '다른전표생성') }] },
        { label: '전자결재', onClick: notHere('전자결재') },
        { label: '선택삭제', onClick: removeChecked, selected: picked.size },
        { label: 'Excel(표시형식)', menu: [{ label: 'Excel(데이터)' }] },
        { label: '이력조회', onClick: () => setHistoryWin(true) },
        { label: '웹자료올리기', onClick: notHere('웹자료올리기') },
      ]}>
      {popup && (
        <ProductionSlipWindow title={popup.id != null && !popup.copied ? '견적서수정' : '견적서입력'}
                              popout={popup.id != null && !popup.copied ? `/sales/quotation-entry?edit=${popup.id}` : '/sales/quotation-entry'}
                              onClose={() => closePopup(false)}>
          {/* 원본 견적서수정 머리 [확인취소] — 판매입력(수정) 창과 같이 이 회사 설정으로는 알림만 뜬다. */}
          {popup.id != null && !popup.copied && (
            <div className="flex justify-end mb-[6px]">
              <button type="button" className="ec-btn ec-btn-sm"
                      onClick={() => void ecAlert('전표상태관리유형 설정으로 인해 전표상태를 변경할 수 없습니다.')}>확인취소</button>
            </div>
          )}
          <QuotationEntry key={popup.id ?? 'new'} popup={{
            editId: popup.copied ? null : popup.id,
            onClose: closePopup,
            onMove: (dir) => void movePopup(dir),
            onCopy: () => setPopup((p) => (p ? { ...p, copied: true } : p)),
          }} />
        </ProductionSlipWindow>
      )}
      {slipDocs && <EcSlipPrintModal title="견적서" docs={slipDocs} forms={['내자기본']} width={726} pdf excelLabel="Excel(표시형식)" onClose={() => setSlipDocs(null)} />}
      {historyWin && <SlipMenuHistoryModal menu="견적서" statusLabel="확인" onClose={() => setHistoryWin(false)} />}
      {menuAt && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuAt(null)} />
          <div className="ec-menu fixed" style={{ left: menuAt.left, bottom: menuAt.bottom }} role="menu" aria-label="다른전표생성">
            {/* 원본 '주문서 │ 1장라인별 · 전표라인별 · 직접설정' 한 줄. 고른 줄이 없으면 고를 때 원본 알림. */}
            <div className="flex items-center gap-[9px] px-[9px] py-[4.5px]">
              <span>주문서</span>
              <button className="ec-link" onClick={convertChecked}>1장라인별</button>
              <button className="ec-link" onClick={() => { setMenuAt(null); if (requireSelection(picked.size)) { setGenByItem(false); setLineWin(true) } }}>전표라인별</button>
              <button className="ec-link" onClick={() => { setMenuAt(null); if (requireSelection(picked.size)) setSetWin(true) }}>직접설정</button>
            </div>
          </div>
        </>
      )}

      <Modal open={setWin} title="다른전표생성 설정" width={420} onClose={() => setSetWin(false)}>
        <table className="w-full"><tbody>
          <tr><td className="w-[120px]">일괄생성기준</td><td>
            <label className="mr-[12px]"><input type="radio" name="gen-crit" checked={genCriteria === 'ONE'} onChange={() => setGenCriteria('ONE')} /> 1장</label>
            <label><input type="radio" name="gen-crit" checked={genCriteria === 'SUM'} onChange={() => setGenCriteria('SUM')} /> 집계</label></td></tr>
          <tr><td>자료묶음기준</td><td>
            <label className="mr-[12px]"><input type="radio" name="gen-grp" checked={genGroup === 'LINE'} onChange={() => setGenGroup('LINE')} /> 라인별</label>
            <label><input type="radio" name="gen-grp" checked={genGroup === 'ITEM'} onChange={() => setGenGroup('ITEM')} /> 품목별</label></td></tr>
        </tbody></table>
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => {
            setSetWin(false)
            if (genCriteria === 'ONE' && genGroup === 'LINE') { convertChecked(); return }
            setGenByItem(genGroup === 'ITEM'); setAggWin(true)
          }}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setSetWin(false)}>닫기</button>
        </div>
      </Modal>
      <Modal open={aggWin} title="다른전표생성 집계" width={640} onClose={() => setAggWin(false)}>
        {(() => {
          const sel = shown.filter((q) => picked.has(q.id))
          const sum = (f: (q: Quotation) => number) => sel.reduce((n, q) => n + f(q), 0)
          const qty = (q: Quotation) => q.lines.reduce((n, l) => n + l.quantity, 0)
          return (
            <table className="w-full">
              <thead><tr><th>일자</th><th className="text-right">전표번호</th><th className="text-right">수량</th><th className="text-right">공급가액</th><th className="text-right">부가세</th><th className="text-right">합계</th></tr></thead>
              <tbody>
                {sel.map((q) => (
                  <tr key={q.id}><td>{q.quoteDate.replace(/-/g, '/')}</td><td className="text-right">{Number(q.quoteNo.split('-').pop())}</td>
                    <td className="text-right">{qty(q)}</td><td className="text-right">{q.supplyAmount.toLocaleString('ko-KR')}</td>
                    <td className="text-right">{q.vatAmount.toLocaleString('ko-KR')}</td><td className="text-right">{q.totalAmount.toLocaleString('ko-KR')}</td></tr>
                ))}
                <tr className="font-bold"><td colSpan={2}></td><td className="text-right">{sum(qty)}</td>
                  <td className="text-right">{sum((q) => q.supplyAmount).toLocaleString('ko-KR')}</td>
                  <td className="text-right">{sum((q) => q.vatAmount).toLocaleString('ko-KR')}</td>
                  <td className="text-right">{sum((q) => q.totalAmount).toLocaleString('ko-KR')}</td></tr>
              </tbody>
            </table>
          )
        })()}
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => { setAggWin(false); setLineWin(true) }}>생성(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setAggWin(false)}>닫기</button>
        </div>
      </Modal>
      <Modal open={lineWin} title="다른전표생성 입력" width={520} onClose={() => setLineWin(false)}>
        <table className="w-full">
          <tbody>
            {GEN_FIELDS.map((f) => (
              <tr key={f}>
                <td className="w-[150px]">{f}</td>
                <td>
                  <label className="mr-[12px]"><input type="radio" name={`gen-${f}`} checked={!genDirect[f]} onChange={() => setGenDirect((d) => ({ ...d, [f]: false }))} /> 기본입력</label>
                  <label className="mr-[12px]"><input type="radio" name={`gen-${f}`} checked={!!genDirect[f]} onChange={() => setGenDirect((d) => ({ ...d, [f]: true }))} /> 직접입력</label>
                  {genDirect[f] && f === '일자' && <EcDateInput className="ec-input" value={genVal.date} onChange={(e) => setGenVal((v) => ({ ...v, date: e.target.value }))} />}
                  {genDirect[f] && f === '납기일자' && <EcDateInput className="ec-input" value={genVal.due} onChange={(e) => setGenVal((v) => ({ ...v, due: e.target.value }))} />}
                  {genDirect[f] && f === '거래처' && (
                    <CodePickerField label="거래처" hideLabel width={200} emptyLabel="" value={genVal.partner} onChange={(v) => setGenVal((x) => ({ ...x, partner: v }))}
                                     items={partners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />)}
                  {genDirect[f] && f === '출하창고' && (
                    <CodePickerField label="출하창고" hideLabel width={200} emptyLabel="" value={genVal.wh} onChange={(v) => setGenVal((x) => ({ ...x, wh: v }))}
                                     items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />)}
                  {genDirect[f] && f === '담당자' && (
                    <CodePickerField label="담당자" hideLabel width={200} emptyLabel="" value={genVal.emp} onChange={(v) => setGenVal((x) => ({ ...x, emp: v }))}
                                     items={genEmps.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />)}
                  {genDirect[f] && f === '거래유형' && (
                    <select className="ec-input w-[200px]" value={genVal.taxable ? 'Y' : 'N'} onChange={(e) => setGenVal((x) => ({ ...x, taxable: e.target.value === 'Y' }))}>
                      <option value="Y">부가세율 적용</option><option value="N">부가세율 미적용</option>
                    </select>)}
                  {genDirect[f] && f === '통화' && (
                    <select className="ec-input w-[200px]" value={genVal.currency} onChange={(e) => setGenVal((x) => ({ ...x, currency: e.target.value }))}>
                      <option value="">내자</option>
                      {genCurrencies.map((c) => <option key={c.id} value={c.code}>{c.name} [{c.code}]</option>)}
                    </select>)}
                  {genDirect[f] && f === '프로젝트' && (
                    <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="" value={genVal.project} onChange={(v) => setGenVal((x) => ({ ...x, project: v }))}
                                     items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[6px] mt-[10px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void convertPerSlip(genByItem)}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setLineWin(false)}>닫기</button>
        </div>
      </Modal>
      <Modal open={generated != null} title="생성한 전표" width={760} onClose={() => setGenerated(null)}>{generated && (
        <div>
          <p className="mb-[6px]">견적서조회 : {dateNo(generated.quote)}</p>
          <table className="w-full text-left">
            <thead><tr>
              <th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th><th className="text-right">잔량</th>
              <th>생성한 전표</th><th>생성한 전표일자-No.</th>
            </tr></thead>
            <tbody>
              {generated.rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.itemCode}</td><td>{r.itemName}</td><td>{r.spec ?? ''}</td>
                  <td className="text-right">{fmtNumber(r.quantity)}</td><td className="text-right">{/* 원본은 다 넘어간 줄의 잔량을 비워 둔다(2026-10-14 실측 — 0 이 아니다). */}{r.remaining ? fmtNumber(r.remaining) : ''}</td>
                  <td>{r.slipType ?? ''}</td><td>{r.slipDate && r.slipNo ? dateNo({ quoteDate: r.slipDate, quoteNo: r.slipNo }) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-[8px]"><button type="button" className="ec-btn" onClick={() => setGenerated(null)}>닫기</button></div>
        </div>
      )}</Modal>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/* 상태 필터는 원본에서 알약(pill)이다 — 선택된 것만 파란 알약으로 채워진다. */}
      {/* 원본 조건 차례: … 거래처 · <b>품목</b> · 발송여부 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/*
          원본 조건 판의 <b>맨 위 두 줄</b>(2026-09-08 견적서현황 실측).
          [메뉴]는 현황★·집계, [구분] 안에는 비교기간이 있다.
        */}
        {statusView && <EcCond label="메뉴">
          <div className="ec-pills">
            {(['현황', '집계'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${menu === m ? ' active' : ''}`}
                      onClick={() => setMenu(m)}>{m}</button>
            ))}
          </div>
        </EcCond>}
        {statusView && <EcCond label="구분">
          <select className="ec-input" value={compare} style={{ width: 150 }}
                  onChange={(e) => setCompare(e.target.value as ComparePeriod)}>
            {COMPARE_PERIODS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {prevRange && (
            <span className="text-[11.5px] text-ec-label">
              비교 대상 {prevRange.from.replace(/-/g, '/')} ~ {prevRange.to.replace(/-/g, '/')}
              {' · 견적 '}{prevTotals.count}건 · {prevTotals.supply.toLocaleString()}원
            </span>
          )}
        </EcCond>}
        {/* 원본 조건 차례의 첫째 <b>[기준일자]</b>. 단추는 원본대로 종료일 다음에 최근30일(+1개월). */}
        <EcCond label="기준일자">
          <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="견적No.">
          <input className="ec-input" value={noCond} placeholder="견적No."
                 onChange={(e) => setNoCond(e.target.value)} style={{ width: 160 }} />
        </EcCond>
        <EcCond label="내.외자구분">
          <div className="ec-pills">
            {(['전체', '내자', '외자'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${fxCond === v ? ' active' : ''}`} onClick={() => setFxCond(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={whCond} onChange={setWhCond}
                           items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체"
                           value={projCond} onChange={setProjCond}
                           items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        {/*
          원본 [관리항목] — 차례는 [프로젝트] 다음, [거래처] 앞이다(사본 실측).
          관리항목은 <b>품목 마스터에 붙는 값</b>이라 전표 응답에 실려 오지 않는다.
          그래서 오래도록 '못 만든다' 고 적어 뒀는데, 판매현황이 이미 다른 길로 만들어 두었다 —
          품목 마스터를 받아 <b>줄의 itemId 로 화면에서 잇는다</b>.
        */}
        <EcCond label="관리항목" pick>
          <CodePickerField label="관리항목" hideLabel width={170} emptyLabel="전체"
                           value={mgmtCond} onChange={setMgmtCond}
                           items={mgmt.options.map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={180} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond}
                           items={partners.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={190} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond}
                           items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, sub: x.spec }))} />
        </EcCond>
        <EcCond label="발송여부">
          <div className="ec-pills">
            {(['전체', '미발송', '발송'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${sentCond === v ? ' active' : ''}`} onClick={() => setSentCond(v)}>{v}</button>
            ))}
          </div>
        </EcCond>
        {/* 접힌 줄(⌄)을 펼치면 [발송여부] 와 [기타] 사이에 뒤쪽 칸이 들어선다(원본 차례: … 발송여부 · 규격 … 최종수정일시 · 기타). */}
        {moreConds && <>
        {/*
          원본 견적서조회 차례: … 발송여부 · (오더관리번호) · <b>규격</b> · (담당자) ·
          <b>거래처관리담당자</b> · (거래유형) · <b>적요</b> · (적요1~3 · 문자형식1~5 ·
          장문형식1 · 참조 · 결제조건) · <b>유효기간</b> · <b>작성자</b> · …
        */}
        <EcCond label="규격">
          <ItemSuggestInput field="spec" value={specCond} placeholder="전체"
                            onChange={(v) => setSpecCond(v)} width={130} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={pmCond} onChange={setPmCond}
                           items={[...new Set(partners.map((x) => x.manager).filter(Boolean) as string[])].sort()
                             .map((m) => ({ value: m, name: m }))} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" style={{ width: 190 }} value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} placeholder="전체" />
        </EcCond>
        {/* 표에 [유효기간] 열을 찍으면서 "이 날짜까지 유효한 것" 을 고를 수가 없었다. */}
        <EcCond label="유효기간">
          <EcDateInput className="ec-input" value={validCond} onChange={(e) => setValidCond(e.target.value)} />
        </EcCond>
        {/* 원본 펼친 판의 뒤쪽 칸 — [진행상태] 다음이 [작성자]다(2026-09-09 실측). */}
        <EcCond label="작성자">
          <input className="ec-input" style={{ width: 110 }} value={authorCond}
                 onChange={(e) => setAuthorCond(e.target.value)} placeholder="전체" />
        </EcCond>
        {/* 원본 차례: [작성자] 다음이 [최종수정자]·[최초작성일자]·<b>[최종수정일시]</b> 다. */}
        <EcCond label="최종수정일시">
          <div className="flex items-center gap-[4px]">
            <EcDateRange from={{ className: "ec-input", value: upFrom, onChange: (e) => setUpFrom(e.target.value) }} to={{ className: "ec-input", value: upTo, onChange: (e) => setUpTo(e.target.value) }} />
          </div>
        </EcCond>
        </>}
        {/* 원본 차례: 판의 끝이 [기타] 다(2026-09-07 실측). */}
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
        {/* 원본 접힌 줄(⌄) — 펼치면 뒤쪽 조건이 나오고, 다시 누르면 접힌다(작업지시서조회와 같은 단추). */}
        <li className="full justify-center">
          <button type="button" className="ec-btn ec-btn-sm" aria-expanded={moreConds}
                  title={moreConds ? '조건 접기' : '조건 더 보기'} aria-label={moreConds ? '조건 접기' : '조건 더 보기'} onClick={() => setMoreConds((v) => !v)}>
            <EcIcon name={moreConds ? 'chevron-up' : 'chevron-down'} size={12} glyph={moreConds ? '▴' : '▾'} />
          </button>
        </li>
      </ul>

      {/* 원본 제목 옆 알약: 전체 · 결재중 · 미확인 · 확인 ▸ 진행중 – 완료 */}
      <div className="ec-pills mb-[8px]">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className={`ec-pill no-ec${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {/*
        원본 [메뉴]가 <b>집계</b>면 거래처별로 묶어 건수·공급가액을 낸다 —
        "이번 달에 어느 거래처에 얼마나 견적을 냈나" 가 이 화면의 물음이다.
        목록(현황)과 같은 조건을 그대로 쓴다.
      */}
      {menu === '집계' ? (
        <>
          <EcBarChart unit=" 원" emptyText="조회된 견적이 없습니다."
                      rows={summary.map((g) => ({ label: g.partner, value: g.supply }))} />
          <table className="w-full text-left mt-[10px]">
            <thead><tr>
              <th>거래처</th>
              <th className="w-[90px] text-right">건수</th>
              <th className="w-[150px] text-right">공급가액</th>
              <th className="w-[130px] text-right">부가세</th>
            </tr></thead>
            <tbody>
              {summary.length === 0 ? (
                <tr><td colSpan={4} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : summary.map((g) => (
                <tr key={g.partner}>
                  <td className="font-semibold">{g.partner}</td>
                  <td className="text-right">{g.count}</td>
                  <td className="text-right font-bold text-ec-blue">{g.supply.toLocaleString()}</td>
                  <td className="text-right text-ec-label">{g.vat.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
      statusView ? (
      <table className="w-full text-left">
        <thead><tr>
          <th className="w-[34px]"></th>
          <th>일자-No.</th><th>품목명(규격)</th><th className="text-right">수량</th><th className="text-right">단가</th>
          <th className="text-right">공급가액</th><th>거래처명</th><th>적요</th>
        </tr></thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.flatMap((q) => q.lines.map((l) => ({ q, l }))).map(({ q, l }, i) => (
            <tr key={`${q.id}-${l.id}`}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td><a className="cursor-pointer" onClick={() => setPopup({ id: q.id, copied: false })}>{dateNo(q)}</a></td>
              <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''}</td>
              <td className="text-right">{fmtNumber(l.quantity)}</td>
              <td className="text-right">{fmtNumber(l.unitPrice)}</td>
              <td className="text-right">{fmtNumber(l.supplyAmount)}</td>
              <td>{q.partnerName}</td>
              <td>{q.remark ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            {/* 원본 견적서조회(E040202) 열과 순서(2026-10-14 실측 폭 38 · 152 · 299 · 121 · 475 · 121 · 143 · 106 · 123 · 55, 머리 모두 가운데). */}
            <th className="w-[34px]"></th>
            <th className="w-[28px] text-center">
              <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && shown.every((q) => picked.has(q.id))}
                onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((q) => q.id)) : new Set())} />
            </th>
            <th className="w-[152px]">일자-No.</th>
            <th className="w-[299px]">거래처명</th>
            <th className="w-[121px]">사원(담당)명</th>
            <th>품목명(요약)</th>
            <th className="w-[121px]">유효기간</th>
            <th className="w-[143px] text-right">견적금액합계</th>
            <th className="w-[106px] text-center">진행상태</th>
            <th className="w-[123px] text-center">생성한전표</th>
            <th className="w-[55px] text-center">인쇄</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((q, i) => (
            <tr key={q.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-center"><input type="checkbox" aria-label="선택" checked={picked.has(q.id)} onChange={() => pick(q.id)} /></td>
              {/* 원본은 [일자-No.] 를 누르면 그 견적이 든 입력 창이 뜬다. */}
              <td><a className="cursor-pointer" onClick={() => setPopup({ id: q.id, copied: false })}>{dateNo(q)}</a></td>
              <td>{q.partnerName}</td>
              <td>{q.employeeName ?? ''}</td>
              {/* 원본 '포장재 [30cm*40cm]' · '코카콜라 [355ml] 외 1건' — 첫 품목에 규격을 대괄호로. */}
              <td>{q.lines[0]?.itemName ?? ''}{q.lines[0]?.spec ? ` [${q.lines[0].spec}]` : ''}{q.lines.length > 1 ? ` 외 ${q.lines.length - 1}건` : ''}</td>
              <td>{q.validUntil ? q.validUntil.replace(/-/g, '/') : ''}</td>
              <td className="text-right">{fmtNumber(q.totalAmount)}</td>
              <td className="text-center text-ec-navy">{q.statusName}</td>
              {/* 원본: 다른 전표(주문서)를 만든 줄만 주황 [조회] 배지가 선다 — 안 만든 줄은 빈칸(2026-10-31 loginad). */}
              <td className="text-center">{q.convertedOrderId ? <a className={`cursor-pointer ${GEN_TAG}`} onClick={() => void openGenerated(q)}>조회</a> : null}</td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => printQuote(q)}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      ))}

    </EcListShell>
  )
}

