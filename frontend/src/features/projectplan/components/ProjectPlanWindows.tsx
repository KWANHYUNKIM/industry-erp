import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import CodePickerField from '../../../components/CodePickerField'
import { EcCond } from '../../../components/EcStatusPanel'
import { ecConfirm } from '../../../components/EcDialog'
import { api, extractErrorMessage } from '../../../api/client'
import { ymd } from '../../../components/EcPeriodPicks'

/**
 * 재고 II › 계획관리 › 프로젝트계획조회(E040636)의 창 셋 — 2026-10-14 loginaa 실측(plans/재고2/E040636.md).
 *
 *   [프로젝트 계획항목 등록 · 수정]  프로젝트 · 시작일 · 완료일 · 적요 + 항목 격자(01 판매 … 04 경비) [등록]
 *     → '<이름> [<코드>] <항목> 계획 리스트'  (체크) · 집계기준 · 예상수익금액 · 적요, 신규(F2) · Excel · 선택삭제 · 닫기
 *       → '<이름> [<코드>] <항목> 계획 입력'  알약 '내역' · 적요 · 금액 + 계획 기간의 달마다 칸
 *
 * [금액] 과 달 칸은 따로 저장된다 — 목록 [판매] · 계획 리스트 [예상수익금액] 은 [금액], 실적현황 예상금액은 달 칸.
 */

export interface PlanHead {
  id: number
  projectId: number
  projectCode: string
  projectName: string
  startDate: string
  endDate: string
  remark: string | null
}

export interface PlanLine {
  id: number
  planId: number
  itemCode: string
  remark: string | null
  amount: number
  months: { ym: string; amount: number }[]
}

export interface PlanItem { code: string; name: string; kind: string }

/* 원본 항목 격자(2026-10-14 실측) — 항목코드 · 항목명 · 집계구분. 노무비 · 경비의 집계구분 '계정' 은 링크 → 계정등록 창(PlanAccountWindow, 2026-10-22 실측). */
export const PLAN_ITEMS: PlanItem[] = [
  { code: '01', name: '판매', kind: '판매' },
  { code: '02', name: '구매', kind: '구매' },
  { code: '03', name: '노무비', kind: '계정' },
  { code: '04', name: '경비', kind: '계정' },
]

/**
 * 집계구분 '계정' 링크 창 [계정등록](2026-10-22 실측): 제목 '계정등록', 격자 [체크 · 계정코드 · 계정명 · 실적표기방법] 빈 줄 3 개(번호 동그라미),
 * 아래 [저장(F8) ▴] [닫기]. 실적표기방법 칸은 눌러도 열리지 않는다(계정을 넣으면 채워지는 값). 우리는 계정 → 노무비 · 경비 실적 연결이 없어 모양만이다.
 */
