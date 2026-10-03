import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import { useShortcut } from '../../utils/useShortcut'

/**
 * Self-Customizing > 환경설정 > 기능설정 (원본 C000113).
 *
 * <p>원본은 [공통 · 회계 · 재고 · 관리 · 그룹웨어 · 데이터센터] 알약 아래 '○○ 공통설정' 판을 펴 두고,
 * 판 안에 ▼작은 묶음(국가 및 통화 · 부가세 …)마다 [이름(링크) · 값] 줄을 늘어놓는다.
 * 이름을 누르면 <b>그 묶음</b> 팝업이 떠서(제목 = 묶음 이름) 항목마다 ⊙이름 · 설명 · 입력칸을 보여 주고
 * [저장(F8)] [닫기] 로 끝난다. 저장은 마스터·설정관리자만 된다(우리는 SETTINGS 권한 — 없으면 403).
 *
 * <p><b>우리 ERP 가 실제로 가진 설정만 싣는다.</b> 원본 항목은 수십 개지만(영업주기 · 편집제한일자 · 전표자동생성 …)
 * 우리에게 그 동작이 없는 것을 줄로 그리면 바꿔도 아무 일이 없는 칸이 된다(옛 화면의 '(미적용)' 토글 다섯이 그랬다).
 * 고정값인 것(국가 · 부가세율 · 채권/채무 계정)은 값만 보이고 누를 수 없다.
 */

type TabKey = '공통' | '회계' | '재고' | '관리' | '그룹웨어' | '데이터센터'
const TABS: TabKey[] = ['공통', '회계', '재고', '관리', '그룹웨어', '데이터센터']

interface Preference { fiscalStart: string; [k: string]: unknown }

/** 값을 바꿀 수 있는 항목. 팝업에서 이 이름으로 입력칸을 고른다. */
type EditKey = 'fiscalStart'

interface Row { label: string; value: (p: Preference) => string; edit?: EditKey; desc?: string }
interface Group { title: string; rows: Row[] }
interface Section { title: string; groups: Group[] }

const fixed = (v: string) => () => v

const SHEET: Record<TabKey, Section[]> = {
  공통: [{
    title: '공통설정',
    groups: [
      { title: '국가 및 통화', rows: [
        { label: '국가', value: fixed('대한민국') },
        { label: '표준시간', value: fixed('(UTC +09:00) 서울') },
        { label: '기본통화', value: fixed('원') },
      ] },
      { title: '부가세', rows: [
        { label: '재고-부가세', value: fixed('매출 : 10 % / 매입 : 10 %') },
      ] },
    ],
  }],
  회계: [{
    title: '회계 공통설정',
    groups: [
      { title: '기본', rows: [
        // 원본 기능설정에는 없는 줄 — 회계 장부·재무제표가 기초 기간을 이 달부터 잡는다(원본은 회사정보의 회계기수).
        { label: '회계연도 시작월', value: (p) => `${Number(p.fiscalStart)}월`, edit: 'fiscalStart',
          desc: '회계연도가 시작하는 달을 선택합니다. 장부·재무제표의 기초 기간이 이 달부터 잡힙니다.' },
      ] },
    ],
  }],
  재고: [{
    title: '재고 공통설정',
    groups: [
      { title: '채권채무관리', rows: [
        { label: '채권계정', value: fixed('외상매출금') },
        { label: '채무계정', value: fixed('외상매입금') },
      ] },
    ],
  }],
  관리: [],
  그룹웨어: [],
  데이터센터: [],
}

