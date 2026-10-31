// 백엔드 응답과 매칭되는 타입 — 판매 · 구매 · 거래처 · 견적 · 발주 · 수출. types/api.ts 가 다시 내보낸다(기존 import 경로 그대로).

// ===== 판매/구매 =====

export type PartnerType = 'CUSTOMER' | 'SUPPLIER' | 'BOTH'

export interface Partner {
  id: number
  code: string
  name: string
  type: PartnerType
  typeName: string
  bizRegNo: string | null
  ceoName: string | null
  bizType: string | null
  bizItem: string | null
  manager: string | null
  phone: string | null
  /** 모바일. 원본 거래처리스트의 열 — 전화와 따로다. */
  mobile: string | null
  /** 원본 거래처관리대장 I 머리말의 Email. */
  email: string | null
  /** 원본 거래처관리대장 I 머리말의 Fax. */
  fax: string | null
  /** 원본 거래처관리대장 I 머리말의 여신한도. 0 은 '한도 없음' 이 아니라 원본이 찍는 값이다. */
  creditLimit: number
  /** 이체정보 — 지급할 때 쓸 계좌. 원본 [이체정보] 열이 이게 있는지를 보여 준다. */
  bankName: string | null
  accountNo: string | null
  accountHolder: string | null
  /** 우편번호. 원본 거래처등록 [기본] 탭의 [주소1 우편번호]. */
  postalCode: string | null
  address: string | null
  /** 원본 조건 [최초작성일자]·[최종수정일자]. 서버가 BaseTimeEntity 에서 실어 준다. */
  createdDate: string | null
  updatedDate: string | null
  salesPriceGroup: string | null
  purchasePriceGroup: string | null
  /** 원본 거래처검색·거래처리스트의 [검색창내용]. 부르는 이름으로 찾는다. */
  searchKeyword: string | null
  /** 원본 [거래처코드구분] — 사업자등록번호 · 주민등록번호 · 외국인. */
  regNoKind: string
  /** 원본 [업종별구분] — 일반 · 관세사 · 외화거래처. */
  industryKind: string
  /**
   * 원본 의료기기공급내역보고의 [공급형태] — 이 거래처가 어떤 곳인지.
   * 안 정할 수 있다(의료기기를 안 다루면 없는 개념이다).
   */
  udiSupplyShape: string | null
  subBizNo: string | null
  postalCode2: string | null
  address2: string | null
  homepage: string | null
  remark: string | null
  /** 원본 [세무신고거래처]. */
  taxReport: boolean
  /** 원본 [출하대상거래처]. */
  shipmentTarget: boolean
  /**
   * 원본 [관계설정]의 대표거래처. 이 거래처가 어느 회사의 지점·사업장이면 그 회사다.
   * 미지정이면 자기가 곧 대표다 — 거래처관리대장의 [대표거래처로 합산]이 이걸 쓴다.
   */
  parentId: number | null
  parentName: string | null
  /* 원본 거래처등록 폼의 나머지 칸들. */
  foreignCurrency: boolean
  /** 원본 [세무신고거래처] — 다른 코드로 묶어 신고할 때 그 코드. 비면 '거래처코드동일'. */
  taxReportCode: string | null
  /** 원본 [통화] — 외화등록 통화 코드. 비면 내자. */
  currencyCode: string | null
  /** 계좌 · 카드 · 카드사의 짝 거래처면 BANK · CARD · CARD_ISSUER — 코드도움에만 나오고 거래처등록 목록에는 안 보인다. */
  linkedKind?: 'BANK' | 'CARD' | 'CARD_ISSUER' | null
  salesTaxType: string | null
  purchaseTaxType: string | null
  creditDays: number | null
  settleDueDay: number | null
  arNoManaged: boolean
  apNoManaged: boolean
  partnerGroupId: number | null
  partnerGroupName: string | null
  active: boolean
}

