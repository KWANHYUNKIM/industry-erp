import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import EcStatusPanel, { EcCond } from '../../components/EcStatusPanel'
import { INQUIRY_PICKS, periodOf } from '../../components/EcPeriodPicks'
import CodePickerField from '../../components/CodePickerField'
import { useCondPickers } from '../../utils/useCondPickers'
import { dateText } from '../../utils/dateText'
import AccountingReflectionPage from './AccountingReflectionPage'

/**
 * 판매일괄회계반영 (원본 E040215, 2026-10-22 loginaa 실측 — plans/재고1.md 97행).
 * 구매일괄회계반영 · 회계미반영현황은 AccountingReflectionPage 가 그대로 맡는다(구매 쪽 원본 값은 아직 모른다).
 *
 * 조건: 구분(거래처별 기본/전표별) · 기준일자(전월) · 창고 · 거래처 · 품목 · 프로젝트 · 담당자 · 거래처관리담당자 ·
 * 거래유형 · 부가세율 적용 · 내.외자구분(내자 기본) · 거래구분(전체 기본) · 거래처코드없는자료인쇄.
 * 격자: 체크 · 거래일자 · 거래처명 · 거래가액 · 조정 · 공급가액 · 부가세 · 합계 · 품목요약 · 부가세유형 · 일부반영 + 합계 줄.
 */
interface Slip {
  id: number
  docNo: string
  slipDate: string
  partnerId: number
  partnerName: string
  warehouseId: number | null
  projectId: number | null
  employeeName: string | null
  partnerManager: string | null
  itemSummary: string
  lines: { itemId: number }[]
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  vatType: string
  tradeKind: string
  reflected: boolean
}

interface Row {
  key: string
  date: string
  partnerId: number
  partnerName: string
  ids: number[]
  supply: number
  vat: number
  items: string
  vatTypes: Set<string>
  partial: boolean
}

const SALES_VAT_TYPES = ['세금계산서', '영세율', '계산서', '소매매출', '수출', '카드매출', '계산서(고정자산)', '세.계(고정자산)',
  '소매(면세)', '카드매출(면세)', '현금영수증(면세)', '현금영수증', '매입자발행세금계산서', '영세율(기타)', '기타매출']
const vatOptions = SALES_VAT_TYPES.map((v) => <option key={v} value={v}>{v}</option>)
const won = (n: number) => n.toLocaleString('ko-KR')
const initP = periodOf('전월')!

function Pills<T extends string>({ values, value, onChange, label }: {
  values: readonly T[]; value: T; onChange: (v: T) => void; label: (v: T) => string
}) {
  return (
    <div className="ec-pills">
      {values.map((v) => (
        <button key={v} type="button" className={`ec-pill no-ec${value === v ? ' active' : ''}`}
                onClick={() => onChange(v)}>{label(v)}</button>
      ))}
    </div>
  )
}

