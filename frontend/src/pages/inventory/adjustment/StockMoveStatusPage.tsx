import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import { dateNo, shortDateNo } from '../../../utils/dateNo'
import type { CodeOption, Warehouse } from '../../../types/api'
import EcListShell from '../../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../../components/EcStatusPanel'
import EcBarChart from '../../../components/EcBarChart'
import { useItemMgmt } from '../../../utils/itemMgmtItems'
import { useItemFlags } from '../../../utils/useInactiveItems'
import { stockCostMapFromLast } from '../../../utils/stockValue'
import { INQUIRY_PICKS, periodOf, ymd } from '../../../components/EcPeriodPicks'
import CodePickerField from '../../../components/codepicker/CodePickerField'
import { useCondPickers } from '../../../utils/useCondPickers'
import { useTableColumnCheck } from '../../../utils/assertTableColumns'
import ItemSuggestInput from '../../../features/item/components/ItemSuggestInput'
import { AsAggControls, AsAggregateTable, type AsAggKey, type AsAggLine, type AsAggValue } from '../../../features/as/AsAggregate'
import { EcReportHead, EcReportFoot, reportDate, reportPeriod } from '../../../components/EcReportFrame'

/**
 * 재고 > 기타이동현황 — 자가사용(E040506) · 불량처리(E040509) · 대체사용(E040510) ·
 * 폐기(E040511) · 재고조정(E040608)
 *
 * 원본 `출력물 > 기타이동현황` 그룹은 여덟 화면인데(창고이동·자가사용·불량처리·대체사용·
 * 폐기·불량률파악보고서·재고실사·재고조정) 우리에겐 <b>입력 화면만</b> 있고 현황이 하나도 없었다.
 * 기타이동은 넣고 나면 다시 볼 일이 없어 보이지만, 재고가 안 맞을 때 제일 먼저 뒤지는 곳이다.
 *
 * 다섯 화면이 같은 표를 유형만 바꿔 보여 주므로 한 컴포넌트에 `type` 을 넘긴다
 * (`StockAdjustmentType` 이 원본 다섯 메뉴와 그대로 대응한다).
 *
 * 원본 [구분]은 ◉내역(일별 · 월별 · 라인별 · 전표별 · 품목별 · 전표별품목별 · 담당자별) · ○집계(집계조건1 · 2)다
 * (2026-10-12 실측). 내역은 출력물 머리글 · 소계 · 합계 · 꼬리를 그린다.
 *
 * 원본 조건 중 프로젝트·담당자는 StockAdjustment 에 없어 넣지 않았다.
 *
 * <p><b>[기타]는 재고조정현황(E040608)에만 있다.</b> 2026-09-08 에 그 화면을 열어 재니
 * 조건이 <b>스물</b>이고([양식] 구역 머리까지 세면), [기타] 안에는 체크가 둘 —
 * <b>조정수량0포함</b>·<b>수량관리제외품목포함</b> 이며 <b>둘 다 꺼짐</b>이 기본이다.
 * 나머지 넷(자가사용·불량처리·대체사용·폐기)의 조건 판에는 [기타] 자체가 없다.
 *
 * <p>조정수량이 0 인 줄은 <b>손댔지만 수량은 그대로</b>인 전표다(창고만 바꿨거나 취소분).
 * 원본이 기본으로 빼는 이유가 그것이라 우리도 뺀다 — 켜야 보인다.
 */
export type AdjustKind = 'SELF_USE' | 'DEFECT' | 'SUBSTITUTE' | 'DISPOSAL' | 'ADJUST'

const TITLE: Record<AdjustKind, string> = {
  SELF_USE: '자가사용현황',
  DEFECT: '불량처리현황',
  SUBSTITUTE: '대체사용현황',
  DISPOSAL: '폐기현황',
  ADJUST: '재고조정현황',
}

interface Adjustment {
  id: number
  adjustNo: string
  adjustDate: string
  type: AdjustKind
  typeName: string
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number
  warehouseName: string
  beforeQty: number
  quantityChange: number
  afterQty: number
  /** 불량처리의 정상품목 줄(들어온 재고). 대체사용현황만 세우고 나머지 현황은 뺀다. */
  normal?: boolean
  reason: string | null
  createdBy: string | null
  /** 원본 조건 [담당자]. 서버는 진작 보내는데 화면이 받아 두지 않아 거를 수가 없었다. */
  employeeId: number | null
  /** 원본 조건 [규격]. 서버가 이제 실어 준다. */
  spec: string | null
  /** 원본 조건 [프로젝트]. 서버는 진작 보내는데 화면이 받아 두지 않았다. */
  projectId: number | null
  projectName: string | null
  /** 원본 조건 [품목구분]. 품목 마스터의 값이라 서버가 실어 준다. */
  itemCategory: string | null
  /** 원본 조건 [불량유형]·[사용유형] — 유형에 따라 이름이 다른 같은 자리다. */
  kind: string | null
  /** 원본 조건 [처리방법](불량처리). */
  handling: string | null
  itemCategoryName: string | null
  /** 원본 [거래처명] — 자가사용입력 머리의 거래처(2026-10-12). 이름은 거래처 목록에서 붙인다. */
  partnerId?: number | null
}

/** 거래처 마스터에서 이 화면이 쓰는 칸 — [거래처명] · [거래처그룹1] · [거래처관리담당자]. */
interface PartnerRow { id: number; code: string; name: string; partnerGroupName: string | null; manager: string | null }

/** 서버가 잘라서 줄 수 있다 — 전체 줄 수와 잘랐는지를 함께 준다. */
interface AdjustmentList {
  rows: Adjustment[]
  totalRows: number
  truncated: boolean
}

