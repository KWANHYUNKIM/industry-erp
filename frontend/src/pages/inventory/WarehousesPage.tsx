import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { Warehouse } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcFileDrop from '../../components/EcFileDrop'
import { useAuth } from '../../auth/AuthContext'

const inputCls = 'ec-input w-full'

/**
 * 원본 창고등록리스트의 [구분]. 실제 자료에서 '창고'/'공장' 이 쓰였고,
 * 공장인 곳에는 생산공정이 붙어 있었다(반제품제조=반제품공정).
 */
const KINDS = ['창고', '공장', '외주'] as const

/** active — 원본은 사용중단한 공정을 코드도움에 안 띄운다. */
interface ProcessRow { id: number; name: string; active: boolean }
interface PartnerRow { id: number; code: string; name: string; type: string }

export default function WarehousesPage() {
  const { companyName } = useAuth()
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', location: '', kind: '창고', processId: '', outsourcingPartnerId: '' })
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [groupOpen, setGroupOpen] = useState(false)  // 계층그룹 모달
  const [webOpen, setWebOpen] = useState(false)      // 웹자료올리기 모달
  const [webFile, setWebFile] = useState<{ name: string; total: number; head: string[] } | null>(null)
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const text = await f.text()
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    setWebFile({ name: f.name, total: Math.max(0, lines.length - 1), head: (lines[0] ?? '').split(/[,\t]/).slice(0, 8) })
  }

  async function load() {
    setLoading(true)
    try {
      const [res, pr, pt] = await Promise.all([
        api.get<Warehouse[]>('/warehouses'),
        api.get<ProcessRow[]>('/processes'),
        api.get<PartnerRow[]>('/partners'),
      ])
      setWarehouses(res.data)
      setProcesses(pr.data)
      setPartners(pt.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/warehouses', {
        code: form.code, name: form.name, location: form.location, kind: form.kind,
        processId: form.kind === '공장' && form.processId ? Number(form.processId) : null,
        outsourcingPartnerId: form.kind === '외주' && form.outsourcingPartnerId
          ? Number(form.outsourcingPartnerId) : null,
      })
      setForm({ code: '', name: '', location: '', kind: '창고', processId: '', outsourcingPartnerId: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(w: Warehouse) {
    if (!confirm(`창고 '${w.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/warehouses/${w.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  return (
    <EcListShell
      title="창고등록 리스트"
      onNew={() => setShowForm(true)}
      actions={[{ label: '계층그룹', onClick: () => setGroupOpen(true) }, { label: 'Excel' }, { label: '웹자료올리기', onClick: () => setWebOpen(true) }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <Modal open={showForm} title="창고등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 창고 등록</div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">창고코드 *</label>
              <input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">창고명 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">위치</label>
              <input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">구분</label>
              <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </div>
            {/* 구분에 맞는 칸만 낸다. 창고인데 생산공정을 고르게 두면 뜻 없는 값이 쌓인다. */}
            {form.kind === '공장' && (
              <div>
                <label className="mb-1 block text-sm text-slate-600">생산공정</label>
                <select className={inputCls} value={form.processId}
                        onChange={(e) => setForm({ ...form, processId: e.target.value })}>
                  <option value="">선택 안 함</option>
                  {processes.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                </select>
              </div>
            )}
            {form.kind === '외주' && (
              <div>
                <label className="mb-1 block text-sm text-slate-600">외주거래처 *</label>
                <select className={inputCls} value={form.outsourcingPartnerId}
                        onChange={(e) => setForm({ ...form, outsourcingPartnerId: e.target.value })}>
                  <option value="">선택하세요</option>
                  {partners.filter((pt) => pt.type !== 'CUSTOMER').map((pt) => (
                    <option key={pt.id} value={pt.id}>[{pt.code}] {pt.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="ec-btn ec-btn-primary">등록</button>
          </div>
        </form>
      )}</Modal>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>창고코드 ▼</th>
              <th>창고명 ▼</th>
              <th style={{ width: 70, textAlign: 'center' }}>구분</th>
              <th style={{ width: 120 }}>생산공정명</th>
              <th style={{ width: 140 }}>외주거래처명</th>
              <th>위치</th>
              <th>사용 ▼</th>
              {/*
                원본 창고등록리스트의 마지막 열 [추가사업장명]. 사본에서는 모든 창고가
                <b>본 사업장(주식회사 팜인)</b> 하나로 찍혀 있다.
                우리에겐 추가사업장 마스터가 없다 — 그래서 지어내지 않고 <b>로그인한 회사</b>를
                그대로 적는다. 추가사업장을 만들면 그때 이 칸이 갈라진다.
              */}
              <th style={{ width: 150 }}>추가사업장명</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : warehouses.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 창고가 없습니다.</td></tr>
            ) : (
              warehouses.map((w, idx) => (
                <tr key={w.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{w.code}</td>
                  <td>{w.name}</td>
                  <td style={{ textAlign: 'center', color: w.kind === '창고' ? '#5a626e' : 'var(--ec-blue-dark)', fontWeight: w.kind === '창고' ? 400 : 700 }}>
                    {w.kind}
                  </td>
                  {/* 이름은 화면이 붙인다 — 서버는 id 만 준다(inventory 가 다른 모듈을 참조할 수 없다). */}
                  <td style={{ color: '#5a626e' }}>
                    {processes.find((pr) => pr.id === w.processId)?.name ?? ''}
                  </td>
                  <td style={{ color: '#5a626e' }}>
                    {partners.find((pt) => pt.id === w.outsourcingPartnerId)?.name ?? ''}
                  </td>
                  <td>{w.location ?? ''}</td>
                  <td>{w.active ? 'YES' : 'NO'}</td>
                  <td style={{ color: '#5a626e' }}>{companyName ?? ''}</td>
                  <td>
                    <button onClick={() => remove(w)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {groupOpen && (() => {
        // 창고를 위치(location)별로 묶어 계층 형태로 보여준다
        const groups = new Map<string, Warehouse[]>()
        for (const w of warehouses) {
          const key = w.location?.trim() || '위치 미지정'
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(w)
        }
        return (
          <div onClick={() => setGroupOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 560, maxWidth: '92vw', maxHeight: '84vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
                <span>계층그룹 · 창고 위치별 분류</span>
                <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setGroupOpen(false)}>닫기</button>
              </div>
              <div style={{ padding: 14, fontSize: 12.5, color: '#3c4553' }}>
                <p style={{ margin: '0 0 8px', color: '#5a626e' }}>등록된 창고를 <b>위치</b> 기준으로 묶어 보여줍니다. 총 {warehouses.length}개 · {groups.size}개 그룹</p>
                {Array.from(groups.entries()).map(([g, list]) => (
                  <div key={g} style={{ marginBottom: 10, border: '1px solid #e6eaef', borderRadius: 3 }}>
                    <div style={{ padding: '6px 10px', background: '#f5f8ff', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>{g} <span style={{ color: '#8a929c', fontWeight: 400 }}>({list.length})</span></div>
                    <div style={{ padding: '6px 10px', lineHeight: 1.8 }}>
                      {list.map((w) => <span key={w.id} style={{ display: 'inline-block', marginRight: 10, color: '#3c4553' }}>[{w.code}] {w.name}</span>)}
                    </div>
                  </div>
                ))}
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#c07a00' }}>* 사용자 정의 그룹/계층 저장은 백엔드 미연동입니다. 현재는 위치값 기준 분류만 제공합니다.</p>
              </div>
            </div>
          </div>
        )
      })()}

      {webOpen && (
        <div onClick={() => setWebOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 520, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>웹자료올리기 · 창고 대량 등록</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setWebOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <p style={{ margin: '0 0 8px' }}>엑셀/CSV 파일로 창고를 한 번에 등록하는 기능입니다. 파일을 고르면 형식을 미리 확인할 수 있습니다.</p>
              {/* 원본 [웹자료올리기] 도 끌어다 놓을 수 있다. 파일 선택 버튼은 그대로 둔다. */}
              <EcFileDrop
                hint="여기에 파일 놓기 (엑셀·CSV)"
                onFiles={(fs) => onPickFile({ target: { files: fs } } as unknown as React.ChangeEvent<HTMLInputElement>)}
              />
              {webFile && (
                <div style={{ marginTop: 10, border: '1px solid #e6eaef', borderRadius: 3, padding: 10, background: '#f9fbfd' }}>
                  <div><b>{webFile.name}</b> · 데이터 <b style={{ color: 'var(--ec-blue-dark)' }}>{webFile.total.toLocaleString()}</b>행 인식</div>
                  {webFile.head.length > 0 && <div style={{ marginTop: 4, color: '#5a626e' }}>헤더: {webFile.head.join(' · ')}</div>}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="ec-btn" disabled title="서버 업로드 API 미구현" style={{ opacity: .55, cursor: 'default' }}>업로드 실행 (백엔드 미연동)</button>
                <span style={{ fontSize: 11.5, color: '#c07a00' }}>* 서버 일괄등록 API가 없어 미리보기까지만 제공합니다.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </EcListShell>
  )
}
