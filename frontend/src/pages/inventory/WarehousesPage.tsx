import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import CodePickerField from '../../components/CodePickerField'
import type { Warehouse } from '../../types/api'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcHistoryButton from '../../components/EcHistory'
import EcFileDrop from '../../components/EcFileDrop'
import { useTableSort } from '../../utils/useTableSort'
import { ecAlert, ecConfirm } from '../../components/EcDialog'
import NumCheck from '../../components/NumCheck'

const inputCls = 'ec-input w-full'

/**
 * 원본 창고등록리스트의 [구분]. 실제 자료에서 '창고'/'공장' 이 쓰였고,
 * 공장인 곳에는 생산공정이 붙어 있었다(반제품제조=반제품공정).
 */
const KINDS = ['창고', '공장', '외주'] as const

/** active — 원본은 사용중단한 공정을 코드도움에 안 띄운다. */
interface ProcessRow { id: number; code: string; name: string; active: boolean }
interface PartnerRow { id: number; code: string; name: string; type: string }


export default function WarehousesPage() {
  const [useCond, setUseCond] = useState<'전체' | '사용' | '중단'>('사용')
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /**
   * 마지막 [저장] 이 창고명이 비어 막혔는가. 원본(E040102 2026-10-13 실측)은 글 없이
   * 창고명 칸에 빨간 테두리를 두르고 탭에 빨간 '!' 를 단다. 저장하면 말 없이 창을 닫는다.
   */
  const [invalid, setInvalid] = useState(false)
  const [showForm, setShowForm] = useState(false)
  /** 원본 창고등록리스트의 [사용중단/재사용]에 쓸 줄 고르기. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [form, setForm] = useState({ code: '', name: '', location: '', kind: '창고', processId: '', outsourcingPartnerId: '' })
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [partners, setPartners] = useState<PartnerRow[]>([])
  /**
   * 고치는 중인 창고. <b>수정이 아예 없었다</b> — 이름이나 위치를 잘못 넣으면
   * 지우고 다시 만들어야 했고, 전표가 물려 있으면 지울 수도 없었다.
   * 원본은 목록에서 <b>창고코드·창고명을 눌러</b> 그 자리에서 연다.
   */
  const [editId, setEditId] = useState<number | null>(null)
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

  /** 원본처럼 목록에서 눌러 연다. 코드는 못 고친다(전표가 그 코드로 묶여 있다). */
  function openEdit(w: Warehouse) {
    setEditId(w.id)
    setForm({
      code: w.code, name: w.name, location: w.location ?? '', kind: w.kind ?? '창고',
      processId: w.processId != null ? String(w.processId) : '',
      outsourcingPartnerId: w.outsourcingPartnerId != null ? String(w.outsourcingPartnerId) : '',
    })
    setShowForm(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) { setInvalid(true); return }
    setInvalid(false)
    try {
      const body = {
        name: form.name, location: form.location, kind: form.kind,
        processId: form.kind === '공장' && form.processId ? Number(form.processId) : null,
        outsourcingPartnerId: form.kind === '외주' && form.outsourcingPartnerId
          ? Number(form.outsourcingPartnerId) : null,
      }
      if (editId) {
        /* 창고코드는 전표가 그 코드로 묶여 있어 못 고친다 — 수정 요청도 코드를 안 받는다. */
        await api.put(`/warehouses/${editId}`, { ...body, active: warehouses.find((w) => w.id === editId)?.active })
      } else {
        await api.post('/warehouses', { code: form.code, ...body })
      }
      setEditId(null)
      setForm({ code: '', name: '', location: '', kind: '창고', processId: '', outsourcingPartnerId: '' })
      setShowForm(false)
      load()
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }

  /**
   * 원본 창고등록리스트의 [사용중단/재사용]. 고른 창고를 한 번에 세운다.
   *
   * <p>고른 것이 모두 사용중단이면 되살리고, 하나라도 살아 있으면 중단한다.
   * 그 창고를 <b>통째로 다시 보낸다</b> — 수정은 통째로 덮으므로 몇 칸만 보내면
   * 위치·생산공정·외주거래처가 조용히 지워진다. 값은 그대로 넘긴다(null 을 '' 로
   * 바꾸면 '안 적었다' 와 '비워 두었다' 가 뒤섞인다).
   */
  async function toggleActive() {
    const targets = warehouses.filter((w) => checked.has(w.id))
    if (targets.length === 0) { void ecAlert(NO_PICK); return }
    const reviving = targets.every((w) => !w.active)
    await setActive(targets, reviving)
  }

  /** 원본 리스트 버튼이 고른 줄 없이 눌렸을 때의 알림(창고등록리스트 E040102 실측 — 거래처리스트와 같은 글). */
  const NO_PICK = '리스트에 선택된 자료가 없습니다.\n체크박스에 체크한 후 다시 시도 바랍니다.'

  /** 펼침의 [사용중단] · [재사용] — 고른 줄만. */
  async function setActiveChecked(active: boolean) {
    const targets = warehouses.filter((w) => checked.has(w.id))
    if (targets.length === 0) { void ecAlert(NO_PICK); return }
    await setActive(targets, active)
  }

  async function setActive(targets: Warehouse[], reviving: boolean) {
    setError('')
    const results = await Promise.allSettled(targets.map((w) => api.put(`/warehouses/${w.id}`, {
      name: w.name, location: w.location, kind: w.kind,
      processId: w.processId, outsourcingPartnerId: w.outsourcingPartnerId,
      active: reviving,
    })))
    const failed = results.filter((r) => r.status === 'rejected').length
    setChecked(new Set())
    await load()
    if (failed > 0) setError(`${targets.length - failed}건 ${reviving ? '재사용' : '사용중단'}, ${failed}건 실패.`)
  }

  /**
   * 원본은 줄마다 [삭제] 가 없다 — 체크한 줄을 [사용중단/재사용 ▴] 펼침(사용중단 · 삭제 · 재사용)의 [삭제] 로 지운다.
   * 확인 창 '삭제하겠습니까?', 지운 뒤에는 말 없이 목록만 다시 그린다(거래처리스트와 같은 틀).
   */
  async function removeChecked() {
    const targets = warehouses.filter((w) => checked.has(w.id))
    if (targets.length === 0) { void ecAlert(NO_PICK); return }
    if (!(await ecConfirm('삭제하겠습니까?'))) return
    try {
      for (const w of targets) await api.delete(`/warehouses/${w.id}`)
    } catch (err) {
      void ecAlert(extractErrorMessage(err))
    }
    setChecked(new Set())
    load()
  }

  /** 수정 창의 [사용중단/재사용] — 열어 둔 창고 하나를 뒤집고 창을 닫는다. */
  async function toggleOne(id: number) {
    const w = warehouses.find((x) => x.id === id)
    if (!w) return
    await setActive([w], !w.active)
    setShowForm(false)
    setEditId(null)
  }

  /**
   * 원본 [신규] 는 창고코드에 다음 번호를 채운다(loginaa: 00000 · 00001 이 있으면 00002 — 자릿수를 지킨다).
   * 다섯 자리 숫자 코드 중 가장 큰 것 + 1, 없으면 00001.
   */
  function nextCode() {
    const nums = warehouses.map((w) => w.code).filter((c) => /^\d{5}$/.test(c)).map(Number)
    return String(nums.length ? Math.max(...nums) + 1 : 1).padStart(5, '0')
  }


  /*
   * 원본 창고등록도 머리를 눌러 정렬한다 — 사본이 정렬 표시를 단 여섯 칸
   * (창고코드·창고명·구분·생산공정명·외주거래처명·사용)을 그대로 옮겼다.
   * 우리는 그중 셋에 <b>▼ 만 그려 놓고</b> 정렬은 없었다.
   * 공정·외주거래처 이름은 화면이 붙이므로, 정렬도 <b>붙인 이름</b>으로 한다 —
   * id 로 정렬하면 눈에 보이는 차례와 어긋난다.
   */
  const sort = useTableSort(warehouses, {
    창고코드: (w) => w.code,
    창고명: (w) => w.name,
    구분: (w) => w.kind,
    생산공정명: (w) => processes.find((pr) => pr.id === w.processId)?.name,
    외주거래처명: (w) => partners.find((pt) => pt.id === w.outsourcingPartnerId)?.name,
    사용: (w) => (w.active ? '사용' : '사용중단'),
  })
  const shown = sort.sorted.filter((w) => useCond === '전체' || (w.active ? '사용' : '중단') === useCond)

  return (
    <EcListShell
      title="창고등록리스트"
      onNew={() => { setEditId(null); setInvalid(false); setForm({ code: nextCode(), name: '', location: '', kind: '창고', processId: '', outsourcingPartnerId: '' }); setShowForm(true) }}
      actions={[{ label: '계층그룹', onClick: () => setGroupOpen(true) },
                /* 원본 펼침: 사용중단 · 삭제 · 재사용(E040102 실측). */
                { label: `사용중단/재사용${checked.size ? ` (${checked.size})` : ''}`, onClick: toggleActive, menu: [
                  { label: '사용중단', onClick: () => setActiveChecked(false) },
                  { label: '삭제', onClick: removeChecked },
                  { label: '재사용', onClick: () => setActiveChecked(true) },
                ] },
                { label: 'Excel' },
                { label: '웹자료올리기', onClick: () => setWebOpen(true) }]}
    >
      {error && <p className="mb-2 rounded bg-ec-danger-bg px-3 py-2 text-sm text-ec-danger">{error}</p>}

      <Modal error={error} open={showForm} title={editId ? '창고수정' : '창고등록'} onClose={() => { setShowForm(false); setEditId(null) }}>{(
        <form onSubmit={submit} style={{ marginTop: 8, marginBottom: 8, border: '1px solid var(--ec-border)', background: '#fff', padding: 14 }}>
          <div className="text-[13px] font-extrabold text-ec-navy mb-[8px]">
            {editId ? '창고수정' : '창고등록'}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm text-ec-label">창고코드 *</label>
              {/* 코드는 전표가 그 값으로 묶여 있어 만들 때만 정한다(거래처·품목과 같다). */}
              <input className={inputCls} value={form.code} disabled={editId != null}
                     title={editId != null ? '전표가 코드로 묶여 있어 수정할 수 없습니다.' : undefined}
                     onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ec-label">창고명 *</label>
              <input className={`${inputCls} ${invalid && !form.name.trim() ? 'border-[color:var(--ec-text-danger)]' : ''}`}
                     aria-invalid={invalid && !form.name.trim()} placeholder="창고명"
                     value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ec-label">위치</label>
              <input className={inputCls} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-ec-label">구분</label>
              <select className={inputCls} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {/* 원본 이름표: 창고 · 공장 · 공장(외주비관리). 값은 그대로 '외주'. */}
                {KINDS.map((k) => <option key={k} value={k}>{k === '외주' ? '공장(외주비관리)' : k}</option>)}
              </select>
            </div>
            {/* 구분에 맞는 칸만 낸다. 창고인데 생산공정을 고르게 두면 뜻 없는 값이 쌓인다. */}
            {form.kind === '공장' && (
              <div>
                <label className="mb-1 block text-sm text-ec-label">생산공정</label>
                {/* 원본은 이 칸을 <b>코드도움</b>으로 받는다(사본 실측 525칸, 예외 없음) — 드롭다운은 항목이 늘면 못 찾는다. */}
                <CodePickerField label="생산공정" hideLabel fill pair placeholder="생산공정"
                                 emptyLabel="선택 안 함"
                                 value={form.processId} onChange={(v) => setForm({ ...form, processId: v })}
                                 items={processes.map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
              </div>
            )}
            {form.kind === '외주' && (
              <div>
                <label className="mb-1 block text-sm text-ec-label">외주거래처 *</label>
                {/* 원본은 이 칸을 <b>코드도움</b>으로 받는다(사본 실측 525칸, 예외 없음) — 드롭다운은 항목이 늘면 못 찾는다. */}
                <CodePickerField label="외주거래처 *" hideLabel fill placeholder="외주거래처"
                                 emptyLabel="선택하세요"
                                 value={form.outsourcingPartnerId} onChange={(v) => setForm({ ...form, outsourcingPartnerId: v })}
                                 items={partners.filter((pt) => pt.type !== 'CUSTOMER').map((x) => ({ value: String(x.id), code: x.code, name: x.name }))} />
              </div>
            )}
          </div>
          {/* 원본: 신규 저장(F8) · 다시 작성 · 웹자료올리기 · 닫기 / 수정 저장(F8) · 다시 작성 · 사용중단/재사용 · 닫기 · H(이력). */}
          <div className="mt-[12px] flex justify-end gap-[4px]">
            <button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button>
            <button type="button" className="ec-btn" onClick={() => setForm((f) => ({ ...f, name: '', location: '', kind: '창고', processId: '', outsourcingPartnerId: '' }))}>다시 작성</button>
            {editId != null
              ? <button type="button" className="ec-btn" onClick={() => toggleOne(editId)}>사용중단/재사용</button>
              : <button type="button" className="ec-btn" onClick={() => setWebOpen(true)}>웹자료올리기</button>}
            <button type="button" className="ec-btn" onClick={() => { setShowForm(false); setEditId(null) }}>닫기</button>
            <EcHistoryButton target="WAREHOUSE" id={editId} last />
          </div>
        </form>
      )}</Modal>

      <div className="overflow-x-auto">
      {/* 원본 조건 [사용구분]. 사용/중단이 표에는 찍히는데 거를 수가 없었다. */}
      <div className="flex items-center gap-[6px] mb-[8px] text-[12.5px] text-ec-label">
        <span>사용구분</span>
        <select className="ec-input" value={useCond} onChange={(e) => setUseCond(e.target.value as '전체' | '사용' | '중단')} style={{ width: 100 }}>
          <option>전체</option><option>사용</option><option>중단</option>
        </select>
      </div>

        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="w-[34px] text-center">
                <NumCheck tone="plain" no="" label="전체 선택"
                          on={warehouses.length > 0 && warehouses.every((w) => checked.has(w.id))}
                          onChange={() => setChecked(
                            warehouses.every((w) => checked.has(w.id)) ? new Set() : new Set(warehouses.map((w) => w.id)),
                          )} />
              </th>
              <th className="cursor-pointer" onClick={() => sort.toggle('창고코드')}>창고코드 {sort.mark('창고코드')}</th>
              <th className="cursor-pointer" onClick={() => sort.toggle('창고명')}>창고명 {sort.mark('창고명')}</th>
              <th className="w-[70px] text-center cursor-pointer" onClick={() => sort.toggle('구분')}>구분 {sort.mark('구분')}</th>
              <th className="text-center w-[120px] cursor-pointer" onClick={() => sort.toggle('생산공정명')}>생산공정명 {sort.mark('생산공정명')}</th>
              <th className="text-center w-[140px] cursor-pointer" onClick={() => sort.toggle('외주거래처명')}>외주거래처명 {sort.mark('외주거래처명')}</th>
              {/* 원본 창고등록리스트 열(loginaa E040102 2026-10-13 실측): 창고코드 · 창고명 · 구분 · 생산공정명 · 외주거래처명 · 사용. 위치 · 추가사업장명 · 관리 열은 없다. */}
              <th className="text-center cursor-pointer" onClick={() => sort.toggle('사용')}>사용 {sort.mark('사용')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="ec-empty">불러오는 중…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={7} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
            ) : (
              shown.map((w, i) => (
                <tr key={w.id} style={{ color: w.active ? undefined : 'var(--ec-text-hint)' }}>
                  <td className="text-center">
                    <NumCheck tone="plain" no={i + 1} label="선택" on={checked.has(w.id)} onChange={() => setChecked((prev) => {
                      const next = new Set(prev)
                      if (next.has(w.id)) next.delete(w.id); else next.add(w.id)
                      return next
                    })} />
                  </td>
                  {/* 원본은 코드·이름을 눌러 그 창고를 연다(사본 실측: 두 칸이 링크다). */}
                  <td>
                    <button type="button" onClick={() => openEdit(w)}
                            style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12.5 }}>
                      {w.code}
                    </button>
                  </td>
                  <td>
                    <button type="button" onClick={() => openEdit(w)}
                            style={{ color: 'var(--ec-blue)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5 }}>
                      {w.name}
                    </button>
                  </td>
                  <td style={{ textAlign: 'center', color: w.kind === '창고' ? 'var(--ec-label)' : 'var(--ec-blue-dark)', fontWeight: w.kind === '창고' ? 400 : 700 }}>
                    {w.kind}
                  </td>
                  {/* 이름은 화면이 붙인다 — 서버는 id 만 준다(inventory 가 다른 모듈을 참조할 수 없다). */}
                  <td className="text-center text-ec-label">
                    {processes.find((pr) => pr.id === w.processId)?.name ?? ''}
                  </td>
                  <td className="text-center text-ec-label">
                    {partners.find((pt) => pt.id === w.outsourcingPartnerId)?.name ?? ''}
                  </td>
                  {/* 원본은 'Yes' · 'No'(거래처리스트의 YES 와 다르다). */}
                  <td className="text-center">{w.active ? 'Yes' : 'No'}</td>
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
              <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
                <span>계층그룹 · 창고 위치별 분류</span>
                <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setGroupOpen(false)}>닫기</button>
              </div>
              <div className="p-[14px] text-[12.5px] text-ec-text">
                <p className="mt-0 mx-0 mb-[8px] text-ec-label">등록된 창고를 <b>위치</b> 기준으로 묶어 보여줍니다. 총 {warehouses.length}개 · {groups.size}개 그룹</p>
                {Array.from(groups.entries()).map(([g, list]) => (
                  <div key={g} className="mb-[10px] border border-ec-line-soft border-solid rounded-[3px]">
                    <div style={{ padding: '6px 10px', background: '#f5f8ff', fontWeight: 700, color: 'var(--ec-blue-dark)' }}>{g} <span className="text-ec-hint font-normal">({list.length})</span></div>
                    <div className="py-[6px] px-[10px] leading-[1.8]">
                      {list.map((w) => <span key={w.id} className="inline-block mr-[10px] text-ec-text">[{w.code}] {w.name}</span>)}
                    </div>
                  </div>
                ))}
                <p className="mt-[4px] mx-0 mb-0 text-[11.5px] text-ec-warn">* 사용자 정의 그룹/계층 저장은 백엔드 미연동입니다. 현재는 위치값 기준 분류만 제공합니다.</p>
              </div>
            </div>
          </div>
        )
      })()}

      {webOpen && (
        <div onClick={() => setWebOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 4, width: 520, maxWidth: '92vw', boxShadow: '0 10px 30px rgba(0,0,0,.2)' }}>
            <div className="py-[10px] px-[14px] border-b border-b-ec-line-soft border-solid font-extrabold text-[14px] flex items-center">
              <span>웹자료올리기 · 창고 대량 등록</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setWebOpen(false)}>닫기</button>
            </div>
            <div className="p-[14px] text-[12.5px] leading-[1.7] text-ec-text">
              <p className="mt-0 mx-0 mb-[8px]">엑셀/CSV 파일로 창고를 한 번에 등록하는 기능입니다. 파일을 고르면 형식을 미리 확인할 수 있습니다.</p>
              {/* 원본 [웹자료올리기] 도 끌어다 놓을 수 있다. 파일 선택 버튼은 그대로 둔다. */}
              <EcFileDrop
                hint="여기에 파일 놓기 (엑셀·CSV)"
                onFiles={(fs) => onPickFile({ target: { files: fs } } as unknown as React.ChangeEvent<HTMLInputElement>)}
              />
              {webFile && (
                <div className="mt-[10px] border border-ec-line-soft border-solid rounded-[3px] p-[10px] bg-ec-page">
                  <div><b>{webFile.name}</b> · 데이터 <b className="text-ec-navy">{webFile.total.toLocaleString()}</b>행 인식</div>
                  {webFile.head.length > 0 && <div className="mt-[4px] text-ec-label">헤더: {webFile.head.join(' · ')}</div>}
                </div>
              )}
              <div className="mt-[12px] flex items-center gap-[8px]">
                <button className="ec-btn" disabled title="서버 업로드 API 미구현" style={{ opacity: .55, cursor: 'default' }}>업로드 실행 (백엔드 미연동)</button>
                <span className="text-[11.5px] text-ec-warn">* 서버 일괄등록 API가 없어 미리보기까지만 제공합니다.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </EcListShell>
  )
}