export interface TradeLine {
  /**
   * 라인 id. 라인 단위로 무언가를 붙이려면(추가항목 등) 이 키가 있어야 한다.
   * 수주는 예전부터 주는데 판매·구매만 빠져 있었다.
   */
  lineId: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  spec: string | null
  /** 원본 전표이력조회(거래이력조회) 조건의 [품목구분]. 품목 마스터의 값이다. */
  itemCategoryName: string | null
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
  remark: string | null
  /** 시리얼/로트 (이카운트 판매입력 그리드의 serial_cd) */
  lotNo: string | null
  /** 부대비용 (cust_amt). 합계 금액에는 더하지 않는다. */
  extraCost: number | null
  /** 구매 외자 줄의 외화단가 · 외화금액 · 줄 환율 (내자 줄은 null) */
  foreignPrice?: number | null
  foreignAmount?: number | null
  lineRate?: number | null
  /**
   * 불러온 근거전표 — 이카운트 판매입력·구매입력 그리드의 [불러온 전표 / 전표일자 / 전표No.] 3열.
   * [전표불러오기]로 수주·발주 라인을 담았을 때만 채워지고, 직접 입력한 줄은 전부 null 이다.
   */
  sourceOrderId: number | null
  /** '주문서'(판매) 또는 '발주서'(구매) */
  sourceDocType: string | null
  sourceDocDate: string | null
  sourceDocNo: string | null
}

export type SalesConfirmStatus = 'UNCONFIRMED' | 'IN_APPROVAL' | 'CONFIRMED'

export interface SalesDoc {
  /** 원본 조건 판 [기타]의 [수정일자순(정렬)]이 쓰는 축. BaseTimeEntity 가 든다. */
  updatedAt: string | null
  /** 원본 조건 [최초작성일자]. 앞 바퀴에 updatedAt 만 싣고 두고 온 값이다. */
  createdAt: string | null
  id: number
  docNo: string
  partnerId: number | null
  partnerName: string
  warehouseId: number
  warehouseName: string
  saleDate: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  remark: string | null
  createdBy: string | null
  confirmStatus: SalesConfirmStatus
  confirmStatusName: string
  confirmedAt: string | null
  accountingReflected: boolean
  /** 부가세를 전표 단위로 계산한 전표인가 (이카운트 [거래별부가세계산]) */
  vatBySlip: boolean
  /** 과세 전표인가. 예전에는 부가세 > 0 인지로 되짚었는데 반올림으로 0 이 된 과세 전표가 면세로 섞였다. */
  taxable: boolean
  /** 원본 [거래구분]이 반품인가. 반품이면 수량·금액이 음수로 저장돼 있다. */
  returnSlip: boolean
  /** 원본 [거래구분] 표시값 — 일반 · 반품. */
  tradeKindName: string
  /** 귀속 프로젝트 (백엔드 SalesResponse 가 이미 주고 있던 필드 — 타입에 빠져 있었다) */
  projectId: number | null
  projectName: string | null
  employeeId: number | null
  employeeName: string | null
  lines: TradeLine[]
  /** 판매입력 II [금액조정] 할인 감소(-) — 머리 금액(supply/vat/total)은 이미 뺀 값. 판매입력(I) 전표는 0. */
  discountSupply?: number
  discountVat?: number
  /** 판매입력 II 로 만든 전표인가 — 판매조회에서 열면 '판매입력 II(수정)' 창. */
  inputII?: boolean
}

export interface PurchaseDoc {
  /** 원본 조건 판 [기타]의 [수정일자순(정렬)]이 쓰는 축. BaseTimeEntity 가 든다. */
  updatedAt: string | null
  /** 원본 조건 [최초작성일자]. 앞 바퀴에 updatedAt 만 싣고 두고 온 값이다. */
  createdAt: string | null
  id: number
  docNo: string
  partnerId: number
  partnerName: string
  warehouseId: number
  warehouseName: string
  purchaseDate: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  remark: string | null
  createdBy: string | null
  /** 부가세를 전표 단위로 계산한 전표인가 (이카운트 [거래별부가세계산]) */
  vatBySlip: boolean
  /** 과세 전표인가. 예전에는 부가세 > 0 인지로 되짚었는데 반올림으로 0 이 된 과세 전표가 면세로 섞였다. */
  taxable: boolean
  /** 원본 [거래구분]이 반품인가. 반품이면 수량·금액이 음수로 저장돼 있다. */
  returnSlip: boolean
  /** 원본 [거래구분] 표시값 — 일반 · 반품. */
  tradeKindName: string
  /** 구매 외자(수입) 전표의 통화코드 · 머리 환율. 내자면 null. 금액 열은 늘 원화다. */
  currencyCode?: string | null
  exchangeRate?: number | null
  /** 회계반영 여부 (판매와 맞추려고 응답에 추가했다) */
  accountingReflected: boolean
  /** 귀속 프로젝트 (백엔드 PurchaseResponse 가 이미 주고 있던 필드 — 타입에 빠져 있었다) */
  projectId: number | null
  projectName: string | null
  employeeId: number | null
  employeeName: string | null
  lines: TradeLine[]
}

