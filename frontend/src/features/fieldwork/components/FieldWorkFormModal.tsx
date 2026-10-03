import { useEffect, useState } from 'react'
import Modal from '../../../components/Modal'
import CodePickerField from '../../../components/CodePickerField'
import { api, extractErrorMessage } from '../../../api/client'
import { ymd } from '../../../components/EcPeriodPicks'
import type { FieldWork } from '../../../types/api'
import { useShortcut } from '../../../utils/useShortcut'
import VehiclePicker from './VehiclePicker'

export interface FieldWorkUser { id: number; name: string; username: string }

type Form = {
  workDate: string; startTime: string; endTime: string; userId: string
  vehicleNo: string; vehicleName: string; usePurpose: string
  departure: string; destination: string; distance: string; purpose: string
  odometerBefore: string; odometerAfter: string
}

const hm = (t: string | null) => (t ?? '').slice(0, 5)

/**
 * 원본 '외근입력' 창 — 외근조회(E070254)의 [신규(F2)], 그리고 외근조회 · 외근현황(E070255)의 <b>[일자]를 누르면
 * 그 기록으로 열리는 같은 창</b>이다(2026-10-03 실측: 외근현황 '2026/09/07' 을 누르면 '외근입력' 이 그 값으로 뜨고
 * 하단이 [저장(F8)][삭제][닫기]). 두 화면이 같이 쓰므로 여기에 둔다.
 *
 * <p>신규: 일자 오늘 · 이동시간 09:00 ~ 10:00 · 사용자 = 나. 필수는 사용자 · 이동수단.
 * 고칠 때는 [다시 작성] 대신 [삭제]('삭제하겠습니까?')가 선다.
 */
