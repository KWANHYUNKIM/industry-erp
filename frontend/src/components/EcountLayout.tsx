import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/** 이카운트 v5 실제 레이아웃 재현:
 *  [최상단 북마크바] → [흰 메인메뉴(로고+가로메뉴+아바타)] + [우측 세로 앱바] → [본문] */
interface Depth3 { label: string; to?: string }
interface Depth2 { label: string; items: Depth3[] }
interface Depth1 { label: string; groups: Depth2[] }

const MENU: Depth1[] = [
  { label: 'MyPage', groups: [{ label: '기본그룹', items: [{ label: '대시보드', to: '/' }] }] },
  {
    label: 'Self-Customizing',
    groups: [
      { label: '정보관리', items: [{ label: '회사정보관리', to: '/settings/company' }] },
      { label: '사용자관리', items: [{ label: '사용자등록', to: '/users' }] },
      { label: '환경설정', items: [{ label: '환경설정', to: '/settings/preferences' }] },
      { label: '기타관리시스템', items: [{ label: '기타관리시스템', to: '/settings/etc' }] },
      { label: '보안관리', items: [{ label: '보안관리', to: '/settings/security' }] },
      { label: '다운로드', items: [{ label: '다운로드', to: '/settings/download' }] },
    ],
  },
  {
    label: '재고 I',
    groups: [
      { label: '기초등록', items: [{ label: '품목등록', to: '/inventory/items' }, { label: '창고등록', to: '/inventory/warehouses' }, { label: '거래처등록', to: '/sales/partners' }, { label: '관리항목등록', to: '/inventory/manage-items' }, { label: '단가적용순서설정', to: '/inventory/price-order' }, { label: '거래처특별단가그룹', to: '/inventory/special-price-group' }] },
      { label: '영업관리', items: [{ label: '오더관리(수주)', to: '/sales/orders' }, { label: '판매입력', to: '/sales/sell' }, { label: '판매조회', to: '/sales/sales-list' }, { label: '판매현황', to: '/sales/sales-status' }, { label: '판매할인현황', to: '/sales/sales-discount' }, { label: '출하지시서', to: '/sales/shipment-order' }, { label: '출하현황', to: '/sales/shipment' }, { label: '미출하현황', to: '/sales/unshipped' }, { label: '판매단가일괄변경', to: '/sales/sales-price-bulk' }, { label: '거래처중심입력', to: '/sales/partner-entry' }, { label: '거래명세서인쇄', to: '/sales/statement' }, { label: '수금현황', to: '/sales/collection' }, { label: '결제내역조회', to: '/sales/payment-history' }, { label: '결제내역자료비교', to: '/sales/payment-compare' }, { label: '거래처별채권', to: '/sales/ledger' }, { label: '거래처관리대장', to: '/sales/partner-ledger' }] },
      { label: '구매관리', items: [{ label: '구매입력', to: '/sales/buy' }, { label: '구매조회', to: '/sales/purchase-list' }, { label: '구매현황', to: '/sales/purchase-status' }, { label: '구매할인현황', to: '/sales/purchase-discount' }, { label: '구매단가일괄변경', to: '/sales/purchase-price-bulk' }, { label: '지급현황', to: '/sales/payment' }, { label: '거래처별채무', to: '/sales/ledger' }] },
      { label: '재고관리', items: [{ label: '재고현황', to: '/inventory/current' }, { label: '입출고', to: '/inventory/stock-io' }] },
      { label: '생산/외주', items: [{ label: 'BOM(소요량)조회', to: '/production/bom' }, { label: '공정등록', to: '/production/process' }, { label: '자원등록', to: '/production/resource' }, { label: '작업소요시간(BOR)', to: '/production/bor' }, { label: '소요시간계산', to: '/production/time-calc' }, { label: '작업지시', to: '/production/work-orders' }, { label: '작업지시서현황', to: '/production/wo-status' }, { label: '작업지시서별진행현황', to: '/production/wo-progress' }, { label: '작업지시서효율현황', to: '/production/wo-efficiency' }, { label: '생산불출', to: '/production/issue' }, { label: '생산불출현황', to: '/production/issue-status' }, { label: '작업내역입력', to: '/production/work-result' }, { label: '작업내역현황', to: '/production/work-result-status' }, { label: '생산입고', to: '/production/result' }, { label: '생산입고 I(BOM기준소모)', to: '/production/receipt-bom' }, { label: '생산입고 II(소모품목선택)', to: '/production/receipt-manual' }, { label: '생산입고조회', to: '/production/receipt-inquiry' }, { label: '생산입고현황', to: '/production/receipt-status' }, { label: '생산입고 소모현황', to: '/production/consume-status' }] },
      { label: '기타이동', items: [{ label: '기타이동', to: '/inventory/transfer' }] },
      { label: '쇼핑몰관리', items: [{ label: '쇼핑몰관리', to: '/sales/mall' }] },
      { label: '출력물', items: [{ label: '출력물', to: '/inventory/reports' }] },
    ],
  },
  {
    label: '재고 II',
    groups: [
      { label: 'A/S관리', items: [{ label: 'A/S관리', to: '/quality/as' }] },
      { label: '시리얼/로트No.', items: [{ label: '시리얼/로트No.', to: '/quality/serial-lot' }] },
      { label: '품질관리', items: [{ label: '품질관리', to: '/quality/inspection' }] },
      { label: '계획관리', items: [{ label: '생산계획(MPS)', to: '/production/planning' }, { label: '생산계획(MRP)리스트', to: '/production/mrp' }] },
      { label: '이익관리', items: [{ label: '품목별원가/이익', to: '/accounting/item-cost' }, { label: '손익요약', to: '/accounting/profit' }, { label: '월별이익현황', to: '/accounting/monthly-profit' }, { label: '일별이익현황', to: '/accounting/daily-profit' }] },
      { label: '오더관리', items: [{ label: '오더관리', to: '/sales/orders' }, { label: '오더관리유형리스트', to: '/sales/order-types' }, { label: '오더관리진행단계', to: '/sales/order-stages' }] },
      { label: '수출관리', items: [{ label: '수출관리', to: '/sales/export' }] },
      { label: 'WMS', items: [{ label: 'WMS', to: '/inventory/wms' }] },
    ],
  },
  {
    label: '회계 I',
    groups: [
      { label: '기초등록', items: [{ label: '계정과목등록', to: '/accounting/accounts' }] },
      { label: '원가관리', items: [{ label: '원가생성/수정', to: '/accounting/cost-build' }, { label: '표준원가현황', to: '/accounting/standard-cost' }, { label: '실제원가현황', to: '/accounting/actual-cost' }, { label: '원가차이분석', to: '/accounting/variance' }] },
      { label: '출력물', items: [{ label: '매입매출·부가세', to: '/accounting/vat' }] },
    ],
  },
  { label: '회계 II', groups: [{ label: '비용관리', items: [{ label: '비용관리', to: '/accounting/expense' }, { label: '비용내역현황', to: '/accounting/expense-detail' }] }] },
  {
    label: '관리',
    groups: [
      { label: '근태관리', items: [{ label: '근태입력', to: '/hr/attendance-input' }, { label: '근태조회', to: '/hr/attendance-list' }, { label: '근태현황', to: '/hr/attendance-status' }, { label: '출/퇴근기록부(ID)', to: '/groupware/attendance' }] },
      { label: '휴가관리', items: [{ label: '휴가사용실적현황', to: '/hr/vacation-use' }, { label: '휴가잔여일수현황', to: '/hr/vacation-remain' }] },
    ],
  },
  {
    label: '그룹웨어',
    groups: [
      { label: '전자결재', items: [{ label: '기안서작성', to: '/groupware/approval/draft' }, { label: '내결재관리', to: '/groupware/approval/my' }, { label: '기안서통합관리', to: '/groupware/approval/all' }] },
      { label: '업무관리', items: [{ label: 'WORK', to: '/groupware/work' }, { label: '업무일지', to: '/groupware/worklog' }, { label: 'ECDrive', to: '/groupware/drive' }, { label: '업무관리게시판', to: '/groupware/board' }] },
      { label: '근태관리', items: [{ label: '출/퇴근기록부(ID)', to: '/groupware/attendance' }] },
      { label: '공유정보', items: [{ label: '공유정보', to: '/groupware/shared' }] },
      { label: '고객관리', items: [{ label: '고객관리', to: '/groupware/crm' }] },
      { label: '프로젝트', items: [{ label: '프로젝트', to: '/groupware/project' }] },
      { label: '정보/일정', items: [{ label: '공지사항', to: '/groupware/notice' }, { label: '일정관리', to: '/groupware/schedule' }, { label: '설문조사', to: '/groupware/survey' }, { label: '설문조사입력', to: '/groupware/survey-input' }, { label: '설문조사현황', to: '/groupware/survey-status' }, { label: '공용품관리', to: '/groupware/supplies' }] },
      { label: '일정/공정표', items: [{ label: 'SW개발일정관리', to: '/groupware/dev-schedule' }, { label: '건설예정공정표', to: '/groupware/construction-schedule' }] },
    ],
  },
  {
    label: '데이터센터',
    groups: [
      { label: '데이터수집', items: [{ label: '데이터수집', to: '/datacenter/collect' }] },
      { label: '데이터내보내기', items: [{ label: '데이터내보내기', to: '/datacenter/export' }] },
    ],
  },
]

