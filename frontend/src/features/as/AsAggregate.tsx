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
 * </ul>
 */
export const AS_AGG_KEYS = ['일별', '주차별', '월별', '분기별', '반기별', '연별', '담당자', '창고', '관리항목',
  '거래처', '거래처그룹1', '품목명[규격]', '품목그룹1', '프로젝트'] as const
export type AsAggKey = (typeof AS_AGG_KEYS)[number]

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
export function AsAggregateTable({ title, period, lines, value, measures = ['수량'], blankZero = [], formats = {} }: {
  title: string; period: string; lines: AsAggLine[]; value: AsAggValue
  /** 값 열 이름(기본 [수량]). */
  measures?: string[]
  /** 0 이면 빈칸으로 두는 값 열 — 원본 품질검사현황의 [부적격]. */
  blankZero?: string[]
  /** 값 열마다 다른 숫자 꼴 — Invoice/Packing List Status 의 [공급가액]은 소수 없이 찍는다(기본은 소수 두 자리). */
  formats?: Record<string, (n: number) => string>
}) {
  const { agg1, agg2, codeIncl } = value
  const valsOf = (x: AsAggLine) => x.vals ?? [x.qty]
  const m = new Map<string, { n1: string; c1: string; n2: string; c2: string; v: number[] }>()
  if (agg1) {
    for (const x of lines) {
      const [n1, c1] = axis(agg1, x)
      const [n2, c2] = agg2 ? axis(agg2, x) : ['', '']
      const k = `${n1}␟${n2}`
      const cur = m.get(k) ?? { n1, c1, n2, c2, v: measures.map(() => 0) }
      valsOf(x).forEach((n, i) => { cur.v[i] += n })
      m.set(k, cur)
    }
  }
  const sum = (rs: { v: number[] }[]) => measures.map((_, i) => rs.reduce((n, r) => n + r.v[i], 0))
  const cell = (n: number, i: number) => (blankZero.includes(measures[i]) && n === 0 ? '' : (formats[measures[i]] ?? qty2)(n))
  /* 차례는 코드순(코드가 없으면 이름) — 원본 정렬 선택상자의 기본값. */
  const key = (n: string, c: string) => c || n
  const rows = [...m.values()].sort((a, b) => key(a.n1, a.c1).localeCompare(key(b.n1, b.c1), 'ko') || key(a.n2, a.c2).localeCompare(key(b.n2, b.c2), 'ko'))
  const head = (k: AsAggKey | '') => (k ? [...(codeIncl && CODED.includes(k) ? [`${k}코드`] : []), k] : [])
  const cells = (n: string, c: string, k: AsAggKey | '') => (k ? [...(codeIncl && CODED.includes(k) ? [c] : []), n] : [])
  const cols = [...head(agg1), ...head(agg2)]
  const total = sum(lines.map((x) => ({ v: valsOf(x) })))
  /* 조건2 · 코드포함에 따라 열이 는다 — 렌더된 표를 직접 잰다. */
  const ref = useRef<HTMLTableElement>(null)
  useTableColumnCheck(ref, `${title} 집계`, [agg1, agg2, codeIncl, rows.length])
  return (
    <>
      <EcReportHead title={title} period={period} />
      {!agg1 ? (
        <p className="ec-alert ec-alert-danger">집계조건은 1개 이상 선택해야 합니다.</p>
      ) : (
        <table ref={ref} className="w-full text-left">
          <thead><tr>
            {cols.map((h) => <th key={h}>{h}</th>)}
            {measures.map((h) => <th key={h} className="text-right">{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length + measures.length} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : rows.flatMap((g, i) => {
              const first = i === 0 || rows[i - 1].n1 !== g.n1
              const last = i === rows.length - 1 || rows[i + 1].n1 !== g.n1
              const out = [
                <tr key={`${g.n1}␟${g.n2}`}>
                  {cells(g.n1, g.c1, agg1).map((v, j) => <td key={j}>{!agg2 || first ? v : ''}</td>)}
                  {cells(g.n2, g.c2, agg2).map((v, j) => <td key={`b${j}`}>{v}</td>)}
                  {g.v.map((n, j) => <td key={`v${j}`} className="text-right">{cell(n, j)}</td>)}
                </tr>,
              ]
              if (agg2 && last) {
                out.push(
                  <tr key={`${g.n1}␟계`} className="ec-list-total">
                    <td colSpan={cols.length} className="text-center font-bold">{g.n1} 계</td>
                    {sum(rows.filter((x) => x.n1 === g.n1)).map((n, j) => <td key={`s${j}`} className="text-right font-bold">{cell(n, j)}</td>)}
                  </tr>,
                )
              }
              return out
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot><tr className="ec-total">
              <td colSpan={cols.length} className="text-center">합계</td>
              {total.map((n, j) => <td key={`t${j}`} className="text-right">{cell(n, j)}</td>)}
            </tr></tfoot>
          )}
        </table>
      )}
      <EcReportFoot page={false} />
    </>
  )
}
