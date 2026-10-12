import { useEffect, useMemo, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { useNavigate } from 'react-router-dom'
import { ymd } from '../../components/EcPeriodPicks'
import ProcessExpenseModal from './ProcessExpenseModal'

/**
 * 재고 II &gt; 이익관리 &gt; 월별이익 &gt; <b>원가생성/수정</b>(E040802) — 2026-10-12 loginaa 실측.
 *
 * <p>원본 목록 한 줄은 <b>원가를 잡는 기간</b>이다: 열 [기준년월 · 원가계산방법 · 계산기준 · 사전작업 · 원가계산 · 원가현황 · 기타].
 * 맨 위(가장 최근) 줄만 버튼을 펼친다 — 사전작업 [노무비/경비등록 · 표준원가생성], 원가계산 [생성](생성한 뒤엔 [수정 · 기말금액재계산]),
 * 원가현황 [조회 · 수량비교 · 전월금액비교 · 삭제], 기타 [회계반영 · 이력]. 지나간 줄은 회색 [사전작업] · [원가계산] 과 파란 [원가현황] · [기타].
 * 아래 [신규(F2) · 원가생성전 점검사항 · 웹자료올리기]. [신규] 는 기본등록 창(시작월 — 앞 기간 다음 달로 잠김 · 종료월 · 원가계산법
 * 총평균법/선입선출법/최종매입원가법 · 외주비기준 품목등록/실외주비)이고, 저장하면 맨 위에 줄이 생기며 원가생성전 점검사항이 뜬다.
 * [삭제] 는 '삭제한 데이터는 복구되지 않습니다. 삭제하겠습니까?' 를 묻는다.
 *
 * <p>예전 우리는 이 화면을 <b>품목별 원가 표</b>로 그렸다(품목 · 기간 · 재료비 …, 위에 [기준년월] · [계산기준] 조건). 그 표는
 * 원본에서 원가계산 [수정] 이 여는 자리라 그리로 옮겼다.
 *
 * <p>선입선출법은 입고 레이어(어느 입고분이 얼마에 들어와 남았나)를 남기지 않아 못 한다 — 기간은 만들 수 있지만
 * [표준원가생성] 이 막는다. [기말금액재계산] · [수량비교] · [전월금액비교] · [회계반영] · [이력] · [웹자료올리기] 는 아직 없다.
 */
interface Item { id: number; code: string; name: string; spec?: string | null; searchKeyword?: string | null; active?: boolean }
interface Cost {
  id: number
  itemId: number
  itemCode: string
  itemName: string
  period: string
  materialCost: number
  laborCost: number
  overheadCost: number
  standardTotal: number
  actualMaterial: number
  actualLabor: number
  actualOverhead: number
  actualTotal: number
}

const thisMonth = () => ymd(new Date()).slice(0, 7)
const emptyForm = () => ({
  itemId: '', period: thisMonth(),
  materialCost: '', laborCost: '', overheadCost: '',
  actualMaterial: '', actualLabor: '', actualOverhead: '',
})

interface Period {
  id: number; startMonth: string; endMonth: string
  method: 'TOTAL_AVERAGE' | 'FIFO' | 'LAST_PURCHASE'; methodName: string
  outsourcingBasis: 'ITEM' | 'ACTUAL'; outsourcingBasisName: string
  generated: boolean; latest: boolean
}
const METHODS = [['TOTAL_AVERAGE', '총평균법'], ['FIFO', '선입선출법'], ['LAST_PURCHASE', '최종매입원가법']] as const
const BASES = [['ITEM', '품목등록'], ['ACTUAL', '실외주비']] as const
const ym = (m: string) => m.replace('-', '/')
const nextMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }


