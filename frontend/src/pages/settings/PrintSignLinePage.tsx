import { useEffect, useState, useRef} from 'react'
import EcListShell from '../../components/EcListShell'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { api, extractErrorMessage } from '../../api/client'
import type { SignLine, SignSlot } from '../../types/api'

interface SlotForm { title: string; signerName: string }
const emptySlot = (): SlotForm => ({ title: '', signerName: '' })

/** 인쇄용 결재라인 — 출력물 우측 상단에 찍히는 담당/검토/승인 칸. 이름을 비우면 빈 칸으로 인쇄된다. */
export default function PrintSignLinePage() {
  const [rows, setRows] = useState<SignLine[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState<SignLine | 'new' | null>(null)

  const flash = (m: string) => { setNotice(m); window.setTimeout(() => setNotice(''), 2500) }

  function load() {
    setError('')
    api.get<SignLine[]>('/print-sign-lines').then((r) => setRows(r.data)).catch((e) => setError(extractErrorMessage(e)))
  }

  useEffect(() => { load() }, [])

  async function makeDefault(l: SignLine) {
    try { await api.post(`/print-sign-lines/${l.id}/default`); flash(`'${l.name}'을(를) 기본 결재란으로 지정했습니다.`); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  async function remove(l: SignLine) {
    if (!window.confirm(`'${l.name}' 결재란을 삭제할까요?`)) return
    try { await api.delete(`/print-sign-lines/${l.id}`); flash('삭제했습니다.'); load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  return (
    <EcListShell title="인쇄용 결재라인" actions={[{ label: 'Excel' }, { label: '인쇄' }]}>
      <div className="flex items-center gap-[6px] mb-[8px]">
        <button className="ec-btn ec-btn-primary" onClick={() => setEditing('new')}>+ 결재란 등록(F2)</button>
        <button className="ec-btn" onClick={load}>새로고침</button>
        <span className="ml-[8px] text-[12px] text-ec-hint">
          목록 화면의 [인쇄]는 <b>기본 결재란</b>을 출력물 우측 상단에 찍습니다. 결재자 이름을 비우면 도장을 찍을 빈 칸으로 나갑니다.
        </span>
      </div>

      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {notice && <div className="ec-alert ec-alert-info mb-[6px]">{notice}</div>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px]"></th>
            <th className="w-[200px]">서식명</th>
            <th>결재란 미리보기</th>
            <th className="w-[70px] text-center">기본</th>
            <th className="w-[70px] text-center">사용</th>
            <th>비고</th>
            <th className="w-[150px] text-center">처리</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : rows.map((l, i) => (
            <tr key={l.id}>
              <td className="text-center text-ec-hint">{i + 1}</td>
              <td style={{ fontWeight: l.defaultLine ? 700 : 400 }}>{l.name}</td>
              <td><SlotPreview slots={l.slots} /></td>
              <td className="text-center">
                {l.defaultLine
                  ? <span className="text-ec-blue font-bold">기본</span>
                  : <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => makeDefault(l)}>기본지정</button>}
              </td>
              <td style={{ textAlign: 'center', color: l.active ? 'var(--ec-success)' : 'var(--ec-text-hint)' }}>{l.active ? '사용' : '중지'}</td>
              <td className="text-[12px] text-ec-hint">{l.remark ?? ''}</td>
              <td className="text-center">
                <div className="inline-flex gap-[3px]">
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} onClick={() => setEditing(l)}>수정</button>
                  <button className="ec-btn" style={{ height: 20, padding: '0 8px', color: 'var(--ec-danger)' }} onClick={() => remove(l)}>삭제</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <SignLineForm
          line={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); flash('저장했습니다.'); load() }}
        />
      )}
    </EcListShell>
  )
}

/** 실제 인쇄되는 모양 그대로 보여준다 — 미리보기가 결과와 다르면 미리보기가 아니다. */
function SlotPreview({ slots }: { slots: SignSlot[] }) {

  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '인쇄 결재란', [])

  return (
    <table ref={tableRef} className="border-collapse w-auto">
      <thead>
        <tr>
          {slots.map((s) => (
            <th key={s.id} style={{ border: '1px solid var(--ec-line)', background: '#eff3f8', fontSize: 11, padding: '1px 10px' }}>{s.title}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {slots.map((s) => (
            <td key={s.id} className="border border-ec-line border-solid h-[28px] min-w-[52px] text-center text-[11px] align-bottom text-ec-label">
              {s.signerName ?? ''}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}

function SignLineForm({ line, onClose, onSaved }: {
  line: SignLine | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(line?.name ?? '')
  const [remark, setRemark] = useState(line?.remark ?? '')
  const [active, setActive] = useState(line?.active ?? true)
  const [defaultLine, setDefaultLine] = useState(line?.defaultLine ?? false)
  const [slots, setSlots] = useState<SlotForm[]>(
    line?.slots.length
      ? line.slots.map((s) => ({ title: s.title, signerName: s.signerName ?? '' }))
      : [{ title: '담당', signerName: '' }, { title: '검토', signerName: '' }, { title: '승인', signerName: '' }],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function setSlot(i: number, patch: Partial<SlotForm>) {
    setSlots((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  async function save() {
    setError('')
    if (!name.trim()) return setError('서식명을 입력하세요.')
    const payload = slots.filter((s) => s.title.trim())
    if (payload.length === 0) return setError('결재 칸을 1개 이상 넣으세요.')
    if (payload.length > 5) return setError('결재 칸은 5개까지입니다.')
    setSaving(true)
    try {
      const body = {
        name, remark: remark || undefined, active, defaultLine,
        slots: payload.map((s) => ({ title: s.title, signerName: s.signerName || undefined })),
      }
      if (line) await api.put(`/print-sign-lines/${line.id}`, body)
      else await api.post('/print-sign-lines', body)
      onSaved()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,36,68,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', width: 560, maxWidth: '94vw', border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 10px 40px rgba(20,36,68,0.3)' }}>
        <div className="flex items-center py-[12px] px-[16px] border-b border-b-ec-line border-solid bg-ec-page">
          <span className="font-extrabold text-ec-navy">{line ? '결재란 수정' : '결재란 등록'}</span>
          <span onClick={onClose} className="ml-auto cursor-pointer text-[18px] text-ec-hint">×</span>
        </div>
        <div className="p-[16px]">
          {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
          <table className="w-full text-left mb-[12px]">
            <tbody>
              <tr>
                <th className="w-[90px] bg-ec-page">서식명<span className="text-ec-danger">*</span></th>
                <td colSpan={3}><input className="ec-input" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">비고</th>
                <td colSpan={3}><input className="ec-input" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th className="bg-ec-page">설정</th>
                <td colSpan={3} className="text-[12.5px]">
                  <label className="mr-[14px]">
                    <input type="checkbox" checked={defaultLine} onChange={(e) => setDefaultLine(e.target.checked)} /> 기본 결재란으로 지정
                  </label>
                  <label>
                    <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> 사용
                  </label>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="font-bold text-[12.5px] mb-[4px]">결재 칸 (최대 5개)</div>
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px]"></th><th>칸 제목</th><th>결재자 이름 (비우면 빈 칸)</th><th className="w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {slots.map((s, i) => (
                <tr key={i}>
                  <td className="text-center text-ec-hint">{i + 1}</td>
                  <td><input className="ec-input" value={s.title} onChange={(e) => setSlot(i, { title: e.target.value })} style={{ width: '100%' }} placeholder="담당" /></td>
                  <td><input className="ec-input" value={s.signerName} onChange={(e) => setSlot(i, { signerName: e.target.value })} style={{ width: '100%' }} /></td>
                  <td className="text-center">
                    {slots.length > 1 && <button className="ec-btn" onClick={() => setSlots((ss) => ss.filter((_, idx) => idx !== i))}>×</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {slots.length < 5 && (
            <button className="ec-btn" style={{ marginTop: 8 }} onClick={() => setSlots((ss) => [...ss, emptySlot()])}>+ 칸 추가</button>
          )}
        </div>
        <div className="flex gap-[6px] py-[10px] px-[16px] border-t border-t-ec-line border-solid">
          <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장(F8)'}</button>
          <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