export default function FieldWorkFormModal({ open, record, users, myUsername, onClose, onSaved }: {
  open: boolean
  /** 고칠 기록. null 이면 신규. */
  record: FieldWork | null
  users: FieldWorkUser[]
  myUsername?: string
  onClose: () => void
  /** 저장 · 삭제 뒤 — 목록을 다시 읽는다. */
  onSaved: () => void
}) {
  const blank = (): Form => {
    const me = users.find((u) => u.username === myUsername)
    return {
      workDate: ymd(new Date()), startTime: '09:00', endTime: '10:00', userId: me ? String(me.id) : '',
      vehicleNo: '', vehicleName: '', usePurpose: '', departure: '', destination: '', distance: '', purpose: '',
      odometerBefore: '', odometerAfter: '',
    }
  }
  const fromRecord = (r: FieldWork): Form => ({
    workDate: r.workDate, startTime: hm(r.startTime), endTime: hm(r.endTime), userId: String(r.userId),
    vehicleNo: r.vehicleNo ?? '', vehicleName: r.vehicleName ?? '', usePurpose: r.usePurpose ?? '',
    departure: r.departure ?? '', destination: r.destination ?? '',
    distance: r.distance != null ? String(r.distance) : '', purpose: r.purpose ?? '',
    odometerBefore: r.odometerBefore != null ? String(r.odometerBefore) : '',
    odometerAfter: r.odometerAfter != null ? String(r.odometerAfter) : '',
  })
  const [form, setForm] = useState<Form>(blank)
  const [error, setError] = useState('')
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) { setForm(record ? fromRecord(record) : blank()); setError('') } }, [open, record])

  /** 두 계기판 값이 다 있으면 운행거리는 주행후 − 주행전(원본과 같이 저절로). */
  const autoDistance = form.odometerBefore !== '' && form.odometerAfter !== ''
    ? String(Math.max(0, Number(form.odometerAfter) - Number(form.odometerBefore)))
    : null
  /** 차량을 고르면 [주행전 계기판거리]를 그 차량의 마지막 주행후 값으로 채운다(원본 실측). */
  async function fillOdometer(vehicleNo: string) {
    try {
      const r = await api.get<{ odometer: number | null }>('/field-works/last-odometer', { params: { vehicleNo } })
      if (r.data.odometer != null) setForm((f) => ({ ...f, odometerBefore: String(r.data.odometer) }))
    } catch { /* 못 받으면 비워 둔다 */ }
  }
  /** 원본 [이동수단] 코드도움(이동수단검색) */
  const [pickerOpen, setPickerOpen] = useState(false)
  useShortcut('F8', () => void submit(), open && !pickerOpen)

  async function submit() {
    setError('')
    if (!form.userId) return setError('사용자를 선택하세요.')
    if (!form.vehicleNo.trim()) return setError('이동수단을 입력하세요.')
    if (form.startTime && form.endTime && form.endTime < form.startTime) return setError('종료 시각이 시작 시각보다 빠를 수 없습니다.')
    const body = {
      workDate: form.workDate, startTime: form.startTime || null, endTime: form.endTime || null,
      userId: Number(form.userId), vehicleNo: form.vehicleNo, vehicleName: form.vehicleName || null,
      usePurpose: form.usePurpose || null, departure: form.departure || null,
      destination: form.destination || null, distance: form.distance ? Number(form.distance) : null,
      purpose: form.purpose || null,
      odometerBefore: form.odometerBefore ? Number(form.odometerBefore) : null,
      odometerAfter: form.odometerAfter ? Number(form.odometerAfter) : null,
    }
    try {
      if (record) await api.put(`/field-works/${record.id}`, body)
      else await api.post('/field-works', body)
      onClose()
      onSaved()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function remove() {
    if (!record || !window.confirm('삭제하겠습니까?')) return
    try {
      await api.delete(`/field-works/${record.id}`)
      onClose()
      onSaved()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  return (
    <Modal error={error} open={open} title="외근입력" width={780} onClose={onClose}>
      <ul className="ec-form mb-[10px]">
        <li>
          <div className="title">일자</div>
          <div className="form"><input type="date" className="ec-input w-[150px]" value={form.workDate} onChange={(e) => set('workDate', e.target.value)} /></div>
        </li>
        <li>
          <div className="title">이동시간</div>
          <div className="form">
            <input type="time" className="ec-input w-[110px]" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
            <span className="text-ec-label">~</span>
            <input type="time" className="ec-input w-[110px]" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
          </div>
        </li>
        <li className="wide">
          <div className="title">사용자</div>
          <div className="form">
            <CodePickerField label="사용자" hideLabel width={220} emptyLabel="선택 안 함" value={form.userId} onChange={(v) => set('userId', v)}
                             items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name }))} />
          </div>
        </li>
        <li className="wide">
          <div className="title">이동수단</div>
          <div className="form">
            <input className="ec-input w-[160px]" placeholder="이동수단" value={form.vehicleNo} onChange={(e) => set('vehicleNo', e.target.value)} />
            <button type="button" className="ec-btn ec-btn-sm" aria-label="이동수단검색" onClick={() => setPickerOpen(true)}>🔍</button>
            <input className="ec-input flex-1" placeholder="이동수단명" value={form.vehicleName} onChange={(e) => set('vehicleName', e.target.value)} />
          </div>
          {/*
            원본(2026-10-03 실측): 이동수단을 고르면 그 아래 세 줄 — [주행전 계기판거리](그 차량의 마지막 주행후 값으로 채움 ·
            16,500) · [주행후 계기판거리] · [운행거리](둘을 다 넣으면 주행후 − 주행전으로 저절로 · 500).
          */}
          {form.vehicleNo && (
            <div className="form flex-col items-stretch gap-[4px] mt-[4px]">
              <label className="flex items-center gap-[6px]">
                <span className="w-[120px] text-ec-label">주행전 계기판거리</span>
                <input type="number" min={0} step="0.01" className="ec-input flex-1 text-right" placeholder="주행전 계기판거리"
                       value={form.odometerBefore} onChange={(e) => set('odometerBefore', e.target.value)} />
              </label>
              <label className="flex items-center gap-[6px]">
                <span className="w-[120px] text-ec-label">주행후 계기판거리</span>
                <input type="number" min={0} step="0.01" className="ec-input flex-1 text-right" placeholder="주행후 계기판거리"
                       value={form.odometerAfter} onChange={(e) => set('odometerAfter', e.target.value)} />
              </label>
              <label className="flex items-center gap-[6px]">
                <span className="w-[120px] text-ec-label">운행거리</span>
                <input type="number" min={0} step="0.01" className="ec-input flex-1 text-right" placeholder="운행거리"
                       value={autoDistance ?? form.distance} readOnly={autoDistance != null}
                       onChange={(e) => set('distance', e.target.value)} />
              </label>
            </div>
          )}
        </li>
        <li className="wide">
          <div className="title">사용목적명</div>
          <div className="form"><input className="ec-input w-full" placeholder="사용목적명" value={form.usePurpose} onChange={(e) => set('usePurpose', e.target.value)} /></div>
        </li>
        <li className="wide">
          <div className="title">출발지 주소</div>
          <div className="form"><input className="ec-input w-full" placeholder="출발지 주소" value={form.departure} onChange={(e) => set('departure', e.target.value)} /></div>
        </li>
        <li className="wide">
          <div className="title">도착지 주소</div>
          <div className="form"><input className="ec-input w-full" placeholder="도착지 주소" value={form.destination} onChange={(e) => set('destination', e.target.value)} /></div>
        </li>
        <li className="wide">
          <div className="title">적요</div>
          <div className="form"><input className="ec-input w-full" placeholder="적요" value={form.purpose} onChange={(e) => set('purpose', e.target.value)} /></div>
        </li>
      </ul>
      <div className="flex gap-[6px]">
        <button type="button" className="ec-btn ec-btn-primary" onClick={() => void submit()}>저장(F8)</button>
        {record
          ? <button type="button" className="ec-btn" onClick={() => void remove()}>삭제</button>
          : <button type="button" className="ec-btn" onClick={() => setForm(blank())}>다시 작성</button>}
        <button type="button" className="ec-btn" onClick={onClose}>닫기</button>
      </div>
      <VehiclePicker open={pickerOpen} onClose={() => setPickerOpen(false)}
                     onPick={(v) => { setForm((f) => ({ ...f, vehicleNo: v.code, vehicleName: v.name })); setPickerOpen(false); void fillOdometer(v.code) }} />
    </Modal>
  )
}
