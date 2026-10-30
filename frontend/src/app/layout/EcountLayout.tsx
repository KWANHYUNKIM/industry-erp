import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { api } from '../../api/client'
import { myFolders, MY_FOLDERS_EVENT, type MyFolder } from '../../features/mypage/api'
import AppBar, { APP_ITEMS } from '../../features/appbar/AppBar'
import { Icon } from '../../features/appbar/icons'
import { openAppBarPanel } from '../../components/AppBarPanel'
import TableContextMenu from '../../components/TableContextMenu'
import { ecAlert } from '../../components/EcDialog'

/** 이카운트 v5 실제 레이아웃 재현:
 *  [최상단 북마크바]
 *  [흰 메인메뉴: 로고 + 대메뉴(Depth1) + 아바타]
 *  [탭바: 활성 대메뉴의 탭(Depth2)]
 *  [좌측 사이드바: 활성 탭의 트리(Depth3 그룹 / Depth4 리프)] + [본문] + [우측 세로 앱바]
 */
interface Leaf { label: string; to?: string }
interface Group { label: string; children: Leaf[] }
type SideNode = Leaf | Group
/** home — 2단을 누르면 처음 여는 화면(원본 실측, 없으면 첫 화면). open — 처음부터 펼쳐 두는 묶음(지금 화면이 든 묶음은 늘 펼친다). */
interface Tab { label: string; nodes: SideNode[]; home?: string; open?: string[] }
/** home — 1단을 누르면 처음 여는 화면(원본 2026-10-28 실측 '1단 기본'). 없으면 첫 2단의 처음 화면. */
interface TopMenu { label: string; tabs: Tab[]; home?: string }

const isGroup = (n: SideNode): n is Group => 'children' in n

/** 대메뉴 > 탭 > (그룹 >) 리프.
 *  2단 · 묶음 · 화면의 차례와 처음 펼친 묶음 · 처음 여는 화면은 원본 사이트맵과 좌측 메뉴 실측
 *  (plans/데이터이관/원본-메뉴-2단.md, 2026-10-28 · 10-30 loginaa)을 따랐고, 실제 페이지가 있는 메뉴만 실었다.
 *  원본에 없는 우리 화면은 다른 메뉴로 닿지 않을 때만 그 2단 맨 끝(묶음 밖)에 둔다. */
