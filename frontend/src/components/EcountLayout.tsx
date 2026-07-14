import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/** 이카운트 v5 실제 레이아웃 재현:
 *  [최상단 북마크바]
 *  [흰 메인메뉴: 로고 + 대메뉴(Depth1) + 아바타]
 *  [탭바: 활성 대메뉴의 탭(Depth2)]
 *  [좌측 사이드바: 활성 탭의 트리(Depth3 그룹 / Depth4 리프)] + [본문] + [우측 세로 앱바]
 */
interface Leaf { label: string; to?: string }
interface Group { label: string; children: Leaf[] }
type SideNode = Leaf | Group
interface Tab { label: string; nodes: SideNode[] }
interface TopMenu { label: string; tabs: Tab[] }

const isGroup = (n: SideNode): n is Group => 'children' in n

/** 대메뉴 > 탭 > (그룹 >) 리프.
 *  회계 I·회계 II·관리·세무·그룹웨어·재고 II·데이터센터의 탭 구성은 이카운트 사이트맵을 따랐고,
 *  실제 페이지가 있는 메뉴만 실었다. MyPage·Self-Customizing·재고 I 은 이카운트 트리 자료가 없어
 *  기존 그룹을 탭으로 그대로 승격만 해두었다. */
const MENU: TopMenu[] = [
  {
    label: 'MyPage',
    tabs: [{ label: 'MyPage', nodes: [{ label: '대시보드', to: '/' }] }],
  },
  {
    label: 'Self-Customizing',
    tabs: [
      { label: '정보관리', nodes: [{ label: '회사정보관리', to: '/settings/company' }] },
      { label: '사용자관리', nodes: [{ label: '사용자등록', to: '/users' }] },
      { label: '환경설정', nodes: [{ label: '환경설정', to: '/settings/preferences' }] },
      { label: '기타관리시스템', nodes: [{ label: '기타관리시스템', to: '/settings/etc' }] },
      { label: '보안관리', nodes: [{ label: '보안관리', to: '/settings/security' }] },
      { label: '인쇄서식', nodes: [{ label: '인쇄용 결재라인', to: '/settings/print-sign' }] },
      { label: '다운로드', nodes: [{ label: '다운로드', to: '/settings/download' }] },
    ],
  },
  {
    label: '재고 I',
    tabs: [
      {
        label: '기초등록',
        nodes: [
          { label: '품목등록', to: '/inventory/items' },
          { label: '창고등록', to: '/inventory/warehouses' },
          { label: '거래처등록', to: '/sales/partners' },
          { label: '부서등록', to: '/groupware/org' },
          { label: '관리항목등록', to: '/inventory/manage-items' },
          { label: '단가적용순서설정', to: '/inventory/price-order' },
          { label: '거래처특별단가그룹', to: '/inventory/special-price-group' },
        ],
      },
      {
        label: '영업관리',
        nodes: [
          { label: '견적서', to: '/sales/quotations' },
          { label: '판매입력', to: '/sales/sell' },
          { label: '판매조회', to: '/sales/sales-list' },
          { label: '판매현황', to: '/sales/sales-status' },
          { label: '판매할인현황', to: '/sales/sales-discount' },
          { label: '판매단가일괄변경', to: '/sales/sales-price-bulk' },
          { label: '거래처중심입력', to: '/sales/partner-entry' },
          { label: '거래명세서인쇄', to: '/sales/statement' },
          { label: '출하지시서', to: '/sales/shipment-order' },
          { label: '출하현황', to: '/sales/shipment' },
          { label: '미출하현황', to: '/sales/unshipped' },
          { label: '수금현황', to: '/sales/collection' },
          { label: '수금/지급', to: '/sales/settlement' },
          { label: '결제내역조회', to: '/sales/payment-history' },
          { label: '결제내역자료비교', to: '/sales/payment-compare' },
          { label: '회계반영/미반영', to: '/sales/accounting-reflection' },
          { label: '채권·채무현황', to: '/sales/ledger' },
          { label: '거래처관리대장', to: '/sales/partner-ledger' },
        ],
      },
      {
        label: '구매관리',
        nodes: [
          { label: '발주서', to: '/sales/purchase-orders' },
          { label: '구매입력', to: '/sales/buy' },
          { label: '구매조회', to: '/sales/purchase-list' },
          { label: '구매현황', to: '/sales/purchase-status' },
          { label: '구매할인현황', to: '/sales/purchase-discount' },
          { label: '구매단가일괄변경', to: '/sales/purchase-price-bulk' },
          { label: '외주비할인현황', to: '/sales/outsourcing-discount' },
          { label: '지급현황', to: '/sales/payment' },
          { label: '미지급현황', to: '/sales/payable' },
        ],
      },
      {
        label: '재고관리',
        nodes: [
          { label: '재고현황', to: '/inventory/current' },
          { label: '입출고', to: '/inventory/stock-io' },
        ],
      },
      {
        label: '생산/외주',
        nodes: [
          { label: 'BOM(소요량)등록', to: '/production/bom' },
          { label: '공정등록', to: '/production/process' },
          { label: '자원등록', to: '/production/resource' },
          { label: '작업소요시간(BOR)', to: '/production/bor' },
          { label: '소요시간계산', to: '/production/time-calc' },
          { label: '작업지시', to: '/production/work-orders' },
          { label: '작업지시서현황', to: '/production/wo-status' },
          { label: '작업지시서별진행현황', to: '/production/wo-progress' },
          { label: '작업지시서효율현황', to: '/production/wo-efficiency' },
          { label: '생산불출', to: '/production/issue' },
          { label: '생산불출현황', to: '/production/issue-status' },
          { label: '작업내역입력', to: '/production/work-result' },
          { label: '작업내역현황', to: '/production/work-result-status' },
          { label: '생산실적', to: '/production/result' },
          { label: '생산입고 I(BOM기준소모)', to: '/production/receipt-bom' },
          { label: '생산입고 II(소모품목선택)', to: '/production/receipt-manual' },
          { label: '생산입고조회', to: '/production/receipt-inquiry' },
          { label: '생산입고현황', to: '/production/receipt-status' },
          { label: '생산입고 소모현황', to: '/production/consume-status' },
        ],
      },
      { label: '기타이동', nodes: [{ label: '기타이동', to: '/inventory/transfer' }] },
      { label: '쇼핑몰관리', nodes: [{ label: '쇼핑몰관리', to: '/sales/mall' }] },
      { label: '출력물', nodes: [{ label: '출력물', to: '/inventory/reports' }] },
    ],
  },
  {
    label: '재고 II',
    tabs: [
      { label: 'A/S관리', nodes: [{ label: 'A/S관리', to: '/quality/as' }] },
      { label: '시리얼/로트No.', nodes: [{ label: '시리얼/로트No.', to: '/quality/serial-lot' }] },
      { label: '품질관리', nodes: [{ label: '품질관리', to: '/quality/inspection' }] },
      {
        label: '계획관리',
        nodes: [
          { label: '생산계획(MPS)', to: '/production/planning' },
          { label: '생산계획(MRP)리스트', to: '/production/mrp' },
        ],
      },
      {
        label: '이익관리',
        nodes: [
          { label: '손익요약', to: '/accounting/profit' },
          { label: '품목별원가/이익', to: '/accounting/item-cost' },
          {
            label: '월별이익',
            children: [
              { label: '원가생성/수정', to: '/accounting/cost-build' },
              { label: '표준원가현황', to: '/accounting/standard-cost' },
              { label: '실제원가현황', to: '/accounting/actual-cost' },
              { label: '원가차이분석', to: '/accounting/variance' },
              { label: '월별이익현황', to: '/accounting/monthly-profit' },
            ],
          },
          { label: '일별이익', children: [{ label: '일별이익현황', to: '/accounting/daily-profit' }] },
        ],
      },
      {
        label: '오더관리',
        nodes: [
          { label: '오더관리(수주)', to: '/sales/orders' },
          { label: '오더관리유형리스트', to: '/sales/order-types' },
          { label: '오더관리진행단계', to: '/sales/order-stages' },
        ],
      },
      { label: '수출관리', nodes: [{ label: '수출관리', to: '/sales/export' }] },
      { label: 'WMS', nodes: [{ label: 'WMS 로케이션', to: '/inventory/wms' }] },
    ],
  },
  {
    label: '회계 I',
    tabs: [
      {
        label: '기초등록',
        nodes: [
          { label: '거래처등록', to: '/sales/partners' },
          { label: '계정과목등록', to: '/accounting/accounts' },
          { label: '계좌/카드', to: '/accounting/bank-cards' },
        ],
      },
      {
        label: 'FastEntry',
        nodes: [
          { label: '일반전표입력', to: '/accounting/journal-entry' },
          { label: '현금예금입금', to: '/accounting/cash-deposit' },
          { label: '현금예금출금', to: '/accounting/cash-withdraw' },
          { label: '지출결의서', to: '/accounting/vouchers' },
          { label: '입금보고서', to: '/accounting/vouchers' },
          { label: '가지급금정산서', to: '/accounting/vouchers' },
        ],
      },
      {
        label: '어음거래',
        nodes: [
          { label: '어음등록(수취/발행)', to: '/accounting/notes' },
          { label: '어음현황', to: '/accounting/notes' },
        ],
      },
      {
        label: '고정자산',
        nodes: [{ label: '고정자산·감가상각', to: '/accounting/fixed-assets' }],
      },
      {
        label: '전자(세금)계산서',
        nodes: [
          { label: '매출세금계산서', to: '/accounting/tax-invoice-sales' },
          { label: '매입세금계산서', to: '/accounting/tax-invoice-purchase' },
        ],
      },
      {
        label: '회계거래관리',
        nodes: [
          { label: '회계전표조회', to: '/accounting/journals' },
          { label: '회계반영/미반영', to: '/sales/accounting-reflection' },
        ],
      },
      {
        label: '출력물',
        nodes: [
          {
            label: '장부',
            children: [
              { label: '계정별원장', to: '/accounting/ledger-book' },
              { label: '합계잔액시산표', to: '/accounting/trial-balance' },
            ],
          },
          {
            label: '재무제표',
            children: [
              { label: '재무상태표', to: '/accounting/balance-sheet' },
              { label: '손익계산서', to: '/accounting/income-statement' },
            ],
          },
        ],
      },
    ],
  },
  {
    label: '회계 II',
    tabs: [
      {
        label: '채권관리',
        nodes: [
          { label: '채권·채무현황', to: '/sales/ledger' },
          { label: '거래처관리대장', to: '/sales/partner-ledger' },
        ],
      },
      {
        label: '채무관리',
        nodes: [
          { label: '미지급현황(연령분석)', to: '/sales/payable' },
          { label: '지급현황', to: '/sales/payment' },
          { label: '수금/지급(정산)', to: '/sales/settlement' },
        ],
      },
      {
        label: '자금계획',
        nodes: [{ label: '자금수지계획', to: '/accounting/cash-plan' }],
      },
      {
        label: '예산관리',
        nodes: [{ label: '예산편성·집행현황', to: '/accounting/budget' }],
      },
      {
        label: '비용관리',
        nodes: [
          { label: '기본사항등록', children: [{ label: '비용등록', to: '/accounting/expense' }] },
          { label: '비용현황', children: [{ label: '비용내역현황', to: '/accounting/expense-detail' }] },
        ],
      },
    ],
  },
  {
    label: '관리',
    tabs: [
      {
        label: '급여관리',
        nodes: [
          { label: '기본사항등록', children: [{ label: '사원등록', to: '/hr/employees' }] },
          { label: '급여작업', children: [{ label: '급여계산/대장', to: '/hr/payroll' }] },
          { label: '일용근로', children: [{ label: '일용근로급여관리', to: '/hr/daily-wage' }] },
        ],
      },
      {
        label: '인사관리',
        nodes: [
          { label: '인사기록카드', to: '/hr/records' },
          { label: '인사발령', to: '/hr/records' },
          { label: '조직도', to: '/groupware/org' },
        ],
      },
      {
        label: '전자근로계약',
        nodes: [
          { label: '근로계약서', to: '/hr/contracts' },
        ],
      },
      {
        label: '근태관리',
        nodes: [
          {
            label: '근태',
            children: [
              { label: '근태입력', to: '/hr/attendance-input' },
              { label: '근태조회', to: '/hr/attendance-list' },
              { label: '근태현황', to: '/hr/attendance-status' },
            ],
          },
          { label: '출/퇴근(사원)', children: [{ label: '출/퇴근기록부(ID)', to: '/groupware/attendance' }] },
          {
            label: '출력물',
            children: [
              { label: '휴가잔여일수현황', to: '/hr/vacation-remain' },
              { label: '휴가사용실적현황', to: '/hr/vacation-use' },
            ],
          },
        ],
      },
    ],
  },
  {
    label: '세무',
    tabs: [
      {
        label: '원천징수',
        nodes: [
          { label: '원천징수이행상황신고서', to: '/accounting/withholding' },
          { label: '근로소득원천징수영수증', to: '/accounting/withholding' },
        ],
      },
      {
        label: '기타원천세',
        nodes: [
          { label: '기타원천세(사업·기타소득)', to: '/accounting/other-withholding' },
        ],
      },
      {
        label: '법인세',
        nodes: [
          { label: '법인세 신고서', to: '/accounting/corporate-tax' },
        ],
      },
      {
        label: '부가세',
        nodes: [{ label: '신고전검토자료', children: [{ label: '매입매출·부가세', to: '/accounting/vat' }] }],
      },
    ],
  },
  {
    label: '그룹웨어',
    tabs: [
      {
        label: '공유정보',
        nodes: [
          { label: '주요전달사항', to: '/groupware/shared' },
          { label: '조직도관리', to: '/groupware/org' },
          { label: '게시판', children: [{ label: '공지사항', to: '/groupware/notice' }] },
          {
            label: '사내관리',
            children: [
              { label: '일정관리', to: '/groupware/schedule' },
              { label: '공용품관리', to: '/groupware/supplies' },
            ],
          },
          {
            label: '설문조사',
            children: [
              { label: '설문조사입력', to: '/groupware/survey-input' },
              { label: '설문조사조회', to: '/groupware/survey' },
              { label: '설문조사현황', to: '/groupware/survey-status' },
            ],
          },
        ],
      },
      {
        label: '전자결재',
        nodes: [
          { label: '기안서작성', to: '/groupware/approval/draft' },
          { label: '내결재관리', to: '/groupware/approval/my' },
          { label: '기안서통합관리', to: '/groupware/approval/all' },
        ],
      },
      {
        label: '업무관리',
        nodes: [
          { label: 'ECDrive', to: '/groupware/drive' },
          {
            label: '업무관리게시판',
            children: [
              { label: '업무관리게시판', to: '/groupware/board' },
              { label: 'WORK', to: '/groupware/work' },
            ],
          },
          { label: '업무일지', to: '/groupware/worklog' },
          { label: '출/퇴근', children: [{ label: '출/퇴근기록부(ID)', to: '/groupware/attendance' }] },
        ],
      },
      {
        label: '고객관리',
        nodes: [
          { label: '거래처등록', to: '/sales/partners' },
          { label: '고객관리', to: '/groupware/crm' },
          { label: '명함관리', to: '/groupware/cards' },
          { label: '거래처중심입력', to: '/sales/partner-entry' },
        ],
      },
      {
        label: '프로젝트',
        nodes: [
          { label: '프로젝트', to: '/groupware/project' },
          {
            label: '진척관리',
            children: [
              { label: '건설예정공정표', to: '/groupware/construction-schedule' },
              { label: 'SW개발일정관리', to: '/groupware/dev-schedule' },
            ],
          },
        ],
      },
      {
        label: '공용메일',
        nodes: [
          { label: '메일함(사내·공용)', to: '/groupware/mail' },
        ],
      },
    ],
  },
  {
    label: '데이터센터',
    tabs: [
      { label: '데이터수집', nodes: [{ label: '데이터수집', to: '/datacenter/collect' }] },
      { label: '데이터내보내기', nodes: [{ label: '데이터내보내기', to: '/datacenter/export' }] },
    ],
  },
]

