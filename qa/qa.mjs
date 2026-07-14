#!/usr/bin/env node
/**
 * QA 시드 + 시나리오 검증 스크립트
 *
 *   node qa/qa.mjs seed      QA 전용 마스터 데이터를 만든다(이미 있으면 재사용)
 *   node qa/qa.mjs verify    핵심 업무 흐름을 끝까지 몰아보며 단언한다
 *   node qa/qa.mjs           seed 후 verify (기본)
 *
 * 사전 조건: docker compose up -d  +  백엔드(8081) 기동
 * 완전 초기화가 필요하면: docker compose down -v && docker compose up -d 후 백엔드 재기동
 *
 * 의존성 없음. Node 18+ 의 전역 fetch 를 쓴다.
 */

const BASE = process.env.ERP_API ?? 'http://localhost:8081/api'
const USER = process.env.ERP_USER ?? 'admin'
const PASS = process.env.ERP_PASS ?? 'admin1234'

/** QA가 만든 데이터는 전부 이 접두사를 붙여 시드 데이터와 구분한다. */
const P = 'QA-'

let token = ''
let pass = 0
let fail = 0

// ── HTTP ────────────────────────────────────────────────────────────────────

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: res.ok, status: res.status, data }
}

/** 성공을 기대하는 호출. 실패하면 즉시 중단한다(시드가 깨진 채 검증하면 의미가 없다). */
async function must(method, path, body) {
  const r = await call(method, path, body)
  if (!r.ok) {
    throw new Error(`${method} ${path} → HTTP ${r.status}: ${r.data?.message ?? JSON.stringify(r.data)}`)
  }
  return r.data
}

// ── 단언 ────────────────────────────────────────────────────────────────────

const eq = (label, actual, expected) => {
  const okay = String(actual) === String(expected)
  console.log(`  ${okay ? '✅' : '❌'} ${label}${okay ? '' : `  (기대 ${expected}, 실제 ${actual})`}`)
  okay ? pass++ : fail++
}

const isNull = (label, actual) => eq(label, actual === null || actual === undefined ? 'null' : actual, 'null')

const rejects = async (label, method, path, body, expectSubstring) => {
  const r = await call(method, path, body)
  const okay = !r.ok && (!expectSubstring || String(r.data?.message ?? '').includes(expectSubstring))
  console.log(`  ${okay ? '✅' : '❌'} ${label}${okay ? `  ("${r.data?.message ?? ''}")` : `  (HTTP ${r.status}: ${JSON.stringify(r.data)})`}`)
  okay ? pass++ : fail++
}

const section = (t) => console.log(`\n${t}`)

// ── 시드 (있으면 재사용 → 여러 번 돌려도 안전) ──────────────────────────────

const findBy = (list, key, value) => list.find((x) => x[key] === value)

async function ensure(listPath, key, value, createPath, body) {
  const list = await must('GET', listPath)
  const found = findBy(list, key, value)
  if (found) return found
  return must('POST', createPath ?? listPath, body)
}

async function seed() {
  section('■ QA 시드')

  const warehouse = await ensure('/warehouses', 'code', `${P}WH`, null, {
    code: `${P}WH`, name: 'QA창고', location: 'QA동 1층',
  })
  console.log(`  창고 ${warehouse.code} (id=${warehouse.id})`)

  const customer = await ensure('/partners', 'code', `${P}CUST`, null, {
    code: `${P}CUST`, name: 'QA고객사', type: 'CUSTOMER',
  })
  console.log(`  거래처 ${customer.code} (id=${customer.id})`)

  const supplier = await ensure('/partners', 'code', `${P}SUPP`, null, {
    code: `${P}SUPP`, name: 'QA매입처', type: 'SUPPLIER',
  })
  console.log(`  매입처 ${supplier.code} (id=${supplier.id})`)

  const product = await ensure('/items', 'code', `${P}PROD`, null, {
    code: `${P}PROD`, name: 'QA완제품', spec: '표준', unit: 'EA',
    category: 'FINISHED', unitPrice: 10000, safetyStock: 0,
  })
  const material = await ensure('/items', 'code', `${P}MAT`, null, {
    code: `${P}MAT`, name: 'QA원자재', spec: '표준', unit: 'EA',
    category: 'RAW_MATERIAL', unitPrice: 1000, safetyStock: 0,
  })
  console.log(`  품목 ${product.code}(id=${product.id}) / ${material.code}(id=${material.id})`)

  // 완제품 1개 = 원자재 2개
  const boms = await must('GET', '/boms')
  if (!boms.some((b) => b.productId === product.id)) {
    await must('POST', '/boms', { productId: product.id, remark: 'QA BOM', lines: [{ componentId: material.id, quantity: 2 }] })
  }
  console.log(`  BOM: ${product.code} 1개 ← ${material.code} 2개`)

  const process = await ensure('/processes', 'code', `${P}PRC`, null, {
    code: `${P}PRC`, name: 'QA조립공정', workcenter: 'QA라인', stdTimeMin: 10, costPerHr: 12000,
  })
  console.log(`  공정 ${process.name} (id=${process.id})`)

  const lots = await must('GET', '/lots')
  let lot = findBy(lots, 'lotNo', `${P}LOT-001`)
  if (!lot) {
    lot = await must('POST', '/lots', {
      lotNo: `${P}LOT-001`, itemId: material.id, warehouseId: warehouse.id,
      inboundDate: '2026-07-01', inboundQty: 1000,
    })
  }
  console.log(`  로트 ${lot.lotNo} (id=${lot.id})`)

  return { warehouse, customer, supplier, product, material, process, lot }
}

