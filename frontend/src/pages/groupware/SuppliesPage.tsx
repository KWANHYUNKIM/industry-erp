import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, extractErrorMessage } from '../../api/client'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { ymd } from '../../components/EcPeriodPicks'

/**
 * 그룹웨어 > 사내관리 > 공용품관리 (이카운트 E070204)
 *
 * 이 화면은 공용품 <b>마스터</b>가 아니라 <b>사용/반납 내역</b>이다. 우리는 그동안
 * 품목코드·재고수량을 관리하는 마스터 화면을 여기에 놓고 있었는데, 원본은
 * "누가 언제 어떤 공용품을 빌려 쓰고 반납했는가"를 기간으로 조회한다. 실측 컬럼:
 *   (선택칸 24) 일자 100 · 시작시간 55 · 종료시간 55 · 물품명 160 · 제목 300 · 적요 170 ·
 *   사용자명 160 · 반납여부 160  (합 1184)
 *
 * 왼쪽 보기 전환은 [기본][일간][월간][공용품별] 네 가지다. 기본은 있는 그대로,
 * 나머지 셋은 같은 자료를 묶어서 본다.
 *
 * 공용품 마스터(품목코드·공용품명·재고)는 없어지지 않았다. 원본이 마스터를 어디서 등록하는지
 * 확인하지 못해 메뉴를 새로 만들지 않고, 등록 폼의 [공용품 관리] 버튼으로 열리는 팝업에 두었다.
 * 원본 하단의 [미리보기]·[라벨변경]은 무엇을 하는 화면인지 확인하지 못해 넣지 않았다.
 */

type ReturnStatus = 'NOT_RETURNED' | 'RETURNED' | 'UNSPECIFIED'
const RETURN_LABEL: Record<ReturnStatus, string> = {
  NOT_RETURNED: '미반납', RETURNED: '반납', UNSPECIFIED: '미지정',
}
const RETURN_COLOR: Record<ReturnStatus, string> = {
  NOT_RETURNED: '#c60a2e', RETURNED: '#1c7c3c', UNSPECIFIED: 'var(--ec-label)',
}

const VIEWS = ['기본', '일간', '월간', '공용품별'] as const
type View = (typeof VIEWS)[number]

interface Supply {
  id: number; code: string; name: string
  category: string | null; unit: string | null; stockQty: number; note: string | null
}
interface UserRow { id: number; name: string; username: string }
interface Usage {
  id: number
  supplyItemId: number; supplyItemCode: string; supplyItemName: string
  userId: number; userName: string
  useDate: string; startTime: string | null; endTime: string | null; allDay: boolean
  title: string; remark: string | null; labelText: string | null
  returnStatus: ReturnStatus; returnStatusName: string
}

/** 묶어 보기의 그룹 키. 기본 보기는 묶지 않는다. */
function groupKeyOf(u: Usage, view: View): string {
  if (view === '일간') return u.useDate.replace(/-/g, '/')
  if (view === '월간') return u.useDate.slice(0, 7).replace('-', '/')
  return `${u.supplyItemCode} ${u.supplyItemName}`
}

