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

/** 비현금거래(대체전표) — 상계 · 대손 · 미지급 계상 · 계정대체 */
async function scenarioNonCash() {
  section('■ 시나리오 14. 비현금거래 (대체전표)')

  const accounts = await must('GET', '/accounts')
  const byCode = (c) => accounts.find((a) => a.code === c)
  const travel = byCode('812')     // 여비교통비
  const supplies = byCode('830')   // 소모품비
  const goods = byCode('146')      // 상품
  const cash = byCode('101')       // 현금

  const linesOf = async (id) => (await must('GET', `/journals/${id}`)).lines

  const offset = await must('POST', '/non-cash', { type: 'OFFSET', amount: 300_000, txnDate: '2026-07-14' })
  eq('상계는 차)외상매입금', offset.debitAccountCode, '251')
  eq('상계는 대)외상매출금', offset.creditAccountCode, '108')
  eq('상계에 회계전표가 붙음', String(offset.journalDocNo).startsWith('GL-'), 'true')

  const badDebt = await must('POST', '/non-cash', { type: 'BAD_DEBT', amount: 150_000, txnDate: '2026-07-14' })
  eq('대손은 차)대손상각비', badDebt.debitAccountCode, '835')
  const badLines = await linesOf(badDebt.journalEntryId)
  eq('대손 분개 대변은 외상매출금',
    Number(badLines.find((l) => l.accountCode === '108').credit), 150_000)

  const accrual = await must('POST', '/non-cash', {
    type: 'ACCRUAL', amount: 80_000, debitAccountId: travel.id, txnDate: '2026-07-14',
  })
  eq('미지급 계상은 대)미지급금', accrual.creditAccountCode, '253')
  const accrualLines = await linesOf(accrual.journalEntryId)
  eq('미지급 계상 분개 차변은 선택한 비용계정',
    Number(accrualLines.find((l) => l.accountCode === '812').debit), 80_000)

  const transfer = await must('POST', '/non-cash', {
    type: 'TRANSFER', amount: 50_000, debitAccountId: supplies.id, creditAccountId: goods.id,
    txnDate: '2026-07-14',
  })
  const transferEntry = await must('GET', `/journals/${transfer.journalEntryId}`)
  eq('계정대체는 지정한 차/대변 그대로', `${transfer.debitAccountCode}/${transfer.creditAccountCode}`, '830/146')
  eq('대체 분개가 대차평형', Number(transferEntry.totalDebit), Number(transferEntry.totalCredit))

  await rejects('현금 계정은 비현금거래에 쓸 수 없음', 'POST', '/non-cash', {
    type: 'TRANSFER', amount: 1_000, debitAccountId: cash.id, creditAccountId: goods.id,
  }, '현금성 계정')

  await rejects('차변과 대변이 같으면 거부', 'POST', '/non-cash', {
    type: 'TRANSFER', amount: 1_000, debitAccountId: goods.id, creditAccountId: goods.id,
  }, '같은 계정')

  await rejects('미지급 계상에 비용계정이 없으면 거부', 'POST', '/non-cash', {
    type: 'ACCRUAL', amount: 1_000,
  }, '비용계정')
}

async function scenarioBudget() {
  section('■ 시나리오 15. 예산관리 · 자금계획 (계획 대비 실적)')

  const PERIOD = '2026-05'          // QA 전용 귀속월 (다른 시나리오 전표와 섞이지 않게 과거 달을 쓴다)
  const FROM = '2026-05-01'
  const accounts = await must('GET', '/accounts')
  const welfare = accounts.find((a) => a.code === '811')   // 복리후생비 (비용)

  // 이미 편성된 예산이 있으면 지우고 다시 잡는다.
  // 전표는 실행할 때마다 쌓이므로(삭제 API가 없다) 예산액을 '기존 집행액 + 여유'로 잡아야
  // 몇 번을 돌려도 같은 결론이 나온다. 고정 금액을 쓰면 누적 집행액이 언젠가 예산을 넘어 깨진다.
  const before = await must('GET', `/budgets?period=${PERIOD}`)
  for (const row of before.rows) await must('DELETE', `/budgets/${row.id}`)

  const SPEND = 300_000
  const MARGIN = 200_000
  const spendBefore = Number(before.rows.find((r) => r.accountId === welfare.id)?.actual ?? 0)
  const BUDGET = spendBefore + SPEND + MARGIN

  const budget = await must('POST', '/budgets', {
    period: PERIOD, accountId: welfare.id, amount: BUDGET, remark: 'QA 복리후생 예산',
  })
  eq('편성 직후 예산액이 그대로', Number(budget.amount), BUDGET)
  eq('편성 시점 집행액은 기존 전표 집계', Number(budget.actual), spendBefore)

  await rejects('같은 달 같은 계정 이중 편성은 거부', 'POST', '/budgets', {
    period: PERIOD, accountId: welfare.id, amount: 500_000,
  }, '이미 편성')

  // 그 달에 복리후생비 전표를 하나 끊고, 집행실적이 따라오는지 본다
  await must('POST', '/journals', {
    entryDate: FROM, description: 'QA 예산 집행 테스트',
    lines: [
      { accountId: welfare.id, debit: SPEND },
      { accountId: accounts.find((a) => a.code === '101').id, credit: SPEND },
    ],
  })

  const status = await must('GET', `/budgets?period=${PERIOD}`)
  const row = status.rows.find((r) => r.accountId === welfare.id)
  eq('집행실적이 회계전표에서 집계됨', Number(row.actual), spendBefore + SPEND)
  eq('잔여 = 편성액 - 집행액', Number(row.remaining), BUDGET - Number(row.actual))
  eq('잔여가 여유분과 일치', Number(row.remaining), MARGIN)
  eq('집행률 = 집행액 / 편성액 × 100', Number(row.executionRate),
    Math.round(Number(row.actual) / BUDGET * 1000) / 10)
  eq('예산 내면 초과 아님', row.over, false)
  eq('합계가 행 합계와 일치', Number(status.totalActual),
    status.rows.reduce((s, r) => s + Number(r.actual), 0))

  // 예산액을 집행액보다 낮추면 초과로 잡힌다
  const lowered = await must('PUT', `/budgets/${budget.id}`, { amount: Number(row.actual) - 1 })
  eq('편성액 수정이 반영됨', Number(lowered.amount), Number(row.actual) - 1)
  eq('집행액이 편성액을 넘으면 초과', lowered.over, true)
  eq('초과 시 잔여는 음수', Number(lowered.remaining) < 0, true)

  await rejects('귀속월 형식이 틀리면 거부', 'GET', '/budgets?period=2026-13', undefined, '귀속월')

  // ── 자금계획
  const plans = await must('GET', `/cash-plans?period=${PERIOD}`)
  for (const p of plans.plans) await must('DELETE', `/cash-plans/${p.id}`)

  await must('POST', '/cash-plans', { period: PERIOD, type: 'INFLOW', category: 'QA 매출대금 회수', amount: 5_000_000 })
  await must('POST', '/cash-plans', { period: PERIOD, type: 'OUTFLOW', category: 'QA 급여 지급', amount: 3_000_000 })
  await must('POST', '/cash-plans', { period: PERIOD, type: 'OUTFLOW', category: 'QA 임차료', amount: 500_000 })

  const cash = await must('GET', `/cash-plans?period=${PERIOD}`)
  eq('수입 계획 합계', Number(cash.plannedInflow), 5_000_000)
  eq('지출 계획 합계', Number(cash.plannedOutflow), 3_500_000)
  eq('계획 수지 = 수입 - 지출', Number(cash.plannedNet), 1_500_000)
  eq('실적 수지 = 실제 입금 - 출금', Number(cash.actualNet),
    Number(cash.actualInflow) - Number(cash.actualOutflow))
  eq('수입 차이 = 실적 - 계획', Number(cash.inflowDiff),
    Number(cash.actualInflow) - Number(cash.plannedInflow))
  eq('계획 3건이 목록에 있음', cash.plans.length, 3)
}