// ── 시나리오 ────────────────────────────────────────────────────────────────

/** 수주 → 출하지시 → 출하완료 → 미출고 반영 */
async function scenarioShipment(f) {
  section('■ 시나리오 1. 수주 → 출하 → 미출고현황')

  const order = await must('POST', '/sales-orders', {
    partnerId: f.customer.id, orderDate: '2026-07-10',
    lines: [{ itemId: f.product.id, quantity: 100, unitPrice: 10000 }],
  })
  const lineId = order.lines[0].lineId
  const un = async () => (await must('GET', '/sales-orders/unshipped')).find((r) => r.orderLineId === lineId)

  eq('신규 수주 상태는 접수', order.statusName, '접수')
  eq('출하 전 미출고 = 주문수량', (await un()).unshippedQty, 100)

  const ship1 = await must('POST', `/sales-orders/${order.id}/ship`, { lines: [{ orderLineId: lineId, qty: 30 }] })
  eq('출하지시에 근거주문이 연결됨', ship1.salesOrderNo, order.orderNo)
  eq('출하지시 직후 상태는 출하지시', ship1.statusName, '출하지시')
  eq('출하지시(READY)는 아직 출하로 치지 않음', (await un()).shippedQty, 0)

  await rejects('잔량(70) 초과 출하는 거부', 'POST', `/sales-orders/${order.id}/ship`,
    { lines: [{ orderLineId: lineId, qty: 80 }] }, '초과')

  await must('PATCH', `/shipments/${ship1.id}/status`, { status: 'SHIPPED' })
  const afterShip = await un()
  eq('출하완료 후 출하수량 = 30', afterShip.shippedQty, 30)
  eq('출하완료 후 미출고 = 70', afterShip.unshippedQty, 70)
  eq('부분출하 중 주문은 진행중', afterShip.statusName, '진행중')

  const ship2 = await must('POST', `/sales-orders/${order.id}/ship`, {})
  eq('lines 생략 시 잔량 전체(70) 출하지시', ship2.totalQuantity, 70)
  await must('PATCH', `/shipments/${ship2.id}/status`, { status: 'SHIPPED' })

  const orders = await must('GET', '/sales-orders')
  eq('전량 출하 후 주문은 완료', orders.find((o) => o.id === order.id).statusName, '완료')
  eq('전량 출하 후 미출고 목록에서 사라짐', (await must('GET', '/sales-orders/unshipped')).filter((r) => r.orderLineId === lineId).length, 0)

  await rejects('잔량 없는 주문 재출하는 거부', 'POST', `/sales-orders/${order.id}/ship`, {}, '잔량')

  await must('PATCH', `/shipments/${ship2.id}/status`, { status: 'CANCELED' })
  const afterCancel = await un()
  eq('출하 취소 시 출하수량 롤백 = 30', afterCancel.shippedQty, 30)
  eq('출하 취소 시 주문은 진행중으로 복귀', afterCancel.statusName, '진행중')
}