function SalesBatch() {
  const pickers = useCondPickers(['partners', 'warehouses', 'projects', 'items', 'employees'])
  const [slips, setSlips] = useState<Slip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [mode, setMode] = useState<'거래처별' | '전표별'>('거래처별')
  const blank = { from: initP.from, to: initP.to, warehouse: '', partner: '', item: '', project: '', employee: '',
    partnerManager: '', vatType: '', vatRate: '', domestic: '내자', tradeKind: '', noCodePrint: false }
  const [cond, setCond] = useState(blank)
  const setC = (patch: Partial<typeof blank>) => setCond((c) => ({ ...c, ...patch }))
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [rowVat, setRowVat] = useState<Record<string, string>>({})

  async function load(): Promise<void> {
    setLoading(true); setError('')
    try {
      const res = await api.get<Slip[]>('/accounting-reflection?kind=SALES')
      setSlips(res.data)
    } catch (err) {
      setError(extractErrorMessage(err)); setSlips([])
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const rows = useMemo<Row[]>(() => {
    const f = slips
      .filter((s) => !s.reflected)
      .filter((s) => !cond.from || s.slipDate >= cond.from)
      .filter((s) => !cond.to || s.slipDate <= cond.to)
      .filter((s) => !cond.partner || String(s.partnerId) === cond.partner)
      .filter((s) => !cond.warehouse || String(s.warehouseId) === cond.warehouse)
      .filter((s) => !cond.project || String(s.projectId) === cond.project)
      .filter((s) => !cond.item || (s.lines ?? []).some((l) => String(l.itemId) === cond.item))
      .filter((s) => !cond.employee || (s.employeeName ?? '').includes(cond.employee))
      .filter((s) => !cond.partnerManager || (s.partnerManager ?? '').includes(cond.partnerManager))
      .filter((s) => !cond.vatType || s.vatType === cond.vatType)
      .filter(() => cond.domestic !== '외자') // 우리 판매전표는 모두 내자다
      .filter((s) => !cond.tradeKind || s.tradeKind === cond.tradeKind)
    // 일부반영 — 같은 거래처에 이미 반영된 전표가 있는가
    const done = new Set(slips.filter((s) => s.reflected).map((s) => s.partnerId))
    const m = new Map<string, Row>()
    for (const s of f) {
      const key = mode === '거래처별' ? `p${s.partnerId}` : `s${s.id}`
      const cur = m.get(key) ?? { key, date: s.slipDate, partnerId: s.partnerId, partnerName: s.partnerName, ids: [],
        supply: 0, vat: 0, items: s.itemSummary, vatTypes: new Set<string>(), partial: done.has(s.partnerId) }
      cur.ids.push(s.id)
      if (s.slipDate > cur.date) cur.date = s.slipDate // 거래처별은 마지막 거래일
      cur.supply += s.supplyAmount; cur.vat += s.vatAmount
      cur.vatTypes.add(s.vatType)
      m.set(key, cur)
    }
    return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.partnerName.localeCompare(b.partnerName)))
  }, [slips, cond, mode])

  const vatOf = (r: Row) => rowVat[r.key] ?? (r.vatTypes.size === 1 && r.vatTypes.has('면세') ? '계산서' : '세금계산서')
  const sum = rows.reduce((t, r) => ({ supply: t.supply + r.supply, vat: t.vat + r.vat }), { supply: 0, vat: 0 })

  function toggle(k: string) {
    setChecked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }

  async function reflect() {
    const picked = rows.filter((r) => checked.has(r.key))
    setError(''); setOk('')
    try {
      const ids = picked.flatMap((r) => r.ids)
      const vatTypes = Object.fromEntries(picked.flatMap((r) => r.ids.map((id) => [id, vatOf(r)])))
      const res = await api.post<{ reflectedCount: number }>('/accounting-reflection/reflect', { kind: 'SALES', ids, vatTypes })
      setChecked(new Set())
      await load()
      setOk(`${res.data.reflectedCount}건 회계반영 완료`)
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const reset = () => { setCond(blank); setMode('거래처별'); setChecked(new Set()) }

  return (
    <EcListShell
      title="판매일괄회계반영"
      searchable={false}
      actions={[
        { label: '검색(F8)', primary: true, onClick: () => void load() },
        { label: '다시작성', onClick: reset },
        { label: '매출전표 I', selected: checked.size, onClick: () => void reflect() },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      <EcStatusPanel from={cond.from} to={cond.to} onPeriod={(r) => setC({ from: r.from, to: r.to })}
                     picks={INQUIRY_PICKS} dateLabel="기준일자">
        <EcCond label="구분">
          <Pills values={['거래처별', '전표별'] as const} value={mode} onChange={(v) => { setMode(v); setChecked(new Set()) }} label={(v) => v} />
        </EcCond>
        <EcCond label="창고" pick>
          <CodePickerField label="창고" hideLabel width={200} emptyLabel="전체" value={cond.warehouse}
                           onChange={(v) => setC({ warehouse: v })} items={pickers.warehouses} />
        </EcCond>
        <EcCond label="거래처" pick>
          <CodePickerField label="거래처" hideLabel width={200} emptyLabel="전체" value={cond.partner}
                           onChange={(v) => setC({ partner: v })} items={pickers.partners} />
        </EcCond>
        <EcCond label="품목" pick>
          <CodePickerField label="품목" hideLabel width={200} emptyLabel="전체" value={cond.item}
                           onChange={(v) => setC({ item: v })} items={pickers.items} />
        </EcCond>
        <EcCond label="프로젝트" pick>
          <CodePickerField label="프로젝트" hideLabel width={200} emptyLabel="전체" value={cond.project}
                           onChange={(v) => setC({ project: v })} items={pickers.projects} />
        </EcCond>
        <EcCond label="담당자" pick>
          <CodePickerField label="담당자" hideLabel width={200} emptyLabel="전체" value={cond.employee}
                           onChange={(v) => setC({ employee: v })} items={pickers.employees} />
        </EcCond>
        <EcCond label="거래처관리담당자" pick>
          <CodePickerField label="거래처관리담당자" hideLabel width={200} emptyLabel="전체" value={cond.partnerManager}
                           onChange={(v) => setC({ partnerManager: v })} items={pickers.employees} />
        </EcCond>
        <EcCond label="거래유형">
          <Pills values={['', '과세', '면세'] as const} value={cond.vatType as '' | '과세' | '면세'}
                 onChange={(v) => setC({ vatType: v })} label={(v) => v || '전체'} />
        </EcCond>
        {/* 원본 재기 필요: [부가세율 적용] 의 선택지 · 기본값(plans/재고1.md 97행). 값을 모르니 고를 것이 없다. */}
        <EcCond label="부가세율 적용">
          <select className="ec-input" aria-label="부가세율 적용" value={cond.vatRate} onChange={(e) => setC({ vatRate: e.target.value })}>
            <option value="">전체</option>
          </select>
        </EcCond>
        <EcCond label="내.외자구분">
          <Pills values={['', '내자', '외자'] as const} value={cond.domestic as '' | '내자' | '외자'}
                 onChange={(v) => setC({ domestic: v })} label={(v) => v || '전체'} />
        </EcCond>
        <EcCond label="거래구분">
          <Pills values={['', '일반', '반품', '기타'] as const} value={cond.tradeKind as '' | '일반' | '반품' | '기타'}
                 onChange={(v) => setC({ tradeKind: v })} label={(v) => v || '전체'} />
        </EcCond>
        <EcCond label="">
          <label className="text-[12.5px] flex items-center gap-[4px]">
            <input type="checkbox" checked={cond.noCodePrint} onChange={(e) => setC({ noCodePrint: e.target.checked })} />
            거래처코드없는자료인쇄
          </label>
        </EcCond>
      </EcStatusPanel>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      <table className="ec-grid w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[100px]">거래일자</th>
            <th>거래처명</th>
            <th className="w-[120px] text-right">거래가액</th>
            <th className="w-[80px] text-right">조정</th>
            <th className="w-[120px] text-right">공급가액</th>
            <th className="w-[100px] text-right">부가세</th>
            <th className="w-[120px] text-right">합계</th>
            <th>품목요약</th>
            <th className="w-[130px] text-center">부가세유형</th>
            <th className="w-[80px] text-center">일부반영</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={11} className="ec-empty">불러오는 중…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={11} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.key}>
              <td className="text-center"><input type="checkbox" checked={checked.has(r.key)} onChange={() => toggle(r.key)} /></td>
              <td>{dateText(r.date)}</td>
              <td>{r.partnerName}</td>
              <td className="text-right">{won(r.supply)}</td>
              <td className="text-right"><input className="ec-input w-full text-right" aria-label="조정" value="0" readOnly /></td>
              <td className="text-right">{won(r.supply)}</td>
              <td className="text-right">{won(r.vat)}</td>
              <td className="text-right">{won(r.supply + r.vat)}</td>
              <td>{r.items}</td>
              <td className="text-center">
                <select className="ec-input w-full" aria-label="부가세유형" value={vatOf(r)}
                        onChange={(e) => setRowVat((m) => ({ ...m, [r.key]: e.target.value }))}>{vatOptions}</select>
              </td>
              <td className="text-center">{r.partial ? 'Y' : ''}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="font-bold bg-ec-page">
              <td colSpan={3} className="text-right">합계 ({rows.length})</td>
              <td className="text-right">{won(sum.supply)}</td>
              <td className="text-right">0</td>
              <td className="text-right">{won(sum.supply)}</td>
              <td className="text-right">{won(sum.vat)}</td>
              <td className="text-right">{won(sum.supply + sum.vat)}</td>
              <td colSpan={3}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </EcListShell>
  )
}

/** 판매일괄회계반영(?view=batch, 구매 아님)만 새 화면. 나머지는 예전 화면 그대로. */
export default function SalesBatchReflectionPage() {
  const [params] = useSearchParams()
  const isSalesBatch = params.get('kind') !== 'purchase' && params.get('view') === 'batch'
  return isSalesBatch ? <SalesBatch /> : <AccountingReflectionPage />
}