async function scenarioMail() {
  section('■ 시나리오 16. 공용메일 (사내메일 · 공용메일함 배정→처리)')

  const users = await must('GET', '/users')
  const me = users.find((u) => u.username === USER)
  const other = users.find((u) => u.id !== me.id)
  if (!other) {
    console.log('  ⏭  사용자가 1명뿐이라 사내메일 발송을 건너뜁니다.')
  } else {
    const mail = await must('POST', '/mails', {
      recipientId: other.id, subject: 'QA 사내메일', body: '테스트 본문',
    })
    eq('발송 직후 상태는 미읽음', mail.statusName, '미읽음')
    eq('발신함에 내가 보낸 메일이 있음',
      (await must('GET', '/mails/sent')).some((m) => m.id === mail.id), true)
    eq('내 수신함에는 없음(남에게 보낸 메일)',
      (await must('GET', '/mails/inbox')).some((m) => m.id === mail.id), false)

    await rejects('받는 사람이 아니면 읽음 처리 불가', 'POST', `/mails/${mail.id}/read`, undefined, '받는 사람만')
    await rejects('공용메일이 아니면 담당자 배정 불가', 'POST', `/mails/${mail.id}/assign`,
      { assigneeId: me.id }, '공용메일만')
  }

  await rejects('자기 자신에게는 보낼 수 없음', 'POST', '/mails', {
    recipientId: me.id, subject: 'QA 자기발송', body: '',
  }, '자기 자신')

  // ── 공용메일함: 수신등록 → 담당자 배정 → 처리
  const pendingBefore = (await must('GET', '/mails/shared')).pendingCount

  const shared = await must('POST', '/mails/shared', {
    fromAddress: 'buyer@qa-partner.co.kr', subject: 'QA 견적 문의', body: '견적 부탁드립니다.',
  })
  eq('공용메일 등록 직후 상태는 미읽음', shared.statusName, '미읽음')
  isNull('등록 직후 담당자 없음', shared.assigneeId)
  eq('미처리 건수가 1 늘어남', (await must('GET', '/mails/shared')).pendingCount, pendingBefore + 1)

  await rejects('담당자 없이 처리 완료는 거부', 'POST', `/mails/${shared.id}/handle`,
    { note: '처리' }, '담당자가 배정되지')

  if (other) {
    await must('POST', `/mails/${shared.id}/assign`, { assigneeId: other.id })
    await rejects('배정된 담당자가 아니면 처리 불가', 'POST', `/mails/${shared.id}/handle`,
      { note: '남의 메일 처리' }, '배정된 담당자')
  }

  const assigned = await must('POST', `/mails/${shared.id}/assign`, { assigneeId: me.id })
  eq('배정 후 상태는 처리중', assigned.statusName, '처리중')
  eq('담당자가 연결됨', assigned.assigneeId, me.id)

  const handled = await must('POST', `/mails/${shared.id}/handle`, { note: 'QA 견적서 회신 완료' })
  eq('처리 후 상태는 처리완료', handled.statusName, '처리완료')
  eq('처리 메모가 남음', handled.handleNote, 'QA 견적서 회신 완료')
  eq('처리 시각이 기록됨', typeof handled.handledAt, 'string')

  await rejects('처리완료된 메일 재처리는 거부', 'POST', `/mails/${shared.id}/handle`,
    { note: '재처리' }, '이미 처리완료')
  await rejects('처리완료된 메일 재배정은 거부', 'POST', `/mails/${shared.id}/assign`,
    { assigneeId: me.id }, '이미 처리완료')

  eq('처리 후 미처리 건수가 원래대로', (await must('GET', '/mails/shared')).pendingCount, pendingBefore)
}

/** 수표관리 — 받은수표(수취 → 입금/부도) · 발행수표(발행 → 결제확인) */
async function scenarioCheck(f) {
  section('■ 시나리오 17. 수표관리 (받은수표 · 발행수표)')

  const accountNo = `${P}330-777-000003`
  const banks = await must('GET', '/bank-cards/accounts')
  const bank = banks.find((b) => b.accountNo === accountNo)
    ?? await must('POST', '/bank-cards/accounts', {
      bankName: 'QA은행', accountNo, holder: 'QA법인', openingBalance: 1_000_000,
    })
  const balanceOf = async () => Number((await must('GET', '/bank-cards/accounts')).find((b) => b.id === bank.id).balance)
  const before = await balanceOf()

  // 수표번호는 유니크다. 계좌 잔액에서 뽑으면(입금 후 출금으로 되돌아와) 매 실행 같은 번호가 나와
  // 두 번째 실행부터 중복으로 막힌다. 이미 쓴 번호를 보고 빈 번호를 잡는다.
  const usedNos = new Set((await must('GET', '/checks')).map((c) => c.checkNo))
  const freeNo = (kind) => {
    let i = 1
    let no
    do { no = `${P}${kind}-${String(i).padStart(6, '0')}`; i++ } while (usedNos.has(no))
    usedNos.add(no)
    return no
  }
  const receivedNo = freeNo('R')
  const dishonorNo = freeNo('D')
  const issuedNo = freeNo('I')
  const linesOf = async (id) => (await must('GET', `/journals/${id}`)).lines

  // 받은수표 수취 → 차)받을수표 / 대)외상매출금
  const received = await must('POST', '/checks', {
    type: 'RECEIVED', checkNo: receivedNo, amount: 500_000,
    bankName: 'QA은행', issueDate: '2026-07-14', partnerId: f.customer.id,
  })
  eq('신규 수표 상태는 보유', received.statusName, '보유')

  const journals = await must('GET', '/journals?from=2026-07-01&to=2026-07-31')
  const receiptEntry = journals.find((j) => j.sourceType === 'CHECK' && j.sourceId === received.id)
  eq('수취 분개 차변은 받을수표(104)',
    Number(receiptEntry.lines.find((l) => l.accountCode === '104').debit), 500_000)
  eq('수취 분개 대변은 외상매출금(108)',
    Number(receiptEntry.lines.find((l) => l.accountCode === '108').credit), 500_000)

  // 입금 → 예금 증가, 받을수표 소멸
  const deposited = await must('POST', `/checks/${received.id}/deposit`, {
    bankAccountId: bank.id, depositDate: '2026-07-14',
  })
  eq('입금 후 상태는 입금완료', deposited.statusName, '입금완료')
  eq('입금하면 계좌 잔액이 수표 금액만큼 증가', await balanceOf(), before + 500_000)

  await rejects('입금된 수표 재입금은 거부', 'POST', `/checks/${received.id}/deposit`,
    { bankAccountId: bank.id }, '이미')

  // 부도 → 현금 없이 외상매출금으로 환원
  const dishonored = await must('POST', '/checks', {
    type: 'RECEIVED', checkNo: dishonorNo, amount: 200_000, issueDate: '2026-07-14',
  })
  const balanceBeforeDishonor = await balanceOf()
  await must('POST', `/checks/${dishonored.id}/dishonor`, { settledDate: '2026-07-14' })
  eq('부도는 계좌 잔액을 건드리지 않음', await balanceOf(), balanceBeforeDishonor)

  const after = await must('GET', '/checks')
  eq('부도 후 상태는 부도', after.find((c) => c.id === dishonored.id).statusName, '부도')

  // 발행수표 → 끊는 순간 예금이 빠진다
  const issued = await must('POST', '/checks', {
    type: 'ISSUED', checkNo: issuedNo, amount: 300_000,
    bankAccountId: bank.id, issueDate: '2026-07-14', partnerId: f.supplier.id,
  })
  eq('발행하면 계좌 잔액이 수표 금액만큼 감소', await balanceOf(), before + 500_000 - 300_000)

  const issueLines = await linesOf(
    (await must('GET', '/journals?from=2026-07-01&to=2026-07-31'))
      .find((j) => j.sourceType === 'CHECK' && j.sourceId === issued.id).id)
  eq('발행 분개 차변은 외상매입금(251)',
    Number(issueLines.find((l) => l.accountCode === '251').debit), 300_000)

  eq('결제 확인 후 상태는 결제완료',
    (await must('POST', `/checks/${issued.id}/settle`, { settledDate: '2026-07-15' })).statusName, '결제완료')

  await rejects('발행수표는 부도 처리할 수 없음', 'POST', `/checks/${issued.id}/dishonor`, {}, '받은수표만')
  await rejects('받은수표는 결제 확인 대상이 아님', 'POST', `/checks/${dishonored.id}/settle`, {}, '발행수표만')
  await rejects('중복 수표번호는 거부', 'POST', '/checks', {
    type: 'RECEIVED', checkNo: receivedNo, amount: 1_000,
  }, '이미 등록된 수표번호')
  await rejects('발행수표에 계좌가 없으면 거부', 'POST', '/checks', {
    type: 'ISSUED', checkNo: freeNo('X'), amount: 1_000,
  }, '당좌계좌')
}

