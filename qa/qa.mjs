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

  return { warehouse, customer, product, material, process, lot }
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
