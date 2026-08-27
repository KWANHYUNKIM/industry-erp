import { useEffect, useState, type FormEvent } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { api, extractErrorMessage } from '../../api/client'

/**
 * 영업 > 오더관리유형등록.
 *
 * <p>원본 열 실측(사본 열 id TYPE_CD·TYPE_NM·STEPS·USE_YN·INP_USE_TF):
 *   유형코드 · 유형명 · <b>1단계 ~ 10단계</b> · 사용구분 · 입력메뉴에서 사용 · 담당자.
 * '기본형' 유형의 단계가 주문서 · 발주서 · 구매 · 판매 · 출하지시서 · 출하다 —
 * 즉 유형은 <b>그 오더가 밟아 갈 단계의 순서</b>를 담는 템플릿이다.
 *
 * <p>우리 유형에는 코드·이름·설명뿐이라 "이 유형은 어떤 단계를 밟나" 를 적을 자리가 없었다.
 * 그래서 오더관리진행단계 화면도 단계 마스터를 나열할 뿐 진행을 보여 주지 못했다.
 */
interface Step { seq: number; stageId: number; stageCode: string; stageName: string }

interface OrderType {
  id: number
  code: string
  name: string
  description: string | null
  steps: Step[]
  useInInput: boolean
  manager: string | null
  active: boolean
}

interface Stage { id: number; code: string; name: string; sortOrder: number }

/** 원본 열이 [1단계]~[10단계] 라 10 이 상한이다. */
const MAX_STEPS = 10
/** 원본 격자의 [1단계]~[10단계] 열. */
const STEP_COLS = Array.from({ length: MAX_STEPS }, (_, i) => i + 1)

const inputCls = 'ec-input w-full'
const emptyForm = { code: '', name: '', description: '', manager: '', useInInput: true, active: true }

