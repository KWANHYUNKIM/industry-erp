import { useRef } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { EcReportHead, EcReportFoot, reportDate } from '../../components/EcReportFrame'
import { weekOfYear } from '../../utils/statusAggregate'

/**
 * A/S접수현황(E040610) · A/S수리현황(E040611)의 <b>○집계</b> — 두 화면이 같은 판이다(2026-10-04 loginaa 실측).
 *
 * <ul>
 *   <li>[집계조건] 창의 후보: 기준일자(일별 · 주차별 · 월별 · 분기별 · 반기별 · 연별) · A/S(담당자 · 창고 · 관리항목) ·
 *       거래처(거래처 · 거래처그룹1 · 2) · 품목(품목명[규격] · 품목그룹1 · 2 · 3) · 프로젝트(프로젝트 · 그룹1 · 2).
 *       고른 이름이 곧 열 머리다(담당자 → [담당자 | 수량]).</li>
 *   <li>조건 없이 검색하면 "집계조건은 1개 이상 선택해야 합니다.".</li>
 *   <li>[코드포함] — 코드가 있는 축은 이름 앞에 '&lt;이름&gt;코드' 열(창고코드 · 품목명[규격]코드).</li>
 *   <li>조건2 가 있으면 조건1 칸은 묶음 첫 줄에만 적고, 묶음 끝에 '&lt;이름&gt; 계' 소계, 맨 끝 [합계].</li>
 *   <li>품목 이름은 규격 앞에 한 칸을 띄운다('익스트림 울트라 명품 조립PC [1EA]').</li>
 *   <li>출력물 머리글은 'A/S…현황'(내역 판은 'AS…현황'), 꼬리에 [P.1] 이 없다.</li>
 *   <li>품질검사현황(E040623)도 같은 판이고 값 열이 넷이다 — [수량 · 시료 · 적격 · 부적격](2026-10-04 실측).
 *       그래서 값 열은 <code>measures</code> 로 받는다(기본 [수량]).</li>
 *   <li>품질검사현황 [기타] <b>비율표시</b>(2026-10-13 실측) — 값 열마다 바로 뒤에 '<b>수량비율</b>' 같은 열, 값 = 합계 대비 % 를
 *       반올림한 정수(인텔 40/60 → 67, MSI 20/60 → 33, 부적격 1/2 → 50), 합계 줄은 100. <code>ratio</code> 로 켠다.</li>
 *   <li>품질검사현황 [비교기간](2026-10-13 실측, 품목명[규격] · 전월동일기간) — 이름 열은 머리 두 줄을 묶고(rowspan 2),
 *       값 열이 구간마다 한 벌씩: 첫 줄 '2026/10/01 ~ 2026/10/13' | '2026/09/01 ~ 2026/09/13', 둘째 줄 값 이름 두 번.
 *       조건에 기준일자 축이 있으면 "집계조건 기준일자, 시간순정렬시 비교기간은 사용할 수 없습니다.". <code>compare</code> 로 켠다.</li>
 *   <li>품질검사현황 <b>집계조건 3~5</b>(2026-10-13 실측) — 조건 칸은 채운 수 + 2 개까지 열린다(처음 1 · 2, 1 을 고르면 3,
 *       3 을 고르면 4 · 5). 담당자 · 창고 · 품목명[규격] · 월별 넷이면 줄은 [정재원 | | 인텔… | 2026/10], 그다음
 *       '인텔… 계'(마지막 조건 앞까지의 무리마다 소계, 깊은 것부터), 창고가 빈 무리는 '[] 계', '정재원 계', [합계].
 *       소계 줄 다음 줄은 앞 칸을 다시 적는다(정재원이 두 번 나온다) — 바로 앞 줄과 같은 앞 칸만 비운다.
 *       기준일자 축은 굵은 것부터만 — 월별 뒤에 연별을 고르면 "집계조건은 연별-반기별-분기별-월별-주차별-일별 순서로만
 *       입력가능합니다.". [가로보기] 는 '집계대상에서 가로보기 대상을 선택바랍니다.' 만 확인했다(대상 창을 못 열어 아직 없다).</li>
 * </ul>
 */
export const AS_AGG_KEYS = ['일별', '주차별', '월별', '분기별', '반기별', '연별', '담당자', '창고', '관리항목',
  '거래처', '거래처그룹1', '품목명[규격]', '품목그룹1', '프로젝트'] as const
/**
 * 기타이동현황(불량처리 · 대체사용 · 폐기)의 집계조건창에는 [불량] 묶음 맨 앞에 <b>불량유형</b>이 더 있다
 * (2026-10-12 불량처리현황 E040509 실측). A/S 후보에는 없으므로 AS_AGG_KEYS 에 넣지 않고 형만 넓힌다.
 */
