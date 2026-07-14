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

/** 고정자산 — 취득 → 월별 감가상각(자동 분개) → 처분(처분손익) */
async function scenarioFixedAsset() {
  section('■ 시나리오 11. 고정자산 (취득 → 감가상각 → 처분)')

  const accounts = await must('GET', '/accounts')
  const machine = accounts.find((a) => a.code === '206')   // 기계장치

  // 1,200만 · 5년 정액법 → 월 상각 20만
  const asset = await must('POST', '/fixed-assets', {
    name: `${P}CNC선반`, assetAccountId: machine.id, acquisitionDate: '2026-01-15',
    acquisitionCost: 12_000_000, salvageValue: 0, usefulLifeYears: 5, method: 'STRAIGHT_LINE',
  })
  eq('신규 자산은 사용중', asset.statusName, '사용중')
  eq('취득 직후 장부가액 = 취득가액', Number(asset.bookValue), 12_000_000)
  eq('취득 직후 상각누계액 0', Number(asset.accumulatedDepreciation), 0)

  await rejects('잔존가액이 취득가액 이상이면 거부', 'POST', '/fixed-assets', {
    name: `${P}불량자산`, assetAccountId: machine.id, acquisitionDate: '2026-01-15',
    acquisitionCost: 1_000_000, salvageValue: 1_000_000, usefulLifeYears: 5, method: 'STRAIGHT_LINE',
  }, '잔존가액')

  await rejects('정률법인데 상각률이 없으면 거부', 'POST', '/fixed-assets', {
    name: `${P}정률자산`, assetAccountId: machine.id, acquisitionDate: '2026-01-15',
    acquisitionCost: 1_000_000, usefulLifeYears: 5, method: 'DECLINING_BALANCE',
  }, '상각률')

  const run = await must('POST', '/fixed-assets/depreciate', { period: '2026-06' })
  const mine = run.rows.find((r) => r.assetId === asset.id)
  eq('정액법 월 상각액 = (취득가-잔존가)/내용연수/12', Number(mine.amount), 200_000)
  eq('상각 후 장부가액 = 취득가 - 누계액', Number(mine.bookValueAfter), 11_800_000)
  eq('상각에 회계전표가 붙음', String(mine.journalDocNo).startsWith('GL-'), 'true')

  const entry = await must('GET', `/journals/${mine.journalEntryId}`)
  const expense = entry.lines.find((l) => l.accountCode === '818')
  const accumulated = entry.lines.find((l) => l.accountCode === '203')
  eq('상각 분개 차변은 감가상각비', Number(expense.debit), 200_000)
  eq('상각 분개 대변은 감가상각누계액', Number(accumulated.credit), 200_000)

  const again = await must('POST', '/fixed-assets/depreciate', { period: '2026-06' })
  eq('같은 달 재실행은 이중 상각하지 않음', again.rows.filter((r) => r.assetId === asset.id).length, 0)

  await rejects('귀속월 형식이 틀리면 거부', 'POST', '/fixed-assets/depreciate', { period: '2026-13' }, '귀속월')

  // 장부가 11,800,000 을 12,000,000 에 처분 → 처분이익 200,000
  const disposed = await must('POST', `/fixed-assets/${asset.id}/dispose`, {
    disposalDate: '2026-07-14', disposalAmount: 12_000_000,
  })
  eq('처분 후 상태는 처분', disposed.statusName, '처분')

  const journals = await must('GET', '/journals?from=2026-07-01&to=2026-07-31')
  const disposal = journals.find((j) => j.sourceType === 'DISPOSAL' && j.sourceId === asset.id)
  const gain = disposal.lines.find((l) => l.accountCode === '914')
  eq('처분이익 = 처분가액 - 장부가액', Number(gain.credit), 200_000)
  eq('처분 분개가 대차평형', Number(disposal.totalDebit), Number(disposal.totalCredit))

  await rejects('처분된 자산 재처분은 거부', 'POST', `/fixed-assets/${asset.id}/dispose`,
    { disposalDate: '2026-07-15', disposalAmount: 0 }, '이미 처분')
}

