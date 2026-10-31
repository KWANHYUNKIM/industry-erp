import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import { extractErrorMessage } from '../../../api/client'
import type { Attendance } from '../../../types/api'
import { timeText } from '../../../utils/displayPrefs'
import { useDisplayPrefs } from '../../preference/displayPrefsStore'
import { pad2 } from '../../../utils/periods'

/** 시 고르기 — 원본은 '오전 2' 꼴(2026-10-14 실측). 0 ~ 11 오전, 12 ~ 23 오후(12 는 '오후 12'). */
const HOURS = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 && h >= 12 ? 12 : h % 12}` }))
const MINUTES = Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0'))

/**
 * 출/퇴근기록부(ID) E070305 — 달력의 날짜 칸을 누르면 뜨는 '출/퇴근기록부' 창(원본 960 × 458, 2026-10-14 실측).
 *
 * <p>칸 차례: 사용자 · 장소(처음 값 '사무실') + ☐외근 · 시간(누른 날 · 시 ▾ · 분 ▾ — 지금 시각이 처음 값) + ☐오전반차설정 · 사유.
 * 하단 [출근][닫기]. 지난날 칸도 같은 창이 뜨고 넣을 수 있다. 그날 출근이 이미 있으면 단추가 [퇴근] 이 된다 —
 * 원본에서 출근을 눌러 보지는 않았다(지울 수 없는 기록이라 — E070305.md '못 잼'). 그래서 퇴근 창 모양은 출근 창과 같게 둔다.
 */
/** [출근] · [퇴근] 이 보내는 것 — POST /attendances/record. 보내기는 화면이 한다. */
export interface AttendanceRecordBody { date: string; time: string; place: string; outsideWork: boolean; halfLeave: boolean; reason: string }

export default function AttendanceRecordModal({ date, userName, record, onClose, onSubmit }: {
  /** 누른 날 'YYYY-MM-DD' — null 이면 닫혀 있다. */
  date: string | null
  userName: string
  /** 그날 내 기록(있으면 [퇴근]) */
  record: Attendance | null
  onClose: () => void
  onSubmit: (body: AttendanceRecordBody) => Promise<void>
}) {
  const [now, setNow] = useState(() => new Date())
  // 머리의 지금 시각 — 원본 '오전 2:47:52'(기본값설정 12/24시간제)
  const { clock24 } = useDisplayPrefs()
  const [place, setPlace] = useState('사무실')
  const [outside, setOutside] = useState(false)
  const [hour, setHour] = useState(0)
  const [minute, setMinute] = useState('00')
  const [halfLeave, setHalfLeave] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  /* 창이 열릴 때마다 지금 시각 · 처음 값으로 */
  useEffect(() => {
    if (!date) return
    const d = new Date()
    setNow(d); setHour(d.getHours()); setMinute(pad2(d.getMinutes()))
    setPlace(record?.place ?? '사무실'); setOutside(record?.outsideWork ?? false); setHalfLeave(record?.halfLeave ?? false)
    setReason(''); setError('')
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [date, record])

  const clockOut = !!record?.clockIn && !record?.clockOut
  const done = !!record?.clockIn && !!record?.clockOut

  async function submit() {
    if (!date || saving) return
    setSaving(true); setError('')
    try {
      await onSubmit({ date, time: `${pad2(hour)}:${minute}`, place, outsideWork: outside, halfLeave, reason })
    } catch (err) { setError(extractErrorMessage(err)) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={!!date} title="출/퇴근기록부" width={960} error={error} onClose={onClose}>
      <div className="text-right text-[12px] text-ec-label mb-[6px]" aria-label="지금 시각">{timeText(now, clock24, true)}</div>
      <ul className="ec-form mb-[10px]">
        <li className="full">
          <div className="title">사용자</div>
          <div className="form">{userName} [ ]</div>
        </li>
        <li className="full">
          <div className="title">장소</div>
          <div className="form gap-[9px]">
            <input className="ec-input w-[240px]" aria-label="장소" value={place} disabled={clockOut || done} onChange={(e) => setPlace(e.target.value)} />
            <label className="inline-flex items-center gap-[4px] cursor-pointer">
              <input type="checkbox" checked={outside} disabled={clockOut || done} onChange={(e) => setOutside(e.target.checked)} />외근
            </label>
          </div>
        </li>
        <li className="full">
          <div className="title">시간</div>
          <div className="form gap-[6px]">
            <span>{date?.replaceAll('-', '/')}</span>
            <select className="ec-input w-[90px]" aria-label="시" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {HOURS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
            <select className="ec-input w-[64px]" aria-label="분" value={minute} onChange={(e) => setMinute(e.target.value)}>
              {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <label className="inline-flex items-center gap-[4px] cursor-pointer ml-[6px]">
              <input type="checkbox" checked={halfLeave} disabled={clockOut || done} onChange={(e) => setHalfLeave(e.target.checked)} />오전반차설정
            </label>
          </div>
        </li>
        <li className="full">
          <div className="title">사유</div>
          <div className="form"><input className="ec-input w-full" aria-label="사유" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </li>
      </ul>
      <div className="flex gap-[6px]">
        {!done && (
          <button type="button" className="ec-btn ec-btn-primary" disabled={saving} onClick={() => void submit()}>{clockOut ? '퇴근' : '출근'}</button>
        )}
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  )
}
