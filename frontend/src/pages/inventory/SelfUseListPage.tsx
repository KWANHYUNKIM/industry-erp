import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { SELF_USE_PICKS, periodOf } from '../../components/EcPeriodPicks'
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
 */
export default function SelfUseListPage() {
  const navigate = useNavigate()
  const pickers = useCondPickers(['warehouses', 'projects', 'items', 'employees'])
  const init = periodOf('최근30일(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [warehouse, setWarehouse] = useState('')
  const [project, setProject] = useState('')
  const [item, setItem] = useState('')
  const [rows, setRows] = useState<StockAdjustment[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await api.get<AdjustmentList>('/stock-adjustments', { params: { from, to, type: 'SELF_USE' } })
      setRows(r.data.rows)
      setTruncated(r.data.truncated)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const empName = useMemo(() => new Map(pickers.employees.map((e) => [(e as { id?: number }).id, e.name])), [pickers.employees])
  const shown = useMemo(() => rows
    .filter((r) => r.type === 'SELF_USE')
    .filter((r) => r.adjustDate >= from && r.adjustDate <= to)
    .filter((r) => !warehouse || String(r.warehouseId) === warehouse)
    .filter((r) => !project || String(r.projectId) === project)
    .filter((r) => !item || String(r.itemId) === item)
    .sort((a, b) => (a.adjustDate > b.adjustDate ? -1 : a.adjustDate < b.adjustDate ? 1 : b.adjustNo.localeCompare(a.adjustNo))),
  [rows, from, to, warehouse, project, item])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '자가사용조회', [shown.length])

  return (
    <EcListShell
      title="자가사용조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setWarehouse(''); setProject(''); setItem('') } },
        { label: '신규(F2)', onClick: () => navigate('/inventory/transfer') },
        { label: 'Excel' },
      ]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="기준일자">
          <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 145 }} />
          <span style={{ margin: '0 4px' }}>~</span>
          <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 145 }} />
          <span style={{ marginLeft: 6 }}>
            <EcPeriodPicks labels={SELF_USE_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
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
      </ul>

      {truncated && <p style={{ fontSize: 12, color: '#c07a00', marginBottom: 6 }}>자료가 많아 앞부분만 받았습니다 — 기간을 좁혀 보세요.</p>}
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ textAlign: 'center' }}>입력일자</th>
            <th>창고</th>
            <th>품목</th>
            <th style={{ textAlign: 'right' }}>수량</th>
            <th>담당자</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{dateText(r.adjustDate)} {r.adjustNo}</td>
              <td>{r.warehouseName}</td>
              <td>{r.itemName}{r.spec ? ` [${r.spec}]` : ''}</td>
              <td style={{ textAlign: 'right' }}>{Math.abs(Number(r.quantityChange)).toLocaleString('ko-KR')}</td>
              <td>{r.employeeId != null ? empName.get(r.employeeId) ?? '' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
