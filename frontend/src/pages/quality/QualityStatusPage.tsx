import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import { api, extractErrorMessage } from '../../api/client'
import type { Item, QualityInspection, QualityInspectionLine, QualityInspectionType } from '../../types/api'
import { useItemMgmt } from '../../utils/itemMgmtItems'
import { dateNo } from '../../utils/dateNo'
import EcPeriodPicks, { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import EcBarChart from '../../components/EcBarChart'
import ItemSuggestInput from '../../features/item/components/ItemSuggestInput'
import { EcReportHead, EcReportFoot, reportDate, reportPeriod } from '../../components/EcReportFrame'
import { AsAggControls, AsAggregateTable, type AsAggKey, type AsAggLine } from '../../features/as/AsAggregate'
import { usePartnerGroups } from '../../utils/partnerGroups'

/**
 * 재고 II > 품질관리 > 품질검사현황 (이카운트 E040623)
 * 품질검사(검사성적) 전체를 필터·집계해서 보는 현황. 검사입력은 품질관리 화면(QualityInspectionPage).
 * 데이터는 GET /api/quality-inspections 그대로 사용(백엔드 무변경).
 *
 * 이카운트 원본 Search 패널은 검사항목(문자/숫자/코드형)·불량유형·창고·프로젝트·집계조건 등 필드가 방대하지만,
 * 우리 InspectionResponse 로 실제 거를 수 있는 것만 둔다: 기간·검사유형·품목·판정결과·검사자.
 * 나머지는 대응 필드가 없어 **의도적 제외**(값 없는 컨트롤을 만들지 않는다).
 *
 * <p>2026-10-04 원본 실측(자료가 든 판, 검사 줄 셋):
 * <ul>
 *   <li>[구분] ◉내역(일별 · 월별 · <b>라인별</b> · 전표별 · 품목별 · 전표별품목별 · 거래처별 · 담당자별 · 거래처별라인별(전송용)) ○집계.</li>
 *   <li>내역 격자는 <b>검사일 오름차순</b>이고 달 끝에 '<b>2026/10 계</b>' 소계, 맨 끝 [합계] — 수량 · 시료 · 적격 · 부적격을 더한다.
 *       [부적격]이 0 이면 빈칸이다. 예전 우리는 내림차순 · 소계 없음이었고, 원본에 없는 [검사구분 · 로트 · 불량률 · 검사자] 열과
 *       위쪽 요약 줄을 두었다 — 뺐다.</li>
 *   <li>○집계 — 집계조건 창이 A/S접수현황과 같다(품질검사 묶음 = 담당자 · 창고 · 관리항목). 값 열은
 *       <b>[수량 · 시료 · 적격 · 부적격]</b>(품목명[규격]으로 묶어 인텔 코어 20 · 20 · 20 …, 합계 31 · 30 · 30). 꼬리에 [P.1] 없음.</li>
 *   <li>출력물 머리글 '품질검사현황' · 회사명 · 기간, 내역 꼬리 [P.1].</li>
 * </ul>
 */
/** 원본 ◉내역 선택상자(차례 그대로). 거래처별라인별(전송용)은 내보내기용 판이라 두지 않는다. */
const FORMS = ['일별', '월별', '라인별', '전표별', '품목별', '전표별품목별', '거래처별', '담당자별'] as const
type Form = (typeof FORMS)[number]
/** ○집계의 값 열 — 원본 그대로. */
const MEASURES = ['수량', '시료', '적격', '부적격']
const TYPES: QualityInspectionType[] = ['INCOMING', 'PROCESS', 'SHIPMENT']
const TYPE_LABEL: Record<QualityInspectionType, string> = {
  INCOMING: '수입검사', PROCESS: '공정검사', SHIPMENT: '출하검사',
}
/* 원본 [합격여부] 후보 — 전체 · 해당없음 · 합격 · 불합격. 2026-10-04 부터 검사 줄이 이 값을 든다. */
type Pass = QualityInspectionLine['passResult']
const PASSES: Pass[] = ['NA', 'PASS', 'FAIL']
const PASS_LABEL: Record<Pass, string> = { NA: '해당없음', PASS: '합격', FAIL: '불합격' }
const qty2 = (n: number) => n.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Filters {
  dateFrom: string
  /** 원본 [구분] — 검색할 때 걸린다. */
  gubun: '내역' | '집계'; form: Form; agg1: AsAggKey | ''; agg2: AsAggKey | ''; codeIncl: boolean
  /** 원본 품질검사현황 조건의 [창고]·[프로젝트]. 검사에 그 칸이 없어 못 걸렀다. */
  warehouse: string
  project: string
  dateTo: string
  type: '' | QualityInspectionType
  item: string
  result: '' | Pass
  /* 원본 [진행상태](검사 전표의 종결여부) · [검사방법](줄의 전수 · 샘플링) — 2026-10-04 검사가 줄과 종결여부를 들면서 생겼다. */
  status: '' | QualityInspection['status']
  method: '' | QualityInspectionLine['method']
  inspector: string
  /*
   * 2026-09-08 에 원본(E040623)의 조건 판을 재니 <b>서른둘</b>이다(사본에는 일곱).
   * 접힌 줄은 없다. 여기서 만든 넷: 품목구분 · 품목그룹1 · 규격 · 불량유형 · 적요.
   *
   * <p>이름도 셋을 원본대로 고쳤다 — [검사일자]→<b>[기준일자]</b>,
   * [판정결과]→<b>[합격여부]</b>, [검사자]→<b>[담당자]</b>.
   */
  category: string
  itemGroup: string
  spec: string
  defectType: string
  remark: string
}
/*
 * 원본 품질검사현황은 <b>금월</b>을 보고 열린다(사본 실측 — 달 스핀박스가 07 하나).
 * 우리는 기간을 비워 두고 단추도 없었다.
 */
const init = periodOf('금월(~오늘)')!

const EMPTY_FILTERS: Filters = { dateFrom: init.from, dateTo: init.to, gubun: '내역', form: '라인별', agg1: '', agg2: '', codeIncl: false, type: '', item: '', warehouse: '', project: '', result: '', status: '', method: '', inspector: '',
  category: '', itemGroup: '', spec: '', defectType: '', remark: '' }


export default function QualityStatusPage() {
  const [rows, setRows] = useState<QualityInspection[]>([])
  /* 품목구분·규격은 <b>품목 마스터</b>의 값이라 마스터를 받아 itemId 로 잇는다. */
  const [items, setItems] = useState<Item[]>([])
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const mgmt = useItemMgmt()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')

  const [panelOpen, setPanelOpen] = useState(false)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)

  async function load() {
    setLoading(true)
    try {
      const [res, it] = await Promise.all([
        api.get<QualityInspection[]>('/quality-inspections', { params: { from: filters.dateFrom || undefined, to: filters.dateTo || undefined } }),
        api.get<Item[]>('/items'),
      ])
      setRows(res.data); setItems(it.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  /*
   * <b>기간을 서버에 보낸다.</b> 예전에는 조건 판에 [기간]을 물어 놓고 서버에는 아무것도
   * 안 보내, 전 기간을 받아 브라우저에서 걸렀다. 기간이 바뀌면 다시 물어본다.
   */
  useEffect(() => { load() }, [filters.dateFrom, filters.dateTo])

  /**
   * 원본 [데이터 보기형식] · [그래프로 보기] — 조건 판 <b>맨 끝</b>이다(사본 실측:
   * 품목 · 창고 · 프로젝트 · 출처(요청)구분 · 적용양식 · 양식구분 · 데이터 보기형식).
   * 이 화면은 조건 판을 손으로 짰으므로 SearchPanel 안, 마지막 줄에 직접 단다 —
   * 검사는 라벨의 <b>글자 차례</b>로 재는데 조건 판이 아래쪽 컴포넌트라 본문에 달면 앞에 선다.
   *
   * <p>무엇을 그리나 — 검사는 <b>품목마다 몇 건이 어떻게 판정됐나</b> 를 보는 표다.
   * 품목으로 묶어 <b>불합격 건수</b>를 그린다. 전체 건수를 그리면 많이 검사한 품목이 늘 위에
   * 서서 '자주 걸리는 품목' 이 묻힌다 — 불량률파악보고서에서 겪은 것과 같은 함정이다.
   * 불합격이 하나도 없는 품목은 뺀다(막대 없는 줄이 늘어서면 걸린 것을 못 찾는다).
   */
  const [view, setView] = useState<'표' | '그래프'>('표')

  const shown = useMemo(() => {
    const kw = keyword.trim()
    const f = filters
    return rows.filter((r) => {
      if (kw && !r.itemName.includes(kw) && !r.inspectionNo.includes(kw) && !(r.lotNo ?? '').includes(kw)) return false
      if (f.dateFrom && r.inspectionDate < f.dateFrom) return false
      if (f.warehouse && (r.warehouseName ?? '') !== f.warehouse) return false
      if (f.project && (r.projectName ?? '') !== f.project) return false
      if (f.dateTo && r.inspectionDate > f.dateTo) return false
      if (f.type && r.type !== f.type) return false
      if (f.item && !r.itemName.includes(f.item)) return false
      if (f.status && r.status !== f.status) return false
      if (f.result && !r.lines.some((l) => l.passResult === f.result)) return false
      if (f.method && !r.lines.some((l) => l.method === f.method)) return false
      if (f.inspector && !(r.inspector ?? '').includes(f.inspector)) return false
      if (f.category && (itemById.get(r.itemId)?.categoryName ?? '') !== f.category) return false
      if (f.itemGroup && mgmt.groupOf(r.itemId) !== f.itemGroup) return false
      if (f.spec && !(itemById.get(r.itemId)?.spec ?? '').includes(f.spec)) return false
      if (f.defectType && (r.defectType ?? '') !== f.defectType) return false
      if (f.remark && !(r.remark ?? '').includes(f.remark)) return false
      return true
    }).sort((a, b) => (a.inspectionDate < b.inspectionDate ? -1 : a.inspectionDate > b.inspectionDate ? 1 : a.id - b.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, keyword, filters, itemById, mgmt.groupOptions])

  /*
   * 원본 격자는 <b>검사 줄</b>이 한 줄이다(일자-No. · 검사방법 · 품목명[규격명] · 수량 · 시료 · 적격 · 부적격 · 합격여부).
   * 합격여부 · 검사방법 조건은 줄에 건다.
   */
  const lineRows = useMemo(() => shown.flatMap((r) => r.lines
    .filter((l) => (!filters.result || l.passResult === filters.result) && (!filters.method || l.method === filters.method))
    .map((l) => ({ r, l }))), [shown, filters.result, filters.method])
  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    검사일자: (r) => r.inspectionDate,
  })

  /** ◉내역의 줄 — 라인별이면 검사 줄마다, 아니면 고른 판으로 묶어 처음 줄의 값 + 수량 · 시료 · 적격 · 부적격 합. */
  const listRows = useMemo(() => {
    type X = (typeof lineRows)[number]
    const f = filters.form
    const keyOf = ({ r, l }: X) => f === '일별' ? r.inspectionDate : f === '월별' ? r.inspectionDate.slice(0, 7)
      : f === '전표별' ? String(r.id) : f === '품목별' ? String(l.itemId) : f === '전표별품목별' ? `${r.id}|${l.itemId}`
      : f === '거래처별' ? '' : f === '담당자별' ? r.inspector ?? '' : `${r.id}|${l.id}`
    const groups: X[][] = []
    const m = new Map<string, X[]>()
    sort.sorted.flatMap((r) => lineRows.filter((x) => x.r === r)).forEach((x) => { const k = keyOf(x); if (!m.has(k)) { m.set(k, []); groups.push(m.get(k)!) } m.get(k)!.push(x) })
    const sum = (g: X[], k: 'quantity' | 'sampleQty' | 'goodQty' | 'defectQty') => g.reduce((n, x) => n + Number(x.l[k]), 0)
    return groups.map((g) => ({
      ...g[0], key: `${g[0].r.id}-${g[0].l.id}`, month: g[0].r.inspectionDate.slice(0, 7),
      qty: sum(g, 'quantity'), sample: sum(g, 'sampleQty'), good: sum(g, 'goodQty'), defect: sum(g, 'defectQty'),
      dateCell: f === '일별' ? reportDate(g[0].r.inspectionDate) : f === '월별' ? reportDate(g[0].r.inspectionDate).slice(0, 7) : dateNo(g[0].r.inspectionDate, g[0].r.inspectionNo),
    }))
  }, [lineRows, filters.form, sort.sorted])
  /** 원본 소계는 달마다 — '2026/10 계'. */
  const sumOf = (rs: { qty: number; sample: number; good: number; defect: number }[]) => rs.reduce(
    (a, x) => ({ qty: a.qty + x.qty, sample: a.sample + x.sample, good: a.good + x.good, defect: a.defect + x.defect }), { qty: 0, sample: 0, good: 0, defect: 0 })

  /* ○집계가 읽는 줄 — 검사 줄마다. 코드는 마스터에서 잇는다. */
  const pgroup = usePartnerGroups()
  const [codes, setCodes] = useState<{ wh: Map<number, string>; pj: Map<number, string> }>({ wh: new Map(), pj: new Map() })
  useEffect(() => {
    type C = { id: number; code: string }
    const get = (u: string) => api.get<C[]>(u).then((r) => new Map(r.data.map((x) => [x.id, x.code] as [number, string]))).catch(() => new Map<number, string>())
    Promise.all([get('/warehouses'), get('/projects')]).then(([wh, pj]) => setCodes({ wh, pj }))
  }, [])
  const aggLines: AsAggLine[] = lineRows.map(({ r, l }) => ({
    date: r.inspectionDate, charge: r.inspector ?? '',
    warehouse: [r.warehouseName ?? '', r.warehouseId != null ? codes.wh.get(r.warehouseId) ?? '' : ''],
    mgmt: mgmt.nameOf(l.itemId) ?? '', partner: ['', ''], partnerGroup: pgroup.groupOfName('') ?? '',
    itemName: l.itemName, itemSpec: l.spec, itemCode: l.itemCode, itemGroup: mgmt.groupOf(l.itemId) ?? '',
    project: [r.projectName ?? '', r.projectId != null ? codes.pj.get(r.projectId) ?? '' : ''],
    qty: Number(l.quantity), vals: [Number(l.quantity), Number(l.sampleQty), Number(l.goodQty), Number(l.defectQty)],
  }))

  const activeCount = useMemo(() => {
    let n = 0
    if (filters.dateFrom || filters.dateTo) n++
    if (filters.type) n++
    if (filters.item) n++
    if (filters.result) n++
    if (filters.status) n++
    if (filters.method) n++
    if (filters.inspector) n++
    return n
  }, [filters])

  const applyDraft = () => { setFilters(draft); setPanelOpen(false) }
  const resetDraft = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS) }
  const openPanel = () => { setDraft(filters); setPanelOpen((v) => !v) }



  return (
    <EcListShell
      title="품질검사현황"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      actions={[{ label: '새로고침', onClick: load }, { label: '인쇄' }, { label: 'Excel' }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="flex items-center gap-[8px] mb-[8px]">
        <button className="ec-btn" onClick={openPanel}>
          상세검색 {panelOpen ? '▲' : '▼'}{activeCount > 0 ? ` (${activeCount})` : ''}
        </button>
        {activeCount > 0 && !panelOpen && (
          <button className="ec-btn text-[12px] text-ec-hint" onClick={resetDraft}>조건 해제</button>
        )}
      </div>

      {panelOpen && (
        <SearchPanel draft={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} onApply={applyDraft} onReset={resetDraft}
                     view={view} onViewChange={setView} />
      )}

      {view === '그래프' ? (
        <EcBarChart unit=" 건" emptyText="불합격 판정이 없습니다."
                    rows={(() => {
                      const m = new Map<string, number>()
                      for (const { l } of lineRows) {
                        if (l.passResult !== 'FAIL') continue
                        m.set(l.itemName, (m.get(l.itemName) ?? 0) + 1)
                      }
                      return [...m].map(([label, value]) => ({ label, value }))
                    })()} />
      ) : filters.gubun === '집계' ? (
        <AsAggregateTable title="품질검사현황" period={reportPeriod(filters.dateFrom, filters.dateTo)} lines={aggLines}
                          value={{ agg1: filters.agg1, agg2: filters.agg2, codeIncl: filters.codeIncl }}
                          measures={MEASURES} blankZero={['부적격']} />
      ) : (
      <>
      <EcReportHead title="품질검사현황" period={reportPeriod(filters.dateFrom, filters.dateTo)} />
      <table className="w-full text-left">
        <thead>
          {/*
            원본 격자(2026-09-09 E040623 실측, 2026-10-04 다시 잼):
            <b>일자-No. · 검사방법 · 품목명[규격명] · 수량 · 시료 · 적격 · 부적격 · 합격여부</b>,
            달마다 '2026/10 계' 소계와 맨 끝 [합계].
          */}
          <tr>
            <th className="w-[34px]"></th>
            <th className="cursor-pointer text-center" onClick={() => sort.toggle('검사일자')}>일자-No. {sort.mark('검사일자')}</th>
            <th className="text-center">검사방법</th>
            <th>품목명[규격명]</th>
            <th className="text-right">수량</th>
            <th className="text-right">시료</th>
            <th className="text-right">적격</th>
            <th className="text-right">부적격</th>
            <th className="text-center">합격여부</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} className="ec-empty">불러오는 중…</td></tr>
          ) : listRows.length === 0 ? (
            <tr><td colSpan={9} className="text-center text-ec-hint p-[20px]">
              {rows.length === 0 ? '품질검사 내역이 없습니다.' : '검색조건에 맞는 자료가 없습니다.'}
            </td></tr>
          ) : listRows.flatMap((x, i) => {
            const out = [
              <tr key={x.key}>
                <td className="text-center text-ec-hint">{i + 1}</td>
                {/* 원본은 일자와 번호를 한 칸에 적는다(일별 · 월별은 날짜 · 달만). */}
                <td className="text-center">{x.dateCell}</td>
                <td className="text-center">{x.l.methodName}</td>
                <td>{x.l.itemName}{x.l.spec ? ` [${x.l.spec}]` : ''}</td>
                <td className="text-right">{qty2(x.qty)}</td>
                <td className="text-right">{qty2(x.sample)}</td>
                <td className="text-right">{qty2(x.good)}</td>
                <td className="text-right">{x.defect === 0 ? '' : qty2(x.defect)}</td>
                <td className="text-center">{x.l.passResultName}</td>
              </tr>,
            ]
            if (i === listRows.length - 1 || listRows[i + 1].month !== x.month) {
              const t = sumOf(listRows.filter((y) => y.month === x.month))
              out.push(
                <tr key={`${x.month}-계`} className="ec-list-total">
                  <td colSpan={4} className="text-center font-bold">{x.month.replace('-', '/')} 계</td>
                  <td className="text-right font-bold">{qty2(t.qty)}</td>
                  <td className="text-right font-bold">{qty2(t.sample)}</td>
                  <td className="text-right font-bold">{qty2(t.good)}</td>
                  <td className="text-right font-bold">{t.defect === 0 ? '' : qty2(t.defect)}</td>
                  <td></td>
                </tr>,
              )
            }
            return out
          })}
        </tbody>
        {listRows.length > 0 && (() => {
          const t = sumOf(listRows)
          return (
            <tfoot><tr className="ec-total">
              <td colSpan={4} className="text-center">합계</td>
              <td className="text-right">{qty2(t.qty)}</td>
              <td className="text-right">{qty2(t.sample)}</td>
              <td className="text-right">{qty2(t.good)}</td>
              <td className="text-right">{t.defect === 0 ? '' : qty2(t.defect)}</td>
              <td></td>
            </tr></tfoot>
          )
        })()}
      </table>
      <EcReportFoot />
      </>
      )}
    </EcListShell>
  )
}