const BOOKMARKS: { label: string; to: string }[] = [
  { label: '품목등록', to: '/inventory/items' },
  { label: '거래처등록', to: '/sales/partners' },
  { label: '구매입력', to: '/sales/buy' },
  { label: '판매입력', to: '/sales/sell' },
  { label: '채권·채무현황', to: '/sales/ledger' },
  { label: '거래처관리대장', to: '/sales/partner-ledger' },
]

// 우측 세로 앱바 아이콘. to가 있으면 라우트 이동, print면 화면 인쇄, 나머지는 안내 문구
interface AppIcon { icon: string; title: string; to?: string; print?: boolean }
const APPS: AppIcon[] = [
  { icon: '🌙', title: '테마' },
  { icon: '🤖', title: 'AI 도우미' },
  { icon: '🔍', title: '통합검색' },
  { icon: '🎧', title: '고객지원' },
  { icon: '➕', title: '빠른등록' },
  { icon: '📄', title: 'ECDrive 문서', to: '/groupware/drive' },
  { icon: '🔔', title: '알림' },
  { icon: '💬', title: '메신저' },
  { icon: '📨', title: '쪽지' },
  { icon: '🖨️', title: '화면 인쇄', print: true },
  { icon: '🔖', title: '즐겨찾기' },
  { icon: '📊', title: '데이터 내보내기', to: '/datacenter/export' },
  { icon: '🕒', title: '최근 사용' },
  { icon: '📌', title: '화면 고정' },
  { icon: '⚙️', title: '환경설정', to: '/settings/preferences' },
]

