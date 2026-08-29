import { useEffect, useState, useRef} from 'react'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import { useTableColumnCheck } from '../../utils/assertTableColumns'
import { ymd } from '../../components/EcPeriodPicks'
import { api, extractErrorMessage } from '../../api/client'
import { useNavigate } from 'react-router-dom'

/**
 * 관리 > 근태관리 > 근태입력.
 *
 * <p>원본 실측(사본): 상단에 [출/퇴근] 탭과 [근태일괄입력], 그리드는
 * <b>근태일자 · 사원 · 휴가 · 근태(일/시간) · 적요</b>. 즉 여기서 넣는 것은 출퇴근 시각이
 * 아니라 <b>연차·반차 같은 근태 기록</b>이다. 근태조회·근태현황도 같은 것을 본다
 * (근태조회 열: 근태번호 · 근태일자 · 사원명 · 근태코드 · 근태수 · 적요).
 *
 * <p>우리 근태입력은 <b>출퇴근 시각</b>을 넣는 화면이었다. 출퇴근은 원본에서도 따로
 * [출/퇴근기록부(ID)] 가 맡는다 — 그 화면은 그대로 두고 이 자리만 원본 뜻으로 돌린다.
 *
 * <p>원본처럼 <b>여러 줄을 한 번에</b> 넣는다. 한 줄씩 저장하게 하면 월초에 열 명 연차를
 * 넣을 때 열 번 저장해야 한다.
 */
interface UserRow { id: number; name: string; department: string | null }

interface LineInput {
  key: number
  userId: string
  type: string
  startDate: string
  endDate: string
  days: string
  reason: string
}

/** 원본 [근태코드]에 해당한다. 우리 휴가 종류가 그 자리다. */
const TYPES = ['연차', '반차', '병가', '경조', '공가', '기타']

let nextKey = 1
const emptyLine = (date: string): LineInput => ({
  key: nextKey++, userId: '', type: '연차', startDate: date, endDate: date, days: '1', reason: '',
})