/** 생산계획 → 작업지시 관계 */
async function scenarioPlan(f) {
  section('■ 시나리오 2. 생산계획 → 작업지시 (관계 연결)')

  const plan = await must('POST', '/production-plans', {
    productId: f.product.id, planWeek: '2026-W29', demandQty: 50, planQty: 50,
  })
  isNull('계획 생성 직후 작업지시 없음', plan.workOrderId)

  const ordered = await must('POST', `/production-plans/${plan.id}/work-order`)
  eq('작업지시가 실제 FK로 연결됨', typeof ordered.workOrderId, 'number')
  eq('작업지시번호가 응답에 실림', String(ordered.workOrderNo).startsWith('WO-'), 'true')
  eq('계획 상태는 지시완료', ordered.statusName, '지시완료')

  await rejects('같은 계획 재지시는 거부', 'POST', `/production-plans/${plan.id}/work-order`, undefined, '이미')
}

/** 생산실적 → BOM 자재 자동 소모 + 완제품 입고 */
async function scenarioProduction(f) {
  section('■ 시나리오 3. 생산실적 → 재고 반영 (BOM 백플러시)')

  // 원자재 입고 200 (완제품 50개 = 원자재 100개 필요)
  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 200,
  })

  const stockOf = async (itemId) => {
    const rows = await must('GET', '/stock')
    const r = rows.find((x) => x.itemId === itemId && x.warehouseId === f.warehouse.id)
    return r ? Number(r.quantity) : 0
  }
  const matBefore = await stockOf(f.material.id)
  const prodBefore = await stockOf(f.product.id)

  const wo = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: 50, orderDate: '2026-07-10',
  })
  await must('POST', '/productions', { workOrderId: wo.id, producedQty: 50, productionDate: '2026-07-10' })

  eq('완제품 50개 입고', await stockOf(f.product.id), prodBefore + 50)
  eq('BOM대로 원자재 100개 자동 출고', await stockOf(f.material.id), matBefore - 100)
}

/** 문자열이던 관계가 마스터와 일치할 때만 FK로 채워지는지 */
async function scenarioRelations(f) {
  section('■ 시나리오 4. 자유입력 + 마스터 연결 (품질검사·작업내역)')

  const linked = await must('POST', '/quality-inspections', {
    type: 'INCOMING', itemId: f.material.id, lotNo: f.lot.lotNo, inspectedQty: 10, defectQty: 1,
  })
  eq('등록된 로트No → lotId 연결', linked.lotId, f.lot.id)

  const unlinked = await must('POST', '/quality-inspections', {
    type: 'INCOMING', itemId: f.material.id, lotNo: `${P}없는로트`, inspectedQty: 5, defectQty: 0,
  })
  isNull('미등록 로트No → lotId 는 null', unlinked.lotId)
  eq('미등록이어도 입력 문자열은 보존', unlinked.lotNo, `${P}없는로트`)

  const wrLinked = await must('POST', '/work-results', {
    process: f.process.name, worker: 'QA', goodQty: 10, defectQty: 0, workTimeMin: 30,
  })
  eq('마스터에 있는 공정명 → processId 연결', wrLinked.processId, f.process.id)

  const wrFree = await must('POST', '/work-results', {
    process: `${P}임시수작업`, worker: 'QA', goodQty: 3, defectQty: 0, workTimeMin: 5,
  })
  isNull('마스터에 없는 자유입력 공정 → processId 는 null', wrFree.processId)
  eq('자유입력 공정명은 보존', wrFree.process, `${P}임시수작업`)
}

/** 설정이 실제로 영속되는지 */
async function scenarioSettings() {
  section('■ 시나리오 5. 환경설정 · 보안정책 영속')

  const before = await must('GET', '/preferences')
  await must('PUT', '/preferences', { ...before, fiscalStart: '04', decimals: 2 })
  const after = await must('GET', '/preferences')
  eq('환경설정이 재조회 후에도 유지', `${after.fiscalStart}/${after.decimals}`, '04/2')
  await must('PUT', '/preferences', before) // 원복

  const sp = await must('GET', '/security-policy')
  await must('PUT', '/security-policy', { ...sp, pwLength: 12 })
  eq('보안정책이 재조회 후에도 유지', (await must('GET', '/security-policy')).pwLength, 12)
  await must('PUT', '/security-policy', sp) // 원복
}

