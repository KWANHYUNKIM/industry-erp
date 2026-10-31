import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import CodePickerField from '../../components/codepicker/CodePickerField'
import EditStateMenu, { type StateOp } from '../../components/EditStateMenu'
import { ecAlert, ecConfirm } from '../../components/EcDialog'

/**
 * 재고 II > 오더관리 > 오더관리유형등록(E040901).
 *
 * <p>원본 열 실측(사본 열 id TYPE_CD·TYPE_NM·STEPS·USE_YN·INP_USE_TF):
 *   유형코드 · 유형명 · <b>1단계 ~ 10단계</b>(아래 줄 담당자) · 사용구분 · 입력메뉴에서 사용.
 *
 * <p>2026-10-30 실측 — 원본 [오더관리유형수정] 창은 처리단계 1~10 줄마다 <b>[처리메뉴]</b>(그 단계가 어느 입력 화면인가 —
 * 구매 · 판매(거래명세서) · 주문서 · 발주서 · 작지 · 생산2 · 견적서 · 지급 · 자가사용 …)와 <b>[불러오기 기준]</b>(앞 단계 하나 —
 * '처리단계1(구매)')을 고른다. 목록의 [n단계] 칸에는 처리메뉴 이름이 찍힌다(P0001 기본유통흐름: 구매 · 판매(거래명세서)).
 * 우리는 단계를 '진행단계 이름 마스터'에서 골랐고 처리메뉴는 유형에 하나뿐이었다.
 */
interface Step {
  seq: number
  /** 옛 진행단계 마스터(처리메뉴 없이 저장된 옛 줄만). */
  stageId: number | null
  /** 화면에 찍을 이름 — 처리메뉴 이름, 옛 줄이면 진행단계 이름. */
  stageName: string
  /** 원본 격자가 단계 열 <b>아래</b>에 적는 [담당자]. 안 정했으면 null. */
  charge: string | null
  procMenu: string | null
  procMenuName: string | null
  /** 원본 [불러오기 기준] — 앞 단계 순번. */
  sourceSeq: number | null
}

interface OrderType {
  id: number
  code: string
  name: string
  description: string | null
  steps: Step[]
  useInInput: boolean
  /** 옛 유형 단위 [처리메뉴] — 원본 창에는 없다. 수정할 때 그대로 돌려보낸다. */
  procMenu: string | null
  manager: string | null
  active: boolean
}

/**
 * 원본 [처리메뉴] 고르기 후보 — 원본 이름과 우리 입력 화면.
 * 원본 유형 셋(P0001~P0003)에 나온 이름은 그대로 쓴다: 구매 · 판매(거래명세서) · 주문서 · 발주서 · 작지 · 생산2 · 견적서 · 지급 · 자가사용.
 */
const PROC_MENUS: { name: string; to: string }[] = [
  { name: '견적서', to: '/sales/quotation-entry' },
  { name: '주문서', to: '/sales/order-entry' },
  { name: '판매(거래명세서)', to: '/sales/sell' },
  { name: '출하지시서', to: '/sales/shipment-order-entry' },
  { name: '출하', to: '/sales/shipment-entry' },
  { name: '발주요청', to: '/sales/purchase-request-input' },
  { name: '발주계획', to: '/sales/purchase-plan-input' },
  { name: '발주서', to: '/sales/purchase-order-input' },
  { name: '구매', to: '/sales/buy' },
  { name: '지급', to: '/accounting/purchase-payment' },
  { name: '작지', to: '/production/work-order-entry' },
  { name: '생산불출', to: '/production/issue-entry' },
  { name: '생산1', to: '/production/receipt-bom' },
  { name: '생산2', to: '/production/receipt-manual' },
  { name: '생산3', to: '/production/receipt-qr' },
  { name: '자가사용', to: '/inventory/self-use-input' },
  { name: '불량처리', to: '/inventory/defect-input' },
]
const MENU_ITEMS = PROC_MENUS.map((m) => ({ value: m.to, name: m.name, sub: m.to }))
const menuName = (to: string) => PROC_MENUS.find((m) => m.to === to)?.name ?? to

/** 원본 처리단계 줄이 1~10 이라 10 이 상한이다. */
const MAX_STEPS = 10
/** 원본 격자의 [1단계]~[10단계] 열. */
const STEP_COLS = Array.from({ length: MAX_STEPS }, (_, i) => i + 1)

