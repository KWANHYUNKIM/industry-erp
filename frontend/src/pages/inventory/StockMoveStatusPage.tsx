import { useEffect, useMemo, useRef, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CodeOption, Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { useItemFlags } from '../../utils/useInactiveItems'
import { stockCostMap } from '../../utils/stockValue'
import { INQUIRY_PICKS, periodOf, ymd } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { useTableColumnCheck } from '../../utils/assertTableColumns'

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
 * 원본 [구분]은 <b>내역 / 집계 / 라인별</b> 셋이지만 우리 기타이동 전표는 <b>한 줄짜리</b>라
 * 내역과 라인별이 같은 표가 된다. 없는 구분을 흉내내지 않고 [내역|집계] 둘만 둔다.
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
  reason: string | null
  createdBy: string | null
  /** 원본 조건 [담당자]. 서버는 진작 보내는데 화면이 받아 두지 않아 거를 수가 없었다. */
  employeeId: number | null
  /** 원본 조건 [규격]. 서버가 이제 실어 준다. */
  spec: string | null
  /** 원본 조건 [프로젝트]. 서버는 진작 보내는데 화면이 받아 두지 않았다. */
  projectName: string | null
  /** 원본 조건 [품목구분]. 품목 마스터의 값이라 서버가 실어 준다. */
  itemCategory: string | null
  /** 원본 조건 [불량유형]·[사용유형] — 유형에 따라 이름이 다른 같은 자리다. */
  kind: string | null
  /** 원본 조건 [처리방법](불량처리). */
  handling: string | null
  itemCategoryName: string | null
}

/** 서버가 잘라서 줄 수 있다 — 전체 줄 수와 잘랐는지를 함께 준다. */
interface AdjustmentList {
  rows: Adjustment[]
  totalRows: number
  truncated: boolean
}

