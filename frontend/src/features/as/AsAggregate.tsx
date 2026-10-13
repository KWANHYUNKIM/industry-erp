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

export interface AsAggValue { agg1: AsAggKey | ''; agg2: AsAggKey | ''; codeIncl: boolean }

/** 조건 판의 [구분] ○집계 쪽 — 집계조건1 · 2 · [기타] 코드포함. */
export function AsAggControls({ value, onChange, keys = AS_AGG_KEYS }: {
  value: AsAggValue; onChange: (patch: Partial<AsAggValue>) => void; keys?: readonly AsAggKey[]
}) {
  return (<>
    집계조건1
    <select className="ec-input w-[120px]" value={value.agg1} onChange={(e) => onChange({ agg1: e.target.value as AsAggKey | '' })}>
      <option value=""></option>
      {keys.map((k) => <option key={k} value={k}>{k}</option>)}
    </select>
    집계조건2
    <select className="ec-input w-[120px]" value={value.agg2} onChange={(e) => onChange({ agg2: e.target.value as AsAggKey | '' })}>
      <option value=""></option>
      {keys.filter((k) => k !== value.agg1).map((k) => <option key={k} value={k}>{k}</option>)}
    </select>
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
  const { agg1, agg2, codeIncl } = value
  const valsOf = (x: AsAggLine) => x.vals ?? [x.qty]
  type Row = { n1: string; c1: string; n2: string; c2: string; v: number[]; p: number[]; hasV: boolean; hasP: boolean }
  const m = new Map<string, Row>()
  if (agg1) {
    const add = (x: AsAggLine, side: 'v' | 'p') => {
      const [n1, c1] = axis(agg1, x)
      const [n2, c2] = agg2 ? axis(agg2, x) : ['', '']
      const k = `${n1}␟${n2}`
      const cur = m.get(k) ?? { n1, c1, n2, c2, v: measures.map(() => 0), p: measures.map(() => 0), hasV: false, hasP: false }
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
  const dateAxis = !!compare && [agg1, agg2].some((k) => k && DATE_KEYS.includes(k))
  /* 차례는 코드순(코드가 없으면 이름) — 원본 정렬 선택상자의 기본값. */
  const key = (n: string, c: string) => c || n
  const rows = [...m.values()].sort((a, b) => key(a.n1, a.c1).localeCompare(key(b.n1, b.c1), 'ko') || key(a.n2, a.c2).localeCompare(key(b.n2, b.c2), 'ko'))
  const head = (k: AsAggKey | '') => (k ? [...(codeIncl && CODED.includes(k) ? [`${k}코드`] : []), k] : [])
  const cells = (n: string, c: string, k: AsAggKey | '') => (k ? [...(codeIncl && CODED.includes(k) ? [c] : []), n] : [])
  const cols = [...head(agg1), ...head(agg2)]
  const total = sum(lines.map((x) => ({ v: valsOf(x) })))
  const ptotal = sum((compare?.lines ?? []).map((x) => ({ v: valsOf(x) })))
  const showRatio = ratio && !compare
  /* 값 칸 한 벌 — 비율표시면 값마다 비율이 뒤따른다. */
  const valCells = (v: number[], has: boolean, tot: number[], keyp: string, bold = false) => v.flatMap((n, j) => [
    <td key={`${keyp}${j}`} className={`text-right${bold ? ' font-bold' : ''}`}>{cellIf(has, n, j)}</td>,
    ...(showRatio ? [<td key={`${keyp}r${j}`} className={`text-right${bold ? ' font-bold' : ''}`}>{has ? pct(n, tot[j]) : ''}</td>] : []),
  ])
  const valHeads = (keyp: string) => measures.flatMap((h) => [
    <th key={`${keyp}${h}`} className="text-right">{h}</th>,
    ...(showRatio ? [<th key={`${keyp}${h}비율`} className="text-right">{h}비율</th>] : []),
  ])
  /* 조건2 · 코드포함에 따라 열이 는다 — 렌더된 표를 직접 잰다. */
  const ref = useRef<HTMLTableElement>(null)
  useTableColumnCheck(ref, `${title} 집계`, [agg1, agg2, codeIncl, rows.length, showRatio, !!compare])
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
              const first = i === 0 || rows[i - 1].n1 !== g.n1
              const last = i === rows.length - 1 || rows[i + 1].n1 !== g.n1
              const grp = rows.filter((x) => x.n1 === g.n1)
              const out = [
                <tr key={`${g.n1}␟${g.n2}`}>
                  {cells(g.n1, g.c1, agg1).map((v, j) => <td key={j}>{!agg2 || first ? v : ''}</td>)}
                  {cells(g.n2, g.c2, agg2).map((v, j) => <td key={`b${j}`}>{v}</td>)}
                  {valCells(g.v, g.hasV, total, 'v')}
                  {compare && valCells(g.p, g.hasP, ptotal, 'p')}
                </tr>,
              ]
              if (agg2 && last) {
                out.push(
                  <tr key={`${g.n1}␟계`} className="ec-list-total">
                    <td colSpan={cols.length} className="text-center font-bold">{g.n1} 계</td>
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
