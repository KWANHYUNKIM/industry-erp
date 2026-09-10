import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import EcBarChart from '../../components/EcBarChart'
import { STATUS_PICKS, periodOf } from '../../components/EcPeriodPicks'
import type { Warehouse } from '../../api/types'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { subtotalBy } from '../../utils/subtotalBy'
import { dateText } from '../../utils/dateText'
import { useItemMgmt } from '../../utils/itemMgmtItems'

/**
 * 생산관리 > 생산불출현황 — 자재 불출을 기간·조건으로 본다 (/api/material-issues).
 *
 * <p>원본 조건 판 실측(사본):
 *   [구분] 내역 | 집계 | 라인별 · 일자(금월(~오늘)) · 창고 · 프로젝트 · 품목 · 담당자 · 적요
 * 우리는 조건 판이 없고 <b>자재별 집계 하나</b>만 보여 줬다. 원본의 세 시야 중 '집계'만 있고
 * 언제·어느 작업지시로 나갔는지는 볼 수가 없었다.
 *
 * <p>우리 불출 자료는 한 건이 자재 한 줄이라 원본의 '내역'(전표 단위)에 대응하는 것이
 * <b>작업지시 단위</b>다. 그렇게 접는다.
 *
 * <p>[담당자] 는 예전에 "불출에 그 값이 없어" 만들지 않았는데, 이제 불출이 담당자를 든다
 * (원본 생산불출입력 머리의 항목이다). 프로젝트는 여전히 없어 만들지 않는다.
 * 담당자 <b>이름</b>은 서버가 못 붙인다 — production 은 hr 을 참조할 수 없어
 * (hr → accounting → production 순환) id 만 온다. 화면이 사원 목록에서 붙인다.
 */
/*
 * 원본 [구분]은 <b>내역·집계 둘</b>이다(대조표 실측). [라인별]은 우리가 더 둔 갈래였는데,
 * 2026-09-09 에 원본 격자를 재 보니 <b>[내역]이 이미 줄 단위</b>였다 - 우리 [내역]만
 * 작업지시로 접고 있어서 [라인별]을 따로 둔 것이었다. [내역]을 원본대로 고치면
 * 둘이 같은 표가 되므로 갈래를 없앤다.
 */
type Mode = '내역' | '집계'
const MODES = ['내역', '집계'] as const

interface MaterialIssue {
  id: number
  /**
   * 불출 전표번호. 원본 [일자-No.] 의 뒷부분이다 - <b>서버가 진작 보내고 있었는데</b>
   * 이 화면이 안 받아 두어 일자와 번호를 한 칸에 못 적고 있었다.
   */
  issueNo: string
  /** 규격. 원본 열 이름이 [품목명[규격명]] 이다 - 이것도 진작 오던 값이다. */
  itemSpec: string | null
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  warehouseId: number
  warehouseName: string
  /** 원본 생산불출조회 열은 [보내는창고명]과 [받는공장명] 둘이다. */
  toWarehouseName: string | null
  workOrderId: number
  workOrderNo: string
  /** 담당자(사원) id. 이름은 화면이 붙인다. */
  employeeId: number | null
  qty: number
  issueDate: string
  note: string | null
  /** 원본 조건 판의 [프로젝트]. 응답에 이미 있는데 이 화면이 안 받고 있었다. */
  projectName: string | null
  /** 원본 [품목구분]. 품목 마스터의 값이고 응답이 진작 싣는다. */
  itemCategoryName: string | null
}

const num = (n: number) => n.toLocaleString('ko-KR')

