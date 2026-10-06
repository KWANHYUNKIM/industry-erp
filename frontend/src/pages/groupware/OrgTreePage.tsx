import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EcListShell from '../../components/EcListShell'
import Modal from '../../components/Modal'
import CodePickerField from '../../components/CodePickerField'
import { api, extractErrorMessage } from '../../api/client'
import type { Department, EmployeeMaster } from '../../types/api'
import { useAuth } from '../../features/auth/AuthContext'
import { useShortcut } from '../../utils/useShortcut'
import { exportTableToXlsx } from '../../utils/excel'

interface Node extends Department {
  children: Node[]
  depth: number
}

function buildTree(rows: Department[]): Node[] {
  const byId = new Map<number, Node>()
  for (const d of rows.filter((x) => x.active)) byId.set(d.id, { ...d, children: [], depth: 0 })
  const roots: Node[] = []
  for (const n of byId.values()) {
    const parent = n.parentId != null ? byId.get(n.parentId) : undefined
    if (parent) parent.children.push(n)
    else roots.push(n)
  }
  const sort = (ns: Node[], depth: number) => {
    ns.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    for (const n of ns) { n.depth = depth; sort(n.children, depth + 1) }
  }
  sort(roots, 1)
  return roots
}

/** 이 부서와 그 아래 모든 부서의 id — 그룹이동·하위부서추가에서 고리를 막는다. */
function subtreeIds(n: Node): number[] {
  return [n.id, ...n.children.flatMap(subtreeIds)]
}

type Dialog = 'child' | 'move' | 'rename' | 'deptChange' | null

/**
 * 그룹웨어 > 공유정보 > 조직도관리 > 조직도등록 (이카운트 E090222)
 *
 * <p><b>2026-10-03 원본을 열어 실측했다.</b> 우리 /groupware/org 는 부서 마스터를 넣고 지우는 화면인데,
 * 재고 I › 부서등록이 그 화면을 같이 쓰고 있다. 원본 조직도등록은 <b>다른 일</b>을 한다 —
 * 이미 등록한 부서를 나무로 <b>배치</b>하고 사람을 부서에 넣는다. 그래서 따로 만들었다.
 *
 * <ul>
 *   <li>왼쪽: 찾기 칸 · [전체접기][미포함] · 회사 이름 아래 부서 나무('인사팀(5)' — 그 부서에 바로 속한 사람 수).
 *       고른 부서 옆에 [Fn] 이 붙고 누르면 <b>하위부서추가 · 그룹이동 · 이름변경</b>. 아래 [Excel][조직도 미리보기].</li>
 *   <li>하위부서추가는 새 부서를 <b>만들지 않는다</b> — 상위부서는 고른 부서로 고정되고, [하위부서]는 부서 마스터에서
 *       코드도움으로 고른다(원본 실측). 버튼은 [적용(F8)][닫기].</li>
 *   <li>오른쪽: 고른 그룹 이름 · 알약 [포함][미포함(전체그룹)] · [부서변경] · 격자 사원번호 · 성명 · 소속부서 · 직위/직급.
 *       회사(맨 위)를 고르면 '조회할 그룹을 선택바랍니다.'.</li>
 * </ul>
 *
 * <p>원본에 있지만 받쳐 줄 것이 없어 두지 않은 것: [Fn]›미포함(부서를 나무에서 빼되 마스터는 남기는 상태가 우리에게 없다),
 * [순서변경] · [부서장설정] · [부서장지정] · [직위/직급설정] · [인사발령입력], 격자의 [사용자ID] · [부서장] 열.
 */
