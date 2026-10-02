import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import EcBarChart from '../../components/EcBarChart'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { usePartnerGroups } from '../../utils/partnerGroups'
import { usePartnerManagers } from '../../utils/partnerManagers'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { weekOfYear } from '../../utils/statusAggregate'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'

/**
 * 생산관리 > 작업지시서현황 — 작업지시 진행 현황 (/api/work-orders).
 *
 * <p>원본 열 실측(사본): 일자-No. · 품목명[규격명] · 수량 · <b>거래처명</b> ·
 * <b>담당자명</b> · 납기일자.
 *
 * <p>거래처명·담당자명이 없었다. 작업지시에 그 값이 아예 없었기 때문인데, 이제 있다
 * (원본 작업지시서입력 머리의 [납품처]·[담당자]).
 *
 * <p>담당자 <b>이름</b>은 서버가 못 붙인다 — production 은 hr 을 참조할 수 없어
 * (hr → accounting → production 순환) id 만 온다. 화면이 사원 목록에서 붙인다.
 */
type WoStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'

const STATUS_COLOR: Record<WoStatus, string> = {
  PLANNED: '#8a929c',
  IN_PROGRESS: '#c07a00',
  COMPLETED: '#1c7c3c',
}

interface Row {
  id: number
  orderNo: string
  productId: number
  productCode: string
  productName: string
  /** 원본 열 이름이 [품목명[규격명]] 이다. */
  productSpec: string | null
  productUnit: string
  warehouseId: number
  warehouseName: string
  /** 납품처. 원본 [거래처명] 열. */
  partnerId: number | null
  partnerName: string | null
  /** 담당자(사원) id. 이름은 화면이 붙인다. */
  employeeId: number | null
  plannedQty: number
  producedQty: number
  remainingQty: number
  status: WoStatus
  statusName: string
  orderDate: string
  dueDate: string | null
  /**
   * 품목구분 · 적요 · 작성자 — <code>WorkOrderResponse</code> 가 진작 싣는 값인데
   * 이 화면이 받아 두지 않아 거를 수가 없었다(2026-09-08 원본 실측으로 드러났다).
   */
  productCategoryName: string | null
  remark: string | null
  createdBy: string | null
  /** 원본 집계조건 [프로젝트]. 응답(WorkOrderResponse)이 진작 싣는다. */
  projectName?: string | null
}

/*
 * 원본 작업지시서현황은 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간 칸이 <b>아예 없어서</b> 지시가 쌓이면 몇 해치가 한 화면에 쏟아졌다.
 */
const initP = periodOf('금월(~오늘)')!

