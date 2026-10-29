import CalendarWidget, { DETAIL_ROWS } from './CalendarWidget'
import FlowchartWidget from './FlowchartWidget'
import * as d from './data'
import { APPROVAL_SCOPES } from './data'
import { CONDITIONS, PERIODS, PROGRESS, type ColumnDef, type Icons, type WidgetDef } from './types'

/**
 * My위젯선택 목록 — 원본 묶음 재고(13) · 회계(3) · 공통 · 게시판 차례 그대로(plans/MyPage-위젯.md).
 * 원본에 있으나 뺀 것: 이카운트 시작하기 · 업그레이드내역 · 집체교육 참석신청 — 이카운트 본사가 내려 주는 글이라 우리에 자료가 없다.
 */

const ALL: Icons = { window: true, refresh: true, new: true, setting: true }
const NO_NEW: Icons = { window: true, refresh: true, setting: true }
const P = [...PERIODS]

const c = (key: string, label: string, more: Partial<ColumnDef> = {}): ColumnDef => ({ key, label, ...more })
const n = (key: string, label: string, more: Partial<ColumnDef> = {}): ColumnDef => ({ key, label, num: true, ...more })

/** 종류 → 묶을 열. 월별 · 일별은 일자 열을 잘라 묶는다 */
const LINE_KINDS = ['품목별', '거래처별', '담당자별', '월별', '일별', '라인별']
const lineKindKey = (date: string) => ({ 품목별: 'item', 거래처별: 'partner', 담당자별: 'employee', 수리담당자별: 'employee', 월별: date, 일별: date })
/** 검색조건 → 열. 품목그룹1 은 품목 마스터의 품목그룹(data.ts itemMaster). 품목그룹2 · 3 은 우리 품목에 칸이 없어 걸리지 않는다 */
const FILTER = { 창고: 'warehouse', 품목그룹1: 'itemGroup' }

const progressSelect = { key: 'progress', label: '진행상태', options: PROGRESS }

const productionCols = [c('dateNo', '일자-No.'), c('outWh', '출고창고명'), c('inWh', '입고창고명'), c('item', '품목명[규격명]'), n('qty', '수량'), n('amount', '생산금액'), c('remark', '적요')]

const arCols = (ar: boolean) => [
  c('managerCode', '담당자코드'), c('manager', '담당자코드명'), c('partnerCode', '거래처코드'), c('partner', '거래처명'),
  n('open', ar ? '기초채권' : '기초채무'), n('inc', ar ? '재고매출' : '재고매입'),
  ...(ar ? [] : [n('outsource', '외주비')]),
  n('acc', ar ? '회계매출' : '회계매입'), n('bill', ar ? '수금어음' : '지급어음'), n('cash', ar ? '수금현금' : '지급현금'),
  n('settle', ar ? '수금합계' : '지급합계'), n('diff', '기타할인등차액'), n('balance', '잔액'), n('unbilled', '미청구액'),
]

const boardCols = [
  c('no', '번호', { off: true }),
  c('title', '제목', { cell: (r) => <>{r.notice ? <span className="ec-widget-tag">공지</span> : null}{r.title}</> }),
  c('date', '작성일'), c('writer', '작성자'), c('status', '진행상태', { off: true }), n('views', '조회'), c('attach', '첨부', { off: true }),
]
const board = (id: string, code: string, title: string, to: string): WidgetDef => ({
  id, title, group: '게시판', icons: ALL, to, newTo: to,
  fields: { selects: [{ key: 'mode', label: '구분', options: ['공지글 알림', '게시글리스트'], def: '게시글리스트' }], defaultRows: 6, noSort: true },
  table: { columns: boardCols, fetch: (a) => d.boardRows(code, a), rowClass: (r) => (r.notice ? 'notice' : undefined) },
})