const tabLeaves = (tab: Tab): Leaf[] => tab.nodes.flatMap((n) => (isGroup(n) ? n.children : [n]))
const firstTabRoute = (tab: Tab) => tabLeaves(tab).find((l) => l.to)?.to
const firstTopRoute = (m: TopMenu) => m.tabs.map(firstTabRoute).find(Boolean)

/** 경로가 메뉴 항목에 해당하면 그 항목의 길이(구체성)를, 아니면 0을 돌려준다.
 *  세그먼트 경계로 끊어야 '/'가 모든 경로를, '/sales/pay'가 '/sales/payment'를 삼키지 않는다. */
function matchLength(to: string, pathname: string): number {
  if (to === '/') return pathname === '/' ? 1 : 0
  return pathname === to || pathname.startsWith(`${to}/`) ? to.length : 0
}

/** 현재 경로를 담은 [대메뉴, 탭] 인덱스. 가장 구체적으로 일치하는 리프를 고른다. */
function resolveActive(pathname: string): [number, number] {
  let best = 0
  let found: [number, number] = [0, 0]
  MENU.forEach((m, mi) =>
    m.tabs.forEach((tab, ti) =>
      tabLeaves(tab).forEach((leaf) => {
        const len = leaf.to ? matchLength(leaf.to, pathname) : 0
        if (len > best) {
          best = len
          found = [mi, ti]
        }
      }),
    ),
  )
  return found
}

