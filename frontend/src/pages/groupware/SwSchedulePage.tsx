import { useEffect, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import { useTableSort } from '../../utils/useTableSort'
import Modal from '../../components/Modal'
import { ymd } from '../../components/EcPeriodPicks'

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

/** 그룹웨어 > SW개발일정관리 — 개발 건(프로젝트)별 일정·진행률 관리 (실제 연동, /projects 재사용) */
export default function SwSchedulePage() {
  const [rows, setRows] = useState<Project[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [endFrom, setEndFrom] = useState('')
  const [endTo, setEndTo] = useState('')
  const [title2, setTitle2] = useState('')
  const [tab, setTab] = useState<'전체' | '진행중' | '완료'>('전체')

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
    if (!name.trim()) return setError('작업/기능명을 입력하세요.')
    try {
      await api.post<Project>('/projects', {
        name, manager: manager || undefined,
        startDate: startDate || undefined, endDate: endDate || undefined,
        remark: remark || undefined,
      })
      setOk('개발 일정 등록 완료')
      setName(''); setManager(''); setEndDate(''); setRemark('')
      load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function addProgress(r: Project) {
    const next = Math.min(100, r.progress + 10)
    try {
      await api.patch(`/projects/${r.id}`, { progress: next, status: next >= 100 ? 'DONE' : undefined })
      load()
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  /*
   * 원본 조건 실측: <b>계획시작일(구간) · 계획종료일(구간) · 실제완료일(구간)</b>.
   * 우리는 <b>조건 판이 아예 없어</b> 검색상자 하나로만 좁혔다 — 일정이 쌓이면
   * '이번 달에 끝나는 것' 을 물을 방법이 없었다.
   *
   * <p>[실제완료일]은 넣지 않았다 — 우리 프로젝트에는 실제로 끝난 날을 적는 칸이 없다.
   */
  /*
   * 원본 SW개발일정관리 탭 실측(사본): <b>전체 · 진행중 · 완료</b>.
   * 쌍둥이 화면인 건설예정공정표에는 이 알약이 있는데 <b>여기만 없었다</b> —
   * 같은 <code>/projects</code> 를 쓰는 화면인데 한쪽만 끝난 것을 걸러 낼 수 있었다.
   */
  const inTab = (r: Project) =>
    tab === '전체' ? true : tab === '완료' ? r.status === 'DONE' : r.status === 'IN_PROGRESS'

  const shown = rows
    .filter(inTab)
    .filter((r) => !from || (r.startDate ?? '') >= from)
    .filter((r) => !to || (r.startDate ?? '') <= to)
    .filter((r) => !endFrom || (r.endDate ?? '') >= endFrom)
    .filter((r) => !endTo || (r.endDate ?? '') <= endTo)
    .filter((r) => !title2 || r.name.includes(title2))
    .filter((r) => !keyword || r.name.includes(keyword) || (r.manager ?? '').includes(keyword))
  const inputCls = 'ec-input'
  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 84 }


  /* 머리에 <b>▼ 만 그려 놓고</b> 정렬은 없었다 — 눌러도 아무 일이 없었다. */
  const sort = useTableSort(shown, {
    목표일: (r) => r.endDate,
  })

  return (
    <EcListShell
      title="SW개발일정관리"
      search={keyword}
      onSearchChange={setKeyword}
      newLabel={showForm ? '입력닫기' : '일정등록(F2)'}
      onNew={() => setShowForm(true)}
      actions={[{ label: '새로고침', onClick: load }, { label: 'Excel' }]}
    >
      <p className="mb-2 text-xs text-slate-500">개발 건별 목표일·진행률(%) 관리 · +10% 버튼으로 진척 반영 (프로젝트관리와 저장소 공유)</p>

      {/* 원본 상단 알약 — 전체·진행중·완료 */}
      <div className="ec-pills" style={{ marginBottom: 6 }}>
        {(['전체', '진행중', '완료'] as const).map((t) => (
          <button key={t} type="button" className={`ec-pill no-ec${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t} {rows.filter((r) => (t === '전체' ? true : t === '완료' ? r.status === 'DONE' : r.status === 'IN_PROGRESS')).length}
          </button>
        ))}
      </div>

      {/* 원본 조회 조건 — 우리 데이터에 있는 것만(계획시작일·계획종료일) */}
      <table className="w-full text-left" style={{ marginBottom: 8 }}>
        <tbody>
          <tr>
            <th style={{ ...th, width: 110 }}>계획시작일</th>
            <td>
              <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 140 }} />
              <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
              <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 140 }} />
            </td>
            <th style={{ ...th, width: 110 }}>계획종료일</th>
            <td>
              <input type="date" className={inputCls} value={endFrom} onChange={(e) => setEndFrom(e.target.value)} style={{ width: 140 }} />
              <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
              <input type="date" className={inputCls} value={endTo} onChange={(e) => setEndTo(e.target.value)} style={{ width: 140 }} />
            </td>
          </tr>
          <tr>
            {/* 원본 [제목] — 우리 작업/기능명이 그 자리다. */}
            <th style={{ ...th, width: 110 }}>제목</th>
            <td colSpan={3}>
              <input className={inputCls} value={title2} onChange={(e) => setTitle2(e.target.value)} style={{ width: 260 }} />
            </td>
          </tr>
        </tbody>
      </table>

      <Modal open={showForm} title="SW개발일정 등록" onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12, marginBottom: 10, maxWidth: 820 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>착수일</th>
                <td><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>목표일</th>
                <td><input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ width: 150 }} /></td>
              </tr>
              <tr>
                <th style={th}>작업/기능명 *</th>
                <td colSpan={3}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} placeholder="예: 재고 관리 API" /></td>
              </tr>
              <tr>
                <th style={th}>담당</th>
                <td><input className={inputCls} value={manager} onChange={(e) => setManager(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>비고</th>
                <td><input className={inputCls} value={remark} onChange={(e) => setRemark(e.target.value)} style={{ width: '100%' }} placeholder="진행 상황 메모" /></td>
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
            <th style={{ width: 90 }}>코드</th>
            <th>작업/기능명</th>
            <th style={{ width: 100 }}>담당</th>
            <th style={{ width: 100, cursor: 'pointer' }} onClick={() => sort.toggle('목표일')}>목표일 {sort.mark('목표일')}</th>
            <th style={{ width: 170 }}>진행률(%)</th>
            <th style={{ width: 70, textAlign: 'center' }}>상태</th>
            <th style={{ width: 80, textAlign: 'center' }}>처리</th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9aa1ab', padding: 20 }}>등록된 데이터가 없습니다.</td></tr>
          ) : sort.sorted.map((r, i) => (
            <tr key={r.id}>
              <td style={{ textAlign: 'center', color: '#9aa1ab' }}>{i + 1}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.code ?? '-'}</td>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{r.manager ?? ''}</td>
              <td style={{ fontFamily: 'monospace' }}>{r.endDate ?? '-'}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ flex: 1, height: 8, background: '#eef1f5', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, r.progress)}%`, height: '100%', background: STATUS_COLOR[r.status] }} />
                  </div>
                  <span style={{ width: 34, textAlign: 'right', fontSize: 11.5 }}>{r.progress}%</span>
                </div>
              </td>
              <td style={{ textAlign: 'center', fontWeight: 700, color: STATUS_COLOR[r.status] }}>{r.statusName}</td>
              <td style={{ textAlign: 'center' }}>
                <button className="ec-btn" style={{ height: 20, padding: '0 8px' }} disabled={r.progress >= 100} onClick={() => addProgress(r)}>+10%</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </EcListShell>
  )
}