/** 계약관리 · 전자계약 — 작성 → 서명요청 → 전자서명 → 해지 */
async function scenarioContract(f) {
  section('■ 시나리오 18. 계약관리 · 전자계약')

  const contract = await must('POST', '/contracts', {
    title: `${P}연간 공급계약`, type: 'SALES', partnerId: f.customer.id,
    startDate: '2026-07-01', endDate: '2026-12-31', amount: 50_000_000,
    paymentTerms: '월말 마감 익월 10일 지급',
  })
  eq('신규 계약 상태는 작성', contract.statusName, '작성')
  eq('계약번호는 CT- 접두어', String(contract.contractNo).startsWith('CT-'), 'true')
  isNull('작성 단계에는 서명 기록이 없음', contract.signedAt)

  await rejects('작성 상태에서 바로 서명은 거부', 'POST', `/contracts/${contract.id}/sign`,
    { signerName: '김대표', agreement: '동의합니다.' }, '서명요청 상태에서만')

  eq('서명요청 후 상태는 서명요청',
    (await must('POST', `/contracts/${contract.id}/send`)).statusName, '서명요청')

  const signed = await must('POST', `/contracts/${contract.id}/sign`, {
    signerName: '김대표', agreement: '본 계약 내용에 동의합니다.',
  })
  eq('전자서명 후 상태는 서명완료', signed.statusName, '서명완료')
  eq('서명자가 기록됨', signed.signerName, '김대표')
  eq('동의문구가 그대로 보관됨', signed.agreement, '본 계약 내용에 동의합니다.')
  eq('서명일시가 남음', typeof signed.signedAt, 'string')

  await rejects('서명완료 계약 재서명은 거부', 'POST', `/contracts/${contract.id}/sign`,
    { signerName: 'X', agreement: 'Y' }, '서명요청 상태에서만')

  const terminated = await must('POST', `/contracts/${contract.id}/terminate`, {
    reason: '합의 해지', terminatedDate: '2026-07-14',
  })
  eq('해지 후 상태는 해지', terminated.statusName, '해지')
  eq('해지 사유가 기록됨', terminated.terminationReason, '합의 해지')

  await rejects('해지된 계약 재해지는 거부', 'POST', `/contracts/${contract.id}/terminate`,
    { reason: '또 해지' }, '서명완료 상태에서만')

  await rejects('종료일이 시작일보다 빠르면 거부', 'POST', '/contracts', {
    title: `${P}잘못된 계약`, type: 'SALES', partnerId: f.customer.id,
    startDate: '2026-08-01', endDate: '2026-07-01', amount: 1_000,
  }, '종료일')

  // 서명 전 계약은 해지 대상이 아니다 — 그냥 두면 된다
  const draft = await must('POST', '/contracts', {
    title: `${P}미서명 계약`, type: 'PURCHASE', partnerId: f.supplier.id,
    startDate: '2026-07-01', endDate: '2026-09-30', amount: 1_000_000,
  })
  await rejects('서명 전 계약은 해지할 수 없음', 'POST', `/contracts/${draft.id}/terminate`,
    { reason: '취소' }, '서명완료 상태에서만')
}

async function scenarioIncome() {
  section('■ 시나리오 19. 수입비용 (수입등록 자동분개 · 수입비용현황)')

  const FROM = '2026-04-01'
  const TO = '2026-04-30'
  const accounts = await must('GET', '/accounts')
  const interest = accounts.find((a) => a.code === '901')     // 이자수익 (수익)
  const welfare = accounts.find((a) => a.code === '811')      // 복리후생비 (비용)

  eq('수입용 영업외수익 계정이 시드됨', Boolean(interest), true)

  await rejects('수익 계정이 아니면 수입 등록 거부', 'POST', '/incomes', {
    incomeDate: FROM, accountId: welfare.id, content: 'QA 잘못된 계정', amount: 1000, receiptMethod: 'CASH',
  }, '수익 계정에만')

  await rejects('계좌입금인데 계좌 미지정이면 거부', 'POST', '/incomes', {
    incomeDate: FROM, accountId: interest.id, content: 'QA 계좌 미지정', amount: 1000, receiptMethod: 'BANK',
  }, '계좌를 선택')

  // ── 현금 수입: 차)현금 / 대)이자수익
  const before = await must('GET', `/incomes/status?from=${FROM}&to=${TO}`)
  const cash = await must('POST', '/incomes', {
    incomeDate: FROM, accountId: interest.id, content: 'QA 예금이자', amount: 50_000, receiptMethod: 'CASH',
  })
  eq('현금 수입에 회계전표가 붙음', typeof cash.journalDocNo, 'string')

  const journal = await must('GET', `/journals/${cash.journalEntryId}`)
  eq('현금 수입 분개 차변은 현금(101)', journal.lines.find((l) => Number(l.debit) > 0).accountCode, '101')
  eq('현금 수입 분개 대변은 이자수익(901)', journal.lines.find((l) => Number(l.credit) > 0).accountCode, '901')
  eq('분개가 대차평형', Number(journal.totalDebit), Number(journal.totalCredit))

  // ── 계좌 수입: 계좌 잔액이 함께 오른다
  const accountNo = `${P}110-999-000003`
  const bank = (await must('GET', '/bank-cards/accounts')).find((a) => a.accountNo === accountNo)
    ?? await must('POST', '/bank-cards/accounts', {
      bankName: 'QA은행', accountNo, holder: 'QA법인', openingBalance: 0,
    })
  const balanceBefore = Number((await must('GET', '/bank-cards/accounts')).find((a) => a.id === bank.id).balance)

  const banked = await must('POST', '/incomes', {
    incomeDate: FROM, accountId: interest.id, content: 'QA 계좌이자', amount: 30_000,
    receiptMethod: 'BANK', bankAccountId: bank.id,
  })
  eq('계좌 수입만큼 잔액 증가',
    Number((await must('GET', '/bank-cards/accounts')).find((a) => a.id === bank.id).balance),
    balanceBefore + 30_000)
  eq('계좌 수입에도 전표가 붙음', typeof banked.journalDocNo, 'string')

  await rejects('계좌입금 수입은 삭제 불가(잔액이 이미 움직임)', 'DELETE', `/incomes/${banked.id}`,
    undefined, '삭제할 수 없습니다')

  // ── 외상 수입: 차)외상매출금 / 대)수익
  const credit = await must('POST', '/incomes', {
    incomeDate: FROM, accountId: interest.id, content: 'QA 미수이자', amount: 20_000, receiptMethod: 'CREDIT',
  })
  const creditJournal = await must('GET', `/journals/${credit.journalEntryId}`)
  eq('외상 수입 분개 차변은 외상매출금(108)',
    creditJournal.lines.find((l) => Number(l.debit) > 0).accountCode, '108')

  // ── 수입비용현황
  const status = await must('GET', `/incomes/status?from=${FROM}&to=${TO}`)
  eq('수입 합계가 등록분만큼 늘어남',
    Number(status.totalIncome), Number(before.totalIncome) + 100_000)
  eq('순수지 = 수입 - 비용', Number(status.net), Number(status.totalIncome) - Number(status.totalExpense))
  eq('계정별 합계가 총합과 일치',
    status.incomeByAccount.reduce((s, r) => s + Number(r.amount), 0), Number(status.totalIncome))

  const row = status.incomeByAccount.find((r) => r.accountCode === '901')
  eq('구성비 = 계정금액 / 총수입 × 100', Number(row.ratio),
    Math.round(Number(row.amount) / Number(status.totalIncome) * 1000) / 10)

  await must('DELETE', `/incomes/${cash.id}`)
  eq('현금 수입은 삭제 가능',
    (await must('GET', `/incomes?from=${FROM}&to=${TO}`)).some((i) => i.id === cash.id), false)
}