export default function SuppliesPage() {
  const [rows, setRows] = useState<Usage[]>([])
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [view, setView] = useState<View>('기본')
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const today = ymd(new Date())
  const weekLater = ymd(new Date(Date.now() + 6 * 86400000))
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(weekLater)

  // 등록 폼
  const [showForm, setShowForm] = useState(false)
  const [fSupply, setFSupply] = useState('')
  const [fUser, setFUser] = useState('')
  const [fDate, setFDate] = useState(today)
  const [fStart, setFStart] = useState('18:00')
  const [fEnd, setFEnd] = useState('19:00')
  const [fAllDay, setFAllDay] = useState(false)
  const [fTitle, setFTitle] = useState('')
  const [fRemark, setFRemark] = useState('')
  const [fLabel, setFLabel] = useState('')
  const [fReturn, setFReturn] = useState<ReturnStatus>('NOT_RETURNED')

  // 공용품 마스터 관리 팝업
  const [showMaster, setShowMaster] = useState(false)
  const [mCode, setMCode] = useState('')
  const [mName, setMName] = useState('')
  const [mCategory, setMCategory] = useState('사무용품')
  const [mUnit, setMUnit] = useState('개')

  async function load() {
    setError('')
    try {
      setRows((await api.get<Usage[]>('/supply-usages', { params: { from, to } })).data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])

  useEffect(() => {
    api.get<Supply[]>('/supplies').then((r) => setSupplies(r.data)).catch(() => {})
    api.get<UserRow[]>('/users').then((r) => setUsers(r.data)).catch(() => {})
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(''); setOk('')
    if (!fSupply) return setError('공용품을 선택하세요.')
    if (!fUser) return setError('사용자를 선택하세요.')
    if (!fTitle.trim()) return setError('제목을 입력하세요.')
    try {
      await api.post<Usage>('/supply-usages', {
        supplyItemId: Number(fSupply), userId: Number(fUser), useDate: fDate,
        startTime: fAllDay ? undefined : fStart, endTime: fAllDay ? undefined : fEnd,
        allDay: fAllDay, title: fTitle, remark: fRemark || undefined,
        labelText: fLabel || undefined, returnStatus: fReturn,
      })
      setOk('사용내역 등록 완료')
      setFTitle(''); setFRemark(''); setFLabel('')
      void load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function removeSelected() {
    const targets = shown.filter((r) => selected.has(r.id))
    if (targets.length === 0) return alert('지울 내역을 고르세요. (왼쪽 회색 번호 칸을 누릅니다)')
    if (!confirm(`${targets.length}건을 삭제할까요?`)) return
    const failed: string[] = []
    for (const r of targets) {
      try { await api.delete(`/supply-usages/${r.id}`) }
      catch (err) { failed.push(`${r.title}: ${extractErrorMessage(err)}`) }
    }
    setSelected(new Set())
    void load()
    if (failed.length) alert(`지우지 못한 내역 ${failed.length}건 — ${failed.join(' / ')}`)
  }

  async function addSupply(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!mCode.trim() || !mName.trim()) return setError('품목코드와 공용품명을 입력하세요.')
    try {
      await api.post('/supplies', { code: mCode, name: mName, category: mCategory, unit: mUnit, stockQty: 0 })
      setMCode(''); setMName('')
      setSupplies((await api.get<Supply[]>('/supplies')).data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  async function removeSupply(s: Supply) {
    if (!confirm(`[${s.name}] 공용품을 삭제할까요?`)) return
    try {
      await api.delete(`/supplies/${s.id}`)
      setSupplies((await api.get<Supply[]>('/supplies')).data)
    } catch (err) { alert(extractErrorMessage(err)) }
  }

  /** 반납여부는 목록에서 바로 바꾼다 — 빌린 물건을 돌려받는 순간 누르는 자리가 여기다. */
  async function toggleReturn(u: Usage) {
    const next: ReturnStatus = u.returnStatus === 'RETURNED' ? 'NOT_RETURNED' : 'RETURNED'
    try { await api.put(`/supply-usages/${u.id}`, { returnStatus: next }); void load() }
    catch (err) { alert(extractErrorMessage(err)) }
  }

  const toggle = (id: number) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const shown = rows.filter((r) => !keyword
    || r.title.includes(keyword)
    || r.supplyItemName.includes(keyword)
    || r.userName.includes(keyword)
    || (r.remark ?? '').includes(keyword))

  /** 기본 보기는 그룹 없이 한 덩어리. 나머지는 키별로 나눈다. */
  const groups = useMemo(() => {
    if (view === '기본') return [['', shown] as const]
    const map = new Map<string, Usage[]>()
    shown.forEach((u) => {
      const k = groupKeyOf(u, view)
      const list = map.get(k)
      if (list) list.push(u); else map.set(k, [u])
    })
    return [...map.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1).map(([k, v]) => [k, v] as const)
  }, [shown, view])

  const th: React.CSSProperties = { background: '#f5f7fa', fontWeight: 700, whiteSpace: 'nowrap', width: 84 }
  const COLS = ['2%', '8.5%', '4.6%', '4.6%', '13.5%', '25.3%', '14.4%', '13.5%', '13.5%']

  return (
    <EcListShell
      title="공용품관리"
      search={keyword}
      onSearchChange={setKeyword}
      onNew={() => setShowForm(true)}
      actions={[{ label: '인쇄' }, { label: '선택삭제', onClick: removeSelected }, { label: 'Excel' }]}
    >
      <Modal open={showForm} title="공용품관리등록" width={720} onClose={() => setShowForm(false)}>{(
        <form onSubmit={submit} style={{ border: '1px solid var(--ec-border)', background: '#fff', padding: 12 }}>
          <table className="w-full text-left">
            <tbody>
              <tr>
                <th style={th}>공용품 *</th>
                <td>
                  <CodePickerField
                    label="공용품" hideLabel value={fSupply} onChange={setFSupply} emptyLabel="선택 안 함"
                    items={supplies.map((s) => ({ value: String(s.id), code: s.code, name: s.name, sub: s.category }))}
                  />
                  <button type="button" className="ec-btn ec-btn-sm" style={{ marginLeft: 4 }}
                    onClick={() => setShowMaster(true)}>공용품 관리</button>
                </td>
                <th style={th}>사용자 *</th>
                <td>
                  <CodePickerField
                    label="사용자" hideLabel value={fUser} onChange={setFUser} emptyLabel="선택 안 함"
                    items={users.map((u) => ({ value: String(u.id), code: u.username, name: u.name }))}
                  />
                </td>
              </tr>
              <tr>
                <th style={th}>날짜/시간 *</th>
                <td colSpan={3}>
                  <input type="date" className="ec-input" value={fDate} onChange={(e) => setFDate(e.target.value)} style={{ width: 150 }} />
                  <input type="time" className="ec-input" value={fStart} disabled={fAllDay}
                    onChange={(e) => setFStart(e.target.value)} style={{ width: 110, marginLeft: 6 }} />
                  <span style={{ margin: '0 6px', color: 'var(--ec-label)' }}>~</span>
                  <input type="time" className="ec-input" value={fEnd} disabled={fAllDay}
                    onChange={(e) => setFEnd(e.target.value)} style={{ width: 110 }} />
                  <label style={{ marginLeft: 10, fontSize: 12 }}>
                    <input type="checkbox" checked={fAllDay} onChange={(e) => setFAllDay(e.target.checked)} /> 종일
                  </label>
                </td>
              </tr>
              <tr>
                <th style={th}>제목 *</th>
                <td colSpan={3}><input className="ec-input" value={fTitle} onChange={(e) => setFTitle(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th style={th}>적요</th>
                <td colSpan={3}><input className="ec-input" value={fRemark} onChange={(e) => setFRemark(e.target.value)} style={{ width: '100%' }} /></td>
              </tr>
              <tr>
                <th style={th}>라벨</th>
                <td><input className="ec-input" value={fLabel} onChange={(e) => setFLabel(e.target.value)} style={{ width: 150 }} /></td>
                <th style={th}>반납여부</th>
                <td>
                  {(['NOT_RETURNED', 'RETURNED', 'UNSPECIFIED'] as ReturnStatus[]).map((s) => (
                    <label key={s} style={{ marginRight: 10, fontSize: 12 }}>
                      <input type="radio" name="ret" checked={fReturn === s} onChange={() => setFReturn(s)} /> {RETURN_LABEL[s]}
                    </label>
                  ))}
                </td>
              </tr>
            </tbody>
          </table>
          {error && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {ok && <p className="mt-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</p>}
          <div style={{ marginTop: 10 }}><button type="submit" className="ec-btn ec-btn-primary">저장(F8)</button></div>
        </form>
      )}</Modal>

      <Modal open={showMaster} title="공용품 등록·관리" width={560} onClose={() => setShowMaster(false)}>{(
        <div>
          <form onSubmit={addSupply} style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <input className="ec-input" placeholder="품목코드" value={mCode} onChange={(e) => setMCode(e.target.value)} style={{ width: 110 }} />
            <input className="ec-input" placeholder="공용품명" value={mName} onChange={(e) => setMName(e.target.value)} style={{ flex: 1 }} />
            <input className="ec-input" placeholder="분류" value={mCategory} onChange={(e) => setMCategory(e.target.value)} style={{ width: 100 }} />
            <input className="ec-input" placeholder="단위" value={mUnit} onChange={(e) => setMUnit(e.target.value)} style={{ width: 60 }} />
            <button type="submit" className="ec-btn ec-btn-primary">추가</button>
          </form>
          <table className="w-full text-left">
            <thead><tr><th style={{ width: 110 }}>품목코드</th><th>공용품명</th><th style={{ width: 100 }}>분류</th><th style={{ width: 60 }}>단위</th><th style={{ width: 60 }}></th></tr></thead>
            <tbody>
              {supplies.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : supplies.map((s) => (
                <tr key={s.id}>
                  <td>{s.code}</td><td>{s.name}</td><td>{s.category ?? ''}</td><td style={{ textAlign: 'center' }}>{s.unit ?? ''}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="ec-btn ec-btn-sm" style={{ color: '#c60a2e' }} onClick={() => void removeSupply(s)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}</Modal>

      {error && !showForm && <p style={{ marginBottom: 8, background: '#fdecec', color: '#c60a2e', padding: '6px 10px', fontSize: 12.5, borderRadius: 3 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* 왼쪽 보기 전환 — 원본은 [기본][일간][월간] 한 줄, [공용품별] 다음 줄이다. */}
        <div className="ec-pills" style={{ flex: '0 0 auto', display: 'flex', flexWrap: 'wrap', width: 190, gap: 4 }}>
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={`ec-pill no-ec${view === v ? ' active' : ''}`}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="date" className="ec-input" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 130 }} />
            <span style={{ color: 'var(--ec-label)' }}>~</span>
            <input type="date" className="ec-input" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 130 }} />
            <button type="button" className="ec-btn ec-btn-primary" onClick={() => void load()}>검색(F8)</button>
          </div>

          <table className="w-full text-left">
            <colgroup>{COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr>
                <th></th><th>일자</th><th>시작시간</th><th>종료시간</th><th>물품명</th>
                <th>제목</th><th>적요</th><th>사용자명</th><th>반납여부</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ec-text-grid)' }}>등록된 데이터가 없습니다.</td></tr>
              ) : groups.map(([key, list]) => (
                <Fragment key={key || 'all'}>
                  {key && (
                    <tr>
                      <td colSpan={9} style={{ background: '#f5f7fa', fontWeight: 700 }}>
                        {key} <span style={{ color: 'var(--ec-label)', fontWeight: 400 }}>({list.length}건)</span>
                      </td>
                    </tr>
                  )}
                  {list.map((r, i) => (
                    <tr key={r.id}>
                      <td
                        onClick={() => toggle(r.id)}
                        title="눌러서 선택 (하단 [선택삭제])"
                        style={{
                          textAlign: 'center', cursor: 'pointer',
                          background: selected.has(r.id) ? 'var(--ec-blue-light)' : '#f3f3f3',
                          color: selected.has(r.id) ? 'var(--ec-blue-dark)' : '#8a929c',
                          fontWeight: selected.has(r.id) ? 700 : 400,
                        }}
                      >
                        {i + 1}
                      </td>
                      <td style={{ textAlign: 'center' }}>{r.useDate.replace(/-/g, '/')}</td>
                      <td style={{ textAlign: 'center' }}>{r.allDay ? '종일' : (r.startTime ?? '')}</td>
                      <td style={{ textAlign: 'center' }}>{r.allDay ? '' : (r.endTime ?? '')}</td>
                      <td>{r.supplyItemName}</td>
                      <td>{r.title}</td>
                      <td>{r.remark ?? ''}</td>
                      <td style={{ textAlign: 'center' }}>{r.userName}</td>
                      <td
                        onClick={() => void toggleReturn(r)}
                        title="눌러서 반납/미반납 전환"
                        style={{ textAlign: 'center', cursor: 'pointer', color: RETURN_COLOR[r.returnStatus] }}
                      >
                        {RETURN_LABEL[r.returnStatus]}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </EcListShell>
  )
}