export type AsAggKey = (typeof AS_AGG_KEYS)[number] | '불량유형'

/** 집계가 읽는 줄 하나 — 화면마다 응답 모양이 달라 이 모양으로 옮겨 넘긴다. [이름, 코드]. */
export interface AsAggLine {
  date: string
  charge: string
  warehouse: [string, string]
  mgmt: string
  partner: [string, string]
  partnerGroup: string
  itemName: string; itemSpec: string | null; itemCode: string
  itemGroup: string
  project: [string, string]
  qty: number
  /** [불량유형] — 기타이동현황만 채운다. */
  kind?: string
  /** 값 열이 여럿인 화면(품질검사현황)의 값 — <code>measures</code> 와 같은 차례. 없으면 [qty]. */
  vals?: number[]
}

const CODED: AsAggKey[] = ['창고', '거래처', '품목명[규격]', '프로젝트']

function axis(k: AsAggKey, x: AsAggLine): [string, string] {
  const d = x.date
  const y = d.slice(0, 4), mo = Number(d.slice(5, 7))
  switch (k) {
    case '일별': return [reportDate(d), '']
    case '주차별': return [`${y}년 ${weekOfYear(d)}주`, '']
    case '월별': return [reportDate(d).slice(0, 7), '']
    case '분기별': return [`${y} ${Math.floor((mo - 1) / 3) + 1}분기`, '']
    case '반기별': return [`${y} ${mo <= 6 ? '상' : '하'}반기`, '']
    case '연별': return [y, '']
    case '담당자': return [x.charge, '']
    case '창고': return x.warehouse
    case '관리항목': return [x.mgmt, '']
    case '거래처': return x.partner
    case '거래처그룹1': return [x.partnerGroup, '']
    case '품목명[규격]': return [x.itemName + (x.itemSpec ? ` [${x.itemSpec}]` : ''), x.itemCode]
    case '품목그룹1': return [x.itemGroup, '']
    case '프로젝트': return x.project
    case '불량유형': return [x.kind ?? '', '']
  }
}

const qty2 = (n: number) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export interface AsAggValue {
  agg1: AsAggKey | ''; agg2: AsAggKey | ''; codeIncl: boolean
  /** 집계조건 3 · 4 · 5(원본 품질검사현황은 다섯까지 연다). */
  more?: (AsAggKey | '')[]
}

/** 고른 집계조건을 차례대로 — 빈 칸에서 끊는다. */
export const aggKeys = (v: AsAggValue): AsAggKey[] => {
  const all = [v.agg1, v.agg2, ...(v.more ?? [])]
  const out: AsAggKey[] = []
  for (const k of all) { if (!k) break; out.push(k) }
  return out
}

/** 기준일자 축의 굵기 — 연별이 가장 굵다. 뒤 조건이 앞 조건보다 굵으면 원본이 막는다. */
const DATE_RANK: Partial<Record<AsAggKey, number>> = { 연별: 0, 반기별: 1, 분기별: 2, 월별: 3, 주차별: 4, 일별: 5 }
const DATE_ORDER_MSG = '집계조건은 연별-반기별-분기별-월별-주차별-일별 순서로만 입력가능합니다.'
const MAX_AGG = 5