/** 외화 — 통화 마스터 · 일자별 고시환율 · 원화 환산 */
async function scenarioCurrency() {
  section('■ 시나리오 20. 외화 (통화 · 고시환율 · 원화 환산)')

  const currencies = await must('GET', '/currencies')
  const usd = currencies.find((c) => c.code === 'USD')
  const jpy = currencies.find((c) => c.code === 'JPY')
  eq('기본 통화(USD)가 시드됨', Boolean(usd), true)
  eq('엔화 고시단위는 100', jpy.unit, 100)

  await rejects('원화(KRW)는 외화로 등록 불가', 'POST', '/currencies',
    { code: 'KRW', name: '원화', unit: 1 }, '기준통화')
  await rejects('중복 통화코드는 거부', 'POST', '/currencies',
    { code: 'USD', name: '중복', unit: 1 }, '이미 등록된 통화')

  // 고시환율 등록 (이미 있으면 그대로 쓴다 — 재실행 안전)
  const rateDate = '2026-07-10'
  const rates = await must('GET', '/currencies/rates')
  const hasUsd = rates.some((r) => r.currencyId === usd.id && r.rateDate === rateDate)
  if (!hasUsd) {
    await must('POST', '/currencies/rates', { currencyId: usd.id, rateDate, rate: 1385.5 })
  }
  const hasJpy = rates.some((r) => r.currencyId === jpy.id && r.rateDate === rateDate)
  if (!hasJpy) {
    await must('POST', '/currencies/rates', { currencyId: jpy.id, rateDate, rate: 950 })
  }

  await rejects('같은 통화·같은 날 환율 중복 등록은 거부', 'POST', '/currencies/rates',
    { currencyId: usd.id, rateDate, rate: 1400 }, '이미 등록된 환율')

  // 환산: 기준일에 고시가 없으면 직전 고시를 쓴다
  const conv = await must('GET', `/currencies/convert?currencyId=${usd.id}&amount=1000&baseDate=2026-07-14`)
  eq('기준일 고시가 없으면 직전 고시 적용', conv.appliedRateDate, rateDate)
  eq('USD 1,000 → 1,385,500원', Number(conv.krwAmount), 1_385_500)

  // 고시단위 100인 통화는 단위로 나눠 환산한다
  const jpyConv = await must('GET', `/currencies/convert?currencyId=${jpy.id}&amount=10000&baseDate=2026-07-14`)
  eq('JPY 10,000 → 95,000원 (단위 100 반영)', Number(jpyConv.krwAmount), 95_000)

  await rejects('고시 이전 날짜는 환산 불가', 'GET',
    `/currencies/convert?currencyId=${usd.id}&amount=100&baseDate=2026-01-01`, undefined, '고시환율이 없습니다')

  // 최근 고시환율은 다른 흐름(수출 인보이스 등)이 더 최신 고시를 넣으면 바뀌므로,
  // 여기서는 "그날 고시가 그대로 남아 있는가"만 본다.
  const usdRates = (await must('GET', `/currencies/rates?currencyId=${usd.id}`))
  eq('등록한 고시환율이 목록에 남아 있음',
    Number(usdRates.find((r) => r.rateDate === rateDate).rate), 1385.5)
}

async function scenarioExport(f) {
  section('■ 시나리오 21. 수출 — 인보이스(외화·환율 고정) → 통관 → 선적 → 입금')

  const DATE = '2026-07-14'

  // 통화·고시환율 준비 (외화 모듈 재사용).
  // USD 는 외화 시나리오가 '최신 고시' 가정을 걸고 있으므로 건드리지 않고 EUR 를 쓴다 —
  // 시나리오끼리 같은 마스터의 시계열을 흔들면 서로를 깨뜨린다.
  const currencies = await must('GET', '/currencies')
  const eur = currencies.find((c) => c.code === 'EUR')
    ?? await must('POST', '/currencies', { code: 'EUR', name: '유로', symbol: '€', unit: 1 })

  const rates = await must('GET', `/currencies/rates?currencyId=${eur.id}`)
  if (!rates.some((r) => r.rateDate === DATE)) {
    await must('POST', '/currencies/rates', { currencyId: eur.id, rateDate: DATE, rate: 1450 })
  }
  const rate = (await must('GET', `/currencies/rates?currencyId=${eur.id}`)).find((r) => r.rateDate === DATE).rate

  const inv = await must('POST', '/exports', {
    partnerId: f.customer.id, currencyId: eur.id, invoiceDate: DATE,
    incoterms: 'FOB', destination: 'Los Angeles, USA',
    lines: [{ itemId: f.product.id, quantity: 10, unitPrice: 100 }],
  })
  eq('신규 인보이스 상태는 오더', inv.statusName, '오더')
  eq('인보이스 번호는 INV- 접두어', inv.invoiceNo.startsWith('INV-'), true)
  eq('외화 합계 = 수량 × 외화단가', Number(inv.foreignAmount), 1000)
  eq('발행일 고시환율이 적용됨', Number(inv.appliedRate), Number(rate))
  eq('원화 = 외화 × 환율 / 고시단위', Number(inv.krwAmount), 1000 * Number(rate) / eur.unit)

  // 단계는 건너뛸 수 없다
  await rejects('오더에서 바로 선적은 거부', 'POST', `/exports/${inv.id}/ship`,
    { blNo: 'BL-QA-001' }, '다음 단계가 아닙니다')
  await rejects('오더에서 바로 입금은 거부', 'POST', `/exports/${inv.id}/pay`, {}, '다음 단계가 아닙니다')

  const customs = await must('POST', `/exports/${inv.id}/customs`, { declarationNo: 'QA-DECL-0001' })
  eq('통관진행 후 상태', customs.statusName, '통관진행')
  eq('수출신고번호가 기록됨', customs.declarationNo, 'QA-DECL-0001')

  await rejects('같은 단계 반복은 거부', 'POST', `/exports/${inv.id}/customs`,
    { declarationNo: 'QA-DECL-0002' }, '다음 단계가 아닙니다')

  const shipped = await must('POST', `/exports/${inv.id}/ship`, { blNo: 'QA-BL-0001', shippedDate: DATE })
  eq('선적완료 후 상태', shipped.statusName, '선적완료')
  eq('B/L 번호가 기록됨', shipped.blNo, 'QA-BL-0001')

  const summaryBefore = await must('GET', '/exports')
  const unpaidBefore = Number(summaryBefore.unpaidKrw)
  eq('선적했어도 입금 전이면 미입금 잔액에 잡힘',
    summaryBefore.exports.find((e) => e.id === inv.id).statusName, '선적완료')

  const paid = await must('POST', `/exports/${inv.id}/pay`, { paidDate: DATE })
  eq('입금완료 후 상태', paid.statusName, '입금완료')

  const summaryAfter = await must('GET', '/exports')
  eq('입금하면 미입금 잔액에서 빠짐',
    Number(summaryAfter.unpaidKrw), unpaidBefore - Number(inv.krwAmount))

  await rejects('입금완료 건은 더 진행할 수 없음', 'POST', `/exports/${inv.id}/pay`, {}, '다음 단계가 아닙니다')

  await rejects('매입처에는 수출 불가', 'POST', '/exports', {
    partnerId: f.supplier.id, currencyId: eur.id, invoiceDate: DATE,
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1 }],
  }, '매출처가 아닌')
}

/** 전자결재 설정 — 공통양식등록 · 결재선 프리셋 */
async function scenarioApprovalSetting() {
  section('■ 시나리오 22. 전자결재 설정 (공통양식 · 결재선 프리셋)')

  const users = await must('GET', '/meta/users')
  const [u1, u2] = users

  const code = `${P}FORM`
  const existing = (await must('GET', '/approval-settings/templates')).find((t) => t.code === code)
  const template = existing ?? await must('POST', '/approval-settings/templates', {
    code, name: 'QA 양식', sortOrder: 99,
    fieldSchema: [{ key: 'reason', label: '사유', type: 'text', required: true }],
  })
  eq('새 양식은 기안서 0건', Number(template.documentCount), 0)
  eq('입력항목이 저장됨', template.fieldSchema[0].label, '사유')

  await rejects('중복 양식코드는 거부', 'POST', '/approval-settings/templates',
    { code, name: '중복' }, '이미 등록된 양식코드')

  // 기안서가 쓰고 있는 양식은 삭제할 수 없다 (사용중지로 내려야 한다)
  const used = (await must('GET', '/approval-settings/templates')).find((t) => t.documentCount > 0)
  if (used) {
    await rejects('사용중인 양식 삭제는 거부', 'DELETE', `/approval-settings/templates/${used.id}`,
      undefined, '삭제할 수 없습니다')
  }

  // 관리 목록은 사용중지된 양식도 보여 준다 (기안 화면 목록은 사용중인 것만)
  await must('PUT', `/approval-settings/templates/${template.id}`, {
    code, name: 'QA 양식', sortOrder: 99, active: false, fieldSchema: template.fieldSchema,
  })
  const admin = (await must('GET', '/approval-settings/templates')).find((t) => t.id === template.id)
  eq('사용중지해도 관리 목록에는 남음', admin.active, false)
  eq('기안 화면 양식 목록에서는 빠짐',
    (await must('GET', '/approval-form-templates')).some((t) => t.id === template.id), false)
  await must('PUT', `/approval-settings/templates/${template.id}`, {
    code, name: 'QA 양식', sortOrder: 99, active: true, fieldSchema: template.fieldSchema,
  })

  // ── 결재선 프리셋
  const presetName = `${P}결재선`
  const before = (await must('GET', '/approval-settings/presets')).find((p) => p.name === presetName)
  if (before) {
    await must('DELETE', `/approval-settings/presets/${before.id}`)
  }
  const preset = await must('POST', '/approval-settings/presets', {
    name: presetName, approverIds: [u1.id, u2.id],
  })
  eq('결재 순서대로 단계가 만들어짐', preset.steps.map((s) => s.stepOrder).join(','), '1,2')
  eq('1차 결재자가 지정한 사람', preset.steps[0].approverId, u1.id)
  isNull('양식을 지정하지 않으면 공통 결재선', preset.formTemplateId)

  await rejects('같은 결재자가 연속으로 오면 거부', 'POST', '/approval-settings/presets',
    { name: `${P}잘못된 결재선`, approverIds: [u1.id, u1.id] }, '연속')
  await rejects('결재자가 없으면 거부', 'POST', '/approval-settings/presets',
    { name: `${P}빈 결재선`, approverIds: [] }, '1명 이상')
  await rejects('중복 결재선 이름은 거부', 'POST', '/approval-settings/presets',
    { name: presetName, approverIds: [u2.id] }, '이미 등록된 결재선')

  const updated = await must('PUT', `/approval-settings/presets/${preset.id}`, {
    name: presetName, approverIds: [u2.id, u1.id], formTemplateId: template.id,
  })
  eq('수정하면 결재 순서가 바뀜', updated.steps[0].approverId, u2.id)
  eq('양식 전용 결재선으로 바뀜', updated.formTemplateId, template.id)

  await must('DELETE', `/approval-settings/presets/${preset.id}`)
  eq('결재선 삭제됨',
    (await must('GET', '/approval-settings/presets')).some((p) => p.id === preset.id), false)
}

