import { useEffect, useMemo, useRef, useState } from 'react'
import EcListShell from '../../components/EcListShell'
import { api, extractErrorMessage } from '../../api/client'
import type { Department, EmployeeMaster } from '../../types/api'
import { openPrintWindow, fillAndPrint } from '../../utils/print'

interface Node extends Department {
  children: Node[]
  members: EmployeeMaster[]
}

/** 부서를 나무로 세운다 — 순서는 sortOrder → 이름. 쓰지 않는 부서는 뺀다. */
function buildTree(depts: Department[], emps: EmployeeMaster[]): Node[] {
  const byId = new Map<number, Node>()
  for (const d of depts.filter((x) => x.active)) byId.set(d.id, { ...d, children: [], members: [] })
  for (const e of emps) {
    if (e.active && e.departmentId != null) byId.get(e.departmentId)?.members.push(e)
  }
  const roots: Node[] = []
  for (const n of byId.values()) {
    const parent = n.parentId != null ? byId.get(n.parentId) : undefined
    if (parent) parent.children.push(n)
    else roots.push(n)
  }
  const sort = (ns: Node[]) => {
    ns.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    ns.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

/**
 * 그룹웨어 > 공유정보 > 조직도관리 > 조직도현황 (이카운트 E090220)
 *
 * <p>예전 메뉴 주석은 '원본에서도 권한없음이라 근거가 없다' 였는데 2026-10-03 원본이 열려 실측했다.
 * <b>보기만 하는 조직도</b>다 — 부서 상자가 나무 꼴로 위에서 아래로 이어지고, 상자 안에 그 부서 사람의
 * [성명](링크색) · [직급]이 한 줄씩 놓인다. 위에는 확대·축소(🔍+ 🔍−), 아래는 [인쇄] 하나.
 * 부서·사원을 고치는 것은 조직도등록·사원등록이다.
 *
 * <p>실측: 부서 머리 바탕 rgb(27,61,161)(= --ec-blue-hover) · 흰 글자 12px 700 · 위 모서리 10 · 여백 6.3 4.5 ·
 * 상자 폭 161 · 사람 줄 여백 4.5 0. 위아래 상자는 가는 선으로 잇는다.
 */
export default function OrgStatusPage() {
  const [depts, setDepts] = useState<Department[]>([])
  const [emps, setEmps] = useState<EmployeeMaster[]>([])
  const [error, setError] = useState('')
  const [keyword, setKeyword] = useState('')
  const [zoom, setZoom] = useState(1)
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([api.get<Department[]>('/departments'), api.get<EmployeeMaster[]>('/employees')])
      .then(([d, e]) => { setDepts(d.data); setEmps(e.data) })
      .catch((err) => setError(extractErrorMessage(err)))
  }, [])

  const roots = useMemo(() => buildTree(depts, emps), [depts, emps])
  /** 원본 확대·축소. 크기를 인라인 style 로 박지 않으려고 그려진 뒤에 건다. */
  useEffect(() => { if (chartRef.current) chartRef.current.style.zoom = String(zoom) }, [zoom])

  /** 원본 [인쇄] — 그려진 조직도를 그대로 종이로. */
  function printChart() {
    const el = chartRef.current
    if (!el) return
    const win = openPrintWindow()
    if (!win) return
    const css = [...document.querySelectorAll('style, link[rel=stylesheet]')].map((n) => n.outerHTML).join('')
    fillAndPrint(win, `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>조직도현황</title>${css}</head>
<body><h1 class="text-[14px] font-bold">조직도현황</h1>${el.outerHTML}</body></html>`)
  }

  const box = (n: Node) => (
    <div className="ec-org-node">
      <div className="ec-org-box">
        <div className="ec-org-head">{n.name}</div>
        {n.members.length > 0 && (
          <ul className="ec-org-members">
            {n.members.map((m) => (
              <li key={m.id} className={keyword && m.name.includes(keyword) ? 'hit' : ''}>
                <span className="text-ec-navy">{m.name}</span>
                <span>{m.jobTitle}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {n.children.length > 0 && (
        <div className="ec-org-children">
          {n.children.map((c) => <div key={c.id} className="ec-org-branch">{box(c)}</div>)}
        </div>
      )}
    </div>
  )

  return (
    <EcListShell
      title="조직도현황"
      search={keyword}
      onSearchChange={setKeyword}
      actions={[{ label: '인쇄', onClick: printChart }]}
    >
      {error && <p className="ec-alert ec-alert-danger mb-[8px]">{error}</p>}
      <div className="flex gap-[4px] mb-[10px]">
        <button type="button" className="ec-btn ec-btn-sm" aria-label="확대" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>🔍+</button>
        <button type="button" className="ec-btn ec-btn-sm" aria-label="축소" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>🔍−</button>
      </div>
      <div className="overflow-auto">
        <div ref={chartRef} className="ec-org-chart">
          {roots.length === 0
            ? <div className="ec-empty">등록된 데이터가 없습니다.</div>
            : roots.map((r) => <div key={r.id} className="ec-org-branch">{box(r)}</div>)}
        </div>
      </div>
    </EcListShell>
  )
}
