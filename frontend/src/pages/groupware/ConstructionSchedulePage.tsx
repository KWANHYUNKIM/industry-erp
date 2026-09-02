import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import EcPeriodPicks, { PROJECT_PICKS, ymd } from '../../components/EcPeriodPicks'
import { dateText } from '../../utils/dateText'

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

/** 원본 [진행상태변경]이 고르게 하는 것들. 이름은 진척관리와 같아야 한다. */
const STATUSES: [Project['status'], string][] = [
  ['PLANNING', '계획'], ['IN_PROGRESS', '진행중'], ['ON_HOLD', '보류'], ['DONE', '완료'],
]

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
  /* 원본 [진행상태변경] — 고른 공정을 한 번에 바꾼다. */
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [statusOpen, setStatusOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<Project['status']>('IN_PROGRESS')
  async function applyStatus() {
    const targets = shown.filter((r) => checked.has(r.id))
    if (targets.length === 0) { setError('상태를 바꿀 공정을 고르세요.'); return }
    setError('')
    try {
      for (const t of targets) await api.patch(`/projects/${t.id}`, { status: newStatus })
      setChecked(new Set())
      setStatusOpen(false)
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [endFrom, setEndFrom] = useState('')
  const [endTo, setEndTo] = useState('')
  const [manager2, setManager2] = useState('')
  const [title2, setTitle2] = useState('')

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

  /*
   * 원본 조건 실측: <b>계획시작일(구간) · 계획종료일(구간) · 실제완료일(구간)</b> 셋이다.
   * 우리는 <b>구간이 하나뿐</b>이라 '언제 시작하는 일' 만 좁힐 수 있고 '이번 달에 끝나는 일'
   * 은 못 물었다 — 일정 화면에서 정작 급한 물음이 그쪽이다.
   *
   * <p>[실제완료일]은 넣지 않았다. 우리 프로젝트에는 <b>실제로 끝난 날을 적는 칸이 없다</b>
   * (진행률과 상태만 있다). 칸만 만들면 눌러도 아무 일이 없다.
   */
  const shown = rows
    .filter(inTab)
    .filter((r) => !from || (r.startDate ?? '') >= from)
    .filter((r) => !to || (r.startDate ?? '') <= to)
    .filter((r) => !endFrom || (r.endDate ?? '') >= endFrom)
    .filter((r) => !endTo || (r.endDate ?? '') <= endTo)
    .filter((r) => !manager2 || (r.manager ?? '').includes(manager2))
    .filter((r) => !title2 || r.name.includes(title2))
    .filter((r) => !keyword || r.name.includes(keyword) || (r.manager ?? '').includes(keyword))

  const tabCount = (t: typeof tab) =>
    rows.filter((r) => (t === '전체' ? true : t === '완료' ? r.status === 'DONE' : r.status === 'IN_PROGRESS')).length

  function reset() {
    setTab('전체'); setFrom(''); setTo(''); setEndFrom(''); setEndTo(''); setManager2(''); setTitle2(''); setKeyword('')
  }

  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 84 }


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    착수예정: (r) => r.startDate,
  })

  return (
    <EcListShell
      title="건설예정공정표"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '공정등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[
        { label: '검색(F8)', primary: true, onClick: load },
        /*
         * 원본 [진행상태변경] — <b>고른 공정을 한 번에</b> 바꾼다.
         * '공정표는 줄마다 상태를 고친다' 고 적고 뺐는데 <b>이 화면에는 줄 버튼이 하나도
         * 없었다</b> — 상태와 진척률을 보여 주면서 바꿀 데가 없어, 공정 하나 넘기려고
         * 진척관리로 건너가야 했다. 바꾸는 길(PATCH /projects)은 진작 있었다.
         */
        { label: `진행상태변경${checked.size ? ` (${checked.size})` : ''}`, onClick: () => {
          if (checked.size === 0) { setError('상태를 바꿀 공정을 고르세요.'); return }
          setError(''); setStatusOpen(true)
        } },
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
            {/* 원본 조건 이름은 [계획시작일] 이다 — 우리가 '착수예정일' 이라 달리 적고 있었다. */}
            <th style={{ ...th, width: 110 }}>계획시작일</th>
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
            <th style={{ ...th, width: 110 }}>계획종료일</th>
            <td colSpan={3}>
              <input type="date" className={inputCls} value={endFrom} onChange={(e) => setEndFrom(e.target.value)} style={{ width: 140 }} />
              <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
              <input type="date" className={inputCls} value={endTo} onChange={(e) => setEndTo(e.target.value)} style={{ width: 140 }} />
            </td>
          </tr>
          <tr>
            <th style={{ ...th, width: 110 }}>담당</th>
            <td>
              <input className={inputCls} value={manager2} onChange={(e) => setManager2(e.target.value)} style={{ width: 200 }} />
            </td>
            {/* 원본 [제목] — 우리 공정명이 그 자리다. 검색상자와 달리 담당은 안 걸린다. */}
            <th style={{ ...th, width: 110 }}>제목</th>
            <td>
              <input className={inputCls} value={title2} onChange={(e) => setTitle2(e.target.value)} style={{ width: 200 }} />
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
                <td><input type="date" className={inputCls} value={dateText(startDate)} onChange={(e) => setStartDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>완료예정일</th>
                <td><input type="date" className={inputCls} value={dateText(endDate)} onChange={(e) => setEndDate(e.target.value)} style={{ width: 150 }} /></td>
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

      <Modal open={statusOpen} title={`진행상태변경 (${checked.size}건)`} onClose={() => setStatusOpen(false)}>{(
        <div style={{ padding: 6, minWidth: 300 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {STATUSES.map(([v, l]) => (
              <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5 }}>
                <input type="radio" name="proj-status" checked={newStatus === v}
                       onChange={() => setNewStatus(v)} />
                <span style={{ color: STATUS_COLOR[v], fontWeight: 700 }}>{l}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="ec-btn ec-btn-primary" onClick={applyStatus}>바꾸기</button>
          </div>
        </div>
      )}</Modal>

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <table className="w-full text-left">
        <thead>
          <tr>
            <th style={{ width: 34 }}></th>
            {/* [진행상태변경]이 고를 자리. */}
            <th style={{ width: 30, textAlign: 'center' }}>
              <input type="checkbox"
                     checked={shown.length > 0 && shown.every((r) => checked.has(r.id))}
                     onChange={() => setChecked(
                       shown.every((r) => checked.has(r.id)) ? new Set() : new Set(shown.map((r) => r.id)))} />
            </th>
            <th style={{ width: 100, cursor: 'pointer' }} onClick={() => sort.toggle('착수예정')}>착수예정 {sort.mark('착수예정')}</th>
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
            <tr><td colSpan={10} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={checked.has(r.id)} onChange={() => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(r.id)) next.delete(r.id); else next.add(r.id)
                  return next
                })} />
              </td>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.startDate) || ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{dateText(r.endDate) || ''}</td>
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
