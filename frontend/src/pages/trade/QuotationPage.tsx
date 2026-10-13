import { resolveSpecialPrice } from '../../features/price/specialPrice'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import { COMPARE_PERIODS, comparePeriodOf, fetchWindow, type ComparePeriod } from '../../components/EcPeriodPicks'
import EcBarChart from '../../components/EcBarChart'
import CodePickerField from '../../components/CodePickerField'
import CustomFieldsPanel from '../../components/CustomFieldsPanel'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import type { Item, Partner, Quotation, QuotationStatus } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import EcPeriodPicks, { QUOTATION_PICKS, periodOf } from '../../components/EcPeriodPicks'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'
import { partnerCodeItems } from '../../utils/codeItems'
import { lineSupply } from '../../utils/lineSupply'
import EcNumInput from '../../components/EcNumInput'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

const won = (n: number) => n.toLocaleString('ko-KR')
const today = () => ymd(new Date())

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

interface LineForm { itemId: string; quantity: string; unitPrice: string }
const emptyLine = (): LineForm => ({ itemId: '', quantity: '', unitPrice: '' })

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
  const [warehouses, setWarehouses] = useState<{ id: number; code: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: number; code: string; name: string }[]>([])
  const [tab, setTab] = useState<Tab>('ALL')
  /** 빠른 검색칸(Search(F3) 옆) — 거래처명 · 일자-No. */
  const [keyword, setKeyword] = useState('')
  /** 하단 [진행상태변경 ▴] · [다른전표생성 ▴] 메뉴 — 버튼 위로 뜬다. */
  const [menuAt, setMenuAt] = useState<{ kind: 'status' | 'gen'; left: number; bottom: number } | null>(null)
  const [generated, setGenerated] = useState<{ quote: Quotation; rows: GeneratedRow[] } | null>(null)
  /** 견적서수정 — [일자-No.] 로 연 견적. */
  const [editing, setEditing] = useState<Quotation | null>(null)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
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
  const [company, setCompany] = useState<DocParty | null>(null)

  /*
   * 원본 <b>[다시 작성]</b> — 조건을 처음 상태로 되돌린다. 조건이 여덟 칸이라
   * 하나씩 지우게 두면 무엇이 남았는지 모른 채 빈 표를 보게 된다.
   */
  function reset() {
    const p = periodOf('최근30일(+1개월)')!
    setFrom(p.from); setTo(p.to)
    setItemCond(''); setNoCond(''); setWhCond(''); setProjCond(''); setSentCond('전체')
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
    api.get<{ id: number; code: string; name: string }[]>('/warehouses').then((r) => setWarehouses(r.data)).catch(() => {})
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
    /* 원본 [수정일자순(정렬)] — 고친 순으로 본다. 안 고친 건은 만든 때가 곧 고친 때다. */
    .sort((a, b) => (byUpdated ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id - a.id : 0)),
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [rows, tab, keyword, from, to, itemCond, sentCond, whCond, projCond, noCond, mgmtCond, mgmt.options,
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

  /** 견적서 서식 인쇄 — 거래명세서와 같은 템플릿을 쓴다(제목·유효기간만 다르다). */
  async function printQuote(q: Quotation) {
    const p = partners.find((x) => x.id === q.partnerId)
    await printDocuments([{
      title: '견 적 서',
      docNo: q.quoteNo,
      docDate: q.quoteDate,
      supplier: company ?? { label: '공급자', name: '(회사정보 미등록)' },
      customer: {
        label: '수신처', name: q.partnerName,
        bizRegNo: p?.bizRegNo, ceo: p?.ceoName, bizType: p?.bizType, bizItem: p?.bizItem,
        tel: p?.phone, address: p?.address,
      },
      extra: [{ label: '유효기간', value: q.validUntil }, { label: '담당', value: q.createdBy }],
      remark: q.remark,
      lines: q.lines.map((l) => ({
        itemCode: l.itemCode, itemName: l.itemName, unit: l.unit,
        quantity: l.quantity, unitPrice: l.unitPrice, supplyAmount: l.supplyAmount, vatAmount: l.vatAmount,
      })),
      footNote: '아래와 같이 견적합니다.',
    }])
  }

  /**
   * 하단 [다른전표생성 ▴] › 주문서 — 원본은 고른 견적으로 '주문서입력' 창을 미리 채워 띄운다(거래처 · 품목 줄 · 일자 오늘, 2026-10-14 실측).
   * 우리는 같은 내용으로 바로 주문서를 만든다(창 없이 — 남은 것). 고른 것이 여럿이면 한 장씩.
   */
  async function convertChecked() {
    setMenuAt(null)
    const targets = shown.filter((q) => picked.has(q.id))
    const fails: string[] = []
    const made: string[] = []
    for (const q of targets) {
      try { made.push((await api.post<{ orderNo: string }>(`/quotations/${q.id}/convert`)).data.orderNo) }
      catch (err) { fails.push(extractErrorMessage(err)) }
    }
    setPicked(new Set())
    load()
    if (fails.length) void ecAlert(fails.join('\n'))
    else if (made.length && (await ecConfirm(`주문서 ${made.join(', ')} 을(를) 만들었습니다. 주문서조회로 이동할까요?`))) navigate('/sales/orders')
  }

  /** 하단 [진행상태변경] · [다른전표생성] — 버튼 위에 메뉴를 띄운다. 고른 줄이 없으면 셸이 먼저 알린다. */
  function openMenu(kind: 'status' | 'gen', label: string) {
    const btn = [...document.querySelectorAll<HTMLButtonElement>('.ec-footer button')].find((b) => b.textContent?.trim() === label)
    const r = btn?.getBoundingClientRect()
    setMenuAt({ kind, left: r?.left ?? 200, bottom: r ? window.innerHeight - r.top + 4 : 48 })
  }
  /** 원본 메뉴 '▾미확인 › 미확인', '▾확인 › 진행중 · 완료' — 고르면 말 없이 목록이 바뀐다. */
  async function changeStatus(status: QuotationStatus) {
    setMenuAt(null)
    const fails: string[] = []
    for (const id of picked) {
      try { await api.patch(`/quotations/${id}/status`, { status }) }
      catch (err) { fails.push(extractErrorMessage(err)) }
    }
    setPicked(new Set())
    load()
    if (fails.length) void ecAlert(fails.join('\n'))
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
    if (!(await ecConfirm(`고른 ${ids.length}건을 삭제할까요?`))) return
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
      onNew={() => { setEditing(null); setShowForm(true) }}
      /* 원본 차례(2026-10-14 실측): 신규(F2) · Email · 진행상태변경 · 보내기 · 인쇄 · 바코드(품목) · 다른전표생성 · 전자결재 · 선택삭제 · Excel(표시형식) · 이력조회 · 웹자료올리기 — 바깥 발송 · 결재는 뺀다. */
      actions={[
        { label: '진행상태변경', onClick: () => openMenu('status', '진행상태변경'), selected: picked.size },
        { label: '인쇄' },
        { label: '다른전표생성', onClick: () => openMenu('gen', '다른전표생성'), selected: picked.size },
        { label: '선택삭제', onClick: removeChecked, selected: picked.size },
        { label: 'Excel' },
      ]}>
      {menuAt && (
        <>
          <div className="ec-backdrop-clear" onClick={() => setMenuAt(null)} />
          {menuAt.kind === 'status' ? (
            <div className="ec-menu fixed" style={{ left: menuAt.left, bottom: menuAt.bottom }} role="menu" aria-label="진행상태변경">
              <div className="px-[10px] pt-[4px] text-ec-label">▾ 미확인</div>
              <button onClick={() => changeStatus('UNCONFIRMED')}>미확인</button>
              <div className="px-[10px] pt-[4px] text-ec-label">▾ 확인</div>
              <button onClick={() => changeStatus('IN_PROGRESS')}>진행중</button>
              <button onClick={() => changeStatus('COMPLETED')}>완료</button>
            </div>
          ) : (
            <div className="ec-menu fixed" style={{ left: menuAt.left, bottom: menuAt.bottom }} role="menu" aria-label="다른전표생성">
              <button onClick={() => void convertChecked()}>주문서</button>
            </div>
          )}
        </>
      )}

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
                  <td className="text-right">{won(r.quantity)}</td><td className="text-right">{won(r.remaining)}</td>
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
        <EcCond label="메뉴">
          <div className="ec-pills">
            {(['현황', '집계'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${menu === m ? ' active' : ''}`}
                      onClick={() => setMenu(m)}>{m}</button>
            ))}
          </div>
        </EcCond>
        <EcCond label="구분">
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
        </EcCond>
        {/* 원본 조건 차례의 첫째 <b>[기준일자]</b>. 단추는 원본대로 종료일 다음에 최근30일(+1개월). */}
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from}
                 onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span className="my-0 mx-[4px] text-ec-hint">~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={QUOTATION_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="견적No.">
          <input className="ec-input" value={noCond} placeholder="견적No."
                 onChange={(e) => setNoCond(e.target.value)} style={{ width: 160 }} />
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
          <select className="ec-input" value={sentCond} style={{ width: 100 }}
                  onChange={(e) => setSentCond(e.target.value as '전체' | '발송' | '미발송')}>
            <option>전체</option><option>발송</option><option>미발송</option>
          </select>
        </EcCond>
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
          <input className="ec-input" type="date" style={{ width: 140 }} value={validCond}
                 onChange={(e) => setValidCond(e.target.value)} />
        </EcCond>
        {/* 원본 펼친 판의 뒤쪽 칸 — [진행상태] 다음이 [작성자]다(2026-09-09 실측). */}
        <EcCond label="작성자">
          <input className="ec-input" style={{ width: 110 }} value={authorCond}
                 onChange={(e) => setAuthorCond(e.target.value)} placeholder="전체" />
        </EcCond>
        {/* 원본 차례: [작성자] 다음이 [최종수정자]·[최초작성일자]·<b>[최종수정일시]</b> 다. */}
        <EcCond label="최종수정일시">
          <div className="flex items-center gap-[4px]">
            <input className="ec-input" type="date" style={{ width: 140 }} value={upFrom}
                   onChange={(e) => setUpFrom(e.target.value)} />
            <span className="text-ec-hint">~</span>
            <input className="ec-input" type="date" style={{ width: 140 }} value={upTo}
                   onChange={(e) => setUpTo(e.target.value)} />
          </div>
        </EcCond>
        {/* 원본 차례: [발송여부] 다음이 [기타] 다(2026-09-07 실측). */}
        <EcCond label="기타">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
            수정일자순(정렬)
          </label>
        </EcCond>
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
              <td><a className="cursor-pointer" onClick={() => { setEditing(q); setShowForm(true) }}>{dateNo(q)}</a></td>
              <td>{l.itemName}{l.spec ? ` [${l.spec}]` : ''}</td>
              <td className="text-right">{won(l.quantity)}</td>
              <td className="text-right">{won(l.unitPrice)}</td>
              <td className="text-right">{won(l.supplyAmount)}</td>
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
            <th>일자-No.</th>
            <th>거래처명</th>
            <th>사원(담당)명</th>
            <th>품목명(요약)</th>
            <th>유효기간</th>
            <th className="text-right">견적금액합계</th>
            <th className="text-center">진행상태</th>
            <th className="text-center">생성한전표</th>
            <th className="text-center">인쇄</th>
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
              <td><a className="cursor-pointer" onClick={() => { setEditing(q); setShowForm(true) }}>{dateNo(q)}</a></td>
              <td>{q.partnerName}</td>
              <td>{q.createdBy ?? ''}</td>
              {/* 원본 '포장재 [30cm*40cm]' · '코카콜라 [355ml] 외 1건' — 첫 품목에 규격을 대괄호로. */}
              <td>{q.lines[0]?.itemName ?? ''}{q.lines[0]?.spec ? ` [${q.lines[0].spec}]` : ''}{q.lines.length > 1 ? ` 외 ${q.lines.length - 1}건` : ''}</td>
              <td>{q.validUntil ? q.validUntil.replace(/-/g, '/') : ''}</td>
              <td className="text-right">{won(q.totalAmount)}</td>
              <td className="text-center text-ec-navy">{q.statusName}</td>
              <td className="text-center"><a className={`cursor-pointer${q.convertedOrderId ? ` ${GEN_TAG}` : ''}`} onClick={() => void openGenerated(q)}>조회</a></td>
              <td className="text-center"><a className="cursor-pointer" onClick={() => void printQuote(q)}>인쇄</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      ))}

      {showForm && <QuotationForm key={editing?.id ?? 'new'} editing={editing} items={items} partners={partners} warehouses={warehouses} projects={projects}
        onClose={() => { setShowForm(false); setEditing(null) }}
        onSaved={() => { setShowForm(false); setEditing(null); load() }} />}
    </EcListShell>
  )
}

/**
 * 견적서입력 · 견적서수정 창 — 원본 견적서입력(E040201) 2026-10-14 loginaa 실측.
 * 머리: 일자 · 거래처 · (담당자) · 출하창고 · (거래유형 · 통화) · 프로젝트. 격자: 품목코드 · 품목명 · 규격 · 수량 · 단가 · 공급가액 · 부가세 · 합계.
 * 품목을 고르면 수량은 비어 있고 단가는 품목 출고단가(없으면 0). 3 × 1,001 → 공급가액 3,003 · 부가세 300 · 합계 3,303.
 * 줄 없이 저장하면 '알림' 창의 '그리드(표)에 최소 1줄 이상 입력되어야 합니다.', 출하창고는 비워도 저장된다. 저장하면 말 없이 새 창이 된다.
 * 수정 창 하단: 저장(F8) · 저장/전표(F7) · 복사 · 이전 · 다음 · 닫기 · 삭제 · H · 최종이력 — 삭제 확인 '전표를 삭제하겠습니까?\n- 견적서', 지우면 말 없이 목록에서 빠진다.
 */
function QuotationForm({ editing, items, partners, warehouses, projects, onClose, onSaved }: {
  editing: Quotation | null
  items: Item[]; partners: Partner[]
  warehouses: { id: number; code: string; name: string }[]
  projects: { id: number; code: string; name: string }[]
  onClose: () => void; onSaved: () => void
}) {
  const init = () => ({
    partnerId: editing ? String(editing.partnerId) : '',
    quoteDate: editing?.quoteDate ?? today(),
    warehouse: editing?.warehouseId ? String(editing.warehouseId) : '',
    project: editing?.projectId ? String(editing.projectId) : '',
    validUntil: editing?.validUntil ?? '',
    lines: editing && editing.lines.length
      ? [...editing.lines.map((l) => ({ itemId: String(l.itemId), quantity: String(l.quantity), unitPrice: String(l.unitPrice) })), emptyLine(), emptyLine()]
      : [emptyLine(), emptyLine(), emptyLine()],
  })
  const [partnerId, setPartnerId] = useState(init().partnerId)
  const [quoteDate, setQuoteDate] = useState(init().quoteDate)
  /* 원본 견적서의 [출하창고]·[프로젝트]. 판매전표는 이미 물고 있는데 견적만 없었다. */
  const [fWarehouse, setFWarehouse] = useState(init().warehouse)
  const [fProject, setFProject] = useState(init().project)
  const [validUntil, setValidUntil] = useState(init().validUntil)
  const [lines, setLines] = useState<LineForm[]>(init().lines)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [partnerMissing, setPartnerMissing] = useState(false)

  function reset() {
    const v = init()
    setPartnerId(v.partnerId); setQuoteDate(v.quoteDate); setFWarehouse(v.warehouse); setFProject(v.project)
    setValidUntil(v.validUntil); setLines(v.lines); setError(''); setPartnerMissing(false)
  }
  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => {
      const next = ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l))
      /* 원본 격자는 빈 줄이 늘 남아 있다 — 마지막 줄에 품목을 넣으면 빈 줄을 하나 더 붙인다. */
      return next[next.length - 1].itemId ? [...next, emptyLine()] : next
    })
  }
  function pickItem(i: number, itemId: string) {
    const it = items.find((x) => String(x.id) === itemId)
    setLine(i, { itemId, unitPrice: it ? String(it.unitPrice ?? 0) : '' })
    // 거래처의 특별단가가 있으면 덮는다(50회차 — 견적서는 특별단가를 몰랐다).
    void resolveSpecialPrice('SALES', itemId, partnerId).then((p) => { if (p != null) setLine(i, { unitPrice: String(p) }) })
  }
  /** 거래처를 고르면 담긴 품목의 특별단가를 다시 찾는다 — 품목을 먼저 담아도 걸리게(49회차와 같은 까닭). */
  function choosePartner(v: string) {
    setPartnerId(v); setPartnerMissing(false)
    lines.forEach((l, i) => {
      if (l.itemId) void resolveSpecialPrice('SALES', l.itemId, v).then((p) => { if (p != null) setLine(i, { unitPrice: String(p) }) })
    })
  }

  const calc = lines.map((l) => lineSupply(Number(l.quantity) || 0, Number(l.unitPrice) || 0))
  /*
   * 부가세는 <b>줄마다</b> 원 단위로 반올림해 더한다 — 서버(QuotationService)가 그렇게 저장한다.
   * ÷10 으로 재는 것은 ×0.1 의 부동소수 오차(…4999)를 피하려는 것이다.
   */
  const vats = calc.map((c) => Math.round(c / 10))
  const supply = calc.reduce((a, b) => a + b, 0)
  const vat = vats.reduce((a, b) => a + b, 0)
  const qtySum = lines.reduce((a, l) => a + (l.itemId ? Number(l.quantity) || 0 : 0), 0)

  async function save() {
    setError('')
    const payload = lines
      .filter((l) => l.itemId)
      .map((l) => ({ itemId: Number(l.itemId), quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0 }))
    if (payload.length === 0) {
      return ecAlert('아래의 경우 처리가 불가능합니다.\n자세한 내용은 아래의 사항을 참고하시기 바랍니다.\n아래 사항을 수정 후 다시 진행하시기 바랍니다.\n\n'
        + `${quoteDate.replace(/-/g, '')} 견적서입력 - 그리드(표)에 최소 1줄 이상 입력되어야 합니다.`)
    }
    /* 거래처가 비면 원본 입력 화면들처럼 글 없이 그 칸만 빨갛게(판매 · 주문서와 같다). */
    if (!partnerId) { setPartnerMissing(true); return }
    setSaving(true)
    try {
      const body = { partnerId: Number(partnerId), quoteDate,
        warehouseId: fWarehouse ? Number(fWarehouse) : undefined,
        projectId: fProject ? Number(fProject) : undefined,
        validUntil: validUntil || undefined, taxable: true, lines: payload }
      if (editing) await api.put(`/quotations/${editing.id}`, body)
      else await api.post('/quotations', body)
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function removeThis() {
    if (!editing || !(await ecConfirm('전표를 삭제하겠습니까?\n- 견적서'))) return
    try { await api.delete(`/quotations/${editing.id}`); onSaved() }
    catch (err) { void ecAlert(extractErrorMessage(err)) }
  }

  const th = 'w-[90px] bg-ec-page'
  return (
    <Modal open title={editing ? '견적서수정' : '견적서입력'} width={960} onClose={onClose}>
      <div>
        {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
        <table className="w-full text-left mb-[8px]">
          <tbody>
            <tr>
              <th className={th}>일자-No.</th>
              <td>
                <input type="date" className="ec-input w-[150px]" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
                {editing && <span className="ml-[6px] text-ec-label">{editing.quoteNo.split('-').pop()?.replace(/^0+/, '-')}</span>}
              </td>
              <th className={th}>거래처</th>
              <td className={partnerMissing ? 'ec-invalid' : undefined}>
                <CodePickerField label="거래처" hideLabel width={240} emptyLabel="선택 안 함" placeholder="거래처"
                                 value={partnerId} onChange={choosePartner}
                                 items={partnerCodeItems(partners.filter((p) => p.type !== 'SUPPLIER'))} />
              </td>
            </tr>
            <tr>
              <th className={th}>출하창고</th>
              <td>
                <CodePickerField label="출하창고" hideLabel width={240} emptyLabel="선택 안 함" placeholder="출하창고"
                                 value={fWarehouse} onChange={setFWarehouse}
                                 items={warehouses.map((w) => ({ value: String(w.id), code: w.code, name: w.name }))} />
              </td>
              <th className={th}>프로젝트</th>
              <td>
                <CodePickerField label="프로젝트" hideLabel width={240} emptyLabel="선택 안 함" placeholder="프로젝트"
                                 value={fProject} onChange={setFProject}
                                 items={projects.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
              </td>
            </tr>
            <tr>
              <th className={th}>유효기간</th>
              <td colSpan={3}><input type="date" className="ec-input w-[150px]" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></td>
            </tr>
          </tbody>
        </table>

        <table className="w-full text-left">
          <thead><tr>
            <th className="w-[37px]"></th><th>품목코드 · 품목명</th><th className="w-[141px]">규격</th>
            <th className="w-[100px] text-right">수량</th><th className="w-[129px] text-right">단가</th>
            <th className="w-[129px] text-right">공급가액</th><th className="w-[129px] text-right">부가세</th><th className="w-[119px] text-right">합계</th>
          </tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const it = items.find((x) => String(x.id) === l.itemId)
              return (
                <tr key={i}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>
                    <CodePickerField label="품목" hideLabel fill placeholder="품목코드" emptyLabel="선택 해제"
                                     value={l.itemId} onChange={(v) => pickItem(i, v)}
                                     items={items.map((x) => ({ value: String(x.id), code: x.code, name: x.name, alias: x.searchKeyword, sub: x.spec }))} />
                  </td>
                  <td>{it?.spec ?? ''}</td>
                  <td><EcNumInput className="ec-input w-full text-right" value={l.quantity} onValue={(v) => setLine(i, { quantity: v })} /></td>
                  <td><EcNumInput className="ec-input w-full text-right" value={l.unitPrice} onValue={(v) => setLine(i, { unitPrice: v })} /></td>
                  <td className="text-right">{l.itemId ? won(calc[i]) : ''}</td>
                  <td className="text-right">{l.itemId ? won(vats[i]) : ''}</td>
                  <td className="text-right">{l.itemId ? won(calc[i] + vats[i]) : ''}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={3}></td>
              <td className="text-right">{won(qtySum)}</td>
              <td></td>
              <td className="text-right">{won(supply)}</td>
              <td className="text-right">{won(vat)}</td>
              <td className="text-right">{won(supply + vat)}</td>
            </tr>
          </tfoot>
        </table>
        {/* 추가항목(사용자정의) — Self-Customizing › 사용자정의필드의 [견적서] 정의가 있으면 여기 뜬다(저장된 견적만). */}
        {editing && <div className="pt-[6px]"><CustomFieldsPanel entityType="QUOTE" entityId={editing.id} /></div>}
        <div className="flex gap-[6px] mt-[10px]">
          <button className="ec-btn ec-btn-primary" onClick={() => void save()} disabled={saving}>저장(F8)</button>
          <button className="ec-btn" onClick={reset}>다시 작성</button>
          <button className="ec-btn" onClick={onClose}>{editing ? '닫기' : '리스트'}</button>
          {editing && <button className="ec-btn" onClick={() => void removeThis()}>삭제</button>}
        </div>
      </div>
    </Modal>
  )
}
