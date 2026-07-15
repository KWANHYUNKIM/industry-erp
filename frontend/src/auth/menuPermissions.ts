// 프론트 라우트 → 권한 코드 매핑. 백엔드 MenuPermissionCatalog 와 코드 체계를 맞춘다.
//
// 메뉴 노출과 라우트 가드에 쓴다. 조회(GET)는 백엔드가 막지 않으므로, 상태·출력물 페이지의
// 코드가 다소 근사여도 보안 구멍은 아니다(쓰기는 백엔드가 코드로 정확히 차단). null 은 권한
// 불요(대시보드·데이터센터 등 누구나).

type Rule = [prefix: string, code: string | null]

// 위에서부터 먼저 걸리는(더 구체적인) 규칙이 이긴다.
const RULES: Rule[] = [
  ['/', null], // 정확히 루트만 (아래 startsWith 로직에서 특별 처리)

  // 재고
  ['/inventory/wms', 'WMS'],
  ['/inventory/current', 'STOCK_MOVE'],
  ['/inventory/stock-io', 'STOCK_MOVE'],
  ['/inventory/transfer', 'STOCK_MOVE'],
  ['/inventory/reports', 'STOCK_MOVE'],
  ['/inventory/price-order', 'SALES'],
  ['/inventory/special-price-group', 'SALES'],
  ['/inventory', 'INV_MASTER'], // items · warehouses · manage-items

  // 구매 (영업 라우트와 섞여 있어 먼저 걸러낸다)
  ['/sales/buy', 'PURCHASE'],
  ['/sales/purchase-orders', 'PURCHASE'],
  ['/sales/purchase-list', 'PURCHASE'],
  ['/sales/purchase-status', 'PURCHASE'],
  ['/sales/purchase-discount', 'PURCHASE'],
  ['/sales/purchase-price-bulk', 'PURCHASE'],
  ['/sales/outsourcing-discount', 'PURCHASE'],
  ['/sales/payment', 'PURCHASE'],
  ['/sales/payable', 'PURCHASE'],
  // 회계성(채권채무·회계반영)
  ['/sales/ledger', 'ACCOUNTING'],
  ['/sales/partner-ledger', 'ACCOUNTING'],
  ['/sales/accounting-reflection', 'ACCOUNTING'],
  // 거래처
  ['/sales/partners', 'PARTNER'],
  // 부가
  ['/sales/export', 'EXPORT'],
  ['/sales/mall', 'MALL'],
  // 나머지 영업 (sell · sales-* · quotations · shipment* · settlement · collection · orders …)
  ['/sales', 'SALES'],

  // 생산
  ['/production', 'PRODUCTION'],

  // 품질/AS
  ['/quality', 'QUALITY'],

  // 회계
  ['/accounting/tax-invoice', 'TAX_INVOICE'],
  ['/accounting/bank-cards', 'BANK'],
  ['/accounting/cash-details', 'BANK'],
  ['/accounting/cash-deposit', 'BANK'],
  ['/accounting/cash-withdraw', 'BANK'],
  ['/accounting/cash-plan', 'FINANCE'],
  ['/accounting/checks', 'BANK'],
  ['/accounting/non-cash', 'BANK'],
  ['/accounting/notes', 'BANK'],
  ['/accounting/fixed-assets', 'FIXED_ASSET'],
  ['/accounting/budget', 'FINANCE'],
  ['/accounting/contracts', 'FINANCE'],
  ['/accounting/income', 'FINANCE'],
  ['/accounting/expense', 'FINANCE'],
  ['/accounting/withholding', 'TAX'],
  ['/accounting/other-withholding', 'TAX'],
  ['/accounting/corporate-tax', 'TAX'],
  ['/accounting/vat', 'TAX'],
  ['/accounting/profit', 'PROFIT'],
  ['/accounting/item-cost', 'PROFIT'],
  ['/accounting/standard-cost', 'PROFIT'],
  ['/accounting/actual-cost', 'PROFIT'],
  ['/accounting/cost-build', 'PROFIT'],
  ['/accounting/variance', 'PROFIT'],
  ['/accounting/monthly-profit', 'PROFIT'],
  ['/accounting/daily-profit', 'PROFIT'],
  ['/accounting/project-profit', 'PROFIT'],
  ['/accounting', 'ACCOUNTING'], // accounts · journals · vouchers · 재무제표 · 원장 …

  // 관리(인사/급여)
  ['/hr/payroll', 'PAYROLL'],
  ['/hr/pay-settings', 'PAYROLL'],
  ['/hr/daily-wage', 'PAYROLL'],
  ['/hr', 'HR'],

  // 그룹웨어
  ['/groupware/org', 'HR'],
  ['/groupware/project', 'PROJECT'],
  ['/groupware/construction-schedule', 'PROJECT'],
  ['/groupware/dev-schedule', 'PROJECT'],
  ['/groupware/crm', 'PARTNER'],
  ['/groupware/cards', 'PARTNER'],
  ['/groupware', 'GROUPWARE'],

  // 설정
  ['/users', 'USER_MANAGE'],
  ['/roles', 'USER_MANAGE'],
  ['/settings', 'SETTINGS'],

  // 데이터센터 — 누구나
  ['/datacenter', null],
]

/** 라우트를 관장하는 권한 코드. 매핑이 없거나 null 이면 권한 불요(누구나). */
export function permForRoute(path: string): string | null {
  if (path === '/') return null
  let best: Rule | null = null
  for (const rule of RULES) {
    const [prefix] = rule
    if (prefix === '/') continue
    if (path === prefix || path.startsWith(prefix + '/')) {
      if (!best || prefix.length > best[0].length) best = rule
    }
  }
  return best ? best[1] : null
}
