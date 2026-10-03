import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { Link } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateNo } from '../../utils/dateNo'

/**
 * 재고 I &gt; 생산/외주 &gt; 외주비회계반영 &gt; <b>외주비일괄회계반영</b>.
 *
 * <p>원본 조건: 구분(거래처별·전표별) · 기준일자(전월) · 거래처 · 창고 · 품목 · 프로젝트 · 담당자 · 생산입고No.
 * 격자: 거래처명 · 거래가액 · 조정 · 외화금액 · 환율 · 공급가액 · 부가세 · 합계 · 상세 · 적요 · 회계전표No.,
 * 아래 [매입전표 I] 로 고른 묶음을 매입전표로 넘긴다(2026-10-02 loginaa 실측).
 *
 * <p>생산입고 I·II 의 [외주비합계]·[외주비부가세]가 자료다. 거래처는 생산된공장(외주 창고)의 외주거래처다.
 * 분개: 차) 외주가공비 · 부가세대급금 / 대) 외상매입금. 넘긴 생산입고는 반영을 취소해야 고칠 수 있다.
 * 조정·외화금액·환율은 외주비에 아직 없는 값이라 비워 둔다(원본도 원화 외주는 비어 있다).
 */

interface Row {
  productionId: number; prodNo: string; lineNo: number; productionDate: string
  productId: number; productCode: string; productName: string; producedQty: number
  unitPrice: number; amount: number; vat: number; total: number
  fromWarehouseId: number | null; fromWarehouseName: string | null
  partnerId: number | null; partnerName: string | null
  projectId: number | null; employeeId: number | null; note: string | null
  journalId: number | null; journalNo: string | null
}

const MODES = ['거래처별', '전표별'] as const
type Mode = (typeof MODES)[number]
const won = (n: number) => Number(n).toLocaleString('ko-KR')
const init = periodOf('전월')!