const MENU: TopMenu[] = [
  {
    label: 'MyPage',
    /* 원본 MyPage 는 업무 폴더다 — [나만의 업무 폴더] + 업종 예시 넷(제조 · 유통 · 건설 · 비영리)이 2단 메뉴이고,
       폴더를 고르면 그 안의 첫 화면이 열린다. 예시의 화면 가운데 우리에게 없는 것(매출전표 I · 출고/입고입력 ·
       (세금)계산서진행단계 · 카드매입조회 · 현장별 전표 · 수입지출명세서 …)은 싣지 않았다(대조 보드 MyPage 행). */
    tabs: [
      // 아직 폴더를 하나도 만들지 않은 사람에게 보이는 자리(원본 그대로의 안내 두 줄) — 누르면 폴더 설정으로 간다.
      // 폴더를 만들면 이 탭 대신 그 사람의 폴더들이 선다(아래 withMyFolders · 서버 /api/my-folders).
      { label: '나만의 업무 폴더를 만들수 있습니다.', nodes: [
        // 원본도 안내 문구가 아니라 메뉴명을 바꿔 둔 바로가기 둘이다(일정관리 · 익명게시판, 2026-10-13 loginaa).
        // 폴더 편집은 사용자 동그라미 → [My Page설정](원본: 개인기능설정 › My Page설정).
        { label: '사용할 메뉴를 직접 설정할 수 있습니다.', to: '/groupware/schedule' },
        { label: '메뉴명도 수정 가능합니다.', to: '/groupware/anonymous-board' },
      ] },
      { label: '예시1. 제조업', nodes: [
        { label: '기초정보', children: [
          { label: '거래처등록', to: '/sales/partners' }, { label: '창고등록', to: '/inventory/warehouses' }, { label: '품목등록', to: '/inventory/items' },
        ] },
        { label: '수발주관리 및 입출고관리', children: [
          { label: '주문서조회', to: '/sales/orders' }, { label: '발주서조회', to: '/sales/purchase-orders' },
          { label: '구매조회', to: '/sales/purchase-list' }, { label: '구매입력', to: '/sales/buy' },
          { label: '판매조회', to: '/sales/sales-list' }, { label: '판매입력', to: '/sales/sell' },
        ] },
        { label: '생산관리', children: [
          { label: 'BOM(소요량)조회', to: '/production/bom' }, { label: '작업지시서조회', to: '/production/work-orders' },
          { label: '작업지시서입력', to: '/production/work-order-entry' }, { label: '생산입고조회', to: '/production/receipt-inquiry' },
          { label: '생산입고 I', to: '/production/receipt-bom' }, { label: '생산입고 II', to: '/production/receipt-manual' },
        ] },
      ] },
      { label: '예시2. 유통업', nodes: [
        { label: '기초정보', children: [
          { label: '거래처등록', to: '/sales/partners' }, { label: '창고등록', to: '/inventory/warehouses' }, { label: '품목등록', to: '/inventory/items' },
        ] },
        { label: '재고관리', children: [
          { label: '재고현황', to: '/inventory/current' }, { label: '창고별재고현황', to: '/inventory/warehouse-stock' }, { label: '재고수불부', to: '/inventory/ledger' },
        ] },
        { label: '매입/매출관리', children: [{ label: '매입/매출장', to: '/accounting/vat-book' }] },
        { label: '거래처잔액관리', children: [
          { label: '거래처별채권', to: '/sales/ledger-receivable' }, { label: '거래처별채무', to: '/sales/ledger-payable' },
        ] },
        { label: '수금,지급처리', children: [
          { label: '지출결의서', to: '/accounting/vouchers' }, { label: '입금보고서', to: '/accounting/vouchers?type=DEPOSIT_REPORT' },
        ] },
      ] },
      { label: '예시3. 건설업', nodes: [
        { label: '기초정보', children: [
          { label: '거래처등록', to: '/sales/partners' }, { label: '카드등록', to: '/accounting/bank-cards' }, { label: '프로젝트등록', to: '/inventory/projects' },
        ] },
        { label: '각종 장부', children: [
          { label: '자금일보', to: '/accounting/fund-daily' }, { label: '현금출납장', to: '/accounting/cash-book' },
          { label: '계정별원장', to: '/accounting/ledger-book' }, { label: '매입/매출장', to: '/accounting/vat-book' },
          { label: '거래처관리대장 I', to: '/sales/ledger' },
        ] },
      ] },
      { label: '예시4. 비영리', nodes: [
        { label: '기초데이터', children: [
          { label: '계정등록', to: '/accounting/accounts' }, { label: '카드등록', to: '/accounting/bank-cards' }, { label: '거래처등록', to: '/sales/partners' },
        ] },
        { label: '업무', children: [
          { label: '지출결의서', to: '/accounting/vouchers' }, { label: '입금보고서', to: '/accounting/vouchers?type=DEPOSIT_REPORT' },
          { label: '기안서작성', to: '/groupware/approval/draft' }, { label: '내결재관리', to: '/groupware/approval/my' },
          { label: '기안서통합관리', to: '/groupware/approval/all' },
        ] },
        { label: '확인&보고서', children: [{ label: '회계거래현황', to: '/accounting/journal-status' }] },
      ] },
    ],
  },
  {
    label: 'Self-Customizing',
    home: '/settings/preferences',
    tabs: [
      { label: '정보관리', nodes: [{ label: '회사정보관리', to: '/settings/company' }] },
      { label: '사용자관리', nodes: [{ label: '사용자등록', to: '/users' }, { label: '역할·권한관리', to: '/roles' }, { label: '회사관리', to: '/companies' }] },
      { label: '환경설정', nodes: [{ label: '기능설정', to: '/settings/preferences' }, { label: '기본값설정', to: '/settings/defaults' }] },
      { label: '기타관리시스템', nodes: [{ label: '기타관리시스템', to: '/settings/etc' }, { label: '공통코드', to: '/settings/codes' }, { label: '사용자정의필드', to: '/settings/custom-fields' }, { label: '디자인 시스템', to: '/settings/design-system' }] },
      { label: '보안관리', nodes: [{ label: '보안설정', to: '/settings/security' }] },
      { label: '다운로드', nodes: [{ label: '엑셀자료올리기기능', to: '/settings/download' }] },
    ],
  },
  {
    label: '재고 I',
    home: '/sales/sales-list',
    tabs: [
      {
        label: '기초등록',
        home: '/inventory/items',
        nodes: [
          { label: '거래처등록', to: '/sales/partners' },
          { label: '창고등록', to: '/inventory/warehouses' },
          { label: '부서등록', to: '/groupware/org' },
          { label: '프로젝트등록', to: '/inventory/projects' },
          { label: '품목등록', to: '/inventory/items' },
          { label: '관리항목등록', to: '/inventory/manage-items' },
                    /* 원본 단가관리 차례(2026-10-30 사이트맵): 단가적용순서설정 · 특별단가등록 · 거래처특별단가그룹등록 · 품목별단가 */
          { label: '단가관리', children: [{ label: '단가적용순서설정', to: '/inventory/price-order' }, { label: '특별단가등록', to: '/sales/special-price' }, { label: '거래처특별단가그룹등록', to: '/inventory/special-price-group' }, { label: '품목별단가', to: '/inventory/item-prices' }] },
          /* 원본 사이트맵 차례: … 단가관리 · 사원(담당)등록 E010110 · 인쇄용결재라인등록(재고) E040111 · 외화등록 · 각종코드변경(E040113 — 우리에게 없음) */
          { label: '사원(담당)등록', to: '/inventory/sales-reps' },
          { label: '인쇄용결재라인등록(재고)', to: '/inventory/print-sign' },
          { label: '외화등록', to: '/settings/currencies' },
        ],
      },
      {
        // 원본 영업관리는 평평한 목록이 아니라 전표 단위 묶음이다
        // (견적서·주문서·판매·판매일괄회계반영·출하지시서·출하). 현황류는 여기가 아니라 출력물 탭에 있다.
        // 우리 화면 하나가 원본의 조회·입력을 겸하는 경우가 많아, 없는 이름은 만들지 않고 있는 것만 건다.
        label: '영업관리',
        home: '/sales/sales-list',
        /* 원본 영업관리 좌측 메뉴(2026-10-28 · 10-30 loginaa 사이트맵): 견적서 · 주문서 · 판매 · 출하지시서 · 출하 · 판매일괄회계반영 ·
           영업관리현황 일곱 묶음. 처음 펼친 묶음은 판매(판매조회가 든 묶음)뿐이다. 현황류는 출력물 탭에도 그대로 둔다(원본도 두 곳에 있다). */
        nodes: [
          { label: '견적서', children: [{ label: '견적서조회', to: '/sales/quotations' }, { label: '견적서입력', to: '/sales/quotation-entry' }, { label: '견적서현황', to: '/sales/quotations?view=status' }, { label: '미주문현황', to: '/sales/unordered' }] },
          { label: '주문서', children: [{ label: '주문서조회', to: '/sales/orders' }, { label: '주문서입력', to: '/sales/order-entry' }, { label: '주문서현황', to: '/sales/order-status' }, { label: '주문서출고처리', to: '/sales/order-release' }, { label: '미판매현황', to: '/sales/unsold' }] },
          {
            label: '판매',
            children: [
              { label: '판매조회', to: '/sales/sales-list' },
              { label: '판매입력', to: '/sales/sell' },
              { label: '판매입력 II', to: '/sales/sell2' },
              { label: '판매단가일괄변경', to: '/sales/sales-price-bulk' },
              { label: '판매현황', to: '/sales/sales-status' },
              { label: '결제내역조회', to: '/sales/payment-history' },
              { label: '결제내역자료비교', to: '/sales/payment-compare' },
            ],
          },
          { label: '출하지시서', children: [{ label: '출하지시서조회', to: '/sales/shipment-order' }, { label: '출하지시서입력', to: '/sales/shipment-order-entry' }, { label: '출하지시서현황', to: '/sales/shipment-order-status' }] },
          {
            label: '출하',
            children: [
              { label: '출하조회', to: '/sales/shipment-inquiry' },
              { label: '출하입력', to: '/sales/shipment-entry' },
              { label: '출하현황', to: '/sales/shipment' },
            ],
          },
          { label: '판매일괄회계반영', children: [{ label: '판매일괄회계반영', to: '/sales/accounting-reflection?view=batch' }, { label: '매출(세금)계산서조회(재고)', to: '/sales/sales-tax-list' }] },
          {
            label: '영업관리현황',
            children: [
              { label: '거래명세서인쇄', to: '/sales/statement' },
              { label: '미출하현황', to: '/sales/unshipped' },
              { label: '거래처별채권', to: '/sales/ledger-receivable' },
              { label: '수금현황', to: '/sales/collection' },
              { label: '판매할인현황', to: '/sales/sales-discount' },
              { label: '회계미반영현황 (판매)', to: '/sales/accounting-reflection?kind=sales&view=unposted' },
              { label: '매출(세금)계산서현황(재고)', to: '/sales/sales-tax-status' },
            ],
          },
        ],
      },
      {
        // 원본 구매관리도 묶음이다(발주요청·발주계획·단가요청·발주서·구매·구매일괄회계반영).
        label: '구매관리',
        home: '/sales/purchase-list',
        /* 처음 펼친 묶음은 구매(구매조회가 든 묶음)뿐이다(2026-10-28 실측). */
        nodes: [
          { label: '발주요청', children: [{ label: '발주요청조회', to: '/sales/purchase-requests' }, { label: '발주요청입력', to: '/sales/purchase-request-input' }, { label: '발주요청현황', to: '/sales/purchase-request-status' }] },
          { label: '발주계획', children: [{ label: '발주계획조회', to: '/sales/purchase-plans' }, { label: '발주계획입력', to: '/sales/purchase-plan-input' }, { label: '발주계획현황', to: '/sales/purchase-plan-status' }] },
          {
            label: '단가요청',
            children: [
              /* 원본 단가요청 묶음 차례(2026-10-21 실측): 단가요청입력 · 단가요청조회 · 단가요청진행단계 · 단가요청현황. */
              { label: '단가요청입력', to: '/sales/price-request-input' },
              { label: '단가요청조회', to: '/sales/price-requests' },
              { label: '단가요청진행단계', to: '/sales/price-request-progress' },
              { label: '단가요청현황', to: '/sales/price-request-status' },
            ],
          },
          {
            label: '발주서',
            children: [
              { label: '발주서조회', to: '/sales/purchase-orders' },
              { label: '발주서입력', to: '/sales/purchase-order-input' },
              { label: '발주서현황', to: '/sales/purchase-order-status' },
              /* 원본 발주서 묶음 넷째(2026-10-20 실측: 발주서조회 · 발주서입력 · 발주서현황 · 미구매현황). 출력물에도 있다. */
              { label: '미구매현황', to: '/sales/unpurchased' },
            ],
          },
          {
            label: '구매',
            children: [
              { label: '구매조회', to: '/sales/purchase-list' },
              { label: '구매입력', to: '/sales/buy' },
              { label: '구매현황', to: '/sales/purchase-status' },
              { label: '구매단가일괄변경', to: '/sales/purchase-price-bulk' },
            ],
          },
          // 원본 구매일괄회계반영 › 구매일괄회계반영 · 매입(세금)계산서조회(재고)(2026-10-13 실측)
          { label: '구매일괄회계반영', children: [{ label: '구매일괄회계반영', to: '/sales/accounting-reflection?kind=purchase&view=batch' }, { label: '매입(세금)계산서조회(재고)', to: '/production/purchase-tax-list' }] },
          // 원본 구매관리현황 묶음(2026-10-30 사이트맵) — 출력물 › 구매관리현황에도 같은 화면이 또 있다.
          {
            label: '구매관리현황',
            children: [
              { label: '거래처별채무', to: '/sales/ledger-payable' },
              { label: '지급현황', to: '/sales/payment' },
              { label: '구매할인현황', to: '/sales/purchase-discount' },
              { label: '회계미반영현황 (구매)', to: '/sales/accounting-reflection?kind=purchase&view=unposted' },
              { label: '매입(세금)계산서현황(재고)', to: '/production/purchase-tax-status' },
            ],
          },
        ],
      },
      {
        label: '생산/외주',
        home: '/production/receipt-inquiry',
        /* 원본 생산/외주 좌측 메뉴(2026-10-30 loginaa 실측): 아홉 묶음 나무. 생산계획/MRP생성만 묶음 없는 화면.
           처음 펼친 묶음은 생산입고 · 생산/외주현황(지금 화면이 든 묶음은 늘 펼친다). */
        open: ['생산입고', '생산/외주현황'],
        nodes: [
          { label: 'BOM(소요량)', children: [{ label: 'BOM(소요량)조회', to: '/production/bom' }, { label: 'BOM(소요량)현황', to: '/production/bom-status' }, { label: '소요량계산', to: '/production/requirement-calc' }] },
          { label: '공정', children: [{ label: '공정등록', to: '/production/process' }, { label: '자원등록', to: '/production/resource' }, { label: 'BOR(작업소요시간)', to: '/production/bor' }, { label: '소요시간계산', to: '/production/time-calc' }] },
          { label: '생산계획/MRP생성', to: '/production/mrp' },
          {
            label: '작업지시서',
            children: [
              { label: '작업지시서조회', to: '/production/work-orders' },
              { label: '작업지시서입력', to: '/production/work-order-entry' },
              { label: '작업지시서현황', to: '/production/wo-status' },
              { label: '작업지시서작업처리', to: '/production/wo-work' },
              { label: '작업지시서별진행현황', to: '/production/wo-progress' },
              { label: '작업지시서효율현황', to: '/production/wo-efficiency' },
            ],
          },
          { label: '생산불출', children: [{ label: '생산불출조회', to: '/production/issue' }, { label: '생산불출입력', to: '/production/issue-entry' }, { label: '생산불출현황', to: '/production/issue-status' }] },
          { label: '작업', children: [{ label: '작업내역입력', to: '/production/work-result' }, { label: '작업내역조회', to: '/production/work-result-list' }, { label: '작업내역현황', to: '/production/work-result-status' }] },
          {
            label: '생산입고',
            children: [
              { label: '생산입고조회', to: '/production/receipt-inquiry' },
              { label: '생산입고 I', to: '/production/receipt-bom' },
              { label: '생산입고 II', to: '/production/receipt-manual' },
              { label: '생산입고 III', to: '/production/receipt-qr' },
              { label: '생산입고현황', to: '/production/receipt-status' },
            ],
          },
          /* 외주는 남에게 맡겨 만드는 것이라 사고 나서 돈을 주는 흐름이 따라붙는다 — 원본처럼 채무 · 지급도 이 탭에 둔다.
             [외주비일괄회계반영]은 생산입고 I·II 의 외주비합계·부가세를 외주처별 매입전표로 넘긴다(2026-10-02). */
          { label: '외주비회계반영', children: [{ label: '외주비일괄회계반영', to: '/production/subcontract-reflection' }, { label: '매입(세금)계산서조회(재고)', to: '/production/purchase-tax-list' }] },
          {
            label: '생산/외주현황',
            children: [
              { label: '생산입고/소모현황 I', to: '/production/receipt-issue-status' },
              { label: '거래처별채무', to: '/sales/ledger-payable' },
              { label: '지급현황', to: '/sales/payment' },
              { label: '외주비할인현황', to: '/sales/outsourcing-discount' },
              { label: '매입(세금)계산서현황(재고)', to: '/production/purchase-tax-status' },
            ],
          },
        ],
      },
      /* 원본 기타이동 탭(2026-10-20 loginaa 실측): 창고이동 · 자가사용 · 불량처리 · 재고조정 · 기타이동현황 다섯 묶음.
         창고이동조회는 기타이동 화면(창고이동 탭)이, 창고이동입력은 따로 있는 입력 화면이 맡는다(원본 — 수정만 창 '창고이동수정'). */
      { label: '기타이동', home: '/inventory/transfer', open: ['기타이동현황'], nodes: [
        { label: '창고이동', children: [{ label: '창고이동조회', to: '/inventory/transfer' }, { label: '창고이동입력', to: '/inventory/transfer-entry' }, { label: '창고이동현황', to: '/inventory/transfer-status' }] },
        /* 원본 기타이동 탭의 [자가사용] 묶음 — 조회 · 입력 · 현황(2026-10-12 실측). 입력은 예전엔 기타이동 화면의 탭 속 창뿐이었다. */
        { label: '자가사용', children: [{ label: '자가사용조회', to: '/inventory/self-use' }, { label: '자가사용입력', to: '/inventory/self-use-input' }, { label: '자가사용현황', to: '/inventory/self-use-status' }] },
        { label: '불량처리', children: [{ label: '불량처리조회', to: '/inventory/defect' }, { label: '불량처리입력', to: '/inventory/defect-input' }, { label: '불량처리현황', to: '/inventory/defect-status' }] },
        /* 원본 [재고조정] 묶음 차례. 단계별재고실사 · 단계별재고조정은 원본처럼 재고조정진행단계의 버튼으로 연다. */
        { label: '재고조정', children: [{ label: '재고조정진행단계', to: '/inventory/staged-progress' }, { label: '재고실사조회', to: '/inventory/stocktake-list' }, { label: '재고조정조회', to: '/inventory/adjust-list' }, { label: '재고실사현황', to: '/inventory/stocktake-status' }, { label: '재고조정현황', to: '/inventory/adjust-status' }] },
        { label: '기타이동현황', children: [{ label: '대체사용현황', to: '/inventory/substitute-status' }, { label: '폐기현황', to: '/inventory/disposal-status' }, { label: '불량률파악보고서', to: '/quality/defect-report' }] }] },
      /* 원본 쇼핑몰관리 탭 = [기초등록] 쇼핑몰등록 · 쇼핑몰품목코드연결 + [주문관리] 일곱 화면(2026-10-20 실측). */
      { label: '쇼핑몰관리', open: ['주문관리'], nodes: [
        { label: '기초등록', children: [{ label: '쇼핑몰등록', to: '/sales/mall-accounts' }, { label: '쇼핑몰품목코드연결', to: '/sales/mall-item-mappings' }] },
        { label: '주문관리', children: [{ label: '주문관리진행단계', to: '/sales/mall' }, { label: '주문확인처리', to: '/sales/mall/confirm' }, { label: '배송처리', to: '/sales/mall/ship' }, { label: '취소처리', to: '/sales/mall/cancel' }, { label: '반품처리', to: '/sales/mall/return' }, { label: '교환처리', to: '/sales/mall/exchange' }, { label: 'ERP전송', to: '/sales/mall/erp-send' }] }] },
      {
        // 원본 출력물 탭은 커뮤니케이션센터·증빙센터 + 재고현황·영업관리현황·구매관리현황 묶음이다.
        // 우리가 영업관리·구매관리·재고관리에 흩어 두었던 '현황' 화면들이 원본에서는 전부 여기 모인다.
        label: '출력물',
        nodes: [
          { label: '커뮤니케이션센터', to: '/groupware/messages' },
          { label: '증빙센터', to: '/accounting/evidence-center' },
          {
            label: '재고현황',
            children: [
              { label: '재고현황', to: '/inventory/current' },
              { label: '창고별재고현황', to: '/inventory/warehouse-stock' },
              /* 원본 차례(2026-10-22 실측): 창고별 다음 관계별(E040728) · 다규격별(E040720). [입출고] 는 원본 재고현황 묶음에 없다. */
              { label: '관계별재고현황', to: '/inventory/relation-stock' },
              { label: '다규격별재고현황', to: '/inventory/multi-spec-stock' },
              { label: 'BOM환산재고현황', to: '/inventory/bom-stock' },
              { label: '재고잔량분석표', to: '/inventory/stock-analysis' },
              { label: '재고수불부', to: '/inventory/ledger' },
              { label: '재고변동표', to: '/inventory/movement' },
              { label: '일보', to: '/inventory/daily-report' },
            ],
          },
          {
            label: '영업관리현황',
            children: [
              { label: '판매현황', to: '/sales/sales-status' },
              { label: '견적서현황', to: '/sales/quotations?view=status' },
              { label: '주문서현황', to: '/sales/order-status' },
              { label: '출하지시서현황', to: '/sales/shipment-order-status' },
              { label: '출하현황', to: '/sales/shipment' },
              { label: '거래명세서인쇄', to: '/sales/statement' },
              { label: '미주문현황', to: '/sales/unordered' },
              { label: '미판매현황', to: '/sales/unsold' },
              { label: '미출하현황', to: '/sales/unshipped' },
              { label: '거래처별채권', to: '/sales/ledger-receivable' },
              { label: '채권현황', to: '/sales/receivable-status' },
              { label: '거래처관리대장1(채권)', to: '/sales/partner-ledger-receivable' },
              { label: '수금현황', to: '/sales/collection' },
              { label: '판매할인현황', to: '/sales/sales-discount' },
              { label: '회계미반영현황 (판매)', to: '/sales/accounting-reflection?kind=sales&view=unposted' },
              /* 원본 출력물 › 영업관리현황 차례(2026-10-20 실측): 매출(세금)계산서 둘은 회계미반영현황 뒤, 월별채권증감내역 앞 */
              { label: '매출(세금)계산서조회(재고)', to: '/sales/sales-tax-list' },
              { label: '매출(세금)계산서현황(재고)', to: '/sales/sales-tax-status' },
              { label: '월별채권증감내역', to: '/sales/monthly-ar-ap' },
            ],
          },
          {
            label: '구매관리현황',
            children: [
              { label: '구매현황', to: '/sales/purchase-status' },
              { label: '발주요청현황', to: '/sales/purchase-request-status' },
              { label: '발주계획현황', to: '/sales/purchase-plan-status' },
              { label: '발주서현황', to: '/sales/purchase-order-status' },
              { label: '미구매현황', to: '/sales/unpurchased' },
              { label: '거래처별채무', to: '/sales/ledger-payable' },
              { label: '채무현황', to: '/sales/payable-status' },
              { label: '거래처관리대장1(채무)', to: '/sales/partner-ledger-payable' },
              { label: '지급현황', to: '/sales/payment' },
              { label: '구매할인현황', to: '/sales/purchase-discount' },
              { label: '회계미반영현황 (구매)', to: '/sales/accounting-reflection?kind=purchase&view=unposted' },
              // 원본 출력물 › 구매관리현황 14개(2026-10-20 재고1h 실측) — 미지급현황 · 외주비할인현황은 여기 없고 세금계산서 둘이 있다.
              { label: '매입(세금)계산서조회(재고)', to: '/production/purchase-tax-list' },
              { label: '매입(세금)계산서현황(재고)', to: '/production/purchase-tax-status' },
              { label: '월별채무증감내역', to: '/sales/monthly-ap' },
            ],
          },
          {
            // 원본 출력물은 재고현황·영업관리현황·구매관리현황 다음에 이 둘을 둔다.
            // 화면은 있었는데 출력물 아래에 묶여 있지 않아 원본 순서를 따라 넣는다.
            label: '생산/외주현황',
            children: [
              { label: '작업지시서현황', to: '/production/wo-status' },
              { label: '작업지시서별진행현황', to: '/production/wo-progress' },
              { label: '생산불출현황', to: '/production/issue-status' },
              { label: '작업지시서효율현황', to: '/production/wo-efficiency' },
              { label: '작업내역현황', to: '/production/work-result-status' },
              { label: '생산입고현황', to: '/production/receipt-status' },
              { label: '생산입고/소모현황 I', to: '/production/receipt-issue-status' },
            ],
          },
          {
            label: '기타이동현황',
            children: [
              /* 원본 출력물 › 기타이동현황(2026-10-20 실측) 여덟 — 조회 화면들은 기타이동 탭에만 있다 */
              { label: '창고이동현황', to: '/inventory/transfer-status' },
              { label: '자가사용현황', to: '/inventory/self-use-status' },
              { label: '불량처리현황', to: '/inventory/defect-status' },
              { label: '대체사용현황', to: '/inventory/substitute-status' },
              { label: '폐기현황', to: '/inventory/disposal-status' },
              { label: '불량률파악보고서', to: '/quality/defect-report' },
              { label: '재고실사현황', to: '/inventory/stocktake-status' },
              { label: '재고조정현황', to: '/inventory/adjust-status' },
            ],
          },
          {
            label: '기타',
            children: [
              /* 원본 출력물 › 기타(2026-10-20 실측) 차례. 거래처관리대장 I · II 는 원본 메뉴 링크가 회계 I 장부와
                 같은 화면(E010833 · E010842)을 가리킨다 — 그래서 회계1 의 /accounting/partner-book-1 · 2 로 잇는다. */
              { label: '일별재고현황', to: '/inventory/daily-stock' },
              { label: '일별이익현황', to: '/accounting/daily-profit' },
              { label: '채권/채무현황', to: '/sales/ar-ap-status' },
              { label: '거래처관리대장 I', to: '/accounting/partner-book-1' },
              { label: '거래처관리대장 II', to: '/accounting/partner-book-2' },
              { label: '판매구매집계표', to: '/sales/sales-purchase-summary' },
              { label: '집계표', to: '/sales/pivot-summary' },
              { label: '단가변동표', to: '/sales/price-movement' },
              { label: '경영자보고서', to: '/inventory/executive-report' },
              { label: '거래처중심입력', to: '/sales/partner-entry' },
              { label: '품목중심입력', to: '/sales/item-entry' },
              { label: '현황누계표', to: '/sales/monthly-cumulative' },
              { label: '거래이력조회(재고)', to: '/sales/trade-history' },
              { label: '잔량재집계', to: '/inventory/recalc' },
            ],
          },
        ],
      },
    ],
  },
  {
    label: '재고 II',
    home: '/accounting/daily-profit',
    tabs: [
      {
        /* 원본 사이트맵(2026-10-13): A/S접수(입력 · 조회 · 현황) · A/S수리(입력 · 조회 · 현황 · 소모현황) 두 묶음. */
        label: 'A/S관리',
        home: '/quality/as', open: ['A/S수리'],
        nodes: [
          { label: 'A/S접수', children: [{ label: 'A/S접수입력', to: '/quality/as-entry' }, { label: 'A/S접수조회', to: '/quality/as' }, { label: 'A/S접수현황', to: '/quality/as-status' }] },
          { label: 'A/S수리', children: [{ label: 'A/S수리입력', to: '/quality/as-repair-entry' }, { label: 'A/S수리조회', to: '/quality/as-repair-list' }, { label: 'A/S수리현황', to: '/quality/as-repair-status' }, { label: 'A/S소모현황', to: '/quality/as-consumption' }] },
        ],
      },
      {
        /* 원본 시리얼/로트No. 탭(2026-10-28 실측 · plans/재고2.md 사이트맵): 두 묶음, 둘 다 펼쳐 둔다. 처음 화면은 내역조회. */
        label: '시리얼/로트No.',
        home: '/quality/lot-tx-list', open: ['시리얼/로트No. 재고조정'],
        nodes: [
          { label: '시리얼/로트No.등록', children: [{ label: '시리얼/로트No.등록', to: '/quality/serial-lot' }, { label: '시리얼/로트No.내역조회', to: '/quality/lot-tx-list' }, { label: '시리얼/로트No.내역현황', to: '/quality/lot-tx-status' }] },
          { label: '시리얼/로트No. 재고조정', children: [{ label: '시리얼/로트No.재고조정', to: '/quality/lot-adjust' }, { label: '시리얼/로트No.재고수불부', to: '/quality/lot-ledger' }, { label: '시리얼/로트No.재고현황', to: '/quality/lot-stock' }, { label: '품목vs시리얼재고수량비교', to: '/quality/lot-compare' }] },
        ],
      },
      {
        /*
         * 원본 사이트맵(2026-10-14): 품질검사요청(입력 · 조회 · 현황 · 미검사현황) · 품질검사(유형등록 · 입력 · 조회 · 현황) 두 묶음.
         * 불량률파악보고서는 원본 재고 I › 기타이동현황 에 있다(우리도 거기 있다) — 여기서는 뺐다(라우트는 그대로).
         */
        label: '품질관리',
        home: '/quality/inspection-request', open: ['품질검사'],
        nodes: [
          { label: '품질검사요청', children: [{ label: '품질검사요청입력', to: '/quality/inspection-request-entry' }, { label: '품질검사요청조회', to: '/quality/inspection-request' }, { label: '품질검사요청현황', to: '/quality/request-status' }, { label: '미검사현황', to: '/quality/uninspected' }] },
          { label: '품질검사', children: [{ label: '품질검사유형등록', to: '/quality/inspection-type' }, { label: '품질검사입력', to: '/quality/inspection-entry' }, { label: '품질검사조회', to: '/quality/inspection' }, { label: '품질검사현황', to: '/quality/inspection-status' }] },
        ],
      },
      {
        label: '계획관리',
        home: '/sales/sales-plan-list', open: ['프로젝트계획'],
        nodes: [
          /* 원본 매출계획 > [매출계획입력](E040624) — 따로 된 입력 화면(2026-10-14). 폼은 조회 창과 같은 features/salesplan. */
          /* 원본 매출계획 > [매출계획조회](E040625) · 입력(E040624) — 여러 줄 전표(2026-10-04). */
          /* 원본 매출계획 > [매출계획현황](E040640) — 계획 줄 목록 + 달마다 계(2026-10-04). 예전 [매출계획 / 비교표] 한 화면 대신. */
          /* 원본 매출계획 > [매출계획비교표](E040626) — 기간 안 계획과 판매 전부를 표시조건으로 견주는 출력물(2026-10-04). */
          /* 원본 프로젝트계획 > [프로젝트계획조회](E040636) · [프로젝트계획/실적현황](E040637) — 2026-10-13. */
          { label: '매출계획', children: [{ label: '매출계획입력', to: '/sales/sales-plan-entry' }, { label: '매출계획조회', to: '/sales/sales-plan-list' }, { label: '매출계획현황', to: '/sales/sales-plan-status' }, { label: '매출계획비교표', to: '/sales/sales-plan-compare' }] },
          { label: '프로젝트계획', children: [{ label: '프로젝트계획조회', to: '/accounting/project-plan' }, { label: '프로젝트계획/실적현황', to: '/accounting/project-plan-status' }] },
          /* 원본 계획관리는 위 두 묶음뿐이다(2026-10-28 실측). 생산계획/MRP생성은 원본처럼 재고 I › 생산/외주에만 둔다.
             생산계획(MPS)은 원본 메뉴에 없는 우리 화면이라 끝에 둔다. */
          { label: '생산계획(MPS)', to: '/production/planning' },
        ],
      },
      {
        label: '이익관리',
        home: '/accounting/daily-profit', open: ['월별이익'],
        /* 원본 이익관리(2026-10-28 실측): 월별이익 · 일별이익 두 묶음, 둘 다 펼친다. 처음 화면은 일별이익현황. */
        nodes: [
          {
            label: '월별이익',
            children: [
              { label: '원가생성/수정', to: '/accounting/cost-build' },
              { label: '표준원가현황', to: '/accounting/standard-cost' },
              { label: '실제원가현황', to: '/accounting/actual-cost' },
              { label: '차이분석', to: '/accounting/variance' },
              { label: '월별이익현황', to: '/accounting/monthly-profit' },
            ],
          },
          {
            // 원본은 일별재고현황을 여기(이익관리 > 일별이익)에 둔다 — 재고 평가와 이익 계산이
            // 같은 원가 기준을 쓰기 때문이다. 출력물 > 기타에도 그대로 남겨 둔다.
            label: '일별이익',
            children: [
              { label: '일별재고현황', to: '/inventory/daily-stock' },
              { label: '일별이익현황', to: '/accounting/daily-profit' },
            ],
          },
          /* 원본 이익관리에 없는 우리 화면 — 손익요약 · 품목별원가/이익(예전 이 탭 맨 앞), 프로젝트별 손익(예전 회계 II › 프로젝트). 원본 자리를 찾으면 옮긴다. */
          { label: '손익요약', to: '/accounting/profit' },
          { label: '품목별원가/이익', to: '/accounting/item-cost' },
          { label: '프로젝트별 손익', to: '/accounting/project-profit' },
        ],
      },
      {
        label: '오더관리',
        home: '/sales/order-stages',
        nodes: [
          /* 원본 오더관리 탭은 이 둘뿐이다(2026-10-28 실측). 표기는 [오더관리유형등록](사본 좌측 메뉴 실측). */
          { label: '오더관리유형등록', to: '/sales/order-types' },
          { label: '오더관리진행단계', to: '/sales/order-stages' },
        ],
      },
      { label: '수출관리', nodes: [{ label: 'Invoice / Packing List', to: '/sales/export' }, { label: 'Invoice/Packing List Status', to: '/sales/export-status' }] },
      {
        // 원본 WMS 탭(2026-10-20 실측) — 창고관리는 우리 로케이션 화면, 나머지는 연동 화면 틀
        label: 'WMS',
        home: '/inventory/wms',
        nodes: [
          { label: 'WMS계정선택', to: '/inventory/wms/account' },
          { label: '창고관리', to: '/inventory/wms' },
          {
            label: '입고관리',
            children: [
              { label: '입고예정', to: '/inventory/wms/inbound-plan' },
              { label: '입고예정현황', to: '/inventory/wms/inbound-status' },
              { label: '입고처리', to: '/inventory/wms/inbound-process' },
              { label: 'ERP전표생성(입고)', to: '/inventory/wms/inbound-slip' },
            ],
          },
          {
            label: '출고관리',
            children: [
              { label: '출고예정', to: '/inventory/wms/outbound-plan' },
              { label: '출고예정현황', to: '/inventory/wms/outbound-status' },
              { label: '출고처리', to: '/inventory/wms/outbound-process' },
              { label: 'ERP전표생성(출고)', to: '/inventory/wms/outbound-slip' },
            ],
          },
          { label: 'WMS재고조정', to: '/inventory/wms/adjust' },
          { label: 'WMS재고현황', to: '/inventory/wms/stock-status' },
          { label: '재고이력관리', to: '/inventory/wms/history' },
        ],
      },
    ],
  },
  {
    label: '회계 I',
    tabs: [
      {
        label: '기초등록',
        nodes: [
          { label: '거래처등록', to: '/sales/partners' },
          /* 원본 사이트맵 E010103 카드등록(카드리스트). 계좌입출금 · 카드사용은 아래 [계좌/카드] 화면에 남아 있다. */
          { label: '카드등록', to: '/accounting/cards' },
          /* 원본 E010104 계좌등록(계좌리스트) */
          { label: '계좌등록', to: '/accounting/bank-accounts' },
          /* 원본 E010106 — 알약 회계 · 재고 · 관리 중 [회계] 가 켜진 채로 연다 */
          { label: '인쇄용결재라인등록(회계)', to: '/accounting/print-sign' },
          { label: '계좌/카드', to: '/accounting/bank-cards' },
          { label: '카드사등록', to: '/accounting/card-issuers' },
          { label: '결제대행사등록', to: '/accounting/payment-agencies' },
          /* 원본 사이트맵 차례: … 결제대행사등록 · 추가항목유형등록 · 사원(담당)등록 · 계정등록(E010107) · 각종코드변경 · 외화등록 */
          { label: '추가항목유형등록', to: '/accounting/extra-field-types' },
          { label: '사원(담당)등록', to: '/inventory/sales-reps' },
          { label: '계정등록', to: '/accounting/accounts' },
          { label: '각종코드변경', to: '/accounting/code-change' },
          { label: '외화등록', to: '/settings/currencies' },
        ],
      },
      {
        /* 원본 회계 I › FastEntry(2026-10-14 loginaa) — 일반전표 · 지출결의서 · 입금보고서 · 가지급금정산서 · 자동생성전표조회 · 잔액조정입력(넷).
           예전에 여기 섞여 있던 현금예금입금 · 현금예금출금 · 계좌간이동·카드대금결제는 현금거래로, 비현금거래(대체전표)는 비현금거래로 옮겼다. */
        label: 'FastEntry',
        open: ['잔액조정입력'],
        nodes: [
          { label: '일반전표', to: '/accounting/journal-entry' },
          { label: '지출결의서', to: '/accounting/vouchers' },
          { label: '입금보고서', to: '/accounting/vouchers?type=DEPOSIT_REPORT' },
          { label: '가지급금정산서', to: '/accounting/vouchers?type=ADVANCE_SETTLEMENT' },
          { label: '자동생성전표조회', to: '/accounting/auto-journals' },
          { label: '잔액조정입력', children: [
            { label: '잔액조정입력', to: '/accounting/balance-adjust' }, { label: '잔액실사조회', to: '/accounting/balance-audits' },
            { label: '잔액조정조회', to: '/accounting/balance-adjustments' }, { label: '잔액조정현황', to: '/accounting/balance-adjust-status' },
          ] },
        ],
      },
      {
        /* 원본 회계 I › 매출/매입거래(2026-10-13 loginaa) — 매출전표 I · 매입전표 I. */
        label: '매출매입거래',
        nodes: [
          { label: '매출전표 I', to: '/accounting/sales-slip' },
          { label: '매입전표 I', to: '/accounting/purchase-slip' },
        ],
      },
      {
        label: '전자(세금)계산서',
        nodes: [
          // 원본 회계 I › 전자(세금)계산서 차례(2026-10-14 실측). 각종구분값변경 · 홈택스 자료비교 · 요약은 세무 › 신고전검토자료와 같은 화면.
          // 홈택스자료조회 · 전자(세금)계산서 · 현금영수증은 아직 없다(plans/회계1.md 남은 것). 매입세금계산서는 원본에 없는 우리 화면.
          { label: '(세금)계산서진행단계', to: '/accounting/tax-invoice-sales' },
          { label: '각종구분값변경', to: '/accounting/vat/marks' },
          { label: '이카운트 vs 홈택스 자료비교', to: '/accounting/vat/hometax-compare' },
          { label: '매출(세금)계산서요약', to: '/accounting/vat/sales-tax-summary' },
          { label: '매입세금계산서', to: '/accounting/tax-invoice-purchase' },
        ],
      },
      {
        /* 원본 회계 I › 계좌/카드(2026-10-14 loginaa) — 은행 · 카드사 · 결제대행사에서 긁어 온 줄을 보고 전표로 만드는 네 화면. */
        label: '계좌/카드',
        nodes: [
          { label: '입/출금계좌 조회', to: '/accounting/bank-txns' },
          { label: '카드매입조회', to: '/accounting/card-purchases' },
          { label: '카드매출조회', to: '/accounting/card-sales' },
          { label: '결제대행사매출조회', to: '/accounting/pg-sales' },
        ],
      },
      {
        /* 원본 회계 I › 현금거래(2026-10-12 loginaa) — 현금예금입금 · 현금예금출금 두 묶음. */
        label: '현금거래',
        home: '/accounting/receipt-payment', open: ['현금예금입금'],
        nodes: [
          { label: '현금예금입금', children: [
            { label: '입금보고서', to: '/accounting/vouchers?type=DEPOSIT_REPORT' },
            { label: '매출처로부터', to: '/accounting/sales-collection' }, { label: '카드매출대금회수', to: '/accounting/card-sales-collection' },
            { label: '일시적으로(입금)', to: '/accounting/temp-deposit' }, { label: '은행차입으로', to: '/accounting/bank-borrowing' }, { label: '기타입금', to: '/accounting/other-deposit' },
          ] },
          { label: '현금예금출금', children: [
            { label: '지출결의서', to: '/accounting/vouchers' }, { label: '매입처로', to: '/accounting/purchase-payment' },
            { label: '영수증으로', to: '/accounting/receipt-payment' }, { label: '법인카드대금결제', to: '/accounting/card-bill-payment' }, { label: '계좌간이동', to: '/accounting/account-transfer' },
            { label: '일시적으로(출금)', to: '/accounting/temp-withdraw' }, { label: '은행으로', to: '/accounting/loan-repayment' }, { label: '기타출금', to: '/accounting/other-withdraw' },
          ] },
          /* 원본에 없는 우리 간편입력(현금예금 한 화면 · 계좌/카드 권한) — FastEntry 에서 옮겨 왔다. */
          { label: '간편입력', children: [
            { label: '현금예금입금', to: '/accounting/cash-deposit' }, { label: '현금예금출금', to: '/accounting/cash-withdraw' },
            { label: '계좌간이동·카드대금결제', to: '/accounting/cash-details' },
          ] },
        ],
      },
      {
        /* 원본 회계 I › 비현금거래(2026-10-13 loginaa) — 증빙만수령(일반영수증 · 신용카드전표 · 가지급금정산서) · 기타. */
        label: '비현금거래',
        home: '/accounting/noncash-card',
        nodes: [
          { label: '증빙만수령', children: [
            { label: '일반영수증', to: '/accounting/noncash-receipt' }, { label: '신용카드전표', to: '/accounting/noncash-card' },
            { label: '가지급금정산서', to: '/accounting/vouchers?type=ADVANCE_SETTLEMENT' },
          ] },
          { label: '기타', to: '/accounting/noncash-other' },
          { label: '비현금거래(대체전표)', to: '/accounting/non-cash' },
        ],
      },
      {
        label: '어음거래',
        open: ['지급어음'],
        nodes: [
          /* 원본 회계 I › 어음거래(2026-10-20 loginaa): 받을어음 9 · 지급어음 8. 받을어음증가 · 감소는 한 장 입력(C000014 · E010602).
             거래처지급(E010603) · 지급어음증가 · 감소(E010604 · E010605)도 한 장 입력. 일괄감소 둘(E010621 · E010629)은 보유 어음 목록 → 입금보고서 · 지출결의서. */
          { label: '받을어음', children: [
            { label: '받을어음증가', to: '/accounting/notes-increase' }, { label: '받을어음감소', to: '/accounting/notes-decrease' },
            { label: '받을어음거래처지급', to: '/accounting/notes-endorse' }, { label: '받을어음일괄감소', to: '/accounting/notes-batch-decrease' },
            { label: '받을어음조회', to: '/accounting/notes-list' }, { label: '받을어음거래내역', to: '/accounting/notes-ledger' },
            { label: '받을어음증가현황', to: '/accounting/notes-in' }, { label: '받을어음감소현황', to: '/accounting/notes-out' },
            { label: '보유어음현황', to: '/accounting/notes-held' },
          ] },
          { label: '지급어음', children: [
            { label: '지급어음증가', to: '/accounting/notes-pay-increase' }, { label: '지급어음감소', to: '/accounting/notes-pay-decrease' },
            { label: '지급어음일괄감소', to: '/accounting/notes-pay-batch-decrease' },
            { label: '지급어음조회', to: '/accounting/notes-pay-list' }, { label: '지급어음거래내역', to: '/accounting/notes-pay-ledger' },
            { label: '지급어음증가현황', to: '/accounting/notes-pay-in' }, { label: '지급어음감소현황', to: '/accounting/notes-pay-out' },
            { label: '미지급어음현황', to: '/accounting/notes-unpaid' },
          ] },
        ],
      },
      {
        label: '고정자산',
        /* 원본 고정자산(2026-10-28 실측 · plans/회계1/E010610.md 사이트맵): 고정자산등록 · 고정자산증가 · 고정자산감소 · 고정자산전표조회 ·
           고정자산관련출력물(대장 · 증가내역 · 감소내역 · 증감대장 · 수불부 · 감가상각계산, 펼쳐 둔다). 원본 처음 화면은 고정자산증가인데
           우리는 증가 · 감소가 고정자산등록 화면의 창이라 따로 된 메뉴가 없다 — 고정자산등록이 처음 화면이다. */
        open: ['고정자산관련출력물'],
        nodes: [
          { label: '고정자산등록', to: '/accounting/fixed-assets' },
          { label: '고정자산전표조회', to: '/accounting/fixed-asset-slips' },
          { label: '고정자산관련출력물', children: [
            { label: '고정자산대장', to: '/accounting/fixed-asset-ledger' }, { label: '고정자산증가내역', to: '/accounting/fixed-asset-in' },
            { label: '고정자산감소내역', to: '/accounting/fixed-asset-out' }, { label: '고정자산증감대장', to: '/accounting/fixed-asset-movement' },
            { label: '고정자산수불부', to: '/accounting/fixed-asset-stock' }, { label: '감가상각계산', to: '/accounting/depreciation-calc' },
          ] },
        ],
      },
      {
        label: '회계거래관리',
        nodes: [
          /* 원본 회계거래관리(2026-10-20 loginaa): 회계거래조회 · 전표인쇄 · 매출 · 매입(세금)계산서조회 · 지출결의서 · 입금보고서 · 가지급금정산서인쇄.
             회계반영/미반영 · 증빙센터는 원본 이 묶음에 없다(우리 화면 — 자리만 끝에 둔다). */
          { label: '회계거래조회', to: '/accounting/journals' },
          { label: '전표인쇄', to: '/accounting/journal-print' },
          { label: '매출(세금)계산서조회', to: '/accounting/sales-tax-list' },
          { label: '매입(세금)계산서조회', to: '/accounting/purchase-tax-list' },
          { label: '지출결의서인쇄', to: '/accounting/voucher-print/expense' },
          { label: '입금보고서인쇄', to: '/accounting/voucher-print/deposit' },
          { label: '가지급금정산서인쇄', to: '/accounting/voucher-print/advance' },
          { label: '회계반영/미반영', to: '/sales/accounting-reflection' },
          { label: '증빙센터', to: '/accounting/evidence-center' },
        ],
      },
      {
        label: '출력물',
        nodes: [
          { label: '커뮤니케이션센터', to: '/groupware/messages' },
          {
            /* 원본 출력물 › 경영자료(2026-10-20 loginaa) 차례. 사용자정의보고서는 아직 없다(보고서 양식 설정이 먼저 — plans/회계1.md 남은 것). */
            label: '경영자료',
            children: [
              { label: '자금일보', to: '/accounting/fund-daily' },
              { label: '현금흐름(입출금내역)', to: '/accounting/cash-flow' },
              { label: '자금현황표', to: '/accounting/fund-status' },
              { label: '자금증감내역', to: '/accounting/fund-flow' },
              { label: '월별손익분석', to: '/accounting/monthly-pnl' },
              { label: '월별원가분석', to: '/accounting/monthly-cost' },
              { label: '채권/채무회수기간표', to: '/accounting/arap-aging' },
              { label: '채권/채무잔액분석표', to: '/accounting/arap-balance' },
              { label: '경영요약보고서', to: '/accounting/management-summary' },
              { label: '회계집계표', to: '/accounting/account-aggregate' },
              { label: '월별매입집계표', to: '/accounting/monthly-purchase-summary' },
              { label: '월별매출집계표', to: '/accounting/monthly-sales-summary' },
              { label: '지출결의서집계', to: '/accounting/expense-slip-summary' },
              { label: '입금보고서집계', to: '/accounting/deposit-slip-summary' },
              { label: '가지급금정산서집계', to: '/accounting/advance-slip-summary' },
            ],
          },
          {
            label: '장부',
            children: [
              /* 원본 출력물 › 장부 13(2026-10-20 실측) 차례. 시산표 · 원가명세서 · 계정명세서는 주요재무제표 묶음으로. */
              { label: '계정별원장', to: '/accounting/ledger-book' },
              { label: '계정별거래처별원장', to: '/accounting/account-partner-ledger' },
              { label: '거래처별계정별원장', to: '/accounting/partner-account-ledger' },
              { label: '계정별적요별원장', to: '/accounting/account-remark-ledger' },
              { label: '계정증감내역', to: '/accounting/account-flow' },
              { label: '매입/매출장', to: '/accounting/vat-book' },
              { label: '분개장', to: '/accounting/journal-book' },
              { label: '현금출납장', to: '/accounting/cash-book' },
              { label: '일/월계표', to: '/accounting/day-month-sheet' },
              { label: '외화장부', to: '/accounting/foreign-ledger' },
              { label: '거래처거래내역조회', to: '/accounting/partner-tx-list' },
              { label: '거래처관리대장 I', to: '/accounting/partner-book-1' },
              { label: '거래처관리대장 II', to: '/accounting/partner-book-2' },
            ],
          },
          {
            /* 원본 출력물 › 주요재무제표(2026-10-20 실측) 차례 — 재무상태표 · 손익계산서 · 원가명세서 · 계정명세서 · 합계잔액시산표 ·
               현금흐름표 · 이익잉여금처분계산서 · 수입지출명세서. */
            label: '주요재무제표',
            children: [
              { label: '재무상태표', to: '/accounting/balance-sheet' },
              { label: '손익계산서', to: '/accounting/income-statement' },
              { label: '원가명세서', to: '/accounting/cost-statement' },
              { label: '계정명세서', to: '/accounting/account-detail' },
              { label: '합계잔액시산표', to: '/accounting/trial-balance' },
              { label: '현금흐름표', to: '/accounting/cash-flow-statement' },
              { label: '이익잉여금처분계산서', to: '/accounting/retained-earnings-statement' },
              { label: '수입지출명세서', to: '/accounting/income-expense-statement' },
            ],
          },
          {
            /* 원본 출력물 › 기타(E010847 … E010705, 2026-10-20 실측) 차례. 전표인쇄 · 거래처중심입력은 회계거래관리 · 재고 쪽 화면을 같이 건다. */
            label: '기타',
            children: [
              { label: '회계거래현황', to: '/accounting/journal-status' },
              { label: '전표인쇄', to: '/accounting/journal-print' },
              { label: '매출(세금)계산서현황', to: '/accounting/sales-tax-journal' },
              { label: '매입(세금)계산서현황', to: '/accounting/purchase-tax-journal' },
              { label: '지출결의서이체리스트', to: '/accounting/transfer-list' },
              { label: '회계 vs. 재고 비교', to: '/accounting/accounting-vs-stock' },
              { label: '거래처중심입력', to: '/sales/partner-entry' },
              { label: '거래이력조회(회계)', to: '/accounting/journal-history' },
              { label: '잔액재집계', to: '/accounting/balance-recalc' },
            ],
          },
        ],
      },
    ],
  },
  {
    label: '회계 II',
    /* 원본 1단 기본(2026-10-28)은 수입비용전표검색 — 그 계정이 마지막에 본 화면일 수도 있다(미확인). */
    home: '/accounting/import-cost/vouchers',
    tabs: [
      {
        label: '채권관리',
        nodes: [
          /* 원본 채권관리 탭 차례(2026-10-12 실측) — 채권번호로 잇는 채권내역 보조장부. */
          { label: '채권감소등록', to: '/accounting/bonds/ar/decrease-entry' },
          { label: '채권조회', to: '/accounting/bonds/ar' },
          { label: '채권거래내역', to: '/accounting/bonds/ar/ledger' },
          { label: '채권증가현황', to: '/accounting/bonds/ar/increase' },
          { label: '채권감소현황', to: '/accounting/bonds/ar/decrease' },
          { label: '채권현황', to: '/accounting/bonds/ar/status' },
          { label: '거래처채권관리대장', to: '/accounting/bonds/ar/partner-ledger' },
          { label: '거래처채권집계관리대장', to: '/accounting/bonds/ar/partner-summary' },
          { label: '거래처채권관리대장인쇄', to: '/accounting/bonds/ar/partner-ledger-print' },
          { label: '채권잔액분석표', to: '/accounting/bonds/ar/balance-analysis' },
          /* 원본 채권관리는 위 열 화면뿐이다(2026-10-28 실측). 아래는 원본에 없는 우리 화면 — 다른 메뉴로 닿지 않아 끝에 둔다.
             채권/채무현황(기준일자)은 재고 I › 출력물 › 기타의 [채권/채무현황] 으로 닿는다. */
          { label: '채권·채무현황', to: '/sales/ledger' },
          { label: '거래처관리대장', to: '/sales/partner-ledger' },
        ],
      },
      {
        label: '채무관리',
        nodes: [
          { label: '채무감소등록', to: '/accounting/bonds/ap/decrease-entry' },
          { label: '채무조회', to: '/accounting/bonds/ap' },
          { label: '채무거래내역', to: '/accounting/bonds/ap/ledger' },
          { label: '채무증가현황', to: '/accounting/bonds/ap/increase' },
          { label: '채무감소현황', to: '/accounting/bonds/ap/decrease' },
          { label: '채무현황', to: '/accounting/bonds/ap/status' },
          { label: '거래처채무관리대장', to: '/accounting/bonds/ap/partner-ledger' },
          { label: '거래처채무집계관리대장', to: '/accounting/bonds/ap/partner-summary' },
          { label: '거래처채무관리대장인쇄', to: '/accounting/bonds/ap/partner-ledger-print' },
          { label: '채무잔액분석표', to: '/accounting/bonds/ap/balance-analysis' },
          /* 원본 채무관리도 위 열 화면뿐이다. 아래 둘은 원본에 없는 우리 화면(지급현황은 재고 I › 구매관리 › 구매관리현황으로 닿는다).
             수금/지급(정산)은 예전 영업관리 › 판매 끝에도 있었다 — 원본 판매 묶음에 없어 여기만 남겼다. */
          { label: '미지급현황(연령분석)', to: '/sales/payable' },
          { label: '수금/지급(정산)', to: '/sales/settlement' },
        ],
      },
      {
        label: '수표관리',
        home: '/accounting/checks-list', open: ['발행수표'],
        nodes: [
          { label: '수령수표', children: [
            { label: '수령수표입금처리', to: '/accounting/checks-deposit' },
            { label: '수령수표조회', to: '/accounting/checks-list' },
            { label: '수령수표거래내역', to: '/accounting/checks-ledger' },
            { label: '수령수표현황', to: '/accounting/checks-held' },
            { label: '수령수표증가현황', to: '/accounting/checks-in' },
            { label: '수령수표감소현황', to: '/accounting/checks-out' },
          ] },
          { label: '발행수표', children: [
            { label: '발행수표출금처리', to: '/accounting/checks-withdraw' },
            { label: '발행수표조회', to: '/accounting/checks-issued-list' },
            { label: '발행수표거래내역', to: '/accounting/checks-issued-ledger' },
            { label: '발행수표현황', to: '/accounting/checks-issued' },
            { label: '발행수표증가현황', to: '/accounting/checks-issued-in' },
            { label: '발행수표감소현황', to: '/accounting/checks-issued-out' },
          ] },
          /* 받은수표 · 발행수표를 한 화면에서 보는 우리 화면 — 원본 메뉴에 없다 */
          { label: '수표관리(받은수표·발행수표)', to: '/accounting/checks' },
        ],
      },
      {
        label: '자금계획',
        home: '/accounting/fund-plans/status', open: ['출력물'],
        nodes: [
          /* 원본 자금계획 탭(2026-10-12 실측): 계획전표조회 · 계획전표현황 · 출력물(추정자금일보 · 월보 · 연보). */
          { label: '계획전표조회', to: '/accounting/fund-plans' },
          { label: '계획전표현황', to: '/accounting/fund-plans/status' },
          { label: '출력물', children: [
            { label: '추정자금일보', to: '/accounting/fund-plans/daily' },
            { label: '추정자금월보', to: '/accounting/fund-plans/monthly' },
            { label: '추정자금연보', to: '/accounting/fund-plans/yearly' },
          ] },
          { label: '자금수지계획', to: '/accounting/cash-plan' },
        ],
      },
      {
        label: '예산관리',
        home: '/accounting/budget/status',
        nodes: [
          { label: '월별예산조회', to: '/accounting/budget' },
          { label: '출력물', children: [
            { label: '예산현황', to: '/accounting/budget/status' },
            { label: '예산-실적비교표', to: '/accounting/budget/compare' },
            { label: '통제예산-실적대장', to: '/accounting/budget/control-ledger' },
            { label: '예산-실적대장', to: '/accounting/budget/ledger' },
            { label: '통제예산-실적비교표', to: '/accounting/budget/control-compare' },
          ] },
        ],
      },
      {
        label: '수입비용',
        home: '/accounting/import-cost/vouchers', open: ['수입비용출력물'],
        /* 원본 회계 II › 수입비용(輸入 — 미착품) 사이트맵 차례(2026-10-14 실측). 예전 '수입등록·수입비용현황'(/accounting/income, 收入)은
           원본 이 메뉴에 없는 화면이라 메뉴에서만 뺐다(라우트는 그대로 — 어디로 둘지 사용자 결정 대기, plans/회계2.md). */
        nodes: [
          { label: '관리번호등록', to: '/accounting/import-cost/lots' },
          { label: '비용항목등록', to: '/accounting/import-cost/items' },
          { label: '서류징수시', children: [
            { label: '매입대금청구서수령', to: '/accounting/import-cost/bill' },
            { label: '(세금)계산서수령', to: '/accounting/import-cost/tax-invoice' },
            { label: '일반영수증수령', to: '/accounting/import-cost/receipt' },
          ] },
          { label: '자금지급시', children: [
            { label: '거래대금지급', to: '/accounting/import-cost/trade-payment' },
            { label: '관세사에지급', to: '/accounting/import-cost/broker-payment' },
          ] },
          { label: '통관완료시', children: [{ label: '본계정대체', to: '/accounting/import-cost/transfer' }] },
          { label: '수입비용전표검색', to: '/accounting/import-cost/vouchers' },
          { label: '수입비용출력물', children: [
            { label: '수입관리대장', to: '/accounting/import-cost/ledger' },
            { label: '자금현황표', to: '/accounting/fund-status' },
          ] },
        ],
      },
      {
        label: '비용관리',
        home: '/accounting/expense-items', open: ['비용내역', '비용현황'],
        nodes: [
          { label: '기본사항등록', children: [
            { label: '통제유형등록', to: '/accounting/expense-control-types' },
            { label: '비용등록', to: '/accounting/expense-items' },
            { label: '비용그룹등록', to: '/accounting/expense-groups' },
            { label: '비용일괄등록', to: '/accounting/expense-bulk' },
          ] },
          { label: '비용내역', children: [
            { label: '비용내역입력', to: '/accounting/expense' },
            { label: '비용내역조회', to: '/accounting/expense-list' },
            { label: '전표별회계반영(비용)', to: '/accounting/expense-settle' },
          ] },
          { label: '비용현황', children: [{ label: '비용내역현황', to: '/accounting/expense-detail' }] },
        ],
      },
      {
        label: '계약관리',
        nodes: [
          { label: '계약항목등록', to: '/accounting/contract-items' },
          { label: '계약', children: [{ label: '계약입력', to: '/accounting/billing-contracts/new' }, { label: '계약조회', to: '/accounting/billing-contracts' }, { label: '계약단가/수량일괄변경', to: '/accounting/contract-price-change' }, { label: '계약현황', to: '/accounting/contract-status' }] },
          { label: '청구예정자료', children: [{ label: '청구예정자료생성', to: '/accounting/contract-bills' }, { label: '청구예정자료인쇄', to: '/accounting/contract-bill-print' }, { label: '청구예정자료미생성현황', to: '/accounting/contract-unbilled' }] },
          { label: '회계반영', children: [{ label: '회계/판매일괄반영', to: '/accounting/contract-reflect' }, { label: '회계미반영현황(계약)', to: '/accounting/contract-unreflected' }, { label: '매출(세금)계산서현황(계약)', to: '/accounting/contract-invoices' }] },
          { label: '계약관리·전자계약', to: '/accounting/contracts' },
        ],
      },
      {
        label: '전자계약',
        nodes: [
          { label: '계약서진행단계', to: '/accounting/e-contracts' },
          { label: '계약서현황', to: '/accounting/e-contracts/status' },
        ],
      },
    ],
  },
  {
    label: '관리',
    home: '/hr/payroll',
    tabs: [
      {
        label: '급여관리',
        home: '/hr/payroll', open: ['기본사항등록', '근무기록', '4대보험신고'],
        nodes: [
          { label: '기본사항등록', children: [
            { label: '사원등록', to: '/hr/employees' },
            { label: '수당항목등록', to: '/hr/allowance-items' },
            { label: '공제항목등록', to: '/hr/deduction-items' },
            { label: '수당/공제그룹등록', to: '/hr/pay-groups' },
            { label: '부서등록', to: '/hr/departments' },
            { label: '프로젝트등록', to: '/inventory/projects' },
            // 원본 인쇄용결재라인등록(관리) E090102 — 회계 · 재고 · 관리 알약 중 [관리] 가 켜진 채로 연다(화면은 회계1 의 E010106 과 같다)
            { label: '인쇄용결재라인등록(관리)', to: '/hr/print-sign' },
          ] },
          { label: '근무기록', children: [
            { label: '근무입력', to: '/hr/work-input' },
            { label: '근무조회', to: '/hr/work-list' },
          ] },
          { label: '급여작업', children: [{ label: '급여계산/대장', to: '/hr/payroll' }, { label: '사원별급여조회', to: '/hr/payroll/by-employee' }, { label: '급여현황', to: '/hr/payroll/status' }, { label: '근무확정현황', to: '/hr/payroll/work-confirms' }, { label: '급여이체현황', to: '/hr/payroll/transfer-status' }] },
          { label: '4대보험신고', children: [
            { label: '4대보험취득신고입력', to: '/hr/insurance/acquire' },
            { label: '4대보험상실신고입력', to: '/hr/insurance/loss' },
            { label: '피부양자자격신고입력', to: '/hr/insurance/dependent' },
            { label: '4대보험신고', to: '/hr/insurance/reports' },
          ] },
          /* 원본 급여관리 묶음에 없는 우리 화면 — 예전엔 기본사항등록 · 급여작업 묶음 끝에 섞여 있었다(2026-10-28 실측에 맞춰 묶음 밖 끝으로). */
          { label: '담당자별 실적', to: '/hr/performance' },
          { label: '수당·공제그룹/급여이체', to: '/hr/pay-settings' },
        ],
      },
      {
        label: '인사관리',
        open: ['인사발령', '인사관리현황', '조직도관리'],
        nodes: [
          { label: '인사카드등록', to: '/hr/cards' },
          {
            label: '인사발령',
            children: [
              { label: '인사발령조회', to: '/hr/assignments' },
              { label: '인사발령입력', to: '/hr/assignments/input' },
              { label: '인사발령현황', to: '/hr/assignments/status' },
            ],
          },
          {
            label: '인사관리현황',
            children: [
              { label: '각종증명서인쇄', to: '/hr/certificates' },
              { label: '인원현황', to: '/hr/headcount' },
            ],
          },
          {
            label: '조직도관리',
            children: [
              { label: '조직도등록', to: '/groupware/org-tree' },
              { label: '조직도현황', to: '/groupware/org-status' },
            ],
          },
        ],
      },
      {
        label: '일용근로급여관리',
        home: '/hr/daily-payroll', open: ['일용근로 기본사항 등록', '일용근로 근무기록'],
        nodes: [
          { label: '일용근로 기본사항 등록', children: [
            { label: '일용근로 사원등록', to: '/hr/daily-workers' },
            { label: '일용근로 수당등록', to: '/hr/daily-allowance-items' },
            { label: '일용근로 공제등록', to: '/hr/daily-deduction-items' },
            { label: '프로젝트등록', to: '/inventory/projects' },
          ] },
          { label: '일용근로 근무기록', children: [
            { label: '일용근로 근무입력', to: '/hr/daily-work-input' },
            { label: '일용근로 근무조회', to: '/hr/daily-work-list' },
            { label: '일용근로 근무현황', to: '/hr/daily-work-status' },
          ] },
          { label: '일용근로 급여작업', children: [
            { label: '일용근로 급여계산/대장', to: '/hr/daily-payroll' },
            { label: '일용근로 사원별급여조회', to: '/hr/daily-payroll/by-worker' },
            { label: '일용근로 급여현황', to: '/hr/daily-payroll/status' },
            { label: '일용근로 근무확정현황', to: '/hr/daily-payroll/work-confirms' },
            { label: '일용근로 급여이체현황', to: '/hr/daily-payroll/transfer-status' },
          ] },
          /* 원본 일용근로 급여작업 묶음에 없는 우리 화면(2026-10-28 실측에 맞춰 묶음 밖 끝으로) */
          { label: '일용근로 출역/지급(분개)', to: '/hr/daily-wage' },
        ],
      },
      {
        label: '근태관리',
        home: '/hr/leave-list', open: ['기본사항등록', '출/퇴근(사원)', '출력물'],
        nodes: [
          { label: '기본사항등록', children: [{ label: '근태항목등록', to: '/hr/attendance-kinds' }, { label: '휴가항목등록', to: '/hr/vacation-kinds' }, { label: '사원별휴가일수조회', to: '/hr/vacation-grants' }] },
          {
            label: '근태',
            children: [
              { label: '근태입력', to: '/hr/leave-input' },
              { label: '근태조회', to: '/hr/leave-list' },
              { label: '근태현황', to: '/hr/attendance-kind-status' },
              // 원본 근태 묶음은 셋뿐이다(2026-10-20 사이트맵). 지각현황 · 일별근무시간 · 통합현황은 메뉴에서만 뺐다 — 라우트는 그대로.
            ],
          },
          { label: '출/퇴근(사원)', children: [{ label: '출/퇴근반영기준', to: '/hr/commute-rules' }, { label: '출/퇴근기록부(사원)', to: '/hr/employee-commutes' }, { label: '출/퇴근현황(사원)', to: '/hr/employee-commutes/status' }, { label: '지각현황(사원)', to: '/hr/employee-commutes/late' }, { label: '출퇴근/근태현황(사원)', to: '/hr/employee-commutes/attendance' }] },
          {
            label: '출력물',
            children: [
              { label: '휴가잔여일수현황', to: '/hr/vacation-remain' },
              { label: '휴가사용실적현황', to: '/hr/vacation-use' },
            ],
          },
        ],
      },
      {
        label: '전자근로계약',
        nodes: [
          { label: '근로계약서진행단계', to: '/hr/contracts' },
          { label: '근로계약현황', to: '/hr/contracts/status' },
        ],
      },
    ],
  },
  {
    label: '세무',
    home: '/accounting/vat/return',
    /*
     * 원본 사이트맵(2026-10-03 loginaa) 차례 그대로: 원천징수 · 기타원천세 · 부가세 · 법인세.
     * 묶음 이름도 원본 것(세무신고 · 퇴직정산 · 출력물 · 신고전검토자료 …). 원본에 있는데 아직 없는 화면은 넣지 않는다.
     * 원본에 없는 우리 화면 셋(근로소득원천징수영수증 · 매입매출·부가세 · 법인세 신고서)은 그 2단 맨 끝(묶음 밖)에 둔다.
     */
    tabs: [
      {
        label: '원천징수',
        open: ['지급명세서', '일용근로', '출력물'],
        nodes: [
          { label: '세무신고', children: [
            { label: '원천징수이행상황신고서', to: '/accounting/withholding' },
            { label: '원천세신고서 PDF 다운로드', to: '/accounting/withholding/pdf' },
            { label: '원천징수이행상황신고서확인', to: '/accounting/withholding/confirm' },
            { label: '원천징수부', to: '/accounting/withholding/ledger' },
            { label: '소득세확인서', to: '/accounting/withholding/income-tax-cert' },
          ] },
          { label: '퇴직정산', children: [
            { label: '퇴사자리스트', to: '/hr/retired' },
            { label: '퇴직금계산', to: '/hr/retirement-pay' },
            { label: '중도정산등록/수정', to: '/accounting/withholding/mid-settlement' },
            { label: '중도정산 PDF 다운로드', to: '/accounting/withholding/mid-settlement-pdf' },
          ] },
          { label: '연말정산', children: [
            { label: '정산내역등록/수정', to: '/accounting/withholding/year-end' },
          ] },
          { label: '간이지급명세서', to: '/accounting/simple-payment' },
          { label: '지급명세서', children: [
            { label: '지급명세서파일생성', to: '/accounting/withholding/payment-statement-file' },
            { label: '소득자료제출집계표', to: '/accounting/withholding/income-submission' },
          ] },
          { label: '일용근로', children: [
            { label: '지급명세서(일용직)', to: '/accounting/withholding/daily-statement' },
            { label: '원천징수영수증(일용직)', to: '/accounting/withholding/daily-receipt' },
          ] },
          { label: '출력물', children: [
            { label: '퇴직급여추계액', to: '/accounting/withholding/retirement-estimate' },
            { label: '원천세신고자료비교표', to: '/accounting/withholding/comparison' },
            { label: '연말정산검토표 I', to: '/accounting/withholding/year-end-review-1' },
            { label: '연말정산검토표 II', to: '/accounting/withholding/year-end-review-2' },
          ] },
          /* 원본 원천징수 › 출력물에 없는 우리 화면(2026-10-28 실측에 맞춰 묶음 밖 끝으로) */
          { label: '근로소득원천징수영수증', to: '/accounting/withholding?tab=영수증' },
        ],
      },
      {
        label: '기타원천세',
        open: ['기타원천세', '조회/인쇄'],
        nodes: [
          { label: '소득자등록', to: '/accounting/other-withholding/payees' },
          { label: '기타원천세', children: [
            { label: '기타원천세입력', to: '/accounting/other-withholding/input' },
            { label: '기타원천세조회', to: '/accounting/other-withholding' },
            { label: '기타원천세현황', to: '/accounting/other-withholding/status' },
          ] },
          { label: '조회/인쇄', children: [
            { label: '원천징수영수증(보관용)', to: '/accounting/other-withholding/receipts' },
            { label: '지급명세서(보고용)', to: '/accounting/other-withholding/payment-statement' },
          ] },
        ],
      },
      {
        label: '부가세',
        home: '/accounting/vat/return',
        nodes: [
          { label: '신고전검토자료', children: [
            { label: '(세금)계산서발행/수령', to: '/accounting/vat/tax-voucher' },
            { label: '매출(세금)계산서조회(세무)', to: '/accounting/vat/sales-tax-list' },
            { label: '매출(세금)계산서현황(세무)', to: '/accounting/vat/sales-tax-status' },
            { label: '매입(세금)계산서조회(세무)', to: '/accounting/vat/purchase-tax-list' },
            { label: '매입(세금)계산서현황(세무)', to: '/accounting/vat/purchase-tax-status' },
            { label: '각종구분값변경', to: '/accounting/vat/marks' },
            { label: '매입/매출장', to: '/accounting/vat-book' },
            { label: '이카운트 vs 홈택스 자료비교', to: '/accounting/vat/hometax-compare' },
            { label: '매출(세금)계산서요약', to: '/accounting/vat/sales-tax-summary' },
            { label: '부가세Checklist', to: '/accounting/vat/checklist' },
            { label: '전표vs매출매입자료비교', to: '/accounting/vat/journal-compare' },
            { label: '사업용신용카드 자료비교', to: '/accounting/vat/card-compare' },
          ] },
          { label: '부가세신고서(일반)', children: [
            { label: '부가세신고서(일반)', to: '/accounting/vat/return' },
            { label: '부가세신고서 PDF 다운로드', to: '/accounting/vat/return-pdf' },
          ] },
          { label: '과세자료전산매체', to: '/accounting/vat/media-files' },
          { label: '세무증명서류', to: '/accounting/vat/tax-certificate' },
          /* 원본 신고전검토자료 묶음에 없는 우리 화면(2026-10-28 실측에 맞춰 묶음 밖 끝으로) */
          { label: '매입매출·부가세', to: '/accounting/vat' },
        ],
      },
      {
        label: '법인세',
        nodes: [
          { label: '법인세Checklist', to: '/accounting/corporate-tax/checklist' },
          { label: '지출증빙현황', to: '/accounting/corporate-tax/expense-evidence' },
          { label: '법인세 신고서', to: '/accounting/corporate-tax' },
        ],
      },
    ],
  },
  {
    label: '그룹웨어',
    home: '/groupware/approval/my',
    tabs: [
      {
        label: '공유정보',
        home: '/groupware/notice',
        nodes: [
          // 순서·묶음은 원본 공유정보 메뉴 트리 그대로다.
          // 사원연락처·조직도현황·외근현황은 예전에 원본도 '권한없음'이라 빼 두었는데 2026-10-03 원본이 열려 실측해 넣었다.
          { label: '주요전달사항', to: '/groupware/key-notice' },
          // 2026-10-13 원본: '*통합게시판*' 묶음 아래 게시판 하나, 그다음 '🔔 공지사항' 이 묶음 없이 온다.
          { label: '*통합게시판*', children: [
            { label: '공유정보/업무관리 게시판 20개까지', to: '/groupware/shared-board' },
          ] },
          { label: '🔔 공지사항', to: '/groupware/notice' },
          // 2026-10-13 원본: 회의록(예시) › 통합회의록 · 팀별회의록 게시판, 프로젝트 진행관리(예시) › 간판제작 · 진행현황 칸반.
          // 칸반은 아직 없다(plans/그룹웨어.md 남은 것).
          { label: '회의록(예시)', children: [
            { label: '통합회의록', to: '/groupware/minutes-board' },
            { label: '팀별회의록 게시판', to: '/groupware/meeting-board' },
          ] },
          { label: '프로젝트 진행관리(예시)', children: [
            { label: '🛠️간판제작 프로젝트관리', to: '/groupware/sign-board' },
            { label: '📅 프로젝트 진행현황 칸반', to: '/groupware/project-kanban' },
          ] },
          {
            label: '사내관리',
            children: [
              { label: '일정관리', to: '/groupware/schedule' },
              { label: '공용품관리', to: '/groupware/supplies' },
              { label: '사원연락처', to: '/groupware/contacts' },
            ],
          },
          { label: '조직도관리', children: [
            // 조직도등록은 부서를 나무로 배치하는 화면이다. /groupware/org 는 재고 I › 부서등록(마스터)이 같이 쓴다.
            { label: '조직도등록', to: '/groupware/org-tree' },
            { label: '조직도현황', to: '/groupware/org-status' },
          ] },
          {
            label: '설문조사',
            children: [
              { label: '설문조사입력', to: '/groupware/survey-input' },
              { label: '설문조사조회', to: '/groupware/survey' },
              { label: '설문조사현황', to: '/groupware/survey-status' },
            ],
          },
          { label: '조건별검색', to: '/sales/condition-search' },
          { label: '익명게시판', to: '/groupware/anonymous-board' },
          { label: '외근조회', children: [
            { label: '외근조회', to: '/groupware/field-works' },
            { label: '외근현황', to: '/groupware/field-work-status' },
          ] },
        ],
      },
      {
        label: '전자결재',
        home: '/groupware/approval/my', open: ['기초자료등록'],
        nodes: [
          { label: '기안서작성', to: '/groupware/approval/draft' },
          { label: '내결재관리', to: '/groupware/approval/my' },
          { label: '기안서통합관리', to: '/groupware/approval/all' },
          // 원본은 '기초자료등록' 묶음 아래 공통양식등록·결재설정 둘이다. 우리 설정 화면이
          // 그 둘을 탭으로 갖고 있어서 같은 화면을 가리키고, 탭만 미리 골라 준다.
          {
            label: '기초자료등록',
            children: [
              { label: '공통양식등록', to: '/groupware/approval/settings?tab=공통양식등록' },
              { label: '결재설정', to: '/groupware/approval/settings?tab=결재설정' },
            ],
          },
        ],
      },
      {
        label: '업무관리',
        home: '/groupware/contract-board',
        open: ['출/퇴근'],
        nodes: [
          // 원본 사이트맵 차례(2026-10-14): 예시 게시판들 → ECDrive → 업무일지 → 출/퇴근. 게시판은 회사가 만든 예시라 이름에 이모지가 붙는다.
          { label: '🔹 이카운트 AI 활용 예시 🔹', to: '/groupware/ai-guide' },
          { label: '🔸 칸반보드 활용 예시 🔸', to: '/groupware/kanban-sample' },
          {
            label: '칸반보드(건설업)',
            children: [
              { label: '🏗️ 현장공사일지', to: '/groupware/site-log' },
              { label: '📊 공사진행현황', to: '/groupware/site-status' },
            ],
          },
          {
            label: '칸반보드(IT개발업)',
            children: [
              { label: '📅 개발업무일지', to: '/groupware/dev-log' },
              { label: '📈 개발진행현황', to: '/groupware/dev-status' },
            ],
          },
          {
            label: '계약관리 게시판 (예시)',
            children: [
              { label: '🎧 상담 이력관리', to: '/groupware/consult-board' },
              { label: '🤝🏻 영업 방문관리', to: '/groupware/visit-board' },
              { label: '📑 최종 계약관리', to: '/groupware/contract-board' },
              { label: '🛠️ A/S 관리', to: '/groupware/as-board' },
            ],
          },
          {
            label: '차량관리 게시판 (예시)',
            children: [
              { label: '🚗 1. 차량 정보관리', to: '/groupware/car-info' },
              { label: '🚗 2. 차량 증빙관리', to: '/groupware/car-doc' },
              { label: '🚗 3. 차량 운행관리', to: '/groupware/car-run' },
            ],
          },
          { label: 'ECDrive', to: '/groupware/drive' },
          // 원본에서 '업무관리게시판'은 묶음이고 그 안에 게시판('WORK')이 있다.
          // 우리가 따로 두던 '업무관리게시판' 화면은 WORK 와 같은 것이라 지웠다.
          {
            label: '업무관리게시판',
            children: [
              { label: 'WORK', to: '/groupware/work' },
            ],
          },
          { label: '업무일지', to: '/groupware/worklog' },
          // 원본 그룹웨어의 출/퇴근 묶음은 다섯 개다(2026-10-14 사이트맵). (ID) 현황 넷은 날마다 한 줄 목록이라
          // 관리 > 근태관리의 사원별 집계 화면(/hr/…)과 달라 그룹웨어 화면을 따로 둔다(plans/그룹웨어/E070305.md).
          // 원본에 없는 출/퇴근입력 · 출/퇴근조회(/hr/attendance-input · -list)는 메뉴에서만 뺐다 — 라우트는 그대로(관리 몫).
          {
            label: '출/퇴근',
            children: [
              { label: '출/퇴근기록부(ID)', to: '/groupware/attendance' },
              { label: '출/퇴근현황(ID)', to: '/groupware/attendance-status' },
              { label: '지각현황(ID)', to: '/groupware/attendance-late' },
              { label: '일별근무시간(ID)', to: '/groupware/daily-hours' },
              { label: '출퇴근/근태/일정현황(ID)', to: '/groupware/work-integrated' },
            ],
          },
          /* 원본 2단에 없는 우리 화면(예전 2단 고객관리 · 프로젝트 · 공용메일 · 회계 II 프로젝트 — 2026-10-28 원본 2단 실측에 맞춰 그 2단을 빼며 여기로). 원본 자리를 찾으면 옮긴다. */
          { label: '명함관리', to: '/groupware/cards' },
          { label: '영업활동관리', to: '/groupware/crm' },
          { label: '건설예정공정표', to: '/groupware/construction-schedule' },
          { label: 'SW개발일정관리', to: '/groupware/dev-schedule' },
          { label: '메일함(사내·공용)', to: '/groupware/mail' },
          { label: '쪽지(수발신내역)', to: '/groupware/messages' },
          { label: '프로젝트 진척관리', to: '/groupware/project' },
        ],
      },
      {
        // 원본 사이트맵 그룹웨어 끝 묶음(2026-10-14). 이름에 '게시판' 이 붙어도 다목적 전표다(일자-No. + 격자 줄).
        label: '다목적관리',
        home: '/groupware/sales-contract', open: ['월근태보고'],
        nodes: [
          { label: '*다목적게시판*', children: [{ label: '다목적 게시판 입력항목은', to: '/groupware/multi-input' }] },
          {
            label: '영업',
            children: [
              { label: '영업자별 계약상황', to: '/groupware/sales-contract' },
              { label: '채권회수 상황판', to: '/groupware/bond-collect' },
            ],
          },
          { label: '월근태보고', children: [{ label: '월근태', to: '/groupware/monthly-attendance' }] },
        ],
      },
    ],
  },
  {
    label: '데이터센터',
    tabs: [
      { label: '데이터수집', nodes: [{ label: '데이터수집', to: '/datacenter/collect' }, { label: '수집데이터등록', to: '/datacenter/collect-sources' }] },
      { label: '데이터내보내기', nodes: [{ label: '데이터내보내기', to: '/datacenter/export' }, { label: '의료기기공급내역보고', to: '/datacenter/medical-device-report' }] },
    ],
  },
]