const num = (n: number) => n.toLocaleString()

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
      api.get<AdjustmentList>('/stock-adjustments', { params: { from: cond.from || undefined, to: cond.to || undefined, all } }),
      api.get<Warehouse[]>('/warehouses'),
      api.get<CodeOption[]>('/meta/item-categories'),
      api.get<{ code: string; name: string; codes: { name: string }[] }[]>('/codes'),
      /*
       * 원본 [금액(수량*입고단가)] 을 내는 재료. 기간을 안 건다 —
       * 이번 달에 안 샀다고 그 품목의 입고단가가 사라지면 안 된다.
       */
      api.get<{ id: number; purchasePrice?: number }[]>('/items'),
      api.get<{ purchaseDate: string; lines: { itemId: number; unitPrice: number }[] }[]>('/purchases'),
    ])
      .then(([a, w, c, g, it, pu]) => {
        setRows(a.data.rows); setTotalRows(a.data.totalRows); setTruncated(a.data.truncated)
        setWarehouses(w.data); setCats(c.data); setCodeGroups(g.data)
        setCostById(stockCostMap(it.data, pu.data))
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false))
  }

  /*
   * <b>기간이 바뀌면 다시 물어본다.</b> 예전에는 한 번 받아 놓고 브라우저에서 걸렀는데,
   * 조건 칸에 [금월] 을 물어 놓고 서버에는 <b>아무 조건도 안 보내</b> 4,797줄·1.7MB 를
   * 열 때마다 받아 그중 몇십 줄만 그렸다. 다섯 화면이 이 파일을 쓴다.
   */
  useEffect(() => { load() }, [cond.from, cond.to, all])
  /* 기간을 바꾸면 문턱을 다시 세운다 — 좁혀 놓고도 전부 받아 오면 안 자른 것과 같다. */
  useEffect(() => { setAll(false) }, [cond.from, cond.to])
  // 같은 컴포넌트를 다섯 메뉴가 쓰므로 메뉴를 갈아타도 다시 마운트되지 않는다 — 유형이 바뀌면 조건만 되돌린다.
  useEffect(() => { setMode('내역') }, [kind])

  /** 그 이름의 공통코드 묶음에 든 값들. 없으면 빈 목록이다. */
  const codesOf = (groupName: string) =>
    (codeGroups.find((g) => g.name === groupName)?.codes ?? []).map((c) => c.name)
  const kindOptions = codesOf(kind === 'SELF_USE' ? '사용유형' : '불량유형')
  const handlingOptions = codesOf('처리방법')
  /**
   * 원본 [최초작성자] 후보. <b>이 화면에 실제로 있는 이름</b>만 낸다 —
   * 사용자 마스터를 부르면 이 구분(자가사용·폐기 …)에 한 건도 없는 사람까지 목록에 선다.
   * 그래서 기간을 바꾸면 고를 수 있는 이름도 같이 달라진다.
   */
  const authors = [...new Set(rows.filter((r) => r.type === kind)
    .map((r) => r.createdBy).filter((v): v is string => !!v))].sort()

  const shown = rows
    .filter((r) => r.type === kind)
    /* 원본 [기타]. 재고조정 말고는 그 칸이 없으니 다른 유형에서는 걸지 않는다. */
    .filter((r) => kind !== 'ADJUST' || withZeroQty || r.quantityChange !== 0)
    .filter((r) => kind !== 'ADJUST' || withUntracked || !untracked.has(r.itemId))
    .filter((r) => !cond.from || r.adjustDate >= cond.from)
    .filter((r) => !cond.to || r.adjustDate <= cond.to)
    .filter((r) => !cond.warehouseId || String(r.warehouseId) === cond.warehouseId)
    .filter((r) => !cond.item || r.itemName.includes(cond.item) || r.itemCode.includes(cond.item))
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
    .filter((r) => !cond.project || (r.projectName ?? '') === cond.project)
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

  /*
   * 원본 조건 판의 <b>[정렬/소계기준]</b> — 집계를 <b>무엇으로 묶을지</b> 고른다(사본 실측).
   * 우리는 창고 × 품목으로 <b>박아 두어</b>, "이 사유로 얼마나 나갔나" 를 볼 수가 없었다.
   * 기본값은 예전 그대로라 지금 보이던 표는 안 바뀐다.
   */
  const SUBTOTALS = ['창고·품목', '품목', '창고', '사유'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('창고·품목')
  /**
   * 원본 [데이터 보기형식] · [그래프로 보기]. 다섯 화면(자가사용·불량처리·대체사용·폐기·
   * 재고조정)이 한 파일이라 여기 한 번 만들면 다섯이 같이 풀린다.
   *
   * <p>무엇을 그리나 — <b>고른 [정렬/소계기준] 축으로 묶어 증감 수량</b>을 그린다.
   * 줄 하나씩 그리면 같은 품목이 흩어져 막대가 수십 개로 늘어선다. 소계와 같은 축을
   * 쓰므로 표에서 보던 묶음이 그대로 그림이 된다.
   *
   * <p>수량은 <b>절댓값</b>으로 그린다. 조정은 늘기도 줄기도 하는데 부호를 섞어 더하면
   * 서로 지워져 '움직임이 없었다' 로 보인다 — 얼마나 움직였나를 보는 그림이다.
   */
  /** 원본 [품목그룹1] — 품목 마스터에서 잇는다(관리항목과 같은 길). */
  const mgmt = useItemMgmt()
  const [view, setView] = useState<'표' | '그래프'>('표')
  const chartRows = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of shown) {
      const label = subtotal === '품목' ? r.itemName
        : subtotal === '창고' ? (r.warehouseName ?? '(창고 없음)')
          : subtotal === '사유' ? ((r.reason ?? '').trim() || '(사유 없음)')
            : `${r.warehouseName ?? '(창고 없음)'} · ${r.itemName}`
      m.set(label, (m.get(label) ?? 0) + Math.abs(r.quantityChange))
    }
    return [...m].map(([label, value]) => ({ label, value }))
  }, [shown, subtotal])

  /** 집계 — 고른 기준으로 묶어 증감 합을 낸다. */
  const summary = useMemo(() => {
    const m = new Map<string, { warehouseName: string; itemCode: string; itemName: string; unit: string; change: number; count: number }>()
    shown.forEach((r) => {
      /* 묶는 열쇠와, 그 묶음에서 <b>안 쓰는 칸</b>은 비워 둔다 — 첫 줄 값이 남으면 거짓말이 된다. */
      const k = subtotal === '품목' ? `i:${r.itemId}`
        : subtotal === '창고' ? `w:${r.warehouseId}`
          : subtotal === '사유' ? `r:${(r.reason ?? '').trim()}`
            : `${r.warehouseId}:${r.itemId}`
      const shell = subtotal === '품목'
        ? { warehouseName: '', itemCode: r.itemCode, itemName: r.itemName }
        : subtotal === '창고'
          ? { warehouseName: r.warehouseName, itemCode: '', itemName: '' }
          : subtotal === '사유'
            ? { warehouseName: '', itemCode: '', itemName: (r.reason ?? '').trim() || '(적요 없음)' }
            : { warehouseName: r.warehouseName, itemCode: r.itemCode, itemName: r.itemName }
      const g = m.get(k) ?? { ...shell, unit: r.unit, change: 0, count: 0 }
      g.change += r.quantityChange
      g.count += 1
      m.set(k, g)
    })
    return [...m.entries()].map(([k, g]) => ({ k, ...g }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, kind, cond, subtotal])

  /*
   * 담당자 이름. 서버는 <b>id 만</b> 준다 — 재고(inventory)는 사원(hr)을 참조할 수 없어서
   * (CLAUDE.md 4.1 의 순환 금지) 이름은 화면이 목록에서 붙인다. 지워진 사원이면 빈칸이다.
   */
  const empName = (id: number | null) =>
    (id == null ? '' : pickers.employees.find((e) => e.id === id)?.name ?? '')

/**
 * 원본의 <b>[금액(수량*입고단가)]</b>.
 *
 * <p>이름이 계산식 그대로다 — 전표에 적힌 <b>거래 금액이 아니라</b>
 * 그 품목을 <b>얼마에 사 왔는지</b>로 수량을 값으로 환산한 칸이다.
 * 그래서 "이 전표에는 단가가 없다" 는 것은 못 만드는 이유가 되지 않는다.
 * 평가단가는 재고자산·경영자보고서와 <b>같은 규칙</b>을 쓴다
 * (<code>stockCostMap</code>: 마지막 입고단가 → 없으면 품목 구매단가).
 *
 * <p>단가를 모르는 품목은 <b>빈칸</b>이다. 0 으로 채우면 "값이 0원" 으로 읽혀
 * 모르는 것과 구별이 안 되고, 합계도 조용히 줄어든다.
 */
  const amountOf = (itemId: number, qty: number) => {
    const c = costById.get(itemId)
    return c == null ? null : qty * c
  }
  /*
   * 원본에서 이 칸을 두는 것은 <b>자가사용현황 · 재고조정현황</b> 둘이다
   * (대체사용현황은 그 자리에 [정상수량]·[불량수량]을 둔다 — 다른 칸이다).
   * 없는 화면에까지 달면 우리가 원본에 없는 열을 하나 더 두는 것이 된다.
   */
  const hasAmount = kind === 'SELF_USE' || kind === 'ADJUST'
  const totalChange = shown.reduce((n, r) => n + r.quantityChange, 0)
  const totalAmount = shown.reduce((n, r) => n + (amountOf(r.itemId, r.quantityChange) ?? 0), 0)
  /* 불량처리현황만 앞에 칸이 둘 더 붙는다 - 빈 줄의 colSpan 도 같이 움직여야 한다. */
  const cols = 11 + (kind === 'DEFECT' ? 2 : 0) + (hasAmount ? 1 : 0)
  /* 화면에 따라 칸 수가 달라지므로 정적 검사로는 못 센다 - 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLDivElement>(null)
  useTableColumnCheck(tableRef, '기타이동현황', [kind, mode, shown.length])
  const reset = () => {
    setMode('내역')
    setSubtotal('창고·품목')
    setCond({
      from: init.from, to: init.to, warehouseId: '', item: '', category: '',
      reason: '', employee: '', spec: '', project: '',
      kind: '', handling: '', qtyFrom: '', qtyTo: '',
    /* 원본 [품목그룹1] — 우리 품목그룹은 하나뿐이라 원본의 '1' 이 그것이다. */
    itemGroup: '',
    /* 원본 [최초작성자] — 응답이 createdBy 를 진작 싣고 있었는데 거를 자리가 없었다. */
    createdBy: '',
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
        from={cond.from} to={cond.to}
        onPeriod={(r) => setC({ from: r.from, to: r.to })}
        picks={INQUIRY_PICKS}
        dateLabel="일자"
        view={view} onViewChange={setView}
        subtotal={subtotal}
        subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}
      >
        <EcCond label="구분">
          <div className="ec-pills">
            {(['내역', '집계'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>
                {m}
              </button>
            ))}
          </div>
        </EcCond>
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
          <EcCond label="수량">
            <input type="number" className="ec-input text-right" placeholder="이상" value={cond.qtyFrom}
                   onChange={(e) => setC({ qtyFrom: e.target.value })} style={{ width: 90 }} />
            <span style={{ color: 'var(--ec-label)' }}>~</span>
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
          <input className="ec-input" value={cond.spec}
                 onChange={(e) => setC({ spec: e.target.value })} style={{ width: 140 }} />
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
            <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={withZeroQty} onChange={(e) => setWithZeroQty(e.target.checked)} />
              조정수량0포함
            </label>
            <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
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

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {/*
        잘랐으면 <b>잘랐다고 말한다.</b> 말이 없으면 아래 합계와 집계가 전체인 줄 알고 읽는다 —
        "1만 2천 건" 이라 써 놓고 5천 줄만 그리는 꼴이 된다. 아래 [집계] 탭과 합계행도
        <b>받은 줄만</b> 센다는 뜻이라 같이 적는다.
      */}
      {truncated && (
        <p style={{ background: '#fff8e1', color: '#7a5b00', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>
          기간에 걸린 {num(totalRows)}건 중 앞 {num(rows.length)}건만 보고 있습니다 — 아래 집계와 합계도 이 {num(rows.length)}건만 셉니다.
          {' '}
          <button className="ec-btn" style={{ marginLeft: 4 }} onClick={() => setAll(true)}>오천건이상조회</button>
        </p>
      )}

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        {mode === '내역' ? '건수' : '품목×창고'}{' '}
        <b style={{ color: '#3c4553' }}>{num(mode === '내역' ? shown.length : summary.length)}</b>
        <span style={{ margin: '0 8px', color: '#c5cbd3' }}>|</span>
        증감계 <b style={{ color: totalChange < 0 ? '#c60a2e' : 'var(--ec-blue)', fontSize: 14 }}>{num(totalChange)}</b>
      </div>

      <div className="overflow-x-auto" ref={tableRef}>
        {view === '그래프' ? (
          <EcBarChart rows={chartRows} unit="" emptyText="조회된 자료가 없습니다." />
        ) : mode === '내역' ? (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '4%' }} /><col style={{ width: '16%' }} /><col style={{ width: '11%' }} />
              <col /><col style={{ width: '12%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '13%' }} />
            </colgroup>
            {/*
              원본 격자는 <b>다섯 화면이 서로 다르다</b>(2026-09-09 다섯 다 실측).
              자가사용(E040506): 일자-No. · 거래처명 · 품목명[규격] · 창고명 · 수량 ·
                금액(수량*입고단가) · 적요
              불량처리(E040509): <b>불량유형 · 처리방법</b> · 일자-No. · 품목코드 ·
                품목명[규격] · 수량 · 적요
              대체사용(E040510): 일자-No. · 품목코드 · 품목명[규격] ·
                <b>불량수량 · 정상수량</b> · 적요
              폐기(E040511):     일자-No. · 품목코드 · 품목명<b>[규격명]</b> · 수량 · 적요
              재고조정(E040608): 일자-No. · 품목코드 · 품목명[규격] · 창고명 ·
                <b>장부수량 · 실사수량 · 조정수량</b> · 금액(수량*입고단가) · 적요
              한 표가 다섯을 겸하므로 <b>화면(kind)에 따라 이름을 갈라 적고</b> 그 화면에만
              있는 칸은 그때만 그린다. 한 이름으로 통일하면 넷이 틀린다.
              못 만드는 것: [거래처명]·[금액(수량*입고단가)]·[불량수량]·[정상수량](예외에 적었다).
              프로젝트·담당자는 원본에 없지만 우리가 더 두는 열이다.
            */}
            <thead>
              <tr>
                <th></th>
                {/* 불량처리현황만 이 둘을 <b>맨 앞</b>에 둔다. 거를 수는 있었는데 볼 수가 없었다. */}
                {kind === 'DEFECT' && <th style={{ width: 110 }}>불량유형</th>}
                {kind === 'DEFECT' && <th style={{ width: 110 }}>처리방법</th>}
                {/* 원본은 일자와 번호를 한 칸에 적는다. */}
                <th style={{ textAlign: 'center' }}>일자-No.</th>
                <th>품목코드</th>
                <th>{kind === 'DISPOSAL' ? '품목명[규격명]' : '품목명[규격]'}</th>
                <th>창고명</th>
                {/* 원본 조건에 [프로젝트]가 있다 — 거르려면 표에도 보여야 한다. */}
                <th style={{ width: 110 }}>프로젝트</th>
                <th style={{ textAlign: 'right' }}>{kind === 'ADJUST' ? '장부수량' : '이전재고'}</th>
                <th style={{ textAlign: 'right' }}>{kind === 'ADJUST' ? '실사수량' : '이후재고'}</th>
                <th style={{ textAlign: 'right' }}>{kind === 'ADJUST' ? '조정수량' : '수량'}</th>
                {hasAmount && <th style={{ width: 130, textAlign: 'right' }}>금액(수량*입고단가)</th>}
                {/* 원본 조건에 [담당자]가 있다 — 거르려면 표에도 보여야 한다. */}
                <th style={{ width: 90 }}>담당자</th>
                <th>적요</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={cols} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={cols} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  {kind === 'DEFECT' && <td style={{ color: '#5a626e' }}>{r.kind ?? ''}</td>}
                  {kind === 'DEFECT' && <td style={{ color: '#5a626e' }}>{r.handling ?? ''}</td>}
                  <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{r.adjustDate.replace(/-/g, '/')} {r.adjustNo}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.itemCode}</td>
                  {/* 원본은 규격을 품목명 뒤 대괄호에 붙인다 — 우리는 칸을 따로 두고 있었다. */}
                  <td>{r.itemName}{r.spec ? ' [' + r.spec + ']' : ''}</td>
                  <td>{r.warehouseName}</td>
                  <td style={{ color: '#5a626e' }}>{r.projectName ?? ''}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(r.beforeQty)}</td>
                  <td style={{ textAlign: 'right' }}>{num(r.afterQty)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: r.quantityChange < 0 ? '#c60a2e' : 'var(--ec-blue)' }}>
                    {num(r.quantityChange)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{r.unit}</span>
                  </td>
                  {hasAmount && (
                    <td style={{ textAlign: 'right', color: '#5a626e' }}>
                      {amountOf(r.itemId, r.quantityChange) == null ? '' : num(amountOf(r.itemId, r.quantityChange)!)}
                    </td>
                  )}
                  <td style={{ color: '#5a626e' }}>{empName(r.employeeId)}</td>
                  <td style={{ color: '#5a626e' }}>{r.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={cols - 3 - (hasAmount ? 1 : 0)} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: totalChange < 0 ? '#c60a2e' : 'var(--ec-blue)' }}>{num(totalChange)}</td>
                  {hasAmount && (
                    <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>{num(totalAmount)}</td>
                  )}
                  <td colSpan={2} style={{ background: '#f5f7fa' }}></td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full text-left">
            <colgroup>
              <col style={{ width: '5%' }} /><col style={{ width: '20%' }} />
              <col style={{ width: '15%' }} /><col />
              <col style={{ width: '10%' }} /><col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <th></th>
                {/* 묶는 기준에 따라 머리 이름이 바뀐다 — [사유]로 묶으면 품목명 자리에 사유가 온다. */}
                <th>창고</th>
                <th>품목코드</th>
                <th>{subtotal === '사유' ? '사유' : '품목명'}</th>
                <th style={{ textAlign: 'right' }}>건수</th>
                <th style={{ textAlign: 'right' }}>증감계</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>불러오는 중…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : summary.map((g, i) => (
                <tr key={g.k}>
                  <td style={{ textAlign: 'center', background: '#f3f3f3', color: '#8a929c' }}>{i + 1}</td>
                  <td>{g.warehouseName}</td>
                  <td style={{ fontFamily: 'monospace' }}>{g.itemCode}</td>
                  <td>{g.itemName}</td>
                  <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: g.change < 0 ? '#c60a2e' : 'var(--ec-blue)' }}>
                    {num(g.change)} <span style={{ fontSize: 11, fontWeight: 400, color: '#9aa1ab' }}>{g.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            {summary.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa' }}>합계</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, background: '#f5f7fa', color: totalChange < 0 ? '#c60a2e' : 'var(--ec-blue)' }}>{num(totalChange)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </EcListShell>
  )
}
