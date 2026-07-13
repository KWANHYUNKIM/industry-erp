import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { EmployeeMaster } from '../../api/types'

const won = (n: number) => n.toLocaleString('ko-KR')

/** 사원등록 — 급여관리 기초등록. 기본급을 수정하면 급여계산에 반영된다. */
export default function EmployeePage() {
  const [rows, setRows] = useState<EmployeeMaster[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [value, setValue] = useState('')

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<EmployeeMaster[]>('/employees').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => { load() }, [])

  function startEdit(e: EmployeeMaster) {
    setEditing(e.id)
    setValue(String(e.baseSalary))
  }

  async function save(e: EmployeeMaster) {
    try {
      await api.put(`/employees/${e.id}/base-salary`, { baseSalary: Number(value) || 0 })
      setEditing(null)
      flash(`${e.name} 기본급 저장`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  return (
    <EcListShell title="사원등록" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <p style={{ marginBottom: 8, fontSize: 11.5, color: '#8a929c' }}>기본급을 클릭해 수정합니다. 급여계산 시 이 값이 기준이 됩니다.</p>
      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {notice && <div style={{ marginBottom: 6, padding: '5px 8px', fontSize: 12, borderRadius: 3, background: '#eef5ff', border: '1px solid #cfe0f5', color: '#2b5b91' }}>{notice}</div>}

      <table className="w-full text-left" style={{ maxWidth: 720 }}>
        <thead>
          <tr><th style={{ width: 34 }}></th><th>사번</th><th>성명</th><th>부서</th><th>직위</th><th style={{ textAlign: 'right' }}>기본급</th><th style={{ textAlign: 'center' }}>처리</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>사원이 없습니다.</td></tr>
          ) : rows.map((e, i) => (
            <tr key={e.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{e.code}</td>
              <td>{e.name}</td>
              <td>{e.department}</td>
              <td>{e.jobTitle}</td>
              <td style={{ textAlign: 'right' }}>
                {editing === e.id
                  ? <input className="ec-input" type="number" value={value} onChange={(ev) => setValue(ev.target.value)} style={{ width: 120, textAlign: 'right' }} autoFocus />
                  : <span onClick={() => startEdit(e)} style={{ cursor: 'pointer' }}>{won(e.baseSalary)}</span>}
              </td>
              <td style={{ textAlign: 'center' }}>
                {editing === e.id
                  ? <div style={{ display: 'inline-flex', gap: 3 }}>
                      <button className="ec-btn ec-btn-primary" style={{ height: 20, padding: '0 8px' }} onClick={() => save(e)}>저장</button>
                      <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditing(null)}>취소</button>
                    </div>
                  : <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => startEdit(e)}>수정</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