/** 견적 → 발송 → 수주전환 (영업 흐름 시작점) */
async function scenarioQuotation(f) {
  section('■ 시나리오 6. 견적서 → 발송 → 수주전환')

  const quote = await must('POST', '/quotations', {
    partnerId: f.customer.id, quoteDate: '2026-07-14', validUntil: '2026-07-31', taxable: true,
    lines: [{ itemId: f.product.id, quantity: 10, unitPrice: 5000 }],
  })
  eq('신규 견적 상태는 작성', quote.statusName, '작성')
  eq('공급가액 = 수량 × 단가', Number(quote.supplyAmount), 50000)
  eq('부가세 10% 자동계산', Number(quote.vatAmount), 5000)
  eq('합계 = 공급가액 + 부가세', Number(quote.totalAmount), 55000)
  isNull('전환 전에는 수주 연결 없음', quote.convertedOrderId)

  eq('발송 처리 후 상태는 발송', (await must('POST', `/quotations/${quote.id}/send`)).statusName, '발송')

  const order = await must('POST', `/quotations/${quote.id}/convert`)
  eq('전환된 수주는 접수 상태', order.statusName, '접수')
  eq('수주에 견적 거래처가 승계됨', order.partnerId, f.customer.id)
  eq('수주 합계가 견적 합계와 일치', Number(order.totalAmount), 55000)

  const converted = (await must('GET', '/quotations')).find((q) => q.id === quote.id)
  eq('전환 후 견적 상태는 수주전환', converted.statusName, '수주전환')
  eq('견적에 생성된 수주가 FK로 연결됨', converted.convertedOrderId, order.id)

  await rejects('전환된 견적 재전환은 거부', 'POST', `/quotations/${quote.id}/convert`, undefined, '이미')

  const dead = await must('POST', '/quotations', {
    partnerId: f.customer.id, quoteDate: '2026-07-14', taxable: true,
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }],
  })
  await must('POST', `/quotations/${dead.id}/cancel`)
  await rejects('취소된 견적은 수주전환 불가', 'POST', `/quotations/${dead.id}/convert`, undefined, '취소')
}

async function scenarioPurchaseOrder(f) {
  section('■ 시나리오 7. 발주요청 → 발주계획 → 단가확정 → 발주확정 → 입고전환')

  const stockOf = async (itemId) => {
    const rows = await must('GET', '/stock')
    const r = rows.find((x) => x.itemId === itemId && x.warehouseId === f.warehouse.id)
    return r ? Number(r.quantity) : 0
  }
  const before = await stockOf(f.material.id)

  // 단가 미입력 → 품목 기준단가(1000)로 채워진다
  const po = await must('POST', '/purchase-orders', {
    partnerId: f.supplier.id, orderDate: '2026-07-14', dueDate: '2026-07-20', taxable: true,
    lines: [{ itemId: f.material.id, quantity: 30 }],
  })
  eq('신규 발주 상태는 발주요청', po.statusName, '발주요청')
  eq('단가 미입력 시 품목 기준단가로 채움', Number(po.lines[0].unitPrice), 1000)
  isNull('전환 전에는 구매전표 연결 없음', po.convertedPurchaseId)

  await rejects('발주요청 상태에서 바로 입고 불가', 'POST', `/purchase-orders/${po.id}/receive`,
    { warehouseId: f.warehouse.id }, '발주확정')

  eq('발주계획 확정 후 상태는 발주계획',
    (await must('POST', `/purchase-orders/${po.id}/plan`, { dueDate: '2026-07-25' })).statusName, '발주계획')

  const priced = await must('POST', `/purchase-orders/${po.id}/prices`, {
    lines: [{ lineId: po.lines[0].id, unitPrice: 1200 }],
  })
  eq('단가확정 후 상태는 단가확정', priced.statusName, '단가확정')
  eq('확정단가로 공급가액 재계산', Number(priced.supplyAmount), 36000)
  eq('부가세 10% 재계산', Number(priced.vatAmount), 3600)
  eq('합계 = 공급가액 + 부가세', Number(priced.totalAmount), 39600)

  eq('발주확정 후 상태는 발주확정',
    (await must('POST', `/purchase-orders/${po.id}/confirm`)).statusName, '발주확정')

  const purchase = await must('POST', `/purchase-orders/${po.id}/receive`, {
    warehouseId: f.warehouse.id, purchaseDate: '2026-07-14',
  })
  eq('입고 전환 시 구매전표 생성', purchase.docNo.startsWith('PO-'), true)
  eq('구매전표에 발주 매입처가 승계됨', purchase.partnerId, f.supplier.id)
  eq('구매전표 합계가 발주 합계와 일치', Number(purchase.totalAmount), 39600)
  eq('입고전환으로 재고가 발주수량만큼 증가', await stockOf(f.material.id), before + 30)

  const received = (await must('GET', '/purchase-orders')).find((x) => x.id === po.id)
  eq('전환 후 발주 상태는 입고전환', received.statusName, '입고전환')
  eq('발주에 생성된 구매전표가 FK로 연결됨', received.convertedPurchaseId, purchase.id)

  await rejects('입고된 발주 재입고는 거부', 'POST', `/purchase-orders/${po.id}/receive`,
    { warehouseId: f.warehouse.id }, '이미')
  await rejects('입고된 발주는 취소 불가', 'POST', `/purchase-orders/${po.id}/cancel`, undefined, '취소할 수 없습니다')

  const dead = await must('POST', '/purchase-orders', {
    partnerId: f.supplier.id, orderDate: '2026-07-14', taxable: true,
    lines: [{ itemId: f.material.id, quantity: 1, unitPrice: 900 }],
  })
  await must('POST', `/purchase-orders/${dead.id}/cancel`)
  await rejects('취소된 발주는 입고 불가', 'POST', `/purchase-orders/${dead.id}/receive`,
    { warehouseId: f.warehouse.id }, '취소')

  await rejects('매출처에는 발주 불가', 'POST', '/purchase-orders', {
    partnerId: f.customer.id, orderDate: '2026-07-14',
    lines: [{ itemId: f.material.id, quantity: 1, unitPrice: 100 }],
  }, '매입처가 아닌')
}

