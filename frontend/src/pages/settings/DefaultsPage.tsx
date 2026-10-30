import { useEffect, useState } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import Modal from '../../components/Modal'
import EcSettingSheet, { type SheetGroup, type SheetSection } from '../../components/EcSettingSheet'
import { useShortcut } from '../../utils/useShortcut'
import { DEFAULT_DISPLAY_PREFS, toDisplayPrefs, timeText, type DisplayPrefs } from '../../utils/displayPrefs'
import { resetDisplayPrefs } from '../../features/preference/displayPrefsStore'

/**
 * Self-Customizing > 환경설정 > 기본값설정 (원본 C001124).
 *
 * <p>원본은 [공통] 알약 하나 아래 '공통 기본값 설정 · 입력 기본값 설정 · 출력 기본값 설정 · 회계 기본값 설정'
 * 판을 펴 둔다. 틀은 기능설정과 같다 — 항목 이름을 누르면 창이 뜨고 [저장(F8)] [닫기].
 *
 * <p>고를 수 있는 것(원본 2026-10-22 실측 선택지 · 기본값, plans/self.md):
 * 0값표시 {표시, 표시안함(기본)} → 전표 출력물(utils/printDocument) 줄 칸의 0 을 공란으로 ·
 * 12/24시간제(기본 12 — 적용예시 '오전 0:03') → 근무조회 이력 작업일시 · 출/퇴근기록부 지금 시각 ·
 * 인쇄정렬 {왼쪽, 가운데(기본), 오른쪽} · 인쇄방향 {세로(기본), 가로} → 전표 출력물.
 * 고정값(코드에서 확인): 공급가액 · 부가세 반올림(trade/VatAllocator) · 급여 반올림(hr PayrollService) ·
 * 날짜형식(utils/dateText) · 천단위 콤마 · 소수점 점. 소수점 자리 · 주민번호 마스킹 · 인쇄 나머지 줄은 적용 화면을 아직 못 재 싣지 않는다.
 */
const TABS = ['공통'] as const