function PlanAccountWindow({ name, onClose }: { name: string; onClose: () => void }) {
  const [codes, setCodes] = useState(['', '', ''])
  return (
    <Modal open title="계정등록" width={560} onClose={onClose}>
      <h3 className="text-[14px] font-bold mt-0 mb-[8px]" aria-label={`${name} 계정등록`}>계정등록</h3>
      <table className="w-full text-left">
        <thead><tr><th className="w-[28px]"><input type="checkbox" aria-label="전체 선택" /></th><th>계정코드</th><th>계정명</th><th>실적표기방법</th></tr></thead>
        <tbody>
          {codes.map((c, i) => (
            <tr key={i}>
              <td className="text-center"><span className="inline-block w-[18px] h-[18px] leading-[16px] text-center rounded-full border border-solid border-ec-line text-[11px]">{i + 1}</span></td>
              <td><input className="ec-input w-full" aria-label={`계정코드 ${i + 1}`} value={c} onChange={(e) => setCodes((a) => a.map((x, j) => (j === i ? e.target.value : x)))} /></td>
              <td /><td />
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[8px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={onClose}>저장(F8)</button>
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}

const won = (n: number) => n.toLocaleString('ko-KR')

/** 시작일 ~ 완료일 의 달(YYYY-MM) — 원본 계획 입력 창의 '2026년 10월 · 2026년 11월 · 2026년 12월'. */
export function planMonths(start: string, end: string): string[] {
  const out: string[] = []
  let y = Number(start.slice(0, 4)); let m = Number(start.slice(5, 7))
  const ey = Number(end.slice(0, 4)); const em = Number(end.slice(5, 7))
  while ((y < ey || (y === ey && m <= em)) && out.length < 121) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1; if (m > 12) { m = 1; y += 1 }
  }
  return out
}

/* ------------------------------------------------------------------ 등록 · 수정 창 */

export function PlanHeadWindow({ open, planId, projects, onClose, onChanged, onOpenItem }: {
  open: boolean
  /** null 이면 [프로젝트 계획항목 등록] */
  planId: number | null
  projects: { value: string; code: string; name: string }[]
  onClose: () => void
  /** 저장 · 삭제 뒤 목록을 다시 읽는다 */
  onChanged: () => void
  /** 항목 [등록] — 그 항목의 계획 리스트 창을 연다 */
  onOpenItem: (plan: PlanHead, item: PlanItem) => void
}) {
  const today = ymd(new Date())
  const EMPTY = { projectId: '', startDate: today, endDate: `${today.slice(0, 4)}-12-31`, remark: '' }
  const [form, setForm] = useState(EMPTY)
  const [id, setId] = useState<number | null>(planId)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [accountOf, setAccountOf] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setId(planId); setMissing(false); setError(''); setPicked(new Set())
    if (!planId) { setForm(EMPTY); return }
    api.get<PlanHead>(`/project-plans/${planId}`)
      .then((r) => setForm({ projectId: String(r.data.projectId), startDate: r.data.startDate, endDate: r.data.endDate, remark: r.data.remark ?? '' }))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [open, planId]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof EMPTY, v: string) => { setForm((f) => ({ ...f, [k]: v })); if (k === 'projectId' && v) setMissing(false) }

  /** 저장하고 계획 머리를 돌려준다. 원본은 저장해도 안내 글 없이 창이 [프로젝트 계획항목 수정] 으로 남는다. */
  async function save(): Promise<PlanHead | null> {
    setError('')
    /* 원본 빈 저장: 글자 없이 프로젝트 칸 빨간 테두리 + 알약 빨간 '!'. */
    if (!form.projectId) { setMissing(true); return null }
    const body = { projectId: Number(form.projectId), startDate: form.startDate, endDate: form.endDate, remark: form.remark || null }
    try {
      const r = id ? await api.put<PlanHead>(`/project-plans/${id}`, body) : await api.post<PlanHead>('/project-plans', body)
      setId(r.data.id)
      onChanged()
      return r.data
    } catch (err) { setError(extractErrorMessage(err)); return null }
  }

  async function register(item: PlanItem) {
    let head: PlanHead | null
    if (!id) {
      if (!(await ecConfirm('프로젝트계획 저장 후 계획등록을 할 수 있습니다. 저장하시겠습니까?'))) return
      /* 확인하면 저장되고 창 제목만 바뀐다(원본은 리스트 창을 열지 않는다). */
      await save()
      return
    }
    head = await save()
    if (head) onOpenItem(head, item)
  }

  async function remove() {
    if (!id || !(await ecConfirm('삭제하겠습니까?'))) return
    try { await api.delete(`/project-plans/${id}`); onChanged(); onClose() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  /* 항목 격자 [선택삭제] — 고른 항목의 계획 줄을 지운다(원본 확인 문구는 못 잼). */
  async function removeItems() {
    if (picked.size === 0) return
    if (!id || !(await ecConfirm('삭제하겠습니까?'))) return
    try {
      const lines = (await api.get<PlanLine[]>(`/project-plans/${id}/lines`)).data.filter((l) => picked.has(l.itemCode))
      for (const l of lines) await api.delete(`/project-plans/lines/${l.id}`)
      setPicked(new Set()); onChanged()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  return (
    <Modal open={open} width={820} error={error} title={id ? '프로젝트 계획항목 수정' : '프로젝트 계획항목 등록'} onClose={onClose}>
      <div className="ec-pills mb-[8px]">
        <button type="button" className="ec-pill active">프로젝트계획{missing && <span className="text-ec-danger font-bold ml-[3px]">!</span>}</button>
      </div>
      <ul className="ec-form mb-[8px]">
        <EcCond label="프로젝트" span={2}>
          <div className={missing ? 'ec-invalid' : undefined}>
            <CodePickerField label="프로젝트" hideLabel width={320} placeholder="프로젝트" emptyLabel="선택 해제"
                             value={form.projectId} onChange={(v) => set('projectId', v)} items={projects} />
          </div>
        </EcCond>
        <EcCond label="시작일" span={2}>
          <input type="date" className="ec-input w-[140px]" aria-label="시작일" value={form.startDate}
                 onChange={(e) => e.target.value && set('startDate', e.target.value)} />
        </EcCond>
        <EcCond label="완료일" span={2}>
          <input type="date" className="ec-input w-[140px]" aria-label="완료일" value={form.endDate}
                 onChange={(e) => e.target.value && set('endDate', e.target.value)} />
        </EcCond>
        <EcCond label="적요" span={2}>
          <input className="ec-input w-full" aria-label="적요" value={form.remark} onChange={(e) => set('remark', e.target.value)} />
        </EcCond>
      </ul>
      <div className="mb-[4px]">
        <button type="button" className="ec-btn ec-btn-sm" onClick={() => void removeItems()}>선택삭제</button>
      </div>
      <table className="w-full">
        <thead>
          <tr>
            <th className="w-[28px]"></th>
            <th className="w-[70px]">항목코드</th><th>항목명</th><th>집계구분</th>
            <th>집계기준1</th><th>집계기준2</th><th>집계기준3</th><th>집계기준4</th>
            <th className="w-[70px] text-center">계획등록</th>
          </tr>
        </thead>
        <tbody>
          {PLAN_ITEMS.map((it) => (
            <tr key={it.code}>
              <td className="text-center">
                <input type="checkbox" aria-label={`${it.name} 선택`} checked={picked.has(it.code)}
                       onChange={() => setPicked((s) => { const n = new Set(s); n.has(it.code) ? n.delete(it.code) : n.add(it.code); return n })} />
              </td>
              <td>{it.code}</td>
              <td>{it.name}</td>
              <td>{it.kind === '계정' ? <button type="button" className="ec-link" onClick={() => setAccountOf(it.name)}>{it.kind}</button> : it.kind}</td>
              <td>해당없음</td><td>해당없음</td><td>해당없음</td><td>해당없음</td>
              <td className="text-center">
                <button type="button" className="ec-btn ec-btn-sm" aria-label={`${it.name} 등록`} onClick={() => void register(it)}>등록</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-[4px] mt-[8px]">
        {/* 원본 저장(F8)은 저장하고 창을 닫는다(안내 글 없음 — 목록에 '2026/10/20 | 2026/12/31 | 0 | 0 | 0 | 0', 2026-10-20 실측).
            창이 [수정] 으로 남는 것은 저장 전에 항목 [등록] 을 눌러 확인했을 때뿐이다. */}
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save().then((h) => { if (h) onClose() })}>저장(F8)</button>
        {id && <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>}
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
      {accountOf && <PlanAccountWindow name={accountOf} onClose={() => setAccountOf(null)} />}
    </Modal>
  )
}

/* ------------------------------------------------------------------ 계획 리스트 창 */

export function PlanLineListWindow({ plan, item, onClose, onChanged }: {
  plan: PlanHead | null
  item: PlanItem | null
  onClose: () => void
  onChanged: () => void
}) {
  const open = !!plan && !!item
  const [lines, setLines] = useState<PlanLine[]>([])
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  /** 계획 입력 창: undefined 닫힘 · null 신규 · 줄 수정 */
  const [editing, setEditing] = useState<PlanLine | null | undefined>(undefined)

  async function load() {
    if (!plan || !item) return
    try { setLines((await api.get<PlanLine[]>(`/project-plans/${plan.id}/lines`, { params: { item: item.code } })).data); setError('') }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { if (open) { setQ(''); setPicked(new Set()); setEditing(undefined); void load() } }, [plan?.id, item?.code]) // eslint-disable-line react-hooks/exhaustive-deps

  async function removeChecked() {
    if (picked.size === 0) return
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try { for (const id of picked) await api.delete(`/project-plans/lines/${id}`); setPicked(new Set()); await load(); onChanged() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  const shown = lines.filter((l) => !q || (l.remark ?? '').includes(q) || String(l.amount).includes(q))
  const title = plan && item ? `${plan.projectName} [${plan.projectCode}] ${item.name} 계획 리스트` : ''

  return (
    <>
      <Modal open={open} width={720} error={error} title={title} onClose={onClose}>
        <div className="flex justify-end mb-[6px]">
          <input className="ec-input w-[200px]" aria-label="검색" placeholder="입력 후 [Enter]" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-[28px]"></th>
              <th>집계기준1</th><th>집계기준2</th><th>집계기준3</th><th>집계기준4</th>
              <th className="text-right">예상수익금액</th><th>적요</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : shown.map((l) => (
              <tr key={l.id}>
                <td className="text-center">
                  <input type="checkbox" aria-label="선택" checked={picked.has(l.id)}
                         onChange={() => setPicked((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n })} />
                </td>
                <td></td><td></td><td></td><td></td>
                <td className="text-right"><button type="button" className="ec-link" onClick={() => setEditing(l)}>{won(l.amount)}</button></td>
                <td>{l.remark ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex gap-[4px] mt-[8px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => setEditing(null)}>신규(F2)</button>
          <button type="button" className="ec-btn">Excel</button>
          <button type="button" className="ec-btn" onClick={() => void removeChecked()}>선택삭제</button>
          <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
        </div>
      </Modal>
      {plan && item && (
        <PlanLineInputWindow open={editing !== undefined} plan={plan} item={item} line={editing ?? null}
                             onClose={() => setEditing(undefined)}
                             onSaved={() => { setEditing(undefined); void load(); onChanged() }} />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ 계획 입력 창 */

function PlanLineInputWindow({ open, plan, item, line, onClose, onSaved }: {
  open: boolean
  plan: PlanHead
  item: PlanItem
  line: PlanLine | null
  onClose: () => void
  onSaved: () => void
}) {
  const months = planMonths(plan.startDate, plan.endDate)
  const [remark, setRemark] = useState('')
  const [amount, setAmount] = useState('0')
  const [byYm, setByYm] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setRemark(line?.remark ?? '')
    setAmount(String(line?.amount ?? 0))
    /* 달 칸은 기본 0(원본 실측). */
    setByYm(Object.fromEntries(months.map((ym) => [ym, String(line?.months.find((m) => m.ym === ym)?.amount ?? 0)])))
  }, [open, line?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const body = {
      itemCode: item.code, remark: remark || null, amount: Number(amount || 0),
      months: months.map((ym) => ({ ym, amount: Number(byYm[ym] || 0) })),
    }
    try {
      if (line) await api.put(`/project-plans/lines/${line.id}`, body)
      else await api.post(`/project-plans/${plan.id}/lines`, body)
      onSaved()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove() {
    if (!line || !(await ecConfirm('삭제하겠습니까?'))) return
    try { await api.delete(`/project-plans/lines/${line.id}`); onSaved() }
    catch (err) { setError(extractErrorMessage(err)) }
  }

  return (
    <Modal open={open} width={560} error={error} title={`${plan.projectName} [${plan.projectCode}] ${item.name} 계획 입력`} onClose={onClose}>
      <div className="ec-pills mb-[8px]"><button type="button" className="ec-pill active">내역</button></div>
      <ul className="ec-form mb-[8px]">
        <EcCond label="적요" span={2}>
          <input className="ec-input w-full" aria-label="적요" value={remark} onChange={(e) => setRemark(e.target.value)} />
        </EcCond>
        <EcCond label="금액" span={2}>
          <input className="ec-input w-[160px] text-right" type="number" step="any" aria-label="금액" value={amount}
                 onChange={(e) => setAmount(e.target.value)} />
        </EcCond>
        {months.map((ym) => {
          const label = `${ym.slice(0, 4)}년 ${Number(ym.slice(5, 7))}월`
          return (
            <EcCond key={ym} label={label} span={2}>
              <input className="ec-input w-[160px] text-right" type="number" step="any" aria-label={label} value={byYm[ym] ?? '0'}
                     onChange={(e) => setByYm((s) => ({ ...s, [ym]: e.target.value }))} />
            </EcCond>
          )
        })}
      </ul>
      <div className="flex gap-[4px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void save()}>저장(F8)</button>
        {line && <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>}
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
