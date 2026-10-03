import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { QUOTATION_PICKS, SELF_USE_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import type { StockAdjustment } from '../../types/api'

interface AdjustmentList { rows: StockAdjustment[]; totalRows: number; truncated: boolean }

/**
 * 재고 I &gt; 기타이동 &gt; 자가사용 &gt; <b>자가사용조회</b>(E040504) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>최근30일(+1개월)</b>, 빠른선택 금일 · 전일 · <b>말일</b> · … · 종료일 · 최근30일(+1개월)) ·
 * 창고 · 프로젝트 · 거래처 · 품목코드 · 발송여부. 열: 입력일자(일자-No.) · 거래처 · 창고 · 품목 · 수량 · 담당자 · 인쇄.
 * 버튼줄 신규(F2) · …. 위에 탭 전체 · 결재중 · 미확인 · 확인.
 *
 * <p>우리 자가사용은 <b>품목 하나짜리</b> 재고조정(type SELF_USE)이라 [품목]이 곧 그 품목이고 '외 n건' 요약이 없다.
 * 수량은 나간 수(증감의 절댓값)다. 자가사용은 거래처를 들지 않아 [거래처] 조건 · 열이 없고, 결재 · 확인 단계가 없어 탭도 없다.
 * [발송여부]는 전표를 메일로 보내지 않아 없다. [인쇄] 열은 전표 한 장을 찍는 자리인데 자가사용 인쇄 양식이 없다.
 *
 * <p><b>불량처리조회</b>(C000088) — 같은 날 실측. 조건: 기준일자(기본 최근30일(+1개월), 빠른선택에 [말일]이 없다) · 창고 · 프로젝트 ·
 * 품목코드 · 담당자 · 불량유형 · 처리방법(체크, 다 켜짐 — 원본 회사는 폐기 · 품목대체 · 정상사용) · 기타(수정일자순) · 최종수정자 · 발송여부.
 * 열: 입력일자 · 창고 · 품목 · 수량 · 처리방법 · 인쇄. [거래처]가 없다. 불량유형 · 처리방법 후보는 공통코드에서 가져온다.
 */
export default function StockMoveListPage({ kind }: { kind: 'SELF_USE' | 'DEFECT' }) {
  const selfUse = kind === 'SELF_USE'
  const title = selfUse ? '자가사용조회' : '불량처리조회'
  const navigate = useNavigate()
  const pickers = useCondPickers(['warehouses', 'projects', 'items', 'employees'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [item, setItem] = useState('')
  const [employee, setEmployee] = useState('')
  const [defectKind, setDefectKind] = useState('')
  /** 원본 [처리방법] 체크 — 끈 것만 담는다(공통코드 후보가 늘어도 처음엔 다 켜진 채다). */
  const [handlingOff, setHandlingOff] = useState<Set<string>>(new Set())
  const [codeGroups, setCodeGroups] = useState<{ name: string; codes: { name: string }[] }[]>([])
  const [rows, setRows] = useState<StockAdjustment[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [r, c] = await Promise.all([
        api.get<AdjustmentList>('/stock-adjustments', { params: { from, to, type: kind } }),
        api.get<{ name: string; codes: { name: string }[] }[]>('/codes').catch(() => ({ data: [] })),
      ])
      setRows(r.data.rows)
      setCodeGroups(c.data)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to, kind])

  const empName = useMemo(() => new Map(pickers.employees.map((e) => [(e as { id?: number }).id, e.name])), [pickers.employees])
  const shown = useMemo(() => rows
    .filter((r) => r.type === kind)
    .filter((r) => r.adjustDate >= from && r.adjustDate <= to)
    .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
    .filter((r) => !project || String(r.projectId) === project)
    .filter((r) => !item || String(r.itemId) === item)
    .filter((r) => !employee || (r.employeeId != null && empName.get(r.employeeId) === employee))
    .filter((r) => !defectKind || (r.kind ?? '') === defectKind)
    .filter((r) => selfUse || !handlingOff.has(r.handling ?? ''))
    .sort((a, b) => (a.adjustDate > b.adjustDate ? -1 : a.adjustDate < b.adjustDate ? 1 : b.adjustNo.localeCompare(a.adjustNo))),
  [rows, kind, selfUse, from, to, warehouse, project, item, employee, defectKind, handlingOff, empName])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, title, [shown.length])
  const codesOf = (g: string) => (codeGroups.find((x) => x.name === g)?.codes ?? []).map((c) => c.name)
  const handlings = codesOf('처리방법')

  return (
    <EcListShell
      title={title}
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setWarehouse(''); setProject(''); setItem(''); setEmployee(''); setDefectKind(''); setHandlingOff(new Set()) } },
        { label: '신규(F2)', onClick: () => navigate('/inventory/transfer') },
        { label: 'Excel' },
      ]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span className="my-0 mx-[4px]">~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span className="ml-[6px]">
            <EcPeriodPicks labels={selfUse ? SELF_USE_PICKS : QUOTATION_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={warehouse} onChange={setWarehouse} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={project} onChange={setProject} items={pickers.projects} />
        </EcCond>
        <EcCond label="품목코드" pick>
          <CodePickerField label="품목코드" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        {!selfUse && (
          <>
            <EcCond label="담당자" pick>
              <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체" value={employee} onChange={setEmployee} items={pickers.employees} />
            </EcCond>
            <EcCond label="불량유형">
              <select className="ec-input" value={defectKind} onChange={(e) => setDefectKind(e.target.value)} style={{ width: 140 }}>
                <option value="">전체</option>
                {codesOf('불량유형').map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </EcCond>
            <EcCond label="처리방법">
              <label className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
                <input type="checkbox" checked={handlingOff.size === 0} onChange={(e) => setHandlingOff(e.target.checked ? new Set() : new Set(['', ...handlings]))} /> 전체
              </label>
              {handlings.map((h) => (
                <label key={h} className="inline-flex items-center gap-[3px] mr-[10px] text-[12.5px]">
                  <input type="checkbox" checked={!handlingOff.has(h)}
                         onChange={(e) => setHandlingOff((s) => { const n = new Set(s); if (e.target.checked) n.delete(h); else n.add(h); return n })} /> {h}
                </label>
              ))}
            </EcCond>
          </>
        )}
      </ul>

      {truncated && <p className="text-[12px] text-ec-warn mb-[6px]">자료가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="text-center">입력일자</th>
            <th>창고</th>
            <th>품목</th>
            <th className="text-right">수량</th>
            {selfUse ? <th>담당자</th> : <th>처리방법</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td className="text-center">{dateText(r.adjustDate)} {r.adjustNo}</td>
              <td>{r.warehouseName}</td>
              <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
              <td className="text-right">{Math.abs(Number(r.quantityChange)).toLocaleString('ko-KR')}</td>
              {selfUse
                ? <td>{r.employeeId != null ? empName.get(r.employeeId) ?? '' : ''}</td>
                : <td>{r.handling ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