const BOOKMARKS: { label: string; to: string }[] = [
  { label: '품목등록', to: '/inventory/items' },
  { label: '거래처등록', to: '/sales/partners' },
  { label: '구매입력', to: '/sales/buy' },
  { label: '판매입력', to: '/sales/sell' },
  { label: '거래처별채권', to: '/sales/ledger' },
  { label: '거래처별채무', to: '/sales/ledger' },
]

// 우측 세로 앱바 아이콘 (시각 재현용)
const APPS = ['🌙', '🤖', '🔍', '🎧', '➕', '📄', '🔔', '💬', '📨', '🖨️', '🔖', '📊', '🕒', '📌', '⚙️']

export default function EcountLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  function go(item: Depth3, e: React.MouseEvent) {
    e.preventDefault()
    setOpenIdx(null)
    if (item.to) navigate(item.to)
    else alert(`[${item.label}] 메뉴는 준비 중입니다.`)
  }

  // 현재 경로가 이 대메뉴에 속하는지(활성 표시)
  function isActiveTop(m: Depth1) {
    return m.groups.some((g) => g.items.some((it) => it.to && location.pathname.startsWith(it.to)))
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* ===== 최상단 북마크바 ===== */}
      <div style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #eef0f3', fontSize: 12, gap: 2 }}>
        <span style={{ color: '#8a929c', marginRight: 4 }}>🔍</span>
        <input className="ec-input" placeholder="메뉴검색" style={{ height: 22, width: 110, border: '1px solid #e2e6eb' }} />
        <button className="ec-btn" style={{ height: 22, marginRight: 8 }}>사이트맵</button>
        {BOOKMARKS.map((b, i) => (
          <NavLink key={i} to={b.to} style={({ isActive }) => ({
            padding: '0 10px', height: 24, display: 'flex', alignItems: 'center', textDecoration: 'none',
            color: isActive ? 'var(--ec-blue)' : '#4a5260', fontWeight: isActive ? 700 : 400,
          })}>
            {b.label}
          </NavLink>
        ))}
        <span style={{ marginLeft: 'auto', color: '#b6bcc4' }}>📌</span>
      </div>

      {/* ===== 메인 영역: [메뉴+본문] + [우측 세로 앱바] ===== */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* 흰 메인메뉴 (로고 + 가로메뉴 + 아바타) */}
          <div style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 8px 0 16px', borderBottom: '1px solid #e6e9ee', position: 'relative', zIndex: 30 }}
               onMouseLeave={() => setOpenIdx(null)}>
            <Link to="/" style={{ display: 'flex', alignItems: 'baseline', gap: 0, textDecoration: 'none', marginRight: 18 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--ec-blue)', letterSpacing: -0.5 }}>제조</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#222', letterSpacing: -0.5 }}>ERP</span>
            </Link>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'center', height: '100%' }}>
              {MENU.map((m, idx) => {
                const active = isActiveTop(m)
                return (
                  <li key={m.label} onMouseEnter={() => setOpenIdx(idx)} style={{ position: 'relative', height: '100%' }}>
                    <div style={{
                      padding: '0 14px', height: '100%', display: 'flex', alignItems: 'center', cursor: 'pointer',
                      fontSize: 14, fontWeight: active || openIdx === idx ? 700 : 500,
                      color: active || openIdx === idx ? 'var(--ec-blue)' : '#2a3242',
                      borderBottom: active ? '2px solid var(--ec-blue)' : '2px solid transparent',
                    }}>
                      {m.label}
                    </div>

                    {openIdx === idx && (
                      <div style={{
                        position: 'absolute', top: 52, left: 0, background: '#fff',
                        border: '1px solid var(--ec-border)', boxShadow: '0 8px 22px rgba(20,36,68,0.16)',
                        display: 'flex', padding: 12, gap: 4, minWidth: 170,
                      }}>
                        {m.groups.map((g) => (
                          <div key={g.label} style={{ minWidth: 148, padding: '0 8px' }}>
                            <div style={{ fontWeight: 700, color: 'var(--ec-blue-dark)', fontSize: 12.5, padding: '2px 6px 6px', borderBottom: '1px solid #eef1f5', marginBottom: 5 }}>
                              {g.label}
                            </div>
                            {g.items.map((it) => (
                              <a key={it.label} href={it.to ?? '#'} onClick={(e) => go(it, e)}
                                 style={{ display: 'block', padding: '5px 6px', fontSize: 12.5, color: it.to ? '#333' : '#b3b8bf', textDecoration: 'none', borderRadius: 3 }}
                                 onMouseEnter={(e) => { if (it.to) { e.currentTarget.style.background = 'var(--ec-blue-light)'; e.currentTarget.style.color = 'var(--ec-blue-dark)' } }}
                                 onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = it.to ? '#333' : '#b3b8bf' }}>
                                {it.label}
                              </a>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* 우측 사용자 아바타 */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 6 }}>
              <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
                <div style={{ fontSize: 12.5, color: '#2a3242', fontWeight: 600 }}>{user?.name}</div>
                <div style={{ fontSize: 11, color: '#9aa1ab' }}>{user?.roles.join(', ')}</div>
              </div>
              <div title={user?.name} style={{ width: 30, height: 30, borderRadius: '50%', background: '#eef1f6', border: '1px solid #dfe3e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#8a929c' }}>👤</div>
              <button className="ec-btn" onClick={logout} style={{ height: 24 }}>로그아웃</button>
            </div>
          </div>

          {/* 본문 */}
          <div style={{ flex: 1, padding: 12, overflow: 'auto', background: 'var(--ec-body-bg)' }}>
            <Outlet />
          </div>
        </div>

        {/* 우측 세로 앱바 */}
        <div style={{ width: 44, background: '#fff', borderLeft: '1px solid #e6e9ee', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 12, fontSize: 16, color: '#6b7280' }}>
          {APPS.map((a, i) => <span key={i} title="앱" style={{ cursor: 'pointer' }}>{a}</span>)}
        </div>
      </div>
    </div>
  )
}
