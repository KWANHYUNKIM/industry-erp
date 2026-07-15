import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import type { CodeOption, Partner } from '../../api/types'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'

const inputCls = 'ec-input w-full'

const empty = {
  code: '', name: '', type: 'CUSTOMER', bizRegNo: '', ceoName: '',
  bizType: '', bizItem: '', manager: '', phone: '', address: '',
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [types, setTypes] = useState<CodeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...empty })
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
      const [p, t] = await Promise.all([
        api.get<Partner[]>('/partners'),
        api.get<CodeOption[]>('/meta/partner-types'),
      ])
      setPartners(p.data)
      setTypes(t.data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function set(f: keyof typeof form, v: string) {
    setForm((prev) => ({ ...prev, [f]: v }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await api.post('/partners', form)
      setForm({ ...empty })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(p: Partner) {
    if (!confirm(`거래처 '${p.name}'을(를) 삭제할까요?`)) return
    try {
      await api.delete(`/partners/${p.id}`)
      load()
    } catch (err) {
      alert(extractErrorMessage(err))
    }
  }

  const typeColor = (t: string) =>
    t === 'CUSTOMER' ? { bg: '#eef4ff', fg: 'var(--ec-blue)' }
      : t === 'SUPPLIER' ? { bg: '#eefaf0', fg: '#2f8401' }
        : { bg: '#f3eefb', fg: '#6b3fb0' }

  return (
    <EcListShell
      title="거래처등록 리스트"
      onNew={() => setShowForm(true)}
      actions={[{ label: '계층그룹', onClick: () => setGroupOpen(true) }, { label: 'Excel' }, { label: '웹자료올리기', onClick: () => setWebOpen(true) }]}
    >
      {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <Modal open={showForm} title="거래처등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)', marginBottom: 8 }}>새 거래처 등록</div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-slate-600">거래처코드 *</label>
              <input className={inputCls} value={form.code} onChange={(e) => set('code', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">상호 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">구분 *</label>
              <select className={inputCls} value={form.type} onChange={(e) => set('type', e.target.value)}>
                {types.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">사업자번호</label>
              <input className={inputCls} value={form.bizRegNo} onChange={(e) => set('bizRegNo', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">대표자</label>
              <input className={inputCls} value={form.ceoName} onChange={(e) => set('ceoName', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">담당자</label>
              <input className={inputCls} value={form.manager} onChange={(e) => set('manager', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">업태</label>
              <input className={inputCls} value={form.bizType} onChange={(e) => set('bizType', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">종목</label>
              <input className={inputCls} value={form.bizItem} onChange={(e) => set('bizItem', e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-600">연락처</label>
              <input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-sm text-slate-600">주소</label>
              <input className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
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
              <th>거래처코드 ▼</th>
              <th>거래처명 ▼</th>
              <th>구분 ▼</th>
              <th>사업자번호</th>
              <th>대표자</th>
              <th>담당자</th>
              <th>연락처</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>불러오는 중…</td></tr>
            ) : partners.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 거래처가 없습니다.</td></tr>
            ) : (
              partners.map((p, idx) => (
                <tr key={p.id}>
                  <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{idx + 1}</td>
                  <td style={{ fontFamily: 'monospace' }}>{p.code}</td>
                  <td>{p.name}</td>
                  <td><span style={{ background: typeColor(p.type).bg, color: typeColor(p.type).fg, padding: '1px 6px', borderRadius: 3, fontSize: 11.5, fontWeight: 600 }}>{p.typeName}</span></td>
                  <td>{p.bizRegNo ?? ''}</td>
                  <td>{p.ceoName ?? ''}</td>
                  <td>{p.manager ?? ''}</td>
                  <td>{p.phone ?? ''}</td>
                  <td>
                    <button onClick={() => remove(p)} style={{ color: '#c60a2e', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {groupOpen && (() => {
        // 현재 불러온 거래처를 구분(고객/공급/기타)별로 묶어 계층 형태로 보여준다
        const groups = new Map<string, Partner[]>()
        for (const p of partners) {
          const key = p.typeName || p.type
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(p)
        }
        return (
          <div onClick={() => setGroupOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 560, maxWidth: '92vw', maxHeight: '84vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
                <span>계층그룹 · 거래처 구분별 분류</span>
                <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setGroupOpen(false)}>닫기</button>
              </div>
              <div style={{ padding: 14, fontSize: 12.5, color: '#3c4553' }}>
                <p style={{ margin: '0 0 8px', color: '#5a626e' }}>등록된 거래처를 <b>구분</b> 기준으로 묶어 보여줍니다. 총 {partners.length}개 · {groups.size}개 그룹</p>
                {Array.from(groups.entries()).map(([g, list]) => (
                  <div key={g} style={{ marginBottom: 10, border: '1px solid #e6eaef', borderRadius: 3 }}>
                    <div style={{ padding: '6px 10px', background: '#f5f8ff', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>{g} <span style={{ color: '#8a929c', fontWeight: 400 }}>({list.length})</span></div>
                    <div style={{ padding: '6px 10px', lineHeight: 1.8 }}>
                      {list.map((p) => <span key={p.id} style={{ display: 'inline-block', marginRight: 10, color: '#3c4553' }}>[{p.code}] {p.name}</span>)}
                    </div>
                  </div>
                ))}
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#c07a00' }}>* 사용자 정의 그룹/계층 저장은 백엔드 미연동입니다. 현재는 구분값 기준 분류만 제공합니다.</p>
              </div>
            </div>
          </div>
        )
      })()}

      {webOpen && (
        <div onClick={() => setWebOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 520, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e6eaef', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center' }}>
              <span>웹자료올리기 · 거래처 대량 등록</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setWebOpen(false)}>닫기</button>
            </div>
            <div style={{ padding: 14, fontSize: 12.5, lineHeight: 1.7, color: '#3c4553' }}>
              <p style={{ margin: '0 0 8px' }}>엑셀/CSV 파일로 거래처를 한 번에 등록하는 기능입니다. 파일을 고르면 형식을 미리 확인할 수 있습니다.</p>
              <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={onPickFile} className="ec-input" style={{ padding: 4 }} />
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
