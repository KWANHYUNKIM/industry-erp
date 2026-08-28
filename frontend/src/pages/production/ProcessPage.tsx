import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import ProcessOperationModal from './ProcessOperationModal'

/** 생산관리 > 공정등록 — 생산 공정 마스터 (백엔드 /api/processes 연동) */
interface ProductionProcess {
  id: number
  code: string
  name: string
  workcenter: string | null
  stdTimeMin: number
  costPerHr: number
  /** 순번. 원본 공정등록의 [순번] 열 — 공정을 고르는 자리마다 이 순서로 나온다. */
  sortOrder: number
  active: boolean
}

const inputCls = 'ec-input w-full'
const emptyForm = { code: '', name: '', workcenter: '', stdTimeMin: '', costPerHr: '', sortOrder: '0' }

export default function ProcessPage() {
  const [rows, setRows] = useState<ProductionProcess[]>([])
  /** 원본 공정등록의 [사용중단/재사용]에 쓸 줄 고르기. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  /**
   * 고치는 중인 공정. <b>수정이 아예 없었다</b> — 표준시간이나 시간당비용을 잘못 넣으면
   * 지우고 다시 만들어야 했는데, 작업지시가 물려 있으면 지울 수도 없었다.
   * 원본은 목록에서 <b>생산공정코드·생산공정명을 눌러</b> 연다.
   */
  const [editId, setEditId] = useState<number | null>(null)
  /** 원본 공정등록의 [작업코드등록] — 별도 메뉴가 아니라 이 화면에서 연다. */
  const [opOpen, setOpOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await api.get<ProductionProcess[]>('/processes')
      setRows(res.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  /** 원본처럼 목록에서 눌러 연다. 코드는 만들 때만 정한다. */
  function openEdit(r: ProductionProcess) {
    setEditId(r.id)
    setForm({
      code: r.code, name: r.name, workcenter: r.workcenter ?? '',
      stdTimeMin: String(r.stdTimeMin ?? ''), costPerHr: String(r.costPerHr ?? ''),
      sortOrder: String(r.sortOrder ?? 0),
    })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const body = {
        sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
        name: form.name,
        workcenter: form.workcenter,
        stdTimeMin: form.stdTimeMin === '' ? 0 : Number(form.stdTimeMin),
        costPerHr: form.costPerHr === '' ? 0 : Number(form.costPerHr),
      }
      if (editId) {
        /* 공정코드는 작업지시·BOR 이 그 코드로 묶여 있어 못 고친다. */
        await api.put(`/processes/${editId}`, { ...body, active: rows.find((r) => r.id === editId)?.active })
      } else {
        await api.post('/processes', { code: form.code, ...body })
      }
      setEditId(null)
      setForm(emptyForm)
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /**
   * 원본 [사용중단/재사용]. 지우지 않고 내린다 — 지난 작업·경비가 이 공정을 물고 있어서
   * 지우면 그 자료의 근거가 사라진다. 내려 두면 새로 고를 수만 없다.
   */
  async function toggleActive(r: ProductionProcess) {
    try {
      await api.put(`/processes/${r.id}`, {
        code: r.code, name: r.name, workcenter: r.workcenter,
        stdTimeMin: r.stdTimeMin, costPerHr: r.costPerHr, sortOrder: r.sortOrder,
        active: !r.active,
      })
      await load()
    } catch (e) {
      setError(extractErrorMessage(e))
    }
  }

  /**
   * 원본 공정등록의 [사용중단/재사용]. 고른 공정을 한 번에 세운다.
   * 모두 중단이면 되살리고, 하나라도 살아 있으면 중단한다(거래처·창고·품목과 같은 규칙).
   * 그 공정을 통째로 다시 보낸다 — 몇 칸만 보내면 작업장·표준시간·시간당비용이 지워진다.
   */
  async function toggleCheckedActive() {
    const targets = rows.filter((r) => checked.has(r.id))
    if (targets.length === 0) { setError('사용중단하거나 되살릴 공정을 고르세요.'); return }
    const reviving = targets.every((r) => !r.active)
    setError('')
    const results = await Promise.allSettled(targets.map((r) => api.put(`/processes/${r.id}`, {
      name: r.name, workcenter: r.workcenter, stdTimeMin: r.stdTimeMin,
      costPerHr: r.costPerHr, sortOrder: r.sortOrder, active: reviving,
    })))
    const failed = results.filter((x) => x.status === 'rejected').length
    setChecked(new Set())
    await load()
    if (failed > 0) setError(`${targets.length - failed}건 ${reviving ? '재사용' : '사용중단'}, ${failed}건 실패.`)
  }

  async function remove(p: ProductionProcess) {
    if (!confirm(`공정 '${p.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/processes/${p.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const shownRows = rows.filter((r) => !keyword || r.name.includes(keyword) || r.code.includes(keyword))

  /*
   * 사본 공정등록의 격자는 <b>생산공정코드·생산공정명·순번</b> 세 칸에 정렬 표시를 단다.
   * 우리는 표시조차 없어 <b>눌러 볼 생각도 못 하게</b> 두었다.
   * [순번]은 숫자다 — 글자로 견주면 10 이 9 앞에 선다.
   */
  const sort = useTableSort(shownRows, {
    생산공정코드: (r) => r.code,
    생산공정명: (r) => r.name,
    순번: (r) => r.sortOrder,
  })
  const shown = sort.sorted
  const total = useMemo(() => shown.reduce((s, r) => s + (r.stdTimeMin ?? 0), 0), [shown])

  return (
    <EcListShell
      title="공정등록"
      search={keyword}
      onSearchChange={setKeyword}
      onSearch={load}
      onNew={() => { setEditId(null); setForm(emptyForm); setShowForm(true) }}
      actions={[{ label: '작업코드등록', onClick: () => setOpOpen(true) },
                { label: `사용중단/재사용${checked.size ? ` (${checked.size})` : ''}`, onClick: toggleCheckedActive },
                { label: '새로고침', onClick: load },
                { label: 'Excel' }]}
    >
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}

      <Modal open={showForm} title={editId ? '공정수정' : '공정등록'} onClose={() => { setShowForm(false); setEditId(null) }}>{(
        <form onSubmit={submit} style={{ marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>{editId ? '공정 수정' : '새 공정 등록'}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div>
              <label className="mb-1 block text-sm text-slate-600">생산공정코드 *</label>
              {/* 코드는 작업지시·BOR 이 그 값으로 묶여 있어 만들 때만 정한다. */}
              <input className={inputCls} value={form.code} disabled={editId != null}
                     title={editId != null ? '작업지시·BOR 이 코드로 묶여 있어 수정할 수 없습니다.' : undefined}
                     onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PRC-060" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">생산공정명 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">작업장</label>
              <input className={inputCls} value={form.workcenter} onChange={(e) => setForm({ ...form, workcenter: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">표준시간(분)</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.stdTimeMin} onChange={(e) => setForm({ ...form, stdTimeMin: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">순번</label>
              <input type="number" className={inputCls} style={{ textAlign: 'right' }} value={form.sortOrder}
                     onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
              <p style={{ fontSize: 11.5, color: '#8a929c', marginTop: 3 }}>
                공정을 고르는 자리마다 이 순서로 나옵니다.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">시간당비용</label>
              <input type="number" step="any" className={inputCls} style={{ textAlign: 'right' }} value={form.costPerHr} onChange={(e) => setForm({ ...form, costPerHr: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
          </div>
        </form>
      )}</Modal>

      {opOpen && (
        <ProcessOperationModal
          processes={rows.map((r) => ({ id: r.id, code: r.code, name: r.name, sortOrder: r.sortOrder, active: r.active }))}
          onClose={() => setOpOpen(false)}
        />
      )}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34, textAlign: 'center' }}>
              <input type="checkbox"
                     checked={rows.length > 0 && rows.every((r) => checked.has(r.id))}
                     onChange={() => setChecked(
                       rows.every((r) => checked.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)),
                     )} />
            </th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('생산공정코드')}>생산공정코드 {sort.mark('생산공정코드')}</th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('생산공정명')}>생산공정명 {sort.mark('생산공정명')}</th>
            <th style={{ width: 60, cursor: 'pointer' }} onClick={() => sort.toggle('순번')}>순번 {sort.mark('순번')}</th>
            <th>작업장</th>
            <th style={{ textAlign: 'right' }}>표준시간(분)</th>
            <th style={{ textAlign: 'right' }}>시간당비용</th>
            <th style={{ width: 110, textAlign: 'center' }}>사용</th>
            <th style={{ width: 60, textAlign: 'center' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                  return next
                })} />
              </td>
              {/* 원본은 코드·이름을 눌러 그 공정을 연다(사본 실측: 두 칸이 링크다). */}
              <td style={{ fontFamily: 'monospace' }}>
                <button type="button" onClick={() => openEdit(r)}
                        style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12.5 }}>
                  {r.code}
                </button>
              </td>
              <td>
                <button type="button" onClick={() => openEdit(r)}
                        style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5 }}>
                  {r.name}
                </button>
              </td>
              <td style={{ color: '#5a626e' }}>{r.sortOrder}</td>
              <td>{r.workcenter ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{r.stdTimeMin.toLocaleString()}</td>
              <td style={{ textAlign: 'right' }}>{r.costPerHr.toLocaleString()}</td>
              {/*
                원본 공정등록의 [사용중단/재사용]. 사용 여부는 진작 저장하고 있었는데
                화면에 없어서 아무도 내릴 수가 없었고, 서버도 그 값을 안 봤다.
              */}
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn no-ec" onClick={() => toggleActive(r)}
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer', fontSize: 11.5,
                          fontWeight: 700, color: r.active ? '#1c7c3c' : '#c07a00',
                        }}>
                  {r.active ? '사용' : '사용중단'}
                </button>
              </td>
              <td style={{ textAlign: 'center' }}>
                <button onClick={() => remove(r)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ textAlign: 'right', marginTop: 6, color: '#6b7280' }}>
        표준시간 합계: <b>{total.toLocaleString()}</b> 분
      </div>
    </EcListShell>
  )
}