const num = (n: number) => n.toLocaleString()

/** 원본 ◉내역 선택상자(차례 그대로). */
const FORMS = ['일별', '월별', '라인별', '전표별', '품목별', '전표별품목별', '담당자별'] as const
type Form = (typeof FORMS)[number]

/** 원본 ◉내역 출력물 머리글(2026-10-12 실측) — 메뉴 이름과 다른 화면이 둘 있다. */
const REPORT_TITLE: Record<AdjustKind, string> = {
  SELF_USE: '자가사용현황',
  DEFECT: '불량현황',
  SUBSTITUTE: '대체사용현황',
  DISPOSAL: '폐기리스트',
  ADJUST: '재고조정현황',
}
/** 원본 [정렬/소계기준] 기본 소계(2026-10-12 실측). 없으면 합계만. */
const SUB_BY: Partial<Record<AdjustKind, '일' | '월'>> = { DEFECT: '일', SELF_USE: '월', DISPOSAL: '월' }
/**
 * [정렬/소계기준] 고를 값 — 정렬은 원본 기본값([일자-No.] 오름차순) 하나로 두고, 소계를 일 · 월 · 없음 중에서 고른다.
 * 기본은 화면마다 원본이 정해 둔 값(SUB_BY)이다.
 */
const SUBTOTALS = ['일자별', '월별', '소계없음'] as const
type Subtotal = (typeof SUBTOTALS)[number]
const defaultSub = (k: AdjustKind): Subtotal => (SUB_BY[k] === '일' ? '일자별' : SUB_BY[k] === '월' ? '월별' : '소계없음')

/** 격자 열 하나 — 글자 칸은 묶음 첫 줄 값, 숫자 칸은 묶음 합. */
interface Col { h: string; text?: (r: Adjustment) => string; num?: (r: Adjustment) => number | null; amount?: boolean }
/** ◉내역 한 줄 — 라인별이면 줄 하나, 그 밖의 판이면 묶인 줄들. */
interface Group { key: string; first: Adjustment; rows: Adjustment[]; dateCell: string }
/** 여러 화면이 같이 쓰는 열. 원본은 규격을 품목명 뒤 대괄호에 한 칸 띄워 붙인다('인셀디스플레이 [5x5]'). */
const C = {
  dateNo: { h: '일자-No.' } as Col,
  code: { h: '품목코드', text: (r: Adjustment) => r.itemCode } as Col,
  item: (h: string): Col => ({ h, text: (r) => r.itemName + (r.spec ? ` [${r.spec}]` : '') }),
  wh: { h: '창고명', text: (r: Adjustment) => r.warehouseName ?? '' } as Col,
  memo: { h: '적요', text: (r: Adjustment) => r.reason ?? '' } as Col,
}
/** 원본 수량 꼴 — 소수 두 자리('7.00'). */
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** 불량처리 전표를 데려가는 현황과 그 [처리방법]. */
const HANDLING_OF: Partial<Record<AdjustKind, string>> = { DISPOSAL: '폐기', SUBSTITUTE: '품목대체' }