// 메뉴검색·사이트맵에서 함께 쓰는, to가 있는 전체 메뉴 항목의 평면 목록
interface FlatItem { label: string; to: string; path: string }
const FLAT_MENU: FlatItem[] = MENU.flatMap((m) =>
  m.tabs.flatMap((tab) =>
    tab.nodes.flatMap((n) =>
      isGroup(n)
        ? n.children.filter((c) => c.to).map((c) => ({ label: c.label, to: c.to!, path: `${m.label} > ${tab.label} > ${n.label}` }))
        : n.to
          ? [{ label: n.label, to: n.to, path: `${m.label} > ${tab.label}` }]
          : [],
    ),
  ),
)

export default function EcountLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null) // 대메뉴 호버 시 뜨는 탭바
  const [menuQuery, setMenuQuery] = useState('')                // 메뉴검색 입력값
  const [sitemapOpen, setSitemapOpen] = useState(false)         // 사이트맵 모달
  const [sitemapIdx, setSitemapIdx] = useState(0)               // 사이트맵 좌측 레일 선택
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}) // 사이드바 그룹 접힘
  const [appNotice, setAppNotice] = useState('')                // 앱바 안내 토스트

  const [topIdx, tabIdx] = useMemo(() => resolveActive(location.pathname), [location.pathname])
  const activeTop = MENU[topIdx]
  const activeTab = activeTop.tabs[tabIdx]

  // 메뉴검색: 입력값이 있으면 부분일치 결과(최대 12개)
  const menuMatches = menuQuery.trim()
    ? FLAT_MENU.filter((x) => x.label.toLowerCase().includes(menuQuery.trim().toLowerCase())).slice(0, 12)
    : []

  function gotoMenu(to: string) {
    setMenuQuery('')
    setSitemapOpen(false)
    setHoverIdx(null)
    navigate(to)
  }

  function openLeaf(leaf: Leaf) {
    if (leaf.to) gotoMenu(leaf.to)
    else alert(`[${leaf.label}] 메뉴는 준비 중입니다.`)
  }

  // 앱바 아이콘 클릭: 라우트가 있으면 이동, 인쇄면 화면 인쇄, 나머지는 안내
  function onApp(app: AppIcon) {
    if (app.to) return navigate(app.to)
    if (app.print) return window.print()
    setAppNotice(`${app.title} 기능은 준비 중입니다.`)
    window.setTimeout(() => setAppNotice(''), 2200)
  }

  function tabBar(menu: TopMenu, activeTabIdx: number | null, floating: boolean) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, height: 34, padding: '0 8px',
        background: '#fff',
        ...(floating
          ? { border: '1px solid var(--ec-border)', borderRadius: 4, boxShadow: '0 8px 22px rgba(20,36,68,0.16)' }
          : { borderBottom: '1px solid #e6e9ee' }),
      }}>
        {menu.tabs.map((tab, i) => {
          const on = i === activeTabIdx
          return (
            <button
              key={tab.label}
              onClick={() => { const to = firstTabRoute(tab); if (to) gotoMenu(to) }}
              style={{
                height: '100%', padding: '0 12px', background: 'none', border: 0, cursor: 'pointer',
                fontSize: 12.5, whiteSpace: 'nowrap',
                color: on ? 'var(--ec-blue)' : '#4a5260', fontWeight: on ? 700 : 400,
                borderBottom: on && !floating ? '2px solid var(--ec-blue)' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    )
  }

  function sidebarLeaf(leaf: Leaf, nested: boolean) {
    const on = !!leaf.to && matchLength(leaf.to, location.pathname) > 0
    return (
      <button
        key={leaf.label}
        onClick={() => openLeaf(leaf)}
        style={{
          display: 'block', width: '100%', textAlign: 'left', border: 0, cursor: 'pointer',
          padding: nested ? '6px 10px 6px 24px' : '6px 10px 6px 12px',
          fontSize: 12.5, borderRadius: 0,
          color: on ? 'var(--ec-blue)' : leaf.to ? '#3a4453' : '#b3b8bf',
          background: on ? 'var(--ec-blue-light)' : 'transparent',
          fontWeight: on ? 700 : 400,
          borderLeft: on ? '3px solid var(--ec-blue)' : '3px solid transparent',
        }}
      >
        {leaf.label}
      </button>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* ===== 최상단 북마크바 ===== */}
      <div style={{ height: 32, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #eef0f3', fontSize: 12, gap: 2 }}>
        <span style={{ color: '#8a929c', marginRight: 4 }}>🔍</span>
        <div style={{ position: 'relative' }}>
          <input
            className="ec-input"
            placeholder="메뉴검색"
            value={menuQuery}
            onChange={(e) => setMenuQuery(e.target.value)}
            onBlur={() => window.setTimeout(() => setMenuQuery(''), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter' && menuMatches[0]) gotoMenu(menuMatches[0].to) }}
            style={{ height: 22, width: 110, border: '1px solid #e2e6eb' }}
          />
          {menuMatches.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 3, zIndex: 60,
              background: '#fff', border: '1px solid #c9d1da', borderRadius: 3,
              boxShadow: '0 6px 18px rgba(0,0,0,.14)', minWidth: 260, maxHeight: 320, overflowY: 'auto', padding: 4,
            }}>
              {menuMatches.map((x, i) => (
                // onMouseDown로 input의 onBlur보다 먼저 이동을 처리한다
                <button
                  key={`${x.to}-${i}`}
                  onMouseDown={(e) => { e.preventDefault(); gotoMenu(x.to) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px',
                    background: 'none', border: 0, cursor: 'pointer', borderRadius: 3,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ec-blue-light)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                >
                  <span style={{ fontSize: 12.5, color: '#2a3242' }}>{x.label}</span>
                  <span style={{ fontSize: 10.5, color: '#9aa1ab', marginLeft: 6 }}>{x.path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="ec-btn" style={{ height: 22, marginRight: 8 }} onClick={() => { setSitemapIdx(topIdx); setSitemapOpen(true) }}>사이트맵</button>
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

      {/* ===== 메인 영역: [메뉴+탭바+사이드바+본문] + [우측 세로 앱바] ===== */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* 흰 메인메뉴 (로고 + 대메뉴 + 아바타) */}
          <div style={{ height: 52, display: 'flex', alignItems: 'center', padding: '0 8px 0 16px', borderBottom: '1px solid #e6e9ee', position: 'relative', zIndex: 30 }}
               onMouseLeave={() => setHoverIdx(null)}>
            <Link to="/" style={{ display: 'flex', alignItems: 'baseline', gap: 0, textDecoration: 'none', marginRight: 18 }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: 'var(--ec-blue)', letterSpacing: -0.5 }}>제조</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#222', letterSpacing: -0.5 }}>ERP</span>
            </Link>

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'center', height: '100%' }}>
              {MENU.map((m, idx) => {
                const active = idx === topIdx
                return (
                  <li key={m.label} onMouseEnter={() => setHoverIdx(idx)} style={{ position: 'relative', height: '100%' }}>
                    <div
                      onClick={() => { const to = firstTopRoute(m); if (to) gotoMenu(to) }}
                      style={{
                        padding: '0 14px', height: '100%', display: 'flex', alignItems: 'center', cursor: 'pointer',
                        fontSize: 14, fontWeight: active || hoverIdx === idx ? 700 : 500,
                        color: active || hoverIdx === idx ? 'var(--ec-blue)' : '#2a3242',
                        borderBottom: active ? '2px solid var(--ec-blue)' : '2px solid transparent',
                      }}
                    >
                      {m.label}
                    </div>

                    {/* 다른 대메뉴를 호버하면 그 메뉴의 탭바를 띄운다 */}
                    {hoverIdx === idx && idx !== topIdx && (
                      <div style={{ position: 'absolute', top: 52, left: 0, zIndex: 40 }}>
                        {tabBar(m, null, true)}
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

          {/* 활성 대메뉴의 탭바 */}
          {tabBar(activeTop, tabIdx, false)}

          {/* 좌측 사이드바 + 본문 */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <aside style={{ width: 180, flexShrink: 0, background: '#fff', borderRight: '1px solid #e6e9ee', padding: '8px 0', overflowY: 'auto' }}>
              {activeTab.nodes.map((node) => {
                if (!isGroup(node)) return sidebarLeaf(node, false)
                const key = `${topIdx}/${tabIdx}/${node.label}`
                const open = !collapsed[key]
                return (
                  <div key={node.label}>
                    <button
                      onClick={() => setCollapsed((c) => ({ ...c, [key]: open }))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4, width: '100%', textAlign: 'left',
                        padding: '7px 10px 5px 12px', background: 'none', border: 0, cursor: 'pointer',
                        fontSize: 12, fontWeight: 700, color: '#5b6472',
                      }}
                    >
                      <span style={{ fontSize: 9, color: '#9aa1ab' }}>{open ? '▼' : '▶'}</span>
                      {node.label}
                    </button>
                    {open && node.children.map((c) => sidebarLeaf(c, true))}
                  </div>
                )
              })}
            </aside>

            <div style={{ flex: 1, minWidth: 0, padding: 12, overflow: 'auto', background: 'var(--ec-body-bg)' }}>
              <Outlet />
            </div>
          </div>
        </div>

        {/* 우측 세로 앱바 */}
        <div style={{ width: 44, background: '#fff', borderLeft: '1px solid #e6e9ee', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, gap: 12, fontSize: 16, color: '#6b7280' }}>
          {APPS.map((a, i) => (
            <span key={i} title={a.title} onClick={() => onApp(a)} style={{ cursor: 'pointer' }}>{a.icon}</span>
          ))}
        </div>
      </div>

      {/* 앱바 안내 토스트 */}
      {appNotice && (
        <div style={{
          position: 'fixed', right: 56, bottom: 20, zIndex: 70,
          background: '#2b3444', color: '#fff', fontSize: 12.5, padding: '8px 12px',
          borderRadius: 4, boxShadow: '0 6px 18px rgba(0,0,0,.22)',
        }}>
          {appNotice}
        </div>
      )}

      {/* 사이트맵 모달: 좌측 대메뉴 레일 + 선택한 메뉴의 탭 컬럼 */}
      {sitemapOpen && (
        <div
          onClick={() => setSitemapOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 80,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflow: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 5, width: 1040, maxWidth: '96vw', boxShadow: '0 12px 34px rgba(0,0,0,.22)' }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e6eaef', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--ec-text)' }}>사이트맵 · 전체 메뉴</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setSitemapOpen(false)}>닫기</button>
            </div>

            <div style={{ display: 'flex', minHeight: 380 }}>
              {/* 좌측 대메뉴 레일 */}
              <div style={{ width: 168, flexShrink: 0, borderRight: '1px solid #e6eaef', padding: '8px 0', background: '#fafbfc' }}>
                {MENU.map((m, i) => (
                  <button
                    key={m.label}
                    onMouseEnter={() => setSitemapIdx(i)}
                    onClick={() => setSitemapIdx(i)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px',
                      background: i === sitemapIdx ? '#fff' : 'none', border: 0, cursor: 'pointer', fontSize: 13,
                      color: i === sitemapIdx ? 'var(--ec-blue)' : '#3a4453',
                      fontWeight: i === sitemapIdx ? 800 : 400,
                      borderLeft: i === sitemapIdx ? '3px solid var(--ec-blue)' : '3px solid transparent',
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* 선택한 대메뉴의 탭 → 그룹 → 리프 */}
              <div style={{
                flex: 1, padding: 16, display: 'grid', gap: 16, alignContent: 'start',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              }}>
                {MENU[sitemapIdx].tabs.map((tab) => (
                  <div key={tab.label}>
                    <div style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--ec-blue)', marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--ec-blue-light)' }}>
                      {tab.label}
                    </div>
                    {tab.nodes.map((node) =>
                      isGroup(node) ? (
                        <div key={node.label} style={{ marginBottom: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 11.5, color: '#8a929c', margin: '4px 0 2px' }}>{node.label}</div>
                          {node.children.map((c) => (
                            <button
                              key={c.label} disabled={!c.to} onClick={() => c.to && gotoMenu(c.to)}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px 3px 12px',
                                fontSize: 12, background: 'none', border: 0, borderRadius: 3,
                                cursor: c.to ? 'pointer' : 'default', color: c.to ? '#3a4453' : '#b3b8bf',
                              }}
                              onMouseEnter={(e) => { if (c.to) e.currentTarget.style.background = 'var(--ec-blue-light)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          key={node.label} disabled={!node.to} onClick={() => node.to && gotoMenu(node.to)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px',
                            fontSize: 12, background: 'none', border: 0, borderRadius: 3,
                            cursor: node.to ? 'pointer' : 'default', color: node.to ? '#3a4453' : '#b3b8bf',
                          }}
                          onMouseEnter={(e) => { if (node.to) e.currentTarget.style.background = 'var(--ec-blue-light)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                        >
                          {node.label}
                        </button>
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