export interface PartnerBalance {
  partnerId: number
  code: string
  name: string
  type: PartnerType
  typeName: string
  receivable: number
  payable: number
  /** 채권/채무현황 조건용 (기존 화면은 쓰지 않아도 된다) */
  partnerGroupId: number | null
  partnerGroupName: string | null
  manager: string | null
  active: boolean
  /** 원본 [대표거래처로 합산]이 쓰는 본사. 미지정이면 자기가 곧 대표다. */
  parentId: number | null
  parentName: string | null
  /** 잔액 가운데 회계전표가 외상매출금·외상매입금을 직접 움직인 몫(어음·수표·외주비 회계반영 …). */
  receivableJournal: number
  payableJournal: number
  /** 세금계산서를 안 끊은(안 받은) 판매(구매) 합계 — 원본 채권현황 · 채무현황 [미청구금액] */
  unbilledReceivable: number
  unbilledPayable: number
}

// ===== 특별단가(E040124) =====

export type SpecialPriceType = 'SALES' | 'PURCHASE'

/** 특별단가그룹 — 원본 [특별단가그룹] 알약. has* 는 그 칸 링크가 주황 알약인가(무언가 붙었나). */
export interface SpecialPriceGroup {
  id: number
  code: string
  name: string
  active: boolean
  hasPartners: boolean
  hasWarehouses: boolean
  hasItems: boolean
  hasItemGroups: boolean
  updatedAt: string | null
}

/** 품목별 특별단가 — 그룹 × 품목 = 적용단가 · VAT포함 */
export interface SpecialPrice {
  id: number
  groupId: number
  groupCode: string
  groupName: string
  itemId: number
  itemCode: string
  itemName: string
  spec: string | null
  unit: string | null
  itemGroupName: string | null
  unitPrice: number
  vatIncluded: boolean
  active: boolean
  remark: string | null
  updatedAt: string | null
}

/** 품목그룹별 특별단가 — 그룹 × 품목그룹 = 단가기준 · 조정_비율 · 조정_단위처리 */
export interface SpecialPriceItemGroup {
  id: number
  groupId: number
  groupCode: string
  groupName: string
  itemGroupId: number
  itemGroupCode: string
  itemGroupName: string
  priceBasis: string
  adjustRate: number
  roundUnit: string
  roundMode: string
  adjustText: string
  active: boolean
}

/** 적용단가 알약 한 줄 */
export interface SpecialPriceApplied {
  itemId: number
  itemCode: string
  itemName: string
  spec: string | null
  itemGroupName: string | null
  kind: string
  groupCode: string
  groupName: string
  adjustText: string
  unitPrice: number
  vatIncluded: boolean
}

/** 거래처설정 · 창고설정 한 줄 — 구분 · 코드 · 이름 */
export interface SpecialPriceMember {
  id: number
  tradeType: SpecialPriceType
  tradeTypeName: string
  targetId: number
  code: string
  name: string
}

export interface SpecialPriceResolve {
  found: boolean
  unitPrice: number | null
  /** 걸린 단가적용순서 줄 — '거래처별특별단가(품목별)' … */
  source: string | null
  groupCode: string | null
  groupName: string | null
  vatIncluded: boolean
}

// ===== 견적서 =====

export type QuotationStatus = 'UNCONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface QuoteLine {
  id: number
  lineNo: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  /** 규격. 미주문현황(E040211)의 열 이름이 [품목명(규격)] 이라 붙여 찍는다. */
  spec: string | null
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
  /** 줄 적요(원본 견적서입력 줄 열 '적요'). */
  remark?: string | null
}

export interface Quotation {
  /** 원본 견적서조회 [기타]의 [수정일자순(정렬)]이 쓰는 축. */
  updatedAt: string | null
  id: number
  quoteNo: string
  quoteDate: string
  validUntil: string | null
  partnerId: number
  partnerName: string
  /** 원본 견적서의 [창고]·[프로젝트]. 견적 시점에는 안 정했을 수 있어 널이다. */
  warehouseId: number | null
  warehouseName: string | null
  projectId: number | null
  projectName: string | null
  /** 원본 견적서의 [담당자](견적서조회 [사원(담당)명]). */
  employeeId: number | null
  employeeName: string | null
  status: QuotationStatus
  statusName: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  convertedOrderId: number | null
  remark: string | null
  createdBy: string | null
  lines: QuoteLine[]
}