async function scenarioPrintSign() {
  section('■ 시나리오 23. 인쇄용 결재라인 (기본 결재란은 항상 하나)')

  const seeded = await must('GET', '/print-sign-lines')
  eq('기본 결재란이 시드됨', seeded.some((l) => l.defaultLine), true)
  eq('기본 결재란은 하나뿐', seeded.filter((l) => l.defaultLine).length, 1)

  const NAME = `${P}검사 결재란`
  const existing = seeded.find((l) => l.name === NAME)
  if (existing && !existing.defaultLine) await must('DELETE', `/print-sign-lines/${existing.id}`)

  const line = (existing && existing.defaultLine) ? existing : await must('POST', '/print-sign-lines', {
    name: NAME, active: true, remark: 'QA',
    slots: [{ title: '작성' }, { title: '검토', signerName: '홍길동' }],
  })
  eq('칸 순서가 입력 순서대로 매겨짐', line.slots.map((s) => s.slotOrder).join(','), '1,2')
  isNull('결재자 이름을 비우면 빈 칸으로 남음', line.slots[0].signerName)
  eq('이름을 넣은 칸은 그대로 보관', line.slots[1].signerName, '홍길동')

  await rejects('중복 서식명은 거부', 'POST', '/print-sign-lines', {
    name: NAME, slots: [{ title: '담당' }],
  }, '이미 등록된 결재란')

  await rejects('결재 칸 없이 등록은 거부', 'POST', '/print-sign-lines', {
    name: `${P}빈 결재란`, slots: [],
  }, '1개 이상')

  // 기본 지정은 배타적이다 — 새로 지정하면 이전 기본이 내려온다
  const before = (await must('GET', '/print-sign-lines')).find((l) => l.defaultLine)
  await must('POST', `/print-sign-lines/${line.id}/default`)
  const after = await must('GET', '/print-sign-lines')
  eq('새 기본이 지정됨', after.find((l) => l.id === line.id).defaultLine, true)
  eq('기본은 여전히 하나뿐', after.filter((l) => l.defaultLine).length, 1)
  if (before.id !== line.id) {
    eq('이전 기본은 내려옴', after.find((l) => l.id === before.id).defaultLine, false)
  }

  const def = await must('GET', '/print-sign-lines/default')
  eq('기본 결재란 조회가 방금 지정한 것', def.id, line.id)

  await rejects('기본 결재란은 삭제 불가', 'DELETE', `/print-sign-lines/${line.id}`, undefined, '기본 결재란은 삭제할 수 없습니다')

  // 칸을 갈아끼워도 순서 유니크 제약에 걸리지 않는다 (삭제 후 삽입)
  const updated = await must('PUT', `/print-sign-lines/${line.id}`, {
    name: NAME, active: true, defaultLine: true,
    slots: [{ title: '담당', signerName: '김담당' }, { title: '팀장' }, { title: '대표' }],
  })
  eq('칸을 갈아끼우면 새 구성으로 저장', updated.slots.map((s) => s.title).join(','), '담당,팀장,대표')
  eq('갈아끼운 뒤에도 순서는 1..n', updated.slots.map((s) => s.slotOrder).join(','), '1,2,3')

  // 원래 기본을 되돌려 둔다 (다른 실행에 영향 주지 않게)
  if (before.id !== line.id) await must('POST', `/print-sign-lines/${before.id}/default`)
}

/** 급여 수당/공제그룹(비과세 반영) · 급여이체(계좌 출금 + 자동 분개) */
async function scenarioPaySetting() {
  section('■ 시나리오 24. 급여 수당/공제그룹 · 급여이체')

  const items = await must('GET', '/pay-settings/items')
  const meal = items.find((i) => i.code === 'MEAL')          // 식대 (비과세 20만)
  const position = items.find((i) => i.code === 'POSITION')  // 직책수당 (과세 30만)
  eq('식대는 비과세 항목', meal.taxable, false)
  eq('직책수당은 과세 항목', position.taxable, true)

  await rejects('중복 항목코드는 거부', 'POST', '/pay-settings/items',
    { code: 'MEAL', name: '중복 식대', kind: 'ALLOWANCE' }, '이미 등록된 항목코드')

  const groupName = `${P}급여그룹`
  const existingGroup = (await must('GET', '/pay-settings/groups')).find((g) => g.name === groupName)
  const group = existingGroup ?? await must('POST', '/pay-settings/groups', {
    name: groupName,
    lines: [{ payItemId: meal.id }, { payItemId: position.id }],   // 금액 생략 → 기본금액
  })
  eq('금액을 비우면 항목 기본금액을 쓴다', Number(group.allowanceTotal), 500_000)

  await rejects('같은 항목을 두 번 넣으면 거부', 'POST', '/pay-settings/groups',
    { name: `${P}중복그룹`, lines: [{ payItemId: meal.id }, { payItemId: meal.id }] }, '두 번')

  // ── 그룹을 적용한 급여계산: 비과세 수당은 4대보험 기준에서 빠진다
  const employees = await must('GET', '/employees')
  const emp = employees[0]

  // 다른 흐름이 만든 명세를 건드리지 않도록, 이 사원의 명세가 아직 없는 달을 골라 쓴다.
  // 확정·이체된 명세는 지울 수 없으므로 매 실행마다 한 달씩 소진된다. 넉넉한 범위를 훑는다.
  let month = null
  for (let y = 2027; y <= 2036 && month === null; y++) {
    for (let m = 1; m <= 12 && month === null; m++) {
      const candidate = `${y}-${String(m).padStart(2, '0')}`
      const slips = await must('GET', `/payslips?month=${candidate}`)
      if (!slips.some((p) => p.employeeId === emp.id)) {
        month = candidate
      }
    }
  }
  if (month === null) {
    throw new Error('2027~2036년에 빈 귀속월이 없습니다. DB를 초기화하고 다시 실행하세요.')
  }

  const slip = await must('POST', '/payslips', {
    employeeId: emp.id, payMonth: month, payGroupId: group.id, lines: [],
  })
  eq('그룹의 수당이 명세에 들어감', Number(slip.allowanceTotal), 500_000)

  const base = Number(slip.baseSalary)
  const taxableIncome = base + 300_000                       // 기본급 + 과세수당(직책수당). 식대는 빠진다
  const pension = slip.lines.find((l) => l.name === '국민연금')
  eq('국민연금 = 과세소득 × 4.5% (비과세 식대 제외)',
    Number(pension.amount), Math.round(taxableIncome * 0.045))

  const mealLine = slip.lines.find((l) => l.name === '식대')
  eq('비과세 수당은 명세에 비과세로 남음', mealLine.taxable, false)
  eq('비과세 수당도 지급은 된다(실지급액에 포함)',
    Number(slip.netPay), base + 500_000 - Number(slip.deductionTotal))

  // ── 급여이체: 확정된 명세만, 계좌에서 실지급액이 나간다
  const accountNo = `${P}440-666-000004`
  const banks = await must('GET', '/bank-cards/accounts')
  const bank = banks.find((b) => b.accountNo === accountNo)
    ?? await must('POST', '/bank-cards/accounts', {
      bankName: 'QA은행', accountNo, holder: 'QA법인', openingBalance: 50_000_000,
    })

  await rejects('미확정 명세는 이체 대상이 아님', 'POST', '/pay-settings/transfers',
    { payMonth: month, bankAccountId: bank.id }, '이체할 확정 급여명세가 없습니다')

  await must('POST', `/payslips/${slip.id}/confirm`)
  const balanceBefore = Number((await must('GET', '/bank-cards/accounts')).find((b) => b.id === bank.id).balance)

  const transfer = await must('POST', '/pay-settings/transfers', {
    payMonth: month, bankAccountId: bank.id, transferDate: `${month}-25`, payslipIds: [slip.id],
  })
  eq('지급총액 = 기본급 + 수당합', Number(transfer.totalPay), base + 500_000)
  eq('실지급액 = 지급총액 − 공제합계',
    Number(transfer.netPay), Number(transfer.totalPay) - Number(transfer.totalDeduction))
  eq('이체하면 계좌에서 실지급액이 빠짐',
    Number((await must('GET', '/bank-cards/accounts')).find((b) => b.id === bank.id).balance),
    balanceBefore - Number(transfer.netPay))

  const entry = await must('GET', `/journals/${transfer.journalEntryId}`)
  eq('이체 분개 차변은 급여(801) 지급총액',
    Number(entry.lines.find((l) => l.accountCode === '801').debit), Number(transfer.totalPay))
  eq('공제합계는 예수금(254)으로 남음',
    Number(entry.lines.find((l) => l.accountCode === '254').credit), Number(transfer.totalDeduction))
  eq('이체 분개가 대차평형', Number(entry.totalDebit), Number(entry.totalCredit))

  await rejects('같은 명세를 두 번 이체할 수 없음', 'POST', '/pay-settings/transfers',
    { payMonth: month, bankAccountId: bank.id, payslipIds: [slip.id] }, '이미 이체됨')
}