export default function OrderTypePage() {
  const [rows, setRows] = useState<OrderType[]>([])
  /** 원본 오더관리유형리스트의 [사용중단/재사용]에 쓸 줄 고르기. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [stages, setStages] = useState<Stage[]>([])
  /** 1단계~10단계 칸. 빈 칸은 그 단계를 안 쓴다는 뜻이다. */
  const [stepIds, setStepIds] = useState<string[]>(Array(MAX_STEPS).fill(''))

  async function load() {
    setLoading(true)
    try {
      const [res, st] = await Promise.all([
        api.get<OrderType[]>('/order-types'),
        api.get<Stage[]>('/order-stages'),
      ])
      setRows(res.data)
      setStages(st.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditId(null)
    setForm({ ...emptyForm })
    setStepIds(Array(MAX_STEPS).fill(''))
    setShowForm(true)
  }

  function openEdit(t: OrderType) {
    setEditId(t.id)
    setForm({
      code: t.code, name: t.name, description: t.description ?? '',
      manager: t.manager ?? '', useInInput: t.useInInput, active: t.active,
    })
    const next = Array(MAX_STEPS).fill('')
    t.steps.forEach((s) => { if (s.seq >= 1 && s.seq <= MAX_STEPS) next[s.seq - 1] = String(s.stageId) })
    setStepIds(next)
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      // 빈 칸은 빼고 앞에서부터 순서대로 보낸다 — 가운데를 비워도 순번이 밀리지 않는다.
      const stageIds = stepIds.filter(Boolean).map(Number)
      if (editId) {
        await api.put(`/order-types/${editId}`, {
          name: form.name, description: form.description, stageIds,
          useInInput: form.useInInput, manager: form.manager || null, active: form.active,
        })
      } else {
        await api.post('/order-types', {
          code: form.code, name: form.name, description: form.description, stageIds,
          useInInput: form.useInInput, manager: form.manager || null,
        })
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(t: OrderType) {
    if (!confirm(`오더유형 '${t.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/order-types/${t.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  /**
   * 원본 오더관리유형리스트의 [사용중단/재사용]. 고른 유형을 한 번에 세운다.
   *
   * <p>단계(stageIds)까지 함께 보낸다 — 수정은 <b>통째로 갈아 끼우므로</b> 빼고 보내면
   * 그 유형의 [1단계]~[10단계]가 사용중단 한 번에 사라진다.
   */
  async function toggleActive() {
    const targets = shown.filter((r) => checked.has(r.id))
    if (targets.length === 0) { setError('사용중단하거나 되살릴 유형을 고르세요.'); return }
    const reviving = targets.every((r) => !r.active)
    setError('')
    const results = await Promise.allSettled(targets.map((r) => api.put(`/order-types/${r.id}`, {
      name: r.name, description: r.description,
      stageIds: [...r.steps].sort((a, b) => a.seq - b.seq).map((st) => st.stageId),
      useInInput: r.useInInput, manager: r.manager, active: reviving,
    })))
    const failed = results.filter((x) => x.status === 'rejected').length
    setChecked(new Set())
    await load()
    if (failed > 0) setError(`${targets.length - failed}건 ${reviving ? '재사용' : '사용중단'}, ${failed}건 실패.`)
  }

  const shown = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.toLowerCase().includes(keyword.toLowerCase()))

  return (
    <EcListShell
      title="오더관리유형리스트"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={showForm ? () => setShowForm(false) : openCreate}
      actions={[{ label: '새로고침', onClick: load },
                { label: `사용중단/재사용${checked.size ? ` (${checked.size})` : ''}`, onClick: toggleActive },
                { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <Modal open={showForm} title="오더관리유형 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>{editId ? '오더유형 수정' : '새 오더유형 등록'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 200px 1fr 110px', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>유형코드 *</label>
              <input className={inputCls} value={form.code} disabled={!!editId} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="OT-06" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>유형명 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="일반수주" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>설명</label>
              <input className={inputCls} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>사용여부</label>
              <select className={inputCls} value={form.active ? 'Y' : 'N'} disabled={!editId} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'Y' }))}>
                <option value="Y">사용</option>
                <option value="N">미사용</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 160px', gap: 10, marginTop: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>담당자</label>
              <input className={inputCls} value={form.manager} onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#5a626e', marginBottom: 4 }}>입력메뉴에서 사용</label>
              <select className={inputCls} value={form.useInInput ? 'Y' : 'N'}
                      onChange={(e) => setForm((f) => ({ ...f, useInInput: e.target.value === 'Y' }))}>
                <option value="Y">사용</option>
                <option value="N">미사용</option>
              </select>
            </div>
          </div>

          {/* 원본의 [1단계]~[10단계]. 이 유형의 오더가 밟아 갈 순서다. */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#5a626e', marginBottom: 6 }}>
              진행단계 <span style={{ color: '#8a929c' }}>— 앞에서부터 순서대로. 빈 칸은 건너뜁니다.</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {stepIds.map((v, i) => (
                <label key={i} style={{ fontSize: 11.5 }}>
                  <div style={{ color: '#8a929c', marginBottom: 3 }}>{i + 1}단계</div>
                  <select className={inputCls} value={v} onChange={(e) => setStepIds((prev) => {
                    const next = [...prev]
                    next[i] = e.target.value
                    return next
                  })}>
                    <option value="">(없음)</option>
                    {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '수정' : '등록'}</button>
          </div>
        </form>
      )}</Modal>

      {/* 단계 열이 열 개라 표가 넓다 — 페이지가 가로로 밀리지 않게 표 안에서만 스크롤한다. */}
      <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34, textAlign: 'center' }}>
              <input type="checkbox"
                     checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={() => setChecked(
                       shown.every((r) => checked.has(r.id)) ? new Set() : new Set(shown.map((r) => r.id)),
                     )} />
            </th>
            <th style={{ width: 90 }}>유형코드</th>
            <th style={{ width: 130 }}>유형명</th>
            {/*
              원본은 단계를 <b>[1단계] ~ [10단계] 열 열 개</b>로 편다(열 id STEPS∬S1…S10).
              우리는 '진행단계 (1 → n)' 한 칸에 몰아넣고 있었는데, 그 칸에 실제로 그려지던
              값은 단계가 아니라 <b>설명(description)</b> 이었다 — 헤더가 약속한 것과
              본문이 다른 상태였고, 뒤따르는 담당자·입력메뉴에서 사용은 아예 안 그려졌다.
            */}
            {STEP_COLS.map((n) => (
              <th key={n} style={{ width: 96 }}>{n}단계</th>
            ))}
            <th style={{ width: 80, textAlign: 'center' }}>사용구분</th>
            <th style={{ width: 110, textAlign: 'center' }}>입력메뉴에서 사용</th>
            <th style={{ width: 90 }}>담당자</th>
            <th style={{ width: 90 }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={17} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={17} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                  return next
                })} />
              </td>
              {/* 원본은 코드·이름을 눌러 그 건을 연다(사본 실측: 두 칸이 링크다). */}
              <td style={{ fontFamily: 'monospace' }}>
                <button type="button" onClick={() => openEdit(r)}
                        style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12.5 }}>
                  {r.code}
                </button>
              </td>
              <td>
                <button type="button" onClick={() => openEdit(r)}
                        style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, textAlign: 'left' }}>
                  {r.name}
                </button>
              </td>
              {STEP_COLS.map((n) => {
                const st = r.steps.find((x) => x.seq === n)
                return (
                  <td key={n} style={{ color: st ? undefined : '#e2e6ea' }}>
                    {st ? st.stageName : '·'}
                  </td>
                )
              })}
              <td style={{ textAlign: 'center', fontWeight: 700, color: r.active ? '#1c7c3c' : '#9aa1ab' }}>{r.active ? '사용' : '미사용'}</td>
              <td style={{ textAlign: 'center', color: r.useInInput ? '#1c7c3c' : '#9aa1ab' }}>
                {r.useInInput ? 'YES' : 'NO'}
              </td>
              <td style={{ color: r.manager ? undefined : '#c9ced6' }}>{r.manager ?? '-'}</td>
              <td>
                <button onClick={() => openEdit(r)} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </EcListShell>
  )
}