/**
 * 상단 북마크바 한 칸. 원본은 [즐겨찾기]로 지금 화면을 담거나 뺀다 — 사람마다 매일 여는
 * 화면이 다르다. 우리는 코드에 6개를 박아 둬서 아무도 자기 화면을 담을 수 없었고,
 * 담을 수 없으니 쓸 이유도 없었다. 이제 서버가 사용자별로 들고 있다.
 *
 * <p>브라우저에 저장하지 않은 이유: 그러면 집 PC 와 회사 PC 의 북마크가 달라진다.
 */
interface Bookmark { id: number | null; label: string; path: string; sortOrder: number }

const tabLeaves = (tab: Tab): Leaf[] => tab.nodes.flatMap((n) => (isGroup(n) ? n.children : [n]))

/** 경로가 메뉴 항목에 해당하면 그 항목의 길이(구체성)를, 아니면 0을 돌려준다.
 *  세그먼트 경계로 끊어야 '/'가 모든 경로를, '/sales/pay'가 '/sales/payment'를 삼키지 않는다. */
function matchLength(to: string, pathname: string): number {
  if (to === '/') return pathname === '/' ? 1 : 0
  return pathname === to || pathname.startsWith(`${to}/`) ? to.length : 0
}

const BASE_MENU = MENU

