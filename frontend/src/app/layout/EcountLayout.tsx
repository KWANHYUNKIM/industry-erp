import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { api } from '../../api/client'
import AppBarPanel, { type PanelKind } from '../../components/AppBarPanel'
import TableContextMenu from '../../components/TableContextMenu'
import type { NotificationResponse } from '../../types/api'

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
    /* 원본 MyPage 는 업무 폴더다 — [나만의 업무 폴더] + 업종 예시 넷(제조 · 유통 · 건설 · 비영리)이 2단 메뉴이고,
       폴더를 고르면 그 안의 첫 화면이 열린다. 예시의 화면 가운데 우리에게 없는 것(매출전표 I · 출고/입고입력 ·
       (세금)계산서진행단계 · 카드매입조회 · 현장별 전표 · 수입지출명세서 …)은 싣지 않았다(대조 보드 MyPage 행). */
    tabs: [
      { label: '나만의 업무 폴더를 만들수 있습니다.', nodes: [
        { label: '사용할 메뉴를 직접 설정할 수 있습니다.', to: '/groupware/schedule' },
        { label: '메뉴명도 수정 가능합니다.', to: '/groupware/schedule' },
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
    tabs: [
      { label: '정보관리', nodes: [{ label: '회사정보관리', to: '/settings/company' }] },
      { label: '사용자관리', nodes: [{ label: '사용자등록', to: '/users' }, { label: '역할·권한관리', to: '/roles' }, { label: '회사관리', to: '/companies' }] },
      { label: '환경설정', nodes: [{ label: '기능설정', to: '/settings/preferences' }, { label: '기본값설정', to: '/settings/defaults' }] },
      { label: '기타관리시스템', nodes: [{ label: '기타관리시스템', to: '/settings/etc' }, { label: '공통코드', to: '/settings/codes' }, { label: '사용자정의필드', to: '/settings/custom-fields' }, { label: '디자인 시스템', to: '/settings/design-system' }] },
      { label: '보안관리', nodes: [{ label: '보안설정', to: '/settings/security' }] },
      { label: '인쇄서식', nodes: [{ label: '인쇄용 결재라인', to: '/settings/print-sign' }] },
      { label: '다운로드', nodes: [{ label: '엑셀자료올리기기능', to: '/settings/download' }] },
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
          { label: '거래처특별단가그룹등록', to: '/inventory/special-price-group' },
          { label: '특별단가등록', to: '/sales/special-price' },
          { label: '외화등록', to: '/settings/currencies' },
        ],
      },
      {
        // 원본 영업관리는 평평한 목록이 아니라 전표 단위 묶음이다
        // (견적서·주문서·판매·판매일괄회계반영·출하지시서·출하). 현황류는 여기가 아니라 출력물 탭에 있다.
        // 우리 화면 하나가 원본의 조회·입력을 겸하는 경우가 많아, 없는 이름은 만들지 않고 있는 것만 건다.
        label: '영업관리',
        nodes: [
          { label: '견적서', children: [{ label: '견적서조회', to: '/sales/quotations' }] },
          { label: '주문서', children: [{ label: '주문서조회', to: '/sales/orders' }, { label: '주문서현황', to: '/sales/order-status' }] },
          {
            label: '판매',
            children: [
              { label: '판매조회', to: '/sales/sales-list' },
              { label: '판매입력', to: '/sales/sell' },
              { label: '거래처중심입력', to: '/sales/partner-entry' },
              { label: '품목중심입력', to: '/sales/item-entry' },
              { label: '판매단가일괄변경', to: '/sales/sales-price-bulk' },
              /*
               * 원본 영업관리 탭 실측(사본 '판매현황' 의 메뉴트리): 판매조회 · 판매입력 ·
               * 판매입력 II · 판매단가일괄변경 · <b>판매현황 · 수금현황 · 판매할인현황 ·
               * 회계미반영현황 (판매) · 거래처별채권</b> · 거래명세서인쇄 · 결제내역조회 ·
               * 결제내역자료비교 · 판매일괄회계반영.
               *
               * <p>이 다섯이 우리에겐 <b>출력물 탭에만</b> 있었다. 구매관리 탭에는 짝이 되는
               * 다섯(구매현황·지급현황·구매할인현황·회계미반영현황 (구매)·거래처별채무)이
               * 이미 들어 있어서, <b>같은 자리인데 영업만 비어 있었다</b> —
               * 구매에서 되던 일이 판매에서 안 되면 사람은 자기가 잘못 찾는 줄 안다.
               * 출력물 탭에도 그대로 둔다(원본도 두 곳에 있다).
               */
              { label: '판매현황', to: '/sales/sales-status' },
              { label: '수금현황', to: '/sales/collection' },
              { label: '판매할인현황', to: '/sales/sales-discount' },
              { label: '회계미반영현황 (판매)', to: '/sales/accounting-reflection?kind=sales&view=unposted' },
              { label: '거래처별채권', to: '/sales/ledger-receivable' },
              { label: '거래명세서인쇄', to: '/sales/statement' },
              { label: '결제내역조회', to: '/sales/payment-history' },
              { label: '결제내역자료비교', to: '/sales/payment-compare' },
              { label: '수금/지급', to: '/sales/settlement' },
            ],
          },
          { label: '판매일괄회계반영', children: [{ label: '회계반영/미반영', to: '/sales/accounting-reflection?view=batch' }] },
          { label: '출하지시서', children: [{ label: '출하지시서조회', to: '/sales/shipment-order' }] },
          {
            label: '출하',
            children: [
              { label: '출하조회', to: '/sales/shipment-inquiry' },
            ],
          },
          { label: '특별단가등록', to: '/sales/special-price' },
        ],
      },
      {
        // 원본 구매관리도 묶음이다(발주요청·발주계획·단가요청·발주서·구매·구매일괄회계반영).
        label: '구매관리',
        nodes: [
          { label: '발주요청', children: [{ label: '발주요청조회', to: '/sales/purchase-requests' }, { label: '발주요청현황', to: '/sales/purchase-request-status' }] },
          { label: '발주계획', children: [{ label: '발주계획조회', to: '/sales/purchase-plans' }, { label: '발주계획현황', to: '/sales/purchase-plan-status' }] },
          {
            label: '단가요청',
            children: [
              { label: '단가요청조회', to: '/sales/price-requests' },
              { label: '단가요청현황', to: '/sales/price-request-status' },
              { label: '단가요청진행단계', to: '/sales/price-request-progress' },
            ],
          },
          {
            label: '발주서',
            children: [
              { label: '발주서', to: '/sales/purchase-orders' },
              { label: '발주서현황', to: '/sales/purchase-order-status' },
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
          // 원본은 이 넷을 '구매' 묶음 밖, 구매관리 바로 아래에 둔다(출력물 쪽에도 같은 메뉴가 또 있다).
          { label: '지급현황', to: '/sales/payment' },
          { label: '구매할인현황', to: '/sales/purchase-discount' },
          { label: '회계미반영현황 (구매)', to: '/sales/accounting-reflection?kind=purchase&view=unposted' },
          { label: '거래처별채무', to: '/sales/ledger-payable' },
          { label: '구매일괄회계반영', children: [{ label: '회계반영/미반영', to: '/sales/accounting-reflection?kind=purchase&view=batch' }] },
        ],
      },
      {
        label: '생산/외주',
        nodes: [
          { label: 'BOM(소요량)조회', to: '/production/bom' },
          /* 원본 BOM(소요량) 묶음: BOM(소요량)조회 · BOM(소요량)현황 · 소요량계산(2026-10-02 loginaa 실측). */
          { label: 'BOM(소요량)현황', to: '/production/bom-status' },
          { label: '소요량계산', to: '/production/requirement-calc' },
          { label: '공정등록', to: '/production/process' },
          { label: '자원등록', to: '/production/resource' },
          { label: 'BOR(작업소요시간)', to: '/production/bor' },
          { label: '소요시간계산', to: '/production/time-calc' },
          /* 원본 차례: BOM(소요량) · 공정 · 생산계획/MRP생성 · 작업지시서 … (2026-10-02 loginaa 좌측 메뉴 실측). */
          { label: '생산계획/MRP생성', to: '/production/mrp' },
          { label: '작업지시서조회', to: '/production/work-orders' },
          { label: '작업지시서입력', to: '/production/work-order-entry' },
          { label: '작업지시서현황', to: '/production/wo-status' },
          { label: '작업지시서작업처리', to: '/production/wo-work' },
          { label: '작업지시서별진행현황', to: '/production/wo-progress' },
          { label: '작업지시서효율현황', to: '/production/wo-efficiency' },
          { label: '생산불출조회', to: '/production/issue' },
          { label: '생산불출현황', to: '/production/issue-status' },
          { label: '작업내역입력', to: '/production/work-result' },
          { label: '작업내역조회', to: '/production/work-result-list' },
          { label: '작업내역현황', to: '/production/work-result-status' },
          { label: '생산입고 I', to: '/production/receipt-bom' },
          { label: '생산입고 II', to: '/production/receipt-manual' },
          { label: '생산입고 III', to: '/production/receipt-qr' },
          { label: '생산입고조회', to: '/production/receipt-inquiry' },
          { label: '생산입고현황', to: '/production/receipt-status' },
          /*
           * 원본 생산/외주 탭 실측(사본 좌측 메뉴): … 생산입고/소모현황 I ·
           * <b>지급현황 · 외주비할인현황 · 거래처별채무 · 외주비회계반영</b>.
           *
           * <p>외주는 남에게 맡겨 만드는 것이라 <b>사고 나서 돈을 주는</b> 흐름이 따라붙는다.
           * 그 셋이 우리에겐 구매관리·출력물 탭에만 있어서, 외주를 보다가 "얼마 줬나" 를
           * 보려면 탭을 옮겨야 했다. 원본처럼 여기에도 둔다.
           *
           * <p>[외주비일괄회계반영]은 2026-10-02 에 만들었다(loginaa 실측) — 생산입고 I·II 의
           * 외주비합계·부가세를 외주처별 매입전표로 넘긴다.
           */
          /* 원본 차례(2026-10-02 실측): … 생산입고현황 · [외주비회계반영] 외주비일괄회계반영 · [생산/외주현황] 생산입고/소모현황 I ·
             거래처별채무 · 지급현황 · 외주비할인현황 · 매입(세금)계산서현황(재고). */
          { label: '외주비일괄회계반영', to: '/production/subcontract-reflection' },
          { label: '생산입고/소모현황 I', to: '/production/receipt-issue-status' },
          { label: '거래처별채무', to: '/sales/ledger-payable' },
          { label: '지급현황', to: '/sales/payment' },
          { label: '외주비할인현황', to: '/sales/outsourcing-discount' },
          { label: '매입(세금)계산서조회(재고)', to: '/production/purchase-tax-list' },
          { label: '매입(세금)계산서현황(재고)', to: '/production/purchase-tax-status' },
        ],
      },
      { label: '기타이동', nodes: [{ label: '기타이동', to: '/inventory/transfer' }, { label: '재고실사', to: '/inventory/stocktake' }, { label: '재고실사조회', to: '/inventory/stocktake-list' }, { label: '단계별재고조정', to: '/inventory/staged-adjustment' }, { label: '재고조정진행단계', to: '/inventory/staged-progress' }] },
      { label: '쇼핑몰관리', nodes: [{ label: '쇼핑몰등록', to: '/sales/mall-accounts' }, { label: '쇼핑몰관리', to: '/sales/mall' }, { label: '쇼핑몰품목코드연결', to: '/sales/mall-item-mappings' }] },
      {
        // 원본 출력물 탭은 커뮤니케이션센터·증빙센터 + 재고현황·영업관리현황·구매관리현황 묶음이다.
        // 우리가 영업관리·구매관리·재고관리에 흩어 두었던 '현황' 화면들이 원본에서는 전부 여기 모인다.
        label: '출력물',
        nodes: [
          { label: '증빙센터', to: '/accounting/evidence-center' },
          {
            label: '재고현황',
            children: [
              { label: '재고현황', to: '/inventory/current' },
              { label: '창고별재고현황', to: '/inventory/warehouse-stock' },
              { label: 'BOM환산재고현황', to: '/inventory/bom-stock' },
              { label: '입출고', to: '/inventory/stock-io' },
              { label: '재고잔량분석표', to: '/inventory/stock-analysis' },
              { label: '재고수불부', to: '/inventory/ledger' },
              { label: '재고변동표', to: '/inventory/movement' },
              { label: '잔량재집계', to: '/inventory/recalc' },
              { label: '일보', to: '/inventory/daily-report' },
            ],
          },
          {
            label: '영업관리현황',
            children: [
              { label: '판매현황', to: '/sales/sales-status' },
              { label: '견적서현황', to: '/sales/quotations' },
              { label: '주문서현황', to: '/sales/order-status' },
              { label: '출하지시서현황', to: '/sales/shipment-order-status' },
              { label: '출하현황', to: '/sales/shipment' },
              { label: '거래명세서인쇄', to: '/sales/statement' },
              { label: '미주문현황', to: '/sales/unordered' },
              { label: '미판매현황', to: '/sales/unsold' },
              { label: '미출하현황', to: '/sales/unshipped' },
              { label: '매출(세금)계산서조회(재고)', to: '/sales/sales-tax-list' },
              { label: '매출(세금)계산서현황(재고)', to: '/sales/sales-tax-status' },
              { label: '거래처별채권', to: '/sales/ledger-receivable' },
              { label: '채권현황', to: '/sales/receivable-status' },
              { label: '거래처관리대장1(채권)', to: '/sales/partner-ledger-receivable' },
              { label: '수금현황', to: '/sales/collection' },
              { label: '판매할인현황', to: '/sales/sales-discount' },
              { label: '회계미반영현황 (판매)', to: '/sales/accounting-reflection?kind=sales&view=unposted' },
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
              { label: '미지급현황', to: '/sales/payable' },
              { label: '구매할인현황', to: '/sales/purchase-discount' },
              { label: '회계미반영현황 (구매)', to: '/sales/accounting-reflection?kind=purchase&view=unposted' },
              { label: '외주비할인현황', to: '/sales/outsourcing-discount' },
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
              { label: '창고이동현황', to: '/inventory/transfer-status' },
              { label: '자가사용조회', to: '/inventory/self-use' },
              { label: '자가사용현황', to: '/inventory/self-use-status' },
              { label: '불량처리조회', to: '/inventory/defect' },
              { label: '불량처리현황', to: '/inventory/defect-status' },
              { label: '대체사용현황', to: '/inventory/substitute-status' },
              { label: '폐기현황', to: '/inventory/disposal-status' },
              { label: '불량률파악보고서', to: '/quality/defect-report' },
              { label: '재고실사현황', to: '/inventory/stocktake-status' },
              { label: '재고조정조회', to: '/inventory/adjust-list' },
              { label: '재고조정현황', to: '/inventory/adjust-status' },
            ],
          },
          {
            label: '기타',
            children: [
              { label: '일별재고현황', to: '/inventory/daily-stock' },
              { label: '거래이력조회', to: '/sales/trade-history' },
              { label: '판매구매집계표', to: '/sales/sales-purchase-summary' },
              { label: '단가변동표', to: '/sales/price-movement' },
              { label: '현황누계표', to: '/sales/monthly-cumulative' },
              { label: '집계표', to: '/sales/pivot-summary' },
              { label: '거래처관리대장', to: '/sales/partner-ledger' },
              { label: '출력물', to: '/inventory/reports' },
              { label: '경영자보고서', to: '/inventory/executive-report' },
            ],
          },
        ],
      },
    ],
  },
  {
    label: '재고 II',
    tabs: [
      { label: 'A/S관리', nodes: [{ label: 'A/S관리', to: '/quality/as' }, { label: 'A/S현황', to: '/quality/as-status' }, { label: 'A/S수리조회', to: '/quality/as-repair-list' }, { label: 'A/S수리현황', to: '/quality/as-repair-status' }, { label: 'A/S소모현황', to: '/quality/as-consumption' }] },
      { label: '시리얼/로트No.', nodes: [{ label: '시리얼/로트No.', to: '/quality/serial-lot' }, { label: '시리얼/로트No.재고현황', to: '/quality/lot-stock' }, { label: '시리얼/로트No.내역조회', to: '/quality/lot-tx-list' }, { label: '시리얼/로트No.내역현황', to: '/quality/lot-tx-status' }, { label: '로트 수불부', to: '/quality/lot-ledger' }, { label: '품목vs시리얼재고비교', to: '/quality/lot-compare' }] },
      { label: '품질관리', nodes: [{ label: '품질검사요청', to: '/quality/inspection-request' }, { label: '품질검사요청현황', to: '/quality/request-status' }, { label: '미검사현황', to: '/quality/uninspected' }, { label: '품질관리', to: '/quality/inspection' }, { label: '품질검사현황', to: '/quality/inspection-status' }, { label: '불량률파악보고서', to: '/quality/defect-report' }] },
      {
        label: '계획관리',
        nodes: [
          { label: '매출계획', to: '/sales/sales-plan' },
          { label: '생산계획(MPS)', to: '/production/planning' },
          /* 원본 생산/외주 탭의 표기는 [생산계획/MRP생성] 이다(사본 좌측 메뉴 실측). */
          { label: '생산계획/MRP생성', to: '/production/mrp' },
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
        ],
      },
      {
        label: '오더관리',
        nodes: [
          { label: '오더관리(수주)', to: '/sales/orders' },
          /* 원본 오더관리 탭의 표기는 [오더관리유형등록] 이다(사본 좌측 메뉴 실측). */
          { label: '오더관리유형등록', to: '/sales/order-types' },
          { label: '오더관리진행단계', to: '/sales/order-stages' },
        ],
      },
      { label: '수출관리', nodes: [{ label: 'Invoice / Packing List', to: '/sales/export' }] },
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
          { label: '카드사등록', to: '/accounting/card-issuers' },
          { label: '결제대행사등록', to: '/accounting/payment-agencies' },
          { label: '외화등록', to: '/settings/currencies' },
        ],
      },
      {
        label: 'FastEntry',
        nodes: [
          { label: '일반전표입력', to: '/accounting/journal-entry' },
          { label: '현금예금입금', to: '/accounting/cash-deposit' },
          { label: '현금예금출금', to: '/accounting/cash-withdraw' },
          { label: '계좌간이동·카드대금결제', to: '/accounting/cash-details' },
          { label: '지출결의서', to: '/accounting/vouchers' },
          { label: '입금보고서', to: '/accounting/vouchers?type=DEPOSIT_REPORT' },
          { label: '가지급금정산서', to: '/accounting/vouchers?type=ADVANCE_SETTLEMENT' },
          { label: '비현금거래(대체전표)', to: '/accounting/non-cash' },
        ],
      },
      {
        label: '어음거래',
        nodes: [
          { label: '어음등록(수취/발행)', to: '/accounting/notes' },
          /* 원본 어음거래 > 받을어음 · 지급어음 끝의 현황 둘(E010626 · E010634). 예전엔 [어음현황]이 어음등록을 한 번 더 가리켰다. */
          { label: '받을어음조회', to: '/accounting/notes-list' },
          { label: '받을어음거래내역', to: '/accounting/notes-ledger' },
          { label: '받을어음증가현황', to: '/accounting/notes-in' },
          { label: '받을어음감소현황', to: '/accounting/notes-out' },
          { label: '보유어음현황', to: '/accounting/notes-held' },
          { label: '지급어음조회', to: '/accounting/notes-pay-list' },
          { label: '지급어음거래내역', to: '/accounting/notes-pay-ledger' },
          { label: '지급어음증가현황', to: '/accounting/notes-pay-in' },
          { label: '지급어음감소현황', to: '/accounting/notes-pay-out' },
          { label: '미지급어음현황', to: '/accounting/notes-unpaid' },
        ],
      },
      {
        label: '고정자산',
        nodes: [{ label: '고정자산·감가상각', to: '/accounting/fixed-assets' }, { label: '고정자산대장', to: '/accounting/fixed-asset-ledger' }, { label: '고정자산증가내역', to: '/accounting/fixed-asset-in' }, { label: '고정자산감소내역', to: '/accounting/fixed-asset-out' }, { label: '고정자산증감대장', to: '/accounting/fixed-asset-movement' }, { label: '고정자산수불부', to: '/accounting/fixed-asset-stock' }, { label: '고정자산전표조회', to: '/accounting/fixed-asset-slips' }],
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
          { label: '증빙센터', to: '/accounting/evidence-center' },
        ],
      },
      {
        label: '출력물',
        nodes: [
          {
            label: '장부',
            children: [
              { label: '현금출납장', to: '/accounting/cash-book' },
              { label: '분개장', to: '/accounting/journal-book' },
              { label: '일/월계표', to: '/accounting/day-month-sheet' },
              { label: '계정별원장', to: '/accounting/ledger-book' },
              { label: '계정별거래처별원장', to: '/accounting/account-partner-ledger' },
              { label: '거래처별계정별원장', to: '/accounting/partner-account-ledger' },
              { label: '계정별적요별원장', to: '/accounting/account-remark-ledger' },
              { label: '계정증감내역', to: '/accounting/account-flow' },
              { label: '매입/매출장', to: '/accounting/vat-book' },
              { label: '거래처거래내역조회', to: '/accounting/partner-tx-list' },
              { label: '합계잔액시산표', to: '/accounting/trial-balance' },
              { label: '원가명세서', to: '/accounting/cost-statement' },
              { label: '계정명세서', to: '/accounting/account-detail' },
              { label: '회계거래현황', to: '/accounting/journal-status' },
              { label: '매출(세금)계산서현황', to: '/accounting/sales-tax-journal' },
              { label: '매입(세금)계산서현황', to: '/accounting/purchase-tax-journal' },
              { label: '거래이력조회(회계)', to: '/accounting/journal-history' },
              { label: '지출결의서이체리스트', to: '/accounting/transfer-list' },
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
          { label: '채권/채무현황(기준일자)', to: '/sales/ar-ap-status' },
          { label: '채권현황', to: '/sales/receivable-status' },
          { label: '거래처관리대장', to: '/sales/partner-ledger' },
        ],
      },
      {
        label: '수표관리',
        nodes: [
          { label: '수표관리(받은수표·발행수표)', to: '/accounting/checks' },
          /* 원본 회계 II > 수표관리 > 수령수표의 현황(E060604). */
          { label: '수령수표조회', to: '/accounting/checks-list' },
          { label: '수령수표거래내역', to: '/accounting/checks-ledger' },
          { label: '수령수표현황', to: '/accounting/checks-held' },
          { label: '수령수표증가현황', to: '/accounting/checks-in' },
          { label: '수령수표감소현황', to: '/accounting/checks-out' },
          { label: '발행수표조회', to: '/accounting/checks-issued-list' },
          { label: '발행수표거래내역', to: '/accounting/checks-issued-ledger' },
          { label: '발행수표현황', to: '/accounting/checks-issued' },
          { label: '발행수표증가현황', to: '/accounting/checks-issued-in' },
          { label: '발행수표감소현황', to: '/accounting/checks-issued-out' },
        ],
      },
      {
        label: '계약관리',
        nodes: [
          { label: '계약관리·전자계약', to: '/accounting/contracts' },
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
        label: '수입비용',
        nodes: [{ label: '수입등록·수입비용현황', to: '/accounting/income' }],
      },
      {
        label: '프로젝트',
        nodes: [
          { label: '프로젝트별 손익', to: '/accounting/project-profit' },
          { label: '프로젝트계획', to: '/accounting/project-plan' },
          { label: '프로젝트등록', to: '/groupware/project' },
        ],
      },
      {
        label: '비용관리',
        nodes: [
          { label: '기본사항등록', children: [{ label: '비용등록', to: '/accounting/expense' }] },
          { label: '비용내역', children: [{ label: '비용내역조회', to: '/accounting/expense-list' }] },
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
          { label: '기본사항등록', children: [
            { label: '사원등록', to: '/hr/employees' },
            { label: '수당항목등록', to: '/hr/allowance-items' },
            { label: '공제항목등록', to: '/hr/deduction-items' },
            { label: '수당/공제그룹등록', to: '/hr/pay-groups' },
            { label: '부서등록', to: '/hr/departments' },
            { label: '프로젝트등록', to: '/inventory/projects' },
            // 원본 인쇄용결재라인등록(관리) E090102 — 회계 · 재고 · 관리 알약 중 [관리]. 우리 결재란 화면은 모듈별이 아니다(보드).
            { label: '인쇄용결재라인등록(관리)', to: '/settings/print-sign' },
            { label: '담당자별 실적', to: '/hr/performance' },
          ] },
          { label: '근무기록', children: [
            { label: '근무입력', to: '/hr/work-input' },
            { label: '근무조회', to: '/hr/work-list' },
          ] },
          { label: '급여작업', children: [{ label: '급여계산/대장', to: '/hr/payroll' }, { label: '사원별급여조회', to: '/hr/payroll/by-employee' }, { label: '급여현황', to: '/hr/payroll/status' }, { label: '근무확정현황', to: '/hr/payroll/work-confirms' }, { label: '급여이체현황', to: '/hr/payroll/transfer-status' }, { label: '수당·공제그룹/급여이체', to: '/hr/pay-settings' }] },
        ],
      },
      {
        label: '인사관리',
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
        nodes: [
          { label: '일용근로 기본사항 등록', children: [
            { label: '일용근로 사원등록', to: '/hr/daily-workers' },
            { label: '프로젝트등록', to: '/inventory/projects' },
          ] },
          { label: '일용근로 근무기록', children: [
            { label: '일용근로 근무입력', to: '/hr/daily-work-input' },
            { label: '일용근로 근무조회', to: '/hr/daily-work-list' },
          ] },
          { label: '일용근로 급여작업', children: [{ label: '일용근로 출역/급여대장', to: '/hr/daily-wage' }] },
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
              { label: '근태입력', to: '/hr/leave-input' },
              { label: '근태조회', to: '/hr/leave-list' },
              { label: '근태현황', to: '/hr/attendance-kind-status' },
              { label: '지각현황', to: '/hr/attendance-late' },
              { label: '일별근무시간', to: '/hr/daily-hours' },
              { label: '출퇴근/근태/일정 통합현황', to: '/hr/work-integrated' },
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
          { label: '원천징수이행상황신고서확인', to: '/accounting/withholding/confirm' },
          { label: '원천징수부', to: '/accounting/withholding/ledger' },
          { label: '소득세확인서', to: '/accounting/withholding/income-tax-cert' },
          { label: '근로소득원천징수영수증', to: '/accounting/withholding?tab=영수증' },
          { label: '퇴직정산', children: [
            { label: '퇴사자리스트', to: '/hr/retired' },
            { label: '퇴직금계산', to: '/hr/retirement-pay' },
          ] },
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
          // 순서·묶음은 원본 공유정보 메뉴 트리 그대로다.
          // 사원연락처·조직도현황·외근현황은 예전에 원본도 '권한없음'이라 빼 두었는데 2026-10-03 원본이 열려 실측해 넣었다.
          { label: '주요전달사항', to: '/groupware/key-notice' },
          { label: '게시판', children: [
            { label: '공지사항', to: '/groupware/notice' },
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
        nodes: [
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
          // 원본 그룹웨어의 출/퇴근 묶음은 다섯 개다. 우리 화면은 관리 > 근태관리에 있어서
          // 새로 만들지 않고 같은 화면을 가리킨다.
          {
            label: '출/퇴근',
            children: [
              { label: '출/퇴근기록부(ID)', to: '/groupware/attendance' },
              { label: '출/퇴근입력', to: '/hr/attendance-input' },
              { label: '출/퇴근조회', to: '/hr/attendance-list' },
              { label: '출/퇴근현황(ID)', to: '/hr/attendance-status' },
              { label: '지각현황(ID)', to: '/hr/attendance-late' },
              { label: '일별근무시간(ID)', to: '/hr/daily-hours' },
              { label: '출퇴근/근태/일정현황(ID)', to: '/hr/work-integrated' },
            ],
          },
        ],
      },
      {
        label: '고객관리',
        nodes: [
          // 원본 순서·묶음 그대로. '고객관리게시판'은 묶음이고 그 안에 게시판이 둘 있다
          // (영업활동관리·상담이력관리). 상담이력관리는 원본에서도 권한없음이라 근거가 없어 넣지 않았다.
          { label: '거래처등록', to: '/sales/partners' },
          { label: '명함관리', to: '/groupware/cards' },
          {
            label: '고객관리게시판',
            children: [
              { label: '영업활동관리', to: '/groupware/crm' },
            ],
          },
          { label: '거래처중심입력', to: '/sales/partner-entry' },
          { label: '품목중심입력', to: '/sales/item-entry' },
        ],
      },
      {
        // 원본 프로젝트 탭은 묶음 없이 두 개다. '프로젝트' 항목은 여기에 없다
        // (프로젝트 등록은 회계 II > 프로젝트에 있다).
        label: '프로젝트',
        nodes: [
          { label: '건설예정공정표', to: '/groupware/construction-schedule' },
          { label: 'SW개발일정관리', to: '/groupware/dev-schedule' },
        ],
      },
      {
        label: '공용메일',
        nodes: [
          { label: '메일함(사내·공용)', to: '/groupware/mail' },
          { label: '쪽지(수발신내역)', to: '/groupware/messages' },
          { label: '커뮤니케이션센터', to: '/groupware/messages' },
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

/*
 * 우측 세로 앱바 아이콘. 이름은 <b>원본 그대로</b> 쓴다(사본 172장 전부의 상단바에 있다).
 * to 면 라우트 이동, print 면 화면 인쇄, newWindow 면 지금 화면을 새 창으로, 나머지는 안내.
 *
 * <p>다크모드로보기·업무지원AI·원격지원은 아직 안내만 띄운다.
 * 다크모드는 색이 화면마다 인라인으로 박혀 있어(토큰 사용 1,069곳 vs 하드코딩 4,716곳)
 * 토큰만 바꾸면 <b>절반만 어두워진다.</b> 흰 배경에 흰 글씨가 되는 화면이 생기느니
 * 안내를 띄우는 편이 낫다. 색을 토큰으로 모으는 것이 먼저다.
 */
interface AppIcon { icon: string; title: string; to?: string; print?: boolean; newWindow?: boolean; panel?: PanelKind }
const APPS: AppIcon[] = [
  { icon: '🌙', title: '다크모드로보기' },
  { icon: '🤖', title: '업무지원AI' },
  { icon: '🔍', title: '통합검색', panel: 'search' },
  { icon: '🎧', title: '원격지원' },
  { icon: '➕', title: '빠른등록' },
  { icon: '📄', title: 'ECDrive 문서', to: '/groupware/drive' },
  { icon: '🔔', title: '알림', panel: 'notifications' },
  { icon: '💬', title: '메신저', panel: 'messenger' },
  /*
   * 원본 앱바의 [쪽지]. 우리는 아이콘만 두고 <b>아무 데도 안 갔다</b> — 눌러도 아무 일이
   * 없는 아이콘은 고장으로 읽힌다. 쪽지 화면은 진작 있다(그룹웨어 > 쪽지(수발신내역)).
   */
  { icon: '📨', title: '쪽지', to: '/groupware/messages' },
  { icon: '📝', title: 'E Note', panel: 'notes' },
  { icon: '🖨️', title: '화면 인쇄', print: true },
  { icon: '🗗', title: '새창열기', newWindow: true },
  { icon: '📊', title: '데이터 내보내기', to: '/datacenter/export' },
  { icon: '🕒', title: '타임라인' },
  { icon: '📌', title: '화면 고정' },
  { icon: '⚙️', title: '환경설정', to: '/settings/preferences' },
]

const tabLeaves = (tab: Tab): Leaf[] => tab.nodes.flatMap((n) => (isGroup(n) ? n.children : [n]))

/** 경로가 메뉴 항목에 해당하면 그 항목의 길이(구체성)를, 아니면 0을 돌려준다.
 *  세그먼트 경계로 끊어야 '/'가 모든 경로를, '/sales/pay'가 '/sales/payment'를 삼키지 않는다. */
function matchLength(to: string, pathname: string): number {
  if (to === '/') return pathname === '/' ? 1 : 0
  return pathname === to || pathname.startsWith(`${to}/`) ? to.length : 0
}

/**
 * 현재 경로를 담은 [대메뉴, 탭] 인덱스. 가장 구체적으로 일치하는 리프를 고른다.
 *
 * <p>MyPage 업무 폴더는 다른 모듈의 화면을 그대로 담는다(원본 예시1~4). 그래서 한 경로가 두 메뉴에 걸린다 —
 * 메뉴를 눌러 왔으면 <b>누른 그 자리</b>(pin)를 지키고, 주소로 바로 왔으면 MyPage 가 아니라 제 모듈을 고른다.
 * MyPage 가 MENU 맨 앞이라 '먼저 걸린 것' 으로 두면 판매입력을 재고 I 에서 열어도 MyPage 가 켜진다.
 */
function resolveActive(pathname: string, pin?: [number, number] | null): [number, number] {
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
  const [appNotice, setAppNotice] = useState('')                // 앱바 안내 토스트
  const [panel, setPanel] = useState<PanelKind | null>(null)    // 앱바에서 연 패널
  const [alertCount, setAlertCount] = useState(0)               // 알림 배지
  const [chatCount, setChatCount] = useState(0)                 // 메신저 미읽음 배지
  const [noteCount, setNoteCount] = useState(0)                 // 쪽지 안 읽은 수
  const [userOpen, setUserOpen] = useState(false)               // 사용자 동그라미 → 이름·로그아웃
  // 휴대폰·태블릿(≤768px, 원본 실측) — ☰ 메뉴판과 ★ 즐겨찾기 · 앱 모음 펼침
  const [drawer, setDrawer] = useState<{ top: number; tab: number } | null>(null)
  const [mPanel, setMPanel] = useState<'fav' | 'apps' | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)               // 본문 영역(표 우클릭 메뉴가 감시)

  // 알림 배지 건수. 패널을 닫을 때(처리했을 수 있으므로) 다시 센다.
  useEffect(() => {
    api.get<NotificationResponse>('/workspace/notifications')
      .then((r) => setAlertCount(r.data.total))
      .catch(() => setAlertCount(0))
  }, [panel])

  // 메신저 미읽음. 패널을 열지 않아도 새 메시지를 알아야 하므로 주기적으로 센다.
  // 패널이 열려 있을 때는 패널 자신이 폴링하므로 여기서는 닫힌 동안만 돈다.
  useEffect(() => {
    const count = () => api.get<{ unread: number }>('/chat/unread-count')
      .then((r) => setChatCount(r.data.unread))
      .catch(() => setChatCount(0))
    count()
    if (panel === 'messenger') return
    const t = window.setInterval(count, 30000)
    return () => window.clearInterval(t)
  }, [panel])

  /*
   * 쪽지 안 읽은 수. 서버가 세어 주는데(/short-messages/unread-count) 아무도 안 물어봐서
   * <b>새 쪽지가 와도 아이콘이 그대로였다.</b> 메신저와 같은 주기로 센다.
   */
  useEffect(() => {
    const count = () => api.get<{ unread: number }>('/short-messages/unread-count')
      .then((r) => setNoteCount(r.data.unread))
      .catch(() => setNoteCount(0))
    count()
    const t = window.setInterval(count, 30000)
    return () => window.clearInterval(t)
  }, [location.pathname])

  /* 화면 안의 버튼(근태조회 [메신저]·설문조사조회 [대화방])이 <b>같은 창을</b> 열어 달라고 알린다. */
  useEffect(() => {
    const open = (e: Event) => setPanel((e as CustomEvent<PanelKind>).detail)
    window.addEventListener('ec:open-panel', open)
    return () => window.removeEventListener('ec:open-panel', open)
  }, [])

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

  const menuPin = (location.state as { menuPin?: [number, number] } | null)?.menuPin
  const [topIdx, tabIdx] = useMemo(() => resolveActive(location.pathname, menuPin), [location.pathname, menuPin])
  const activeTop = MENU[topIdx]
  const activeTab = activeTop.tabs[tabIdx]

  // 권한에 따른 메뉴 노출 판정. 리프는 라우트 권한으로, 상위는 하위가 하나라도 보이면 보인다.
  // 회사관리(/companies)는 본사에서만 노출한다.
  const leafOk = (l: Leaf) =>
    (l.to === '/companies' ? isHost : true) && (!l.to || canRoute(l.to))
  const nodeOk = (n: SideNode) => (isGroup(n) ? n.children.some(leafOk) : leafOk(n))
  const tabOk = (t: Tab) => t.nodes.some(nodeOk)
  const topOk = (m: TopMenu) => m.tabs.some(tabOk)
  // 대메뉴/탭을 클릭했을 때 이동할 "접근 가능한" 첫 라우트 (권한 없는 첫 화면으로 튀지 않게)
  const firstAllowedTabRoute = (t: Tab) => tabLeaves(t).find((l) => l.to && canRoute(l.to))?.to

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
    else alert(`[${leaf.label}] 메뉴는 준비 중입니다.`)
  }

  // 앱바 아이콘 클릭: 라우트가 있으면 이동, 인쇄면 화면 인쇄, 나머지는 안내
  function onApp(app: AppIcon) {
    if (app.panel) return setPanel(app.panel)
    if (app.to) return navigate(app.to)
    if (app.print) return window.print()
    // 원본 [새창열기] — 지금 화면을 그대로 새 창에. 두 화면을 나란히 놓고 보라는 것이다.
    if (app.newWindow) {
      window.open(window.location.href, '_blank', 'noopener,noreferrer')
      return
    }
    setAppNotice(`${app.title} 기능은 준비 중입니다.`)
    window.setTimeout(() => setAppNotice(''), 2200)
  }

  // 2단 메뉴 — 머리 메뉴 아래 떠 있는 흰 알약 판(styles/shell.css .ec-subnav)
  function subnav(menu: TopMenu, activeTabIdx: number | null) {
    if (menu.tabs.length < 2) return null
    return (
      <ul className="ec-subnav">
        {menu.tabs.map((tab, i) => {
          if (!tabOk(tab)) return null
          return (
            <li key={tab.label}>
              <button
                className={`ec-subnav-item${i === activeTabIdx ? ' active' : ''}`}
                onClick={() => { const to = firstAllowedTabRoute(tab); if (to) gotoMenu(to, [MENU.indexOf(menu), i]) }}
              >
                {tab.label}
              </button>
            </li>
          )
        })}
      </ul>
    )
  }

  function sidebarLeaf(leaf: Leaf) {
    const on = !!leaf.to && matchLength(leaf.to, location.pathname) > 0
    return (
      <button
        key={leaf.label}
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
    const top = MENU[at.top]
    const tab = top.tabs[at.tab] ?? top.tabs[0]
    return (
      <div className="ec-drawer">
        <div className="ec-drawer-tops">
          {MENU.map((m, idx) => {
            if (!topOk(m)) return null
            const on = idx === at.top
            return (
              <div key={m.label}>
                <button className={`ec-drawer-top${on ? ' active' : ''}`} onClick={() => setDrawer({ top: idx, tab: 0 })}>{m.label}</button>
                {on && m.tabs.length > 1 && (
                  <ul className="ec-drawer-tabs">
                    {m.tabs.map((t, ti) => tabOk(t) && (
                      <li key={t.label}>
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
          {tab.nodes.map((node) => {
            if (!isGroup(node)) return leafOk(node) ? sidebarLeaf(node) : null
            const kids = node.children.filter(leafOk)
            if (kids.length === 0) return null
            // 왼쪽 메뉴와 같은 규칙 — 지금 화면이 든 묶음만 펼치고 칠한다. 접힌 상태도 왼쪽 메뉴와 같이 쓴다.
            const current = kids.some((c) => !!c.to && matchLength(c.to, location.pathname) > 0)
            const key = `${at.top}/${at.tab}/${node.label}`
            const open = key in collapsed ? !collapsed[key] : current
            return (
              <div key={node.label}>
                <button className={`ec-lnb-group${open ? ' open' : ''}${current ? ' current' : ''}`}
                        onClick={() => setCollapsed((c) => ({ ...c, [key]: open }))}>{node.label}</button>
                {open && <div className="ec-lnb-leaves">{kids.map((c) => sidebarLeaf(c))}</div>}
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
      <div className="ec-bookbar">
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
        <Link to="/" className="ec-logo"><b>제조</b><span className="tail">ERP</span></Link>
        {/* 휴대폰·태블릿에서만 — ☰ 메뉴판, ★ 즐겨찾기 */}
        <button className="ec-m-btn ec-m-menu" aria-label="메뉴" onClick={() => { setMPanel(null); setDrawer((d) => (d ? null : { top: topIdx, tab: tabIdx })) }}>☰</button>
        <button className="ec-m-btn ec-m-fav" aria-label="즐겨찾기" onClick={() => { setDrawer(null); setMPanel((p) => (p === 'fav' ? null : 'fav')) }}>★</button>
        <ul className="ec-gnb-menu">
          {MENU.map((m, idx) => {
            if (!topOk(m)) return null
            return (
              <li key={m.label} onMouseEnter={() => setHoverIdx(idx)}>
                <button
                  className={`ec-gnb-item${idx === topIdx ? ' active' : ''}`}
                  onClick={() => {
                    const ti = m.tabs.findIndex((t) => !!firstAllowedTabRoute(t))
                    const to = ti >= 0 ? firstAllowedTabRoute(m.tabs[ti]) : undefined
                    if (to) gotoMenu(to, [idx, ti])
                  }}
                >
                  {m.label}
                </button>
              </li>
            )
          })}
        </ul>
        {/* 다른 대메뉴에 마우스를 올리면 그 메뉴의 2단을, 아니면 지금 메뉴의 2단을 띄운다 */}
        {hoverIdx !== null && hoverIdx !== topIdx ? subnav(MENU[hoverIdx], null) : subnav(activeTop, tabIdx)}

        <div className="ec-gnb-right">
          {companyName && <span className="ec-company">{companyName}</span>}
          <button className="ec-m-apps" aria-label="앱 모음" onClick={() => { setDrawer(null); setMPanel((p) => (p === 'apps' ? null : 'apps')) }}>⋮⋮</button>
          <button className="ec-avatar" title={user?.name} onClick={() => setUserOpen((o) => !o)}>👤</button>
          {userOpen && (
            <div className="ec-popover" onMouseLeave={() => setUserOpen(false)}>
              <div className="font-bold text-ec-text">{user?.name}</div>
              <div className="text-[11px] text-ec-hint mb-[8px]">{user?.roles.join(', ')}</div>
              <button className="ec-btn" onClick={logout} style={{ width: '100%', justifyContent: 'center' }}>로그아웃</button>
            </div>
          )}
        </div>
      </div>

      {drawer && mobileDrawer(drawer)}
      {mPanel === 'fav' && (
        <div className="ec-m-panel">
          {bookmarks.length === 0 && <div className="text-ec-hint p-[9px]">★ 자주 사용하는 메뉴를 즐겨찾기로 추가할 수 있습니다</div>}
          {bookmarks.map((b, i) => (
            <NavLink key={b.path + i} to={b.path} className={({ isActive }) => `ec-lnb-leaf${isActive ? ' active' : ''}`}>{b.label}</NavLink>
          ))}
          {currentLeaf && (
            <button className="ec-btn mt-[6px] w-full justify-center" onClick={toggleBookmark}>
              {bookmarked ? '★ 이 화면을 즐겨찾기에서 빼기' : '☆ 이 화면을 즐겨찾기에 담기'}
            </button>
          )}
        </div>
      )}
      {mPanel === 'apps' && (
        <div className="ec-m-panel ec-m-apps-grid">
          {APPS.map((a, i) => (
            <button key={i} className="ec-appbar-btn" title={a.title} onClick={() => { setMPanel(null); onApp(a) }}>
              {a.icon}<span>{a.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* ===== 왼쪽 메뉴 + 본문 틀 + 오른쪽 앱바 ===== */}
      <div className="ec-body">
        {showLnb && (
          <aside className="ec-lnb">
            {activeTab.nodes.map((node) => {
              if (!isGroup(node)) return leafOk(node) ? sidebarLeaf(node) : null
              const visibleChildren = node.children.filter(leafOk)
              if (visibleChildren.length === 0) return null
              const key = `${topIdx}/${tabIdx}/${node.label}`
              // 원본처럼 지금 화면이 든 묶음만 칠하고 기본으로 펼친다. 나머지는 접혀 있다가 누르면 펼친다.
              const current = visibleChildren.some((c) => !!c.to && matchLength(c.to, location.pathname) > 0)
              const open = key in collapsed ? !collapsed[key] : current
              return (
                <div key={node.label}>
                  <button
                    className={`ec-lnb-group${open ? ' open' : ''}${current ? ' current' : ''}`}
                    onClick={() => setCollapsed((c) => ({ ...c, [key]: open }))}
                  >
                    {node.label}
                  </button>
                  {open && <div className="ec-lnb-leaves">{visibleChildren.map((c) => sidebarLeaf(c))}</div>}
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
            <Outlet />
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

        {/* 오른쪽 세로 앱바 */}
        <div className="ec-appbar">
          {APPS.map((a, i) => (
            <button key={i} className="ec-appbar-btn" title={a.title} onClick={() => onApp(a)}>
              {a.icon}
              {((a.panel === 'notifications' && alertCount > 0)
                || (a.panel === 'messenger' && chatCount > 0)
                || (a.title === '쪽지' && noteCount > 0)) && (
                <span className="ec-appbar-badge">{a.panel === 'messenger' ? (chatCount > 99 ? '99+' : chatCount)
                  : a.title === '쪽지' ? (noteCount > 99 ? '99+' : noteCount)
                    : alertCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 앱바 패널: 통합검색 · 알림 · E Note */}
      {panel && <AppBarPanel kind={panel} onClose={() => setPanel(null)} />}

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
            <div className="py-[12px] px-[16px] border-b border-b-ec-line-soft border-solid flex items-center">
              <span className="font-extrabold text-[15px] text-ec-text">사이트맵 · 전체 메뉴</span>
              <button className="ec-btn" style={{ marginLeft: 'auto' }} onClick={() => setSitemapOpen(false)}>닫기</button>
            </div>

            <div className="flex min-h-[380px]">
              {/* 좌측 대메뉴 레일 */}
              <div className="w-[168px] shrink-0 border-r border-r-ec-line-soft border-solid py-[8px] px-0 bg-ec-page">
                {MENU.map((m, i) => (
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
                {MENU[sitemapIdx].tabs.map((tab) => (
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