/** 기타이동 — 자가사용·불량처리(차감) / 재고조정(실사 차이만큼 증감) */
async function scenarioAdjustment(f) {
  section('■ 시나리오 8. 기타이동 (자가사용 · 불량처리 · 재고조정)')

  const stockOf = async () => {
    const rows = await must('GET', '/stock')
    const r = rows.find((x) => x.itemId === f.material.id && x.warehouseId === f.warehouse.id)
    return r ? Number(r.quantity) : 0
  }
  const adjust = (type, body) => must('POST', '/stock-adjustments', {
    type, itemId: f.material.id, warehouseId: f.warehouse.id, adjustDate: '2026-07-14', ...body,
  })

  const before = await stockOf()

  const selfUse = await adjust('SELF_USE', { quantity: 5, reason: 'QA 자가사용' })
  eq('자가사용은 음수 변동', Number(selfUse.quantityChange), -5)
  eq('자가사용 처리 전 잔량이 기록됨', Number(selfUse.beforeQty), before)
  eq('자가사용만큼 재고 차감', await stockOf(), before - 5)

  const defect = await adjust('DEFECT', { quantity: 3, reason: 'QA 불량' })
  eq('불량처리는 음수 변동', Number(defect.quantityChange), -3)
  eq('불량처리만큼 재고 차감', await stockOf(), before - 8)

  const target = before - 20
  const counted = await adjust('ADJUST', { actualQty: target, reason: 'QA 실사' })
  eq('재고조정 변동량 = 실사수량 - 현재고', Number(counted.quantityChange), -12)
  eq('재고조정 후 잔량 = 실사수량', await stockOf(), target)
  eq('처리 후 잔량이 전표에 기록됨', Number(counted.afterQty), target)

  await rejects('현재고보다 많은 자가사용은 거부', 'POST', '/stock-adjustments', {
    type: 'SELF_USE', itemId: f.material.id, warehouseId: f.warehouse.id, quantity: target + 1,
  }, '재고가 부족')
  await rejects('실사수량이 현재고와 같으면 거부', 'POST', '/stock-adjustments', {
    type: 'ADJUST', itemId: f.material.id, warehouseId: f.warehouse.id, actualQty: target,
  }, '차이가 없습니다')

  eq('기타이동 목록에 3건이 남음',
    (await must('GET', '/stock-adjustments')).filter((r) => [selfUse.id, defect.id, counted.id].includes(r.id)).length, 3)
}