export default function CostBuildPage() {
  const navigate = useNavigate()
  const [periods, setPeriods] = useState<Period[]>([])
  const [rows, setRows] = useState<Cost[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [checkOpen, setCheckOpen] = useState(false)
  /* ── 기본등록 ── */
  const [regOpen, setRegOpen] = useState(false)
  const latest = periods.find((p) => p.latest) ?? null
  const blankReg = () => {
    const start = latest ? nextMonth(latest.endMonth) : ymd(new Date()).slice(0, 7)
    return { startMonth: start, endMonth: start, method: 'TOTAL_AVERAGE' as Period['method'], outsourcingBasis: 'ITEM' as Period['outsourcingBasis'] }
  }
  const [reg, setReg] = useState(blankReg())
  /* ── 원가계산 [수정] — 그 기간의 품목별 원가 ── */
  const [editPeriod, setEditPeriod] = useState<Period | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [keyword, setKeyword] = useState('')
  /** 사전작업(노무비/경비등록)을 여는 기준년월. 실제원가 계산이 이 달을 본다. */
  const [expensePeriod, setExpensePeriod] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [p, c, it] = await Promise.all([
        api.get<Period[]>('/cost-periods'),
        api.get<Cost[]>('/costs'),
        api.get<Item[]>('/items'),
      ])
      setPeriods(p.data)
      setRows(c.data)
      setItems(it.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function openReg() { setError(''); setReg(blankReg()); setRegOpen(true) }
  /** 기본등록 [저장(F8)] — 원본은 저장하면 맨 위에 줄이 생기고 원가생성전 점검사항이 저절로 뜬다. */
  async function saveReg() {
    setError('')
    try {
      await api.post('/cost-periods', reg)
      setRegOpen(false); setCheckOpen(true); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function run(p: Period, what: 'standard' | 'generate') {
    setError(''); setOk('')
    try {
      const r = await api.post<{ months: number; rows: number }>(`/cost-periods/${p.id}/${what}`)
      setOk(`요청된 [${ym(p.startMonth)} ~${ym(p.endMonth)} ${what === 'standard' ? '표준원가생성' : '원가생성'}] 작업이 완료되었습니다. (${r.data.rows}건)`)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  async function removePeriod(p: Period) {
    if (!window.confirm('삭제한 데이터는 복구되지 않습니다.\n\n삭제하겠습니까?')) return
    setError(''); setOk('')
    try {
      await api.delete(`/cost-periods/${p.id}`)
      setOk(`요청된 [${ym(p.startMonth)} ~${ym(p.endMonth)} 원가삭제] 작업이 완료되었습니다.`)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  function set(k: keyof ReturnType<typeof emptyForm>, v: string) { setForm((f) => ({ ...f, [k]: v })) }
  function openNew() {
    setEditId(null)
    setForm({ ...emptyForm(), period: editPeriod?.startMonth ?? thisMonth() })
    setShowForm(true)
  }
  function openEdit(r: Cost) {
    setEditId(r.id)
    setForm({
      itemId: String(r.itemId), period: r.period,
      materialCost: String(r.materialCost), laborCost: String(r.laborCost), overheadCost: String(r.overheadCost),
      actualMaterial: String(r.actualMaterial), actualLabor: String(r.actualLabor), actualOverhead: String(r.actualOverhead),
    })
    setShowForm(true)
  }
  const num = (v: string) => (v === '' ? 0 : Number(v))
  async function submit() {
    setError('')
    if (!editId && !form.itemId) return setError('품목을 선택하세요.')
    if (!form.period) return setError('적용기간을 입력하세요.')
    try {
      const body = {
        materialCost: num(form.materialCost), laborCost: num(form.laborCost), overheadCost: num(form.overheadCost),
        actualMaterial: num(form.actualMaterial), actualLabor: num(form.actualLabor), actualOverhead: num(form.actualOverhead),
      }
      if (editId) await api.put(`/costs/${editId}`, body)
      else await api.post('/costs', { itemId: Number(form.itemId), period: form.period, ...body })
      setShowForm(false); setEditId(null); load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  async function remove(r: Cost) {
    if (!window.confirm(`[${r.itemName}] ${r.period} 원가를 삭제할까요?`)) return
    setError(''); setOk('')
    try { await api.delete(`/costs/${r.id}`); load() } catch (err) { setError(extractErrorMessage(err)) }
  }

  const shown = rows
    .filter((r) => editPeriod != null && r.period >= editPeriod.startMonth && r.period <= editPeriod.endMonth)
    .filter((r) => !keyword || r.itemName.includes(keyword) || r.itemCode.includes(keyword))
  const total = useMemo(() => shown.reduce((s, r) => s + r.standardTotal, 0), [shown])
  const editItemName = editId ? rows.find((r) => r.id === editId)?.itemName : ''

  const link = (label: string, onClick?: () => void) => (
    <div><button type="button" className="ec-link" disabled={!onClick} onClick={onClick}>{label}</button></div>
  )

  return (
    <EcListShell title="원가생성/수정">
      {expensePeriod && (
        <ProcessExpenseModal period={expensePeriod} onClose={() => setExpensePeriod(null)} />
      )}
      {error && !regOpen && !editPeriod && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {ok && <p className="ec-alert ec-alert-success mb-[8px]">{ok}</p>}

      <table className="w-full">
        <thead>
          <tr>
            {/* 원본 열은 모두 가운데 정렬이다. */}
            <th className="text-center">기준년월</th><th className="text-center">원가계산방법</th><th className="text-center">계산기준</th><th className="text-center">사전작업</th><th className="text-center">원가계산</th><th className="text-center">원가현황</th><th className="text-center">기타</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
          ) : periods.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : periods.map((p) => (
            <tr key={p.id}>
              <td className="text-center"><span className="ec-link">{ym(p.startMonth)} ~ {ym(p.endMonth)}</span></td>
              <td className="text-center">{p.methodName}</td>
              <td className="text-center">{p.outsourcingBasisName}</td>
              {p.latest ? (
                <>
                  <td className="text-center">
                    {link('노무비/경비등록', () => setExpensePeriod(p.startMonth))}
                    {link('표준원가생성', () => void run(p, 'standard'))}
                  </td>
                  <td className="text-center">
                    {link('생성', () => void run(p, 'generate'))}
                    {p.generated && link('수정', () => { setError(''); setKeyword(''); setEditPeriod(p) })}
                  </td>
                  <td className="text-center">
                    {link('조회', () => navigate('/accounting/actual-cost'))}
                    {link('삭제', () => void removePeriod(p))}
                  </td>
                  <td className="text-center" />
                </>
              ) : (
                <>
                  <td><button type="button" className="ec-btn w-full" disabled>사전작업</button></td>
                  <td><button type="button" className="ec-btn w-full" disabled>원가계산</button></td>
                  <td><button type="button" className="ec-btn ec-btn-primary w-full" onClick={() => navigate('/accounting/actual-cost')}>원가현황</button></td>
                  <td><button type="button" className="ec-btn ec-btn-primary w-full" disabled>기타</button></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={openReg}>신규(F2)</button>
        <button type="button" className="ec-btn" onClick={() => setCheckOpen(true)}>원가생성전 점검사항</button>
      </div>

      <Modal error={regOpen ? error : ''} open={regOpen} title="기본등록" width={560} onClose={() => setRegOpen(false)}>{(
        <div>
          <div className="ec-form grid grid-cols-[110px_1fr] gap-y-[6px] items-center">
            <span className="text-ec-label">시작월</span>
            <input type="month" className="ec-input w-[150px]" aria-label="시작월" value={reg.startMonth} disabled={latest != null}
                   onChange={(e) => setReg({ ...reg, startMonth: e.target.value })} />
            <span className="text-ec-label">종료월</span>
            <input type="month" className="ec-input w-[150px]" aria-label="종료월" value={reg.endMonth}
                   onChange={(e) => setReg({ ...reg, endMonth: e.target.value })} />
            <span className="text-ec-label">원가계산법</span>
            <div className="flex gap-[10px]">
              {METHODS.map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-[3px]">
                  <input type="radio" name="cost-method" checked={reg.method === v} onChange={() => setReg({ ...reg, method: v })} /> {l}
                </label>
              ))}
            </div>
            <span className="text-ec-label">외주비기준</span>
            <div className="flex gap-[10px]">
              {BASES.map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-[3px]">
                  <input type="radio" name="cost-basis" checked={reg.outsourcingBasis === v} onChange={() => setReg({ ...reg, outsourcingBasis: v })} /> {l}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void saveReg()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setReg(blankReg())}>다시 작성</button>
            <button type="button" className="ec-btn" onClick={() => setRegOpen(false)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      <Modal error={editPeriod && !showForm ? error : ''} open={editPeriod != null && !showForm}
             title={editPeriod ? `원가수정 — ${ym(editPeriod.startMonth)} ~ ${ym(editPeriod.endMonth)}` : '원가수정'}
             width={980} onClose={() => setEditPeriod(null)}>{(
        <div>
          <div className="flex items-center gap-[6px] mb-[8px]">
            <input className="ec-input w-[200px]" placeholder="품목코드 · 품목명" aria-label="품목 찾기" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <span className="ml-auto text-ec-label">표준원가 합계 <b className="text-ec-navy">{total.toLocaleString()}</b></span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th className="w-[90px]">품목코드</th>
                <th>품목명</th>
                <th className="w-[80px]">기간</th>
                <th className="text-right">재료비</th>
                <th className="text-right">노무비</th>
                <th className="text-right">경비</th>
                <th className="text-right">표준원가</th>
                <th className="w-[70px] text-center"></th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((r, i) => (
                <tr key={r.id}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{r.itemCode}</td>
                  <td>{r.itemName}</td>
                  <td>{r.period}</td>
                  <td className="text-right">{r.materialCost.toLocaleString()}</td>
                  <td className="text-right">{r.laborCost.toLocaleString()}</td>
                  <td className="text-right">{r.overheadCost.toLocaleString()}</td>
                  <td className="text-right font-bold">{r.standardTotal.toLocaleString()}</td>
                  <td className="text-center whitespace-nowrap">
                    <button type="button" className="ec-link mr-[6px]" onClick={() => openEdit(r)}>수정</button>
                    <button type="button" className="ec-link text-ec-danger" onClick={() => void remove(r)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={openNew}>신규(F2)</button>
            <button type="button" className="ec-btn" onClick={() => setEditPeriod(null)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      <Modal error={showForm ? error : ''} open={showForm} title={editId ? `원가 수정 — ${editItemName}` : '원가 등록'} onClose={() => setShowForm(false)}>{(
        <div>
          <div className="flex gap-[12px] flex-wrap items-end">
            <div className="text-[12.5px]"><div className="text-ec-label mb-[3px]">품목 *</div>
              {editId ? (
                <input className="ec-input w-[180px]" value={editItemName ?? ''} disabled />
              ) : (
                <CodePickerField label="품목" hideLabel width={180} placeholder="품목" emptyLabel="선택 해제"
                                 value={form.itemId} onChange={(v) => set('itemId', v)}
                                 items={items.filter((it) => it.active !== false).map((it) => ({ value: String(it.id), code: it.code, name: it.name, sub: it.spec, alias: it.searchKeyword }))} />
              )}
            </div>
            <label className="text-[12.5px]"><div className="text-ec-label mb-[3px]">적용기간 *</div>
              <input className="ec-input w-[110px]" placeholder="2026-06" value={form.period} onChange={(e) => set('period', e.target.value)} disabled={!!editId} /></label>
          </div>
          <div className="flex gap-[12px] flex-wrap items-end mt-[10px]">
            {([['materialCost', '표준재료비'], ['laborCost', '표준노무비'], ['overheadCost', '표준경비'],
               ['actualMaterial', '실제재료비'], ['actualLabor', '실제노무비'], ['actualOverhead', '실제경비']] as const).map(([k, l]) => (
              <label key={k} className="text-[12.5px]"><div className="text-ec-label mb-[3px]">{l}</div>
                <input className="ec-input text-right w-[110px]" type="number" step="any" aria-label={l} value={form[k]} onChange={(e) => set(k, e.target.value)} /></label>
            ))}
          </div>
          <div className="flex gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void submit()}>저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          </div>
        </div>
      )}</Modal>

      <Modal error={null} open={checkOpen} title="원가생성전 점검사항" onClose={() => setCheckOpen(false)}>{(
        <div className="text-[12.5px] leading-[1.9] text-ec-label">
          표준원가는 <b>그 기준월의 자료로 한 번에</b> 만듭니다. 아래가 안 갖춰져 있으면
          원가가 0 이거나 일부 품목만 생깁니다.
          <ol className="mt-[10px] ml-[20px] list-decimal">
            <li>완제품에 <b>BOM</b>이 있어야 합니다 — 자재비는 BOM 을 펼쳐 계산합니다.</li>
            <li>자재의 <b>구매단가</b>가 있어야 합니다(품목등록 또는 그 달의 매입 전표).</li>
            <li>노무비·경비는 [노무비/경비등록]에서 그 기준월로 넣어 둡니다 —
                안 넣으면 재료비만으로 원가가 잡힙니다.</li>
            <li>이미 만든 기준월을 다시 만들면 <b>그 달 값이 덮어써집니다.</b></li>
          </ol>
          <div className="mt-[10px]"><button type="button" className="ec-btn" onClick={() => setCheckOpen(false)}>닫기</button></div>
        </div>
      )}</Modal>
    </EcListShell>
  )
}