// ===== 발주서 =====

export type PurchaseOrderStatus =
  | 'REQUESTED' | 'PLANNED' | 'PRICE_REQUESTED' | 'PRICED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED'

export interface PurchaseOrderLine {
  id: number
  lineNo: number
  itemId: number
  itemCode: string
  itemName: string
  unit: string
  /** 원본 조건·열의 [규격]. 서버가 품목에서 실어 준다. */
  spec: string | null
  /** 원본 조건 [품목구분]. 품목 마스터의 값이라 서버가 실어 준다. */
  itemCategory: string | null
  itemCategoryName: string | null
  quantity: number
  unitPrice: number
  supplyAmount: number
  vatAmount: number
  /** 원본 조건 [적요]. 줄마다 붙는 메모다. */
  remark: string | null
  /** 발주계획조회 [종결여부] — 이 줄을 종결했나(원본은 줄마다 닫는다). */
  planClosed: boolean
  /** [수량조정] 창의 [입력수량] — 처음 넣은 수량. 격자에서 고친 수량(발주확정수량)과 따로 간다. */
  inputQuantity: number
  /** [수량조정] 창의 [최종계산일자]. */
  planCalcDate: string | null
  /** 단가요청 진행단계의 수취단가 · 확정단가(요청단가는 unitPrice). */
  receivedPrice?: number | null
  confirmedPrice?: number | null
  /** 외화 발주서 줄의 외화단가 · 외화금액(내자는 null). 원화금액은 supplyAmount. */
  foreignPrice?: number | null
  foreignAmount?: number | null
}

export interface PurchaseOrder {
  id: number
  orderNo: string
  orderDate: string
  dueDate: string | null
  /**
   * 회신받은 단가의 [유효기간]. 납기일과 <b>다른 것</b>이다 —
   * 납기는 물건이 언제 오느냐이고 이것은 그 값이 언제까지 유효하냐다.
   */
  priceValidUntil: string | null
  partnerId: number
  partnerName: string
  employeeId: number | null
  employeeName: string | null
  warehouseId: number | null
  warehouseName: string | null
  /** 원본 발주서의 [프로젝트]. 발주 시점에는 안 정했을 수 있어 널이다. */
  projectId: number | null
  projectName: string | null
  currency: string | null
  /** 외화 발주서의 환율(원본 통화 옆 칸). 내자면 null. */
  exchangeRate?: number | null
  status: PurchaseOrderStatus
  statusName: string
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  taxable: boolean
  convertedPurchaseId: number | null
  remark: string | null
  createdBy: string | null
  /** 원본 발주계획조회 [최종수정자]. */
  updatedBy: string | null
  /** 원본 발주서조회 조건의 [최초작성일자]·[최종작업일자], 그리고 [기타]의 수정일자순(정렬). */
  createdAt: string | null
  updatedAt: string | null
  lines: PurchaseOrderLine[]
}

export interface Department {
  id: number
  code: string
  name: string
  parentId: number | null
  parentName: string | null
  sortOrder: number
  active: boolean
  employeeCount: number
  /** 부서장 사원 id — 조직도등록 [부서장] 열 · [부서장지정] · [부서장설정] */
  headEmployeeId: number | null
  /** 조회 조건 [수정일자순(정렬)] 의 축 */
  updatedAt?: string | null
}

// ===== 수출관리 =====

export type ExportStatus = 'ORDER' | 'CUSTOMS' | 'SHIPPED' | 'PAID'

export interface ExportOrderLine {
  id: number
  lineNo: number
  itemId: number
  itemCode: string
  itemName: string
  /** 저장할 때의 품목 규격(사본) — 예전 전표는 비어 있다(원본도 안 붙는다, V505). */
  spec: string | null
  unit: string
  quantity: number
  unitPrice: number
  amount: number
  /** 원본 품목 격자의 패킹리스트 칸(2026-10-04). */
  marks: string | null
  description: string | null
  netWeight: number | null
  grossWeight: number | null
  measurement: number | null
}