async function scenarioGroupwareShared() {
  section('■ 시나리오 24. 익명게시판 · 외근조회')

  // ── 익명게시판: 작성자는 서버에 남지만 응답에서는 가려진다
  const anon = await must('POST', '/board', {
    title: `${P}익명 건의`, category: '건의', content: 'QA 익명 본문', anonymous: true,
  })
  eq('익명 글의 작성자는 가려짐', anon.author, '익명')
  eq('익명 플래그가 응답에 실림', anon.anonymous, true)

  const named = await must('POST', '/board', {
    title: `${P}실명 공지`, category: '자유', content: 'QA 실명 본문', anonymous: false,
  })
  eq('실명 글은 작성자가 그대로', named.author, USER)

  const list = await must('GET', '/board')
  eq('목록에서도 익명 글은 가려짐', list.find((p) => p.id === anon.id).author, '익명')
  eq('목록에서 실명 글은 그대로', list.find((p) => p.id === named.id).author, USER)

  const detail = await must('GET', `/board/${anon.id}`)
  eq('상세에서도 익명 유지', detail.author, '익명')
  eq('상세 조회 시 조회수 증가', detail.views > anon.views, true)

  await must('DELETE', `/board/${anon.id}`)
  await must('DELETE', `/board/${named.id}`)

  // ── 외근조회: 신청 → 승인/반려
  const users = await must('GET', '/users')
  const me = users.find((u) => u.username === USER)
  const DATE = '2026-06-15'

  const existing = (await must('GET', `/field-works?from=${DATE}&to=${DATE}`)).rows
  for (const f of existing) {
    if (f.status === 'REQUESTED' && f.userId === me.id) await must('DELETE', `/field-works/${f.id}`)
  }
  const stillThere = (await must('GET', `/field-works?from=${DATE}&to=${DATE}`)).rows
    .some((f) => f.userId === me.id && f.status !== 'REJECTED')

  if (!stillThere) {
    const fw = await must('POST', '/field-works', {
      workDate: DATE, startTime: '09:00', endTime: '18:00',
      destination: 'QA고객사 본사', purpose: 'QA 설비 점검',
    })
    eq('신규 외근계 상태는 신청', fw.statusName, '신청')

    await rejects('같은 날 외근계 중복 신청은 거부', 'POST', '/field-works', {
      workDate: DATE, destination: 'QA 다른 곳', purpose: '중복',
    }, '이미 있습니다')

    await rejects('자기 외근계는 자기가 승인 불가', 'POST', `/field-works/${fw.id}/approve`,
      undefined, '자기가 승인할 수 없습니다')
    await rejects('자기 외근계는 자기가 반려도 불가', 'POST', `/field-works/${fw.id}/reject`,
      { reason: '내가 반려' }, '자기가 반려할 수 없습니다')

    await rejects('종료 시각이 시작보다 빠르면 거부', 'POST', '/field-works', {
      workDate: '2026-06-16', startTime: '18:00', endTime: '09:00',
      destination: 'QA', purpose: 'QA',
    }, '빠를 수 없습니다')

    // 본인이 취소하면 사라진다
    await must('DELETE', `/field-works/${fw.id}`)
    eq('취소하면 목록에서 사라짐',
      (await must('GET', `/field-works?from=${DATE}&to=${DATE}`)).rows.some((f) => f.id === fw.id), false)
  }

  const summary = await must('GET', `/field-works?from=2026-06-01&to=2026-06-30`)
  eq('상태별 건수 합 = 행 개수',
    Number(summary.requestedCount) + Number(summary.approvedCount) + Number(summary.rejectedCount),
    summary.rows.length)
}

async function scenarioPerformance(f) {
  section('■ 시나리오 25. 담당자별 실적 (전표 담당 사원 기준)')

  const employees = await must('GET', '/employees')
  if (employees.length === 0) {
    console.log('  ⏭  사원 마스터가 비어 있어 건너뜁니다.')
    return
  }
  const emp = employees[0]
  const FROM = '2026-03-01'
  const TO = '2026-03-31'
  const DATE = '2026-03-10'

  const before = await must('GET', `/employees/performance?from=${FROM}&to=${TO}`)
  const beforeMine = before.rows.find((r) => r.employeeId === emp.id)
  const beforeSales = Number(beforeMine?.salesAmount ?? 0)
  const beforeUnassigned = Number(before.rows.find((r) => r.employeeId === null)?.salesAmount ?? 0)

  // 담당자를 지정한 판매 전표
  const sale = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: DATE, taxable: true,
    employeeId: emp.id,
    lines: [{ itemId: f.product.id, quantity: 2, unitPrice: 10000 }],
  })
  eq('판매 전표에 담당자가 붙음', sale.employeeId, emp.id)
  eq('담당자 이름이 응답에 실림', sale.employeeName, emp.name)

  // 담당자 없는 판매 전표
  const noOwner = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: DATE, taxable: true,
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 10000 }],
  })
  isNull('담당자를 안 넣으면 비어 있음', noOwner.employeeId)

  const after = await must('GET', `/employees/performance?from=${FROM}&to=${TO}`)
  const mine = after.rows.find((r) => r.employeeId === emp.id)
  eq('담당자 실적에 판매 합계가 더해짐', Number(mine.salesAmount), beforeSales + Number(sale.totalAmount))
  eq('담당자 판매 건수도 증가', mine.salesCount >= 1, true)

  const unassigned = after.rows.find((r) => r.employeeId === null)
  eq('담당자 없는 전표는 미지정 행으로 모임',
    Number(unassigned.salesAmount), beforeUnassigned + Number(noOwner.totalAmount))
  eq('미지정 행의 이름', unassigned.employeeName, '미지정')
  eq('미지정 행은 항상 맨 아래', after.rows[after.rows.length - 1].employeeId, null)

  eq('총 매출 = 행 매출 합계',
    Number(after.totalSales), after.rows.reduce((s, r) => s + Number(r.salesAmount), 0))
  eq('비중 = 매출 / 총매출 × 100', Number(mine.salesShare),
    Math.round(Number(mine.salesAmount) / Number(after.totalSales) * 1000) / 10)

  // 구매도 담당자로 잡힌다
  const buy = await must('POST', '/purchases', {
    partnerId: f.supplier.id, warehouseId: f.warehouse.id, purchaseDate: DATE, taxable: true,
    employeeId: emp.id,
    lines: [{ itemId: f.material.id, quantity: 5, unitPrice: 1000 }],
  })
  eq('구매 전표에도 담당자가 붙음', buy.employeeId, emp.id)

  const afterBuy = (await must('GET', `/employees/performance?from=${FROM}&to=${TO}`))
    .rows.find((r) => r.employeeId === emp.id)
  eq('담당자 매입액이 증가', Number(afterBuy.purchaseAmount) >= Number(buy.totalAmount), true)
}