function today() {
  const d = new Date()
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

const ALIGN = [['LEFT', '왼쪽'], ['CENTER', '가운데'], ['RIGHT', '오른쪽']] as const
const ORIENT = [['PORTRAIT', '세로'], ['LANDSCAPE', '가로']] as const
const labelOf = (opts: readonly (readonly [string, string])[], v: string) => opts.find(([k]) => k === v)?.[1] ?? v
const EXAMPLE = new Date(2026, 9, 22, 0, 3)

function sheetOf(p: DisplayPrefs): Record<typeof TABS[number], SheetSection[]> {
  return {
    공통: [
      { title: '공통 기본값 설정', groups: [
        { title: '숫자형항목', rows: [
          { label: '금액소수점', value: '사용안함', popup: '소수점기본값',
            desc: '소수점이 기본설정이거나 별도의 양식이 없는 경우 적용할 기본값을 설정합니다.' },
          { label: '0값표시', value: p.zeroDisplay ? '표시' : '표시안함', editable: true },
          { label: '천단위구분기호', value: ',(콤마)', popup: '표시형태' },
          { label: '소수점구분기호', value: '.(점)', popup: '표시형태' },
        ] },
      ] },
      { title: '입력 기본값 설정', groups: [
        { title: '소수점이하 처리방법', popup: '소수점 자릿수', rows: [
          { label: '공급가액', value: '반올림', desc: '공급가액 계산시 금액 소수점 이하의 소수점이 있는 경우 처리방법을 설정합니다.' },
          { label: '부가세', value: '반올림', desc: '부가세 계산시 금액 소수점 이하의 소수점이 있는 경우 처리방법을 설정합니다.' },
          { label: '급여', value: '반올림', desc: '급여 계산시 금액 소수점 이하의 소수점이 있는 경우 처리방법을 설정합니다.' },
        ] },
        { title: '날짜 및 시간', rows: [{ label: '날짜형식', value: today(), popup: '날짜형식' }] },
      ] },
      { title: '출력 기본값 설정', groups: [
        { title: '날짜 및 시간', rows: [
          { label: '날짜형식', value: today(), popup: '날짜형식' },
          { label: '12/24시간제', value: `${p.clock24 ? '24' : '12'}시간제 (${timeText(EXAMPLE, p.clock24)})`, editable: true },
        ] },
        { title: '인쇄설정', rows: [
          { label: '인쇄정렬', value: labelOf(ALIGN, p.printAlign), editable: true },
          { label: '인쇄방향', value: labelOf(ORIENT, p.printOrientation), editable: true },
        ] },
      ] },
    ],
  }
}

export default function DefaultsPage() {
  const [pref, setPref] = useState<DisplayPrefs | null>(null)
  const [editing, setEditing] = useState<SheetGroup | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Partial<DisplayPrefs> | null>('/preferences')
      .then((r) => setPref(toDisplayPrefs(r.data)))
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  return (
    <EcSettingSheet title="기본값설정" tabs={TABS} sheet={sheetOf(pref ?? DEFAULT_DISPLAY_PREFS)} loading={!pref}
      onEdit={(g) => { setError(''); setEditing(g) }}>
      {error && !editing && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      {editing && pref && (
        <EditDialog group={editing.title} pref={pref} error={error} onError={setError}
          onClose={() => { setEditing(null); setError('') }}
          onSaved={(p) => { resetDisplayPrefs(); setPref(p); setEditing(null) }} />
      )}
    </EcSettingSheet>
  )
}

function Radios<V extends string | boolean>({ name, value, opts, onChange }: {
  name: string; value: V; opts: readonly (readonly [V, string])[]; onChange: (v: V) => void
}) {
  return (
    <div className="pl-[13px]">
      {opts.map(([v, l]) => (
        <label key={l} className="mr-[10px]">
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} /> {l}
        </label>
      ))}
    </div>
  )
}

/** 원본 창: 0값표시 · 12/24시간제 · 인쇄설정. */
function EditDialog({ group, pref, error, onError, onClose, onSaved }: {
  group: string; pref: DisplayPrefs; error: string
  onError: (m: string) => void; onClose: () => void; onSaved: (p: DisplayPrefs) => void
}) {
  const [form, setForm] = useState<DisplayPrefs>(pref)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof DisplayPrefs>(k: K) => (v: DisplayPrefs[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    if (saving) return
    setSaving(true); onError('')
    try {
      const r = await api.put<Partial<DisplayPrefs>>('/preferences', form)
      onSaved(toDisplayPrefs(r.data))
    } catch (err) {
      onError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  useShortcut('F8', save, !saving)

  // 창 제목은 원본 창 이름(2026-10-30 클릭 대조: 0값표시 → 「표시형태」 · 12/24시간제 → 「시간형식」 · 인쇄정렬 → 「인쇄설정」)
  const title = group === '숫자형항목' ? '표시형태' : group === '날짜 및 시간' ? '시간형식' : '인쇄설정'
  return (
    <Modal open title={title} onClose={onClose} error={error} width={960}>
      <div className="pb-[10px] mb-[10px]">
        {title === '표시형태' && <>
          <div className="mb-[2px]">⊙ 0값표시</div>
          <div className="pl-[13px] mb-[6px]">값이 0일 경우 0값 표시여부를 설정합니다. ※ 표시하지 않을 경우 공란으로 표시됩니다.</div>
          <Radios name="pref-zero" value={form.zeroDisplay} onChange={set('zeroDisplay')}
            opts={[[true, '표시'], [false, '표시안함']] as const} />
          {/* 같은 원본 창의 나머지 — 우리에게는 고정값 */}
          <div className="mb-[2px] mt-[10px]">⊙ 천단위구분기호</div>
          <div className="pl-[13px]"><input className="ec-input w-[120px]" disabled readOnly aria-label="천단위구분기호" value=",(콤마)" /></div>
          <div className="mb-[2px] mt-[10px]">⊙ 소수점구분기호</div>
          <div className="pl-[13px]"><input className="ec-input w-[120px]" disabled readOnly aria-label="소수점구분기호" value=".(점)" /></div>
        </>}
        {title === '시간형식' && <>
          <div className="mb-[2px]">⊙ 12/24시간제</div>
          <Radios name="pref-clock" value={form.clock24} onChange={set('clock24')}
            opts={[[false, '12시간제'], [true, '24시간제']] as const} />
          <div className="pl-[13px] mt-[6px]">적용예시 : {timeText(EXAMPLE, form.clock24)}</div>
        </>}
        {title === '인쇄설정' && <>
          <div className="mb-[2px]">⊙ 인쇄정렬</div>
          <Radios name="pref-align" value={form.printAlign} onChange={set('printAlign')} opts={ALIGN} />
          <div className="mb-[2px] mt-[10px]">⊙ 인쇄방향</div>
          <Radios name="pref-orient" value={form.printOrientation} onChange={set('printOrientation')} opts={ORIENT} />
        </>}
      </div>
      <div className="ec-slip-footer">
        <button className="ec-btn ec-btn-primary" onClick={save} disabled={saving}>저장(F8)</button>
        <button className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
