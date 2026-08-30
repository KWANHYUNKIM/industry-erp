import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { EcCond } from '../../components/EcStatusPanel'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster } from '../../api/types'
import { dateText } from '../../utils/dateText'

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

  /*
   * <b>거르는 자리가 [사용중단사원포함] 체크 하나뿐이었다.</b> 사원이 쌓이면 사번이나 이름으로
   * 좁힐 수가 없어 표를 눈으로 훑어야 했다. 원본 조건 셋을 만든다 —
   * 사원(담당)코드 · 사원(담당)명 · 사용구분.
   *
   * <p>나머지(검색창내용 · 적요 · 담당자연락처 · 담당자Email · 추가항목3~6)는 우리 사원에
   * 그 칸이 없다. 사용구분은 이미 있는 체크와 <b>같은 뜻</b>이라, 체크를 조건으로 옮기고
   * [전체]를 기본으로 둔다 — 지금 보이던 목록이 그대로다.
   */
  const [codeCond, setCodeCond] = useState('')
  const [nameCond, setNameCond] = useState('')

  const shownRows = rows
    .filter((e) => includeInactive || e.active)
    .filter((e) => !codeCond || e.code.includes(codeCond))
    .filter((e) => !nameCond || e.name.includes(nameCond))

  /*
   * 사본의 사원(담당)등록 격자는 <b>코드·이름·사용</b>에 정렬 표시를 단다(부서등록의
   * 담당자 격자도 같은 열이다). 우리 [사번]·[성명]·[사용]이 그 세 칸이다.
   * 원본이 표시를 안 단 칸(부서·직위·입사일 …)에는 걸지 않았다 — 표시 없이 정렬되면
   * 이번에는 반대쪽 거짓말이 된다.
   */
  const sort = useTableSort(shownRows, {
    사번: (e) => e.code,
    성명: (e) => e.name,
    사용: (e) => (e.active ? '사용' : '중지'),
  })
  const shown = sort.sorted

  return (
    <EcListShell
      /* 메뉴는 이 화면을 <b>[사원(담당)등록]</b> 이라 부른다(원본 이름) — 제목도 같아야 한다.
         메뉴에서 누른 이름과 열린 화면의 이름이 다르면 잘못 들어온 줄 안다. */
      title="사원(담당)등록"
      onNew={openNew}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }, { label: '인쇄' }]}
    >
      <p style={{ marginBottom: 8, fontSize: 11.5, color: '#8a929c' }}>
        기본급을 클릭해 바로 고칠 수 있습니다. 급여계산 시 이 값이 기준이 됩니다.
        퇴사자는 지우지 않고 <b>사용중단</b>으로 내립니다 — 지난 전표의 담당자가 사라지면 안 됩니다.
      </p>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      {/* 원본 조건 차례: 사원(담당)코드 · 사원(담당)명 · … · 사용구분 (사본 실측) */}
      <ul className="ec-cond" style={{ marginBottom: 8 }}>
        <EcCond label="사원(담당)코드">
          <input className="ec-input" value={codeCond}
                 onChange={(e) => setCodeCond(e.target.value)} style={{ width: 120 }} />
        </EcCond>
        <EcCond label="사원(담당)명">
          <input className="ec-input" value={nameCond}
                 onChange={(e) => setNameCond(e.target.value)} style={{ width: 140 }} />
        </EcCond>
        <EcCond label="사용구분">
          <select className="ec-input" style={{ width: 110 }}
                  value={includeInactive ? '전체' : '사용'}
                  onChange={(e) => setIncludeInactive(e.target.value === '전체')}>
            <option>전체</option><option>사용</option>
          </select>
        </EcCond>
      </ul>

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
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('사번')}>사번 {sort.mark('사번')}</th>
            <th style={{ cursor: 'pointer' }} onClick={() => sort.toggle('성명')}>성명 {sort.mark('성명')}</th>
            <th>부서</th>
            <th>직위</th>
            <th style={{ width: 110 }}>입사일</th>
            <th style={{ width: 110 }}>퇴사일</th>
            <th style={{ textAlign: 'right' }}>기본급</th>
            <th style={{ width: 90, textAlign: 'center', cursor: 'pointer' }} onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
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
              <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{dateText(e.hireDate) || ''}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{dateText(e.resignDate) || ''}</td>
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
