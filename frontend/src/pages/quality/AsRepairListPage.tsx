import { useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import EcPeriodPicks, { AS_REPAIR_LIST_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'

const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
/** 원본 날짜 모양 — 연도 두 자리(26/10/27-1, 2026-10-03 실측). */
const yy = (d: string | null) => (d ? `${d.slice(2, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}` : '')

interface AsRow {
  id: number; asNo: string; partnerId: number; partnerName: string; itemId: number; itemName: string; itemSpec: string | null
  receiptDate: string; title: string | null; charge: string | null
  status: 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED'
  doneDate: string | null; repairNote: string | null; updatedAt: string | null
}
interface ConsumptionLine { asNo: string; supplyAmount: number }
type Tab = '전체' | '진행중' | '완료'

/**
 * 재고 II &gt; A/S관리 &gt; A/S수리 &gt; <b>A/S수리조회</b>(E040606) — 2026-10-03 loginaa 실측(자료가 든 판).
 *
 * <p>조건: 기준일자(구간, 기본 <b>6개월(+1개월)</b> — 여섯 달 전 달의 1일 ~ 오늘+30일, 빠른선택 끝에 최근30일(+1개월) · 6개월(+1개월)) ·
 * 거래처 · 품목 · 기타(수정일자순) · 발송여부. 열: 수리번호 · 접수번호 · 거래처명 · 제목 · 수리내용 · 수리품목명 · 수리담당자명 · 금액 · 인쇄 ·
 * 생성한 전표. 위 탭 전체 · 확인 · 진행중 · 완료. 날짜는 연도 두 자리.
 *
 * <p>우리는 수리를 따로 전표로 두지 않고 A/S 한 건이 접수 → 처리중 → 완료로 넘어간다 — 처리중 · 완료인 A/S 가 수리다.
 * 수리번호의 날짜는 완료일(아직이면 접수일), 접수번호는 접수일 · A/S 번호. 금액은 그 A/S 에 쓴 부품의 공급가 합이다.
 * 확인 단계 · 발송 · 인쇄 · 생성한 전표는 우리 A/S 가 들지 않아 그 탭 · 조건 · 열이 없다.
 */
export default function AsRepairListPage() {
  const pickers = useCondPickers(['partners', 'items'])
  const init = periodOf('6개월(+1개월)')!
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partner, setPartner] = useState('')
  const [item, setItem] = useState('')
  const [byUpdated, setByUpdated] = useState(false)
  const [tab, setTab] = useState<Tab>('전체')
  const [rows, setRows] = useState<AsRow[]>([])
  const [used, setUsed] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [a, c] = await Promise.all([
        api.get<AsRow[]>('/as-requests', { params: { to } }),
        api.get<ConsumptionLine[]>('/as-requests/parts/consumption/lines', { params: { to } }),
      ])
      setRows(a.data)
      const m = new Map<string, number>()
      for (const l of c.data) m.set(l.asNo, (m.get(l.asNo) ?? 0) + Number(l.supplyAmount))
      setUsed(m)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const dayOf = (r: AsRow) => r.doneDate ?? r.receiptDate
  const shown = useMemo(() => rows
    .filter((r) => r.status === 'IN_PROGRESS' || r.status === 'COMPLETED')
    .filter((r) => dayOf(r) >= from && dayOf(r) <= to)
    .filter((r) => !partner || String(r.partnerId) === partner)
    .filter((r) => !item || String(r.itemId) === item)
    .filter((r) => tab === '전체' || (tab === '완료') === (r.status === 'COMPLETED'))
    .sort(byUpdated
      ? (a, b) => ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : (a.updatedAt ?? '') > (b.updatedAt ?? '') ? -1 : 0)
      : (a, b) => (dayOf(a) > dayOf(b) ? -1 : dayOf(a) < dayOf(b) ? 1 : b.asNo.localeCompare(a.asNo))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rows, from, to, partner, item, tab, byUpdated])
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, 'A/S수리조회', [shown.length])

  return (
    <EcListShell
      title="A/S수리조회"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: () => { setFrom(init.from); setTo(init.to); setPartner(''); setItem(''); setByUpdated(false) } },
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
            <EcPeriodPicks labels={AS_REPAIR_LIST_PICKS} currentFrom={from} onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
          </span>
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={220} emptyLabel="전체" value={partner} onChange={setPartner} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={220} emptyLabel="전체" value={item} onChange={setItem} items={pickers.items} />
        </EcCond>
        <EcCond label="기타">
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12.5 }}>
            <input type="checkbox" checked={byUpdated} onChange={(e) => setByUpdated(e.target.checked)} /> 수정일자순(정렬)
          </label>
        </EcCond>
      </ul>

      <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="no-ec" style={{
            padding: '5px 12px', fontSize: 12.5, border: '1px solid var(--ec-border)', cursor: 'pointer', borderRadius: 3,
            background: tab === t ? 'var(--ec-blue)' : '#fff', color: tab === t ? '#fff' : '#3a4453', fontWeight: tab === t ? 700 : 400,
          }}>{t}</button>
        ))}
      </div>
      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ textAlign: 'center' }}>수리번호</th>
            <th style={{ textAlign: 'center' }}>접수번호</th>
            <th>거래처명</th>
            <th>제목</th>
            <th>수리내용</th>
            <th>수리품목명</th>
            <th>수리담당자명</th>
            <th style={{ textAlign: 'right' }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{yy(dayOf(r))} {r.asNo}</td>
              <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{yy(r.receiptDate)} {r.asNo}</td>
              <td>{r.partnerName}</td>
              <td>{r.title ?? ''}</td>
              <td>{r.repairNote ?? ''}</td>
              <td>{r.itemName}{r.itemSpec ? ` [${r.itemSpec}]` : ''}</td>
              <td>{r.charge ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{won(used.get(r.asNo) ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
