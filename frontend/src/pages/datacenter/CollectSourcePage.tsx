import { useEffect, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { EcCond } from '../../components/EcStatusPanel'
import { MenuButton } from '../../components/EcSlipShell'
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

/** 빈 필수칸 테두리 — 원본 div.validation(2026-10-13 실측). */
const MISSING = 'rounded-[6px] border-[length:var(--ec-hair)] border-[color:var(--ec-text-danger)]'

const emptyForm = { code: '', name: '', docType: '' as CollectDocType | '', senderCompany: '' }

/* 원본 조건(Search(F3) 판): 데이터코드 · 데이터명 · 수집대상 · 최초작성자 · 최종수정자 · 최초작성일자 · 최종작업일자 · 기타 */
const emptyCond = { code: '', name: '', createdBy: '', updatedBy: '', madeFrom: '', madeTo: '', workedFrom: '', workedTo: '', byUpdated: false }

/** 원본 이력 한 줄: 'yyyy/MM/dd 오후 h:mm:ss [사람]' — 마지막으로 저장한 때(없으면 처음 만든 때). */
function historyLine(r: CollectData | null): string {
  const at = r?.updatedAt ?? r?.createdAt
  if (!r || !at) return ''
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  const h = d.getHours()
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const who = r.updatedBy ?? r.createdBy ?? ''
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${ampm} ${h12}:${pad(d.getMinutes())}:${pad(d.getSeconds())} [${who}]`
}

/**
 * 원본 번호 칸(form-checkbox-numbered) — 번호가 곧 체크 칸이다(2026-10-13 실측: 18×17 · 둥글기 6 · 테두리 없음 ·
 * 흰 바탕에 --ec-icon 번호, 고르면 파랑). 머리 칸은 번호 없이 전체 선택.
 */
function NumCheck({ no, on, disabled, onChange, label }: { no: number | ''; on: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <label className={`relative inline-block align-middle ${disabled ? '' : 'cursor-pointer'}`}>
      <input type="checkbox" aria-label={label} checked={on} disabled={disabled} onChange={onChange}
             className="absolute inset-0 m-0 opacity-0 cursor-pointer disabled:cursor-default" />
      <span className={`inline-block w-[18px] h-[17px] leading-[17px] text-center rounded-[6px] ${
        on ? 'bg-ec-blue text-ec-panel' : 'bg-ec-panel text-ec-icon'}`}>{no}</span>
    </label>
  )
}

const CONFIRM_TITLE = '경고'

/**
 * 원본 [수신문서] 코드도움(2026-10-13 실측) — 창 이름 '수신문서검색', 격자 [구분1 | 문서명] 에서 구분1 은
 * 묶어 한 칸(영업관리: 거래명세서 · 견적서 / 구매관리: 발주서), 문서명이 링크, 오른쪽 위 검색칸, 아래 [닫기].
 * 칸 옆 ✕ 로 고른 것을 지운다.
 */
function DocPicker({ value, disabled, onChange }: { value: CollectDocType | ''; disabled: boolean; onChange: (v: CollectDocType | '') => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const name = DOCS.find((d) => d.value === value)?.name ?? ''
  const hits = DOCS.filter((d) => !q || d.name.includes(q) || d.sub.includes(q))
  const groups = [...new Set(hits.map((d) => d.sub))].map((sub) => ({ sub, docs: hits.filter((d) => d.sub === sub) }))
  return (
    <div className="flex flex-1 items-center">
      <button type="button" className="ec-btn ec-btn-sm shrink-0" title="수신문서 검색" disabled={disabled} onClick={() => { setQ(''); setOpen(true) }}>🔍</button>
      <input className="ec-input w-full" placeholder="수신문서" readOnly disabled={disabled} value={name}
             onClick={() => !disabled && setOpen(true)} />
      {value && !disabled && <button type="button" className="ec-btn ec-btn-sm shrink-0" title="지우기" onClick={() => onChange('')}>✕</button>}
      <Modal open={open} title="수신문서검색" onClose={() => setOpen(false)} width={780}>
        <div className="flex items-center justify-between mb-[6px]">
          <b>수신문서검색</b>
          <input className="ec-input w-[110px]" placeholder="검색어 [Enter]" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <table className="w-full">
          <thead><tr><th>구분1</th><th>문서명</th></tr></thead>
          <tbody>
            {groups.map((g) => g.docs.map((d, i) => (
              <tr key={d.value}>
                {i === 0 && <td rowSpan={g.docs.length} className="text-center">{g.sub}</td>}
                <td className="text-center"><a className="ec-link cursor-pointer" onClick={() => { onChange(d.value); setOpen(false) }}>{d.name}</a></td>
              </tr>
            )))}
          </tbody>
        </table>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
        </div>
      </Modal>
    </div>
  )
}

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
  const [historyOpen, setHistoryOpen] = useState(false)
  /* 원본은 빈 필수칸에 글자 없이 그 칸만 빨간 테두리(0.5px 빨강 --ec-text-danger · 둥글기 6)를 두르고 데이터명에 커서를 둔다. */
  const [missing, setMissing] = useState<{ name: boolean; doc: boolean }>({ name: false, doc: false })
  const nameRef = useRef<HTMLInputElement>(null)

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
    setEditing(null); setFormError(''); setMissing({ name: false, doc: false })
    let code = ''
    try { code = (await api.get<{ code: string }>('/collect-data/next-code')).data.code } catch { /* 저장할 때 서버가 매긴다 */ }
    setForm({ ...emptyForm, code }); setOpen(true)
  }
  function openEdit(r: CollectData) {
    setEditing(r); setFormError(''); setMissing({ name: false, doc: false })
    setForm({ code: r.code ?? '', name: r.name, docType: r.docType, senderCompany: r.senderCompany ?? '' })
    setOpen(true)
  }

  async function save(next: boolean) {
    if (saving) return
    const miss = { name: !form.name.trim(), doc: !form.docType }
    setMissing(miss)
    if (miss.name || miss.doc) { if (miss.name) nameRef.current?.focus(); return }
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

  /* 원본 삭제 확인은 브라우저 창이 아니라 화면 안의 작은 창이다: '삭제하겠습니까?' + [확인] [취소]. */
  const [confirmFor, setConfirmFor] = useState<null | 'one' | 'checked'>(null)
  async function removeOne() {
    if (!editing) return
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
                 actions={[{ label: '선택삭제', onClick: () => setConfirmFor('checked'), selected: picked.size }]}>
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
          {/* 원본 열 폭(1640 격자 실측): 번호 44 · 나머지가 1 : 2.5 : 1 : 3.5 : 1 (177 · 444 · 177 · 621 · 177). */}
          <th className="w-[44px] text-center">
            <NumCheck no="" label="전체 선택" on={allPicked} disabled={pickable.length === 0}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(pickable.map((r) => r.id)))} />
          </th>
          <th className="w-[10.8%]">데이터코드</th>
          <th className="w-[27.1%]">데이터명</th>
          <th className="w-[10.8%]">진행상태</th>
          <th>조건</th>
          <th className="w-[10.8%]">연결업무</th>
        </tr></thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="ec-empty">불러오는 중…</td></tr>
          ) : ordered.length === 0 ? (
            <tr><td colSpan={6} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : ordered.map((r, i) => (
            <tr key={r.id} className={picked.has(r.id) ? '[&>td]:bg-[var(--ec-bg-row-picked)]' : ''}>
              <td className="text-center">
                <NumCheck no={i + 1} label="선택" disabled={r.builtIn} on={picked.has(r.id)} onChange={() => togglePick(r.id)} />
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
            <div className="form"><div className={`flex w-full ${missing.name ? MISSING : ''}`}><input ref={nameRef} className="ec-input w-full" placeholder="데이터명" autoFocus onFocus={(e) => editing && e.target.select()} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div></div>
          </li>
          <li>
            <div className="title">수집대상</div>
            <div className="form flex-col items-stretch">
              <label className="flex items-center gap-[4px]"><input type="radio" checked readOnly disabled={!!editing} /> Email</label>
              <div className={`flex items-center gap-[4px] ${missing.doc ? MISSING : ''}`}>
                <span className="shrink-0 bg-ec-page text-ec-label rounded-ec px-[5px] py-[2px] text-[11px]">수신문서</span>
                <DocPicker value={form.docType} disabled={!!editing}
                           onChange={(v) => setForm({ ...form, docType: v })} />
              </div>
              <div className="flex items-center gap-[4px]">
                <span className="shrink-0 bg-ec-page text-ec-label rounded-ec px-[5px] py-[2px] text-[11px]">보낸회사</span>
                <input className="ec-input w-full" placeholder="보낸회사" value={form.senderCompany} onChange={(e) => setForm({ ...form, senderCompany: e.target.value })} />
              </div>
            </div>
          </li>
        </ul>
        {/* 원본 버튼줄 — 신규: [저장(F8)▴(저장/신규)] [다시작성] [닫기] · 수정: [저장(F8)] [삭제] [닫기] [H] */}
        <div className="flex gap-[4px] mt-[9px]">
          {editing ? (<>
            <button className="ec-btn ec-btn-primary" onClick={() => save(false)} disabled={saving}>저장(F8)</button>
            <button className="ec-btn" onClick={() => setConfirmFor('one')}>삭제</button>
            <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
            <button className="ec-btn" onClick={() => setHistoryOpen(true)}>H</button>
          </>) : (<>
            <MenuButton label="저장(F8)" className="ec-btn ec-btn-primary" up disabled={saving}
                        onMain={() => save(false)} items={[{ label: '저장/신규', onClick: () => save(true) }]} />
            <button className="ec-btn" onClick={() => setForm({ ...emptyForm, code: form.code })}>다시작성</button>
            <button className="ec-btn" onClick={() => setOpen(false)}>닫기</button>
          </>)}
        </div>
      </Modal>

      <Modal open={confirmFor !== null} title={CONFIRM_TITLE} onClose={() => setConfirmFor(null)} width={460}>
        <p className="min-h-[120px]">삭제하겠습니까?</p>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn ec-btn-primary" autoFocus onClick={() => {
            const which = confirmFor; setConfirmFor(null)
            if (which === 'one') removeOne(); else if (which === 'checked') removeChecked()
          }}>확인</button>
          <button className="ec-btn" onClick={() => setConfirmFor(null)}>취소</button>
        </div>
      </Modal>

      {/* 원본 [H] — '이력' 창에 마지막으로 저장한 때와 사람 한 줄(2026/10/12 오후 6:33:22 [GUEST]). 고치면 그 줄이 바뀐다. */}
      <Modal open={historyOpen} title="이력" error={error} onClose={() => setHistoryOpen(false)} width={780}>
        <table className="w-full">
          <tbody>
            <tr><td className="text-center">{historyLine(editing)}</td></tr>
          </tbody>
        </table>
        <div className="flex gap-[4px] mt-[9px]">
          <button className="ec-btn" onClick={() => setHistoryOpen(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
