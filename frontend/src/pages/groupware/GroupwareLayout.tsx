import { NavLink, Outlet } from 'react-router-dom'

/** 그룹웨어 좌측 localNav — 이카운트처럼 섹션(전자결재/업무관리)로 그룹핑 */
interface Section { title: string; items: { to: string; label: string }[] }

const SECTIONS: Section[] = [
  {
    title: '전자결재',
    items: [
      { to: '/groupware/approval/draft', label: '기안서작성' },
      { to: '/groupware/approval/my', label: '내결재관리' },
      { to: '/groupware/approval/all', label: '기안서통합관리' },
    ],
  },
  {
    title: '업무관리',
    items: [
      { to: '/groupware/drive', label: 'ECDrive' },
      { to: '/groupware/board', label: '업무관리게시판' },
      { to: '/groupware/work', label: 'WORK' },
      { to: '/groupware/worklog', label: '업무일지' },
    ],
  },
  {
    title: '근태관리',
    items: [
      { to: '/groupware/attendance', label: '출/퇴근기록부(ID)' },
    ],
  },
  {
    title: '고객/프로젝트',
    items: [
      { to: '/groupware/crm', label: '고객관리' },
      { to: '/groupware/project', label: '프로젝트' },
      { to: '/groupware/shared', label: '공유정보' },
    ],
  },
  {
    title: '정보/일정',
    items: [
      { to: '/groupware/notice', label: '공지사항' },
      { to: '/groupware/schedule', label: '일정관리' },
      { to: '/groupware/survey', label: '설문조사' },
      { to: '/groupware/survey-input', label: '설문조사입력' },
      { to: '/groupware/survey-status', label: '설문조사현황' },
      { to: '/groupware/supplies', label: '공용품관리' },
    ],
  },
  {
    title: '일정/공정표',
    items: [
      { to: '/groupware/dev-schedule', label: 'SW개발일정관리' },
      { to: '/groupware/construction-schedule', label: '건설예정공정표' },
    ],
  },
]

export default function GroupwareLayout() {
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 150px)', background: '#fff', border: '1px solid var(--ec-border)', borderRadius: 3, overflow: 'hidden' }}>
      <aside style={{ width: 176, background: '#fafbfc', borderRight: '1px solid var(--ec-border)', padding: '8px 0', flexShrink: 0 }}>
        <div style={{ padding: '4px 14px 8px', fontSize: 13, fontWeight: 800, color: 'var(--ec-blue-dark)' }}>🗂 그룹웨어</div>
        {SECTIONS.map((s) => (
          <div key={s.title} style={{ marginBottom: 6 }}>
            <div style={{ padding: '6px 14px 3px', fontSize: 11.5, fontWeight: 700, color: '#8a929c' }}>{s.title}</div>
            {s.items.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                style={({ isActive }) => ({
                  display: 'block', padding: '7px 14px 7px 20px', fontSize: 12.5, textDecoration: 'none',
                  color: isActive ? 'var(--ec-blue)' : '#3a4453',
                  background: isActive ? 'var(--ec-blue-light)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--ec-blue)' : '3px solid transparent',
                  fontWeight: isActive ? 700 : 400,
                })}
              >
                {t.label}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
      <div style={{ flex: 1, minWidth: 0, padding: 12, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