/** 현금거래 세분류 — 계좌간이동 · 법인카드 대금결제 */
async function scenarioCashDetail() {
  section('■ 시나리오 25. 현금거래 세분류 (계좌간이동 · 카드대금결제)')

  const accounts = await must('GET', '/accounts')
  const welfare = accounts.find((a) => a.code === '811')   // 복리후생비

  const ensureBank = async (no, opening) =>
    (await must('GET', '/bank-cards/accounts')).find((b) => b.accountNo === no)
      ?? await must('POST', '/bank-cards/accounts', {
        bankName: 'QA은행', accountNo: no, holder: 'QA법인', openingBalance: opening,
      })
  const from = await ensureBank(`${P}550-111-000005`, 10_000_000)
  const to = await ensureBank(`${P}550-222-000006`, 0)
  const balanceOf = async (id) => Number((await must('GET', '/bank-cards/accounts')).find((b) => b.id === id).balance)

  const fromBefore = await balanceOf(from.id)
  const toBefore = await balanceOf(to.id)

  // ── 계좌간이동: 손익에 영향이 없고 예금계정끼리만 움직인다
  const transfer = await must('POST', '/cash-details/account-transfers', {
    fromAccountId: from.id, toAccountId: to.id, amount: 500_000, transferDate: '2026-07-14',
  })
  eq('출금 계좌에서 이동액만큼 빠짐', await balanceOf(from.id), fromBefore - 500_000)
  eq('입금 계좌에 이동액만큼 들어옴', await balanceOf(to.id), toBefore + 500_000)

  const entry = await must('GET', `/journals/${transfer.journalEntryId}`)
  eq('이동 분개는 예금계정 차변 하나·대변 하나', entry.lines.length, 2)
  eq('이동 분개가 대차평형', Number(entry.totalDebit), Number(entry.totalCredit))
  // 손익계정(수익·비용)이 끼면 회사 안에서 돈을 옮겼을 뿐인데 이익이 생긴 것처럼 보인다
  const divisionOf = (code) => accounts.find((a) => a.code === code).division
  eq('이동은 손익계정을 건드리지 않음 (자산계정끼리만)',
    entry.lines.every((l) => divisionOf(l.accountCode) === 'ASSET'), true)

  await rejects('같은 계좌로는 이동 불가', 'POST', '/cash-details/account-transfers',
    { fromAccountId: from.id, toAccountId: from.id, amount: 1_000 }, '같을 수 없습니다')
  await rejects('잔액보다 많은 이동은 거부', 'POST', '/cash-details/account-transfers',
    { fromAccountId: from.id, toAccountId: to.id, amount: 999_999_999 }, '잔액이 부족')

  // ── 카드대금 결제: 카드사용 때 잡은 미지급금을 결제계좌에서 갚는다
  const cardNo = `${P}5310-****-****-0002`
  const card = (await must('GET', '/bank-cards/cards')).find((c) => c.cardNo === cardNo)
    ?? await must('POST', '/bank-cards/cards', {
      cardName: 'QA결제카드', cardCompany: 'QA카드', cardNo, type: 'CORPORATE',
      settlementAccountId: from.id, settlementDay: 25,
    })

  // 미결제 사용건을 하나 만든다
  const usage = await must('POST', '/bank-cards/usages', {
    cardId: card.id, merchant: 'QA가맹점', expenseAccountId: welfare.id,
    supplyAmount: 100_000, usageDate: '2026-07-14',
  })
  const unpaid = await must('GET', `/cash-details/card-payments/unpaid?cardId=${card.id}`)
  eq('새 카드사용은 미결제 목록에 잡힘', unpaid.some((u) => u.id === usage.id), true)

  const payFrom = await balanceOf(from.id)
  const payment = await must('POST', '/cash-details/card-payments', {
    cardId: card.id, paymentDate: '2026-07-25', cardUsageIds: [usage.id],
  })
  eq('결제금액 = 카드사용 합계', Number(payment.amount), Number(usage.totalAmount))
  eq('결제계좌를 비우면 카드 등록계좌로 결제', payment.bankAccountId, from.id)
  eq('결제하면 계좌에서 그만큼 빠짐', await balanceOf(from.id), payFrom - Number(payment.amount))

  const payEntry = await must('GET', `/journals/${payment.journalEntryId}`)
  eq('결제 분개 차변은 미지급금(253)',
    Number(payEntry.lines.find((l) => l.accountCode === '253').debit), Number(payment.amount))
  eq('결제 분개가 대차평형', Number(payEntry.totalDebit), Number(payEntry.totalCredit))

  eq('결제한 사용건은 미결제 목록에서 빠짐',
    (await must('GET', `/cash-details/card-payments/unpaid?cardId=${card.id}`)).some((u) => u.id === usage.id),
    false)

  await rejects('같은 사용건 재결제는 거부', 'POST', '/cash-details/card-payments',
    { cardId: card.id, cardUsageIds: [usage.id] }, '미결제 사용내역이 없습니다')
}

/** 우측 앱바 위젯 — 통합검색 · 알림 · E Note(개인 메모) */
async function scenarioWorkspace(f) {
  section('■ 시나리오 26. 앱바 위젯 (통합검색 · 알림 · E Note)')

  // ── 통합검색: 품목·거래처·전표를 한 번에 찾고, 결과에 이동 경로가 실린다
  const found = await must('GET', `/workspace/search?q=${encodeURIComponent(f.customer.name)}`)
  const partners = found.groups.find((g) => g.type === 'PARTNER')
  eq('거래처명으로 거래처를 찾는다', partners.hits.some((h) => h.title.includes(f.customer.name)), true)
  eq('검색 결과에 이동 경로가 실린다', partners.hits[0].to, '/sales/partners')

  const byCode = await must('GET', `/workspace/search?q=${encodeURIComponent(f.product.code)}`)
  eq('품목코드로 품목을 찾는다',
    byCode.groups.find((g) => g.type === 'ITEM').hits.some((h) => h.title.includes(f.product.code)), true)

  const noHit = await must('GET', '/workspace/search?q=ZZZ_NO_SUCH_KEYWORD_ZZZ')
  eq('일치하는 게 없으면 0건', noHit.total, 0)

  await rejects('검색어가 비면 거부', 'GET', '/workspace/search?q=', undefined, '검색어')

  // ── 알림: 지금 손봐야 할 일만 담는다
  const alerts = await must('GET', '/workspace/notifications')
  eq('알림 건수와 목록 길이가 같다', alerts.total, alerts.notifications.length)
  eq('모든 알림에 이동 경로가 있다', alerts.notifications.every((n) => Boolean(n.to)), true)
  eq('알림 건수는 0보다 크다(미출고·안전재고 등)', alerts.total > 0, true)

  // 미출고 수주 알림의 건수는 실제 미출고 목록과 일치해야 한다
  const unshipped = alerts.notifications.find((n) => n.type === 'UNSHIPPED')
  if (unshipped) {
    eq('미출고 알림 건수 = 실제 미출고 라인 수',
      unshipped.count, (await must('GET', '/sales-orders/unshipped')).length)
  }

  // ── E Note: 본인 것만 보이고 본인만 고친다
  const note = await must('POST', '/workspace/notes', { content: `${P}메모 내용`, pinned: true })
  eq('메모가 저장됨', note.content, `${P}메모 내용`)
  eq('고정 플래그가 저장됨', note.pinned, true)

  const mine = await must('GET', '/workspace/notes')
  eq('내 메모 목록에 잡힘', mine.some((n) => n.id === note.id), true)

  const updated = await must('PUT', `/workspace/notes/${note.id}`, { content: `${P}수정됨`, pinned: false })
  eq('메모 수정됨', updated.content, `${P}수정됨`)
  eq('고정 해제됨', updated.pinned, false)

  // 다른 사용자로는 남의 메모가 보이지도, 지워지지도 않는다
  const other = await call('POST', '/auth/login', { username: 'manager', password: 'manager1234' })
  if (other.ok) {
    const otherToken = other.data.token
    const saved = token
    token = otherToken
    const otherNotes = await must('GET', '/workspace/notes')
    eq('남의 메모는 목록에 보이지 않음', otherNotes.some((n) => n.id === note.id), false)
    await rejects('남의 메모는 삭제할 수 없음', 'DELETE', `/workspace/notes/${note.id}`, undefined, '찾을 수 없습니다')
    token = saved
  }

  await must('DELETE', `/workspace/notes/${note.id}`)
  eq('내 메모는 삭제됨',
    (await must('GET', '/workspace/notes')).some((n) => n.id === note.id), false)
}

