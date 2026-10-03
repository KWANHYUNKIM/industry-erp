import { useEffect, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import { useShortcut } from '../../utils/useShortcut'
import type { CollectData, CollectDocType } from '../../types/api'

/**
 * 데이터센터 › 수집데이터등록 (이카운트 C001401)
 *
 * <p>원본은 <b>이메일로 받은 문서를 어떤 조건으로 모을지</b>를 등록한다 — 수집대상 Email,
 * [수신문서](거래명세서 · 견적서 · 발주서)와 [보낸회사]. 문서마다 기본 줄이 하나씩 있어
 * (코드 없음 · 이름이 링크가 아님 · 체크박스 막힘) 각 …수집조회 화면으로 이어진다.
 *
 * <p>예전 이 화면은 <b>우리 API 엔드포인트 목록</b>(collect_sources)을 등록했다 — 원본에 없는 개념이라
 * 열(정렬 · 구분 · 엔드포인트 · 페이지 · 사용 · 관리)도 입력칸도 하나도 안 맞았다. 그 표는 데이터수집
 * 화면이 그대로 읽는다.
 */
const DOCS: { value: CollectDocType; name: string; sub: string }[] = [
  { value: 'STATEMENT', name: '거래명세서', sub: '영업관리' },
  { value: 'QUOTATION', name: '견적서', sub: '영업관리' },
  { value: 'PURCHASE_ORDER', name: '발주서', sub: '구매관리' },
]

const emptyForm = { code: '', name: '', docType: '' as CollectDocType | '', senderCompany: '' }

/* 원본 조건(Search(F3) 판): 데이터코드 · 데이터명 · 수집대상 · 최초작성자 · 최종수정자 · 최초작성일자 · 최종작업일자 · 기타 */
const emptyCond = { code: '', name: '', createdBy: '', updatedBy: '', madeFrom: '', madeTo: '', workedFrom: '', workedTo: '', byUpdated: false }

export default function CollectSourcePage() {
  const [rows, setRows] = useState<CollectData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [cond, setCond] = useState(emptyCond)
  const [picked, setPicked] = useState<Set<number>>(new Set())

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CollectData | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true); setError('')
    try { setRows((await api.get<CollectData[]>('/collect-data')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const inRange = (v: string | null, from: string, to: string) =>
    (!from || (v ?? '').slice(0, 10) >= from) && (!to || (v ?? '').slice(0, 10) <= to)
  const shown = rows
    .filter((r) => !keyword || (r.code ?? '').includes(keyword) || r.name.includes(keyword))
    .filter((r) => !cond.code || (r.code ?? '').includes(cond.code))
    .filter((r) => !cond.name || r.name.includes(cond.name))
    .filter((r) => !cond.createdBy || (r.createdBy ?? '').includes(cond.createdBy))
    .filter((r) => !cond.updatedBy || (r.updatedBy ?? '').includes(cond.updatedBy))
    .filter((r) => inRange(r.createdAt, cond.madeFrom, cond.madeTo))
    .filter((r) => inRange(r.updatedAt, cond.workedFrom, cond.workedTo))
  /* [수정일자순(정렬)] — 켜면 마지막으로 고친 줄이 위로 온다. */
  const ordered = cond.byUpdated
    ? [...shown].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    : shown

  async function openNew() {
    setEditing(null); setFormError('')
    let code = ''
    try { code = (await api.get<{ code: string }>('/collect-data/next-code')).data.code } catch { /* 저장할 때 서버가 매긴다 */ }
    setForm({ ...emptyForm, code }); setOpen(true)
  }
  function openEdit(r: CollectData) {
    setEditing(r); setFormError('')
    setForm({ code: r.code ?? '', name: r.name, docType: r.docType, senderCompany: r.senderCompany ?? '' })
    setOpen(true)
  }

  async function save(next: boolean) {
    if (saving) return
    if (!form.name.trim()) return setFormError('데이터명을 입력하세요.')
    if (!form.docType) return setFormError('수신문서를 고르세요.')
    setSaving(true); setFormError('')
    try {
      if (editing) {
        await api.put(`/collect-data/${editing.id}`, { name: form.name, senderCompany: form.senderCompany })
      } else {
        await api.post('/collect-data', { code: form.code, name: form.name, docType: form.docType, senderCompany: form.senderCompany })
      }
      await load()
      if (next) await openNew()
      else setOpen(false)
    } catch (err) { setFormError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }
  useShortcut('F8', () => save(false), open)

  async function removeOne() {
    if (!editing || !window.confirm('삭제하겠습니까?')) return
    try { await api.delete(`/collect-data/${editing.id}`); setOpen(false); load() }
    catch (err) { setFormError(extractErrorMessage(err)) }
  }

  const togglePick = (id: number) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const pickable = ordered.filter((r) => !r.builtIn)
  const allPicked = pickable.length > 0 && pickable.every((r) => picked.has(r.id))

  /* 원본 [선택삭제]는 안 고르고 누르면 '리스트에 선택된 자료가 없습니다.' 를 띄운다 — 우리는 미리 잠근다(ui-check 규칙). */
  async function removeChecked() {
    const ids = [...picked]
    if (ids.length === 0) return
    if (!window.confirm('삭제하겠습니까?')) return
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/collect-data/${id}`)))
    const failed = results.filter((r) => r.status === 'rejected').length
    setPicked(new Set())
    setError(failed ? `${failed}건은 삭제하지 못했습니다.` : '')
    load()
  }

  const setD = (k: keyof typeof emptyCond, v: string | boolean) => setCond((d) => ({ ...d, [k]: v }))

  return (
    <EcListShell title="수집데이터등록" collapseConditions onNew={openNew}
                 search={keyword} onSearchChange={setKeyword} onSearch={load}
                 actions={[{ label: '선택삭제', onClick: removeChecked, disabled: picked.size === 0 }]}>
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <ul className="ec-cond mb-[8px]">
        <EcCond label="데이터코드"><input className="ec-input w-[180px]" placeholder="데이터코드" value={cond.code} onChange={(e) => setD('code', e.target.value)} /></EcCond>
        <EcCond label="데이터명"><input className="ec-input w-[180px]" placeholder="데이터명" value={cond.name} onChange={(e) => setD('name', e.target.value)} /></EcCond>
        <EcCond label="수집대상"><label className="flex items-center gap-[4px]"><input type="radio" checked readOnly /> Email</label></EcCond>
        <EcCond label="최초작성자"><input className="ec-input w-[180px]" placeholder="최초작성자" value={cond.createdBy} onChange={(e) => setD('createdBy', e.target.value)} /></EcCond>
        <EcCond label="최종수정자"><input className="ec-input w-[180px]" placeholder="최종수정자" value={cond.updatedBy} onChange={(e) => setD('updatedBy', e.target.value)} /></EcCond>
        <EcCond label="최초작성일자">
          <input type="date" className="ec-input" value={cond.madeFrom} onChange={(e) => setD('madeFrom', e.target.value)} /> ~
          <input type="date" className="ec-input" value={cond.madeTo} onChange={(e) => setD('madeTo', e.target.value)} />
        </EcCond>
        <EcCond label="최종작업일자">
          <input type="date" className="ec-input" value={cond.workedFrom} onChange={(e) => setD('workedFrom', e.target.value)} /> ~
          <input type="date" className="ec-input" value={cond.workedTo} onChange={(e) => setD('workedTo', e.target.value)} />
        </EcCond>
        <EcCond label="기타"><label className="flex items-center gap-[4px]"><input type="checkbox" checked={cond.byUpdated} onChange={(e) => setD('byUpdated', e.target.checked)} /> 수정일자순(정렬)</label></EcCond>
      </ul>

      <table className="w-full ec-head700">
        <thead><tr>
          <th className="w-[44px] text-center">
            <input type="checkbox" checked={allPicked} disabled={pickable.length === 0}
                   onChange={() => setPicked(allPicked ? new Set() : new Set(pickable.map((r) => r.id)))} />
          </th>
          <th className="w-[12%]">데이터코드</th>
          <th className="w-[29%]">데이터명</th>
          <th className="w-[12%]">진행상태</th>
          <th>조건</th>
          <th className="w-[10%]">연결업무</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : ordered.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : ordered.map((r) => (
            <tr key={r.id}>
              <td className="text-center">
                <input type="checkbox" disabled={r.builtIn} checked={picked.has(r.id)} onChange={() => togglePick(r.id)} />
              </td>
              {/* 원본: 더한 줄만 코드 · 이름이 링크다(기본 줄은 열리지 않는다). */}
              <td>{r.builtIn ? '' : <a className="ec-link cursor-pointer" onClick={() => openEdit(r)}>{r.code}</a>}</td>
              <td>{r.builtIn ? r.name : <a className="ec-link cursor-pointer" onClick={() => openEdit(r)}>{r.name}</a>}</td>
              <td>{r.status}</td>
              <td>{r.condition}</td>
              <td>{r.linkedTask ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={open} title="수집데이터등록" error={formError} onClose={() => setOpen(false)} width={780}>
        <ul className="ec-form grid-cols-1">
          <li>
            <div className="title">데이터코드</div>
            <div className="form">
              {editing ? <span className="px-[5px]">{form.code}</span>
                : <input className="ec-input w-full" placeholder="데이터코드" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />}
            </div>
          </li>
          <li>
            <div className="title">데이터명</div>
            <div className="form"><input className="ec-input w-full" placeholder="데이터명" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </li>
          <li>
            <div className="title">수집대상</div>
            <div className="form flex-col items-stretch">
              <label className="flex items-center gap-[4px]"><input type="radio" checked readOnly disabled={!!editing} /> Email</label>
              <div className="flex items-center gap-[4px]">
                <span className="shrink-0 bg-ec-page text-ec-label rounded-ec px-[5px] py-[2px] text-[11px]">수신문서</span>
                <CodePickerField label="수신문서" hideLabel fill emptyLabel="" placeholder="수신문서" disabled={!!editing}
                                 value={form.docType} items={DOCS}
                                 onChange={(v) => setForm({ ...form, docType: v as CollectDocType })} />
              </div>
              <div className="flex items-center gap-[4px]">
                <span className="shrink-0 bg-ec-page text-ec-label rounded-ec px-[5px] py-[2px] text-[11px]">보낸회사</span>
                <input className="ec-input w-full" placeholder="보낸회사" value={form.senderCompany} onChange={(e) => setForm({ ...form, senderCompany: e.target.value })} />
              </div>
            </div>
          </li>
        </ul>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" onClick={() => save(false)} disabled={saving}>저장(F8)</button>
          {editing ? (
            <button className="ec-btn" onClick={removeOne}>삭제</button>
          ) : (<>
            <button className="ec-btn" onClick={() => save(true)} disabled={saving}>저장/신규</button>
            <button className="ec-btn" onClick={() => setForm({ ...emptyForm, code: form.code })}>다시작성</button>
          </>)}
          <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