/**
 * 현재 경로를 담은 [대메뉴, 탭] 인덱스. 가장 구체적으로 일치하는 리프를 고른다.
 *
 * <p>MyPage 업무 폴더는 다른 모듈의 화면을 그대로 담는다(원본 예시1~4). 그래서 한 경로가 두 메뉴에 걸린다 —
 * 메뉴를 눌러 왔으면 <b>누른 그 자리</b>(pin)를 지키고, 주소로 바로 왔으면 MyPage 가 아니라 제 모듈을 고른다.
 * MyPage 가 MENU 맨 앞이라 '먼저 걸린 것' 으로 두면 판매입력을 재고 I 에서 열어도 MyPage 가 켜진다.
 */
function resolveActive(pathname: string, pin?: [number, number] | null, MENU: TopMenu[] = BASE_MENU): [number, number] {
  const pinned = pin && MENU[pin[0]]?.tabs[pin[1]]
  if (pinned && tabLeaves(pinned).some((l) => !!l.to && matchLength(l.to, pathname) > 0)) return pin!
  let best = 0
  let found: [number, number] = [0, 0]
  MENU.forEach((m, mi) =>
    m.tabs.forEach((tab, ti) =>
      tabLeaves(tab).forEach((leaf) => {
        const len = leaf.to ? matchLength(leaf.to, pathname) : 0
        if (len > best || (len > 0 && len === best && found[0] === 0 && mi !== 0)) {
          best = len
          found = [mi, ti]
        }
      }),
    ),
  )
  return found
}

