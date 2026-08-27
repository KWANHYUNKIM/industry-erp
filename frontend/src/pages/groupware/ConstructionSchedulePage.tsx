import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import EcPeriodPicks, { PROJECT_PICKS, ymd } from '../../components/EcPeriodPicks'

interface Project {
  id: number
  code: string | null
  name: string
  manager: string | null
  startDate: string | null
  endDate: string | null
  progress: number
  status: 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'DONE'
  statusName: string
  remark: string | null
  createdBy: string | null
}

const STATUS_COLOR: Record<Project['status'], string> = {
  PLANNING: '#5a626e', IN_PROGRESS: '#c07a00', ON_HOLD: '#c60a2e', DONE: '#1c7c3c',
}

const today = () => ymd(new Date())

/**
 * 그룹웨어 > 프로젝트 > 건설예정공정표 (이카운트 C000044)
 *
 * 원본은 상단에 [전체][진행중][완료] 알약과 조회 조건 패널이 있고, 아래에
 * 기간 빠른선택(금일·전일·말일·전주·금주·차주·전월·금월·차월)과 [검색(F8)][다시 작성]이 붙는다.
 * 앞으로의 일정을 보는 화면이라 버튼줄에 '차주·차월' 같은 미래 구간이 들어 있다.
 *
 * 우리 화면은 상태 알약도 조건도 없이 전부 뿌리고 있었다.
 *
 * 원본 조건 중 태스크구분·담당자구분·게시글번호·입력경로·삭제구분은 우리 데이터에 없는
 * 개념이라 넣지 않았다. 칸만 만들면 눌러도 아무 일이 없다.
 */
export default function ConstructionSchedulePage() {
  const [rows, setRows] = useState<Project[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [tab, setTab] = useState<'전체' | '진행중' | '완료'>('전체')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [manager2, setManager2] = useState('')

  const [name, setName] = useState('')
  const [manager, setManager] = useState('')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState('')
  const [remark, setRemark] = useState('')

  async function load() {
    try { setRows((await api.get<Project[]>('/projects')).data) }
    catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { load() }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!name.trim()) return setError('공정명을 입력하세요.')
    try {
      await api.post<Project>('/projects', {
        name, manager: manager || undefined,
        startDate: startDate || undefined, endDate: endDate || undefined,
        remark: remark || undefined,
      })
      setOk('공정 등록 완료')
      setName(''); setManager(''); setEndDate(''); setRemark('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  const inTab = (r: Project) =>
    tab === '전체' ? true
      : tab === '완료' ? r.status === 'DONE'
      : r.status === 'IN_PROGRESS'

  /** 기간은 '착수예정일이 이 구간에 걸리는가'로 본다 — 원본 조건 이름은 게시일이지만 우리 공정에는 게시일이 없다. */
  const shown = rows
    .filter(inTab)
    .filter((r) => !from || (r.startDate ?? '') >= from)
    .filter((r) => !to || (r.startDate ?? '') <= to)
    .filter((r) => !manager2 || (r.manager ?? '').includes(manager2))
    .filter((r) => !keyword || r.name.includes(keyword) || (r.manager ?? '').includes(keyword))

  const tabCount = (t: typeof tab) =>
    rows.filter((r) => (t === '전체' ? true : t === '완료' ? r.status === 'DONE' : r.status === 'IN_PROGRESS')).length

  function reset() {
    setTab('전체'); setFrom(''); setTo(''); setManager2(''); setKeyword('')
  }

  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 84 }

  return (
    <EcListShell
      title="건설예정공정표"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '공정등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        { label: '다시 작성', onClick: reset },
        { label: '인쇄' },
        { label: 'Excel' },
      ]}
    >
      {/* 원본 상단 알약 — 전체·진행중·완료 */}
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t} {tabCount(t)}
          </button>
        ))}
      </div>

      {/* 원본 조회 조건 — 우리 데이터에 있는 것만 */}
      <table className="w-full text-left" style={{ marginBottom: 8 }}>
        <tbody>
          <tr>
            <th style={{ ...th, width: 110 }}>착수예정일</th>
            <td colSpan={3}>
              <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
              <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
              <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
              <span style={{ marginLeft: 10, display: 'inline-flex', gap: 3, flexWrap: 'wrap' }}>
                <EcPeriodPicks labels={PROJECT_PICKS} currentFrom={from}
                               onPick={(r) => { setFrom(r.from); setTo(r.to) }} />
              </span>
            </td>
          </tr>
          <tr>
            <th style={{ ...th, width: 110 }}>담당</th>
            <td colSpan={3}>
              <input className={inputCls} value={manager2} onChange={(e) => setManager2(e.target.value)} style={{ width: 200 }} />
            </td>
          </tr>
        </tbody>
      </table>

      <Modal open={showForm} title="건설예정공정표 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>착수예정일</th>
                <td><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>완료예정일</th>
                <td><input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>공정명 *</th>
                <td><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} placeholder="예: 골조공사" /></td>
                <th style={th}>담당</th>
                <td><input className={inputCls} value={manager} onChange={(e) => setManager(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>비고</th>
                <td colSpan={3}><input className={inputCls} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} placeholder="공정 메모" /></td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">등록(F8)</button></div>
        </form>
      )}</Modal>

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            <th style={{ width: 100 }}>착수예정 ▼</th>
            <th style={{ width: 100 }}>완료예정</th>
            <th>공정명</th>
            <th style={{ width: 100 }}>담당</th>
            <th style={{ width: 70, textAlign: 'center' }}>상태</th>
            <th style={{ width: 70, textAlign: 'right' }}>진척률</th>
            <th>비고</th>
            <th style={{ width: 100 }}>등록자</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : shown.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.startDate ?? '-'}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.endDate ?? '-'}</td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{r.manager ?? ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
              <td style={{ textAlign: 'right' }}>{r.progress}%</td>
              <td style={{ color: '#6b7280' }}>{r.remark ?? ''}</td>
              <td>{r.createdBy ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