/** 이카운트 Search 패널 — 검사일자/검사유형/품목/판정결과/검사자 */
function SearchPanel({
  draft, onChange, onApply, onReset, view, onViewChange,
}: {
  draft: Filters
  onChange: (patch: Partial<Filters>) => void
  onApply: () => void
  onReset: () => void
  /** 원본 [데이터 보기형식] — 조건 판 맨 끝이다. 셸을 안 쓰는 화면이라 여기 직접 그린다. */
  view: '표' | '그래프'
  onViewChange: (v: '표' | '그래프') => void
}) {
  const label: React.CSSProperties = {
    width: 90, fontSize: 12.5, color: 'var(--ec-text)', fontWeight: 600,
    display: 'flex', alignItems: 'center', paddingRight: 8,
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--ec-line-soft)',
  }
  return (
    <div
      onKeyDown={(e) => { if (e.key === 'Enter') onApply() }}
      style={{ border: '1px solid var(--ec-line)', borderRadius: 4, background: 'var(--ec-bg-page)', padding: '4px 14px 12px', marginBottom: 10 }}
    >
      {/* 원본 첫 줄 [구분] — ◉내역 ○집계, 내역이면 판 선택상자, 집계면 집계조건1 · 2 · [기타] 코드포함. */}
      <div style={rowStyle}>
        <span style={label}>구분</span>
        <div className="flex flex-wrap items-center gap-[8px]">
          {(['내역', '집계'] as const).map((g) => (
            <label key={g} className="inline-flex items-center gap-[3px]">
              <input type="radio" name="qs-gubun" checked={draft.gubun === g} onChange={() => onChange({ gubun: g })} /> {g}
            </label>
          ))}
          {draft.gubun === '내역' ? (
            <select className="ec-input w-[140px]" value={draft.form} onChange={(e) => onChange({ form: e.target.value as Form })}>
              {FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          ) : (
            <AsAggControls value={{ agg1: draft.agg1, agg2: draft.agg2, codeIncl: draft.codeIncl }} onChange={onChange} />
          )}
        </div>
      </div>
      <div style={rowStyle}>
        <span style={label}>기준일자</span>
        <input type="date" className="ec-input" value={draft.dateFrom}
          onChange={(e) => onChange({ dateFrom: e.target.value })} style={{ width: 150 }} />
        <span className="my-0 mx-[6px] text-ec-hint">~</span>
        <input type="date" className="ec-input" value={draft.dateTo}
          onChange={(e) => onChange({ dateTo: e.target.value })} style={{ width: 150 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={INQUIRY_PICKS} currentFrom={draft.dateFrom}
              onPick={(r) => onChange({ dateFrom: r.from, dateTo: r.to })} />
          </span>
      </div>
      {/*
        원본 차례(2026-09-08 실측, 서른둘): 구분 · 기준일자 · 품목 · <b>품목구분 ·
        품목그룹1</b> · (품목그룹2/3 · 품목계층그룹) · 창고 · (창고계층그룹) · 프로젝트 ·
        (프로젝트그룹1/2) · 출처(요청)구분 · (오더관리번호) · <b>규격</b> · 담당자 ·
        (거래처관리담당자) · <b>불량유형</b> · 검사유형 · (진행상태 · 출처(검사)구분) ·
        합격여부 · (검사방법) · <b>적요</b> · (최초작성자 · 최종수정자 · 양식) ·
        적용양식 · 양식구분 · 정렬/소계기준 · 데이터 보기형식.
        코드형·숫자형·문자형 검사항목 1~4 는 원본의 <b>사용자정의 칸</b>이라 실측 목록에
        안 넣었다(다른 화면의 문자형식1~5 와 같다).
      */}
      <div style={rowStyle}>
        <span style={label}>품목</span>
        <ItemSuggestInput field="name" value={draft.item} placeholder="품목명 일부"
                          onChange={(v) => onChange({ item: v })} width={220} />
      </div>
      <div style={rowStyle}>
        <span style={label}>품목구분</span>
        <input className="ec-input" placeholder="원재료·상품 …" value={draft.category}
          onChange={(e) => onChange({ category: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>품목그룹1</span>
        <input className="ec-input" placeholder="품목그룹1 이름" value={draft.itemGroup}
          onChange={(e) => onChange({ itemGroup: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        {/* 원본 품질검사현황 차례: 품목 · <b>창고 · 프로젝트</b> · 출처(요청)구분 */}
        <span style={label}>창고</span>
        <input className="ec-input" placeholder="창고명" value={draft.warehouse}
          onChange={(e) => onChange({ warehouse: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>프로젝트</span>
        <input className="ec-input" placeholder="프로젝트명" value={draft.project}
          onChange={(e) => onChange({ project: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>규격</span>
        <ItemSuggestInput field="spec" value={draft.spec} placeholder="규격 일부"
                          onChange={(v) => onChange({ spec: v })} width={220} />
      </div>
      {/* 원본은 검사자를 <b>[담당자]</b> 라 부른다 — 이름을 원본에 맞춘다. */}
      <div style={rowStyle}>
        <span style={label}>담당자</span>
        <input className="ec-input" placeholder="검사자명 일부" value={draft.inspector}
          onChange={(e) => onChange({ inspector: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>불량유형</span>
        <input className="ec-input" placeholder="불량유형 코드" value={draft.defectType}
          onChange={(e) => onChange({ defectType: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={rowStyle}>
        <span style={label}>검사유형</span>
        <select className="ec-input" value={draft.type}
          onChange={(e) => onChange({ type: e.target.value as Filters['type'] })} style={{ width: 150 }}>
          <option value="">전체</option>
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      <div style={rowStyle}>
        <span style={label}>진행상태</span>
        <select className="ec-input w-[150px]" value={draft.status}
          onChange={(e) => onChange({ status: e.target.value as Filters['status'] })}>
          <option value="">전체</option>
          <option value="IN_PROGRESS">진행중</option>
          <option value="COMPLETED">완료</option>
        </select>
      </div>
      {/* 원본 [합격여부] 후보 전체 · 해당없음 · 합격 · 불합격 — 2026-10-04 부터 검사 줄이 이 값을 든다. */}
      <div style={rowStyle}>
        <span style={label}>합격여부</span>
        <select className="ec-input" value={draft.result}
          onChange={(e) => onChange({ result: e.target.value as Filters['result'] })} style={{ width: 150 }}>
          <option value="">전체</option>
          {PASSES.map((r) => <option key={r} value={r}>{PASS_LABEL[r]}</option>)}
        </select>
      </div>
      <div style={rowStyle}>
        <span style={label}>검사방법</span>
        <select className="ec-input w-[150px]" value={draft.method}
          onChange={(e) => onChange({ method: e.target.value as Filters['method'] })}>
          <option value="">전체</option>
          <option value="FULL">전수</option>
          <option value="SAMPLING">샘플링</option>
        </select>
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>적요</span>
        <input className="ec-input" placeholder="적요 일부" value={draft.remark}
          onChange={(e) => onChange({ remark: e.target.value })} style={{ width: 220 }} />
      </div>
      <div style={{ ...rowStyle, borderBottom: 'none' }}>
        <span style={label}>데이터 보기형식</span>
        <div className="ec-pills">
          {(['표', '그래프'] as const).map((v) => (
            <button key={v} type="button" className={`ec-pill no-ec${view === v ? ' active' : ''}`}
                    onClick={() => onViewChange(v)}>{v}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-[6px] mt-[12px] justify-end">
        <button className="ec-btn" onClick={onReset}>초기화</button>
        <button className="ec-btn ec-btn-primary" onClick={onApply}>조회</button>
      </div>
    </div>
  )
}
