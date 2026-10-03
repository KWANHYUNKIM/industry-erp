import { useEffect, useMemo, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import { useAuth } from '../../features/auth/AuthContext'
import type { FieldWorkSummary } from '../../types/api'
import { ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'
import { useShortcut } from '../../utils/useShortcut'

const today = () => ymd(new Date())
/** 원본 기본 기간 — 한 달 전 같은 날 ~ 오늘(2026/09/03 ~ 2026/10/03, 실측). */
const monthAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return ymd(d) }

interface UserRow { id: number; name: string; username: string }

type Form = {
  workDate: string; startTime: string; endTime: string; userId: string
  vehicleNo: string; vehicleName: string; usePurpose: string
  departure: string; destination: string; distance: string; purpose: string
}

/**
 * 그룹웨어 > 공유정보 > 외근조회 > 외근조회 (이카운트 E070254)
 *
 * <p><b>2026-10-03 원본을 열어 다시 맞췄다.</b> 원본의 외근은 <b>차량 운행 기록</b>이다 —
 * 격자 [일자No.][사용자명][이동수단코드][이동수단명][출발지 주소][도착지 주소][운행거리][적요],
 * 하단 [신규(F2)][선택삭제][Excel], 기간은 한 달 전 같은 날 ~ 오늘. 우리는 '외근계 신청 → 승인/반려'
 * 화면(외근지 · 사유 · 상태 · 처리 열, 상태 탭)을 놓고 있었다 — 원본에 없는 결재다.
 *
 * <p>신규 '외근입력': 일자 · 이동시간(기본 09:00 ~ 10:00) · 사용자 · 이동수단 · 사용목적명 · 출발지 주소 · 도착지 주소 · 적요.
 * 필수는 <b>사용자 · 이동수단</b>(빈 채로 저장하면 그 둘만 빨개진다). 이동수단은 원본이 차량 마스터
 * (차량번호 · 차량명 · 차종)에서 고르는데 우리에게 차량 마스터가 없어 번호·이름을 적는다.
 * [운행거리]는 원본 입력 창에 안 보이지만 격자에는 있어 칸을 둔다.
 *
 * <p>원본에 있지만 두지 않은 것: 프로젝트 · 부서코드 · 출발전/도착 후 사진 · 웹자료올리기. 승인/반려 API 는 서버에 남아 있다.
 */
export default function FieldWorkPage() {
  const { user } = useAuth()
  const [from, setFrom] = useState(monthAgo())
  const [to, setTo] = useState(today())
  const [summary, setSummary] = useState<FieldWorkSummary | null>(null)
  const [users, setUsers] = useState<UserRow[]>([])
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const blank = (): Form => {
    const me = users.find((u) => u.username === user?.username)
    return {
      workDate: today(), startTime: '09:00', endTime: '10:00', userId: me ? String(me.id) : '',
      vehicleNo: '', vehicleName: '', usePurpose: '', departure: '', destination: '', distance: '', purpose: '',
    }
  }
  const [form, setForm] = useState<Form>(blank)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  function load() {
    setError('')
    api.get<FieldWorkSummary>('/field-works', { params: { from, to } })
      .then((r) => setSummary(r.data))
      .catch((e) => setError(extractErrorMessage(e)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])
  useEffect(() => { api.get<UserRow[]>('/users').then((r) => setUsers(r.data)).catch(() => {}) }, [])

  const rows = summary?.rows ?? []
  /** 원본 [일자No.] — '2026/09/10 -1'. 같은 날 안의 차례(등록 순)다. */
  const numbered = useMemo(() => {
    const seq = new Map<string, number>()
    const byId = [...rows].sort((a, b) => a.id - b.id)
    const no = new Map<number, number>()
    for (const r of byId) { const n = (seq.get(r.workDate) ?? 0) + 1; seq.set(r.workDate, n); no.set(r.id, n) }
    return [...rows]
      .sort((a, b) => (a.workDate < b.workDate ? 1 : a.workDate > b.workDate ? -1 : b.id - a.id))
      .map((r) => ({ r, no: no.get(r.id) ?? 1 }))
  }, [rows])

  function openNew() { setForm(blank()); setError(''); setShowForm(true) }
  useShortcut('F2', openNew, !showForm)
  useShortcut('F8', () => void submit(), showForm)

  async function submit() {
    setError('')
    if (!form.userId) return setError('사용자를 선택하세요.')
    if (!form.vehicleNo.trim()) return setError('이동수단을 입력하세요.')
    if (form.startTime && form.endTime && form.endTime < form.startTime) return setError('종료 시각이 시작 시각보다 빠를 수 없습니다.')
    try {
      await api.post('/field-works', {
        workDate: form.workDate, startTime: form.startTime || null, endTime: form.endTime || null,
        userId: Number(form.userId), vehicleNo: form.vehicleNo, vehicleName: form.vehicleName || null,
        usePurpose: form.usePurpose || null, departure: form.departure || null,
        destination: form.destination || null, distance: form.distance ? Number(form.distance) : null,
        purpose: form.purpose || null,
      })
      setShowForm(false)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function deleteSelected() {
    const targets = rows.filter((r) => selected.has(r.id))
    if (targets.length === 0) return
    if (!window.confirm('삭제하겠습니까?')) return
    const failed: string[] = []
    for (const r of targets) {
      try { await api.delete(`/field-works/${r.id}`) } catch (err) { failed.push(extractErrorMessage(err)) }
    }
    setSelected(new Set())
    load()
    if (failed.length) setError(failed.join(' / '))
  }

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <EcListShell
      /* [검색(F8)]이 조건 판만 닫고 목록은 그대로였다 — 새로 넣은 전표가 안 보였다. 다시 읽는다. */
      onSearch={load} title="외근조회" onNew={openNew}
      actions={[
        { label: '선택삭제', onClick: () => void deleteSelected(), disabled: selected.size === 0 },
        { label: 'Excel' },
      ]}>
      <ul className="ec-cond mb-[6px]">
        <li>
          <span className="text-[12px] text-ec-label mr-[6px]">일자</span>
          <input type="date" className="ec-input w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-ec-label mx-[4px]">~</span>
          <input type="date" className="ec-input w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </li>
      </ul>

      {error && !showForm && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}

      <div className="text-right text-[12px] text-ec-ink mb-[4px]">{dateText(from)} ~{dateText(to)}</div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="w-[34px] cursor-pointer" title="전체 선택 / 해제"
                onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}>
              {rows.length > 0 && selected.size === rows.length ? '☑' : ''}
            </th>
            <th>일자No.</th><th>사용자명</th><th>이동수단코드</th><th>이동수단명</th>
            <th>출발지 주소</th><th>도착지 주소</th><th className="text-right">운행거리</th><th>적요</th>
          </tr>
        </thead>
        <tbody>
          {numbered.length === 0 ? (
            <tr><td colSpan={9} className="ec-empty">등록된 데이터가 없습니다.</td></tr>
          ) : numbered.map(({ r, no }, i) => (
            <tr key={r.id}>
              <td className={`text-center cursor-pointer ${selected.has(r.id) ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'bg-ec-stripe text-ec-hint'}`}
                  onClick={() => toggle(r.id)}>{i + 1}</td>
              <td className="text-ec-navy whitespace-nowrap">{dateText(r.workDate)} -{no}</td>
              <td>{r.userName}</td>
              <td>{r.vehicleNo ?? ''}</td>
              <td>{r.vehicleName ?? ''}</td>
              <td>{r.departure ?? ''}</td>
              <td>{r.destination ?? ''}</td>
              <td className="text-right">{r.distance != null ? Number(r.distance).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
              <td>{r.purpose ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 원본 '외근입력' 창 */}
      <Modal error={error} open={showForm} title="외근입력" width={780} onClose={() => setShowForm(false)}>
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
              <input className="ec-input flex-1" placeholder="이동수단명" value={form.vehicleName} onChange={(e) => set('vehicleName', e.target.value)} />
            </div>
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
            <div className="title">운행거리</div>
            <div className="form"><input type="number" min={0} step="0.01" className="ec-input w-[140px] text-right" placeholder="운행거리" value={form.distance} onChange={(e) => set('distance', e.target.value)} /></div>
          </li>
          <li className="wide">
            <div className="title">적요</div>
            <div className="form"><input className="ec-input w-full" placeholder="적요" value={form.purpose} onChange={(e) => set('purpose', e.target.value)} /></div>
          </li>
        </ul>
        <div className="flex gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void submit()}>저장(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setForm(blank())}>다시 작성</button>
          <button type="button" className="ec-btn" onClick={() => setShowForm(false)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
