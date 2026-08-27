import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')
const inputCls = 'ec-input w-full'

interface DeptRow { id: number; name: string; code?: string | null }

/**
 * 관리 > <b>사원등록</b> (원본 기초등록의 [사원(담당)등록]).
 *
 * <p>이 화면은 제목이 '사원등록' 인데 <b>등록을 할 수가 없었다.</b> 목록과 기본급 수정만
 * 있었고 사원은 시드로만 존재했다 — 사람이 입사해도 넣을 자리가 없었다.
 * 서버에도 POST·PUT 이 아예 없었고 급여·부서만 따로 고치는 경로가 있었다.
 *
 * <p>사원은 <b>지우지 않는다.</b> 판매·구매·출하·작업지시의 담당자이고 급여·근태·인사기록의
 * 뿌리다. 지우면 지난 전표가 누구 것인지 잃는다. 퇴사하면 사용중단으로 내린다 —
 * 원본 마스터들이 전부 그렇게 한다([사용중단/재사용]).
 *
 * <p>퇴사일을 넣으면 사용중단이 함께 켜진다. 둘을 따로 두면 "퇴사일은 있는데 아직
 * 담당자로 뜨는" 사원이 생긴다.
 */
export default function EmployeePage() {
  const [rows, setRows] = useState<EmployeeMaster[]>([])
  const [depts, setDepts] = useState<DeptRow[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [value, setValue] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [includeInactive, setIncludeInactive] = useState(true)

  const empty = {
    code: '', name: '', departmentId: '', jobTitle: '',
    hireDate: '', resignDate: '', baseSalary: '',
  }
  const [form, setForm] = useState(empty)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    // 퇴사자까지 봐야 되살릴 수 있다 — /employees 는 재직자만 준다.
    api.get<EmployeeMaster[]>('/employees/all')
      .then((r) => setRows(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
    api.get<DeptRow[]>('/departments').then((r) => setDepts(r.data)).catch(() => setDepts([]))
  }

  useEffect(() => { load() }, [])

  function startEdit(e: EmployeeMaster) {
    setEditing(e.id)
    setValue(String(e.baseSalary))
  }

  async function saveSalary(e: EmployeeMaster) {
    try {
      await api.put(`/employees/${e.id}/base-salary`, { baseSalary: Number(value) || 0 })
      setEditing(null)
      flash(`${e.name} 기본급 저장`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  function openNew() {
    setEditId(null)
    setForm(empty)
    setShowForm(true)
  }

  function openEdit(e: EmployeeMaster) {
    setEditId(e.id)
    setForm({
      code: e.code, name: e.name,
      departmentId: e.departmentId ? String(e.departmentId) : '',
      jobTitle: e.jobTitle ?? '',
      hireDate: e.hireDate ?? '', resignDate: e.resignDate ?? '',
      baseSalary: String(e.baseSalary ?? 0),
    })
    setShowForm(true)
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    const body = {
      name: form.name.trim(),
      departmentId: form.departmentId ? Number(form.departmentId) : null,
      jobTitle: form.jobTitle.trim() || null,
      hireDate: form.hireDate || null,
      baseSalary: Number(form.baseSalary) || 0,
    }
    try {
      if (editId) {
        await api.put(`/employees/${editId}`, { ...body, resignDate: form.resignDate || null })
        flash(`${body.name} 저장`)
      } else {
        await api.post('/employees', { ...body, code: form.code.trim() })
        flash(`${body.name} 등록`)
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /** 원본 [사용중단/재사용]. 되살리면 퇴사일도 함께 지워진다(서버가 그렇게 한다). */
  async function toggleActive(e: EmployeeMaster) {
    try {
      await api.put(`/employees/${e.id}`, {
        name: e.name, departmentId: e.departmentId, jobTitle: e.jobTitle,
        hireDate: e.hireDate, baseSalary: e.baseSalary,
        resignDate: null, active: !e.active,
      })
      flash(`${e.name} ${e.active ? '사용중단' : '재사용'}`)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  const shown = rows.filter((e) => includeInactive || e.active)

  return (
    <EcListShell
      title="사원등록"
      onNew={openNew}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p style={{ marginBottom: 8, fontSize: 11.5, color: '#8a929c' }}>
        기본급을 클릭해 바로 고칠 수 있습니다. 급여계산 시 이 값이 기준이 됩니다.
        퇴사자는 지우지 않고 <b>사용중단</b>으로 내립니다 — 지난 전표의 담당자가 사라지면 안 됩니다.
      </p>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <label style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
        <input type="checkbox" checked={includeInactive}
               onChange={(e) => setIncludeInactive(e.target.checked)} />
        사용중단사원포함
      </label>

      <Modal open={showForm} title={editId ? '사원 수정' : '사원 등록'} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">사번 *</label>
              <input className={inputCls} value={form.code} disabled={!!editId}
                     onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="EMP-0005" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">성명 *</label>
              <input className={inputCls} value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <CodePickerField
                label="부서" placeholder="부서 선택" emptyLabel="선택 해제"
                value={form.departmentId}
                onChange={(v) => setForm({ ...form, departmentId: v })}
                items={depts.map((d) => ({ value: String(d.id), code: d.code ?? undefined, name: d.name }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">직위</label>
              <input className={inputCls} value={form.jobTitle}
                     onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">입사일</label>
              <input type="date" className={inputCls} value={form.hireDate}
                     onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">기본급</label>
              <input type="number" className={inputCls} value={form.baseSalary}
                     onChange={(e) => setForm({ ...form, baseSalary: e.target.value })} />
            </div>
            {editId && (
              <div>
                <label className="mb-1 block text-sm text-slate-600">퇴사일</label>
                <input type="date" className={inputCls} value={form.resignDate}
                       onChange={(e) => setForm({ ...form, resignDate: e.target.value })} />
                <p style={{ fontSize: 11, color: '#8a929c', marginTop: 3 }}>
                  넣으면 사용중단으로 함께 내려갑니다.
                </p>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
          </div>
        </form>
      )}</Modal>

      <table className="w-full text-left" style={{ maxWidth: 900 }}>
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th>사번</th>
            <th>성명</th>
            <th>부서</th>
            <th>직위</th>
            <th style={{ width: 110 }}>입사일</th>
            <th style={{ width: 110 }}>퇴사일</th>
            <th style={{ textAlign: 'right' }}>기본급</th>
            <th style={{ width: 90, textAlign: 'center' }}>사용</th>
            <th style={{ width: 130, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((e, i) => (
            <tr key={e.id} style={{ color: e.active ? undefined : '#9aa1ab' }}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{e.code}</td>
              <td>{e.name}</td>
              <td>{e.department}</td>
              <td>{e.jobTitle}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{e.hireDate ?? ''}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{e.resignDate ?? ''}</td>
              <td style={{ textAlign: 'right' }}>
                {editing === e.id
                  ? <input className="ec-input" type="number" value={value} onChange={(ev) => setValue(ev.target.value)} style={{ width: 120, textAlign: 'right' }} autoFocus />
                  : <span onClick={() => startEdit(e)} style={{ cursor: 'pointer' }}>{won(e.baseSalary)}</span>}
              </td>
              <td style={{ textAlign: 'center' }}>
                <button className="no-ec" onClick={() => toggleActive(e)}
                        style={{
                          border: 'none', background: 'none', cursor: 'pointer', fontSize: 11.5,
                          fontWeight: 700, color: e.active ? '#1c7c3c' : '#c07a00',
                        }}>
                  {e.active ? '사용' : '사용중단'}
                </button>
              </td>
              <td style={{ textAlign: 'center' }}>
                {editing === e.id
                  ? <div style={{ display: 'inline-flex', gap: 3 }}>
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => saveSalary(e)}>저장</button>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditing(null)}>취소</button>
                    </div>
                  : <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => openEdit(e)}>수정</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