/** 조건 판의 [구분] ○집계 쪽 — 집계조건1 ~ 5(채운 수 + 2 칸까지) · [기타] 코드포함. */
export function AsAggControls({ value, onChange, keys = AS_AGG_KEYS }: {
  value: AsAggValue; onChange: (patch: Partial<AsAggValue>) => void; keys?: readonly AsAggKey[]
}) {
  const all: (AsAggKey | '')[] = [value.agg1, value.agg2, ...(value.more ?? [])]
  const filled = aggKeys(value).length
  const shown = Math.min(MAX_AGG, filled + 2)
  function set(i: number, k: AsAggKey | '') {
    const next = [...all]
    while (next.length < MAX_AGG) next.push('')
    const prevDates = next.slice(0, i).filter((x): x is AsAggKey => !!x && DATE_RANK[x] != null)
    if (k && DATE_RANK[k] != null && prevDates.some((d) => (DATE_RANK[d] ?? 0) > (DATE_RANK[k] ?? 0))) {
      window.alert(DATE_ORDER_MSG)
      return
    }
    next[i] = k
    /* 가운데를 비우면 뒤는 끊긴다 — 원본도 빈 칸 뒤 조건은 보지 않는다. */
    onChange({ agg1: next[0], agg2: next[1], more: next.slice(2) })
  }
  return (<>
    {Array.from({ length: shown }, (_, i) => (
      <span key={i} className="contents">
        집계조건{i + 1}
        <select className="ec-input w-[120px]" aria-label={`집계조건${i + 1}`} value={all[i] ?? ''} onChange={(e) => set(i, e.target.value as AsAggKey | '')}>
          <option value=""></option>
          {keys.filter((k) => k === all[i] || !all.includes(k)).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </span>
    ))}
    <label className="inline-flex items-center gap-[3px]">
      <input type="checkbox" checked={value.codeIncl} onChange={(e) => onChange({ codeIncl: e.target.checked })} /> 코드포함
    </label>
  </>)
}

/** ○집계 판 — 머리글 · 표 · 꼬리. */
const DATE_KEYS: AsAggKey[] = ['일별', '주차별', '월별', '분기별', '반기별', '연별']

export function AsAggregateTable({ title, period, lines, value, measures = ['수량'], blankZero = [], formats = {}, ratio = false, compare }: {
  title: string; period: string; lines: AsAggLine[]; value: AsAggValue
  /** [기타] 비율표시 — 값 열마다 '…비율'(합계 대비 %, 반올림 정수). */
  ratio?: boolean
  /** [비교기간] — 비교 구간의 줄과 두 구간 이름. 주면 값 열이 구간마다 한 벌씩 선다. */
  compare?: { period: string; lines: AsAggLine[] }
  /** 값 열 이름(기본 [수량]). */
  measures?: string[]
  /** 0 이면 빈칸으로 두는 값 열 — 원본 품질검사현황의 [부적격]. */
  blankZero?: string[]
  /** 값 열마다 다른 숫자 꼴 — Invoice/Packing List Status 의 [공급가액]은 소수 없이 찍는다(기본은 소수 두 자리). */
  formats?: Record<string, (n: number) => string>
}) {
  const { codeIncl } = value
  const keys = aggKeys(value)
  const agg1 = keys[0] ?? ''
  const valsOf = (x: AsAggLine) => x.vals ?? [x.qty]
  type Row = { ns: string[]; cs: string[]; v: number[]; p: number[]; hasV: boolean; hasP: boolean }
  const m = new Map<string, Row>()
  if (keys.length) {
    const add = (x: AsAggLine, side: 'v' | 'p') => {
      const ax = keys.map((k) => axis(k, x))
      const ns = ax.map((a) => a[0]); const cs = ax.map((a) => a[1])
      const k = ns.join('␟')
      const cur = m.get(k) ?? { ns, cs, v: measures.map(() => 0), p: measures.map(() => 0), hasV: false, hasP: false }
      valsOf(x).forEach((n, i) => { cur[side][i] += n })
      if (side === 'v') cur.hasV = true; else cur.hasP = true
      m.set(k, cur)
    }
    for (const x of lines) add(x, 'v')
    for (const x of compare?.lines ?? []) add(x, 'p')
  }
  const sum = (rs: { v: number[] }[]) => measures.map((_, i) => rs.reduce((n, r) => n + r.v[i], 0))
  const cell = (n: number, i: number) => (blankZero.includes(measures[i]) && n === 0 ? '' : (formats[measures[i]] ?? qty2)(n))
  /** 비교 쪽에만 있는 줄은 지금 쪽 값 칸이 빈칸 — 반대도 같다. */
  const cellIf = (has: boolean, n: number, i: number) => (has ? cell(n, i) : '')
  const pct = (n: number, t: number) => (t === 0 ? '' : String(Math.round((n / t) * 100)))
  const dateAxis = !!compare && keys.some((k) => DATE_KEYS.includes(k))
  /* 차례는 코드순(코드가 없으면 이름) — 원본 정렬 선택상자의 기본값. */
  const key = (n: string, c: string) => c || n
  const rows = [...m.values()].sort((a, b) => {
    for (let j = 0; j < keys.length; j++) {
      const d = key(a.ns[j], a.cs[j]).localeCompare(key(b.ns[j], b.cs[j]), 'ko')
      if (d) return d
    }
    return 0
  })
  const head = (k: AsAggKey) => [...(codeIncl && CODED.includes(k) ? [`${k}코드`] : []), k]
  const cellsOf = (n: string, c: string, k: AsAggKey) => [...(codeIncl && CODED.includes(k) ? [c] : []), n]
  const cols = keys.flatMap(head)
  const total = sum(lines.map((x) => ({ v: valsOf(x) })))
  const ptotal = sum((compare?.lines ?? []).map((x) => ({ v: valsOf(x) })))
  const showRatio = ratio && !compare
  /** 두 줄이 처음 갈리는 조건 차례. */
  const diffAt = (a: Row, b: Row) => { let j = 0; while (j < keys.length && a.ns[j] === b.ns[j]) j++; return j }
  /* 값 칸 한 벌 — 비율표시면 값마다 비율이 뒤따른다. */
  const valCells = (v: number[], has: boolean, tot: number[], keyp: string, bold = false) => v.flatMap((n, j) => [
    <td key={`${keyp}${j}`} className={`text-right${bold ? ' font-bold' : ''}`}>{cellIf(has, n, j)}</td>,
    ...(showRatio ? [<td key={`${keyp}r${j}`} className={`text-right${bold ? ' font-bold' : ''}`}>{has ? pct(n, tot[j]) : ''}</td>] : []),
  ])
  const valHeads = (keyp: string) => measures.flatMap((h) => [
    <th key={`${keyp}${h}`} className="text-right">{h}</th>,
    ...(showRatio ? [<th key={`${keyp}${h}비율`} className="text-right">{h}비율</th>] : []),
  ])
  /* 조건 수 · 코드포함에 따라 열이 는다 — 렌더된 표를 직접 잰다. */
  const ref = useRef<HTMLTableElement>(null)
  useTableColumnCheck(ref, `${title} 집계`, [keys.join(','), codeIncl, rows.length, showRatio, !!compare])
  return (
    <>
      <EcReportHead title={title} period={period} />
      {!agg1 ? (
        <p className="ec-alert ec-alert-danger">집계조건은 1개 이상 선택해야 합니다.</p>
      ) : dateAxis ? (
        <p className="ec-alert ec-alert-danger">집계조건 기준일자, 시간순정렬시 비교기간은 사용할 수 없습니다.</p>
      ) : (
        <table ref={ref} className="w-full text-left">
          <thead>
            {compare ? (<>
              <tr>
                {cols.map((h) => <th key={h} rowSpan={2}>{h}</th>)}
                <th colSpan={measures.length} className="text-center">{period}</th>
                <th colSpan={measures.length} className="text-center">{compare.period}</th>
              </tr>
              <tr>{valHeads('c')}{valHeads('p')}</tr>
            </>) : (
              <tr>
                {cols.map((h) => <th key={h}>{h}</th>)}
                {valHeads('c')}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length + measures.length * (compare ? 2 : showRatio ? 2 : 1)} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.flatMap((g, i) => {
              /*
               * 앞 칸을 비우는 것은 바로 앞 줄과 같은 앞 조건뿐이다. 그 사이에 소계 줄이 끼면(앞 줄과 마지막 조건 앞에서
               * 갈림) 다시 다 적는다 — 원본 네 조건 판에서 '정재원' 이 소계 다음 줄에 또 나왔다.
               */
              const d = i === 0 ? 0 : diffAt(rows[i - 1], g)
              const showFrom = d <= keys.length - 2 ? 0 : d
              const next = rows[i + 1]
              const nd = next ? diffAt(g, next) : 0
              const out = [
                <tr key={g.ns.join('␟')}>
                  {keys.flatMap((k, j) => cellsOf(g.ns[j], g.cs[j], k).map((v, q) => <td key={`${j}-${q}`}>{j >= showFrom ? v : ''}</td>))}
                  {valCells(g.v, g.hasV, total, 'v')}
                  {compare && valCells(g.p, g.hasP, ptotal, 'p')}
                </tr>,
              ]
              /* 마지막 조건 앞까지 — 끝난 무리마다 깊은 것부터 소계. 이름이 빈 무리는 '[] 계'(원본 창고 빈 칸). */
              for (let L = keys.length - 2; L >= 0; L--) {
                if (next && nd > L) continue
                const grp = rows.filter((x) => x.ns.slice(0, L + 1).join('␟') === g.ns.slice(0, L + 1).join('␟'))
                out.push(
                  <tr key={`${g.ns.slice(0, L + 1).join('␟')}␟계${L}`} className="ec-list-total">
                    <td colSpan={cols.length} className="text-center font-bold">{g.ns[L] || '[]'} 계</td>
                    {valCells(sum(grp), grp.some((x) => x.hasV), total, 's', true)}
                    {compare && valCells(sum(grp.map((x) => ({ v: x.p }))), grp.some((x) => x.hasP), ptotal, 'sp', true)}
                  </tr>,
                )
              }
              return out
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr className="ec-total">
              <td colSpan={cols.length} className="text-center">합계</td>
              {total.flatMap((n, j) => [
                <td key={`t${j}`} className="text-right">{cell(n, j)}</td>,
                ...(showRatio ? [<td key={`tr${j}`} className="text-right">{pct(n, n)}</td>] : []),
              ])}
              {compare && ptotal.map((n, j) => <td key={`pt${j}`} className="text-right">{cell(n, j)}</td>)}
            </tr></tfoot>
          )}
        </table>
      )}
      <EcReportFoot page={false} />
    </>
  )
}