export default function LeaveInputPage() {
  /** 원본 [리스트] — 넣은 근태를 보러 근태조회로 간다. */
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserRow[]>([])
  const [baseDate, setBaseDate] = useState(ymd(new Date()))
  const [lines, setLines] = useState<LineInput[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get<UserRow[]>('/users').then((r) => setUsers(r.data)).catch(() => {})
    setLines([emptyLine(ymd(new Date())), emptyLine(ymd(new Date())), emptyLine(ymd(new Date()))])
  }, [])

  const setLine = (key: number, patch: Partial<LineInput>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  /** 근태일자를 바꾸면 아직 손대지 않은 줄의 일자도 따라간다 — 대개 같은 날을 넣는다. */
  function changeBaseDate(v: string) {
    setBaseDate(v)
    setLines((prev) => prev.map((l) => (l.userId ? l : { ...l, startDate: v, endDate: v })))
  }

  /*
   * 원본 상단의 <b>[근태일괄입력]</b>. 예전에는 '여러 사원의 근태를 한 번에 넣는 화면이 없다'
   * 고 적고 뺐는데, <b>이 화면이 이미 여러 줄을 한 번에 넣는다</b> — 없던 것은
   * <b>같은 근태를 여러 사람에게 한꺼번에 까는</b> 길이었다. 열 명 연차를 넣으려면
   * 줄마다 사원을 고르고 항목·기간·일수를 열 번 똑같이 찍어야 했다.
   *
   * <p>저장하지 않고 <b>줄만 채운다.</b> 저장은 기존 [저장]이 한다 — 넣기 전에 눈으로
   * 확인하고 한 줄쯤 고칠 수 있어야 하고, 검사도 한 자리에만 두는 편이 낫다.
   */
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkUsers, setBulkUsers] = useState<Set<number>>(new Set())
  const [bulkForm, setBulkForm] = useState({ type: '연차', startDate: '', endDate: '', days: '1', reason: '' })

  function fillBulk() {
    if (bulkUsers.size === 0) { setError('사원을 고르세요.'); return }
    const from = bulkForm.startDate || baseDate
    const to = bulkForm.endDate || from
    setError('')
    setLines((prev) => {
      /* 아직 사원을 안 고른 빈 줄은 <b>덮어 쓴다</b> — 처음 세 줄이 빈 채로 남지 않게. */
      const blanks = prev.filter((l) => !l.userId)
      const kept = prev.filter((l) => l.userId)
      const made = [...bulkUsers].map((id) => ({
        ...emptyLine(from), userId: String(id), type: bulkForm.type,
        startDate: from, endDate: to, days: bulkForm.days || '1', reason: bulkForm.reason,
      }))
      return [...kept, ...made, ...blanks.slice(0, Math.max(0, 3 - kept.length - made.length))]
    })
    setBulkUsers(new Set())
    setBulkOpen(false)
  }

  async function save() {
    setError(''); setOk('')
    const valid = lines.filter((l) => l.userId && Number(l.days) > 0)
    if (valid.length === 0) return setError('사원과 근태(일)를 1줄 이상 입력하세요.')
    setSaving(true)
    let done = 0
    try {
      for (const l of valid) {
        await api.post('/hr/vacations', {
          userId: Number(l.userId),
          type: l.type,
          startDate: l.startDate,
          endDate: l.endDate || l.startDate,
          days: Number(l.days),
          reason: l.reason || null,
        })
        done += 1
      }
      setOk(`${done}건 저장했습니다.`)
      setLines([emptyLine(baseDate), emptyLine(baseDate), emptyLine(baseDate)])
    } catch (err) {
      // 몇 줄은 이미 들어갔을 수 있다 — 몇 건이 저장됐는지 같이 알려 준다.
      setError(`${extractErrorMessage(err)}${done > 0 ? ` (앞의 ${done}건은 저장됐습니다)` : ''}`)
    } finally {
      setSaving(false)
    }
  }


  /* 칸이 자료 따라 변하는 격자라 정적으로 못 센다 — 렌더된 표를 직접 잰다. */
  const tableRef = useRef<HTMLTableElement>(null)
  useTableColumnCheck(tableRef, '근태입력', [])

  return (
    <EcListShell
      title="근태입력"
      searchable={false}
      actions={[
        /* 원본 상단의 [근태일괄입력] — 같은 근태를 여러 사람에게 한꺼번에 깐다.
           원본 차례상 <b>맨 앞</b>이다(근태일괄입력 · 저장(F8) · 리스트). */
        { label: '근태일괄입력', onClick: () => {
          setError(''); setBulkForm((f) => ({ ...f, startDate: baseDate, endDate: baseDate })); setBulkOpen(true)
        } },
        { label: saving ? '저장 중…' : '저장(F8)', primary: true, onClick: save },
        /*
         * 원본 [리스트] — 넣은 것을 보러 근태조회로 간다. 저장해도 이 화면에
         * 그대로 남아(줄만 비워진다) 방금 넣은 것을 확인할 길이 없었다.
         */
        { label: '리스트', onClick: () => navigate('/hr/leave-list') },
        { label: '줄 추가', onClick: () => setLines((p) => [...p, emptyLine(baseDate)]) },
        { label: '다시 작성', onClick: () => setLines([emptyLine(baseDate), emptyLine(baseDate), emptyLine(baseDate)]) },
      ]}
    >
      <Modal open={bulkOpen} title="근태일괄입력" onClose={() => setBulkOpen(false)}>{(
        <div style={{ padding: 4, minWidth: 460 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>근태항목</div>
              <select className="ec-input" value={bulkForm.type} style={{ width: 110 }}
                      onChange={(e) => setBulkForm((f) => ({ ...f, type: e.target.value }))}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>기간</div>
              <input type="date" className="ec-input" value={bulkForm.startDate} style={{ width: 140 }}
                     onChange={(e) => setBulkForm((f) => ({ ...f, startDate: e.target.value }))} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>~</div>
              <input type="date" className="ec-input" value={bulkForm.endDate} style={{ width: 140 }}
                     onChange={(e) => setBulkForm((f) => ({ ...f, endDate: e.target.value }))} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>근태(일)</div>
              <input type="number" step="any" className="ec-input" value={bulkForm.days} style={{ width: 80, textAlign: 'right' }}
                     onChange={(e) => setBulkForm((f) => ({ ...f, days: e.target.value }))} /></label>
            <label style={{ fontSize: 12.5 }}><div style={{ color: '#5a626e', marginBottom: 3 }}>적요</div>
              <input className="ec-input" value={bulkForm.reason} style={{ width: 160 }}
                     onChange={(e) => setBulkForm((f) => ({ ...f, reason: e.target.value }))} /></label>
          </div>
          {/* 사원은 여럿 고른다 — 그게 이 창의 전부다. */}
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--ec-border)', padding: 8 }}>
            {users.map((u) => (
              <label key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, width: 150, fontSize: 12.5 }}>
                <input type="checkbox" checked={bulkUsers.has(u.id)}
                       onChange={() => setBulkUsers((prev) => {
                         const next = new Set(prev)
                         if (next.has(u.id)) next.delete(u.id); else next.add(u.id)
                         return next
                       })} />
                {u.name}{u.department ? ` (${u.department})` : ''}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
            <span style={{ marginRight: 'auto', fontSize: 11.5, color: '#8a929c' }}>
              고른 {bulkUsers.size}명만큼 줄을 깝니다. <b>저장은 아직 아닙니다</b> — 확인하고 [저장(F8)] 하세요.
            </span>
            <button className="ec-btn ec-btn-primary" onClick={fillBulk}>줄 깔기</button>
          </div>
        </div>
      )}</Modal>

      {error && <p style={{ background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{error}</p>}
      {ok && <p style={{ background: '#eaf6ec', color: '#1c7c3c', padding: '6px 10px', fontSize: 12.5, borderRadius: 3, marginBottom: 8 }}>{ok}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, color: '#5a626e' }}>일자</span>
        <input className="ec-input" type="date" value={baseDate}
               onChange={(e) => changeBaseDate(e.target.value)} style={{ width: 150 }} />
        <span style={{ fontSize: 11.5, color: '#8a929c' }}>
          여러 사원의 근태를 한 번에 넣습니다. 출퇴근 시각은 [출/퇴근기록부(ID)]에서 다룹니다.
        </span>
      </div>

      <div className="overflow-x-auto">
        <table ref={tableRef} className="ec-grid w-full text-left">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th style={{ width: 130 }}>근태일자</th>
              <th style={{ width: 130 }}>종료일자</th>
              <th style={{ width: 180 }}>사원</th>
              <th style={{ width: 120 }}>근태</th>
              {/*
                원본 근태입력 그리드의 [휴가] 열 — 이 근태가 어느 휴가 잔여에서 빠지는가.
                우리 잔여 계산은 승인된 근태를 모두 그 해 연차에서 빼므로 값이 하나다.
                고르는 칸이 아니라 <b>어디서 빠지는지 알려 주는 칸</b>이라 읽기전용으로 둔다 —
                고를 수 있는 것처럼 보이면 다른 데서 빠질 수 있다는 뜻이 되어 거짓말이 된다.
              */}
              <th style={{ width: 120 }}>휴가</th>
              <th style={{ width: 110, textAlign: 'right' }}>근태(일/시간)</th>
              <th>적요</th>
              <th style={{ width: 50, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
                <td>
                  <input className="ec-input" type="date" value={l.startDate}
                         onChange={(e) => setLine(l.key, { startDate: e.target.value })} />
                </td>
                <td>
                  <input className="ec-input" type="date" value={l.endDate}
                         onChange={(e) => setLine(l.key, { endDate: e.target.value })} />
                </td>
                <td>
                  <select className="ec-input" value={l.userId}
                          onChange={(e) => setLine(l.key, { userId: e.target.value })}>
                    <option value="">선택</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}{u.department ? ` (${u.department})` : ''}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select className="ec-input" value={l.type}
                          onChange={(e) => setLine(l.key, { type: e.target.value })}>
                    {TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </td>
                <td style={{ color: '#6b7280' }}>
                  {l.startDate ? `연차(${l.startDate.slice(0, 4)}년)` : ''}
                </td>
                <td>
                  {/* 반차 0.5, 시간 단위 0.125 까지 넣는다 — 소수 세 자리로 저장된다. */}
                  <input className="ec-input text-right" type="number" step="0.001" value={l.days}
                         onChange={(e) => setLine(l.key, { days: e.target.value })} />
                </td>
                <td>
                  <input className="ec-input w-full" value={l.reason}
                         onChange={(e) => setLine(l.key, { reason: e.target.value })} />
                </td>
                <td style={{ textAlign: 'center' }}>
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                            style={{ border: 'none', background: 'none', color: '#c0c5cc', cursor: 'pointer' }}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 8, fontSize: 11.5, color: '#8a929c' }}>
        * 근태(일)는 <b>기간 안</b>이어야 합니다. 하루짜리에 100일을 넣으면 잔여일수가 통째로 틀어집니다.
        반차(0.5)와 시간 단위(0.125 = 1시간)도 그대로 들어갑니다.
      </p>
    </EcListShell>
  )
}