export default function SubcontractReflectionPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [mode, setMode] = useState<Mode>('거래처별')
  const [from, setFrom] = useState(init.from)
  const [to, setTo] = useState(init.to)
  const [partnerCond, setPartnerCond] = useState('')
  const [whCond, setWhCond] = useState('')
  const [itemCond, setItemCond] = useState('')
  const [projectCond, setProjectCond] = useState('')
  const [empCond, setEmpCond] = useState('')
  const [noCond, setNoCond] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<string>>(new Set())
  const pickers = useCondPickers(['partners', 'warehouses', 'items', 'projects', 'employees'])
  /** 담당자 코드도움은 이름을 담는다 — 줄에는 사원 id 만 있어 이름을 붙여 견준다. */
  const [employees, setEmployees] = useState<{ id: number; name: string }[]>([])
  useEffect(() => {
    api.get<{ id: number; name: string }[]>('/employees').then((r) => setEmployees(r.data)).catch(() => {})
  }, [])
  const empName = (id: number | null) => (id == null ? '' : employees.find((e) => e.id === id)?.name ?? '')
  /* 구분(거래처별·전표별)에 따라 칸이 하나 늘었다 줄었다 한다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '외주비일괄회계반영', [mode, rows.length])

  async function load() {
    setLoading(true); setError('')
    try {
      const r = await api.get<Row[]>('/accounting-reflection/subcontract', { params: { from, to } })
      setRows(r.data)
      setChecked(new Set())
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [from, to])

  const shown = rows.filter((r) => (!partnerCond || String(r.partnerId) === partnerCond)
    && (!whCond || String(r.fromWarehouseId) === whCond)
    && (!itemCond || String(r.productId) === itemCond)
    && (!projectCond || String(r.projectId) === projectCond)
    && (!empCond || empName(r.employeeId) === empCond)
    && (!noCond || r.prodNo.includes(noCond)))

  /** 묶음 — 거래처별이면 외주처, 전표별이면 생산입고 번호. 넘긴 것은 회계전표마다 따로 묶는다. */
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of shown) {
      const base = mode === '거래처별' ? `p${r.partnerId ?? '-'}` : `s${r.prodNo}|${r.partnerId ?? '-'}`
      const key = `${base}|${r.journalId ?? 'open'}`
      m.set(key, [...(m.get(key) ?? []), r])
    }
    return [...m.entries()].map(([key, rs]) => ({
      key, rows: rs,
      partnerName: rs[0].partnerName ?? '(외주거래처 없음)',
      supply: rs.reduce((n, r) => n + Number(r.amount), 0),
      vat: rs.reduce((n, r) => n + Number(r.vat), 0),
      journalNo: rs[0].journalNo,
      reflected: rs[0].journalId != null,
    }))
  }, [shown, mode])

  const picked = groups.filter((g) => checked.has(g.key))

  async function reflect() {
    setError(''); setOk('')
    const ids = picked.filter((g) => !g.reflected).flatMap((g) => g.rows.map((r) => r.productionId))
    if (ids.length === 0) return setError('매입전표로 넘길 미반영 줄을 고르세요.')
    try {
      const r = await api.post<{ count: number; journalNos: string[] }>('/accounting-reflection/subcontract/reflect', {
        productionIds: ids, groupBy: mode === '거래처별' ? 'PARTNER' : 'SLIP',
      })
      setOk(`매입전표 ${r.data.count}건 생성 · ${r.data.journalNos.join(', ')}`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function unreflect() {
    setError(''); setOk('')
    const ids = picked.filter((g) => g.reflected).flatMap((g) => g.rows.map((r) => r.productionId))
    if (ids.length === 0) return setError('반영을 취소할 줄(회계전표No. 가 있는 줄)을 고르세요.')
    try {
      const r = await api.post<{ count: number; journalNos: string[] }>('/accounting-reflection/subcontract/unreflect', { productionIds: ids })
      setOk(`반영취소 ${r.data.count}건 · ${r.data.journalNos.join(', ')} 삭제`)
      await load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const toggle = (set: Set<string>, k: string) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n }
  const sum = (f: (g: (typeof groups)[number]) => number) => groups.reduce((n, g) => n + f(g), 0)

  return (
    <EcListShell
      title="외주비일괄회계반영"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void load() },
        { label: '매입전표 I', onClick: () => void reflect() },
        { label: '반영취소', onClick: () => void unreflect() },
      ]}
    >
      <EcStatusPanel
        modes={MODES} mode={mode} onModeChange={(m) => { setMode(m as Mode); setChecked(new Set()) }}
        from={from} to={to} onPeriod={(r) => { setFrom(r.from); setTo(r.to) }}
        picks={INQUIRY_PICKS}
      >
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={170} emptyLabel="전체" value={partnerCond} onChange={setPartnerCond} items={pickers.partners} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={170} emptyLabel="전체" value={whCond} onChange={setWhCond} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={170} emptyLabel="전체" value={itemCond} onChange={setItemCond} items={pickers.items} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={170} emptyLabel="전체" value={projectCond} onChange={setProjectCond} items={pickers.projects} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={170} emptyLabel="전체" value={empCond} onChange={setEmpCond} items={pickers.employees} />
        </EcCond>
        <EcCond label="생산입고No.">
          <input className="ec-input" placeholder="생산입고No." value={noCond} onChange={(e) => setNoCond(e.target.value)} style={{ width: 170 }} />
        </EcCond>
      </EcStatusPanel>

      {error && <p className="mb-2 rounded bg-ec-danger-bg px-3 py-2 text-sm text-ec-danger">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[30px]">
              <input type="checkbox" checked={groups.length > 0 && checked.size === groups.length}
                     onChange={(e) => setChecked(e.target.checked ? new Set(groups.map((g) => g.key)) : new Set())} />
            </th>
            {mode === '전표별' && <th>생산입고No.</th>}
            <th>거래처명</th>
            <th className="text-right">거래가액</th>
            <th className="text-right">조정</th>
            <th className="text-right">외화금액</th>
            <th className="text-right">환율</th>
            <th className="text-right">공급가액</th>
            <th className="text-right">부가세</th>
            <th className="text-right">합계</th>
            <th className="text-center">상세</th>
            <th>적요</th>
            <th>회계전표No.</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={mode === '전표별' ? 13 : 12} className="ec-empty">불러오는 중…</td></tr>
          ) : groups.length === 0 ? (
            <tr><td colSpan={mode === '전표별' ? 13 : 12} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : groups.map((g) => (
            <Fragment key={g.key}>
              <tr>
                <td className="text-center">
                  <input type="checkbox" checked={checked.has(g.key)} onChange={() => setChecked((c) => toggle(c, g.key))} />
                </td>
                {mode === '전표별' && (
                  <td>
                    <Link to={`/production/receipt-bom?no=${encodeURIComponent(g.rows[0].prodNo)}`} style={{ color: 'var(--ec-blue)' }}>
                      {dateNo(g.rows[0].productionDate, g.rows[0].prodNo)}
                    </Link>
                  </td>
                )}
                <td>{g.partnerName}</td>
                <td className="text-right">{won(g.supply)}</td>
                <td className="text-right" />
                <td className="text-right" />
                <td className="text-right" />
                <td className="text-right">{won(g.supply)}</td>
                <td className="text-right">{won(g.vat)}</td>
                <td className="text-right font-bold">{won(g.supply + g.vat)}</td>
                <td className="text-center">
                  <button type="button" className="no-ec" style={{ color: 'var(--ec-blue)', background: 'none', border: 0, cursor: 'pointer' }}
                          onClick={() => setOpen((o) => toggle(o, g.key))}>{open.has(g.key) ? '접기' : `${g.rows.length}건`}</button>
                </td>
                <td>{g.rows[0].note ?? ''}</td>
                <td>{g.journalNo ?? ''}</td>
              </tr>
              {open.has(g.key) && g.rows.map((r) => (
                <tr key={r.productionId} className="bg-ec-page text-ec-label text-[12px]">
                  <td />
                  <td colSpan={mode === '전표별' ? 2 : 1}>
                    {dateNo(r.productionDate, r.prodNo)} · {r.productName} {won(r.producedQty)} × {won(r.unitPrice)}
                  </td>
                  <td className="text-right">{won(r.amount)}</td>
                  <td colSpan={3} />
                  <td className="text-right">{won(r.amount)}</td>
                  <td className="text-right">{won(r.vat)}</td>
                  <td className="text-right">{won(r.total)}</td>
                  <td colSpan={3}>{r.fromWarehouseName ?? ''}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={mode === '전표별' ? 3 : 2} className="text-right font-bold">합계</td>
            <td className="text-right font-bold">{won(sum((g) => g.supply))}</td>
            <td colSpan={3} />
            <td className="text-right font-bold">{won(sum((g) => g.supply))}</td>
            <td className="text-right font-bold">{won(sum((g) => g.vat))}</td>
            <td className="text-right font-bold">{won(sum((g) => g.supply + g.vat))}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </EcListShell>
  )
}