export default function IssueStatusPage() {
  /* 원본은 조건 판의 창고·거래처·품목·프로젝트를 모두 코드도움으로 둔다. */
  const pickers = useCondPickers(['items', 'employees', 'projects'])
  /*
   * 원본 [결재방표시] — 켜면 출력물에 <b>결재란</b>(담당/검토/승인 도장칸)이 찍힌다.
   * 기본값은 <b>꺼짐</b>이다(사본 실측). 우리는 그 칸을 늘 찍고 있었다 —
   * 결재를 안 받을 자료까지 도장칸을 달고 나가면 종이가 한 칸씩 밀린다.
   */
  const [signBox, setSignBox] = useState(false)
  const [rows, setRows] = useState<MaterialIssue[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const init = periodOf('금월(~오늘)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [mode, setMode] = useState<Mode>('내역')
  const [view, setView] = useState<'표' | '그래프'>('표')
  const [warehouseId, setWarehouseId] = useState('')
  /** 원본 조건 판의 [프로젝트]. */
  const [project, setProject] = useState('')
  const [item, setItem] = useState('')
  const [note, setNote] = useState('')
  const [emp, setEmp] = useState('')
  /*
   * 2026-09-08 에 원본(E040409)의 조건 판을 재니 <b>스물여덟</b>이다(사본에는 열).
   * 접힌 줄은 없다 — 접힘 표시를 눌러도 줄 수가 그대로다.
   *
   * <p>여기서 만든 넷: 보내는창고 · 받는창고 · 품목구분 · 품목그룹1.
   * <b>[창고]의 뜻도 고쳤다</b> — 원본이 [창고]와 [보내는창고]·[받는창고]를 나란히
   * 두는 까닭은 생산불출조회에서 이미 확인했다: <b>[창고]는 어느 쪽이든 걸리고
   * 나머지 둘은 한쪽만 건다.</b> 우리 [창고]는 보내는 쪽만 보고 있어서,
   * 받는 창고로 고르면 그 줄이 통째로 사라졌다.
   */
  const [fromWh, setFromWh] = useState('')
  const [toWh, setToWh] = useState('')
  const [itemCategory, setItemCategory] = useState('')
  const [itemGroup, setItemGroup] = useState('')
  const mgmt = useItemMgmt()
  /** 담당자 이름표. 서버가 못 붙여서 화면이 붙인다. */
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const period: Record<string, string> = {}
      if (from) period.from = from
      if (to) period.to = to
      const [issues, wh, emps] = await Promise.all([
        /*
         * <b>고른 기간을 서버에도 보낸다.</b> 이 표는 불출을 <b>그 불출일로</b> 거른다
         * (아래 <code>r.issueDate &lt; from</code>) — 서버에 같은 창을 주면 된다.
         */
        api.get<MaterialIssue[]>('/material-issues', { params: period }),
        api.get<Warehouse[]>('/warehouses'),
        api.get<{ id: number; name: string }[]>('/employees'),
      ])
      setRows([...issues.data].sort((a, b) =>
        (a.issueDate < b.issueDate ? 1 : a.issueDate > b.issueDate ? -1 : b.id - a.id)))
      setWarehouses(wh.data)
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

  const reset = () => {
    setFrom(init.from); setTo(init.to)
    setMode('내역'); setWarehouseId(''); setItem(''); setNote(''); setEmp('')
    setFromWh(''); setToWh(''); setItemCategory(''); setItemGroup('')
  }

  /** 담당자 이름. 서버가 못 붙여서 화면이 붙인다. */
  const empName = (id: number | null) =>
    id == null ? '' : (employees.find((x) => x.id === id)?.name ?? '')

  /*
   * 원본 [정렬/소계기준]. 불출은 자재마다·창고마다 여러 줄로 흩어져,
   * 어느 자재가 얼마나 나갔는지를 눈으로 더해야 했다.
   */
  const SUBTOTALS = ['자재', '보내는창고', '받는공장', '담당자'] as const
  const [subtotal, setSubtotal] = useState<typeof SUBTOTALS[number]>('자재')
  const shown = useMemo(() => rows.filter((r) => {
    if (r.issueDate < from || r.issueDate > to) return false
    /* [창고] — 보내는·받는 어느 쪽이든 걸린다(생산불출조회와 같은 규칙). */
    if (warehouseId && String(r.warehouseId) !== warehouseId
        && (r.toWarehouseName ?? '') !== (warehouses.find((w) => String(w.id) === warehouseId)?.name ?? '\u0000')) return false
    if (fromWh && (r.warehouseName ?? '') !== fromWh) return false
    if (toWh && (r.toWarehouseName ?? '') !== toWh) return false
    if (itemCategory && (r.itemCategoryName ?? '') !== itemCategory) return false
    if (itemGroup && mgmt.groupOf(r.itemId) !== itemGroup) return false
    if (item && !`${r.itemCode} ${r.itemName}`.includes(item)) return false
    if (note && !(r.note ?? '').includes(note)) return false
    if (emp && !empName(r.employeeId).includes(emp)) return false
    if (project && (r.projectName ?? '') !== project) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [rows, from, to, warehouseId, item, note, emp, project, employees,
       fromWh, toWh, itemCategory, itemGroup, mgmt.groupOptions, warehouses])

  /** 내역 — 작업지시 하나를 한 줄로 접는다. */
  const byOrder = useMemo(() => {
    const m = new Map<number, {
      workOrderId: number; workOrderNo: string; date: string; warehouseName: string; toWarehouseName: string | null
      itemName: string; lineCount: number; qty: number
    }>()
    for (const r of shown) {
      const cur = m.get(r.workOrderId)
      if (!cur) {
        m.set(r.workOrderId, {
          workOrderId: r.workOrderId, workOrderNo: r.workOrderNo, date: r.issueDate,
          warehouseName: r.warehouseName, toWarehouseName: r.toWarehouseName,
          itemName: r.itemName, lineCount: 1, qty: r.qty,
        })
      } else {
        cur.lineCount += 1
        cur.qty += r.qty
        if (r.issueDate > cur.date) cur.date = r.issueDate
      }
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [shown])

  /** 집계 — 자재별로 모은다. 예전 화면이 보여 주던 것이 이거다. */
  const byItem = useMemo(() => {
    const m = new Map<number, {
      itemId: number; itemCode: string; itemName: string; unit: string
      count: number; totalQty: number; lastDate: string
    }>()
    for (const r of shown) {
      const cur = m.get(r.itemId)
      if (!cur) {
        m.set(r.itemId, {
          itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName, unit: r.unit,
          count: 1, totalQty: r.qty, lastDate: r.issueDate,
        })
      } else {
        cur.count += 1
        cur.totalQty += r.qty
        if (r.issueDate > cur.lastDate) cur.lastDate = r.issueDate
      }
    }
    return [...m.values()].sort((a, b) => b.totalQty - a.totalQty)
  }, [shown])

  const totalQty = shown.reduce((n, r) => n + r.qty, 0)

  /*
   * 원본 [데이터 보기형식] · [그래프로 보기]. 표만 있으면 "어느 자재가 많이 나갔나" 를
   * 숫자 스무 줄에서 눈으로 찾아야 한다 — 현황 화면을 여는 이유가 대개 그것이다.
   * 무엇을 그릴지는 지금 보고 있는 [구분]을 따라간다.
   */
  const chartRows = useMemo(() => {
    if (mode === '집계') return byItem.map((r) => ({ label: r.itemName, value: r.totalQty }))
    if (mode === '내역') return byOrder.map((g) => ({ label: g.workOrderNo, value: g.qty }))
    return shown.map((r) => ({ label: `${r.issueDate} ${r.itemName}`, value: r.qty }))
  }, [mode, byItem, byOrder, shown])

  return (
    <EcListShell
      title="생산불출현황"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
      signLine={signBox}
    >
      {/* 원본은 기간 줄을 [일자]라고 부른다(사본 실측) — 기본값 [기준일자]가 아니다. */}
      <EcStatusPanel
        dateLabel="일자"
        from={from} to={to}
        onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={STATUS_PICKS}
        modes={MODES} mode={mode} onModeChange={(m) => setMode(m as Mode)}
        view={view} onViewChange={setView}
        subtotal={subtotal} subtotals={SUBTOTALS}
        onSubtotalChange={(v) => setSubtotal(v as typeof SUBTOTALS[number])}
      >
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체"
                           value={warehouseId} onChange={(v) => setWarehouseId(v)}
                           items={warehouses.map((w) => ({ value: String(w.id), code: (w as { code?: string }).code, name: w.name }))} />
        </EcCond>
        {/*
          원본 차례(2026-09-08 실측, 스물여덟): 구분 · 일자 · 창고 · (창고계층그룹) ·
          <b>보내는창고</b> · (보내는창고계층그룹) · <b>받는창고</b> · (받는창고계층그룹) ·
          프로젝트 · (프로젝트그룹1/2) · 품목 · <b>품목구분 · 품목그룹1</b> ·
          (품목그룹2/3 · 품목계층그룹) · 담당자 · 적요 · (오더관리번호 · 진행상태 ·
          최초작성자 · 최종수정자 · 양식) · 적용양식 · 양식구분 · 정렬/소계기준 ·
          데이터 보기형식.
        */}
        <EcCond label="보내는창고" pick>
          <CodePickerField label="보내는창고" hideLabel width={170} emptyLabel="전체"
                           value={fromWh} onChange={setFromWh}
                           items={warehouses.map((w) => ({ value: w.name, name: w.name }))} />
        </EcCond>
        <EcCond label="받는창고" pick>
          <CodePickerField label="받는창고" hideLabel width={170} emptyLabel="전체"
                           value={toWh} onChange={setToWh}
                           items={warehouses.map((w) => ({ value: w.name, name: w.name }))} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체"
                           value={project} onChange={(v) => setProject(v)}
                           items={pickers.projects} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체"
                           value={item} onChange={(v) => setItem(v)}
                           items={pickers.items} />
        </EcCond>
        <EcCond label="품목구분" pick>
          <CodePickerField label="품목구분" hideLabel width={140} emptyLabel="전체"
                           value={itemCategory} onChange={setItemCategory}
                           items={[...new Set(rows.map((r) => r.itemCategoryName).filter(Boolean) as string[])].sort()
                             .map((n) => ({ value: n, name: n }))} />
        </EcCond>
        <EcCond label="품목그룹1" pick>
          <CodePickerField label="품목그룹1" hideLabel width={170} emptyLabel="전체"
                           value={itemGroup} onChange={setItemGroup}
                           items={mgmt.groupOptions.map((g) => ({ value: g, name: g }))} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체"
                           value={emp} onChange={(v) => setEmp(v)}
                           items={pickers.employees} />
        </EcCond>
        <EcCond label="적요">
          <input className="ec-input" placeholder="적요 일부" value={note}
                 onChange={(e) => setNote(e.target.value)} style={{ width: 220 }} />
        </EcCond>
        <EcCond label="결재방표시">
          <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={signBox} onChange={(e) => setSignBox(e.target.checked)} />
            인쇄물에 결재란(도장칸)을 찍는다
          </label>
        </EcCond>
      </EcStatusPanel>

      <div style={{ marginBottom: 8, fontSize: 12.5, color: '#5a626e', textAlign: 'right' }}>
        불출 <b style={{ color: '#3c4553' }}>{shown.length}</b>건
        <span style={{ margin: '0 6px', color: '#c9ced6' }}>|</span>
        불출수량 <b style={{ color: '#a5561b', fontSize: 14 }}>{num(totalQty)}</b>
      </div>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      {view === '그래프' ? (
        <EcBarChart rows={chartRows} unit=" 개" emptyText="조회된 불출이 없습니다." />
      ) : mode === '집계' ? (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 140 }}>자재코드</th>
              <th>자재명</th>
              <th style={{ width: 70 }}>단위</th>
              <th style={{ width: 100, textAlign: 'right' }}>불출건수</th>
              <th style={{ width: 130, textAlign: 'right' }}>총불출수량</th>
              <th style={{ width: 120 }}>최근불출일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : byItem.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : byItem.map((g, i) => (
              <tr key={g.itemId}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td style={{ fontFamily: 'monospace' }}>{g.itemCode}</td>
                <td>{g.itemName}</td>
                <td>{g.unit}</td>
                <td style={{ textAlign: 'right', color: '#8a929c' }}>{num(g.count)}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{num(g.totalQty)}</td>
                <td style={{ fontFamily: 'monospace' }}>{dateText(g.lastDate)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={4} style={{ textAlign: 'right' }}>합계 ({byItem.length}자재)</td>
              <td style={{ textAlign: 'right' }}>{num(shown.length)}</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totalQty)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <table className="w-full text-left">
          {/*
            원본 격자(2026-09-09 E040409 실측):
            <b>일자-No. · 출고창고명 · 입고창고명 · 품목명[규격명] · 수량 · 생산금액 · 적요</b>.
            <b>[내역]은 줄 단위다</b> - 우리는 작업지시 하나를 한 줄로 접고 자재를
            "첫 자재 외 N건" 으로 줄여 두어 <b>무엇을 냈는지가 화면에서 사라졌다</b>
            (판매현황·구매현황에서 본 것과 같은 실수다).
            이름도 넷 달랐다 - 보내는창고/받는공장/자재명/불출수량.
            [작업지시번호]는 원본에 없지만 우리가 더 두는 열이라 맨 뒤에 붙인다.
            [생산금액]은 못 만든다 - 불출에 단가를 안 매긴다(예외에 적었다).
          */}
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 170, textAlign: 'center' }}>일자-No.</th>
              <th style={{ width: 130 }}>출고창고명</th>
              <th style={{ width: 130 }}>입고창고명</th>
              <th>품목명[규격명]</th>
              <th style={{ width: 110, textAlign: 'right' }}>수량</th>
              <th>적요</th>
              <th style={{ width: 170 }}>작업지시번호</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((r, i) => (
              <tr key={r.id}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                {/* 원본은 일자와 번호를 한 칸에 적는다. */}
                <td style={{ fontFamily: 'monospace', textAlign: 'center' }}>{dateText(r.issueDate)} {r.issueNo}</td>
                <td>{r.warehouseName}</td>
                <td style={{ color: r.toWarehouseName ? undefined : '#c9ced6' }}>{r.toWarehouseName ?? ''}</td>
                <td>{r.itemName}{r.itemSpec ? ' [' + r.itemSpec + ']' : ''}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#a5561b' }}>{num(r.qty)} {r.unit}</td>
                <td style={{ color: r.note ? undefined : '#c9ced6' }}>{r.note ?? ''}</td>
                <td style={{ fontFamily: 'monospace', color: '#5a626e' }}>{r.workOrderNo}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 700, background: 'var(--ec-body-bg)' }}>
              <td colSpan={5} style={{ textAlign: 'right' }}>합계 ({shown.length}건)</td>
              <td style={{ textAlign: 'right', color: '#a5561b' }}>{num(totalQty)}</td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        </table>
      )}

      {shown.length > 0 && (() => {
        const groups = subtotalBy(shown,
          (r) => (subtotal === '보내는창고' ? r.warehouseName
            : subtotal === '받는공장' ? r.toWarehouseName
              : subtotal === '담당자' ? (empName(r.employeeId) || null)
                : r.itemName),
          { qty: (r) => r.qty })
        return (
          <>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 6px' }}>{subtotal} 소계</h3>
            <table className="w-full text-left">
              <thead><tr>
                <th>{subtotal}</th>
                <th style={{ width: 90, textAlign: 'right' }}>건수</th>
                <th style={{ width: 140, textAlign: 'right' }}>수량</th>
              </tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.label}>
                    <td style={{ fontWeight: 600 }}>{g.label}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{g.count}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#a5561b' }}>
                      {num(g.sums.qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )
      })()}
    </EcListShell>
  )
}
