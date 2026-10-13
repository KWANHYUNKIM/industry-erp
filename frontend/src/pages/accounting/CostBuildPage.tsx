import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useNavigate } from 'react-router-dom'
import { ymd } from '../../components/EcPeriodPicks'
import ProcessExpenseModal from './ProcessExpenseModal'
import CostChecklistModal, { type CostChecklistKind } from './CostChecklistModal'
import CostLedgerModal, { type CostLedgerMode } from './CostLedgerModal'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

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
 * <p>원가계산 [수정] · [기말금액재계산] 은 대상(전체 · 선택공정) 창 → '원가계산내역' 창이다(CostLedgerModal, 2026-10-13 실측).
 * 예전 우리는 [수정] 에 품목별 표준원가 표를 띄웠다 — 그 표는 표준원가현황 화면이 이미 가진 것이고 원본 [수정] 은 그것이 아니어서 뺐다.
 * 지나간 줄의 [원가현황] 은 조회 · 수량비교 · 전월금액비교, [기타] 는 회계반영 · 이력을 아래로 펼친다.
 *
 * <p>기타 [회계반영] 은 원본이 '자동생성전표조회 &gt; Option &gt; 자동생성설정' 의 자동대체(대체분개시점이 그 연월에 유효한 것)로
 * 전표를 만든다. loginaa 에 그 설정이 없어 원본도 '선택된 연월에 대체분개시점이 유효한 자동대체가 존재하지 않습니다.' 만 알렸고,
 * 우리에게도 자동대체 설정이 없어 같은 안내를 한다 — 분개 계정을 재지 못해 지어내지 않았다.
 *
 * <p>선입선출법은 입고 레이어(어느 입고분이 얼마에 들어와 남았나)를 남기지 않아 못 한다 — 기간은 만들 수 있지만
 * [표준원가생성] 이 막는다. [수량비교] · [전월금액비교] · [이력] 은 CostChecklistModal(2026-10-13).
 * [웹자료올리기] 는 아직 없다.
 */
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
  /** 사전작업(노무비/경비등록)을 여는 기준년월. 실제원가 계산이 이 달을 본다. */
  const [expensePeriod, setExpensePeriod] = useState<string | null>(null)
  /** 원가현황 [수량비교] · [전월금액비교] · 기타 [이력] 창. */
  const [checklist, setChecklist] = useState<{ id: number; kind: CostChecklistKind } | null>(null)
  /** 원가계산 [수정] · [기말금액재계산] — 대상 창 → 원가계산내역. */
  const [ledger, setLedger] = useState<{ id: number; mode: CostLedgerMode } | null>(null)
  /** 지나간 줄의 [원가현황] · [기타] 펼침 — `${기간id}:${열}`. */
  const [menu, setMenu] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setPeriods((await api.get<Period[]>('/cost-periods')).data)
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
    if (!(await ecConfirm('삭제한 데이터는 복구되지 않습니다.\n\n삭제하겠습니까?'))) return
    setError(''); setOk('')
    try {
      await api.delete(`/cost-periods/${p.id}`)
      setOk(`요청된 [${ym(p.startMonth)} ~${ym(p.endMonth)} 원가삭제] 작업이 완료되었습니다.`)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  /** 기타 [회계반영] — 우리에게 자동대체(자동생성설정)가 없으니 원본이 그 설정이 없을 때 하는 안내를 그대로 한다. */
  function reflect() {
    void ecAlert('선택된 연월에 대체분개시점이 유효한 자동대체가 존재하지 않습니다.\n\n자동생성전표조회 > Option > 자동생성설정을 확인 바랍니다.')
  }

  const link = (label: string, onClick?: () => void) => (
    <div><button type="button" className="ec-link" disabled={!onClick} onClick={onClick}>{label}</button></div>
  )
  /** 지나간 줄의 파란 [원가현황] · [기타] — 누르면 아래로 펼친다(원본 실측). */
  const dropdown = (p: Period, label: string, picks: [string, () => void][]) => {
    const key = `${p.id}:${label}`
    return (
      <span className="relative block">
        <button type="button" className="ec-btn ec-btn-primary w-full" onClick={() => setMenu(menu === key ? null : key)}>{label}</button>
        {menu === key && (
          <>
            <div className="ec-backdrop-clear" onClick={() => setMenu(null)} />
            <div className="ec-menu left-0">
              {picks.map(([l, f]) => <button key={l} type="button" onClick={() => { setMenu(null); f() }}>{l}</button>)}
            </div>
          </>
        )}
      </span>
    )
  }

  return (
    <EcListShell title="원가생성/수정">
      {expensePeriod && (
        <ProcessExpenseModal period={expensePeriod} onClose={() => setExpensePeriod(null)} />
      )}
      {checklist && <CostChecklistModal periodId={checklist.id} kind={checklist.kind} onClose={() => setChecklist(null)} />}
      {ledger && <CostLedgerModal periodId={ledger.id} mode={ledger.mode} onClose={() => setLedger(null)} />}
      {error && !regOpen && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
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
                    {p.generated && link('수정', () => { setError(''); setLedger({ id: p.id, mode: 'edit' }) })}
                    {p.generated && link('기말금액재계산', () => { setError(''); setLedger({ id: p.id, mode: 'recalc' }) })}
                  </td>
                  <td className="text-center">
                    {link('조회', () => navigate('/accounting/actual-cost'))}
                    {link('수량비교', () => setChecklist({ id: p.id, kind: 'qty' }))}
                    {link('전월금액비교', () => setChecklist({ id: p.id, kind: 'amount' }))}
                    {link('삭제', () => void removePeriod(p))}
                  </td>
                  <td className="text-center">
                    {link('회계반영', reflect)}
                    {link('이력', () => setChecklist({ id: p.id, kind: 'history' }))}
                  </td>
                </>
              ) : (
                <>
                  <td><button type="button" className="ec-btn w-full" disabled>사전작업</button></td>
                  <td><button type="button" className="ec-btn w-full" disabled>원가계산</button></td>
                  <td>{dropdown(p, '원가현황', [
                    ['조회', () => navigate('/accounting/actual-cost')],
                    ['수량비교', () => setChecklist({ id: p.id, kind: 'qty' })],
                    ['전월금액비교', () => setChecklist({ id: p.id, kind: 'amount' })],
                  ])}</td>
                  <td>{dropdown(p, '기타', [
                    ['회계반영', reflect],
                    ['이력', () => setChecklist({ id: p.id, kind: 'history' })],
                  ])}</td>
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