export default function StockMoveStatusPage({ kind }: { kind: AdjustKind }) {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'employees', 'projects'])
  const [rows, setRows] = useState<Adjustment[]>([])
  /** 조건에 걸린 <b>전체</b> 줄 수와, 잘라서 받았는지. 원본 [오천건이상조회] 와 같은 문턱이다. */
  const [totalRows, setTotalRows] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [all, setAll] = useState(false)
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  /** 원본 [품목구분] 의 값 목록. 화면이 지어내지 않고 서버가 주는 것을 쓴다. */
  const [cats, setCats] = useState<CodeOption[]>([])
  /**
   * 원본 [불량유형]·[사용유형]·[처리방법] 의 값 목록. <b>공통코드</b>에서 가져온다 —
   * 회사마다 부르는 이름이 달라 코드로 박아 둘 값이 아니다. 없으면 그 회사가 아직 안
   * 만든 것이라, 고를 것이 없는 빈 목록을 그대로 보여 준다.
   */
  const [codeGroups, setCodeGroups] = useState<{ code: string; name: string; codes: { name: string }[] }[]>([])
  /*
   * 원본 자가사용현황의 [거래처명] 열 · [거래처] · [거래처그룹1] · [거래처관리담당자] 조건.
   * 자가사용 전표가 거래처를 들게 된 것은 2026-10-12(자가사용입력) — 다른 네 화면의 전표에는 거래처가 없다.
   */
  const [partners, setPartners] = useState<PartnerRow[]>([])
  useEffect(() => {
    if (kind !== 'SELF_USE') return
    api.get<PartnerRow[]>('/partners').then((r) => setPartners(r.data)).catch(() => setPartners([]))
  }, [kind])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  /*
   * 원본 기간 기본값은 <b>화면마다 다르다</b>(사본 실측): 불량처리·대체사용·폐기·재고조정은
   * [금월(~오늘)] 인데 <b>자가사용현황만 [전월+금월]</b> 이다. 사본의 달 스핀박스도 그 화면만
   * 06·07 둘이고 나머지는 07 하나라 서로 맞는다.
   *
   * <p>다섯 화면이 한 파일이라 <b>한 값으로 묶어 두면 한 화면이 늘 틀린다</b> —
   * 자가사용을 열면 지난달에 쓴 것이 안 보였다.
   */
  const init = (kind === 'SELF_USE' ? periodOf('전월+금월') : periodOf('금월(~오늘)'))
    ?? { from: ymd(new Date()), to: ymd(new Date()) }
  const [cond, setCond] = useState({
    from: init.from, to: init.to, warehouseId: '', item: '', category: '',
    reason: '', employee: '', spec: '', project: '',
    /* 원본 [불량유형]/[사용유형] · [처리방법] · [수량]. */
    kind: '', handling: '', qtyFrom: '', qtyTo: '',
    /* 원본 [품목그룹1] — 우리 품목그룹은 하나뿐이라 원본의 '1' 이 그것이다. */
    itemGroup: '',
    /* 원본 [최초작성자] — 응답이 createdBy 를 진작 싣고 있었는데 거를 자리가 없었다. */
    createdBy: '',
    /* 원본 [거래처] · [거래처그룹1] · [거래처관리담당자](자가사용현황). */
    partner: '', partnerGroup: '', partnerManager: '',
  })
  const setC = (patch: Partial<typeof cond>) => setCond((c) => ({ ...c, ...patch }))
  /** 원본 [기타] — 재고조정현황에만 있다. 실측한 기본값은 둘 다 꺼짐이다. */
  const [withZeroQty, setWithZeroQty] = useState(false)
  const [withUntracked, setWithUntracked] = useState(false)
  const { untracked } = useItemFlags()
  /* 평가단가를 내는 재료. 품목 마스터의 구매단가와 실제 입고단가(구매전표)다. */
  const [costById, setCostById] = useState<Map<number, number | null>>(new Map())

  function load() {
    setLoading(true)
    setError('')
    Promise.all([
      /*
       * <b>유형도 같이 보낸다.</b> 다섯 화면이 이 파일을 쓰는데 여태 기간만 보내고
       * <code>r.type === kind</code> 로 브라우저에서 걸렀다. 그러면 서버의 5,000줄 문턱을
       * <b>다른 유형이 먼저 채운다</b> — 자가사용 줄이 잘려 나가도 화면은 모르고,
       * [잘림] 표시조차 다섯을 합친 수에 대한 것이었다(2026-09-10 실측: 자가사용 화면이
       * 1,952KB 를 받아 한 줄을 그렸다).
       */
      api.get<AdjustmentList>('/stock-adjustments', { params: { from: cond.from || undefined, to: cond.to || undefined, all, type: kind } }),
      api.get<Warehouse[]>('/warehouses'),
      api.get<CodeOption[]>('/meta/item-categories'),
      api.get<{ code: string; name: string; codes: { name: string }[] }[]>('/codes'),
      /*
       * 원본 [금액(수량*입고단가)] 을 내는 재료. 기간을 안 건다 —
       * 이번 달에 안 샀다고 그 품목의 입고단가가 사라지면 안 된다.
       */
      api.get<{ id: number; purchasePrice?: number }[]>('/items'),
      api.get<{ itemId: number; unitPrice: number }[]>('/purchases/item-prices'),
      /*
       * 원본은 불량처리입력의 [처리방법]이 <b>폐기</b>면 폐기현황에, <b>품목대체</b>면 대체사용현황에 그 줄을 세운다
       * (2026-10-12 실측: 불량처리 폐기 1건 → 폐기현황 '2026/10/12 -1 G001 투광등 100W [100W] 1.00'). 그 둘은 불량처리 전표도 받는다.
       */
      HANDLING_OF[kind]
        ? api.get<AdjustmentList>('/stock-adjustments', { params: { from: cond.from || undefined, to: cond.to || undefined, all, type: 'DEFECT' } })
        : Promise.resolve({ data: { rows: [], totalRows: 0, truncated: false } as AdjustmentList }),
    ])
      .then(([a, w, c, g, it, pu, d]) => {
        const fromDefect = d.data.rows.filter((r) => r.handling === HANDLING_OF[kind])
        setRows([...a.data.rows, ...fromDefect]); setTotalRows(a.data.totalRows + fromDefect.length)
        setTruncated(a.data.truncated || d.data.truncated)
        setWarehouses(w.data); setCats(c.data); setCodeGroups(g.data)
        setCostById(stockCostMapFromLast(it.data, pu.data))
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  /*
   * <b>기간이 바뀌면 다시 물어본다.</b> 예전에는 한 번 받아 놓고 브라우저에서 걸렀는데,
   * 조건 칸에 [금월] 을 물어 놓고 서버에는 <b>아무 조건도 안 보내</b> 4,797줄·1.7MB 를
   * 열 때마다 받아 그중 몇십 줄만 그렸다. 다섯 화면이 이 파일을 쓴다.
   */
  useEffect(() => { load() }, [cond.from, cond.to, all, kind])
  /* 기간을 바꾸면 문턱을 다시 세운다 — 좁혀 놓고도 전부 받아 오면 안 자른 것과 같다. */
  useEffect(() => { setAll(false) }, [cond.from, cond.to])
  // 같은 컴포넌트를 다섯 메뉴가 쓰므로 메뉴를 갈아타도 다시 마운트되지 않는다 — 유형이 바뀌면 조건만 되돌린다.
  useEffect(() => { setMode('내역') }, [kind])

  /** 그 이름의 공통코드 묶음에 든 값들. 없으면 빈 목록이다. */
  const codesOf = (groupName: string) =>
    (codeGroups.find((g) => g.name === groupName)?.codes ?? []).map((c) => c.name)
  const kindOptions = codesOf(kind === 'SELF_USE' ? '사용유형' : '불량유형')
  /*
   * 원본 [처리방법] 후보는 <b>전체 · 폐기 · 품목대체 · 정상사용</b> 고정이다(2026-10-13 불량처리현황 E040509 실측).
   * 불량처리입력의 [처리방법] 셋과 같고, 저장된 전표의 값도 이 셋뿐이다. 공통코드 DEFECT_HANDLING(폐기 · 재작업 · 반품 · 기타)은
   * 원본에 없는 값이라 고르면 늘 빈 목록이 됐다.
   */
  const handlingOptions = ['폐기', '품목대체', '정상사용']
  /**
   * 원본 [최초작성자] 후보. <b>이 화면에 실제로 있는 이름</b>만 낸다 —
   * 사용자 마스터를 부르면 이 구분(자가사용·폐기 …)에 한 건도 없는 사람까지 목록에 선다.
   * 그래서 기간을 바꾸면 고를 수 있는 이름도 같이 달라진다.
   */
  const authors = [...new Set(rows.filter((r) => r.type === kind || (r.type === 'DEFECT' && r.handling === HANDLING_OF[kind]))
    .map((r) => r.createdBy).filter((v): v is string => !!v))].sort()

  /** 원본 [품목그룹1] — 품목 마스터에서 잇는다(관리항목과 같은 길). */
  const mgmt = useItemMgmt()
  /*
   * 담당자 이름. 서버는 <b>id 만</b> 준다 — 재고(inventory)는 사원(hr)을 참조할 수 없어서
   * (CLAUDE.md 4.1 의 순환 금지) 이름은 화면이 목록에서 붙인다. 지워진 사원이면 빈칸이다.
   *
   * mgmt 와 이것은 <b>shown 보다 앞에</b> 둔다. 뒤에 있으면 [담당자]·[품목그룹1] 을 고르는 순간
   * shown 의 거르기가 아직 선언 전인 const 를 불러 ReferenceError 로 화면이 하얗게 뜬다.
   */
  const partnerOf = (id: number | null | undefined) => (id == null ? undefined : partners.find((p) => p.id === id))
  const empName = (id: number | null) =>
    (id == null ? '' : pickers.employees.find((e) => e.id === id)?.name ?? '')

  const shown = rows
    .filter((r) => r.type === kind || (r.type === 'DEFECT' && r.handling === HANDLING_OF[kind]))
    /*
     * 불량처리의 정상품목 줄(재고가 들어온 줄)은 원본 대체사용현황에만 [정상수량] 으로 선다
     * (2026-10-12 실측: 포장김치 불량수량 1 · 배추 정상수량 3). 불량처리현황 · 폐기현황에는 안 선다.
     */
    .filter((r) => !r.normal || kind === 'SUBSTITUTE')
    /* 원본 [기타]. 재고조정 말고는 그 칸이 없으니 다른 유형에서는 걸지 않는다. */
    .filter((r) => kind !== 'ADJUST' || withZeroQty || r.quantityChange !== 0)
    .filter((r) => kind !== 'ADJUST' || withUntracked || !untracked.has(r.itemId))
    .filter((r) => !cond.from || r.adjustDate >= cond.from)
    .filter((r) => !cond.to || r.adjustDate <= cond.to)
    .filter((r) => !cond.warehouseId || String(r.warehouseId) === cond.warehouseId)
    .filter((r) => !cond.item || String(r.itemId) === cond.item)
    /*
     * 원본 조건 <b>[품목구분]</b>. 원자재가 나갔는지 제품이 나갔는지는 사유보다 먼저 묻는
     * 것인데, 다섯 화면 어디에도 그 칸이 없어 <b>표를 눈으로 훑는</b> 수밖에 없었다.
     * 품목등록과 같이 서버가 주는 목록(/meta/item-categories)의 code 로 견준다.
     */
    .filter((r) => !cond.category || r.itemCategory === cond.category)
    /*
     * 원본 [품목그룹1]. 품목그룹은 <b>품목 마스터에 붙는 값</b>이라 재고조정 응답에는
     * 없다 — 관리항목과 같은 길로 잇는다(품목 마스터를 받아 줄의 itemId 로).
     * 예외에 '우리 품목그룹은 평면이고 <b>번호가 없다</b>' 고 적혀 있었으나 사실이 아니다:
     * 품목등록이 원본 이름 그대로 [품목그룹1명] 열을 쓴다. 없는 것은 2·3 이지 1 이 아니다.
     */
    .filter((r) => !cond.itemGroup || mgmt.groupOf(r.itemId) === cond.itemGroup)
    .filter((r) => !cond.reason || (r.reason ?? '').includes(cond.reason))
    /* 원본 조건 [담당자]. 담당자 <b>이름</b>은 사원 목록에서 붙인다 — 재고 모듈은 사원을 모른다. */
    .filter((r) => !cond.employee || empName(r.employeeId) === cond.employee)
    /* 원본 조건 [규격]. 같은 품목이라도 규격이 갈리면 다른 물건이다. */
    .filter((r) => !cond.spec || (r.spec ?? '').includes(cond.spec))
    /* 원본 조건 [프로젝트]. 어느 현장에 나간 자재인지로 좁힌다. */
    .filter((r) => !cond.project || String(r.projectId) === cond.project)
    /* 원본 조건 [불량유형](불량처리·대체사용·폐기) · [사용유형](자가사용) — 같은 자리다. */
    .filter((r) => !cond.kind || (r.kind ?? '') === cond.kind)
    /* 원본 조건 [처리방법] — 불량처리에만 있다. */
    .filter((r) => !cond.handling || (r.handling ?? '') === cond.handling)
    /*
     * 원본 조건 <b>[수량]</b>(자가사용). 움직인 <b>크기</b>로 좁힌다 — 부호는 유형이
     * 정하는 것이라(자가사용은 늘 빠져나간다) 절댓값으로 견준다.
     */
    .filter((r) => !cond.qtyFrom || Math.abs(r.quantityChange) >= Number(cond.qtyFrom))
    .filter((r) => !cond.qtyTo || Math.abs(r.quantityChange) <= Number(cond.qtyTo))
    .filter((r) => !cond.createdBy || (r.createdBy ?? '') === cond.createdBy)
    .filter((r) => !cond.partner || String(r.partnerId) === cond.partner)
    .filter((r) => !cond.partnerGroup || partnerOf(r.partnerId)?.partnerGroupName === cond.partnerGroup)
    .filter((r) => !cond.partnerManager || partnerOf(r.partnerId)?.manager === cond.partnerManager)

  /*
   * 원본 [구분] ◉내역 옆 선택상자 — <b>일별 · 월별 · 라인별(기본) · 전표별 · 품목별 · 전표별품목별 · 담당자별</b>
   * (2026-10-12 불량처리현황 E040509 · 재고조정현황 E040608 실측, 일곱 다 같은 차례). 묶은 줄은 <b>처음 줄</b>의
   * 값(불량유형 · 품목 …)을 두고 수량만 더한다 — 품목별에서 10/03 스크래치 9 + 10/04 불량화소 3 이
   * '스크래치 · 2026/10/03 -1 · 12.00' 한 줄이 됐다. 일별 · 월별은 [일자-No.] 칸에 날짜 · 달만 적는다.
   */
  const [form, setForm] = useState<Form>('라인별')
  /** ○집계 — 집계조건1 · 2 · 코드포함. 조건 없이 검색하면 원본처럼 막는다. */
  const [agg, setAgg] = useState<AsAggValue>({ agg1: '', agg2: '', codeIncl: false })
  useEffect(() => { setForm('라인별'); setAgg({ agg1: '', agg2: '', codeIncl: false }) }, [kind])
  /**
   * 원본 [데이터 보기형식] · [그래프로 보기]. 품목으로 묶어 수량을 그린다.
   * 수량은 <b>절댓값</b>으로 그린다 — 조정은 늘기도 줄기도 해 부호를 섞어 더하면 서로 지워진다.
   */
  const [view, setView] = useState<'표' | '그래프'>('표')
  const chartRows = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of shown) m.set(r.itemName, (m.get(r.itemName) ?? 0) + Math.abs(r.quantityChange))
    return [...m].map(([label, value]) => ({ label, value }))
  }, [shown])