/** 창의 처리단계 한 줄. 빈 처리메뉴는 그 단계를 안 쓴다는 뜻이다. */
interface Row { procMenu: string; procMenuName: string; source: string; charge: string; stageId: number | null; legacyName: string }
const emptyRow = (): Row => ({ procMenu: '', procMenuName: '', source: '', charge: '', stageId: null, legacyName: '' })
const emptyRows = () => Array.from({ length: MAX_STEPS }, emptyRow)
const filled = (r: Row) => Boolean(r.procMenu || r.stageId)
const rowName = (r: Row) => r.procMenuName || r.legacyName

const emptyForm = { code: '', name: '', useInInput: true }

/** 원본 신규 창은 유형코드 칸에 다음 번호를 미리 찍는다 — P0001 꼴(2026-10-30 실측 P0001~P0003). */
function nextCode(rows: OrderType[]) {
  const max = rows.reduce((m, r) => {
    const g = /^P(\d{4})$/.exec(r.code)
    return g ? Math.max(m, Number(g[1])) : m
  }, 0)
  return `P${String(max + 1).padStart(4, '0')}`
}

export default function OrderTypePage() {
  const [rows, setRows] = useState<OrderType[]>([])
  /** 원본 오더관리유형리스트의 [사용중단/재사용]에 쓸 줄 고르기. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  /* 단계 열이 자료 따라 늘어난다(1~10단계) — 렌더된 표를 직접 재는 훅을 단다. */
  const tableRef = useRef<HTMLTableElement>(null)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [useCond, setUseCond] = useState<'전체' | '사용' | '중단'>('전체')
  /* 원본 Search(F3) 조건 [처리메뉴] — 그 처리메뉴를 단계로 가진 유형만. */
  const [menuCond, setMenuCond] = useState('')
  const [codeCond, setCodeCond] = useState('')
  const [nameCond, setNameCond] = useState('')
  const [inputCond, setInputCond] = useState<'전체' | 'Yes' | 'No'>('전체')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [steps, setSteps] = useState<Row[]>(emptyRows())

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<OrderType[]>('/order-types')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm, code: nextCode(rows) })
    setSteps(emptyRows())
    setFormError('')
    setShowForm(true)
  }

  function openEdit(t: OrderType) {
    setEditId(t.id)
    setForm({ code: t.code, name: t.name, useInInput: t.useInInput })
    const next = emptyRows()
    t.steps.forEach((s) => {
      if (s.seq >= 1 && s.seq <= MAX_STEPS) {
        next[s.seq - 1] = {
          procMenu: s.procMenu ?? '', procMenuName: s.procMenuName ?? '',
          source: s.sourceSeq ? String(s.sourceSeq) : '', charge: s.charge ?? '',
          stageId: s.procMenu ? null : s.stageId, legacyName: s.procMenu ? '' : s.stageName,
        }
      }
    })
    setSteps(next)
    setFormError('')
    setShowForm(true)
  }

  function setStep(i: number, patch: Partial<Row>) {
    setSteps((prev) => {
      const next = prev.map((r, k) => (k === i ? { ...r, ...patch } : r))
      /* 단계를 비우면 그 단계를 불러오기 기준으로 둔 뒤 단계도 기준이 사라진다. */
      if (patch.procMenu === '' && !next[i].stageId) {
        next.forEach((r, k) => { if (r.source === String(i + 1)) next[k] = { ...r, source: '' } })
      }
      return next
    })
  }

  /** 서버로 보낼 단계 — 빈 줄은 빼고 앞에서부터 1, 2, 3 … 으로 당긴다. 불러오기 기준도 당긴 순번으로 고친다. */
  function stepPayload(list: Row[]) {
    const used = list.map((r, i) => ({ r, old: i + 1 })).filter(({ r }) => filled(r))
    const renum = new Map(used.map(({ old }, k) => [old, k + 1]))
    return used.map(({ r }) => ({
      procMenu: r.procMenu || null,
      procMenuName: r.procMenu ? (r.procMenuName || menuName(r.procMenu)) : null,
      sourceSeq: r.source ? renum.get(Number(r.source)) ?? null : null,
      charge: r.charge || null,
      stageId: r.procMenu ? null : r.stageId,
    }))
  }

  /** 행 하나를 수정 요청으로 — 설명 · 담당자 · 유형 처리메뉴는 원본 창에 없어 받은 그대로 돌려보낸다. */
  function putBody(t: OrderType, patch: Partial<{ name: string; useInInput: boolean; active: boolean; steps: ReturnType<typeof stepPayload> }>) {
    return {
      name: t.name, description: t.description, useInInput: t.useInInput, procMenu: t.procMenu,
      manager: t.manager, active: t.active,
      steps: [...t.steps].sort((a, b) => a.seq - b.seq).map((s) => ({
        procMenu: s.procMenu, procMenuName: s.procMenuName, sourceSeq: s.sourceSeq, charge: s.charge,
        stageId: s.procMenu ? null : s.stageId,
      })),
      ...patch,
    }
  }

  async function submit() {
    setFormError('')
    if (!form.code.trim()) { setFormError('유형코드를 입력하세요.'); return }
    if (!form.name.trim()) { setFormError('유형명을 입력하세요.'); return }
    /* 원본은 [처리단계1] 을 비우고 저장하면 그 칸을 붉게 막는다(2026-10-20 실측) — 단계 없는 유형은 없다. */
    if (!filled(steps[0])) { setFormError('처리단계1의 처리메뉴를 고르세요.'); return }
    const payload = stepPayload(steps)
    try {
      if (editId) {
        const cur = rows.find((r) => r.id === editId)!
        await api.put(`/order-types/${editId}`, putBody(cur, { name: form.name, useInInput: form.useInInput, steps: payload }))
      } else {
        await api.post('/order-types', { code: form.code.trim(), name: form.name, useInInput: form.useInInput, steps: payload })
      }
      setShowForm(false)
      load()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    }
  }

  /** 수정 창의 [사용중단/재사용 ▲] — 원본 창 아래 단추. */
  async function onState(op: StateOp) {
    const cur = rows.find((r) => r.id === editId)
    if (!cur) return
    try {
      if (op === '삭제') {
        if (!(await ecConfirm('삭제하겠습니까?'))) return
        await api.delete(`/order-types/${cur.id}`)
      } else {
        await api.put(`/order-types/${cur.id}`, putBody(cur, { active: op === '재사용' }))
      }
      setShowForm(false)
      load()
    } catch (err) {
      setFormError(extractErrorMessage(err))
    }
  }

  /**
   * 원본 오더관리유형리스트의 [사용중단/재사용 ▴] — 펼침이 <b>사용중단 · 삭제 · 재사용</b> 셋이다(2026-10-20 E040901 실측).
   * 지우기 전 확인 글도 원본 그대로 "삭제하겠습니까?" 다.
   */
  async function removeChecked() {
    const targets = shown.filter((r) => checked.has(r.id))
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    setError('')
    const results = await Promise.allSettled(targets.map((r) => api.delete(`/order-types/${r.id}`)))
    const failed = results.filter((x) => x.status === 'rejected')
    setChecked(new Set())
    await load()
    if (failed.length > 0) void ecAlert(extractErrorMessage((failed[0] as PromiseRejectedResult).reason))
  }

  /** 원본 [사용중단] · [재사용]. 단계까지 함께 보낸다 — 수정은 단계를 통째로 갈아 끼운다. */
  async function setActive(active: boolean) {
    const targets = shown.filter((r) => checked.has(r.id))
    setError('')
    const results = await Promise.allSettled(targets.map((r) => api.put(`/order-types/${r.id}`, putBody(r, { active }))))
    const failed = results.filter((x) => x.status === 'rejected').length
    setChecked(new Set())
    await load()
    if (failed > 0) setError(`${targets.length - failed}건 ${active ? '재사용' : '사용중단'}, ${failed}건 실패.`)
  }

  const shown = rows
    .filter((r) => !keyword || r.name.includes(keyword) || r.code.toLowerCase().includes(keyword.toLowerCase()))
    .filter((r) => !menuCond || r.steps.some((s) => s.procMenu === menuCond))
    .filter((r) => useCond === '전체' || (r.active ? '사용' : '중단') === useCond)
    .filter((r) => !codeCond || r.code.toLowerCase().includes(codeCond.toLowerCase()))
    .filter((r) => !nameCond || r.name.includes(nameCond))
    .filter((r) => inputCond === '전체' || (r.useInInput ? 'Yes' : 'No') === inputCond)

  useTableColumnCheck(tableRef, '오더관리유형등록', [rows.length, loading])

  const editing = editId ? rows.find((r) => r.id === editId) : undefined

  return (
    <EcListShell
      title="오더관리유형리스트"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onReset={() => { setCodeCond(''); setNameCond(''); setMenuCond(''); setUseCond('전체'); setInputCond('전체') }}
      onNew={showForm ? () => setShowForm(false) : openCreate}
      /* 원본 하단은 [신규(F2)] · [사용중단/재사용 ▴] 둘뿐이다 — 펼침이 사용중단 · 삭제 · 재사용(2026-10-20 실측). */
      actions={[{ label: '사용중단/재사용', selected: checked.size,
                  /* 버튼 자체는 고른 것이 모두 중단이면 되살리고, 아니면 세운다. */
                  onClick: () => setActive(rows.filter((r) => checked.has(r.id)).every((r) => !r.active)),
                  menu: [{ label: '사용중단', onClick: () => { if (checked.size) void setActive(false); else void ecAlert('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.') } },
                         { label: '삭제', onClick: () => { if (checked.size) void removeChecked(); else void ecAlert('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.') } },
                         { label: '재사용', onClick: () => { if (checked.size) void setActive(true); else void ecAlert('리스트에 선택된 자료가 없습니다. 체크박스에 체크한 후 다시 시도 바랍니다.') } }] }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      {/*
        원본 머리는 검색칸 · Search(F3) · Option · 도움말뿐이고 조건 줄이 없다(2026-10-30 실측) —
        조건(사본 차례: 유형코드 · 유형명 · 처리메뉴 · 사용구분 · 입력메뉴에서 사용)은 접어 두고 Search(F3) 로 내린다(CLAUDE.md 10.2, EcListShell 이 .ec-cond 를 판으로 쓴다).
      */}
      <div className="ec-cond grid grid-cols-[100px_1fr] gap-[6px] items-center text-[12.5px] text-ec-label">
        <span>유형코드</span>
        <input className="ec-input w-[190px]" placeholder="유형코드" value={codeCond} onChange={(e) => setCodeCond(e.target.value)} />
        <span>유형명</span>
        <input className="ec-input w-[190px]" placeholder="유형명" value={nameCond} onChange={(e) => setNameCond(e.target.value)} />
        <span>처리메뉴</span>
        <CodePickerField label="처리메뉴" hideLabel width={190} emptyLabel="전체"
                         value={menuCond} onChange={setMenuCond} items={MENU_ITEMS} />
        <span>사용구분</span>
        <select className="ec-input w-[100px]" value={useCond} onChange={(e) => setUseCond(e.target.value as '전체' | '사용' | '중단')}>
          <option>전체</option><option>사용</option><option>중단</option>
        </select>
        <span>입력메뉴에서 사용</span>
        <select className="ec-input w-[100px]" value={inputCond} onChange={(e) => setInputCond(e.target.value as '전체' | 'Yes' | 'No')}>
          <option>전체</option><option>Yes</option><option>No</option>
        </select>
      </div>

      <Modal error={formError} open={showForm} width={760} title={editId ? '오더관리유형수정' : '오더관리유형등록'} onClose={() => setShowForm(false)}>
        <div className="ec-form">
          <div className="grid grid-cols-[90px_160px_70px_1fr] gap-[6px] items-center text-[12.5px]">
            <label>유형코드</label>
            <input className="ec-input w-full" placeholder="유형코드" value={form.code} disabled={!!editId}
                   onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            <label>유형명</label>
            <div className="flex items-center gap-[10px]">
              <input className="ec-input w-[220px]" placeholder="유형명" value={form.name}
                     onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <label className="inline-flex items-center gap-[4px]">
                <input type="checkbox" checked={form.useInInput}
                       onChange={(e) => setForm((f) => ({ ...f, useInInput: e.target.checked }))} />
                입력메뉴에서 사용
              </label>
            </div>
          </div>
        </div>

        {/* 원본 처리단계 표 — 줄마다 처리메뉴 · 불러오기 기준(앞 단계 중 하나). 담당자는 목록의 단계 아래 줄. */}
        <table className="mt-[8px] w-full">
          <thead>
            <tr>
              <th className="w-[90px]">처리단계명</th>
              <th>처리메뉴</th>
              <th className="w-[200px]">불러오기 기준</th>
              <th className="w-[130px]">담당자</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((r, i) => (
              <tr key={i}>
                <td>처리단계{i + 1}</td>
                <td>
                  <CodePickerField label={`처리단계${i + 1} 처리메뉴`} hideLabel fill emptyLabel=""
                                   popupTitle="처리메뉴" placeholder={r.legacyName || '처리메뉴'}
                                   value={r.procMenu}
                                   onChange={(v) => setStep(i, { procMenu: v, procMenuName: v ? menuName(v) : '', stageId: null, legacyName: '' })}
                                   items={MENU_ITEMS} />
                </td>
                <td>
                  <select className="ec-input w-full" value={r.source} disabled={i === 0 || !filled(r)}
                          aria-label={`처리단계${i + 1} 불러오기 기준`}
                          onChange={(e) => setStep(i, { source: e.target.value })}>
                    <option value="" />
                    {steps.slice(0, i).map((p, k) => filled(p) && (
                      <option key={k} value={k + 1}>처리단계{k + 1}({rowName(p)})</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="ec-input w-full" placeholder="담당자" value={r.charge} disabled={!filled(r)}
                         onChange={(e) => setStep(i, { charge: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-[10px] flex gap-[4px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void submit()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => (editing ? openEdit(editing) : openCreate())}>다시 작성</button>
          {editing && <EditStateMenu active={editing.active} onPick={onState} />}
          <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
        </div>
      </Modal>

      {/* 단계 열이 열 개라 표가 넓다 — 페이지가 가로로 밀리지 않게 표 안에서만 스크롤한다. */}
      <div className="overflow-x-auto">

      <table ref={tableRef} className="w-full text-left">
        <thead>
          <tr>
            <th rowSpan={2} className="w-[34px] text-center">
              <input type="checkbox"
                     checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={() => setChecked(
                       shown.every((r) => checked.has(r.id)) ? new Set() : new Set(shown.map((r) => r.id)),
                     )} />
            </th>
            <th rowSpan={2} className="w-[90px]">유형코드</th>
            <th rowSpan={2} className="w-[130px]">유형명</th>
            {/* 원본은 단계를 [1단계] ~ [10단계] 열 열 개로 편다(열 id STEPS∬S1…S10) — 칸에는 그 단계의 처리메뉴 이름. */}
            {STEP_COLS.map((n) => (
              <th key={n} className="w-[96px]">{n}단계</th>
            ))}
            <th rowSpan={2} className="w-[80px] text-center">사용구분</th>
            <th rowSpan={2} className="w-[110px] text-center">입력메뉴에서 사용</th>
          </tr>
          {/* 원본 머리 둘째 줄 — 단계 열 아래 [담당자](2026-09-01 E040901 실측). */}
          <tr>
            {STEP_COLS.map((n) => (
              <th key={`c${n}`} className="font-normal text-[11.5px] text-ec-label">담당자</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={15} className="ec-empty">불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={15} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                  return next
                })} />
              </td>
              {/* 원본은 코드·이름을 눌러 그 건을 연다(사본 실측: 두 칸이 링크다). */}
              <td><a href="#" className="ec-link" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.code}</a></td>
              <td><a href="#" className="ec-link" onClick={(e) => { e.preventDefault(); openEdit(r) }}>{r.name}</a></td>
              {STEP_COLS.map((n) => {
                const st = r.steps.find((x) => x.seq === n)
                return (
                  <td key={n}>
                    {st ? st.stageName : ''}
                    {st?.charge && <div className="text-[11px] text-ec-label">{st.charge}</div>}
                  </td>
                )
              })}
              {/* 원본은 사용 중이면 [사용구분] 에 'Yes', [입력메뉴에서 사용] 은 켠 것만 'Yes' 를 적고 끈 것은 비운다(2026-10-20 실측). */}
              <td className={`text-center${r.active ? '' : ' text-ec-hint'}`}>{r.active ? 'Yes' : 'No'}</td>
              <td className="text-center">{r.useInInput ? 'Yes' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </EcListShell>
  )
}