async function scenarioWithholding() {
  section('■ 시나리오 9. 급여 원천징수 → 이행상황신고서')

  const employees = await must('GET', '/employees')
  if (employees.length === 0) {
    console.log('  ⏭  사원 마스터가 비어 있어 건너뜁니다.')
    return
  }
  const emp = employees[0]
  const MONTH = '2026-11'   // QA 전용 귀속월 (재실행 시 기존 명세를 재사용한다)

  // 작성 상태의 옛 명세가 남아 있으면 지우고 다시 만든다(원천징수 자동공제 이전에 만들어진 명세일 수 있다).
  // 확정된 명세는 지울 수 없으므로 그대로 재사용한다 → 여러 번 돌려도 안전하다.
  let existing = (await must('GET', `/payslips?month=${MONTH}`)).find((p) => p.employeeId === emp.id)
  if (existing && existing.status === 'DRAFT') {
    await must('DELETE', `/payslips/${existing.id}`)
    existing = undefined
  }
  const slip = existing ?? await must('POST', '/payslips', {
    employeeId: emp.id, payMonth: MONTH, baseSalary: 3000000,
    lines: [{ kind: 'ALLOWANCE', name: '식대', amount: 200000 }],
  })

  const deduction = (name) => {
    const l = slip.lines.find((x) => x.kind === 'DEDUCTION' && x.name === name)
    return l ? Number(l.amount) : 0
  }
  const incomeTax = deduction('소득세')
  const localTax = deduction('지방소득세')

  eq('소득세가 자동 공제됨', incomeTax > 0, true)
  eq('지방소득세 = 소득세의 10%', localTax, Math.floor(incomeTax * 0.1))
  eq('4대보험도 그대로 공제됨', deduction('국민연금') > 0 && deduction('건강보험') > 0, true)
  eq('공제합계 = 각 공제항목의 합',
    Number(slip.deductionTotal),
    slip.lines.filter((l) => l.kind === 'DEDUCTION').reduce((s, l) => s + Number(l.amount), 0))
  eq('실지급액 = 지급총액 − 공제합계',
    Number(slip.netPay), Number(slip.grossPay) - Number(slip.deductionTotal))

  // 확정 전에는 신고 대상이 아니다
  if (!existing) {
    const before = await must('GET', `/withholding/statement?month=${MONTH}`)
    eq('미확정 명세는 신고 인원에서 제외', before.rows.some((r) => r.employeeId === emp.id), false)
    eq('미확정 건수로만 잡힘', before.draftCount > 0, true)
    await must('POST', `/payslips/${slip.id}/confirm`)
  }

  const stmt = await must('GET', `/withholding/statement?month=${MONTH}`)
  const row = stmt.rows.find((r) => r.employeeId === emp.id)
  eq('확정 후 신고서에 사원이 잡힘', Boolean(row), true)
  eq('신고서 소득세가 급여 공제액과 일치', Number(row.incomeTax), incomeTax)
  eq('신고서 지방소득세가 급여 공제액과 일치', Number(row.localIncomeTax), localTax)
  eq('원천징수 합계 = 소득세 + 지방소득세', Number(row.totalWithheld), incomeTax + localTax)
  eq('신고서 합계가 행 합계와 일치',
    Number(stmt.totalWithheld),
    stmt.rows.reduce((s, r) => s + Number(r.totalWithheld), 0))

  const receipts = await must('GET', '/withholding/receipts?year=2026')
  const receipt = receipts.find((r) => r.employeeId === emp.id)
  eq('연간 원천징수영수증에 사원이 잡힘', Boolean(receipt), true)
  eq('영수증 소득세는 월별 합계 이상', Number(receipt.incomeTax) >= incomeTax, true)
  eq('영수증에 사회보험료가 집계됨', Number(receipt.socialInsurance) > 0, true)

  await rejects('귀속월 형식이 틀리면 거부', 'GET', '/withholding/statement?month=2026-13-99', undefined, '귀속월')
}