async function scenarioCreatedByFk() {
  section('■ 시나리오 27. created_by 무결성 (작성 이력이 있는 계정은 못 지운다)')

  const accounts = await must('GET', '/accounts')
  const welfare = accounts.find((a) => a.code === '811')
  const PERIOD = '2026-02'
  const UNAME = `${P.toLowerCase()}deluser`

  // 이전 실행의 잔재 정리 (예산 → 사용자 순으로 지워야 FK 에 걸리지 않는다)
  const stale = (await must('GET', '/users')).find((u) => u.username === UNAME)
  if (stale) {
    for (const b of (await must('GET', `/budgets?period=${PERIOD}`)).rows) {
      await must('DELETE', `/budgets/${b.id}`)
    }
    await must('DELETE', `/users/${stale.id}`)
  }

  const user = await must('POST', '/users', {
    username: UNAME, password: 'qa-pass-1234', name: 'QA삭제테스트',
    roleNames: ['STAFF'],
  })
  eq('신규 사용자 생성', user.username, UNAME)

  // 이력이 없으면 지울 수 있다
  await must('DELETE', `/users/${user.id}`)
  eq('작성 이력이 없으면 삭제됨',
    (await must('GET', '/users')).some((u) => u.username === UNAME), false)

  // 다시 만들고, 그 사용자로 로그인해 전표를 하나 남긴다
  const user2 = await must('POST', '/users', {
    username: UNAME, password: 'qa-pass-1234', name: 'QA삭제테스트',
    roleNames: ['MANAGER'],
  })

  const adminToken = token
  const asUser = await call('POST', '/auth/login', { username: UNAME, password: 'qa-pass-1234' })
  eq('신규 사용자로 로그인됨', asUser.ok, true)
  token = asUser.data.token

  const budget = await must('POST', '/budgets', {
    period: PERIOD, accountId: welfare.id, amount: 500_000, remark: 'QA created_by FK',
  })
  token = adminToken

  const rows = (await must('GET', `/budgets?period=${PERIOD}`)).rows
  eq('예산의 작성자가 그 사용자로 남음', rows.find((b) => b.id === budget.id) !== undefined, true)

  // 이제는 못 지운다 — DB FK(ON DELETE RESTRICT)가 막고, 서버가 이유를 말해준다
  await rejects('작성 이력이 있는 사용자는 삭제 거부', 'DELETE', `/users/${user2.id}`,
    undefined, '작성한 전표·문서가 있는 사용자는 삭제할 수 없습니다')

  // 이력을 지우면 다시 지울 수 있다
  await must('DELETE', `/budgets/${budget.id}`)
  await must('DELETE', `/users/${user2.id}`)
  eq('이력을 지운 뒤에는 삭제됨',
    (await must('GET', '/users')).some((u) => u.username === UNAME), false)
}

async function scenarioPersonRefs() {
  section('■ 시나리오 28. 사람참조 정리 (작성자 FK · 휴가상태 enum)')

  // ── 휴가 상태는 이제 enum 이다
  const users = await must('GET', '/users')
  const me = users.find((u) => u.username === USER)

  const vac = await must('POST', '/hr/vacations', {
    userId: me.id, type: '연차', startDate: '2026-05-04', endDate: '2026-05-04',
    days: 1, reason: 'QA 휴가상태 enum',
  })
  eq('신규 휴가는 PENDING', vac.status, 'PENDING')
  eq('표시용 한글도 함께 온다', vac.statusName, '대기')

  const approved = await must('PUT', `/hr/vacations/${vac.id}/status`, { status: 'APPROVED' })
  eq('승인하면 APPROVED', approved.status, 'APPROVED')
  eq('표시용은 승인', approved.statusName, '승인')

  await rejects('enum 에 없는 상태는 거부', 'PUT', `/hr/vacations/${vac.id}/status`, { status: '승락' })
  await rejects('한글 상태값도 이제 거부', 'PUT', `/hr/vacations/${vac.id}/status`, { status: '승인' })

  const listed = (await must('GET', '/hr/vacations?year=2026')).find((v) => v.id === vac.id)
  eq('목록에서도 enum 으로 나온다', listed.status, 'APPROVED')

  // ── 게시글 작성자는 users(username) FK 로 묶여 있다
  const post = await must('POST', '/board', {
    title: `${P}작성자 FK`, category: '자유', content: 'QA', anonymous: false,
  })
  eq('작성자는 로그인 사용자', post.author, USER)
  await must('DELETE', `/board/${post.id}`)

  // 익명 글도 작성자는 서버에 남는다 → 그 계정은 삭제가 막힌다(시나리오 27과 같은 규칙)
  const anon = await must('POST', '/board', {
    title: `${P}익명 작성자도 FK`, category: '건의', content: 'QA', anonymous: true,
  })
  eq('익명 글의 작성자는 응답에서 가려짐', anon.author, '익명')
  await must('DELETE', `/board/${anon.id}`)
}

async function scenarioPartnerLink(f) {
  section('■ 시나리오 29. 거래처 자유입력 + 마스터 연결 · 로트 상태 파생')

  const accounts = await must('GET', '/accounts')
  const welfare = accounts.find((a) => a.code === '811')

  // 이름이 마스터와 정확히 일치하면 FK 가 붙는다
  const linked = await must('POST', '/expenses', {
    accountId: welfare.id, expenseDate: '2026-01-15', content: 'QA 거래처 연결',
    partnerName: f.customer.name, amount: 10_000, paymentMethod: '현금',
  })
  eq('이름이 마스터와 일치하면 거래처가 연결됨', linked.partnerId, f.customer.id)
  eq('입력한 문자열도 그대로 보존', linked.partnerName, f.customer.name)

  // 마스터에 없는 상대도 그대로 받는다 (FK 는 null)
  const free = await must('POST', '/expenses', {
    accountId: welfare.id, expenseDate: '2026-01-15', content: 'QA 미등록 거래처',
    partnerName: 'QA-등록안된상호', amount: 5_000, paymentMethod: '현금',
  })
  isNull('마스터에 없으면 연결하지 않음', free.partnerId)
  eq('그래도 이름은 남는다', free.partnerName, 'QA-등록안된상호')

  // 부분일치로는 엮지 않는다
  const partial = await must('POST', '/expenses', {
    accountId: welfare.id, expenseDate: '2026-01-15', content: 'QA 부분일치',
    partnerName: f.customer.name.slice(0, 2), amount: 3_000, paymentMethod: '현금',
  })
  isNull('부분일치로는 연결하지 않음', partial.partnerId)

  // 업무일지도 같은 규칙
  const journal = await must('POST', '/work-journals', {
    reportDate: '2026-01-15', partnerName: f.customer.name,
    title: 'QA 업무일지', content: 'QA 거래처 연결 확인',
  })
  eq('업무일지도 이름이 일치하면 연결', journal.partnerId, f.customer.id)

  for (const id of [linked.id, free.id, partial.id]) {
    await must('DELETE', `/expenses/${id}`)
  }

  // ── 로트 상태는 저장하지 않고 파생된다
  const lots = await must('GET', '/lots')
  const lot = lots.find((l) => l.lotNo === `${P}LOT-001`)
  eq('보유수량이 남은 로트는 재고 상태', lot.status, lot.held ? 'HOLD' : (Number(lot.stockQty) > 0 ? 'IN_STOCK' : 'SHIPPED'))
  eq('표시용 한글도 함께 온다', lot.statusName, { IN_STOCK: '재고', SHIPPED: '출고완료', HOLD: '보류' }[lot.status])
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
  await scenarioNonCash()
  await scenarioBudget()
  await scenarioMail()
  await scenarioIncome()
  await scenarioExport(fixtures)
  await scenarioPrintSign()
  await scenarioGroupwareShared()
  await scenarioPerformance(fixtures)
  await scenarioCreatedByFk()
  await scenarioPersonRefs()
  await scenarioPartnerLink(fixtures)
  await scenarioCheck(fixtures)
  await scenarioContract(fixtures)
  await scenarioCurrency()
  await scenarioApprovalSetting()
  await scenarioPaySetting()
  await scenarioCashDetail()
  await scenarioWorkspace(fixtures)

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