export interface ExportOrder {
  id: number
  /** 원본은 비워 저장하면 비운 채로 둔다(2026-10-12). */
  invoiceNo: string | null
  invoiceDate: string
  partnerId: number
  buyerName: string
  /** 비면 원본 [통화] 의 '내자'(원화). */
  currencyId: number | null
  currencyCode: string | null
  currencySymbol: string | null
  foreignAmount: number
  appliedRate: number
  krwAmount: number
  incoterms: string | null
  destination: string | null
  status: ExportStatus
  statusName: string
  declarationNo: string | null
  blNo: string | null
  shippedDate: string | null
  paidDate: string | null
  remark: string | null
  createdBy: string | null
  /** 원본 [기타]의 [수정일자순(정렬)] 이 쓰는 축. */
  updatedAt: string | null
  lines: ExportOrderLine[]
  /* 원본 Invoice/Packing List 입력 머리(2026-10-04 실측). voucherDate 가 목록 [Voucher Date] 다. */
  voucherDate: string
  lcNo: string | null
  lcDate: string | null
  lcBank: string | null
  shipper: string | null
  messrs: string | null
  notifyParty: string | null
  portOfLoading: string | null
  carrier: string | null
  sailingDate: string | null
  weightUnit: string | null
  /** 원본 목록 탭 [미확인] · [확인]. */
  confirmed: boolean
}

export interface ExportSummary {
  totalKrw: number
  unpaidKrw: number
  orderCount: number
  shippingCount: number
  unpaidCount: number
  exports: ExportOrder[]
}

// ===== 쇼핑몰관리 =====

export type MallOrderStatus = 'RECEIVED' | 'CONFIRMED' | 'CONVERTED' | 'SHIPPED' | 'RETURNED' | 'EXCHANGED' | 'CANCELLED'

export interface MallOrder {
  id: number
  mall: string
  mallOrderNo: string
  orderDate: string
  status: MallOrderStatus
  statusName: string
  buyerName: string
  buyerPhone: string | null
  address: string | null
  productName: string
  mallProductCode: string | null
  itemId: number | null
  itemCode: string | null
  itemName: string | null
  quantity: number
  unitPrice: number
  totalAmount: number
  salesId: number | null
  salesDocNo: string | null
  remark: string | null
  createdBy: string | null
  courier: string | null
  trackingNo: string | null
  shippedAt: string | null
  closeReason: string | null
  closedAt: string | null
}

export interface MallSummary {
  mall: string
  orderCount: number
  totalAmount: number
  unconverted: number
}

export interface MallItemMapping {
  id: number
  mall: string
  mallProductCode: string
  mallProductName: string | null
  itemId: number
  itemCode: string
  itemName: string
  active: boolean
}

// ===== 수집데이터 소스 등록(E100000) =====

export interface CollectSource {
  id: number
  /** 원본 [데이터코드]. 이미 있는 행에는 없으므로 널이다. */
  code: string | null
  name: string
  category: string
  endpoint: string
  paged: boolean
  sortOrder: number
  active: boolean
  /** 원본 [최초작성일자]·[최종작업일자]. BaseTimeEntity 가 들고 있던 값이다. */
  createdAt: string | null
  updatedAt: string | null
}

/** 수집데이터등록(C001401)의 [수신문서] */
export type CollectDocType = 'STATEMENT' | 'QUOTATION' | 'PURCHASE_ORDER'

/** 데이터센터 › 수집데이터등록 한 줄 — 이메일로 받은 문서를 모을 규칙. */
export interface CollectData {
  id: number
  /** [데이터코드] — 기본 줄은 널 */
  code: string | null
  name: string
  channel: string
  docType: CollectDocType
  docTypeLabel: string
  senderCompany: string | null
  /** [진행상태] */
  status: string
  /** [조건] '거래명세서' · '거래명세서 AND 보낸회사' */
  condition: string
  /** [연결업무] — 기본 줄만 */
  linkedTask: string | null
  builtIn: boolean
  createdBy: string | null
  updatedBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type MallAccountType = 'MALL' | 'SOLUTION'

export interface MallAccount {
  id: number
  code: string
  name: string
  type: MallAccountType
  typeName: string
  partnerId: number | null
  partnerName: string | null
  sellerId: string | null
  memo: string | null
  active: boolean
}

export interface MallOverview {
  totalOrders: number
  totalAmount: number
  unmapped: number
  unconverted: number
  byMall: MallSummary[]
  orders: MallOrder[]
}

// ===== 담당자별 실적 =====

export interface PerformanceRow {
  employeeId: number | null
  employeeCode: string
  employeeName: string
  department: string | null
  salesCount: number
  salesAmount: number
  purchaseCount: number
  purchaseAmount: number
  salesShare: number
}

export interface PerformanceSummary {
  from: string
  to: string
  totalSales: number
  totalPurchase: number
  rows: PerformanceRow[]
}