/*
 * 메뉴검색·사이트맵에서 함께 쓰는, to가 있는 전체 메뉴 항목의 평면 목록.
 *
 * <p>밖으로도 낸다 — 오더관리유형의 [처리메뉴]처럼 <b>화면을 가리키는 값</b>을 고르는 칸이
 * 여기 목록을 그대로 써야 한다. 따로 적어 두면 메뉴를 옮길 때 둘이 갈린다.
 */
export interface FlatItem { label: string; to: string; path: string }
export const FLAT_MENU: FlatItem[] = MENU.flatMap((m) =>
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

/**
 * 사용자가 만든 업무 폴더를 MyPage 2단 메뉴 끝에 세운다(원본: MyPage설정에서 그룹추가 → 예시4 뒤에 붙는다).
 * 폴더 편집은 사용자 동그라미 → [My Page설정] 이다 — 원본 폴더 안에는 설정으로 가는 메뉴가 없다.
 */
function withMyFolders(folders: MyFolder[] | null): TopMenu[] {
  if (!folders || folders.length === 0) return MENU
  const [my, ...rest] = MENU
  const own: Tab[] = folders.map((f) => ({
    label: f.name,
    nodes: f.items.map((i) => ({ label: i.label, to: i.path })),
  }))
  return [{ ...my, tabs: [...my.tabs, ...own] }, ...rest]
}

export default function EcountLayout() {
  const { user, logout, canRoute, isHost, companyName } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null) // 대메뉴 호버 시 뜨는 탭바
  const [menuQuery, setMenuQuery] = useState('')                // 메뉴검색 입력값
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])    // 상단 북마크바 (사용자별)
  const [sitemapOpen, setSitemapOpen] = useState(false)         // 사이트맵 모달
  const [sitemapIdx, setSitemapIdx] = useState(0)               // 사이트맵 좌측 레일 선택
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}) // 사이드바 그룹 접힘
  /* 앱바 [권한있는메뉴만보기] — 켜면(기본) 권한 없는 메뉴를 숨기고, 끄면 모두 보인다(권한 없는 화면은 열어도 🔒 안내). 원본 미실측 */
  const [permOnly, setPermOnly] = useState(() => localStorage.getItem('ec-perm-only') !== 'n')
  /* 머리 로고 자리 · 창 제목의 상호 — 로그인 때 받은 이름으로 시작해 회사정보(/company)를 다시 읽고,
     회사정보 화면에서 저장하면(erp:company-updated) 바로 따라 바뀐다 */
  const [brand, setBrand] = useState<string | null>(companyName)
  /* 회사 로고(마크) — 있으면 머리 로고 자리에 상호 글자 대신 그림, 탭 아이콘도 그 그림(회사정보관리에서 올림).
     그림은 인증이 필요한 /company/logo 라 blob 으로 받아 임시 URL 을 쓴다. */
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let url: string | null = null
    const showLogo = (has: boolean | undefined) => {
      if (!has) { if (alive) setLogoUrl(null); return }
      api.get('/company/logo', { responseType: 'blob' })
        .then((r) => {
          if (!alive) return
          if (url) URL.revokeObjectURL(url)
          url = URL.createObjectURL(r.data as Blob)
          setLogoUrl(url)
        })
        .catch(() => { if (alive) setLogoUrl(null) })
    }
    api.get<{ name?: string; hasLogo?: boolean }>('/company')
      .then((r) => { if (!alive) return; if (r.data?.name) setBrand(r.data.name); showLogo(r.data?.hasLogo) })
      .catch(() => {})
    const onUpdate = (e: Event) => {
      const d = (e as CustomEvent<{ name?: string; hasLogo?: boolean }>).detail
      if (d?.name) setBrand(d.name)
      if (d && 'hasLogo' in d) showLogo(d.hasLogo)
    }
    window.addEventListener('erp:company-updated', onUpdate)
    return () => { alive = false; if (url) URL.revokeObjectURL(url); window.removeEventListener('erp:company-updated', onUpdate) }
  }, [])
  /* 탭 아이콘 — 로고가 있으면 그 그림, 없으면 처음 아이콘(index.html)으로 */
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!link) return
    if (!link.dataset.defaultHref) { link.dataset.defaultHref = link.getAttribute('href') ?? ''; link.dataset.defaultType = link.type }
    if (logoUrl) { link.href = logoUrl; link.removeAttribute('type') }
    else { link.href = link.dataset.defaultHref ?? '/favicon.svg'; if (link.dataset.defaultType) link.type = link.dataset.defaultType }
  }, [logoUrl])
  const [folders, setFolders] = useState<MyFolder[] | null>(null)  // MyPage 나만의 업무 폴더 (사용자별)                 // 쪽지 안 읽은 수
  const [userOpen, setUserOpen] = useState(false)               // 사용자 동그라미 → 이름·로그아웃
  // 휴대폰·태블릿(≤768px, 원본 실측) — ☰ 메뉴판과 ★ 즐겨찾기 · 앱 모음 펼침
  const [drawer, setDrawer] = useState<{ top: number; tab: number } | null>(null)
  const [mPanel, setMPanel] = useState<'fav' | 'apps' | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)               // 본문 영역(표 우클릭 메뉴가 감시)

  // 상단 북마크바. 아무것도 담지 않은 사람에게는 서버가 기본 여섯을 내려 준다.
  useEffect(() => {
    api.get<Bookmark[]>('/bookmarks')
      .then((r) => setBookmarks(r.data))
      .catch(() => setBookmarks([]))
  }, [])

  /*
   * 지금 화면이 메뉴의 어느 항목인가. <b>가장 구체적인 것</b>을 고른다 —
   * '/sales' 가 '/sales/partners' 를 삼키면 북마크 이름이 엉뚱해진다.
   * 메뉴에 없는 화면(상세·모달 경로)은 이름을 붙일 수 없어 담지 않는다.
   */
  const currentLeaf = useMemo(() => {
    let best: FlatItem | null = null
    for (const f of FLAT_MENU) {
      if (matchLength(f.to, location.pathname) > 0
          && (!best || f.to.length > best.to.length)) best = f
    }
    return best
  }, [location.pathname])
  const bookmarked = !!currentLeaf && bookmarks.some((b) => b.path === currentLeaf.to)

  async function toggleBookmark() {
    if (!currentLeaf) return
    try {
      const res = bookmarked
        ? await api.delete<Bookmark[]>(`/bookmarks?path=${encodeURIComponent(currentLeaf.to)}`)
        : await api.post<Bookmark[]>('/bookmarks', { label: currentLeaf.label, path: currentLeaf.to })
      setBookmarks(res.data)
    } catch {
      /* 북마크는 곁다리다 — 실패해도 화면을 막지 않는다. */
    }
  }

  // 폴더는 폴더 설정 화면에서 바뀐다 — 그 화면이 바뀐 목록을 창 이벤트로 실어 보낸다(features/mypage/api).
  useEffect(() => {
    myFolders.list().then(setFolders).catch(() => setFolders(null))
    const onChange = (e: Event) => setFolders((e as CustomEvent<MyFolder[]>).detail)
    window.addEventListener(MY_FOLDERS_EVENT, onChange)
    return () => window.removeEventListener(MY_FOLDERS_EVENT, onChange)
  }, [])
  const NAV = useMemo(() => withMyFolders(folders), [folders])

  const menuPin = (location.state as { menuPin?: [number, number] } | null)?.menuPin
  const [topIdx, tabIdx] = useMemo(() => resolveActive(location.pathname, menuPin, NAV), [location.pathname, menuPin, NAV])
  const activeTop = NAV[topIdx]
  const activeTab = activeTop.tabs[tabIdx]

  // 권한에 따른 메뉴 노출 판정. 리프는 라우트 권한으로, 상위는 하위가 하나라도 보이면 보인다.
  // 회사관리(/companies)는 본사에서만 노출한다.
  const leafOk = (l: Leaf) =>
    (l.to === '/companies' ? isHost : true) && (!permOnly || !l.to || canRoute(l.to))
  const nodeOk = (n: SideNode) => (isGroup(n) ? n.children.some(leafOk) : leafOk(n))
  const tabOk = (t: Tab) => t.nodes.some(nodeOk)
  const topOk = (m: TopMenu) => m.tabs.some(tabOk)
  // 대메뉴/탭을 클릭했을 때 이동할 "접근 가능한" 첫 라우트 (권한 없는 첫 화면으로 튀지 않게)
  const firstAllowedTabRoute = (t: Tab) => tabLeaves(t).find((l) => l.to && canRoute(l.to))?.to
  /** 2단을 누르면 여는 화면 — 원본이 정해 둔 처음 화면(home), 권한이 없으면 첫 화면. 1단도 첫 2단의 이 화면으로 간다. */
  const tabRoute = (t: Tab) => (t.home && canRoute(t.home) ? t.home : firstAllowedTabRoute(t))

  // 메뉴검색: 입력값이 있으면 부분일치 결과(최대 12개). 권한 없는 항목은 제외.
  const menuMatches = menuQuery.trim()
    ? FLAT_MENU.filter((x) => x.label.toLowerCase().includes(menuQuery.trim().toLowerCase()))
        .filter((x) => canRoute(x.to))
        .slice(0, 12)
    : []

  /** pin — 누른 메뉴의 [대메뉴, 탭]. 같은 화면이 MyPage 폴더와 제 모듈에 함께 걸릴 때 어느 쪽을 켤지 정한다. */
  function gotoMenu(to: string, pin?: [number, number]) {
    setMenuQuery('')
    setSitemapOpen(false)
    setHoverIdx(null)
    navigate(to, pin ? { state: { menuPin: pin } } : undefined)
  }

  function openLeaf(leaf: Leaf) {
    if (leaf.to) gotoMenu(leaf.to, [topIdx, tabIdx])
    else void ecAlert(`[${leaf.label}] 메뉴는 준비 중입니다.`)
  }

  // 2단 메뉴 — 머리 메뉴 아래 떠 있는 흰 알약 판(styles/shell.css .ec-subnav)
  function subnav(menu: TopMenu, activeTabIdx: number | null) {
    if (menu.tabs.length < 2) return null
    return (
      <ul className="ec-subnav">
        {menu.tabs.map((tab, i) => {
          if (!tabOk(tab)) return null
          /* 키는 [1단:2단] 자리 — 이름으로 두면 같은 이름 2단이 둘일 때(2026-10-28 회계 II '전자계약') 1단을 오가며 다시 그릴 때
             React 가 옛 li 를 못 지워 2단이 겹쳐 쌓였다. 2단을 누르면 원본처럼 왼쪽 메뉴 펼침을 처음 상태로 되돌린다. */
          return (
            <li key={`${NAV.indexOf(menu)}:${i}`}>
              <button
                className={`ec-subnav-item${i === activeTabIdx ? ' active' : ''}`}
                onClick={() => { const to = tabRoute(tab); if (to) { setCollapsed({}); gotoMenu(to, [NAV.indexOf(menu), i]) } }}
              >
                {tab.label}
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  /* 가장 길게 맞는 메뉴 하나만 켠다 — '/accounting/withholding' 과 '/accounting/withholding/pdf' 가 함께 켜지지 않게 */
  const bestLeafLen = Math.max(0, ...FLAT_MENU.map((f) => matchLength(f.to, location.pathname)))

  /* 창(탭) 제목 = 지금 화면 이름 - 상호 (원본도 탭 제목이 화면 이름이다). 메뉴에 없는 화면은 상호만 */
  useEffect(() => {
    const leaf = bestLeafLen > 0 ? FLAT_MENU.find((f) => matchLength(f.to, location.pathname) === bestLeafLen) : undefined
    const site = brand || '제조 ERP'
    document.title = leaf ? `${leaf.label} - ${site}` : site
  }, [bestLeafLen, location.pathname, brand])
  function sidebarLeaf(leaf: Leaf, key: number) {
    const on = !!leaf.to && bestLeafLen > 0 && matchLength(leaf.to, location.pathname) === bestLeafLen
    return (
      <button
        key={key}
        className={`ec-lnb-leaf${on ? ' active' : ''}${leaf.to ? '' : ' off'}`}
        onClick={() => openLeaf(leaf)}
      >
        {leaf.label}
      </button>
    )
  }

  // 화면을 옮기면 ☰ 메뉴판 · 펼침은 닫는다(휴대폰에서 메뉴를 고르면 바로 그 화면을 봐야 한다)
  useEffect(() => { setDrawer(null); setMPanel(null) }, [location.pathname])

  // ☰ 메뉴판 — 원본 휴대폰 화면: 왼쪽 열은 1단(고른 것 아래 2단 카드), 오른쪽 열은 그 2단의 3·4단 나무
  function mobileDrawer(at: { top: number; tab: number }) {
    const top = NAV[at.top]
    const tab = top.tabs[at.tab] ?? top.tabs[0]
    return (
      <div className="ec-drawer">
        <div className="ec-drawer-tops">
          {NAV.map((m, idx) => {
            if (!topOk(m)) return null
            const on = idx === at.top
            return (
              <div key={m.label}>
                <button className={`ec-drawer-top${on ? ' active' : ''}`} onClick={() => setDrawer({ top: idx, tab: 0 })}>{m.label}</button>
                {on && m.tabs.length > 1 && (
                  <ul className="ec-drawer-tabs">
                    {m.tabs.map((t, ti) => tabOk(t) && (
                      <li key={ti}>
                        <button className={`ec-drawer-tab${ti === at.tab ? ' active' : ''}`} onClick={() => setDrawer({ top: idx, tab: ti })}>{t.label}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
        <div className="ec-drawer-tree ec-lnb">
          {tab.nodes.map((node, ni) => {
            if (!isGroup(node)) return leafOk(node) ? sidebarLeaf(node, ni) : null
            const kids = node.children.filter(leafOk)
            if (kids.length === 0) return null
            // 왼쪽 메뉴와 같은 규칙 — 지금 화면이 든 묶음만 펼치고 칠한다. 접힌 상태도 왼쪽 메뉴와 같이 쓴다.
            const current = kids.some((c) => !!c.to && matchLength(c.to, location.pathname) > 0)
            const key = `${at.top}/${at.tab}/${node.label}`
            const open = key in collapsed ? !collapsed[key] : current || !!tab.open?.includes(node.label)
            return (
              <div key={ni}>
                <button className={`ec-lnb-group${open ? ' open' : ''}${current ? ' current' : ''}`}
                        onClick={() => setCollapsed((c) => ({ ...c, [key]: open }))}>{node.label}</button>
                {open && <div className="ec-lnb-leaves">{kids.map((c, ci) => sidebarLeaf(c, ci))}</div>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // 화면이 하나뿐인 메뉴(MyPage)는 원본처럼 왼쪽 메뉴 없이 본문을 넓게 쓴다
  const leafCount = activeTab.nodes.reduce((n, node) => n + (isGroup(node) ? node.children.length : 1), 0)
  const showLnb = leafCount > 1

  return (
    <div className="ec-shell">
      {/* ===== 최상단 북마크 줄 ===== */}
      {/* 휴대폰 폭에서 ★ 를 누르면 이 줄이 머리 아래를 덮는 판이 된다(shell.css .ec-bookbar.m-open, 원본 wrapper-frame-bookmark) */}
      <div className={`ec-bookbar${mPanel === 'fav' ? ' m-open' : ''}`}>
        <div className="ec-bookbar-search">
          <span className="icon">🔍</span>
          <input
            placeholder="메뉴검색"
            value={menuQuery}
            onChange={(e) => setMenuQuery(e.target.value)}
            onBlur={() => window.setTimeout(() => setMenuQuery(''), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter' && menuMatches[0]) gotoMenu(menuMatches[0].to) }}
          />
          <button className="ec-chip" onClick={() => { setSitemapIdx(topIdx); setSitemapOpen(true) }}>사이트맵</button>
          {menuMatches.length > 0 && (
            <div className="ec-popover" style={{ left: 0, right: 'auto', top: '100%', marginTop: 3, minWidth: 260, maxHeight: 320, overflowY: 'auto', padding: 4 }}>
              {menuMatches.map((x, i) => (
                // onMouseDown로 input의 onBlur보다 먼저 이동을 처리한다
                <button
                  key={`${x.to}-${i}`}
                  onMouseDown={(e) => { e.preventDefault(); gotoMenu(x.to) }}
                  className="ec-lnb-leaf"
                  style={{ color: 'var(--ec-text)' }}
                >
                  {x.label}
                  <span className="text-[11px] text-ec-hint ml-[6px] font-normal">{x.path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="ec-bookbar-hint">★ 자주 사용하는 메뉴를 즐겨찾기로 추가할 수 있습니다 ★</span>
        {bookmarks.map((b, i) => (
          <NavLink key={b.path + i} to={b.path} className={({ isActive }) => `ec-bookmark${isActive ? ' active' : ''}`}>
            {b.label}
          </NavLink>
        ))}
        {/* 지금 화면을 담거나 뺀다. 메뉴에 없는 화면은 이름을 붙일 수 없어 담지 않는다. */}
        <button className={`ec-bookbar-star${bookmarked ? ' on' : ''}`} title={bookmarked ? '북마크에서 빼기' : '이 화면을 북마크에 담기'}
                onClick={toggleBookmark} disabled={!currentLeaf}>
          {bookmarked ? '★' : '☆'}
        </button>
        <span className="ec-bookbar-pin">📌</span>
      </div>

      {/* ===== 머리 메뉴(1단) + 떠 있는 2단 메뉴 ===== */}
      <div className="ec-gnb" onMouseLeave={() => setHoverIdx(null)}>
        <Link to="/" className="ec-logo" title={brand ?? undefined}>
          {logoUrl ? <img className="ec-logo-img" src={logoUrl} alt={brand ?? '회사 로고'} />
            : brand ? <b className="ec-logo-name">{brand}</b> : <><b>제조</b><span className="tail">ERP</span></>}
        </Link>
        {/* 휴대폰·태블릿에서만 — ☰ 메뉴판, ★ 즐겨찾기 */}
        <button className="ec-m-btn ec-m-menu" aria-label="메뉴" onClick={() => { setMPanel(null); setDrawer((d) => (d ? null : { top: topIdx, tab: tabIdx })) }}>☰</button>
        <button className="ec-m-btn ec-m-fav" aria-label="즐겨찾기" onClick={() => { setDrawer(null); setMPanel((p) => (p === 'fav' ? null : 'fav')) }}>★</button>
        <ul className="ec-gnb-menu">
          {NAV.map((m, idx) => {
            if (!topOk(m)) return null
            return (
              <li key={m.label} onMouseEnter={() => setHoverIdx(idx)}>
                <button
                  className={`ec-gnb-item${idx === topIdx ? ' active' : ''}`}
                  onClick={() => {
                    // 원본은 1단마다 처음 여는 화면이 따로 있다(재고 I → 판매조회 · 세무 → 부가세신고서(일반) …) — 그 화면이 든 2단을 켠다.
                    const hi = m.home && canRoute(m.home) ? m.tabs.findIndex((t) => tabLeaves(t).some((l) => l.to === m.home)) : -1
                    const ti = hi >= 0 ? hi : m.tabs.findIndex((t) => !!tabRoute(t))
                    const to = hi >= 0 ? m.home : ti >= 0 ? tabRoute(m.tabs[ti]) : undefined
                    if (to) { setCollapsed({}); gotoMenu(to, [idx, ti]) }
                  }}
                >
                  {m.label}
                </button>
              </li>
            )
          })}
        </ul>
        {/* 다른 대메뉴에 마우스를 올리면 그 메뉴의 2단을, 아니면 지금 메뉴의 2단을 띄운다 */}
        {hoverIdx !== null && hoverIdx !== topIdx ? subnav(NAV[hoverIdx], null) : subnav(activeTop, tabIdx)}

        <div className="ec-gnb-right">
          {companyName && <span className="ec-company">{companyName}</span>}
          <button className="ec-m-apps" aria-label="앱 모음" onClick={() => { setDrawer(null); setMPanel((p) => (p === 'apps' ? null : 'apps')) }}>⋮⋮</button>
          <button className="ec-avatar" title={user?.name} onClick={() => setUserOpen((o) => !o)}>👤</button>
          {userOpen && (
            <div className="ec-popover" onMouseLeave={() => setUserOpen(false)}>
              <div className="font-bold text-ec-text">{user?.name}</div>
              <div className="text-[11px] text-ec-hint mb-[8px]">{user?.roles.join(', ')}</div>
              <button className="ec-btn w-full justify-center mb-[4px]" onClick={() => { setUserOpen(false); navigate('/mypage/folders') }}>My Page설정</button>
              <button className="ec-btn" onClick={logout} style={{ width: '100%', justifyContent: 'center' }}>로그아웃</button>
            </div>
          )}
        </div>
      </div>

      {drawer && mobileDrawer(drawer)}
      {mPanel === 'apps' && (
        <div className="ec-m-panel ec-m-apps-grid">
          {APP_ITEMS.filter((a) => a.key !== 'hide').map((a) => (
            <button key={a.key} type="button" className="ec-appbar-btn" data-tone={a.tone} onClick={() => { setMPanel(null); openAppBarPanel(a.key) }}>
              <Icon name={a.icon} /><span>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ===== 왼쪽 메뉴 + 본문 틀 + 오른쪽 앱바 ===== */}
      <div className="ec-body">
        {showLnb && (
          <aside className="ec-lnb">
            {activeTab.nodes.map((node, ni) => {
              if (!isGroup(node)) return leafOk(node) ? sidebarLeaf(node, ni) : null
              const visibleChildren = node.children.filter(leafOk)
              if (visibleChildren.length === 0) return null
              const key = `${topIdx}/${tabIdx}/${node.label}`
              // 원본처럼 지금 화면이 든 묶음을 칠하고 펼친다. 원본이 처음부터 펼쳐 두는 묶음(tab.open)도 펼친다. 나머지는 접혀 있다가 누르면 펼친다.
              const current = visibleChildren.some((c) => !!c.to && matchLength(c.to, location.pathname) > 0)
              const open = key in collapsed ? !collapsed[key] : current || !!activeTab.open?.includes(node.label)
              return (
                <div key={ni}>
                  <button
                    className={`ec-lnb-group${open ? ' open' : ''}${current ? ' current' : ''}`}
                    onClick={() => setCollapsed((c) => ({ ...c, [key]: open }))}
                  >
                    {node.label}
                  </button>
                  {open && <div className="ec-lnb-leaves">{visibleChildren.map((c, ci) => sidebarLeaf(c, ci))}</div>}
                </div>
              )
            })}
          </aside>
        )}

        <div ref={contentRef} className={`ec-frame${showLnb ? '' : ' full'}`}>
          {/* EcListShell 을 쓰지 않는 화면의 표에도 우클릭 메뉴를 붙인다.
              셸이 있는 화면은 셸이 이벤트를 먼저 잡고 전파를 끊으므로 여기까지 오지 않는다. */}
          <TableContextMenu containerRef={contentRef} toolbarRef={contentRef} />
          {canRoute(location.pathname) ? (
            /* 화면 조각(lazy)을 처음 받을 때 본문만 기다린다 — 바깥(router) Suspense 만 있으면 머리 · 메뉴까지 통째로
               '불러오는 중' 으로 바뀌어, 처음 여는 화면이 한 번 빈 흰 화면으로 보였다(데이터이관 루프 19 · 출하입력). */
            <Suspense fallback={<div className="p-[24px] text-ec-hint text-[13px]">화면을 불러오는 중…</div>}>
              <Outlet />
            </Suspense>
          ) : (
            <div className="p-[48px] text-center text-ec-hint">
              <div className="text-[40px] mb-[12px]">🔒</div>
              <div className="text-[16px] font-bold text-ec-text mb-[6px]">
                접근 권한이 없습니다
              </div>
              <div className="text-[13px]">
                이 메뉴에 대한 권한이 없습니다. 필요하면 관리자에게 권한을 요청하세요.
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽 세로 앱바 + 앱바 창(features/appbar) — 창은 화면에 고정 배치라 앱바가 숨는 휴대폰 폭에서도 뜬다 */}
        <AppBar companyName={brand} permOnly={permOnly}
                onPermOnly={(on) => { setPermOnly(on); localStorage.setItem('ec-perm-only', on ? 'y' : 'n') }} />
      </div>

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
            <div className="py-[12px] px-[16px] border-b border-b-ec-line-soft border-solid flex items-center">
              <span className="font-extrabold text-[15px] text-ec-text">사이트맵 · 전체 메뉴</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setSitemapOpen(false)}>닫기</button>
            </div>

            <div className="flex min-h-[380px]">
              {/* 좌측 대메뉴 레일 */}
              <div className="w-[168px] shrink-0 border-r border-r-ec-line-soft border-solid py-[8px] px-0 bg-ec-page">
                {NAV.map((m, i) => (
                  !topOk(m) ? null :
                  <button
                    key={m.label}
                    onMouseEnter={() => setSitemapIdx(i)}
                    onClick={() => setSitemapIdx(i)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px',
                      background: i === sitemapIdx ? '#fff' : 'none', border: 0, cursor: 'pointer', fontSize: 13,
                      color: i === sitemapIdx ? 'var(--ec-blue)' : 'var(--ec-text)',
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
                {NAV[sitemapIdx].tabs.map((tab) => (
                  !tabOk(tab) ? null :
                  <div key={tab.label}>
                    <div style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--ec-blue)', marginBottom: 6, paddingBottom: 4, borderBottom: '2px solid var(--ec-blue-light)' }}>
                      {tab.label}
                    </div>
                    {tab.nodes.map((node) =>
                      isGroup(node) ? (
                        node.children.some(leafOk) ? (
                        <div key={node.label} className="mb-[6px]">
                          <div className="font-bold text-[11.5px] text-ec-hint mt-[4px] mx-0 mb-[2px]">{node.label}</div>
                          {node.children.filter(leafOk).map((c) => (
                            <button
                              key={c.label} disabled={!c.to} onClick={() => c.to && gotoMenu(c.to)}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px 3px 12px',
                                fontSize: 12, background: 'none', border: 0, borderRadius: 3,
                                cursor: c.to ? 'pointer' : 'default', color: c.to ? 'var(--ec-text)' : '#b3b8bf',
                              }}
                              onMouseEnter={(e) => { if (c.to) e.currentTarget.style.background = 'var(--ec-blue-light)' }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                        ) : null
                      ) : !leafOk(node) ? null : (
                        <button
                          key={node.label} disabled={!node.to} onClick={() => node.to && gotoMenu(node.to)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: '3px 6px',
                            fontSize: 12, background: 'none', border: 0, borderRadius: 3,
                            cursor: node.to ? 'pointer' : 'default', color: node.to ? 'var(--ec-text)' : '#b3b8bf',
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