/**
 * 원본의 <b>[금액(수량*입고단가)]</b>.
 *
 * <p>이름이 계산식 그대로다 — 전표에 적힌 <b>거래 금액이 아니라</b>
 * 그 품목을 <b>얼마에 사 왔는지</b>로 수량을 값으로 환산한 칸이다.
 * 평가단가는 재고자산·경영자보고서와 <b>같은 규칙</b>을 쓴다
 * (<code>stockCostMapFromLast</code>: 마지막 입고단가 → 없으면 품목 구매단가).
 * 단가를 모르는 품목은 <b>빈칸</b>이다. 0 으로 채우면 "값이 0원" 으로 읽힌다.
 */
  const amountOf = (itemId: number, qty: number) => {
    const c = costById.get(itemId)
    return c == null ? null : qty * c
  }
  /**
   * 원본 [수량]은 <b>부호 없이</b> 나간 만큼 적는다(불량처리현황 '7.00' · 자가사용현황 '1.00' 실측).
   * 재고조정만 [조정수량]이 늘고 주는 것이라 부호 그대로다.
   */
  const qtyOf = (r: Adjustment) => (kind === 'ADJUST' ? r.quantityChange : -r.quantityChange)
  /* 대체사용현황 [불량수량] · [정상수량] — 불량품목 줄은 불량수량, 품목대체의 정상품목 줄(normal)은 정상수량(2026-10-12 실측). */
  const defectQtyOf = (r: Adjustment) => (r.normal ? null : -r.quantityChange)
  const normalQtyOf = (r: Adjustment) => (r.normal ? r.quantityChange : null)

  /**
   * 원본 격자 열 — <b>다섯 화면이 서로 다르다</b>(2026-10-12 다섯 다 다시 잼). 원본에 없던 우리 열
   * (번호 · 창고명 · 프로젝트 · 이전/이후재고 · 담당자)은 뺐다. 불량처리현황 끝의 '새로운 항목 추가'는
   * 양식에 칸을 더하라는 자리표라 그리지 않는다.
   */
  const COLS: Col[] = kind === 'SELF_USE' ? [
    C.dateNo, { h: '거래처명', text: (r) => partnerOf(r.partnerId)?.name ?? '' }, C.item('품목명[규격]'), C.wh,
    { h: '수량', num: qtyOf }, { h: '금액(수량*입고단가)', num: (r) => amountOf(r.itemId, qtyOf(r)), amount: true }, C.memo,
  ] : kind === 'DEFECT' ? [
    { h: '불량유형', text: (r) => r.kind ?? '' }, { h: '처리방법', text: (r) => r.handling ?? '' },
    C.dateNo, C.code, C.item('품목명[규격]'), { h: '수량', num: qtyOf },
  ] : kind === 'SUBSTITUTE' ? [
    C.dateNo, C.code, C.item('품목명[규격]'), { h: '불량수량', num: defectQtyOf }, { h: '정상수량', num: normalQtyOf }, C.memo,
  ] : kind === 'DISPOSAL' ? [
    C.dateNo, C.code, C.item('품목명[규격명]'), { h: '수량', num: qtyOf }, C.memo,
  ] : [
    C.dateNo, C.code, C.item('품목명[규격]'), C.wh,
    { h: '장부수량', num: (r) => r.beforeQty }, { h: '실사수량', num: (r) => r.afterQty }, { h: '조정수량', num: qtyOf },
    { h: '금액(수량*입고단가)', num: (r) => amountOf(r.itemId, qtyOf(r)), amount: true }, C.memo,
  ]

  /** 원본 정렬 기본값은 [일자-No.] 오름차순(정렬/소계 설정 창 실측). */
  const ordered = useMemo(() => [...shown].sort((a, b) =>
    a.adjustDate.localeCompare(b.adjustDate) || (Number(a.adjustNo.split('-').pop()) - Number(b.adjustNo.split('-').pop())) || a.id - b.id),
  [shown])
  const listRows: Group[] = useMemo(() => {
    const dateCell = (r: Adjustment) => (kind === 'ADJUST' ? shortDateNo(r.adjustDate, r.adjustNo) : dateNo(r.adjustDate, r.adjustNo))
    if (form === '라인별') return ordered.map((r) => ({ key: String(r.id), first: r, rows: [r], dateCell: dateCell(r) }))
    const keyOf = (r: Adjustment) => form === '일별' ? r.adjustDate : form === '월별' ? r.adjustDate.slice(0, 7)
      : form === '전표별' ? `${r.adjustDate}|${r.adjustNo}` : form === '품목별' ? String(r.itemId)
        : form === '전표별품목별' ? `${r.adjustDate}|${r.adjustNo}|${r.itemId}` : String(r.employeeId ?? '')
    const m = new Map<string, Adjustment[]>()
    ordered.forEach((r) => m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]))
    return [...m.entries()].map(([key, rs]) => ({
      key, first: rs[0], rows: rs,
      dateCell: form === '일별' ? reportDate(rs[0].adjustDate) : form === '월별' ? reportDate(rs[0].adjustDate).slice(0, 7) : dateCell(rs[0]),
    }))
  }, [ordered, form, kind])
  /**
   * 원본 소계 — [정렬/소계기준] 기본값이 화면마다 다르다(2026-10-12 실측): 불량처리현황은 <b>날마다</b>
   * '2026/10/02 계', 자가사용현황 · 폐기현황은 <b>달마다</b> '2026/09 계'. 묶은 줄은 첫 줄의 날짜로 센다
   * (품목별 실측). 대체사용 · 재고조정은 원본에 자료가 없어 소계를 못 봤다 — 지어내지 않고 합계만 둔다.
   */
  const [sub, setSub] = useState<Subtotal>(defaultSub(kind))
  useEffect(() => { setSub(defaultSub(kind)) }, [kind])
  const subKey = (g: Group) => (sub === '일자별' ? reportDate(g.first.adjustDate) : sub === '월별' ? reportDate(g.first.adjustDate).slice(0, 7) : '')
  const sumOf = (c: Col, rs: Adjustment[]) => {
    const vs = rs.map((r) => c.num!(r)).filter((v): v is number => v != null)
    return vs.length ? vs.reduce((n, v) => n + v, 0) : null
  }
  const fmt = (c: Col, v: number | null) => (v == null ? '' : c.amount ? Math.round(v).toLocaleString() : qty2(v))
  const firstNum = COLS.findIndex((c) => c.num)
  const sumCells = (rs: Adjustment[], cls: string) => COLS.slice(firstNum).map((c, j) =>
    <td key={j} className={c.num ? `text-right ${cls}` : cls}>{c.num ? fmt(c, sumOf(c, rs)) : ''}</td>)

  /** ○집계가 읽는 줄 — 창고 · 프로젝트 코드는 마스터에서 잇는다. */
  const aggLines: AsAggLine[] = shown.map((r) => ({
    date: r.adjustDate, charge: empName(r.employeeId),
    warehouse: [r.warehouseName ?? '', (warehouses.find((w) => w.id === r.warehouseId) as { code?: string } | undefined)?.code ?? ''],
    mgmt: mgmt.nameOf(r.itemId) ?? '',
    partner: [partnerOf(r.partnerId)?.name ?? '', partnerOf(r.partnerId)?.code ?? ''], partnerGroup: partnerOf(r.partnerId)?.partnerGroupName ?? '',
    itemName: r.itemName, itemSpec: r.spec, itemCode: r.itemCode, itemGroup: mgmt.groupOf(r.itemId) ?? '',
    project: [r.projectName ?? '', ''], qty: kind === 'SUBSTITUTE' ? Math.abs(r.quantityChange) : qtyOf(r), kind: r.kind ?? '',
  }))
  /*
   * 집계조건 후보 — 불량처리현황 실측: 기준일자(일별 … 연별) · 불량(<b>불량유형</b> · 담당자 · 창고 · 관리항목) ·
   * 품목(품목명[규격] · 품목그룹1·2·3) · 프로젝트(프로젝트 · 그룹1·2). 우리에 없는 그룹2·3 은 뺀다.
   * 다른 넷은 같은 판을 쓰되 [불량유형] 대신 자가사용만 거래처 축을 더한다(그 전표만 거래처를 든다).
   */
  const aggKeys: AsAggKey[] = ['일별', '주차별', '월별', '분기별', '반기별', '연별',
    ...(kind === 'DEFECT' || kind === 'SUBSTITUTE' || kind === 'DISPOSAL' ? ['불량유형' as const] : []),
    '담당자', '창고', '관리항목', ...(kind === 'SELF_USE' ? ['거래처' as const, '거래처그룹1' as const] : []),
    '품목명[규격]', '품목그룹1', '프로젝트']

  /* 화면 · 판에 따라 칸 수가 달라지므로 정적 검사로는 못 센다 - 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '기타이동현황', [kind, mode, form, listRows.length])
  const reset = () => {
    setMode('내역')
    setForm('라인별')
    setSub(defaultSub(kind))
    setAgg({ agg1: '', agg2: '', codeIncl: false })
    setCond({
      from: init.from, to: init.to, warehouseId: '', item: '', category: '',
      reason: '', employee: '', spec: '', project: '',
      kind: '', handling: '', qtyFrom: '', qtyTo: '',
    /* 원본 [품목그룹1] — 우리 품목그룹은 하나뿐이라 원본의 '1' 이 그것이다. */
    itemGroup: '',
    /* 원본 [최초작성자] — 응답이 createdBy 를 진작 싣고 있었는데 거를 자리가 없었다. */
    createdBy: '',
    partner: '', partnerGroup: '', partnerManager: '',
    })
  }

  return (
    <EcListShell
      title={TITLE[kind]}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel
        modes={['내역', '집계']} mode={mode} onModeChange={(m) => setMode(m as '내역' | '집계')}
        modeExtra={mode === '내역' ? (
          <select className="ec-input w-[140px]" value={form} onChange={(e) => setForm(e.target.value as Form)}>
            {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        ) : (
          <AsAggControls value={agg} onChange={(p) => setAgg((a) => ({ ...a, ...p }))} keys={aggKeys} />
        )}
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
        dateLabel="일자"
        view={view} onViewChange={setView}
        subtotal={sub} subtotals={SUBTOTALS} onSubtotalChange={(v) => setSub(v as Subtotal)}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={cond.warehouseId} onChange={(v) => setC({ warehouseId: v })}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        {/* 원본 차례: 창고 · <b>프로젝트</b> · 품목 (사본 실측 — 넷이 다 같다). */}
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={cond.project} onChange={(v) => setC({ project: v })}
                           items={pickers.projects} />
        </EcCond>
        {kind === 'SELF_USE' && (
          <EcCond label="거래처" pick>
            <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체"
                             value={cond.partner} onChange={(v) => setC({ partner: v })}
                             items={partners.map((p) => ({ value: String(p.id), code: p.code, name: p.name, sub: p.partnerGroupName }))} />
          </EcCond>
        )}
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={cond.item} onChange={(v) => setC({ item: v })}
                           items={pickers.items} />
        </EcCond>
        {/* 원본 차례는 다섯 화면 모두 품목 <b>바로 뒤</b>가 품목구분이다(사본 실측). */}
        <EcCond label="품목구분">
          <select className="ec-input" value={cond.category}
                  onChange={(e) => setC({ category: e.target.value })} style={{ width: 130 }}>
            <option value="">전체</option>
            {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </EcCond>
        {/* 원본 차례: [품목구분] 다음이 [품목그룹1] 이다(사본 실측). */}
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={150} emptyLabel="전체"
                           value={cond.itemGroup} onChange={(v) => setC({ itemGroup: v })}
                           items={mgmt.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        {/* 원본 조건 [담당자] — 표에는 찍히는데 그것으로 거를 수가 없었다. */}
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체"
                           value={cond.employee} onChange={(v) => setC({ employee: v })}
                           items={pickers.employees} />
        </EcCond>
        {/*
          원본 <b>[불량유형]</b>(불량처리·대체사용·폐기) 과 <b>[사용유형]</b>(자가사용) 은
          <b>유형이 다른 화면의 같은 자리</b>다 — 전표의 한 칸을 화면이 이름만 바꿔 부른다.
          재고조정에는 없다(그 화면은 [기타] 로 묶는다).
          고를 값은 <b>공통코드</b>에서 가져온다 — 화면이 지어내지 않는다.
        */}
        {kind !== 'ADJUST' && (
          <EcCond label={kind === 'SELF_USE' ? '사용유형' : '불량유형'}>
            <select className="ec-input" value={cond.kind}
                    onChange={(e) => setC({ kind: e.target.value })} style={{ width: 140 }}>
              <option value="">전체</option>
              {kindOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </EcCond>
        )}
        {kind === 'DEFECT' && (
          <EcCond label="처리방법">
            <select className="ec-input" value={cond.handling}
                    onChange={(e) => setC({ handling: e.target.value })} style={{ width: 130 }}>
              <option value="">전체</option>
              {handlingOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </EcCond>
        )}
        {kind === 'SELF_USE' && (
          <>
            <EcCond label="거래처그룹1">
              <select className="ec-input w-[150px]" value={cond.partnerGroup} onChange={(e) => setC({ partnerGroup: e.target.value })}>
                <option value="">전체</option>
                {[...new Set(partners.map((p) => p.partnerGroupName).filter((v): v is string => !!v))].sort().map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </EcCond>
            <EcCond label="거래처관리담당자" pick>
              <CodePickerField label="거래처관리담당자" hideLabel width={170} emptyLabel="전체"
                               value={cond.partnerManager} onChange={(v) => setC({ partnerManager: v })}
                               items={[...new Set(partners.map((p) => p.manager).filter((v): v is string => !!v))].sort().map((m) => ({ value: m, name: m }))} />
            </EcCond>
          </>
        )}
        {kind === 'SELF_USE' && (
          <EcCond label="수량">
            <input type="number" className="ec-input text-right" placeholder="이상" value={cond.qtyFrom}
                   onChange={(e) => setC({ qtyFrom: e.target.value })} style={{ width: 90 }} />
            <span className="text-ec-label">~</span>
            <input type="number" className="ec-input text-right" placeholder="이하" value={cond.qtyTo}
                   onChange={(e) => setC({ qtyTo: e.target.value })} style={{ width: 90 }} />
          </EcCond>
        )}
        {/*
          원본 <b>다섯 화면이 서로 다른 차례</b>를 쓴다(사본 실측) — 자가사용은 규격·담당자·적요,
          불량처리는 담당자·적요·규격, 대체사용·폐기는 담당자·규격·적요다.
          한 파일이라 하나만 고를 수 있어 <b>둘이 겹치는</b> 대체사용·폐기 차례를 따른다.
        */}
        <EcCond label="규격">
          <ItemSuggestInput field="spec" value={cond.spec}
                            onChange={(v) => setC({ spec: v })} width={140} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={cond.reason}
                 onChange={(e) => setC({ reason: e.target.value })} style={{ width: 220 }} />
        </EcCond>
        {/*
          원본 [기타] — <b>재고조정현황에만</b> 있고 [적요] 다음, [최초작성자] 앞이다
          (2026-09-08 실측). 다른 네 화면에는 그 칸이 없으므로 그릴 때도 가린다.
        */}
        {kind === 'ADJUST' && (
          <EcCond label="기타">
            <label className="text-[12.5px] flex items-center gap-[4px]">
              <input type="checkbox" checked={withZeroQty} onChange={(e) => setWithZeroQty(e.target.checked)} />
              조정수량0포함
            </label>
            <label className="text-[12.5px] flex items-center gap-[4px]">
              <input type="checkbox" checked={withUntracked} onChange={(e) => setWithUntracked(e.target.checked)} />
              수량관리제외품목포함
            </label>
          </EcCond>
        )}
        {/*
          원본 [최초작성자] — 다섯 화면 모두 [적요]·[진행상태] 뒤, [최종수정자] 앞이다
          (qa/fixtures/ecount-form-fields.json). 응답은 createdBy 를 <b>진작 싣고 있었는데</b>
          그걸로 거를 자리가 없었다. 고를 값은 지금 받아 온 줄에서 모은다 — 사용자 마스터를
          따로 부르면 이 화면에 안 나오는 사람까지 목록에 선다.
        */}
        <EcCond label="최초작성자">
          <select className="ec-input" value={cond.createdBy} style={{ width: 140 }}
                  onChange={(e) => setC({ createdBy: e.target.value })}>
            <option value="">전체</option>
            {authors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/*
        잘랐으면 <b>잘랐다고 말한다.</b> 말이 없으면 아래 합계와 집계가 전체인 줄 알고 읽는다 —
        "1만 2천 건" 이라 써 놓고 5천 줄만 그리는 꼴이 된다. 아래 [집계] 탭과 합계행도
        <b>받은 줄만</b> 센다는 뜻이라 같이 적는다.
      */}
      {truncated && (
        <p style={{ background: 'var(--ec-warn-bg)', color: '#7a5b00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>
          기간에 걸린 {num(totalRows)}건 중 앞 {num(rows.length)}건만 보고 있습니다 — 아래 집계와 합계도 이 {num(rows.length)}건만 셉니다.
          {' '}
          <button className="ec-btn" style={{ marginLeft: 4 }} onClick={() => setAll(true)}>오천건이상조회</button>
        </p>
      )}

      <div className="overflow-x-auto" ref={tableRef}>
        {view === '그래프' ? (
          <EcBarChart rows={chartRows} unit="" emptyText="조회된 자료가 없습니다." />
        ) : mode === '집계' ? (
          /* 원본 ○집계 판의 머리글은 화면 이름 그대로('불량처리현황')이고 꼬리에 [P.1] 이 없다(2026-10-12 실측). */
          <AsAggregateTable title={TITLE[kind]} period={reportPeriod(cond.from, cond.to)} lines={aggLines} value={agg} />
        ) : (
          <>
          {/* 원본 ◉내역 출력물 머리글 — 불량처리현황은 '불량현황', 폐기현황은 '폐기리스트' 다(2026-10-12 실측). */}
          <EcReportHead title={REPORT_TITLE[kind]} period={reportPeriod(cond.from, cond.to)} />
          <table className="w-full text-left">
            <thead>
              <tr>
                {COLS.map((c) => <th key={c.h} className={c.num ? 'text-right' : c.h === '일자-No.' ? 'text-center' : undefined}>{c.h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={COLS.length} className="ec-empty">불러오는 중…</td></tr>
              ) : listRows.length === 0 ? (
                <tr><td colSpan={COLS.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : listRows.flatMap((g, i) => {
                const out = [
                  <tr key={g.key}>
                    {COLS.map((c) => (
                      <td key={c.h} className={c.num ? 'text-right' : c.h === '일자-No.' ? 'text-center' : undefined}>
                        {c.h === '일자-No.' ? g.dateCell : c.num ? fmt(c, sumOf(c, g.rows)) : c.text!(g.first)}
                      </td>
                    ))}
                  </tr>,
                ]
                const k = subKey(g)
                if (k && (i === listRows.length - 1 || subKey(listRows[i + 1]) !== k)) {
                  const rs = listRows.filter((x) => subKey(x) === k).flatMap((x) => x.rows)
                  out.push(
                    <tr key={`${k}␟계`} className="ec-list-total">
                      <td colSpan={firstNum} className="text-center font-bold">{k} 계</td>
                      {sumCells(rs, 'font-bold')}
                    </tr>,
                  )
                }
                return out
              })}
            </tbody>
            {listRows.length > 0 && (
              <tfoot>
                <tr className="ec-total">
                  <td colSpan={firstNum} className="text-center">합계</td>
                  {sumCells(listRows.flatMap((g) => g.rows), '')}
                </tr>
              </tfoot>
            )}
          </table>
          <EcReportFoot />
          </>
        )}
      </div>
    </EcListShell>
  )
}
