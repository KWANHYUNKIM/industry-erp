import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../../api/client'
import { ecAlert, ecConfirm } from '../../../components/EcDialog'

/**
 * 작업코드등록 — 원본 공정등록의 [작업코드등록] 버튼이 여는 자리.
 *
 * <p>공정 안에서 하는 작업들을 마스터로 둔다. BOR(작업소요시간)의 작업명을 자유입력으로
 * 두면 같은 작업이 '절단'·'절단작업'·'컷팅' 으로 여러 이름이 되고, 그러면 공정별 집계가
 * 갈라진다. 여기서 한 번 정해 두면 이름이 하나로 모인다.
 *
 * <p>별도 메뉴를 만들지 않았다 — 원본도 공정등록 화면에서 여는 자리다.
 * 원본은 공정등록 목록 <b>줄마다</b> [작업코드등록 [등록]] 이 있어 그 공정의 작업코드만 보이며 연다
 * (열: 작업코드 · 작업명 · 투입자원유형 · 작업기준품목, 2026-10-29 데이터이관 QA 79회). processId 를 주면 그렇게 연다.
 */
/** 투입자원유형 — 원본 실측 값은 '기계'. 서버 ProcessOperationService.RESOURCE_TYPES 와 같다. */
const RESOURCE_TYPES = ['기계', '인력', '외주']
/** 작업기준품목 — 원본 실측 생산품 · 소모품. */
const BASE_ITEMS = ['생산품', '소모품']
interface Row {
  id: number
  processId: number
  processCode: string
  processName: string
  code: string
  name: string
  seq: number
  resourceType: string | null
  baseItem: string | null
  active: boolean
}

/** active — 원본은 사용중단한 공정을 코드도움에 안 띄운다. */
interface ProcessRow { id: number; code: string; name: string; sortOrder: number; active: boolean }

export default function ProcessOperationModal({ processes, processId, onClose }: {
  processes: ProcessRow[]
  /** 공정등록 줄의 [등록] 으로 열면 그 공정의 작업코드만 보이고, 새 작업코드도 그 공정에 붙는다. */
  processId?: number
  onClose: () => void
}) {
  const [allRows, setRows] = useState<Row[]>([])
  const rows = processId == null ? allRows : allRows.filter((r) => r.processId === processId)
  const fixed = processId == null ? null : processes.find((p) => p.id === processId) ?? null
  const blank = { processId: processId == null ? '' : String(processId), code: '', name: '', seq: '1', resourceType: '', baseItem: '' }
  const [form, setForm] = useState(blank)
  const [editId, setEditId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setRows((await api.get<Row[]>('/process-operations')).data)
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const body = {
      processId: Number(form.processId),
      code: form.code, name: form.name,
      seq: Number(form.seq || 0),
      resourceType: form.resourceType || null, baseItem: form.baseItem || null, active: true,
    }
    try {
      if (editId != null) await api.put(`/process-operations/${editId}`, body)
      else await api.post('/process-operations', body)
      setForm({ ...blank, processId: form.processId, seq: String(Number(form.seq || 0) + 1),
        resourceType: form.resourceType, baseItem: form.baseItem })
      setEditId(null)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  async function remove(r: Row) {
    if (!(await ecConfirm(`작업코드 '${r.code} ${r.name}' 을(를) 삭제할까요?`))) return
    try {
      await api.delete(`/process-operations/${r.id}`)
      load()
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 720, maxWidth: '92vw', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
        <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
          <span>작업코드등록{fixed ? ` — ${fixed.code} ${fixed.name}` : ''}</span>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
        <div className="p-[14px]">
          <p className="mt-0 mx-0 mb-[10px] text-[12px] text-ec-label">
            공정 안에서 하는 작업들입니다. BOR(작업소요시간)의 작업명을 여기서 골라 쓰면
            같은 작업이 여러 이름으로 갈라지지 않습니다.
          </p>
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

          <form onSubmit={submit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--ec-line-soft)' }}>
            <label className="text-[12.5px]">
              <div className="text-ec-label mb-[3px]">공정 *</div>
              <select className="ec-input" value={form.processId} style={{ width: 170 }} disabled={fixed != null}
                      onChange={(e) => setForm({ ...form, processId: e.target.value })}>
                <option value="">선택</option>
                {processes.filter((p) => p.active !== false).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="text-[12.5px]">
              <div className="text-ec-label mb-[3px]">작업코드 *</div>
              <input className="ec-input" value={form.code} style={{ width: 130 }}
                     onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="OP-010" />
            </label>
            <label className="text-[12.5px] flex-1 min-w-[140px]">
              <div className="text-ec-label mb-[3px]">작업명 *</div>
              <input className="ec-input w-full" value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="text-[12.5px]">
              <div className="text-ec-label mb-[3px]">투입자원유형</div>
              <select className="ec-input w-[100px]" value={form.resourceType}
                      onChange={(e) => setForm({ ...form, resourceType: e.target.value })}>
                <option value="">선택</option>
                {RESOURCE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="text-[12.5px]">
              <div className="text-ec-label mb-[3px]">작업기준품목</div>
              <select className="ec-input w-[100px]" value={form.baseItem}
                      onChange={(e) => setForm({ ...form, baseItem: e.target.value })}>
                <option value="">선택</option>
                {BASE_ITEMS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="text-[12.5px]">
              <div className="text-ec-label mb-[3px]">순서</div>
              <input className="ec-input text-right" type="number" value={form.seq} style={{ width: 80 }}
                     onChange={(e) => setForm({ ...form, seq: e.target.value })} />
            </label>
            <button type="submit" className="ec-btn ec-btn-primary">{editId ? '저장' : '추가'}</button>
            {editId != null && (
              <button type="button" className="ec-btn" onClick={() => {
                setEditId(null)
                setForm(blank)
              }}>취소</button>
            )}
          </form>

          <table className="ec-grid w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th>
                <th className="w-[140px]">공정명</th>
                <th className="w-[120px]">작업코드</th>
                <th>작업명</th>
                <th className="w-[100px]">투입자원유형</th>
                <th className="w-[100px]">작업기준품목</th>
                <th className="w-[70px] text-right">순서</th>
                <th className="w-[80px] text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="ec-empty">불러오는 중…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td>{r.processName}</td>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{r.resourceType ?? ''}</td>
                  <td>{r.baseItem ?? ''}</td>
                  <td className="text-right">{r.seq}</td>
                  <td className="text-center">
                    <button onClick={() => {
                      setEditId(r.id)
                      setForm({ processId: String(r.processId), code: r.code, name: r.name, seq: String(r.seq),
                        resourceType: r.resourceType ?? '', baseItem: r.baseItem ?? '' })
                    }} style={{ color: 'var(--ec-blue)', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>수정</button>
                    <button onClick={() => remove(r)} style={{ color: 'var(--ec-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
