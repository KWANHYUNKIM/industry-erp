import { useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import CustomFieldsPanel from '../../components/CustomFieldsPanel'
import EvidencePanel from '../../components/EvidencePanel'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import { loadSupplierParty, printDocuments, type DocParty } from '../../utils/printDocument'
import type { SalesConfirmStatus, SalesDoc, PurchaseDoc, Partner, TradeLine } from '../../types/api'
import { ecAlert, ecConfirm, NO_SELECTION_MESSAGE } from '../../components/EcDialog'
import { SlipMenuHistoryModal, EMAIL_NOT_HERE, BARCODE_NOT_HERE } from '../../features/sliphistory/SlipMenuHistoryModal'
import TradeEntry from './TradeEntry'
import Modal, { ModalWindow } from '../../components/Modal'
import EcSlipPrintModal, { type SlipPrintDoc } from '../../components/EcSlipPrintModal'
import { EcDateRange } from '../../components/ui/EcDateInput'
import { EcCond } from '../../components/EcStatusPanel'
import { ORDER_LIST_PICKS, periodOf } from '../../utils/periods'

/** 불러온 전표가 있는 구매의 [불러온전표] 주황 꼬리표(원본 실측: 바탕 --ec-tag-warn · 흰 글자 · 둥글기 6 — QuotationPage GEN_TAG 와 같다). */
const SRC_TAG = 'inline-block rounded-[6px] px-[1.8px] py-[0.9px] text-[12px] leading-[13.2px] bg-[var(--ec-tag-warn)] text-[var(--ec-bg-panel)] no-underline'
/** 판매조회 / 구매조회 — 전표(문서) 단위 조회. 행 클릭 시 품목 상세 펼침. */
type Mode = 'sales' | 'purchase'
interface NormalDoc {
  id: number; docNo: string; partnerId: number | null; partnerName: string; warehouseId: number; warehouseName: string
  projectId: number | null
  date: string; supplyAmount: number; vatAmount: number; totalAmount: number
  /** 거래유형(과세). 외자 구매는 과세여도 부가세가 0 이라 부가세로 되짚으면 면세로 보인다. */
  taxable?: boolean
  createdBy: string | null; remark: string | null
  /**
   * 원본 조건 [담당자]. <b>작성자와 다른 값</b>이다 — 전표를 <b>맡은</b> 사람이고,
   * createdBy 는 전표를 <b>넣은</b> 사람이다. 응답이 진작 실어 주는데 이 화면이 안 받아
   * 두어, [담당자] 칸이 엉뚱하게 createdBy 로 걸리고 있었다.
   */
  employeeName: string | null
  /** 원본 조건 판 [기타]의 [수정일자순(정렬)]이 쓰는 축. 서버가 이제 싣는다. */
  updatedAt: string | null
  /** 원본 조건 [최초작성일자]. 예외에 '응답이 안 싣는다' 고 적혀 있던 값을 이번에 실었다. */
  createdAt: string | null
  confirmStatus?: SalesConfirmStatus; confirmStatusName?: string
  accountingReflected: boolean
  /** 원본 구매조회에만 있는 열. 판매 전표에도 프로젝트는 붙지만 원본 판매조회는 안 보여 준다. */
  projectName?: string | null
  // 라인은 공용 타입을 그대로 쓴다 — 여기서 좁게 다시 적어 두면 백엔드가 필드를 늘려도 화면이 못 본다
  // (실제로 lotNo·부대비용·불러온전표가 늘었는데 이 화면만 모르고 있었다).
  lines: TradeLine[]
  /** 판매입력 II [금액조정] 의 할인(감소). 머리 금액은 이미 뺀 값이다 — 명세서에는 '할인' 줄로 따로 보인다. */
  discountSupply?: number; discountVat?: number
  /** 판매입력 II 로 만든 전표 — 원본 조건 [판매구분](판매 · 판매 II)이 이것으로 거른다. */
  inputII?: boolean
}

/** 원본에 있으나 우리에게 받쳐 줄 것이 없는 단추 · 메뉴 — Email · 바코드와 같은 안내(SlipMenuHistoryModal EMAIL_NOT_HERE). */
const notHere = (what: string) => () => void ecAlert(`이 기능은 이 ERP 에서 제공하지 않습니다.\n(${what})`)

/**
 * 조건 판의 알약 고르기(원본 회계반영여부 · 판매구분). 원본의 내.외자구분 · 발송여부 · 채권번호 · 최종수정자 · 입력경로 · 삭제구분은
 * 판매 전표에 그 값이 없어 칸을 두지 않는다(자료 없음 — 거르지 않음, qa/ui-check 조건 예외 · 진행판).
 */
function CondPills<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="ec-pills">
      {options.map((o) => (
        <button key={o} type="button" className={`ec-pill no-ec${value === o ? ' active' : ''}`} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  )
}

// 판매조회 탭 (이카운트). '결재중'은 전자결재 진행중, '확인/미확인'은 확인상태.
const SALES_TABS = ['전체', '결재중', '미확인', '확인'] as const
type SalesTab = (typeof SALES_TABS)[number]
const TAB_STATUS: Record<Exclude<SalesTab, '전체'>, SalesConfirmStatus> = {
  결재중: 'IN_APPROVAL',
  미확인: 'UNCONFIRMED',
  확인: 'CONFIRMED',
}

const won = (n: number) => n.toLocaleString('ko-KR')
/** 판매조회 조건 [거래유형] 창의 줄 — 원본 '거래유형(영업)검색'(2026-10-31 loginad 실측). */
const SALES_TRADE_TYPES = [
  { value: '11', code: '11', name: '부가세율 적용' },
  { value: '12', code: '12', name: '부가세율 미적용' },
]
/*
 * 2026-09-09 원본 격자 실측(E040206 판매조회 · E040304 구매조회) — 두 화면 모두
 * 그 열을 <b>[거래처명]</b> 이라 부른다. 우리는 [매출처]·[매입처] 로 갈라 적고 있었는데,
 * 원본은 사는 쪽이든 파는 쪽이든 <b>같은 이름</b>이다. 그래서 화면별 라벨을 없앤다.
 * (열 구성도 확인했다 — 판매조회는 구매조회에서 [프로젝트명] 하나가 빠진 것이다.)
 */
const CFG: Record<Mode, { title: string; url: string; dateKey: 'saleDate' | 'purchaseDate'; accent: string; entryTo: string; entryTitle: string }> = {
  sales: { title: '판매조회', url: '/sales', dateKey: 'saleDate', accent: 'var(--ec-blue)', entryTo: '/sales/sell', entryTitle: '판매입력' },
  purchase: { title: '구매조회', url: '/purchases', dateKey: 'purchaseDate', accent: '#a5561b', entryTo: '/sales/buy', entryTitle: '구매입력' },
}

export default function TradeInquiryPage({ mode }: { mode: Mode }) {
  const cfg = CFG[mode]
  const isSales = mode === 'sales'
  /* 이 줄의 이름은 화면마다 다르다 — 판매조회는 [기준일자], 구매조회는 [일자](사본 실측). */
  const dateLabel = isSales ? '기준일자' : '일자'
  /*
   * 고친 때를 묻는 줄도 화면마다 이름이 다르다 — 판매조회는 <b>[최종수정일시]</b>,
   * 구매조회는 <b>[최종작업일자]</b> 다(둘 다 실측).
   *
   * <p>여기 예외에 "고친 때는 실었으나 원본의 이 칸은 <b>작업일자</b>다 — 무엇을 가리키는지
   * 못 재어 지어내지 않는다" 고 적어 두었다. 그 뒤 세 화면을 더 재면서 답이 나왔다:
   * 발주서조회·출하지시서조회는 <b>[최초작성일자]·[최종작업일자]</b> 짝이고,
   * 판매조회·출하조회는 <b>[최초작성일자]·[최종수정일시]</b> 짝이다. <b>같은 자리에
   * 두 이름을 번갈아 쓴다.</b> 지어낸 것이 아니라 잰 것이라 이제 만든다 — 앞 두 화면에서
   * 이미 [최종작업일자]를 updatedAt 에 걸어 두었으니 여기만 다르게 두면 그쪽이 거짓말이 된다.
   */
  const updatedLabel = isSales ? '최종수정일시' : '최종작업일자'
  const navigate = useNavigate()
  const [docs, setDocs] = useState<NormalDoc[]>([])
  const [error, setError] = useState('')
  /**
 * 거래처중심입력에서 넘어올 때 <b>그 거래처를 물고</b> 열린다(?partner=거래처명).
 * 허브에서 골라 놓고 넘어왔는데 전체 목록이 나오면 다시 거르게 되고,
 * 그러면 허브가 있으나 마나다.
 */
  const [searchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(searchParams.get('partner') ?? '')
  /*
   * 원본 조회 화면의 조건 판: 일자 · 거래처 · 담당자 · 창고 · 거래유형 · 통화 · 프로젝트.
   * 우리는 기간과 검색창만 있어 <b>거래처·담당자로 좁힐 수가 없었다.</b> 전표가 쌓이면
   * 검색창 하나로는 '이 담당자가 이 달에 친 구매' 를 뽑지 못한다.
   */
  const [partnerCond, setPartnerCond] = useState('')
  /** 원본 [담당자] — 전표를 맡은 사원. 예전에는 이 칸이 createdBy(작성자)로 걸렸다. */
  const [managerCond, setManagerCond] = useState('')
  /** 원본 [작성자] — 전표를 넣은 사람. 원본은 [담당자]와 <b>따로</b> 둔다(2026-09-07 실측). */
  const [authorCond, setAuthorCond] = useState('')
  /**
   * 원본 [거래처관리담당자] — 그 <b>거래처를 맡은</b> 사람이다. 전표의 [담당자]와 다르다.
   * 거래처 마스터에 붙는 값이라 전표 응답에는 없다 — 이 화면은 /partners 를 진작 받아
   * 두고 있으므로(명세서 인쇄용) 거기서 거래처명으로 잇는다.
   */
  const [partnerMgrCond, setPartnerMgrCond] = useState('')
  /**
   * 원본 [최종수정일시] — 차례는 [최초작성일자] 다음, [입력경로] 앞이다(2026-09-07 실측).
   * 축(updatedAt)은 앞 커밋에서 응답에 실었다. <b>날짜만</b> 받는다 — 원본은 시분까지
   * 적을 수 있으나 우리 자료로는 그 눈금이 쓸모가 없다(하루에 여러 번 고친 전표를
   * 시각으로 가르는 일이 없다). 잰 것보다 좁게 만들었다는 것을 여기 적어 둔다.
   */
  const [updFrom, setUpdFrom] = useState('')
  const [madeFrom, setMadeFrom] = useState('')
  const [madeTo, setMadeTo] = useState('')
  const [updTo, setUpdTo] = useState('')
  const [whCond, setWhCond] = useState('')
  const [typeCond, setTypeCond] = useState('')
  /**
   * 판매조회 [거래유형] — 원본은 코드도움 '거래유형(영업)검색' 창에서 코드로 여럿 고른다(2026-10-31 loginad 실측: 11 부가세율 적용 · 12 부가세율 미적용,
   * 체크칸 + 번호 · Fn · [적용(F8)] [닫기] · TIP). 거르는 기준은 예전 이름 고르기와 같다 — 과세면 11, 아니면 12(tradeTypeOf).
   */
  const [typeCodes, setTypeCodes] = useState<string[]>([])
  const [projectCond, setProjectCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  /** 목록의 [거래유형명]과 같은 규칙 — 부가세가 있으면 과세다(전표 입력과 같다). */
  // 전표가 거래유형(taxable)을 들고 오면 그것을 쓴다 — 외자 구매는 과세여도 부가세가 0 이다(원본 10/12-1 '부가세율 적용').
  const tradeTypeOf = (d: { vatAmount: number; taxable?: boolean }) => ((d.taxable ?? d.vatAmount !== 0) ? '부가세율 적용' : '면세')   // 반품은 부가세가 음수다 — > 0 이면 과세 반품이 면세로 찍혔다(26회차)
  // 원본 판매조회 · 구매조회 기간의 처음 값은 [최근30일(+1개월)] — 오늘−30 ~ 오늘+30(2026-10-30 판매조회 실측 2026/09/30 ~ 2026/11/29)
  const [from, setFrom] = useState(() => periodOf('최근30일(+1개월)')?.from ?? '')
  const [to, setTo] = useState(() => periodOf('최근30일(+1개월)')?.to ?? '')
  const [tab, setTab] = useState<SalesTab>('전체')
  const [openId, setOpenId] = useState<number | null>(null)
  /** 구매조회 [불러온전표] '조회' 가 여는 '불러온 전표' 창의 전표 */
  const [sourceDoc, setSourceDoc] = useState<NormalDoc | null>(null)
  /** 목록 위에 뜬 '판매입력(수정)' 창의 전표 id(원본 E040206 — 일자-No. 를 누르면 뜬다). */
  const [popupId, setPopupId] = useState<number | null>(null)
  /** 창이 떠 있나. popupId 가 null 인데 떠 있으면 [신규(F2)] 의 '판매입력' 창이다(원본 2026-10-21 실측). */
  const [popupOpen, setPopupOpen] = useState(false)
  /** 수정 창에서 [복사] 를 눌러 신규 창이 됐다 — 제목이 '판매입력' 으로 바뀐다. */
  const [popupCopied, setPopupCopied] = useState(false)
  /** 받은 전표 응답 그대로 — 수정 창(TradeEntry)이 다시 받지 않고 이것으로 전표를 펼친다. */
  const [rawDocs, setRawDocs] = useState<(SalesDoc | PurchaseDoc)[]>([])
  // 원본 목록의 [선택삭제] 대상. 전표 입력 그리드와 같이 **행번호 칸을 눌러** 고른다.
  const [selected, setSelected] = useState<Set<number>>(new Set())
  /** 하단 [이력조회 ▴] 로 연 '판매 이력조회' · '판매 II 이력조회' 창(서버 이력 메뉴 이름). */
  const [historyMenu, setHistoryMenu] = useState<string | null>(null)
  // 열을 더할 때 합계행(tfoot)을 같이 안 고치면 숫자가 엉뚱한 열 아래에 선다. 개발 모드에서 잡는다.
  const listRef = useRef<HTMLTableElement>(null)
  // 명세서 인쇄용 — 우리 회사(공급자) 정보와 거래처 상세
  const [company, setCompany] = useState<DocParty | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  /*
   * 거래처·창고·프로젝트·품목 조건은 <b>id</b> 로 거른다. 이 화면만 이름으로 남아 있어
   * 거래처 코드도움에 코드가 비어 코드(CUST-SH01)로 찾을 수 없었고, 같은 이름이 한데 걸렸다(26회차).
   * 후보는 다른 조회 화면과 같은 곳에서 받는다.
   */
  const pickers = useCondPickers(['partners', 'warehouses', 'items', 'projects'])

  function load() {
    setError('')
    api.get<(SalesDoc | PurchaseDoc)[]>(cfg.url)
      .then((res) => { setRawDocs(res.data); return res })
      .then((res) => setDocs(res.data.map((d) => ({
        id: d.id, docNo: d.docNo, partnerId: d.partnerId, partnerName: d.partnerName, warehouseId: d.warehouseId, warehouseName: d.warehouseName, projectId: d.projectId ?? null,
        date: (d as never)[cfg.dateKey] as string,
        supplyAmount: d.supplyAmount, vatAmount: d.vatAmount, totalAmount: d.totalAmount,
        taxable: (d as { taxable?: boolean }).taxable,
        createdBy: d.createdBy, remark: d.remark, updatedAt: d.updatedAt, createdAt: d.createdAt,
        employeeName: d.employeeName,
        confirmStatus: (d as SalesDoc).confirmStatus,
        confirmStatusName: (d as SalesDoc).confirmStatusName,
        discountSupply: Number((d as SalesDoc).discountSupply ?? 0), discountVat: Number((d as SalesDoc).discountVat ?? 0),
        accountingReflected: d.accountingReflected,
        projectName: d.projectName,
        inputII: !!(d as SalesDoc).inputII,
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

  /**
   * 진행상태변경 — 원본 판매조회·구매조회 버튼이다. 고른 전표의 <b>확인상태</b>를 한 번에 바꾼다.
   *
   * <p>한 줄씩 [확인] 을 누르는 것밖에 없어서, 월말에 수십 장을 확인하려면 수십 번을 눌러야 했다.
   *
   * <p>고른 것이 섞여 있으면 <b>전부 확인</b>으로 맞춘다. 하나씩 뒤집으면 한 번 눌렀을 때
   * 결과가 뭔지 알 수 없다. 확인은 판매전표에만 있다 — 구매에는 확인상태가 없다.
   */
  async function confirmSelected(want?: 'confirm' | 'unconfirm') {
    const picked = shown.filter((d) => selected.has(d.id))
    // 원본(2026-10-20 E040206 실측): 고른 줄 없이 [진행상태변경 ▴ › 확인] → 화면 안 알림 "리스트에 선택된 자료가 없습니다. …"
    if (picked.length === 0) return ecAlert(NO_SELECTION_MESSAGE)
    const kind = want ?? (picked.every((d) => d.confirmStatus === 'CONFIRMED') ? 'unconfirm' : 'confirm')
    // 펼침에서 고른 상태와 이미 같은 전표는 건너뛴다(서버는 같은 상태로 바꾸기를 거절한다).
    const targets = picked.filter((d) => (kind === 'confirm') !== (d.confirmStatus === 'CONFIRMED'))
    if (targets.length === 0) { setSelected(new Set()); return }
    // 원본은 펼침에서 고르면 묻지 않고 바로 바꾼다(2026-10-20 실측 — 묻는 창 없이 결과/알림만).
    try {
      for (const d of targets) await api.post(`/sales/${d.id}/${kind}`)
      setSelected(new Set())
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  /**
   * 전표 수정 — 원본처럼 <b>목록 위에 '판매입력(수정)' 창</b>을 띄운다(2026-10-21 loginaa E040206 실측: 창 폭은 화면의 절반,
   * 아래 버튼줄 저장(F8) · 저장/전표(F7) · 복사 · 반품처리 · 현금수금 · 이전 · 다음 · 닫기 · 삭제 · 보내기 · H · 최종이력).
   * 입력 화면 주소(?edit=)로 여는 길은 그대로 남는다(다른 화면 · QA 흐름이 쓴다).
   */
  function editDoc(d: NormalDoc) {
    setPopupId(d.id); setPopupCopied(false); setPopupOpen(true)
  }
  /** [신규(F2)] — 원본 판매조회 · 구매조회는 목록 위에 '판매입력' · '구매입력' 창을 띄우고, 저장하면 말 없이 닫혀 목록에 새 전표가 선다(2026-10-21 실측). */
  function newDoc() {
    setPopupId(null); setPopupCopied(false); setPopupOpen(true)
  }
  /**
   * 창의 [이전] · [다음] — 원본은 일자-No. 차례로 바로 앞(더 옛) 전표가 [이전], 바로 뒤가 [다음] 이다
   * (목록 정렬과 상관없다). 가장 새 전표에서 [다음] 이면 '알림 / 다음 자료가 없습니다.' 를 띄우고,
   * [확인] 하면 창도 닫힌다(2026-10-21 실측). 지금 걸러 보이는 전표 안에서만 옮긴다.
   */
  async function movePopup(dir: 'prev' | 'next') {
    const ordered = [...shown].sort((a, b) => a.date.localeCompare(b.date) || a.docNo.localeCompare(b.docNo))
    const i = ordered.findIndex((d) => d.id === popupId)
    const to = ordered[dir === 'prev' ? i - 1 : i + 1]
    if (i < 0 || !to) {
      await ecAlert(`${dir === 'prev' ? '이전' : '다음'} 자료가 없습니다.`)
      closePopup(false)
      return
    }
    setPopupId(to.id); setPopupCopied(false)
  }
  /*
   * 판매입력 II 로 만든 전표(또는 금액조정이 든 전표)는 원본도 '판매입력 II(수정)' 창으로 연다(2026-10-22 loginaa 실측:
   * 창 제목 · 머리 '판매입력 II(수정)', 위 알약 [기본(수정불가)] [매출전표 I] [+], 아래 저장(F8) · 결제취소(결제 있는 전표) · 저장/전표(F7) …).
   */
  const popupDoc = isSales && popupId != null ? rawDocs.find((d) => d.id === popupId) as SalesDoc | undefined : undefined
  const popupII = !!popupDoc && (!!popupDoc.inputII || Number(popupDoc.discountSupply ?? 0) + Number(popupDoc.discountVat ?? 0) !== 0)
  const entryTitle = popupII ? '판매입력 II' : cfg.entryTitle
  const popupTitle = popupId != null && !popupCopied ? `${entryTitle}(수정)` : cfg.entryTitle
  function closePopup(changed: boolean) {
    setPopupId(null); setPopupOpen(false); setPopupCopied(false)
    if (changed) { setOpenId(null); load() }
  }

  /**
   * 원본 구매조회의 <b>[반품처리]</b> 버튼. 그 전표를 근거로 <b>반품 전표를 새로</b> 만든다.
   *
   * <p>원 전표는 손대지 않는다 — 산 사실은 남고, 되돌려준 사실이 따로 하나 더 생기는 것이
   * 반품이다. 원 전표의 수량을 깎아 버리면 애초에 그만큼만 산 것이 되어 이력이 사라진다.
   *
   * <p>입력 화면이 [거래구분: 반품]으로 열리고 그 전표 라인이 담겨 있다. 전량 반품이 아니면
   * 그 자리에서 수량을 고친다 — 얼마를 되돌려주는지는 사람만 안다.
   */
  function returnDoc(d: NormalDoc) {
    navigate(`${isSales ? '/sales/sell' : '/sales/buy'}?returnFrom=${d.id}`)
  }

  /**
   * 전표 삭제. 서버가 재고를 되돌리고 지운다. 회계반영·세금계산서 발행 전표는 서버가 거부한다(확인된 판매는 원본처럼 지운다).
   * 되돌릴 수 없는 조작이라 한 번 더 묻는다.
   */
  async function deleteDoc(d: NormalDoc) {
    /* 원본 판매 수정 창 [삭제] — '알림' 창 "전표를 삭제하겠습니까?" 아래 줄 " - 판매", [확인] [취소](2026-10-14 loginaa 실측). */
    const ok = (await ecConfirm(isSales
      ? '전표를 삭제하겠습니까?\n - 판매'
      : `${d.docNo} 전표를 삭제합니다.\n\n`
        + `입고했던 재고가 되돌아갑니다 (품목 ${d.lines.length}건, 합계 ${won(d.totalAmount)}원).\n`
        + '이 작업은 되돌릴 수 없습니다. 진행할까요?',
    ))
    if (!ok) return
    try {
      await api.delete(`${cfg.url}/${d.id}`)
      setOpenId(null)
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
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
      extra: [{ label: '창고', value: d.warehouseName }, { label: '담당', value: d.employeeName }, { label: '작성', value: d.createdBy }],
      remark: d.remark,
      /*
       * 판매입력 II 의 할인은 원본 거래명세서에 품목 아래 '할인' 줄(수량 1.00 · 공급가액 -1,000 · 부가세 -100)로 찍힌다
       * (2026-10-13 E040253 실측). 줄만 더하면 명세서 합계가 머리 금액(할인 뺀 값)과 같아진다 — 전에는 할인 전 금액이 찍혔다.
       */
      lines: d.discountSupply || d.discountVat
        ? [...d.lines, { itemName: '할인', quantity: 1, unitPrice: -(d.discountSupply ?? 0),
            supplyAmount: -(d.discountSupply ?? 0), vatAmount: -(d.discountVat ?? 0) }]
        : d.lines,
      footNote: isSales ? '위와 같이 거래하였음을 확인합니다.' : undefined,
    }])
  }

  /** 원본 조건 판 [기타]의 [수정일자순(정렬)]. 원본도 기본은 꺼짐이다(실측). */
  const [byUpdated, setByUpdated] = useState(false)
  /*
   * 2026-09-07 에 원본(E040206) 조건 판의 <b>접힌 줄까지 펼쳐</b> 전부 쟀다. 스물넷이다.
   * 그중 <b>우리 자료로 지금 거를 수 있는 셋</b>을 만든다 — 셋 다 응답에 진작 실려 오는데
   * 거를 자리가 없었다(표에는 [회계반영여부]가 열로 찍히고 있었다).
   */
  /**
   * 원본 <b>[오더관리번호]</b>. 2026-09-08 에 원본(판매조회)을 열어 그 칸의 속을 보고서야
   * 만들었다 — <code>btn-code-search</code> + <code>form-control-code</code> 인
   * <b>코드도움</b>이었다([거래처]·[품목]과 같은 부류다). 치는 칸이었다면 수주에 따로
   * 매기는 관리번호였을 테고 우리에겐 그 자리가 없었을 것이다.
   *
   * <p>고르는 값은 <b>근거 수주의 전표번호</b>다 — 우리 줄의 <code>sourceDocNo</code> 가
   * 그것이고, 목록의 [근거전표] 열에 진작 찍고 있었다. 예외에 '전표에 오더 참조가 없다'
   * 고 적어 두었던 것이 거짓이었고(32b7ded), 이제 거를 자리까지 만든다.
   */
  const [orderNoCond, setOrderNoCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [reflectedCond, setReflectedCond] = useState<'전체' | '반영' | '미반영'>('전체')
  const [remarkCond, setRemarkCond] = useState('')
  /** 원본 [판매구분] 전체 · 판매 · 판매 II — 판매입력 · 판매입력 II 중 어디서 만든 전표인가(응답 inputII). */
  const [kindCond, setKindCond] = useState<'전체' | '판매' | '판매 II'>('전체')

  const shown = useMemo(() => docs
    .filter((d) => !keyword || d.partnerName.includes(keyword) || d.docNo.includes(keyword))
    .filter((d) => !partnerCond || String(d.partnerId) === partnerCond)
    .filter((d) => !managerCond || (d.employeeName ?? '') === managerCond)
    /* 원본 [작성자] — 차례는 [적요] 다음, [최종수정자] 앞이다. */
    .filter((d) => !authorCond || (d.createdBy ?? '') === authorCond)
    /* 원본 [거래처관리담당자]. 차례는 [담당자] 다음, [회계반영여부] 앞이다. */
    .filter((d) => !partnerMgrCond
      || (partners.find((p) => p.id === d.partnerId)?.manager ?? '') === partnerMgrCond)
    /* 원본 [최종수정일시]. updatedAt 은 ISO 라 앞 열 글자가 곧 날짜다. */
    .filter((d) => !updFrom || (d.updatedAt ?? '').slice(0, 10) >= updFrom)
    .filter((d) => !updTo || (d.updatedAt ?? '').slice(0, 10) <= updTo)
    /*
     * 원본 [최초작성일자] — 전표를 <b>처음 넣은</b> 날이다. 위의 [최종수정일시]와 다르다.
     * 어제 넣은 것을 오늘 고쳤으면 이 둘이 갈린다. 예외에 '응답이 안 싣는다' 고 적어
     * 두었던 것이 맞아서 서버에 실었다.
     */
    .filter((d) => !madeFrom || (d.createdAt ?? '').slice(0, 10) >= madeFrom)
    .filter((d) => !madeTo || (d.createdAt ?? '').slice(0, 10) <= madeTo)
    .filter((d) => !whCond || String(d.warehouseId) === whCond)
    .filter((d) => !itemCond || d.lines.some((l) => String(l.itemId) === itemCond))
    .filter((d) => !typeCond || tradeTypeOf(d) === typeCond)
    .filter((d) => typeCodes.length === 0 || typeCodes.includes(tradeTypeOf(d) === '부가세율 적용' ? '11' : '12'))
    .filter((d) => !projectCond || String(d.projectId ?? '') === projectCond)
    /* 원본 [규격] — 전표 안의 어느 줄이든 그 규격이면 걸린다(품목과 같은 규칙). */
    /* 전표 안의 <b>어느 줄이든</b> 그 오더에서 왔으면 걸린다(품목·규격과 같은 규칙). */
    .filter((d) => !orderNoCond || d.lines.some((l) => (l.sourceDocNo ?? '') === orderNoCond))
    .filter((d) => !specCond || d.lines.some((l) => (l.spec ?? '') === specCond))
    /* 원본 [회계반영여부]. 표에는 진작 열로 찍고 있었는데 그것으로 거를 수가 없었다. */
    .filter((d) => reflectedCond === '전체' || (reflectedCond === '반영') === d.accountingReflected)
    /* 원본 [적요]. 응답에 진작 실려 오는데 거를 자리가 없었다. */
    .filter((d) => !remarkCond || (d.remark ?? '').includes(remarkCond))
    .filter((d) => !isSales || kindCond === '전체' || (kindCond === '판매 II') === !!d.inputII)
    .filter((d) => !from || d.date >= from)
    .filter((d) => !to || d.date <= to)
    .filter((d) => !isSales || tab === '전체' || d.confirmStatus === TAB_STATUS[tab])
    .sort((a, b) => (byUpdated
      /* 원본 [수정일자순(정렬)] — 고친 순으로 본다. 안 고친 전표는 만든 때가 곧 고친 때다. */
      ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id - a.id
      : b.date.localeCompare(a.date) || b.id - a.id)), /* eslint-disable-next-line react-hooks/exhaustive-deps */
    [docs, keyword, partnerCond, managerCond, whCond, typeCond, projectCond, typeCodes, from, to, tab, isSales, byUpdated, orderNoCond, specCond, reflectedCond, remarkCond, kindCond, authorCond, updFrom, updTo, madeFrom, madeTo, partnerMgrCond, partners])

  const toggleSelect = (id: number) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  /**
   * 원본 하단 버튼줄의 [선택삭제]. 전표를 지우면 재고가 되돌아가고, 발주에서 입고전환된
   * 구매전표라면 발주서도 '발주확정' 으로 풀린다(백엔드가 처리한다).
   * 지울 수 없는 전표(회계반영·세금계산서 발행 등)는 서버가 사유를 준다 — 그대로 보여 준다. 확인된 판매는 원본처럼 지워진다.
   */
  /**
   * 원본 하단 버튼줄의 <b>[회계반영]</b>. 고른 전표를 회계로 넘긴다.
   *
   * <p>버튼 예외에 '원본은 조회에서 바로 고치지만 우리는 입력 화면을 따로 둔다' 고
   * 적혀 있었는데, 그 이유는 <b>편집</b>에 대한 말이지 회계반영에는 안 맞는다.
   * 반영은 고치는 일이 아니라 <b>넘기는</b> 일이고, 서버에 진작 자리가 있었다
   * (POST /api/accounting-reflection/reflect — 구분과 전표 id 목록을 받는다).
   * 이 화면은 고른 줄(selected)과 일괄 동작이 이미 배선돼 있어 잇기만 하면 됐다.
   *
   * <p>이미 반영된 전표는 <b>보내지 않는다</b> — 서버가 걸러 주더라도 사람이 고른
   * 건수와 넘어간 건수가 어긋나면 무엇이 빠졌는지 알 수 없다. 여기서 미리 갈라 알린다.
   */
  async function reflectSelected() {
    const picked = shown.filter((d) => selected.has(d.id))
    if (picked.length === 0) { setError('회계로 넘길 전표를 고르세요. 행번호 칸을 누르면 선택됩니다.'); return }
    const targets = picked.filter((d) => !d.accountingReflected)
    const already = picked.length - targets.length
    if (targets.length === 0) { setError(`고른 ${picked.length}건이 이미 회계에 반영돼 있습니다.`); return }
    if (!(await ecConfirm(`전표 ${targets.length}건을 회계로 넘길까요?${already ? ` (이미 반영된 ${already}건은 뺍니다)` : ''}`))) return
    try {
      const r = await api.post<{ reflectedCount: number }>('/accounting-reflection/reflect',
        { kind: isSales ? 'SALES' : 'PURCHASE', ids: targets.map((d) => d.id) })
      setSelected(new Set())
      load()
      setError(`회계로 ${r.data.reflectedCount}건을 넘겼습니다.${already ? ` 이미 반영된 ${already}건은 뺐습니다.` : ''}`)
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function deleteSelected() {
    const ids = shown.filter((d) => selected.has(d.id)).map((d) => d.id)
    if (ids.length === 0) { setError('지울 전표를 고르세요. 행번호 칸을 누르면 선택됩니다.'); return }
    /* 원본 판매조회 [선택삭제] — "선택한 전표를 삭제 하겠습니까?" [확인] [취소](2026-10-14 loginaa 실측, 확인된 판매도 그대로 지워진다). */
    // 원본 판매조회 · 구매조회 [선택삭제] 확인 글은 같다(구매 2026-10-20 재고1c 실측).
    if (!(await ecConfirm('선택한 전표를 삭제 하겠습니까?'))) return
    /*
     * 원본 판매조회는 회계반영된 판매를 지우면 '회계반영된 전표의 경우, 매출전표의 삭제 여부를 선택해주시기 바랍니다'
     * 창을 띄우고 [매출전표포함](기본 체크)으로 회계전표까지 같이 지운다(2026-10-06 loginaa 실측).
     * 포함하지 않고 판매만 지우는 길은 원본도 '거래불일치가 발생할 수 있다' 고 경고하는 길이라 두지 않는다.
     */
    const reflected = isSales ? shown.filter((d) => selected.has(d.id) && d.accountingReflected) : []
    if (reflected.length > 0 && !(await ecConfirm(
      `회계반영된 전표 ${reflected.length}건(${reflected.map((d) => d.docNo).join(', ')})은 매출전표(회계전표)까지 함께 지웁니다. 계속할까요?`))) return
    const failed: string[] = []
    for (const id of ids) {
      try {
        if (reflected.some((d) => d.id === id)) await api.post('/accounting-reflection/delete-sales-with-journal', { kind: 'SALES', ids: [id] })
        else await api.delete(`${cfg.url}/${id}`)
      } catch (err) {
        const doc = shown.find((d) => d.id === id)
        failed.push(`${doc?.docNo ?? id}: ${extractErrorMessage(err)}`)
      }
    }
    setSelected(new Set())
    load()
    setError(failed.length === 0 ? '' : `지우지 못한 전표 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  const tabCount = (t: SalesTab) =>
    docs.filter((d) => t === '전체' || d.confirmStatus === TAB_STATUS[t]).length

  /*
   * 2026-10-20 원본 판매조회 · 구매조회 둘 다 열은 번호 · 일자-No. · 거래처명 · 품목명(요약) · 금액합계 · 거래유형명 · 창고명 ·
   * 회계반영여부 · 인쇄 · 불러온전표 열 개에서 끝나고 합계줄이 없다(구매조회는 같은 날 재고1c 실측 — 프로젝트명 · 공급가액 ·
   * 부가세 · 담당 · 세금계산서 열과 합계줄을 뺐다. 세금계산서는 매입(세금)계산서 화면에서 만든다).
   */
  /* 구매조회는 번호 다음에 체크박스 열이 있다 — [선택삭제] 가 그것을 쓴다(2026-10-28 원본 실측). */
  const colCount = isSales ? 10 : 11

  /**
   * 원본은 일자와 전표번호를 '2026/08/03 -1' 로 한 칸에 적는다(게시글의 '일자-No.'와 같은 규칙).
   * 우리 전표번호는 'SL-20260803-0001' 이라 끝의 일련번호만 떼어 붙인다.
   */
  const dateNo = (d: { date: string; docNo: string }) => {
    const seq = d.docNo.split('-').pop() ?? ''
    return `${d.date.replace(/-/g, '/')} -${Number(seq) || seq}`
  }

  /**
   * 구매조회 [인쇄] — 원본은 웹페이지가 아니라 '구매전표' 인쇄 미리보기 창을 띄운다(2026-10-31 loginad E040304 실측).
   * 머리 오른쪽은 구매창고 '이름(코드)' · 구매처 '이름(사업자번호)', 품목 줄 일자는 전표 일자 MM/DD, 수량은 단위를 붙인다.
   */
  const [slipDocs, setSlipDocs] = useState<SlipPrintDoc[] | null>(null)
  function toSlip(d: NormalDoc): SlipPrintDoc {
    const whCode = pickers.warehouses.find((w) => w.id === d.warehouseId)?.code
    const biz = partners.find((x) => x.id === d.partnerId)?.bizRegNo?.replace(/\D/g, '')
    const md = d.date.slice(5).replace('-', '/')
    const qty = d.lines.reduce((a, l) => a + Number(l.quantity), 0)
    return {
      key: d.id, title: '구매전표', docNo: dateNo(d), date: d.date.replace(/-/g, '/'),
      right: [
        { label: '구매창고', value: whCode ? `${d.warehouseName}(${whCode})` : d.warehouseName },
        { label: '구매처', value: biz ? `${d.partnerName}(${biz})` : d.partnerName },
      ],
      lines: d.lines.map((l) => ({
        date: md, name: l.spec ? `${l.itemName} [${l.spec}]` : l.itemName,
        qty: `${Number(l.quantity).toLocaleString()}${l.unit ?? ''}`, unitPrice: won(Number(l.unitPrice)),
        supply: won(Number(l.supplyAmount)), vat: won(Number(l.vatAmount)),
      })),
      totalQty: qty.toLocaleString(), supply: won(d.supplyAmount), vat: won(d.vatAmount), total: won(d.totalAmount),
    }
  }
  /** 하단 [인쇄] — 고른 전표들을 한 창에서 쪽으로 넘겨 본다(원본 [Page 1/2]). 고른 줄이 없으면 셸이 원본 알림을 띄운다. */
  function printSelected() {
    const picked = shown.filter((d) => selected.has(d.id))
    if (picked.length) setSlipDocs(picked.map(toSlip))
  }

  /** 행의 [인쇄] — 그 전표 하나만 인쇄한다(원본 목록에도 행마다 인쇄가 있다). */
  function printOne(d: NormalDoc) {
    if (!isSales) { setSlipDocs([toSlip(d)]); return }
    setOpenId(d.id)
    // 상세가 펼쳐진 뒤에 인쇄해야 품목까지 같이 나온다.
    window.setTimeout(() => window.print(), 100)
  }
  useTableColumnCheck(listRef, `${cfg.title} 목록`, [isSales, shown.length])


  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load}
      title={cfg.title} search={keyword} onSearchChange={setKeyword}
      // 원본 목록의 하단 버튼줄은 [신규(F2)] 로 시작한다 — 조회에서 바로 입력 화면으로 간다.
      // 셸에는 이미 그 자리가 있었는데 이 화면이 onNew 를 안 넘겨 비어 있었다.
      // 구매조회 [신규(F2)] 도 목록 위 '구매입력' 창이다(2026-10-22 원본 E040304 실측, 아래 [현금지급]).
      onNew={newDoc}
      /* 원본 판매조회 [Option](2026-10-31 판매 QA): 업무설정 · 검색항목설정 · 양식설정 ▶ · 조건양식설정 · 문서발송내역 · 판매조회(OLD). 우리에게 없는 설정이라 안내만. */
      optionMenu={isSales ? [
        { label: '업무설정', onClick: notHere('업무설정') },
        { label: '검색항목설정', onClick: notHere('검색항목설정') },
        { label: '양식설정', sub: [
          { label: '기본(수정불가)', active: true, onClick: () => void ecAlert('양식은 하나만 지원합니다.') },
          { label: '신규양식추가', onClick: () => void ecAlert('신규양식추가는 지원하지 않습니다(양식 하나).') },
        ] },
        { label: '조건양식설정', onClick: notHere('조건양식설정') },
        { label: '문서발송내역', onClick: notHere('문서발송내역') },
        { label: '판매조회(OLD)', onClick: notHere('판매조회(OLD)') },
      ] : undefined}
      actions={isSales ? [
        /*
         * 원본 판매조회 하단(2026-10-31 loginad E040206 실측): 신규(F2) · [Email│▲ 카카오톡] · [진행상태변경 ▲] · [보내기 ▲] ·
         * [인쇄│▲ 프린트문제해결] · [바코드(품목)│▲ 바코드(전표) · 바코드(시리얼/로트No.)] · 전자결재 · 선택삭제 ·
         * [Excel(표시형식)│▲ Excel(데이터)] · [이력조회 ▲]. │▲ 는 갈라진 단추, 글자 ▲ 는 한 단추(EcListShell FooterButton).
         * 보내기(E Note · 대화방 · 사용자 · 북마크 — 작업지시서조회 QA) · 전자결재 · 카카오톡 · 바코드는 받쳐 줄 것이 없어 안내만.
         */
        { label: 'Email', onClick: () => void ecAlert(EMAIL_NOT_HERE), menu: [{ label: '카카오톡', onClick: notHere('카카오톡') }] },
        { label: '진행상태변경', menuOnly: true, menu: [
          { label: '미확인', onClick: () => void confirmSelected('unconfirm') },
          { label: '확인', onClick: () => void confirmSelected('confirm') },
        ] },
        { label: '보내기', menuOnly: true, menu: ['E Note', '대화방', '사용자', '북마크'].map((l) => ({ label: l, onClick: notHere(`보내기 › ${l}`) })) },
        { label: '인쇄', menu: [{ label: '프린트문제해결', onClick: notHere('프린트문제해결') }] },
        { label: '바코드(품목)', onClick: () => void ecAlert(BARCODE_NOT_HERE), selected: selected.size, menu: [
          { label: '바코드(전표)', onClick: notHere('바코드(전표)') },
          { label: '바코드(시리얼/로트No.)', onClick: notHere('바코드(시리얼/로트No.)') },
        ] },
        { label: '전자결재', onClick: notHere('전자결재') },
        { label: '선택삭제', onClick: () => void deleteSelected(), selected: selected.size },
        { label: 'Excel(표시형식)', menu: [{ label: 'Excel(데이터)' }] },
        { label: '이력조회', menuOnly: true, menu: [
          { label: '판매 이력조회', onClick: () => setHistoryMenu('판매') },
          { label: '판매 II 이력조회', onClick: () => setHistoryMenu('판매II') },
        ] },
      ] : [
        /* 원본 버튼줄 차례: … 선택삭제 앞이 <b>[회계반영]</b> 이다. */
        { label: `회계반영${selected.size ? ` (${selected.size})` : ''}`,
          onClick: () => void reflectSelected(), disabled: selected.size === 0 },
        { label: '선택삭제', onClick: () => void deleteSelected(), selected: selected.size },
        /*
         * 원본 [거래내역보기(구매)] — 지금 고른 거래처의 거래만 남긴다.
         * 조회 화면에서 한 거래처만 훑고 싶을 때 조건을 다시 고르지 않아도 된다.
         */
        { label: isSales ? '거래내역보기(판매)' : '거래내역보기(구매)',
          onClick: () => setPartnerCond(partnerCond || (shown[0] ? String(shown[0].partnerId) : '')) },
        { label: 'Excel' },
        { label: '인쇄', onClick: printSelected, selected: selected.size },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {slipDocs && <EcSlipPrintModal title="구매전표" docs={slipDocs} onClose={() => setSlipDocs(null)} />}
      {historyMenu && (
        <SlipMenuHistoryModal menu={historyMenu} title={historyMenu === '판매II' ? '판매 II 이력조회' : '판매 이력조회'}
                              noLabel="전표번호" itemLabel="품목명" onClose={() => setHistoryMenu(null)} />
      )}

      {/*
        원본은 이 줄이 [상태 알약]…………[기간] 이다 — 왼쪽에 필터, 오른쪽 끝에 조회 기간.
        우리는 기간을 왼쪽 위에 조건 폼으로 따로 두고 있었다. 기간은 조건이라기보다 '지금 뭘 보고 있나' 라
        오른쪽이 맞다. 원본은 기간을 텍스트로만 보여 주지만, 우리는 바꿀 수 있게 남긴다 —
        못 바꾸게 만들 이유가 없다.
      */}
      <div className="flex flex-wrap items-center gap-[6px] mb-[6px]">
        {isSales && (
          <div className="ec-pills">
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
        <span style={{ marginLeft: isSales ? 8 : 0, fontSize: 12, color: 'var(--ec-text-hint)', whiteSpace: 'nowrap' }}>
          총 {shown.length}건 · 행을 클릭하면 품목 상세가 펼쳐집니다.
        </span>
        {/*
          조건 판 — 원본처럼 접어 두고 [Search(F3)] 로 펼친다(EcListShell). 원본 판은 한 줄에 조건 하나,
          왼쪽 이름표 114 · 오른쪽 칸이다(2026-10-30 판매조회 E040206 실측) — 예전에는 이름표를 칸 위에 얹어 가로로 늘어놓았다.
        */}
        <ul className="ec-cond">
          {/*
            <b>이 파일이 겸하는 두 화면은 이 줄을 서로 다르게 부른다</b>(사본 실측) —
            판매조회는 [기준일자], 구매조회는 [일자]다. 한 이름으로 눌러 두면 한쪽이 늘 틀린다.
            예전 주석에는 "원본은 [일자]라고 부른다" 고만 적혀 있었는데, 판매 쪽은 아니었다.
          */}
          <EcCond label={dateLabel}>
            <EcDateRange from={{ className: "ec-input", value: from, onChange: (e) => setFrom(e.target.value) }} to={{ className: "ec-input", value: to, onChange: (e) => setTo(e.target.value) }} />
            {/* 기간 빠른선택 — 판 아래 줄(EcListShell)이 이 단추 글자로 줄을 짓고 눌러 준다. 판 안에서는 감춰진다(data-shell-dup).
                원본 판 아래 줄: 금일 · 전일 · 금주(~오늘) · 전주 · 금월(~오늘) · 전월 · 종료일 · 최근30일(+1개월) · 금년(2026-10-30 실측) */}
            {/* 판매조회 판 아래 줄에는 [금년] 이 없다(2026-10-31 loginad 판매 QA) — 구매조회는 그대로 */}
            {ORDER_LIST_PICKS.filter((l) => !isSales || l !== '금년').map((l) => (
              <button key={l} type="button" className="ec-btn ec-btn-sm ec-btn-pick" onClick={() => {
                const r = periodOf(l, new Date(), undefined, { from, to })
                if (!r) return
                if (r.from !== undefined) setFrom(r.from)
                setTo(r.to)
              }}>{l}</button>
            ))}
          </EcCond>
          {/*
            원본 판매조회 조건 차례 실측(사본): 기준일자 · <b>거래유형 · 창고 · 프로젝트 ·
            거래처 · 품목</b> · 발송여부. 우리는 거래처·담당자·창고·품목·거래유형 차례였다.
          */}
          <EcCond label="거래유형" pick>
            {isSales ? (
              <CodePickerField label="거래유형" hideLabel fill width={130} emptyLabel="전체" multiple checkApply hideNew
                               popupTitle="거래유형(영업)검색" value="" onChange={() => {}}
                               values={typeCodes} onChangeMulti={(v) => setTypeCodes(v)}
                               columns={[
                                 { head: '거래유형코드', width: 160, cell: (i) => i.code, link: true },
                                 { head: '거래유형명', cell: (i) => i.name, link: true },
                               ]}
                               items={SALES_TRADE_TYPES} />
            ) : (
            <CodePickerField label="거래유형" hideLabel fill width={130} emptyLabel="전체"
                             value={typeCond} onChange={setTypeCond}
                             items={[...new Set(docs.map(tradeTypeOf))].sort()
                               .map((n) => ({ value: n, name: n }))} />
            )}
          </EcCond>
          {/*
            목록에 열로 있는 값은 걸러 낼 수도 있어야 한다. 원본 조회의 조건이 그것이다.
            이름은 화면마다 다르다 — 원본 <b>판매조회는 [창고], 구매조회는 [입고창고]</b> 다.
            한 이름으로 묶으면 한쪽은 원본과 다른 말을 쓰게 된다.
          */}
          {/*
            <b>판매조회·구매조회 둘 다 [창고] 다.</b> 예전에는 갈래로 나눠 구매 쪽을
            [입고창고] 라 적었다 — 사본이 그렇게 적어 두어 그대로 따랐다. 2026-09-07 에
            원본(E040304 구매조회)을 열어 보니 <b>[창고]</b> 다. 사본과 어긋나면 원본이 심판이라
            갈래를 없애고 한 이름으로 둔다.
          */}
          <EcCond label="창고" pick>
            <CodePickerField label="창고" hideLabel fill width={130} emptyLabel="전체"
                             value={whCond} onChange={setWhCond}
                             items={pickers.warehouses} />
          </EcCond>
          <EcCond label="프로젝트" pick>
            <CodePickerField label="프로젝트" hideLabel fill width={130} emptyLabel="전체"
                             value={projectCond} onChange={setProjectCond}
                             items={pickers.projects} />
          </EcCond>
          <EcCond label="거래처" pick>
            <CodePickerField label="거래처" hideLabel fill width={150} emptyLabel="전체"
                             value={partnerCond} onChange={setPartnerCond}
                             items={pickers.partners} />
          </EcCond>
          {/* 원본 [품목] — 전표 안의 어느 줄이든 그 품목이 있으면 걸린다. */}
          <EcCond label="품목" pick>
            <CodePickerField label="품목" hideLabel fill width={130} emptyLabel="전체"
                             value={itemCond} onChange={setItemCond}
                             items={pickers.items} />
          </EcCond>
          {/* 원본 차례: [품목] · (발송여부는 알약) · <b>[오더관리번호]</b> · [규격] · [담당자]. */}
          <EcCond label="오더관리번호" pick>
            <CodePickerField label="오더관리번호" hideLabel fill width={130} emptyLabel="전체"
                             value={orderNoCond} onChange={setOrderNoCond}
                             items={[...new Set(docs.flatMap((d) => d.lines.map((l) => l.sourceDocNo)).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          <EcCond label="규격" pick>
            <CodePickerField label="규격" hideLabel fill width={110} emptyLabel="전체"
                             value={specCond} onChange={setSpecCond}
                             items={[...new Set(docs.flatMap((d) => d.lines.map((l) => l.spec)).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          {/*
            원본 [담당자] — 전표를 <b>맡은</b> 사원이다. 예전에는 이 칸이 createdBy 로 걸려
            <b>작성자를 담당자라고 부르고</b> 있었다. 원본은 둘을 따로 둔다(실측).
          */}
          <EcCond label="담당자" pick>
            <CodePickerField label="담당자" hideLabel fill width={120} emptyLabel="전체"
                             value={managerCond} onChange={setManagerCond}
                             items={[...new Set(docs.map((d) => d.employeeName).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          {/* 원본 차례: [담당자] 다음이 <b>[거래처관리담당자]</b> 다. */}
          <EcCond label="거래처관리담당자" pick>
            <CodePickerField label="거래처관리담당자" hideLabel fill width={140} emptyLabel="전체"
                             value={partnerMgrCond} onChange={setPartnerMgrCond}
                             items={[...new Set(partners.map((p) => p.manager).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          {/* 원본 차례: [거래처관리담당자] 다음이 <b>[회계반영여부]</b> 다. */}
          {/* 원본 판매조회는 알약 [전체] [미청구] [청구](2026-10-31 loginad 판매 QA) — 미청구 = 회계 미반영, 청구 = 반영. 구매조회는 그대로 고르기. */}
          <EcCond label="회계반영여부">
          {isSales ? (
            <CondPills options={['전체', '미청구', '청구'] as const}
                       value={reflectedCond === '반영' ? '청구' : reflectedCond === '미반영' ? '미청구' : '전체'}
                       onChange={(v) => setReflectedCond(v === '청구' ? '반영' : v === '미청구' ? '미반영' : '전체')} />
          ) : (
          <select className="ec-input" value={reflectedCond} style={{ width: 90 }}
                  onChange={(e) => setReflectedCond(e.target.value as '전체' | '반영' | '미반영')}>
            <option>전체</option><option>반영</option><option>미반영</option>
          </select>
          )}
          </EcCond>
          {/* 원본 차례: [회계반영여부] 다음이 [판매구분](전체 · 판매 · 판매 II). 판매입력 II 로 만든 전표인가(inputII)로 거른다. */}
          {isSales && (
            <EcCond label="판매구분">
              <CondPills options={['전체', '판매', '판매 II'] as const} value={kindCond} onChange={setKindCond} />
            </EcCond>
          )}
          {/* 원본 차례: [판매구분] 다음이 <b>[적요]</b> 다. 전표 적요로 좁힌다. */}
          <EcCond label="적요">
            <input className="ec-input w-full" value={remarkCond} placeholder="적요 일부"
                   onChange={(e) => setRemarkCond(e.target.value)} />
          </EcCond>
          {/* 원본 차례: [적요] 다음이 <b>[작성자]</b>, 그다음이 [최종수정자] 다. */}
          <EcCond label="작성자" pick>
            <CodePickerField label="작성자" hideLabel fill width={120} emptyLabel="전체"
                             value={authorCond} onChange={setAuthorCond}
                             items={[...new Set(docs.map((d) => d.createdBy).filter(Boolean) as string[])].sort()
                               .map((n) => ({ value: n, name: n }))} />
          </EcCond>
          {/* 원본 차례: [작성자]·[최종수정자] 다음이 <b>[최초작성일자]</b>, 그다음이 [최종수정일시] 다. */}
          <EcCond label="최초작성일자">
            <EcDateRange from={{ className: "ec-input", value: madeFrom, onChange: (e) => setMadeFrom(e.target.value) }} to={{ className: "ec-input", value: madeTo, onChange: (e) => setMadeTo(e.target.value) }} />
          </EcCond>
          <EcCond label={updatedLabel}>
            <EcDateRange from={{ className: "ec-input", value: updFrom, onChange: (e) => setUpdFrom(e.target.value) }} to={{ className: "ec-input", value: updTo, onChange: (e) => setUpdTo(e.target.value) }} />
          </EcCond>
          {/*
            원본 조건 판 <b>[기타]</b>. 2026-09-07 에 켜져 있는 원본(E040206 판매조회)을 열어
            재 보니 [기타] 안에는 <b>[수정일자순(정렬)] 하나</b>가 들어 있다 —
            기준일자 · 거래유형 · 내.외자구분 · 창고 · 프로젝트 · 거래처 · 품목 ·
            발송여부 · <b>기타</b> · 적요 차례다.
            원본은 자잘한 체크박스를 이 이름으로 묶고 <b>우리도 묶는다</b>.
          */}
          <EcCond label="기타">
            <label className="text-[12.5px] flex items-center gap-[4px]">
              <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} />
              수정일자순(정렬)
            </label>
          </EcCond>
        </ul>
      </div>

      <table ref={listRef} className="w-full text-left ec-list-grid">
        <thead>
          <tr>
            {/*
              판매조회 1열은 전체선택 체크박스 · 줄마다 체크박스, 번호 열은 없다(2026-10-31 loginad 판매 QA).
              구매조회는 번호(눌러서 고름) 다음에 체크박스 열이다(2026-10-28 원본 실측) — 그대로.
            */}
            {isSales ? (
              <th className="w-[28px] text-center">
                <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && selected.size === shown.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((d) => d.id)) : new Set())} />
              </th>
            ) : (
              <th
                style={{ width: 34, cursor: shown.length > 0 ? 'pointer' : 'default' }}
                title="전체 선택 / 해제"
                onClick={() => setSelected(selected.size === shown.length ? new Set() : new Set(shown.map((d) => d.id)))}
              />
            )}
            {!isSales && (
              <th className="w-[28px] text-center">
                <input type="checkbox" aria-label="전체 선택" checked={shown.length > 0 && selected.size === shown.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((d) => d.id)) : new Set())} />
              </th>
            )}
            {/*
              여기까지가 원본 판매조회의 열이고 순서도 같다(실측 폭 70·279·304·715·201·140·201·154·101·101).
              원본은 일자와 번호를 '2026/08/03 -1' 처럼 한 칸에 적는다 — 게시글의 '일자-No.'와 같은 규칙이다.
            */}
            {/* 칸 정렬 — 2026-09-21 구매조회에서 <b>글자가 칸 안 어디에 앉는지</b>(Range)로 잰 값:
                [일자-No.] 왼쪽, [거래유형명]·[회계반영여부]·[인쇄]·[불러온전표] 가운데.
                09-09 대조표는 가운데·좌·좌·좌·우 였는데 글자 위치로 다시 재니 틀렸다. */}
            {/* 머리 정렬 없음 — 원본 판매조회 E040206 · 구매조회 E040304 는 머리가 글자(span 700)뿐, 눌러도 차례가 안 바뀐다(2026-10-21 실측). */}
            <th>일자-No.</th>
            <th>거래처명</th>
            <th>품목명(요약)</th>
            <th className="text-right">금액합계</th>
            {/* 원본 '거래유형명'. 우리는 과세/면세를 부가세 유무로 판별한다(전표 입력과 같은 규칙). */}
            <th className="text-center">거래유형명</th>
            <th>창고명</th>
            <th className="text-center">회계반영여부</th>
            <th className="text-center">인쇄</th>
            {/* 이 전표가 어느 수주/발주에서 왔는지 */}
            <th className="text-center">불러온전표</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={colCount} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((d, i) => (
            <Fragment key={d.id}>
              <tr className={i % 2 ? 'ec-list-alt' : undefined}
                  onClick={() => setOpenId(openId === d.id ? null : d.id)} style={{ cursor: 'pointer' }}>
                {isSales ? (
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="선택" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} />
                  </td>
                ) : (
                <td
                  style={{
                    textAlign: 'center',
                    background: selected.has(d.id) ? 'var(--ec-blue-light)' : 'var(--ec-report-stripe)',
                    color: selected.has(d.id) ? 'var(--ec-blue-dark)' : 'var(--ec-text-hint)',
                    fontWeight: selected.has(d.id) ? 700 : 400,
                    cursor: 'pointer', userSelect: 'none',
                  }}
                  title="눌러서 이 전표를 고릅니다"
                  onClick={(e) => { e.stopPropagation(); toggleSelect(d.id) }}
                >
                  {i + 1}
                </td>
                )}
                {!isSales && (
                  <td className="text-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label="선택" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} />
                  </td>
                )}
                {/* 원본: 일자-No 는 링크 색 (25,53,140) · 보통 굵기 · 본문 글꼴이다(2026-09-21 구매조회 실측). */}
                <td style={{ color: 'rgb(25, 53, 140)' }}>
                  {openId === d.id ? '▾ ' : '▸ '}
                  {/* 원본: 일자-No. 링크를 누르면 목록 위에 수정 창이 뜬다. 줄의 다른 곳을 누르면 품목이 펼쳐진다. */}
                  <button type="button" className="ec-link" onClick={(e) => { e.stopPropagation(); editDoc(d) }}>{dateNo(d)}</button>
                </td>
                <td>{d.partnerName}</td>
                <td>
                  {d.lines[0]?.itemName ?? ''}{d.lines.length > 1 ? ` 외 ${d.lines.length - 1}건` : ''}
                </td>
                <td className="text-right">{won(d.totalAmount)}</td>
                <td className="text-center">{tradeTypeOf(d)}</td>
                <td>{d.warehouseName}</td>
                <td className="text-center">
                  {/* 2026-10-20 원본 구매조회 [회계반영여부] 는 반영 전에 빈칸이다(판매조회는 '미반영' 글자 — 그대로). */}
                  {/* 2026-10-22 원본 판매조회(loginaa): 반영은 초록 ✓(fa-check 14px · 초록 = --ec-ok), 미반영은 빈칸. */}
                  {d.accountingReflected ? (isSales ? <span className="text-ec-ok text-[14px]">✓</span> : '반영') : ''}
                </td>
                <td className="text-center" onClick={(e) => e.stopPropagation()}>
                  {/* 원본 [인쇄]는 버튼이 아니라 링크 글자다. */}
                  <button type="button" className="ec-link" onClick={() => printOne(d)}>인쇄</button>
                </td>
                <td className="text-center">
                  {/* 한 전표의 라인들이 서로 다른 근거전표에서 올 수 있다 — 중복을 없애고 요약한다 */}
                  {(() => {
                    const nos = [...new Set(d.lines.map((l) => l.sourceDocNo).filter(Boolean))] as string[]
                    if (isSales) {
                      if (nos.length === 0) return ''
                      return nos.length === 1 ? nos[0] : `${nos[0]} 외 ${nos.length - 1}건`
                    }
                    /* 원본 구매조회 [불러온전표] 는 줄마다 '조회' 링크 — 누르면 '불러온 전표' 창(2026-10-21 실측).
                       발주 등에서 불러와 만든 구매는 주황 꼬리표 '조회'(2026-10-28 실측, 꼬리표 값은 QuotationPage GEN_TAG). */
                    return (
                      <button type="button" className={nos.length > 0 ? SRC_TAG : 'ec-link'}
                              onClick={(e) => { e.stopPropagation(); setSourceDoc(d) }}>
                        조회
                      </button>
                    )
                  })()}
                </td>
              </tr>
              {openId === d.id && (
                <tr className="no-ec">
                  <td colSpan={colCount} className="p-0 bg-ec-page">
                    <table className="w-full text-left my-[4px] mx-0">
                      <thead>
                        {/*
                          원본 구매조회 라인 열 실측(사본): 품목코드 · 품목명 · <b>규격</b> ·
                          <b>기본수량</b> · 단가 · 공급가액 · 부가세 · <b>적요</b>.
                          규격과 적요가 빠져 있었다 — 같은 품목의 다른 규격을 구분할 수가 없고,
                          라인에 적어 둔 메모를 조회에서 볼 수가 없었다.
                          수량 이름은 원본이 판매는 '수량', 구매는 '기본수량' 으로 다르다.
                        */}
                        <tr>
                          <th className="w-[34px]"></th>
                          <th>품목코드</th>
                          <th>품목명</th>
                          <th className="w-[110px]">규격</th>
                          <th className="text-right">수량</th>
                          <th className="text-right">단가</th>
                          <th className="text-right">공급가액</th>
                          <th className="text-right">부가세</th>
                          <th className="w-[160px]">적요</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.lines.map((l, li) => (
                          <tr key={li}>
                            <td className="text-center text-ec-hint">{li + 1}</td>
                            <td>{l.itemCode}</td>
                            <td>{l.itemName}</td>
                            <td className="text-ec-label">{l.spec ?? ''}</td>
                            <td className="text-right">{won(l.quantity)} {l.unit}</td>
                            <td className="text-right">{won(l.unitPrice)}</td>
                            <td className="text-right">{won(l.supplyAmount)}</td>
                            <td className="text-right text-ec-hint">{won(l.vatAmount)}</td>
                            <td className="text-ec-label">{l.remark ?? ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="pt-[4px] px-[10px] pb-[8px] flex gap-[6px] items-center">
                      <button className="ec-btn ec-btn-primary" onClick={() => printStatement(d)}>
                        {isSales ? '거래명세서 인쇄' : '매입명세서 인쇄'}
                      </button>
                      <button className="ec-btn" onClick={() => editDoc(d)}>수정</button>
                      {/* 원본 구매조회의 [반품처리]. 원 전표는 그대로 두고 반품 전표를 새로 만든다. */}
                      <button className="ec-btn" onClick={() => returnDoc(d)}>반품처리</button>
                      <button
                        className="ec-btn"
                        style={{ color: 'var(--ec-danger)', borderColor: '#e2b4bc' }}
                        onClick={() => deleteDoc(d)}
                      >
                        삭제
                      </button>
                      <span className="text-[11.5px] text-ec-hint">
                        삭제하면 {isSales ? '출고' : '입고'}분이 재고로 되돌아갑니다.
                        회계반영{isSales ? '' : '·확인'}·세금계산서 발행 전표는 먼저 취소해야 합니다.
                      </span>
                    </div>
                    {d.remark && <div className="pt-[2px] px-[10px] pb-[8px] text-[12px] text-ec-label">비고: {d.remark}</div>}
                    {isSales && <div className="pt-0 px-[10px] pb-[8px]"><CustomFieldsPanel entityType="SALES" entityId={d.id} /></div>}
                    <div className="pt-0 px-[10px] pb-[8px]">
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
        {/* 원본 판매조회 · 구매조회에는 합계줄이 없다(2026-10-20 실측). */}
      </table>
      {popupOpen && (
        /* 원본 창은 바깥을 눌러도 닫히지 않는다 — 고치던 것이 날아가지 않게 [닫기] · ✕ 로만 닫는다. */
        <div className="ec-modal-back">
          <ModalWindow title={popupTitle} onClose={() => closePopup(false)} className="w-[max(960px,50vw)]">
              {/* 원본 판매입력(수정) 머리 오른쪽 [확인취소] — 이 회사는 전표상태관리유형이 꺼져 있어 원본도 이 알림만 띄운다(plans 재고1:80). */}
              {isSales && popupId != null && !popupCopied && (
                <div className="flex justify-end mb-[6px]">
                  <button type="button" className="ec-btn ec-btn-sm"
                          onClick={() => void ecAlert('전표상태관리유형 설정으로 인해 전표상태를 변경할 수 없습니다.')}>확인취소</button>
                </div>
              )}
              <TradeEntry key={popupId ?? 'new'} mode={isSales ? 'sales' : 'purchase'} adjust={popupII} popup={{
                editId: popupId,
                onCopy: () => setPopupCopied(true),
                onClose: closePopup,
                onMove: (dir) => void movePopup(dir),
                docs: rawDocs,
                onReturn: () => { const id = popupId; closePopup(false); navigate(`${isSales ? '/sales/sell' : '/sales/buy'}?returnFrom=${id}`) },
              }} />
          </ModalWindow>
        </div>
      )}
      {/*
        원본 '불러온 전표' 창(2026-10-21 구매조회 실측): 위 '구매조회 : 2026/10/28 -1', 격자 품목코드 · 품목명 · 규격 · 수량 ·
        불러온 전표 · 불러온 전표일자-No.(폭 236 · 315 · 142 · 142 · 189 · 236), 직접 넣은 줄은 뒤 두 칸이 빈칸, 아래 [닫기] 하나.
      */}
      <Modal open={!!sourceDoc} title="불러온 전표" width={1280} onClose={() => setSourceDoc(null)}>
        {sourceDoc && (
          <>
            <div className="mb-[6px]">{cfg.title} : {dateNo(sourceDoc)}</div>
            <table className="w-full text-left table-fixed">
              <colgroup>
                <col className="w-[236px]" /><col className="w-[315px]" /><col className="w-[142px]" />
                <col className="w-[142px]" /><col className="w-[189px]" /><col className="w-[236px]" />
              </colgroup>
              <thead>
                <tr>
                  <th>품목코드</th><th>품목명</th><th>규격</th><th className="text-right">수량</th>
                  <th>불러온 전표</th><th className="text-center">불러온 전표일자-No.</th>
                </tr>
              </thead>
              <tbody>
                {sourceDoc.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.itemCode}</td>
                    <td>{l.itemName}</td>
                    <td>{l.spec ?? ''}</td>
                    <td className="text-right">{Number(l.quantity).toLocaleString()}</td>
                    <td>{l.sourceDocNo ? (l.sourceDocType ?? '') : ''}</td>
                    <td className="text-center">
                      {l.sourceDocNo && l.sourceDocDate ? dateNo({ date: l.sourceDocDate, docNo: l.sourceDocNo }) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-[4px] mt-[9px]">
              <button type="button" className="ec-btn" onClick={() => setSourceDoc(null)}>닫기</button>
            </div>
          </>
        )}
      </Modal>
    </EcListShell>
  )
}