export default function PreferencesPage() {
  const [pref, setPref] = useState<Preference | null>(null)
  const [tab, setTab] = useState<TabKey>('공통')
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [find, setFind] = useState('')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Group | null>(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      const r = await api.get<Preference | null>('/preferences')
      setPref({ fiscalStart: '01', ...(r.data ?? {}) })
    } catch (err) {
      setError(extractErrorMessage(err))
    }
  }
  useEffect(() => { load() }, [])

  const sections = SHEET[tab]
  const keys = sections.flatMap((s) => [s.title, ...s.groups.map((g) => `${s.title}/${g.title}`)])
  const allFolded = keys.length > 0 && keys.every((k) => folded.has(k))
  const flip = (k: string) => setFolded((f) => { const n = new Set(f); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const match = (r: Row) => !query || r.label.includes(query)

  return (
    <div className="flex flex-col min-h-[100%]">
      <div className="ec-page-head">
        <h1 className="ec-page-title off">기능설정</h1>
        <div className="tools">
          <input className="ec-input w-[150px]" placeholder="입력 후 [Enter]" value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setQuery(find.trim()) }} />
        </div>
      </div>

      {error && !editing && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="ec-pills mb-[6px]">
        {TABS.map((t) => (
          <button key={t} className={`ec-pill${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="flex justify-end mb-[6px]">
        <button className="ec-btn ec-btn-sm" disabled={keys.length === 0}
          onClick={() => setFolded(allFolded ? new Set() : new Set(keys))}>{allFolded ? '전체펼치기' : '전체접기'}</button>
      </div>

      {!pref ? <p className="ec-empty">불러오는 중…</p>
        : sections.length === 0 ? <p className="ec-empty">설정할 항목이 없습니다.</p>
        : sections.map((s) => (
          <div key={s.title} className="bg-ec-panel border-t-[0.5px] border-ec-blue mb-[10px]">
            <button className="flex items-center gap-[4px] w-full h-[34px] px-[9px] border-b-[0.5px] border-ec-line text-ec-text text-left"
              onClick={() => flip(s.title)}>
              <span className="text-[9px]">{folded.has(s.title) ? '▶' : '▼'}</span>{s.title}
            </button>
            {!folded.has(s.title) && (
              <div className="py-[18px] px-[9px]">
                {s.groups.filter((g) => g.rows.some(match)).map((g) => {
                  const k = `${s.title}/${g.title}`
                  return (
                    <div key={g.title} className="mb-[28px] last:mb-0">
                      <button className="flex items-center gap-[4px] h-[22px] mb-[5px] text-ec-ink" onClick={() => flip(k)}>
                        <span className="text-[9px]">{folded.has(k) ? '▶' : '▼'}</span>{g.title}
                      </button>
                      {!folded.has(k) && g.rows.filter(match).map((r) => (
                        <div key={r.label} className="flex items-center min-h-[28px] pl-[204px] mobile:pl-[20px] hover:bg-ec-row-hover">
                          <span className="w-[209px] shrink-0 mobile:w-[140px]">
                            {r.edit
                              ? <button className="text-ec-navy hover:underline" onClick={() => { setError(''); setEditing(g) }}>{r.label}</button>
                              : <span className="text-ec-navy" title="우리 ERP 에서는 고정값입니다.">{r.label}</span>}
                          </span>
                          <span>{r.value(pref)}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}

      {editing && pref && (
        <EditDialog group={editing} pref={pref} error={error}
          onError={setError}
          onClose={() => { setEditing(null); setError('') }}
          onSaved={(p) => { setPref(p); setEditing(null) }} />
      )}
    </div>
  )
}

/** 묶음 하나의 팝업. 원본처럼 ⊙이름 · 설명 · 입력칸을 항목마다 쌓고 [저장(F8)] [닫기] 로 끝난다. */
function EditDialog({ group, pref, error, onError, onClose, onSaved }: {
  group: Group; pref: Preference; error: string
  onError: (m: string) => void; onClose: () => void; onSaved: (p: Preference) => void
}) {
  const [form, setForm] = useState<Preference>(pref)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (saving) return
    setSaving(true); onError('')
    try {
      const r = await api.put<Preference>('/preferences', form)
      onSaved(r.data)
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  useShortcut('F8', save, !saving)

  return (
    <Modal open title={group.title} onClose={onClose} error={error} width={960}>
      {group.rows.map((r) => (
        <div key={r.label} className="pb-[10px] mb-[10px] border-b-[0.5px] border-ec-line last:border-b-0">
          <div className="mb-[2px]">⊙ {r.label}</div>
          {r.desc && <div className="pl-[13px] mb-[6px]">{r.desc}</div>}
          <div className="pl-[13px]">
            {r.edit === 'fiscalStart' ? (
              <select className="ec-input w-[120px]" value={form.fiscalStart}
                onChange={(e) => setForm((f) => ({ ...f, fiscalStart: e.target.value }))}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
                  .map((m) => <option key={m} value={m}>{Number(m)}월</option>)}
              </select>
            ) : <span>{r.value(form)}</span>}
          </div>
        </div>
      ))}
      <div className="ec-slip-footer">
        <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