async function scenarioNote(f) {
  section('■ 시나리오 12. 어음 — 수취/발행 → 만기결제 · 할인 · 부도')

  // 결제·할인 대금이 오갈 계좌 (기타 시나리오와 섞이지 않게 어음 전용 계좌를 쓴다)
  const accountNo = `${P}110-999-000002`
  const bank = (await must('GET', '/bank-cards/accounts')).find((a) => a.accountNo === accountNo)
    ?? await must('POST', '/bank-cards/accounts', {
      bankName: 'QA은행', accountNo, holder: 'QA법인', openingBalance: 1_000_000,
    })
  const balanceOf = async () => Number((await must('GET', '/bank-cards/accounts')).find((a) => a.id === bank.id).balance)
  // 어음 전표는 수취분만 sourceId 로 연결되고, 할인료·부도 전표는 적요의 어음번호로 찾는다.
  const journalsOf = async (noteNo) =>
    (await must('GET', '/journals?from=2026-01-01&to=2026-12-31'))
      .filter((j) => j.sourceType === 'NOTE' && String(j.description).includes(noteNo))

  // ── 받을어음: 수취 → 만기결제
  const recv = await must('POST', '/notes', {
    type: 'RECEIVABLE', partnerId: f.customer.id, issueDate: '2026-07-14', dueDate: '2026-09-14',
    amount: 500000, bankName: 'QA은행',
  })
  eq('신규 어음 상태는 보유', recv.statusName, '보유')
  eq('받을어음 번호는 BN- 접두어', recv.noteNo.startsWith('BN-'), true)

  const issueEntries = await journalsOf(recv.noteNo)
  eq('수취 시 분개가 생성됨', issueEntries.length >= 1, true)
  const issue = issueEntries[0]
  eq('받을어음 수취 분개 차변은 받을어음(110)', issue.lines.find((l) => Number(l.debit) > 0).accountCode, '110')
  eq('받을어음 수취 분개 대변은 외상매출금(108)', issue.lines.find((l) => Number(l.credit) > 0).accountCode, '108')

  const beforeSettle = await balanceOf()
  const settled = await must('POST', `/notes/${recv.id}/settle`, { bankAccountId: bank.id, settleDate: '2026-09-14' })
  eq('만기결제 후 상태는 결제완료', settled.statusName, '결제완료')
  eq('만기결제로 계좌 잔액이 어음 금액만큼 증가', await balanceOf(), beforeSettle + 500000)

  await rejects('결제된 어음 재결제는 거부', 'POST', `/notes/${recv.id}/settle`, { bankAccountId: bank.id }, '이미')

  // ── 받을어음: 할인 (할인료는 매출채권처분손실)
  const disc = await must('POST', '/notes', {
    type: 'RECEIVABLE', partnerId: f.customer.id, issueDate: '2026-07-14', dueDate: '2026-10-14', amount: 300000,
  })
  const beforeDiscount = await balanceOf()
  const discounted = await must('POST', `/notes/${disc.id}/discount`, {
    bankAccountId: bank.id, discountFee: 12000, discountDate: '2026-08-01',
  })
  eq('할인 후 상태는 할인', discounted.statusName, '할인')
  eq('할인 입금액 = 어음금액 - 할인료', await balanceOf(), beforeDiscount + 300000 - 12000)

  const feeEntry = (await journalsOf(disc.noteNo)).find((j) => j.lines.some((l) => l.accountCode === '936'))
  eq('할인료가 매출채권처분손실(936)로 분개', Boolean(feeEntry), true)
  eq('할인료 분개가 대차평형', Number(feeEntry.totalDebit), Number(feeEntry.totalCredit))

  const tooCheap = await must('POST', '/notes', {
    type: 'RECEIVABLE', partnerId: f.customer.id, issueDate: '2026-07-14', dueDate: '2026-12-01', amount: 10000,
  })
  await rejects('할인료가 어음 금액 이상이면 거부', 'POST', `/notes/${tooCheap.id}/discount`,
    { bankAccountId: bank.id, discountFee: 10000 }, '할인료가 어음 금액 이상')

  // ── 받을어음: 부도 → 외상매출금 환원
  const bad = await must('POST', '/notes', {
    type: 'RECEIVABLE', partnerId: f.customer.id, issueDate: '2026-07-14', dueDate: '2026-11-14', amount: 200000,
  })
  const beforeDishonor = await balanceOf()
  const dishonored = await must('POST', `/notes/${bad.id}/dishonor`, { dishonorDate: '2026-11-15' })
  eq('부도 후 상태는 부도', dishonored.statusName, '부도')
  eq('부도는 현금이 오가지 않음', await balanceOf(), beforeDishonor)

  const dishonorEntry = (await journalsOf(bad.noteNo)).find((j) => j.description.includes('부도'))
  eq('부도 분개 차변은 외상매출금(108)', dishonorEntry.lines.find((l) => Number(l.debit) > 0).accountCode, '108')
  eq('부도 분개 대변은 받을어음(110)', dishonorEntry.lines.find((l) => Number(l.credit) > 0).accountCode, '110')

  // ── 지급어음: 발행 → 만기결제(출금)
  const pay = await must('POST', '/notes', {
    type: 'PAYABLE', partnerId: f.supplier.id, issueDate: '2026-07-14', dueDate: '2026-09-30', amount: 150000,
  })
  const payIssue = (await journalsOf(pay.noteNo))[0]
  eq('지급어음 발행 차변은 외상매입금(251)', payIssue.lines.find((l) => Number(l.debit) > 0).accountCode, '251')
  eq('지급어음 발행 대변은 지급어음(252)', payIssue.lines.find((l) => Number(l.credit) > 0).accountCode, '252')

  // 할인·부도는 받을어음 전용 (보유 상태에서 확인해야 상태 검증이 아닌 유형 검증에 걸린다)
  await rejects('지급어음은 할인 불가', 'POST', `/notes/${pay.id}/discount`,
    { bankAccountId: bank.id, discountFee: 0 }, '받을어음만')
  await rejects('지급어음은 부도 처리 불가', 'POST', `/notes/${pay.id}/dishonor`, {}, '받을어음만')

  const beforePay = await balanceOf()
  await must('POST', `/notes/${pay.id}/settle`, { bankAccountId: bank.id, settleDate: '2026-09-30' })
  eq('지급어음 결제로 계좌 잔액이 감소', await balanceOf(), beforePay - 150000)

  // ── 요약: 보유 어음만 집계
  const summary = await must('GET', '/notes')
  const held = summary.notes.filter((n) => n.status === 'HELD')
  eq('보유 어음 합계 = 받을 + 지급 잔액',
    Number(summary.receivableHeld) + Number(summary.payableHeld),
    held.reduce((s, n) => s + Number(n.amount), 0))
  await rejects('만기일이 발행일보다 빠르면 거부', 'POST', '/notes', {
    type: 'RECEIVABLE', partnerId: f.customer.id, issueDate: '2026-07-14', dueDate: '2026-07-01', amount: 1000,
  }, '만기일')
}