export const REGISTRY: WidgetDef[] = [
  // ── 재고 ──
  {
    id: 'stock', title: '재고현황', group: '재고', icons: NO_NEW, to: '/inventory/current',
    fields: {
      kinds: ['품목별', '안전재고미만품목별'], conditions: CONDITIONS, periods: ['금일', '전일', '직접설정'], defaultPeriod: '금일',
      selects: [{ key: 'rollup', label: '대표품목으로 합산', options: ['*품목관계기준', '개별품목기준'] }], forms: ['재고현황', '기본'], defaultSort: 'itemCode',
    },
    table: {
      columns: [c('itemCode', '품목코드'), c('item', '품명 및 규격'), n('qty', '총재고수량'), n('price', '입고단가'), n('amount', '금액')],
      fetch: d.stockRowsPriced, filterKey: FILTER,
    },
  },
  {
    id: 'sales', title: '판매현황', group: '재고', icons: ALL, to: '/sales/sales-status', newTo: '/sales/sell',
    fields: { kinds: LINE_KINDS, conditions: CONDITIONS, periods: P, defaultSort: 'date', forms: ['기본'] },
    table: {
      columns: [c('date', '일자'), c('item', '품명 및 규격'), n('qty', '수량'), n('price', '단가'), n('supply', '공급가액'), n('vat', '부가세'), n('total', '합 계'), c('partner', '판매처이름'),
        c('itemCode', '품목코드', { off: true }), c('employee', '담당자', { off: true }), c('warehouse', '창고', { off: true }), c('remark', '적요', { off: true })],
      fetch: d.salesRows, kindKey: lineKindKey('date'), filterKey: FILTER,
    },
  },
  {
    id: 'unsold', title: '미판매현황', group: '재고', icons: ALL, to: '/sales/unsold', newTo: '/sales/order-entry',
    fields: { kinds: ['품목별', '라인별'], conditions: CONDITIONS, periods: P, selects: [progressSelect], defaultSort: 'dateNo', forms: ['기본'] },
    table: {
      columns: [c('dateNo', '일자-No.'), c('item', '품목명[규격명]'), n('qty', '수량'), n('restQty', '미출고수량'), n('supply', '미판매공급가액'), c('partner', '거래처명'),
        c('remark', '적요'), c('due', '품목별납기일자'), n('vat', '미판매부가세')],
      fetch: d.unsoldRows, kindKey: { 품목별: 'item' }, filterKey: FILTER,
    },
  },
  {
    id: 'purchases', title: '구매현황', group: '재고', icons: ALL, to: '/sales/purchase-status', newTo: '/sales/buy',
    fields: { kinds: LINE_KINDS, conditions: CONDITIONS, periods: P, defaultSort: 'dateNo', forms: ['거래내역보기'] },
    table: {
      columns: [c('dateNo', '일자-No.'), c('partner', '거래처명'), c('remark', '적요'), c('item', '품목명[규격]'), n('qty', '수량'), n('price', '단가'), n('amount', '금액'),
        c('itemCode', '품목코드', { off: true }), c('employee', '담당자', { off: true }), c('warehouse', '창고', { off: true }), n('vat', '부가세', { off: true })],
      fetch: d.purchaseRows, kindKey: lineKindKey('dateNo'), filterKey: FILTER,
    },
  },
  {
    id: 'unpurchased', title: '미입고현황', settingTitle: '미구매현황', group: '재고', icons: ALL, to: '/sales/unpurchased', newTo: '/sales/purchase-orders',
    fields: { kinds: ['품목별', '라인별'], conditions: CONDITIONS, periods: P, selects: [progressSelect], defaultSort: 'dateNo', forms: ['기본'] },
    table: {
      columns: [c('dateNo', '일자-No.'), c('item', '품목명[규격명]'), n('qty', '수량'), n('restQty', '미구매수량'), c('due', '품목별납기일자'), c('partner', '거래처명'),
        c('remark', '적요'), n('vat', '미구매부가세')],
      fetch: d.unpurchasedRows, kindKey: { 품목별: 'item' }, filterKey: FILTER,
    },
  },
  {
    id: 'notShipped', title: '미출하현황', group: '재고', icons: ALL, to: '/sales/unshipped', newTo: '/sales/shipment-order-entry',
    fields: { kinds: ['라인별', '품목별'], conditions: CONDITIONS, periods: P, selects: [progressSelect], defaultSort: 'dateNo', forms: ['기본'] },
    table: {
      columns: [c('dateNo', '일자-No.'), c('item', '품목명[규격]'), n('qty', '수량'), n('restQty', '미출하수량'), c('warehouse', '창고명'), c('partner', '거래처명'),
        c('remark', '적요'), c('due', '출하예정일')],
      fetch: d.unshippedRows, kindKey: { 품목별: 'item' }, filterKey: FILTER,
    },
  },
  {
    id: 'issue', title: '생산불출현황', group: '재고', icons: ALL, to: '/production/issue-status', newTo: '/production/issue',
    fields: { kinds: ['라인별', '품목별'], conditions: CONDITIONS, periods: P, defaultSort: 'dateNo', forms: ['기본'] },
    table: { columns: productionCols, fetch: d.issueRows, kindKey: { 품목별: 'item' }, filterKey: FILTER },
  },
  {
    id: 'receipt', title: '생산입고현황', group: '재고', icons: ALL, to: '/production/receipt-status', newTo: '/production/receipt-bom',
    fields: { kinds: ['라인별', '품목별'], conditions: CONDITIONS, periods: P, defaultSort: 'dateNo', forms: ['기본'] },
    table: { columns: productionCols, fetch: d.receiptRows, kindKey: { 품목별: 'item' }, filterKey: FILTER },
  },
  {
    id: 'receivable', title: '거래처별채권', group: '재고', icons: ALL, to: '/sales/receivable-status', newTo: '/sales/sell',
    fields: { kinds: ['거래처별', '담당자별'], periods: P, defaultSort: 'manager', forms: ['기본'] },
    table: { columns: arCols(true), fetch: (a) => d.arApRows(a, 'AR'), kindKey: { 담당자별: 'manager' } },
  },
  {
    id: 'payable', title: '거래처별채무', group: '재고', icons: ALL, to: '/sales/payable-status', newTo: '/sales/buy',
    fields: { kinds: ['거래처별', '담당자별'], periods: P, defaultSort: 'manager', forms: ['기본'] },
    table: { columns: arCols(false), fetch: (a) => d.arApRows(a, 'AP'), kindKey: { 담당자별: 'manager' } },
  },
  {
    id: 'orderStage', title: '오더관리진행단계', group: '재고', icons: ALL, to: '/sales/order-stages', newTo: '/sales/order-stages',
    fields: { periods: P, defaultPeriod: '금월(~오늘)', defaultRows: 6, forms: ['기본'] },
    table: {
      columns: [c('orderNo', '오더관리번호'), c('name', '오더관리명'), c('typeName', '오더관리유형명'), c('date', '기준일자'),
        // 원본 '구매 (1)' 알약 — 단계마다 연결 전표 수. 우리 전표에는 오더관리번호 칸이 없어 오더관리진행단계 화면처럼 (0)
        c('stages', '진행단계', { cell: (r) => (
          <div className="ec-pills">
            {String(r.stages ?? '').split('|').filter(Boolean).map((s, k) => (
              <span key={k} className={`ec-pill no-ec${!r.completed && k === 0 ? ' active' : ''}`}>{s} (0)</span>
            ))}
          </div>
        ) }),
        c('detail', '상세', { link: () => '/sales/order-stages' })],
      fetch: d.orderStageRows,
    },
  },
  {
    id: 'asReceipt', title: 'A/S접수현황', group: '재고', icons: ALL, to: '/quality/as-status', newTo: '/quality/as-entry',
    fields: { kinds: LINE_KINDS, conditions: CONDITIONS, periods: P, defaultSort: 'dateNo', forms: ['기본'] },
    table: {
      columns: [c('dateNo', '일자-No.'), c('status', '진행상태'), c('warehouse', '창고명'), c('employee', '담당자명'), c('partner', '거래처명'), c('title', '제목'),
        c('itemCode', '품목코드'), c('item', '품목명[규격]'), n('qty', '수량')],
      fetch: d.asRows, kindKey: lineKindKey('dateNo'), filterKey: FILTER,
    },
  },
  {
    id: 'asRepair', title: 'A/S수리현황', group: '재고', icons: ALL, to: '/quality/as-repair-status', newTo: '/quality/as-repair-entry',
    fields: { kinds: ['품목별', '거래처별', '수리담당자별', '월별', '일별', '라인별'], conditions: CONDITIONS, periods: P, defaultSort: 'dateNo', forms: ['기본'] },
    table: {
      columns: [c('dateNo', '일자-No.'), c('title', '제목'), c('partner', '거래처명'), c('repairType', '수리유형명'), c('employee', '담당자명'), c('item', '품목명'),
        n('amount', '소모(판매)금액'), c('content', '수리내용')],
      fetch: d.repairRows, kindKey: lineKindKey('dateNo'),
    },
  },
  // ── 회계 ──
  {
    id: 'fund', title: '자금일보', group: '회계', icons: NO_NEW, to: '/accounting/fund-daily',
    fields: { periods: P, noRows: true, noSort: true, selects: [{ key: 'rollup', label: '대표거래처로 합산', options: ['거래처관계기준', '개별거래처기준'] }] },
    table: {
      columns: [c('account', '계정'), c('partner', '거래처'), n('carry', '이월잔액[외화]'), n('inc', '증가[외화]'), n('dec', '감소[외화]'), n('end', '금일잔액[외화]')],
      fetch: d.fundRows,
    },
  },
  {
    id: 'vatBook', title: '매입매출장', group: '회계', icons: NO_NEW, to: '/accounting/vat-book',
    fields: { kinds: ['매입', '매출', '매입/매출'], defaultKind: '매입/매출', kindRadio: true, periods: P, defaultSort: 'dateNo' },
    table: {
      columns: [c('dateNo', '일자-No.'), c('typeName', '유형명'), c('partner', '거래처명'), n('buySupply', '매입공급가액'), n('sellSupply', '매출공급가액'),
        c('text', '세부내역', { off: true }), n('buyVat', '매입부가세', { off: true }), n('sellVat', '매출부가세', { off: true })],
      fetch: d.vatBookRows,
    },
  },
  {
    id: 'taxInvoice', title: '(세금)계산서진행단계', group: '회계', icons: ALL, to: '/accounting/tax-invoice-sales', newTo: '/accounting/tax-invoice-sales',
    fields: { periods: P, defaultSort: 'dateNo', forms: ['기본'] },
    table: {
      columns: [c('dateNo', '일자-No.'), c('partner', '거래처명'), n('supply', '공급가액'), n('vat', '부가세'), n('total', '합계금액'), c('kind', '종류'),
        c('stage', '전자(세금)계산서 진행단계')],
      fetch: d.taxInvoiceRows,
    },
  },
  // ── 공통 ──
  {
    id: 'schedule', title: '일정관리', group: '공통', icons: ALL, to: '/groupware/schedule', newTo: '/groupware/schedule',
    fields: { forms: ['기본', '일간', '월간양식', '월간', '사용자별'], noRows: true, selects: [{ key: 'detail', label: '상세일정 표시줄수', options: DETAIL_ROWS, def: '2건' }] },
    render: (p) => <CalendarWidget {...p} />,
  },
  {
    id: 'approval', title: '전자결재', group: '공통', icons: ALL, to: '/groupware/approval/my', newTo: '/groupware/approval/draft',
    fields: { forms: ['기본'], noSort: true, selects: [{ key: 'menu', label: '메뉴', options: Object.keys(APPROVAL_SCOPES) }] },
    table: {
      columns: [c('date', '기안일자'), c('title', '제목'), c('drafter', '기안자'), c('approver', '결재자'), c('status', '진행상태'),
        c('view', '결재', { link: () => '/groupware/approval/my' }), n('vouchers', '연결전표', { off: true }), c('attach', '첨부', { off: true })],
      fetch: d.approvalRows, caption: (s) => `◎ ${s.extra?.menu ?? '내 기안문서'}`,
    },
  },
  {
    id: 'messages', title: '쪽지함리스트', group: '공통', icons: { window: true, refresh: true, new: true }, to: '/groupware/messages', newTo: '/groupware/messages',
    table: { columns: [c('sender', '보낸사람'), c('content', '내용'), c('sentAt', '받은일시'), c('read', '확인')], fetch: d.messageRows },
  },
  {
    id: 'mail', title: 'Email', group: '공통', icons: ALL, to: '/groupware/mail', newTo: '/groupware/mail',
    fields: { noSort: true },
    table: { columns: [c('subject', '제목'), c('sender', '보낸사람'), c('date', '받은날짜')], fetch: d.mailRows },
  },
  { id: 'flowchart', title: '플로우차트', group: '공통', icons: {}, render: () => <FlowchartWidget /> },
  {
    id: 'fieldWork', title: '외근조회', group: '공통', icons: ALL, to: '/groupware/field-work-status', newTo: '/groupware/field-works',
    fields: { periods: P, defaultPeriod: '금일', forms: ['기본'], noSort: true },
    table: {
      columns: [c('dateNo', '일자No.'), c('user', '사용자명'), c('vehicleCode', '이동수단코드'), c('vehicleName', '이동수단명'), c('departure', '출발지 주소'),
        c('destination', '도착지 주소'), n('distance', '운행거리'), c('remark', '적요')],
      fetch: d.fieldWorkRows,
    },
  },
  {
    id: 'enote', title: 'E Note', group: '공통', icons: ALL, w: 10,
    fields: { kinds: ['To Do', 'Memo', '개인파일함', '이미지파일함'], selects: [{ key: 'category', label: '카테고리', options: ['예정', '해야할 일', '완료'] }], noSort: true },
    table: { columns: [c('note', 'Note'), c('label', '라벨'), c('date', '등록일자')], fetch: d.noteRows },
  },
  // ── 게시판 — 게시판 하나가 위젯 하나 ──
  board('board-notice', 'NOTICE', '공지사항', '/groupware/notice'),
  board('board-work', 'WORK', '업무일지', '/groupware/work'),
  board('board-shared', 'SHARED', '공유정보/업무관리 게시판 20개까지', '/groupware/shared-board'),
  board('board-meeting', 'MEETING', '팀별회의록 게시판', '/groupware/meeting-board'),
  board('board-minutes', 'MINUTES', '통합회의록', '/groupware/minutes-board'),
]

/** E Note 는 머리 제목이 종류(To Do …)다 */
export const headTitle = (def: WidgetDef, s: { title?: string; kind?: string }) =>
  s.title ?? (def.id === 'enote' ? s.kind ?? 'To Do' : def.title)

/** 원본 홈 기본 배치(2026-10-30 실측) — [위젯 초기화] 가 이것으로 되돌린다 */
export const DEFAULT_LAYOUT = [
  { id: 'schedule', x: 0, y: 0, w: 15, h: 10 },
  { id: 'approval', x: 15, y: 0, w: 13, h: 5 },
  { id: 'board-notice', x: 15, y: 5, w: 13, h: 5 },
  { id: 'orderStage', x: 0, y: 10, w: 28, h: 4 },
]