/** 계좌/카드 — 입출금·카드사용이 복식부기 분개로 옮겨지는지 */
async function scenarioBankCard() {
  section('■ 시나리오 10. 계좌/카드 (입출금 · 카드사용 → 자동 분개)')

  const accounts = await must('GET', '/accounts')
  const byCode = (code) => accounts.find((a) => a.code === code)
  const cash = byCode('101')
  const welfare = byCode('811')

  const accountNo = `${P}110-999-000001`
  const existing = (await must('GET', '/bank-cards/accounts')).find((a) => a.accountNo === accountNo)
  const bank = existing ?? await must('POST', '/bank-cards/accounts', {
    bankName: 'QA은행', accountNo, holder: 'QA법인', openingBalance: 1_000_000,
  })
  eq('예금계정 미지정 시 보통예금(103)', bank.glAccountCode, '103')

  const cardNo = `${P}5310-****-****-0001`
  const existingCard = (await must('GET', '/bank-cards/cards')).find((c) => c.cardNo === cardNo)
  const card = existingCard ?? await must('POST', '/bank-cards/cards', {
    cardName: 'QA법인카드', cardCompany: 'QA카드', cardNo, type: 'CORPORATE',
    settlementAccountId: bank.id, settlementDay: 25,
  })
  eq('카드에 결제계좌가 연결됨', card.settlementAccountId, bank.id)

  const before = (await must('GET', '/bank-cards/accounts')).find((a) => a.id === bank.id).balance

  const deposit = await must('POST', '/bank-cards/transactions', {
    bankAccountId: bank.id, deposit: true, amount: 500_000, counterAccountId: cash.id,
    txnDate: '2026-07-14', description: 'QA 계좌입금',
  })
  eq('입금 후 잔액 = 기존 + 입금액', Number(deposit.balanceAfter), Number(before) + 500_000)
  eq('입금에 회계전표가 붙음', String(deposit.journalDocNo).startsWith('GL-'), 'true')

  const withdraw = await must('POST', '/bank-cards/transactions', {
    bankAccountId: bank.id, deposit: false, amount: 200_000, counterAccountId: cash.id,
    txnDate: '2026-07-14', description: 'QA 계좌출금',
  })
  eq('출금 후 잔액 = 입금 후 - 출금액', Number(withdraw.balanceAfter), Number(deposit.balanceAfter) - 200_000)

  await rejects('잔액보다 많은 출금은 거부', 'POST', '/bank-cards/transactions', {
    bankAccountId: bank.id, deposit: false, amount: Number(withdraw.balanceAfter) + 1, counterAccountId: cash.id,
  }, '잔액이 부족')

  const usage = await must('POST', '/bank-cards/usages', {
    cardId: card.id, merchant: 'QA가맹점', expenseAccountId: welfare.id,
    supplyAmount: 50_000, usageDate: '2026-07-14',
  })
  eq('부가세 미입력 시 공급가액의 10%', Number(usage.vatAmount), 5_000)
  eq('카드사용 합계 = 공급가액 + 부가세', Number(usage.totalAmount), 55_000)
  eq('카드사용에 회계전표가 붙음', String(usage.journalDocNo).startsWith('GL-'), 'true')

  // 카드사용은 차)비용·부가세대급금 / 대)미지급금 — 대변 미지급금이 합계와 같아야 한다
  const entry = await must('GET', `/journals/${usage.journalEntryId}`)
  const payable = entry.lines.find((l) => l.accountCode === '253')
  eq('카드사용 분개의 대변은 미지급금', Number(payable.credit), 55_000)
  eq('카드사용 분개가 대차평형', Number(entry.totalDebit), Number(entry.totalCredit))

  await rejects('중복 계좌번호 등록은 거부', 'POST', '/bank-cards/accounts', {
    bankName: 'QA은행2', accountNo, openingBalance: 0,
  }, '이미 등록된 계좌번호')
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const cmd = process.argv[2] ?? 'all'

  const login = await call('POST', '/auth/login', { username: USER, password: PASS })
  if (!login.ok) {
    console.error(`로그인 실패 (HTTP ${login.status}). 백엔드가 ${BASE} 에서 떠 있는지 확인하세요.`)
    process.exit(2)
  }
  token = login.data.token
  console.log(`로그인: ${login.data.user.name} (${login.data.user.roles.join(',')})`)

  const fixtures = await seed()
  if (cmd === 'seed') {
    console.log('\n시드 완료.')
    return
  }

  await scenarioShipment(fixtures)
  await scenarioPlan(fixtures)
  await scenarioProduction(fixtures)
  await scenarioRelations(fixtures)
  await scenarioSettings()
  await scenarioQuotation(fixtures)
  await scenarioPurchaseOrder(fixtures)
  await scenarioAdjustment(fixtures)
  await scenarioWithholding()
  await scenarioBankCard()

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`통과 ${pass} · 실패 ${fail}`)
  if (fail > 0) {
    console.log('\n실패가 있습니다. 위 ❌ 항목을 확인하세요.')
    process.exit(1)
  }
  console.log('전부 통과했습니다.')
}

main().catch((e) => {
  console.error(`\n중단: ${e.message}`)
  process.exit(2)
})