export default function WoStatusPage() {
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(사본 실측). 우리는 그 칸을 늘 찍고 있었다.
   */
  const [signBox, setSignBox] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])
  /*
   * 원본 작업지시서현황의 조건은 <b>작업지시No. · 창고 · 거래처 · 품목</b> 이다(사본 실측).
   * 우리는 이름 한 칸(keyword)뿐이라, 창고로 좁히려면 눈으로 훑어야 했다 —
   * 네 값 모두 이미 목록에 실려 오고 있었다.
   */
  const [from, setFrom] = useState(initP.from)
  const [to, setTo] = useState(initP.to)
  /*
   * 원본 작업지시서현황의 <b>[구분]</b>은 [내역]·[집계] 다(사본 실측 — checked 는 내역).
   * 우리는 내역만 있어 "이 품목을 이번 달 몇 개 지시했나" 를 눈으로 세야 했다.
   *
   * <p>집계 <b>축</b>은 사본에서 못 읽었다 — 그 선택상자를 스크립트가 그려서 담기지
   * 않았다. 그래서 <b>이 화면의 줄이 실제로 가진 축</b>만 둔다(품목·창고·거래처·
   * 담당자·월). 없는 축을 그려 두면 눌러도 늘 같은 표가 나온다.
   *
   * <p>판매·구매현황의 집계(utils/statusAggregate)는 <b>돈</b>을 더한다. 작업지시에는
   * 금액이 없어 그 계산을 그대로 쓸 수 없다 — 여기서는 <b>수량 셋</b>(지시·생산·잔량)을 센다.
   */
  /*
   * 원본 [구분] 은 ◉내역 ○집계 이고, 내역 아래 선택상자가 일별 · 월별 · <b>라인별</b>(기본) · 전표별 · 품목별 · 전표별품목별 ·
   * 담당자별이다(2026-10-02 loginaa 생산불출현황·작업지시서현황 실측). 라인별은 품목 줄마다, 전표별은 전표 한 장이 한 줄.
   */
  const [mode, setMode] = useState<'내역' | '집계'>('내역')
  const [lineView, setLineView] = useState<'라인별' | '전표별' | '품목별' | '일별' | '월별' | '전표별품목별' | '담당자별'>('라인별')
  /*
   * 원본 집계조건 후보(2026-10-02 loginaa 실측): 일별 · 주차별 · 월별 · 분기별 · 반기별 · 연별 · 작업지시서 · 담당자 · 창고 ·
   * 관리항목 · 거래처 · 거래처그룹1·2 · 품목명[규격] · 품목그룹1·2·3 · 프로젝트 · 프로젝트그룹1·2. 우리는 다섯뿐이었다.
   * 관리항목·거래처그룹2·품목그룹2·3·프로젝트그룹은 전역 예외(그 값이 없다).
   */
  const AXES = ['품목별', '일별', '주차별', '월별', '분기별', '반기별', '연별', '작업지시서별', '담당자별', '창고별',
    '거래처별', '거래처그룹1별', '품목그룹1별', '프로젝트별'] as const
  const [axis, setAxis] = useState<typeof AXES[number]>('품목별')
  /** 원본 [집계조건2] — 두 번째 묶음(2026-10-02 loginaa 실측: 집계조건1 · 집계조건2). 없으면 한 단계. */
  const [axis2, setAxis2] = useState<typeof AXES[number] | ''>('')
  /*
   * 원본 집계 [기타] 의 비율표시 · 코드포함과 조건 옆 정렬(코드순 기본 · 코드명순 · 수량 + 오름/내림) — 생산불출현황과 같은 판
   * (2026-10-02 실측). 비율은 지시수량(원본 집계대상 [수량])으로 센다. 코드가 있는 축은 품목 · 창고 · 거래처뿐이다
   * (담당자는 이 화면이 이름만 받고, 프로젝트는 줄에 코드가 없다).
   */
  const [ratio, setRatio] = useState(false)
  const [codeIncl, setCodeIncl] = useState(false)
  /** 원본 [기타] 가로보기 — 조건2 값을 열로 펼친다(조건1 이 줄, 칸은 지시수량). 조건2 가 있을 때만 뜻이 있다. */
  const [pivot, setPivot] = useState(false)
  const [aggSort, setAggSort] = useState<'코드순' | '코드명순' | '수량'>('코드순')
  const [aggDesc, setAggDesc] = useState(false)
  const CODE_LABEL: Partial<Record<typeof AXES[number], string>> = { 품목별: '품목코드', 창고별: '창고코드', 거래처별: '거래처코드' }
  /*
   * 원본 [데이터 보기형식]의 <b>[그래프로 보기]</b> — 기본은 꺼짐이라 표로 연다(사본 실측).
   * 그리는 값은 <b>잔량</b>이다. 이 화면을 보는 까닭이 "무엇이 아직 안 끝났나" 라서,
   * 막대가 긴 품목이 곧 밀린 일이다.
   */
  const [view, setView] = useState<'표' | '그래프'>('표')
  const [orderNoCond, setOrderNoCond] = useState('')
  const [warehouseCond, setWarehouseCond] = useState('')
  const [partnerCond, setPartnerCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  /*
   * 2026-09-08 에 원본(E040413)의 조건 판을 재니 <b>서른하나</b>다(사본에는 일곱).
   * 접힌 줄은 없다 — 접힘 표시를 눌러도 줄 수가 그대로다.
   *
   * <p>여기서 만든 열둘: 납기일자 · 거래처그룹1 · 품목구분 · 품목그룹1 · 담당자 ·
   * 거래처관리담당자 · 규격 · 수량 · 적요 · 진행상태 · 최초작성자.
   * 값은 전부 응답이나 마스터에 이미 있다 — 서버는 한 줄도 안 고쳤다.
   */
  const [dueFrom, setDueFrom] = useState('')
  const [dueTo, setDueTo] = useState('')
  const [partnerGroup, setPartnerGroup] = useState('')
  const [itemCategory, setItemCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [pmgrCond, setPmgrCond] = useState('')
  const [specCond, setSpecCond] = useState('')
  const [qtyFrom, setQtyFrom] = useState('')
  const [qtyTo, setQtyTo] = useState('')
  const [remarkCond, setRemarkCond] = useState('')
  const [statusCond, setStatusCond] = useState('')
  const [authorCond, setAuthorCond] = useState('')
  const pgroup = usePartnerGroups()
  const pmgr = usePartnerManagers()
  const mgmt = useItemMgmt()
  const pickers = useCondPickers(['warehouses', 'partners', 'items'])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const period: Record<string, string> = {}
      if (from) period.from = from
      if (to) period.to = to
      const [res, emps] = await Promise.all([
        /*
         * <b>고른 기간을 서버에도 보낸다.</b> 이 표는 <b>작업지시를 그 지시일로</b> 거른다
         * (아래 <code>r.orderDate &gt;= from</code>) — 서버에 같은 창을 주면 된다.
         * 실적을 거르는 화면이었다면 못 보낸다: 지난달 지시에 이번 달 실적이 붙는 일이
         * 흔해서 지시를 기간으로 자르면 그 실적이 갈 곳을 잃는다.
         */
        api.get<Row[]>('/work-orders', { params: period }),
        api.get<{ id: number; name: string }[]>('/employees'),
      ])
      const sorted = [...res.data].sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.id - a.id))
      setRows(sorted)
      setEmployees(emps.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  /* 기간을 바꾸면 그 기간으로 다시 받는다. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [from, to])

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다 — 지워진 사원이면 '-'. */
  const empName = (id: number | null) =>
    id == null ? '-' : (employees.find((x) => x.id === id)?.name ?? '-')

  const shown = rows.filter((r) => (!keyword || r.orderNo.includes(keyword) || r.productName.includes(keyword))
    && (!orderNoCond || r.orderNo.includes(orderNoCond))
    && (!warehouseCond || String(r.warehouseId) === warehouseCond)
    && (!partnerCond || String(r.partnerId) === partnerCond)
    && (!itemCond || String(r.productId) === itemCond)
    && (!from || r.orderDate >= from) && (!to || r.orderDate <= to)
    && (!dueFrom || (r.dueDate ?? '') >= dueFrom)
    && (!dueTo || ((r.dueDate ?? '') !== '' && (r.dueDate ?? '') <= dueTo))
    && (!partnerGroup || pgroup.groupOfName(r.partnerName) === partnerGroup)
    && (!itemCategory || (r.productCategoryName ?? '') === itemCategory)
    && (!itemGroup || mgmt.groupOfCode(r.productCode) === itemGroup)
    && (!empCond || empName(r.employeeId) === empCond)
    && (!pmgrCond || pmgr.managerOfName(r.partnerName) === pmgrCond)
    && (!specCond || (r.productSpec ?? '').includes(specCond))
    && (!qtyFrom || r.plannedQty >= Number(qtyFrom))
    && (!qtyTo || r.plannedQty <= Number(qtyTo))
    && (!remarkCond || (r.remark ?? '').includes(remarkCond))
    && (!statusCond || r.statusName === statusCond)
    && (!authorCond || (r.createdBy ?? '') === authorCond))
  /**
   * 내역 [전표별] — 전표 한 장이 한 줄. 품목이 여럿이면 "첫 품목 외 n건", 수량은 합, 한 줄이라도 안 끝났으면 그 상태.
   * [라인별](기본)은 품목 줄마다다.
   */
  const listRows = lineView === '라인별' ? shown : (() => {
    /* 품목별 — 같은 품목(생산공장도 같은 것)을 한 줄로, 일자-No. 는 처음 것(원본 생산불출현황 품목별과 같은 모양). */
    /* 일별 · 월별 — 그날(그달) 줄을 한 줄로, 일자만 찍고(No. 없음) 창고·품목은 처음 줄 것, 수량·금액은 합
       (원본 실측 2026-10-02: 9/3 줄 인텔 코어 270 · 43,110,000 = 그날 세 자재의 합). */
    const keyOf = (r: typeof shown[number]) => lineView === '품목별' ? `${r.productId}|${r.warehouseId}`
      : lineView === '일별' ? r.orderDate : lineView === '월별' ? r.orderDate.slice(0, 7)
      /* 전표별품목별 — 한 전표 안의 같은 품목을 한 줄로. 담당자별 — 담당자 하나가 한 줄, 일자-No.·품목은 처음 줄 것을 둔다
         (원본 실측 2026-10-02: 담당자가 같은 불출 전부가 9/3 -2 인텔 코어 줄 하나로 1,269 · 105,205,500). */
      : lineView === '전표별품목별' ? `${r.orderNo}|${r.productId}` : lineView === '담당자별' ? String(r.employeeId ?? '') : r.orderNo
    const bySlip = new Map<string, typeof shown>()
    shown.forEach((r) => bySlip.set(keyOf(r), [...(bySlip.get(keyOf(r)) ?? []), r]))
    return [...bySlip.values()].map((ls) => {
      const head = ls[0]
      const open = ls.find((r) => r.status !== 'COMPLETED')
      return {
        ...head,
        ...(lineView === '일별' || lineView === '월별' ? { orderNo: '', orderDate: lineView === '월별' ? head.orderDate.slice(0, 7).replace('-', '/') : head.orderDate } : {}),
        productName: lineView === '전표별' && ls.length > 1 ? `${head.productName} 외 ${ls.length - 1}건` : head.productName,
        productSpec: lineView === '전표별' && ls.length > 1 ? null : head.productSpec,
        plannedQty: ls.reduce((n, r) => n + r.plannedQty, 0),
        producedQty: ls.reduce((n, r) => n + r.producedQty, 0),
        remainingQty: ls.reduce((n, r) => n + r.remainingQty, 0),
        status: (open ?? head).status, statusName: (open ?? head).statusName,
      }
    })
  })()

  /** 고른 축으로 묶어 수량 셋을 더한다. 줄이 없으면 빈 배열이라 표가 스스로 비운다. */
  const grouped = useMemo(() => {
      if (mode !== '집계') return []
      const keyBy = (a: typeof AXES[number], r: Row): string => {
        const d = r.orderDate
        const m = Number(d.slice(5, 7))
        switch (a) {
          case '품목별': return r.productName
          case '일별': return d.replace(/-/g, '/')
          case '주차별': return `${d.slice(0, 4)}년 ${weekOfYear(d)}주`
          case '월별': return d.slice(0, 7).replace(/-/g, '/')
          case '분기별': return `${d.slice(0, 4)} ${Math.floor((m - 1) / 3) + 1}분기`
          case '반기별': return `${d.slice(0, 4)} ${m <= 6 ? '상' : '하'}반기`
          case '연별': return d.slice(0, 4)
          case '작업지시서별': return r.orderNo
          case '창고별': return r.warehouseName || '(없음)'
          case '거래처별': return r.partnerName || '(없음)'
          case '거래처그룹1별': return pgroup.groupOfName(r.partnerName) || '(없음)'
          case '품목그룹1별': return mgmt.groupOfCode(r.productCode) || '(없음)'
          case '프로젝트별': return r.projectName || '(없음)'
          default: return empName(r.employeeId) || '(미지정)'
        }
      }
      const codeBy = (a: typeof AXES[number] | '', r: Row): string => (
        a === '품목별' ? r.productCode
          : a === '창고별' ? (pickers.warehouses.find((w) => w.id === r.warehouseId)?.code ?? '')
            : a === '거래처별' ? (pickers.partners.find((x) => x.id === r.partnerId)?.code ?? '')
              : '')
      const keyOf = (r: Row) => (axis2 ? `${keyBy(axis, r)} · ${keyBy(axis2, r)}` : keyBy(axis, r))
      const by = new Map<string, { key: string; k1: string; k2: string; c1: string; c2: string; count: number; planned: number; produced: number; remaining: number }>()
      for (const r of shown) {
        const k = keyOf(r)
        const cur = by.get(k) ?? { key: k, k1: keyBy(axis, r), k2: axis2 ? keyBy(axis2, r) : '', c1: codeBy(axis, r), c2: codeBy(axis2, r), count: 0, planned: 0, produced: 0, remaining: 0 }
        cur.count += 1
        cur.planned += r.plannedQty
        cur.produced += r.producedQty
        cur.remaining += r.remainingQty
        by.set(k, cur)
      }
      /* 코드순 — 코드가 없는 축(날짜 · 담당자 …)은 이름 그대로가 차례다. */
      const sortKey = (g: { key: string; c1: string; c2: string }) => (aggSort === '코드순' ? `${g.c1 || g.key}\u0000${g.c2}` : g.key)
      const out = [...by.values()].sort((a, b) => aggSort === '수량' ? a.planned - b.planned : sortKey(a).localeCompare(sortKey(b), 'ko'))
      return aggDesc ? out.reverse() : out
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shown, mode, axis, axis2, employees, pgroup.groupOptions, mgmt.groupOptions, aggSort, aggDesc, pickers.warehouses, pickers.partners])
  const code1 = codeIncl ? CODE_LABEL[axis] : undefined
  const code2 = codeIncl && axis2 ? CODE_LABEL[axis2] : undefined
  const totalPlanned = grouped.reduce((a, g) => a + g.planned, 0)

  /* 축을 바꿔도 열 수는 그대로지만, 표가 통째로 갈리므로 머리와 칸을 함께 본다. */
  const chartRows = useMemo(() => (
    mode === '집계'
      ? grouped.map((g) => ({ label: g.key, value: g.remaining }))
      : shown.map((r) => ({ label: r.productName, value: r.remainingQty }))
  ), [mode, grouped, shown])
  const aggRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(aggRef, '작업지시서현황 집계', [axis, axis2, grouped.length, ratio, codeIncl, pivot])

  return (
    <EcListShell
      title="작업지시서현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: '인쇄' }, { label: 'Excel' }]}
      signLine={signBox}
    >
      {/* 원본 조건 차례: 작업지시No. · 창고 · 거래처 · 품목 */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        {/* 원본 조건 판 첫째 <b>[구분]</b> — 내역·집계(사본 실측). */}
        <EcCond label="구분">
          <div className="ec-pills">
            {(['내역', '집계'] as const).map((m) => (
              <button key={m} type="button" className={`ec-pill no-ec${mode === m ? ' active' : ''}`}
                      onClick={() => setMode(m)}>{m}</button>
            ))}
          </div>
          {mode === '내역' && (
            <select className="ec-input" value={lineView} onChange={(e) => setLineView(e.target.value as '라인별' | '전표별' | '품목별' | '일별' | '월별' | '전표별품목별' | '담당자별')}
                    style={{ width: 110, marginLeft: 6 }}>
              <option value="라인별">라인별</option>
              <option value="전표별">전표별</option>
              <option value="품목별">품목별</option>
              <option value="일별">일별</option>
              <option value="월별">월별</option>
              <option value="전표별품목별">전표별품목별</option>
              <option value="담당자별">담당자별</option>
            </select>
          )}
          {mode === '집계' && (
            <span style={{ display: 'inline-flex', gap: 6, marginLeft: 6, alignItems: 'center', fontSize: 12 }}>
              집계조건1
              <select className="ec-input" value={axis} onChange={(e) => setAxis(e.target.value as typeof AXES[number])}
                      style={{ width: 110 }}>
                {AXES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className="ec-input" value={aggSort} onChange={(e) => setAggSort(e.target.value as typeof aggSort)} style={{ width: 84 }} title="정렬">
                {(['코드순', '코드명순', '수량'] as const).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              <button type="button" className="ec-btn" onClick={() => setAggDesc((d) => !d)} title={aggDesc ? '내림차순' : '오름차순'}
                      style={{ padding: '0 6px', height: 24 }}>{aggDesc ? '↓' : '↑'}</button>
              집계조건2
              <select className="ec-input" value={axis2} onChange={(e) => setAxis2(e.target.value as typeof AXES[number] | '')}
                      style={{ width: 110 }}>
                <option value="">없음</option>
                {AXES.filter((a) => a !== axis).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <input type="checkbox" checked={ratio} onChange={(e) => setRatio(e.target.checked)} /> 비율표시
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <input type="checkbox" checked={codeIncl} onChange={(e) => setCodeIncl(e.target.checked)} /> 코드포함
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: axis2 ? undefined : '#9aa1ab' }}
                     title="집계조건2 를 고르면 그 값을 열로 펼칩니다">
                <input type="checkbox" checked={pivot} disabled={!axis2} onChange={(e) => setPivot(e.target.checked)} /> 가로보기
              </label>
            </span>
          )}
        </EcCond>
        {/* 원본 조건 첫째 <b>[기준일자]</b>(사본 실측). */}
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from}
                 onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input type="date" className="ec-input" value={to}
                 onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={from}
              onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="작업지시No.">
          <input className="ec-input" value={orderNoCond}
                 onChange={(e) => setOrderNoCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
        {/*
          원본 차례(2026-09-08 실측, 서른하나): 구분 · 기준일자 · 작업지시No. ·
          <b>납기일자</b> · 창고 · (창고계층그룹) · 거래처 · <b>거래처그룹1</b> ·
          (거래처그룹2 · 거래처계층그룹) · 품목 · <b>품목구분 · 품목그룹1</b> ·
          (품목그룹2/3 · 품목계층그룹) · (오더관리번호) · <b>담당자 · 거래처관리담당자 ·
          규격 · 수량 · 적요 · 진행상태 · 최초작성자</b> · (최종수정자 · 제목 · 양식) ·
          적용양식 · 양식구분 · 정렬/소계기준 · 데이터 보기형식.
        */}
        <EcCond label="납기일자">
          <input type="date" className="ec-input" value={dueFrom}
                 onChange={(e) => setDueFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input type="date" className="ec-input" value={dueTo}
                 onChange={(e) => setDueTo(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        {/* 마스터를 고르는 조건은 직접 입력이 아니라 코드도움이다 — 다른 화면과 같은 규칙. */}
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체"
                           value={warehouseCond} onChange={setWarehouseCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체"
                           value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="거래처그룹1" pick>
          <CodePickerField label="거래처그룹1" hideLabel width={170} emptyLabel="전체"
                           value={partnerGroup} onChange={setPartnerGroup}
                           items={pgroup.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체"
                           value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        <EcCond label="품목구분" pick>
          <CodePickerField label="품목구분" hideLabel width={140} emptyLabel="전체"
                           value={itemCategory} onChange={setItemCategory}
                           items={[...new Set(rows.map((r) => r.productCategoryName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={170} emptyLabel="전체"
                           value={itemGroup} onChange={setItemGroup}
                           items={mgmt.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={140} emptyLabel="전체"
                           value={empCond} onChange={setEmpCond}
                           items={employees.map((e) => ({ value: e.name, name: e.name }))} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={150} emptyLabel="전체"
                           value={pmgrCond} onChange={setPmgrCond}
                           items={pmgr.options.map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="규격">
          <ItemSuggestInput field="spec" value={specCond}
                            onChange={(v) => setSpecCond(v)} width={140} />
        </EcCond>
        <EcCond label="수량">
          <input className="ec-input" type="number" value={qtyFrom}
                 onChange={(e) => setQtyFrom(e.target.value)} style={{ width: 110, textAlign: 'right' }} />
          <span style={{ margin: '0 4px', color: '#9aa1ab' }}>~</span>
          <input className="ec-input" type="number" value={qtyTo}
                 onChange={(e) => setQtyTo(e.target.value)} style={{ width: 110, textAlign: 'right' }} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" value={remarkCond}
                 onChange={(e) => setRemarkCond(e.target.value)} style={{ width: 190 }} />
        </EcCond>
        {/*
          원본 [진행상태]는 전표의 <b>결재 단계</b>(결재중·미확인·확인)를 고르는 칸이다.
          우리 작업지시에는 그 단계가 없고 <b>작업 진행</b>(예정·진행중·완료)이 있다 —
          축이 다르므로 후보를 지어내지 않고 <b>목록에 실제로 있는 상태</b>에서 뽑는다.
        */}
        <EcCond label="진행상태" pick>
          <CodePickerField label="진행상태" hideLabel width={130} emptyLabel="전체"
                           value={statusCond} onChange={setStatusCond}
                           items={[...new Set(rows.map((r) => r.statusName))].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="최초작성자" pick>
          <CodePickerField label="최초작성자" hideLabel width={140} emptyLabel="전체"
                           value={authorCond} onChange={setAuthorCond}
                           items={[...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="결재방표시">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            인쇄물에 결재란(도장칸)을 찍는다
          </label>
        </EcCond>
        <EcCond label="데이터 보기형식">
          <div className="ec-pills">
            {(['표', '그래프'] as const).map((v) => (
              <button key={v} type="button" className={`ec-pill no-ec${view === v ? ' active' : ''}`}
                      onClick={() => setView(v)}>{v === '그래프' ? '그래프로 보기' : '표'}</button>
            ))}
          </div>
        </EcCond>
      </ul>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="조회된 작업지시가 없습니다." />
      ) : mode === '집계' && axis2 && pivot ? (() => {
        const cols = [...new Set(grouped.map((g) => g.k2))].sort((a, b) => a.localeCompare(b, 'ko'))
        const rowsBy = new Map<string, Map<string, number>>()
        grouped.forEach((g) => { const m = rowsBy.get(g.k1) ?? new Map<string, number>(); m.set(g.k2, (m.get(g.k2) ?? 0) + g.planned); rowsBy.set(g.k1, m) })
        return (
          <table ref={aggRef} className="w-full text-left">
            <thead>
              <tr>
                <th style={{ width: 34 }}></th>
                <th>{axis} \ {axis2}</th>
                {cols.map((c) => <th key={c} style={{ textAlign: 'right' }}>{c}</th>)}
                <th style={{ textAlign: 'right' }}>합계</th>
              </tr>
            </thead>
            <tbody>
              {[...rowsBy.entries()].map(([k, m], i) => (
                <tr key={k}>
                  <td style={{ textAlign: 'center', color: '#8a929c', background: '#f3f3f3' }}>{i + 1}</td>
                  <td>{k}</td>
                  {cols.map((c) => <td key={c} style={{ textAlign: 'right' }}>{m.get(c) ? m.get(c)!.toLocaleString() : ''}</td>)}
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{[...m.values()].reduce((a, v) => a + v, 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
                <td colSpan={2} style={{ textAlign: 'right' }}>합계</td>
                {cols.map((c) => <td key={c} style={{ textAlign: 'right' }}>{grouped.filter((g) => g.k2 === c).reduce((a, g) => a + g.planned, 0).toLocaleString()}</td>)}
                <td style={{ textAlign: 'right' }}>{totalPlanned.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        )
      })() : mode === '집계' ? (
        <table ref={aggRef} className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              {code1 && <th style={{ width: 110 }}>{code1}</th>}
              {code2 && <th style={{ width: 110 }}>{code2}</th>}
              <th>{axis2 ? `${axis} · ${axis2}` : axis}</th>
              <th style={{ width: 90, textAlign: 'right' }}>건수</th>
              <th style={{ width: 120, textAlign: 'right' }}>지시수량</th>
              {ratio && <th style={{ width: 80, textAlign: 'right' }}>비율(%)</th>}
              <th style={{ width: 120, textAlign: 'right' }}>생산수량</th>
              <th style={{ width: 120, textAlign: 'right' }}>잔량</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 ? (
              <tr><td colSpan={6 + (code1 ? 1 : 0) + (code2 ? 1 : 0) + (ratio ? 1 : 0)} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : grouped.map((g, i) => (
              <tr key={g.key}>
                <td style={{ textAlign: 'center', color: '#8a929c', background: '#f3f3f3' }}>{i + 1}</td>
                {code1 && <td style={{ fontFamily: 'monospace' }}>{g.c1}</td>}
                {code2 && <td style={{ fontFamily: 'monospace' }}>{g.c2}</td>}
                <td>{g.key}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{g.count.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{g.planned.toLocaleString()}</td>
                {ratio && <td style={{ textAlign: 'right', color: '#5a626e' }}>{totalPlanned ? (Math.round((g.planned / totalPlanned) * 1000) / 10).toFixed(1) : '0.0'}</td>}
                <td style={{ textAlign: 'right' }}>{g.produced.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: g.remaining > 0 ? '#c60a2e' : '#8a929c' }}>{g.remaining.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={2 + (code1 ? 1 : 0) + (code2 ? 1 : 0)} style={{ textAlign: 'right' }}>합계 ({grouped.length}개 그룹)</td>
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.count, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{totalPlanned.toLocaleString()}</td>
              {ratio && <td style={{ textAlign: 'right' }}>100.0</td>}
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.produced, 0).toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{grouped.reduce((a, g) => a + g.remaining, 0).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 200, textAlign: 'center' }}>일자-No.</th>
            <th>품목명[규격명]</th>
            {/* 원본 [수량] — 지시수량을 말한다. 생산·잔여는 우리가 더 보여 주는 것이다. */}
            <th style={{ textAlign: 'right' }}>수량</th>
            <th style={{ textAlign: 'right' }}>생산수량</th>
            <th style={{ textAlign: 'right' }}>잔여수량</th>
            <th style={{ textAlign: 'right' }}>진행률(%)</th>
            {/* 원본은 [거래처명]을 183 으로 둔다 — 일자-No. 보다 넓다. */}
            <th style={{ width: 200 }}>거래처명</th>
            <th style={{ width: 90 }}>담당자명</th>
            <th>입고창고</th>
            {/* 원본 열 이름은 [납기일자]다. */}
            <th>납기일자</th>
            <th style={{ textAlign: 'center' }}>상태</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : listRows.length === 0 ? (
            <tr><td colSpan={12} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : listRows.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(r.orderDate)} {r.orderNo}</td>
              <td>{r.productName}{r.productSpec ? `[${r.productSpec}]` : ''}</td>
              <td style={{ textAlign: 'right' }}>{r.plannedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--ec-blue-dark)' }}>{r.producedQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right', color: r.remainingQty > 0 ? '#c60a2e' : '#8a929c' }}>{r.remainingQty.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.plannedQty ? Math.round((r.producedQty / r.plannedQty) * 100) : 0}</td>
              <td style={{ color: r.partnerName ? undefined : '#c9ced6' }}>{r.partnerName ?? ''}</td>
              <td style={{ color: r.employeeId ? undefined : '#c9ced6' }}>{empName(r.employeeId)}</td>
              <td>{r.warehouseName}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.dueDate) || ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    </EcListShell>
  )
}