/** FastEntry 간편전표 — 지출결의서 · 입금보고서 · 가지급금정산서 */
async function scenarioFastVoucher() {
  section('■ 시나리오 13. FastEntry (지출결의서 · 입금보고서 · 가지급금정산서)')

  const accounts = await must('GET', '/accounts')
  const byCode = (c) => accounts.find((a) => a.code === c)
  const welfare = byCode('811')      // 복리후생비
  const travel = byCode('812')       // 여비교통비
  const revenue = byCode('401')      // 상품매출

  const accountNo = `${P}220-888-000002`
  const banks = await must('GET', '/bank-cards/accounts')
  const bank = banks.find((b) => b.accountNo === accountNo)
    ?? await must('POST', '/bank-cards/accounts', {
      bankName: 'QA은행', accountNo, holder: 'QA법인', openingBalance: 1_000_000,
    })
  const balanceOf = async () => Number((await must('GET', '/bank-cards/accounts')).find((b) => b.id === bank.id).balance)
  const before = await balanceOf()

  // 지출결의서 — 현금, 두 줄
  const expense = await must('POST', '/vouchers', {
    type: 'EXPENSE_REPORT', method: 'CASH', voucherDate: '2026-07-14',
    lines: [{ accountId: welfare.id, amount: 30_000 }, { accountId: travel.id, amount: 20_000 }],
  })
  eq('지출결의서 합계 = 라인 합', Number(expense.totalAmount), 50_000)
  eq('지출결의서에 회계전표가 붙음', String(expense.journalDocNo).startsWith('GL-'), 'true')

  const expenseEntry = await must('GET', `/journals/${expense.journalEntryId}`)
  eq('지출 분개 차변에 비용 2줄', expenseEntry.lines.filter((l) => Number(l.debit) > 0).length, 2)
  eq('지출 분개 대변은 현금 총액',
    Number(expenseEntry.lines.find((l) => l.accountCode === '101').credit), 50_000)
  eq('지출 분개가 대차평형', Number(expenseEntry.totalDebit), Number(expenseEntry.totalCredit))

  // 지출결의서 — 계좌 결제는 잔액도 깎는다
  await must('POST', '/vouchers', {
    type: 'EXPENSE_REPORT', method: 'BANK', bankAccountId: bank.id, voucherDate: '2026-07-14',
    lines: [{ accountId: travel.id, amount: 100_000 }],
  })
  eq('계좌 지출은 계좌 잔액을 깎음', await balanceOf(), before - 100_000)

  // 입금보고서 — 계좌 입금
  const deposit = await must('POST', '/vouchers', {
    type: 'DEPOSIT_REPORT', method: 'BANK', bankAccountId: bank.id, voucherDate: '2026-07-14',
    lines: [{ accountId: revenue.id, amount: 500_000 }],
  })
  eq('계좌 입금은 계좌 잔액을 늘림', await balanceOf(), before - 100_000 + 500_000)

  const depositEntry = await must('GET', `/journals/${deposit.journalEntryId}`)
  eq('입금 분개 차변은 예금계정',
    Number(depositEntry.lines.find((l) => l.accountCode === '103').debit), 500_000)
  eq('입금 분개 대변은 매출', Number(depositEntry.lines.find((l) => l.accountCode === '401').credit), 500_000)

  // 가지급금정산서 — 20만 지급, 15만 사용 → 5만 반납
  const settle = await must('POST', '/vouchers', {
    type: 'ADVANCE_SETTLEMENT', method: 'CASH', advanceAmount: 200_000, voucherDate: '2026-07-14',
    lines: [{ accountId: travel.id, amount: 150_000 }],
  })
  eq('정산 잔액 = 가지급금 − 사용액', Number(settle.balance), 50_000)

  const settleEntry = await must('GET', `/journals/${settle.journalEntryId}`)
  eq('정산 분개 대변은 가지급금 전액',
    Number(settleEntry.lines.find((l) => l.accountCode === '134').credit), 200_000)
  eq('반납액은 현금 차변으로 돌아옴',
    Number(settleEntry.lines.find((l) => l.accountCode === '101').debit), 50_000)
  eq('정산 분개가 대차평형', Number(settleEntry.totalDebit), Number(settleEntry.totalCredit))

  await rejects('가지급금 없이 정산서는 거부', 'POST', '/vouchers', {
    type: 'ADVANCE_SETTLEMENT', method: 'CASH',
    lines: [{ accountId: travel.id, amount: 1_000 }],
  }, '가지급금')

  await rejects('계좌 결제인데 계좌 미선택이면 거부', 'POST', '/vouchers', {
    type: 'EXPENSE_REPORT', method: 'BANK',
    lines: [{ accountId: travel.id, amount: 1_000 }],
  }, '계좌를 선택')

  await rejects('내역이 없으면 거부', 'POST', '/vouchers', {
    type: 'EXPENSE_REPORT', method: 'CASH', lines: [],
  }, '내역')
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
  await scenarioFixedAsset()
  await scenarioNote(fixtures)
  await scenarioFastVoucher()

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