export default function OrgTreePage() {
  const navigate = useNavigate()
  const { companyName } = useAuth()
  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<EmployeeMaster[]>([])
  const [error, setError] = useState('')
  const [find, setFind] = useState('')
  const [keyword, setKeyword] = useState('')
  /** 고른 부서. null 이면 회사(맨 위). */
  const [selected, setSelected] = useState<number | null>(null)
  const [closed, setClosed] = useState<Set<number>>(new Set())
  const [tab, setTab] = useState<'포함' | '미포함'>('포함')
  const [fnOpen, setFnOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [pick, setPick] = useState('')
  const [newName, setNewName] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())

  async function load() {
    try {
      const [d, e] = await Promise.all([
        api.get<Department[]>('/departments'),
        api.get<EmployeeMaster[]>('/employees'),
      ])
      setDepartments(d.data)
      setEmployees(e.data)
    } catch (err) { setError(extractErrorMessage(err)) }
  }
  useEffect(() => { void load() }, [])

  const roots = useMemo(() => buildTree(departments), [departments])
  const byId = useMemo(() => {
    const m = new Map<number, Node>()
    const walk = (ns: Node[]) => ns.forEach((n) => { m.set(n.id, n); walk(n.children) })
    walk(roots)
    return m
  }, [roots])
  const sel = selected != null ? byId.get(selected) ?? null : null
  const active = employees.filter((e) => e.active)
  const countOf = (id: number) => active.filter((e) => e.departmentId === id).length

  const members = tab === '미포함'
    ? active.filter((e) => e.departmentId == null || !byId.has(e.departmentId))
    : sel ? active.filter((e) => e.departmentId === sel.id) : []
  const shown = members.filter((e) => !keyword || e.name.includes(keyword) || (e.code ?? '').includes(keyword))

  function open(d: Dialog) {
    setFnOpen(false)
    setPick('')
    setNewName(sel?.name ?? '')
    setError('')
    setDialog(d)
  }

  async function putDept(d: Department, patch: Partial<Pick<Department, 'name' | 'parentId'>>) {
    await api.put(`/departments/${d.id}`, {
      name: patch.name ?? d.name,
      parentId: 'parentId' in patch ? patch.parentId : d.parentId,
      sortOrder: d.sortOrder,
      active: d.active,
    })
  }

  async function apply() {
    setError('')
    try {
      if (dialog === 'child') {
        if (!sel) return
        const child = departments.find((x) => String(x.id) === pick)
        if (!child) return setError('하위부서를 선택하세요.')
        await putDept(child, { parentId: sel.id })
      } else if (dialog === 'move') {
        if (!sel) return
        await putDept(sel, { parentId: pick ? Number(pick) : null })
      } else if (dialog === 'rename') {
        if (!sel) return
        if (!newName.trim()) return setError('부서명을 입력하세요.')
        await putDept(sel, { name: newName.trim() })
      } else if (dialog === 'deptChange') {
        if (!pick) return setError('옮길 부서를 선택하세요.')
        for (const id of checked) await api.put(`/employees/${id}/department`, { departmentId: Number(pick) })
        setChecked(new Set())
      }
      setDialog(null)
      await load()
    } catch (err) { setError(extractErrorMessage(err)) }
  }

  useShortcut('F8', () => void apply(), dialog != null)

  async function doExcel() {
    const table = document.querySelector('#org-members') as HTMLTableElement | null
    if (!table || !(await exportTableToXlsx(table, '조직도등록'))) setError('내보낼 자료가 없습니다.')
  }

  /** 하위부서로 고를 수 있는 부서 — 자기와 자기 위쪽(고리가 된다)은 뺀다. */
  const ancestorsOf = (n: Node | null): number[] => {
    const out: number[] = []
    let cur = n
    while (cur) { out.push(cur.id); cur = cur.parentId != null ? byId.get(cur.parentId) ?? null : null }
    return out
  }
  const childCandidates = departments.filter((d) => d.active && !ancestorsOf(sel).includes(d.id) && d.parentId !== sel?.id)
  const moveCandidates = sel ? departments.filter((d) => d.active && !subtreeIds(sel).includes(d.id)) : []

  const matchFind = (n: Node): boolean => !find || n.name.includes(find) || n.children.some(matchFind)

  const nodeRow = (n: Node) => {
    if (!matchFind(n)) return null
    const isOpen = !closed.has(n.id) || !!find
    return (
      <div key={n.id}>
        <div className={`flex items-center gap-[4px] h-[24px] rounded-ec-menu pr-[4px] cursor-pointer ${selected === n.id ? 'bg-ec-blue-wash' : ''}`}
             onClick={() => { setSelected(n.id); setTab('포함'); setFnOpen(false); setChecked(new Set()) }}>
          <button type="button" aria-label={isOpen ? '접기' : '펴기'}
                  className={`no-ec w-[14px] bg-transparent border-0 p-0 text-ec-hint ${n.children.length ? '' : 'invisible'}`}
                  onClick={(e) => { e.stopPropagation(); setClosed((s) => { const x = new Set(s); x.has(n.id) ? x.delete(n.id) : x.add(n.id); return x }) }}>
            {isOpen ? '▿' : '▹'}
          </button>
          <span className="text-[12px] text-ec-ink">{n.name}({countOf(n.id)})</span>
          {selected === n.id && (
            <span className="relative">
              <button type="button" className="ec-btn ec-btn-sm" onClick={(e) => { e.stopPropagation(); setFnOpen((v) => !v) }}>Fn</button>
              {fnOpen && (
                <div className="absolute left-0 top-[24px] z-10 bg-ec-panel border border-ec-line border-solid rounded-ec p-[4px] flex flex-col min-w-[110px]"
                     onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="ec-btn ec-btn-sm justify-start" onClick={() => open('child')}>하위부서추가</button>
                  <button type="button" className="ec-btn ec-btn-sm justify-start" onClick={() => open('move')}>그룹이동</button>
                  <button type="button" className="ec-btn ec-btn-sm justify-start" onClick={() => open('rename')}>이름변경</button>
                </div>
              )}
            </span>
          )}
        </div>
        {isOpen && n.children.length > 0 && <div className="pl-[18px]">{n.children.map(nodeRow)}</div>}
      </div>
    )
  }

  const title = tab === '미포함' ? '미포함' : sel ? sel.name : (companyName ?? '회사')

  return (
    <EcListShell title="조직도등록" search={keyword} onSearchChange={setKeyword} option={false}>
      {error && !dialog && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="flex gap-[14px] items-start">
        {/* 왼쪽 나무 */}
        <div className="w-[230px] shrink-0 bg-ec-panel rounded-ec-panel p-[9px] flex flex-col gap-[6px] mobile:w-full">
          <input className="ec-input w-full" placeholder="🔍" aria-label="부서 찾기" value={find} onChange={(e) => setFind(e.target.value)} />
          <div className="flex gap-[4px]">
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => setClosed(new Set([...byId.keys()]))}>전체접기</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => { setTab('미포함'); setSelected(null); setChecked(new Set()) }}>미포함</button>
          </div>
          <div>
            <div className={`h-[24px] flex items-center px-[4px] rounded-ec-menu cursor-pointer font-bold text-[12px] ${selected == null && tab === '포함' ? 'bg-ec-blue-wash' : ''}`}
                 onClick={() => { setSelected(null); setTab('포함') }}>
              {companyName ?? '회사'}
            </div>
            <div className="pl-[18px]">{roots.map(nodeRow)}</div>
            <div className={`h-[24px] flex items-center px-[4px] mt-[4px] rounded-ec-menu cursor-pointer font-bold text-[12px] ${tab === '미포함' ? 'bg-ec-blue-wash' : ''}`}
                 onClick={() => { setTab('미포함'); setSelected(null) }}>미포함</div>
          </div>
          <div className="flex flex-wrap gap-[4px] mt-[10px]">
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => void doExcel()}>Excel</button>
            <button type="button" className="ec-btn ec-btn-sm" onClick={() => navigate('/groupware/org-status')}>조직도 미리보기</button>
          </div>
        </div>

        {/* 오른쪽 사람 */}
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold mb-[8px]">{title}</div>
          <div className="flex items-center mb-[6px]">
            <div className="ec-pills">
              <button type="button" className={`ec-pill no-ec${tab === '포함' ? ' active' : ''}`} onClick={() => setTab('포함')}>포함</button>
            </div>
            <div className="ec-pills ml-auto">
              <button type="button" className={`ec-pill no-ec${tab === '미포함' ? ' active' : ''}`}
                      onClick={() => { setTab('미포함'); setSelected(null) }}>미포함(전체그룹)</button>
            </div>
          </div>
          <div className="flex gap-[4px] mb-[6px]">
            <button type="button" className="ec-btn ec-btn-sm disabled:opacity-45" disabled={checked.size === 0}
                    onClick={() => open('deptChange')}>부서변경</button>
          </div>
          <table id="org-members" className="w-full text-left">
            <thead>
              <tr>
                <th className="w-[34px] text-center cursor-pointer"
                    onClick={() => setChecked(checked.size === shown.length ? new Set() : new Set(shown.map((e) => e.id)))}>
                  {shown.length > 0 && checked.size === shown.length ? '☑' : '☐'}
                </th>
                <th>사원번호</th>
                <th>성명</th>
                <th>소속부서</th>
                <th>직위/직급</th>
              </tr>
            </thead>
            <tbody>
              {tab === '포함' && !sel ? (
                <tr><td colSpan={5} className="text-center text-ec-ink">조회할 그룹을 선택바랍니다.</td></tr>
              ) : shown.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-ec-ink">등록된 데이터가 없습니다.</td></tr>
              ) : shown.map((e, i) => (
                <tr key={e.id}>
                  <td className={`text-center cursor-pointer ${checked.has(e.id) ? 'bg-ec-blue-wash text-ec-navy font-bold' : 'bg-ec-stripe text-ec-hint'}`}
                      onClick={() => setChecked((s) => { const x = new Set(s); x.has(e.id) ? x.delete(e.id) : x.add(e.id); return x })}>
                    {i + 1}
                  </td>
                  <td className="text-ec-navy">{e.code}</td>
                  <td>{e.name}</td>
                  <td>{e.department}</td>
                  <td>{e.jobTitle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal error={error} open={dialog != null} onClose={() => setDialog(null)} width={640}
             title={dialog === 'child' ? '하위부서추가' : dialog === 'move' ? '그룹이동' : dialog === 'rename' ? '이름변경' : '부서변경'}>
        <ul className="ec-form mb-[10px]">
          {dialog === 'child' && (
            <>
              <li className="wide"><div className="title">상위부서</div><div className="form">{sel?.name}</div></li>
              <li className="wide"><div className="title">하위부서</div><div className="form">
                <CodePickerField label="하위부서" hideLabel width={240} emptyLabel="선택 안 함" value={pick} onChange={setPick}
                                 items={childCandidates.map((d) => ({ value: String(d.id), code: d.code, name: d.name }))} />
              </div></li>
            </>
          )}
          {dialog === 'move' && (
            <>
              <li className="wide"><div className="title">부서</div><div className="form">{sel?.name}</div></li>
              <li className="wide"><div className="title">이동할 그룹</div><div className="form">
                <CodePickerField label="이동할 그룹" hideLabel width={240} emptyLabel={companyName ?? '맨 위'} value={pick} onChange={setPick}
                                 items={moveCandidates.map((d) => ({ value: String(d.id), code: d.code, name: d.name }))} />
              </div></li>
            </>
          )}
          {dialog === 'rename' && (
            <li className="wide"><div className="title">부서명</div><div className="form">
              <input className="ec-input w-full" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div></li>
          )}
          {dialog === 'deptChange' && (
            <>
              <li className="wide"><div className="title">대상</div><div className="form">{checked.size}명</div></li>
              <li className="wide"><div className="title">부서</div><div className="form">
                <CodePickerField label="부서" hideLabel width={240} emptyLabel="선택 안 함" value={pick} onChange={setPick}
                                 items={departments.filter((d) => d.active).map((d) => ({ value: String(d.id), code: d.code, name: d.name }))} />
              </div></li>
            </>
          )}
        </ul>
        <div className="flex gap-[6px]">
          <button type="button" className="ec-btn ec-btn-primary" onClick={() => void apply()}>적용(F8)</button>
          <button type="button" className="ec-btn" onClick={() => setDialog(null)}>닫기</button>
        </div>
      </Modal>
    </EcListShell>
  )
}
