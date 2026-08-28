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
 * (권한 카탈로그 검사만 예외로 백엔드 소스를 읽는다 — 아래 scenarioPermissionCoverage 참고)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

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

/**
 * 이번 실행에서 <b>실제로 재 본</b> 단언 이름. 아래 checkDeadAssertions 가 소스와 견준다.
 * 이름이 겹치는 단언은 한 번만 담기지만, 여기서 보려는 것은 '한 번도 안 잰 것' 이라 괜찮다.
 */
const ranLabels = new Set()

const eq = (label, actual, expected) => {
  ranLabels.add(label)
  const okay = String(actual) === String(expected)
  console.log(`  ${okay ? '✅' : '❌'} ${label}${okay ? '' : `  (기대 ${expected}, 실제 ${actual})`}`)
  okay ? pass++ : fail++
}

const isNull = (label, actual) => eq(label, actual === null || actual === undefined ? 'null' : actual, 'null')

const rejects = async (label, method, path, body, expectSubstring) => {
  ranLabels.add(label)
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

/** 수주 → 판매 전환 → 미판매 잔량 (미판매현황 E040212) */
/**
 * <b>특별단가는 거래처별이 그룹별보다 먼저다.</b>
 *
 * 특별단가등록·단가적용순서설정 화면은 오래전부터 있었는데 <b>전표입력이 그 값을 한 번도
 * 안 불렀다.</b> 특별단가를 등록해 놓고 판매입력을 열면 그냥 표준단가가 채워졌고,
 * 두 마스터 화면은 저장만 되고 아무 데도 영향이 없었다.
 * 이제 전표입력이 resolve 를 부른다 — 여기서 그 해석 규칙을 못 박는다.
 */
async function scenarioSpecialPrice(f) {
  section('■ 특별단가 해석')

  const ask = async () => (await must('GET',
    `/special-prices/resolve?tradeType=SALES&itemId=${f.product.id}&partnerId=${f.customer.id}`))

  // 지난 회차가 중간에 멈춰 남긴 것이 있으면 먼저 치운다 — 안 그러면 '등록 전' 이 성립하지 않는다.
  for (const sp0 of (await must('GET', '/special-prices'))
    .filter((x) => x.itemName === f.product.name && x.unitPrice === 77000)) {
    await call('DELETE', `/special-prices/${sp0.id}`)
  }

  const before = await ask()
  eq('등록 전에는 특별단가가 없다', before.found, false)
  eq('없을 때 단가는 null 이다(0 이 아니다)', before.unitPrice, null)

  const sp = await must('POST', '/special-prices', {
    tradeType: 'SALES', itemId: f.product.id, partnerId: f.customer.id, unitPrice: 77000,
  })
  const after = await ask()
  eq('거래처별 특별단가를 찾는다', after.found, true)
  eq('그 단가를 그대로 준다', Number(after.unitPrice), 77000)
  eq('어디서 왔는지 밝힌다', after.source, 'PARTNER')

  // 껐다 켜면 해석도 따라간다 — 화면에서 '사용안함' 으로 돌린 단가가 계속 붙으면 안 된다
  await must('PATCH', `/special-prices/${sp.id}/active?active=false`)
  eq('사용안함으로 돌리면 안 찾는다', (await ask()).found, false)
  await must('PATCH', `/special-prices/${sp.id}/active?active=true`)
  eq('다시 켜면 또 찾는다', (await ask()).found, true)

  await must('DELETE', `/special-prices/${sp.id}`)
  eq('지우면 표준단가로 돌아간다', (await ask()).found, false)
}

/**
 * <b>단가일괄변경은 화면이 말한 단가만 바꾼다.</b>
 *
 * 품목 단가가 하나뿐이던 시절, 구매단가일괄변경도 판매단가를 바꿨다(주석에
 * "둘 다 표준단가 unitPrice 를 변경" 이라고 적혀 있었다). 매입가를 올리려고 눌렀는데
 * <b>판매가가 올라가</b> 그 뒤의 판매·이익·채권이 전부 딸려 움직였다.
 */
async function scenarioPriceBulkField(f) {
  section('■ 단가일괄변경 대상')

  const before = (await must('GET', '/price-bulk/items')).find((r) => r.id === f.product.id)
  const sale0 = Number(before.unitPrice)
  const buy0 = Number(before.purchasePrice)

  await must('POST', '/price-bulk/apply',
    { field: 'purchase', mode: 'amount', value: 500, itemIds: [f.product.id] })
  const afterBuy = (await must('GET', '/price-bulk/items')).find((r) => r.id === f.product.id)
  eq('구매단가일괄변경은 구매단가를 바꾼다', Number(afterBuy.purchasePrice), buy0 + 500)
  eq('그때 판매단가는 그대로다', Number(afterBuy.unitPrice), sale0)

  await must('POST', '/price-bulk/apply',
    { field: 'sale', mode: 'amount', value: 100, itemIds: [f.product.id] })
  const afterSale = (await must('GET', '/price-bulk/items')).find((r) => r.id === f.product.id)
  eq('판매단가일괄변경은 판매단가를 바꾼다', Number(afterSale.unitPrice), sale0 + 100)
  eq('그때 구매단가는 그대로다', Number(afterSale.purchasePrice), buy0 + 500)

  // 되돌린다 — 안 되돌리면 뒤 시나리오의 금액이 매 회차 밀린다
  await must('POST', '/price-bulk/apply',
    { field: 'purchase', mode: 'amount', value: -500, itemIds: [f.product.id] })
  await must('POST', '/price-bulk/apply',
    { field: 'sale', mode: 'amount', value: -100, itemIds: [f.product.id] })
  const back = (await must('GET', '/price-bulk/items')).find((r) => r.id === f.product.id)
  eq('되돌리면 원래 판매단가', Number(back.unitPrice), sale0)
  eq('되돌리면 원래 구매단가', Number(back.purchasePrice), buy0)
}

/**
 * <b>구매할인은 구매단가를 기준으로 잰다.</b>
 *
 * 품목 단가가 하나뿐이던 시절에는 구매할인현황이 <b>판매</b> 기준단가와 매입가를 견줬다.
 * 매입가가 판매가보다 높은 것이 이상할 이유가 없어서 개발 자료 488줄이 전부 '할증' 으로
 * 찍혔다 — 화면 이름은 할인현황인데 할인이 0건이었다.
 * 원본 품목등록도 판매단가와 구매단가를 따로 둔다.
 */
async function scenarioPurchaseDiscountBase(f) {
  section('■ 구매할인 기준단가')

  /*
   * 이 품목은 구매전표가 물려서 지울 수 없다(FK). 그래서 <b>있으면 그대로 쓴다</b> —
   * 지난 회차 찌꺼기라고 지우려 들면 409 로 막히고 시나리오가 통째로 멈춘다.
   * 기준단가만 0 으로 되돌려 놓고 시작한다.
   */
  const existing = (await must('GET', '/items')).find((i) => i.code === `${P}PPBASE`)
  const item = existing
    ? await must('PUT', `/items/${existing.id}`, {
      name: '구매단가시험', unit: 'EA', category: 'MERCHANDISE',
      unitPrice: 1000, purchasePrice: 0, safetyStock: 0, active: true,
    })
    : await must('POST', '/items', {
      code: `${P}PPBASE`, name: '구매단가시험', unit: 'EA',
      category: 'MERCHANDISE', unitPrice: 1000, purchasePrice: 0, safetyStock: 0,
    })
  eq('구매단가를 안 주면 0', Number(item.purchasePrice), 0)

  const rowsOf = async () => (await must('GET', '/purchases/discounts?from=2026-07-15&to=2026-07-15'))
    .filter((r) => r.itemCode === `${P}PPBASE`)
  // 구매전표도 한 번만 만든다. 매 회차 만들면 재고와 채무가 계속 밀린다.
  if ((await rowsOf()).length === 0) {
    await must('POST', '/purchases', {
      purchaseDate: '2026-07-15', partnerId: f.supplier.id, warehouseId: f.warehouse.id,
      lines: [{ itemId: item.id, quantity: 10, unitPrice: 1200 }],
    })
  }

  /*
   * 이 시나리오는 아래에서 거래유형을 재려고 <b>면세 전표와 1원짜리 전표를 더 만든다.</b>
   * 그래서 줄을 순서(rows[0])로 집으면 회차마다 다른 줄을 재게 된다 — 실제로 한 번 그렇게
   * 깨졌다. 재려는 줄(과세 · 10개 · 1,200원)을 <b>이름으로</b> 집는다.
   */
  const mainRow = (rs) => rs.find((r) => Number(r.qty) === 10 && r.taxTypeName === '과세')

  // 기준을 안 정했으면 계산하지 않는다 — 없는 기준으로 만든 숫자를 보여 주느니 0 이 낫다
  const before = mainRow(await rowsOf())
  eq('구매단가가 0 이면 할인액도 0', Number(before.discountAmount), 0)
  eq('그때는 할인율도 0', Number(before.discountRate), 0)

  await must('PUT', `/items/${item.id}`, {
    name: '구매단가시험', unit: 'EA', category: 'MERCHANDISE',
    unitPrice: 1000, purchasePrice: 1500, safetyStock: 0, active: true,
  })
  const after = mainRow(await rowsOf())
  eq('기준을 정하면 구매단가로 잰다', Number(after.basePrice), 1500)
  eq('1,500 짜리를 1,200 에 샀으니 단가차 300', Number(after.discountPerUnit), 300)
  eq('10개면 할인액 3,000', Number(after.discountAmount), 3000)
  eq('할인율 20%', Number(after.discountRate), 20)

  // 판매단가(1,000)로 쟀다면 -200 × 10 = -2,000 (할증) 이 나왔을 것이다 — 그 값이 아님을 못 박는다
  eq('판매단가 기준이 아니다', Number(after.discountAmount) === -2000, false)

  /*
   * 원본 할인현황의 조회조건 <b>[거래유형]</b> — 과세 · 면세.
   * 줄마다 전표에 저장된 과세 여부를 그대로 싣는다. 화면이 부가세가 0 인지로 되짚던 시절에는
   * <b>반올림으로 부가세가 0 이 된 과세 전표가 면세로 섞여</b> 조건을 걸면 엉뚱한 줄이 걸렸다.
   */
  eq('할인현황 줄이 거래유형을 들고 있다', after.taxTypeName, '과세')

  // 면세 전표 (한 번만 만든다 — 매 회차 만들면 재고와 채무가 계속 밀린다)
  if (!(await rowsOf()).some((r) => r.taxTypeName === '면세')) {
    await must('POST', '/purchases', {
      purchaseDate: '2026-07-15', partnerId: f.supplier.id, warehouseId: f.warehouse.id,
      taxable: false, lines: [{ itemId: item.id, quantity: 10, unitPrice: 1200 }],
    })
  }
  // 부가세가 반올림으로 0 이 되는 과세 전표 (공급가 1원 → 부가세 0.1 → 0)
  if (!(await rowsOf()).some((r) => Number(r.qty) === 1)) {
    await must('POST', '/purchases', {
      purchaseDate: '2026-07-15', partnerId: f.supplier.id, warehouseId: f.warehouse.id,
      lines: [{ itemId: item.id, quantity: 1, unitPrice: 1 }],
    })
  }

  const both = await rowsOf()
  const free = both.find((r) => r.taxTypeName === '면세')
  eq('면세 전표는 면세로 나온다', free ? Number(free.qty) : 0, 10)
  const tiny = both.find((r) => Number(r.qty) === 1)
  const tinyDoc = (await must('GET', '/purchases')).find((d) => d.docNo === (tiny ? tiny.docNo : ''))
  eq('1원짜리 과세 전표는 부가세가 반올림으로 0', Number(tinyDoc.vatAmount), 0)
  eq('부가세가 0 이어도 과세는 과세다', tiny.taxTypeName, '과세')
  eq('거래유형이 실제로 줄을 갈라 놓는다',
    both.filter((r) => r.taxTypeName === '과세').length + '/' + both.filter((r) => r.taxTypeName === '면세').length,
    '2/1')

  // 구매전표가 물려 있어 품목은 못 지운다(FK). 다음 회차가 쓰도록 기준단가만 되돌린다.
  await must('PUT', `/items/${item.id}`, {
    name: '구매단가시험', unit: 'EA', category: 'MERCHANDISE',
    unitPrice: 1000, purchasePrice: 0, safetyStock: 0, active: false,
  })
  eq('시험 품목은 사용중지로 남긴다',
    (await must('GET', '/items')).find((i) => i.code === `${P}PPBASE`).active, false)
}

/**
 * <b>근거수주가 붙은 판매는 주문수량을 넘길 수 없다.</b>
 *
 * 출하는 잔량을 검사하는데(초과하면 거부) 판매는 아무 검사가 없었다. 그래서 수주 50개에
 * 판매전표를 57개까지 끊을 수 있었다 — 개발 DB 에 실제로 <b>146건</b>이 그 상태였다.
 * 미판매현황은 음수를 0 으로 잘라 보여 주므로 화면상으로는 멀쩡해 보였고,
 * 그래서 아무도 몰랐다.
 */
async function scenarioSaleWithinOrder(f) {
  section('■ 근거전표 잔량 검사(판매·구매)')

  const order = await must('POST', '/sales-orders', {
    partnerId: f.customer.id, orderDate: '2026-07-13',
    lines: [{ itemId: f.product.id, quantity: 10, unitPrice: 1000 }],
  })
  const line = (qty) => ({
    saleDate: '2026-07-13', partnerId: f.customer.id, warehouseId: f.warehouse.id,
    lines: [{ itemId: f.product.id, quantity: qty, unitPrice: 1000, sourceOrderId: order.id }],
  })

  const first = await must('POST', '/sales', line(6))
  eq('잔량 안이면 통과', first.lines[0].quantity, 6)
  const second = await must('POST', '/sales', line(4))
  eq('남은 만큼도 통과', second.lines[0].quantity, 4)

  const over = await call('POST', '/sales', line(1))
  eq('주문수량을 넘기면 거부', over.status, 400)
  eq('얼마나 넘쳤는지 알려 준다',
    /근거수주의 잔량을 초과합니다/.test(String(over.data?.message ?? '')), true)

  // 수량을 그대로 둔 수정은 통과해야 한다 — 자기 수량을 두 번 세면 멀쩡한 수정이 막힌다
  const edited = await call('PUT', `/sales/${first.id}`, { ...line(6), remark: 'QA 그대로 수정' })
  eq('수량 그대로 수정은 통과', edited.status, 200)
  // 줄이는 수정도 통과, 늘리는 수정은 잔량만큼만
  eq('줄이는 수정은 통과', (await call('PUT', `/sales/${first.id}`, line(5))).status, 200)
  eq('늘리는 수정도 잔량 안이면 통과', (await call('PUT', `/sales/${first.id}`, line(6))).status, 200)
  eq('잔량을 넘기는 수정은 거부', (await call('PUT', `/sales/${first.id}`, line(7))).status, 400)

  // 근거수주에 없는 품목은 애초에 붙일 수 없다
  const other = await call('POST', '/sales', {
    saleDate: '2026-07-13', partnerId: f.customer.id, warehouseId: f.warehouse.id,
    lines: [{ itemId: f.material.id, quantity: 1, unitPrice: 100, sourceOrderId: order.id }],
  })
  eq('근거수주에 없는 품목은 거부', other.status, 400)

  await must('DELETE', `/sales/${second.id}`)
  await must('DELETE', `/sales/${first.id}`)
  await must('DELETE', `/sales-orders/${order.id}`)

  // ── 구매도 같은 규칙이다. 판매만 막고 구매를 놔두면 반쪽짜리다.
  const po = await must('POST', '/purchase-orders', {
    partnerId: f.supplier.id, orderDate: '2026-07-13', warehouseId: f.warehouse.id,
    lines: [{ itemId: f.material.id, quantity: 10, unitPrice: 500 }],
  })
  const buy = (qty) => ({
    purchaseDate: '2026-07-13', partnerId: f.supplier.id, warehouseId: f.warehouse.id,
    lines: [{ itemId: f.material.id, quantity: qty, unitPrice: 500, sourceOrderId: po.id }],
  })
  const bought = await must('POST', '/purchases', buy(7))
  eq('발주 잔량 안이면 통과', bought.lines[0].quantity, 7)
  const overBuy = await call('POST', '/purchases', buy(4))
  eq('발주수량을 넘기면 거부', overBuy.status, 400)
  eq('구매도 얼마나 넘쳤는지 알려 준다',
    /근거발주의 잔량을 초과합니다/.test(String(overBuy.data?.message ?? '')), true)
  eq('구매도 수량 그대로 수정은 통과',
    (await call('PUT', `/purchases/${bought.id}`, { ...buy(7), remark: 'QA 그대로' })).status, 200)
  await must('DELETE', `/purchases/${bought.id}`)
  await must('DELETE', `/purchase-orders/${po.id}`)
}

/**
 * <b>미출하현황이 말하는 미출하수량 = 실제로 낼 수 있는 잔량.</b>
 *
 * 예전에는 미출하수량을 "주문 − 출하<b>완료</b>" 로 냈다. 출하지시(READY)만 낸 수량은
 * 계속 미출하로 남아, 화면을 믿고 또 지시를 내면 서버가
 * "출하수량이 잔량을 초과합니다" 로 거부했다. 화면이 말하는 숫자와 서버가 허락하는
 * 숫자가 서로 달랐고, 둘 다 자기 딴에는 일관돼서 어느 쪽이 틀렸는지 알 수 없었다.
 *
 * <p>이제 둘 다 "주문 − (출하지시 + 출하완료)" 를 본다. 여기서 그 일치를 못 박는다.
 */
async function scenarioUnshippedMatchesRemaining(f) {
  section('■ 미출하수량 = 출하 가능 잔량')

  const order = await must('POST', '/sales-orders', {
    partnerId: f.customer.id, orderDate: '2026-07-12',
    lines: [{ itemId: f.product.id, quantity: 10, unitPrice: 1000 }],
  })
  const lineId = order.lines[0].lineId
  const unshippedOf = async () =>
    (await must('GET', '/sales-orders/unshipped')).find((u) => u.orderId === order.id)

  eq('출하 전에는 주문수량이 그대로 미출하', Number((await unshippedOf()).unshippedQty), 10)

  const ship = await must('POST', `/sales-orders/${order.id}/ship`,
    { shipDate: '2026-07-12', lines: [{ orderLineId: lineId, qty: 4 }] })
  const after = await unshippedOf()
  eq('출하지시를 내면 그만큼 미출하가 준다', Number(after.unshippedQty), 6)
  eq('출하수량 칸도 지시분을 센다', Number(after.shippedQty), 4)

  // 화면이 말하는 미출하수량(6)을 그대로 내면 통과해야 한다 — 이게 핵심이다
  const ship2 = await must('POST', `/sales-orders/${order.id}/ship`,
    { shipDate: '2026-07-12', lines: [{ orderLineId: lineId, qty: 6 }] })
  eq('미출하수량만큼은 그대로 낼 수 있다', ship2.totalQuantity, 6)
  eq('다 내면 미출하 목록에서 빠진다', (await unshippedOf()) === undefined, true)

  // 취소하면 되돌아온다
  await must('PATCH', `/shipments/${ship2.id}/status`, { status: 'CANCELED' })
  eq('출하를 취소하면 미출하가 되살아난다', Number((await unshippedOf()).unshippedQty), 6)

  await must('DELETE', `/shipments/${ship2.id}`)
  await must('DELETE', `/shipments/${ship.id}`)
  eq('출하를 지우면 주문수량 전부가 미출하로 돌아온다',
    Number((await unshippedOf()).unshippedQty), 10)
  await must('DELETE', `/sales-orders/${order.id}`)
}

async function scenarioUnsold(f) {
  section('■ 시나리오 1-b. 수주 → 판매 전환 → 미판매현황')

  const order = await must('POST', '/sales-orders', {
    partnerId: f.customer.id, orderDate: '2026-07-11',
    lines: [{ itemId: f.product.id, quantity: 50, unitPrice: 2000 }],
  })
  const lineId = order.lines[0].lineId
  const un = async () => (await must('GET', '/sales-orders/unsold')).find((r) => r.orderLineId === lineId)

  eq('판매 전 미판매 = 주문수량', (await un()).unsoldQty, 50)
  eq('판매 전 미판매금액 = 수량 × 단가', (await un()).unsoldAmount, 100000)

  // 근거전표(수주)를 달고 20개만 판매 → 미판매 30 남아야 한다
  const sale1 = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2026-07-12',
    lines: [{ itemId: f.product.id, quantity: 20, unitPrice: 2000, sourceOrderId: order.id }],
  })
  eq('부분 판매 후 판매수량 = 20', (await un()).soldQty, 20)
  eq('부분 판매 후 미판매 = 30', (await un()).unsoldQty, 30)
  eq('부분 판매 후 미판매금액 = 60000', (await un()).unsoldAmount, 60000)

  // 근거전표 없이 판 줄은 이 수주의 미판매를 줄이지 않는다
  const sale2 = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2026-07-12',
    lines: [{ itemId: f.product.id, quantity: 5, unitPrice: 2000 }],
  })
  eq('근거전표 없는 판매는 미판매에 영향 없음', (await un()).unsoldQty, 30)

  // 잔량을 마저 팔면 목록에서 빠진다
  const sale3 = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2026-07-13',
    lines: [{ itemId: f.product.id, quantity: 30, unitPrice: 2000, sourceOrderId: order.id }],
  })
  eq('전량 판매 후 미판매 목록에서 사라짐',
    (await must('GET', '/sales-orders/unsold')).filter((r) => r.orderLineId === lineId).length, 0)

  /*
   * 예전에는 여기서 "주문보다 많이 팔아도 음수로 내려가지 않는다" 를 못 박았다.
   * 즉 <b>초과 판매가 되는 것을 정상으로 적어 둔 것</b>이고, 이 시나리오가 매 회차
   * 7개씩 초과 판매를 만들어 개발 DB 에 146건이 쌓였다.
   * 미판매현황이 음수를 0 으로 잘라 보여 주니 화면은 멀쩡해 보였다.
   * 이제 판매도 출하처럼 근거수주의 잔량을 넘길 수 없다.
   */
  const over = await call('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2026-07-13',
    lines: [{ itemId: f.product.id, quantity: 7, unitPrice: 2000, sourceOrderId: order.id }],
  })
  eq('주문보다 많이 팔 수 없다', over.status, 400)
  eq('그래서 미판매 목록에도 안 나타난다',
    (await must('GET', '/sales-orders/unsold')).filter((r) => r.orderLineId === lineId).length, 0)

  // 만든 전표는 치운다 — 안 지우면 매 회차 쌓여 재고와 채권을 밀어낸다
  for (const x of [sale3, sale2, sale1]) await must('DELETE', `/sales/${x.id}`)
  await must('DELETE', `/sales-orders/${order.id}`)
}

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
  /*
   * 예전에는 여기서 "출하지시(READY)는 아직 출하로 치지 않음 → shippedQty 0" 을 못 박았다.
   * 그런데 <b>서버는 잔량을 낼 때 출하지시분까지 뺀다</b>(초과 출하 검사가 그 기준이다).
   * 그래서 미출하현황이 "100 남았다" 고 말해도 100 을 내려 하면 거부당했다.
   * 두 규칙이 어긋나 있었고 둘 다 자기 딴에는 일관돼서 어느 쪽이 틀렸는지 알 수 없었다.
   * 지금은 양쪽 다 "주문 − (지시 + 완료)" 로 본다.
   */
  eq('출하지시도 미출하에서 뺀다', (await un()).shippedQty, 30)
  eq('그래서 미출하는 70', (await un()).unshippedQty, 70)

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

  // 치운다. 출하를 먼저 지워야 수주가 지워진다(출하가 수주를 근거로 가리킨다).
  for (const sh of [ship2, ship1]) await must('DELETE', `/shipments/${sh.id}`)
  await must('DELETE', `/sales-orders/${order.id}`)
}

/** 생산계획 → 작업지시 관계 */
async function scenarioPlan(f) {
  section('■ 시나리오 2. 생산계획 → 작업지시 (관계 연결)')

  const plan = await must('POST', '/production-plans', {
    productId: f.product.id, planWeek: '2026-W29', demandQty: 50, planQty: 50,
  })
  isNull('계획 생성 직후 작업지시 없음', plan.workOrderId)

  // 확정해야 지시로 넘어간다. 예전에는 서버가 상태를 안 봐서 검토 중인 계획도 그대로
  // 작업지시가 됐고, 이 시나리오가 그 <b>틀린 동작을 그대로 담고</b> 있었다 —
  // 화면은 진작 확정한 계획에만 버튼을 보여 주고 있었는데 API 는 아무나 받아 줬다.
  await must('PATCH', `/production-plans/${plan.id}/status`, { status: 'CONFIRMED' })

  const ordered = await must('POST', `/production-plans/${plan.id}/work-order`)
  eq('작업지시가 실제 FK로 연결됨', typeof ordered.workOrderId, 'number')
  eq('작업지시번호가 응답에 실림', String(ordered.workOrderNo).startsWith('WO-'), 'true')
  eq('계획 상태는 지시완료', ordered.statusName, '지시완료')

  await rejects('같은 계획 재지시는 거부', 'POST', `/production-plans/${plan.id}/work-order`, undefined, '이미')

  // 전환된 계획은 못 지운다 — 계획만 사라지고 작업지시가 남으면 그 지시의 출처를 알 수 없다.
  const lockedPlan = await call('DELETE', `/production-plans/${plan.id}`)
  eq('작업지시로 전환된 계획은 못 지운다', lockedPlan.status, 400)
  eq('작업지시를 먼저 지우라고 말한다',
    /작업지시/.test(String(lockedPlan.data?.message ?? '')), true)

  eq('작업지시를 지울 수 있다', (await call('DELETE', `/work-orders/${ordered.workOrderId}`)).status, 204)
  const unlinked = (await must('GET', '/production-plans')).find((x) => x.id === plan.id)
  isNull('작업지시를 지우면 계획의 연결이 풀린다', unlinked.workOrderId)
  eq('계획 상태도 지시완료에서 돌아온다', unlinked.statusName !== '지시완료', true)
  eq('그러고 나면 계획도 지워진다', (await call('DELETE', `/production-plans/${plan.id}`)).status, 204)
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

  /*
   * 생산실적·작업지시 삭제.
   *
   * 둘 다 삭제가 아예 없었다. 수량을 잘못 넣은 생산실적은 되돌릴 방법이 없어 완제품과
   * 자재 재고가 틀린 채 남았고 작업지시는 영영 '완료' 였다. 원본에는 생산입고조회에
   * [선택삭제], 생산계획/MRP리스트에 [삭제] 가 있다.
   *
   * 하네스가 매 회차 만든 것을 못 치운 것도 같은 이유다 — 개발 DB 의 작업지시가
   * 560건까지 불어나 현황 화면을 실측할 수 없었다.
   */
  const prod = (await must('GET', '/productions')).find((x) => x.workOrderId === wo.id)
  const blocked = await call('DELETE', `/work-orders/${wo.id}`)
  eq('생산실적이 있는 작업지시는 못 지운다', blocked.status, 400)
  eq('무엇을 먼저 지워야 하는지 말한다',
    /생산실적/.test(String(blocked.data?.message ?? '')), true)

  eq('생산실적을 지울 수 있다', (await call('DELETE', `/productions/${prod.id}`)).status, 204)
  eq('지우면 완제품 입고가 취소된다', await stockOf(f.product.id), prodBefore)
  eq('지우면 소모했던 자재가 돌아온다', await stockOf(f.material.id), matBefore)

  const reverted = (await must('GET', '/work-orders')).find((x) => x.id === wo.id)
  eq('작업지시 진척도 되돌아온다', Number(reverted.producedQty), 0)
  eq('완료였던 작업지시가 계획으로 돌아온다', reverted.statusName, '계획')

  eq('실적이 없어지면 작업지시도 지울 수 있다', (await call('DELETE', `/work-orders/${wo.id}`)).status, 204)

  /*
   * 수동소모 — BOM 과 다르게 넣으면 <b>그대로</b> 들어가야 한다.
   *
   * 생산입고/소모현황 I 과 작업지시서효율현황은 "BOM 대로 썼다면(표준) 대 정말 쓴 것(실제)"
   * 의 차이를 보여 준다. 수동으로 넣은 수량이 BOM 값으로 덮어써지면 그 차이가 영원히 0 이라
   * 두 화면이 통째로 쓸모없어진다. 재고도 넣은 만큼 빠져야 한다.
   */
  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 20,
  })
  const matBefore2 = await stockOf(f.material.id)
  const wo2 = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: 1, orderDate: '2026-07-10',
  })
  const manual = await must('POST', '/productions', {
    workOrderId: wo2.id, producedQty: 1, productionDate: '2026-07-10',
    materials: [{ componentId: f.material.id, quantity: 6 }],
  })
  eq('수동소모 수량이 그대로 저장된다', Number(manual.materials[0].quantity), 6)
  eq('수동으로 넣은 만큼 재고가 빠진다', await stockOf(f.material.id), matBefore2 - 6)

  // BOM 표준은 완제품 1개당 원자재 2개다. 6 을 넣었으니 표준 2 · 실제 6 · 차이 4 가 보여야 한다.
  const reread = (await must('GET', '/productions')).find((x) => x.id === manual.id)
  eq('현황 화면이 볼 수 있게 실제 투입량이 응답에 실린다', Number(reread.materials[0].quantity), 6)

  eq('수동소모 실적도 지울 수 있다', (await call('DELETE', `/productions/${manual.id}`)).status, 204)
  eq('지우면 수동으로 넣은 만큼 돌아온다', await stockOf(f.material.id), matBefore2)
  await must('DELETE', `/work-orders/${wo2.id}`)
  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: 20,
  })

  // 입고했던 원자재 200개도 되돌린다 — 안 그러면 회차마다 재고가 200씩 는다.
  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: 200,
  })
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
    warehouseId: f.warehouse.id, note: `${P}적요`, workItemId: f.material.id,
  })
  eq('마스터에 있는 공정명 → processId 연결', wrLinked.processId, f.process.id)

  // 생산공장·적요는 원본 작업내역입력 머리와 그리드 마지막 열이다.
  // 입력·조회·현황 셋 다 이 이름으로 [생산공장명] 칸을 찍는다 — id 만 오면
  // 화면이 창고 목록을 따로 뒤져야 하고, 지운 창고면 빈칸이 된다.
  eq('생산공장이 실린다', wrLinked.warehouseId, f.warehouse.id)
  eq('생산공장 이름이 실린다', wrLinked.warehouseName, f.warehouse.name)
  eq('적요가 실린다', wrLinked.note, `${P}적요`)

  /*
   * 원본 작업내역입력 그리드의 <b>[작업품목]</b>. 세 화면(입력·조회·현황)이 같은 열을 든다.
   *
   * <b>생산품목과 다른 것</b>이다 — 작업지시의 생산품목이 AQD 여도 그 안의 한 작업은
   * 'AQD 몸체' 를 다룬다. 우리는 그 자리에 <b>공정명</b>을 대신 넣어 화면에
   * '작업품목(공정)' 이라고 적어 두고 있었다. 품목별로 작업량을 셀 수가 없었다.
   */
  eq('작업품목이 실린다', wrLinked.workItemId, f.material.id)
  eq('작업품목명도 같이 온다', wrLinked.workItemName, f.material.name)
  eq('작업품목은 공정이 아니다', wrLinked.workItemName === wrLinked.process, false)
  const reWr = (await must('GET', '/work-results')).find((r) => r.id === wrLinked.id)
  eq('다시 조회해도 생산공장이 유지된다', reWr.warehouseName, f.warehouse.name)

  const wrFree = await must('POST', '/work-results', {
    process: `${P}임시수작업`, worker: 'QA', goodQty: 3, defectQty: 0, workTimeMin: 5,
  })
  isNull('마스터에 없는 자유입력 공정 → processId 는 null', wrFree.processId)
  eq('자유입력 공정명은 보존', wrFree.process, `${P}임시수작업`)
  // 안 고르면 null 이다. 아무 창고로 채우면 하지 않은 작업을 그 공장이 한 것이 된다.
  isNull('생산공장을 안 고르면 null', wrFree.warehouseId)
  // 안 적을 수 있다. 옛 작업내역에는 이 값이 없다 — 공정명으로 채우면 또 거짓말이 된다.
  isNull('작업품목을 안 고르면 null', wrFree.workItemId)

  // 사용중지된 품목은 새로 고를 수 없다 (getUsable)
  const stoppedItem = await must('PUT', `/items/${f.material.id}`, {
    name: f.material.name, unit: f.material.unit, category: f.material.category,
    unitPrice: f.material.unitPrice, purchasePrice: f.material.purchasePrice,
    safetyStock: f.material.safetyStock, active: false,
  })
  eq('시험용으로 잠깐 사용중지', stoppedItem.active, false)
  await rejects('사용중지된 품목은 작업품목이 될 수 없다', 'POST', '/work-results',
    { process: `${P}임시수작업`, worker: 'QA', goodQty: 1, workItemId: f.material.id },
    '사용중지된 품목')
  await must('PUT', `/items/${f.material.id}`, {
    name: f.material.name, unit: f.material.unit, category: f.material.category,
    unitPrice: f.material.unitPrice, purchasePrice: f.material.purchasePrice,
    safetyStock: f.material.safetyStock, active: true,
  })
  eq('되돌려 놓는다', (await must('GET', '/items')).find((x) => x.id === f.material.id).active, true)

  // 이 두 줄이 매 실행마다 남아 있었다 — 작업내역이 실행할 때마다 두 건씩 불어났다.
  for (const r of [wrLinked, wrFree]) await must('DELETE', `/work-results/${r.id}`)
  eq('시험용 작업내역은 남기지 않는다',
    (await must('GET', '/work-results')).filter((r) => r.worker === 'QA').length, 0)

  // 관리항목 — 이카운트 품목등록 A7 탭의 `item_type`. 전표 라인에는 읽기전용으로 따라 붙는다.
  // 오래도록 아무 테이블도 참조하지 않는 죽은 마스터였다(FK 0개). 그 회귀를 막는 단언이다.
  const mgmt = await ensure('/management-items', 'code', `${P}MG`, null, {
    code: `${P}MG`, name: 'QA관리항목', description: 'QA 전용',
  })
  const tagged = await must('PUT', `/items/${f.material.id}`, {
    name: f.material.name, spec: f.material.spec, unit: f.material.unit,
    category: f.material.category, unitPrice: f.material.unitPrice,
    safetyStock: f.material.safetyStock, barcode: f.material.barcode,
    udiDi: f.material.udiDi, managementItemId: mgmt.id, active: true,
  })
  eq('품목에 관리항목이 붙는다', tagged.managementItemId, mgmt.id)
  eq('관리항목명이 함께 실린다', tagged.managementItemName, 'QA관리항목')
  const reread = (await must('GET', '/items')).find((x) => x.id === f.material.id)
  eq('다시 조회해도 관리항목이 유지된다', reread.managementItemName, 'QA관리항목')

  const cleared = await must('PUT', `/items/${f.material.id}`, {
    name: f.material.name, spec: f.material.spec, unit: f.material.unit,
    category: f.material.category, unitPrice: f.material.unitPrice,
    safetyStock: f.material.safetyStock, barcode: f.material.barcode,
    udiDi: f.material.udiDi, managementItemId: null, active: true,
  })
  isNull('관리항목은 해제할 수 있다', cleared.managementItemId)
}

/** 설정이 실제로 영속되는지 */
/**
 * A/S소모현황 — 조건이 <b>합계를 바꾸는</b> 자리라 못 박는다.
 *
 * <p>이 화면은 서버가 품목별로 <b>합쳐서</b> 준다. 합친 뒤에는 화면에서 거를 수가 없어
 * 조건(접수일자·창고·거래처·수리품목)을 서버가 받아 <b>거른 뒤 합친다.</b>
 * 조건을 잘못 걸면 화면은 멀쩡한 채 숫자만 조용히 틀린다.
 */
/**
 * 견적서의 [창고]·[프로젝트] — 응답 record 에만 만들고 <b>Create 요청에 빠뜨리면
 * 서버가 조용히 버린다.</b> 이 저장소에서 세 번 낸 실수라 저장·재조회를 둘 다 잰다.
 */
async function scenarioQuotationWarehouseProject(f) {
  section('■ 시나리오. 견적서가 창고·프로젝트를 기억한다')

  const proj = await ensure('/projects', 'code', `${P}PRJQ`, null, {
    code: `${P}PRJQ`, name: 'QA견적프로젝트', startDate: '2026-01-01',
  })
  const q = await must('POST', '/quotations', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, projectId: proj.id,
    quoteDate: '2026-03-02', taxable: true,
    lines: [{ itemId: f.product.id, quantity: 2, unitPrice: 10000 }],
  })
  eq('견적서가 창고를 문다', q.warehouseName, f.warehouse.name)
  eq('견적서가 프로젝트를 문다', q.projectName, proj.name)

  /* 발주서도 같은 칸을 물게 했다 — 여기서 같이 잰다(둘 다 프로젝트별 손익의 원자료다). */
  const po = await must('POST', '/purchase-orders', {
    partnerId: f.supplier.id, warehouseId: f.warehouse.id, projectId: proj.id,
    orderDate: '2026-03-02', taxable: true,
    lines: [{ itemId: f.material.id, quantity: 5, unitPrice: 1000 }],
  })
  eq('발주서가 프로젝트를 문다', po.projectName, proj.name)
  const poAgain = (await must('GET', '/purchase-orders')).find((x) => x.id === po.id)
  eq('다시 조회해도 발주의 프로젝트가 남아 있다', poAgain?.projectName, proj.name)

  const again = (await must('GET', '/quotations')).find((x) => x.id === q.id)
  eq('다시 조회해도 창고·프로젝트가 남아 있다',
    `${again?.warehouseName}/${again?.projectName}`, `${f.warehouse.name}/${proj.name}`)

  /*
   * 창고이동·재고조정도 같은 칸을 물게 했다. 담당자는 <b>사원 테이블을 걸지 않고 id 만</b>
   * 드는데(inventory 는 hr 을 참조할 수 없다), 그래서 <b>저장은 되는데 이름이 안 붙는</b>
   * 실수를 내기 쉽다 — id 가 그대로 돌아오는지 잰다.
   */
  const wh2 = await ensure('/warehouses', 'code', `${P}WH2`, null, {
    code: `${P}WH2`, name: 'QA창고2', location: 'QA동 2층',
  })
  const emp = (await must('GET', '/employees'))[0]
  await must('POST', '/stock-adjustments', {
    type: 'SELF_USE', itemId: f.material.id, warehouseId: f.warehouse.id, quantity: 1,
    adjustDate: '2026-03-02', projectId: proj.id, employeeId: emp?.id,
  })
  const adj = (await must('GET', '/stock-adjustments')).find((x) => x.projectName === proj.name)
  eq('재고조정이 프로젝트를 문다', adj?.projectName, proj.name)
  eq('재고조정이 담당자 id 를 그대로 돌려준다', adj?.employeeId, emp?.id ?? null)

  await must('POST', '/stock-transfers', {
    itemId: f.material.id, fromWarehouseId: f.warehouse.id, toWarehouseId: wh2.id,
    quantity: 1, transferDate: '2026-03-02', projectId: proj.id, employeeId: emp?.id,
  })
  const mv = (await must('GET', '/stock-transfers')).find((x) => x.projectName === proj.name)
  eq('창고이동이 프로젝트를 문다', mv?.projectName, proj.name)
  eq('창고이동이 담당자 id 를 그대로 돌려준다', mv?.employeeId, emp?.id ?? null)

  /* 안 고르고도 만들 수 있어야 한다 — 견적 시점에는 아직 못 정하는 일이 흔하다. */
  const bare = await must('POST', '/quotations', {
    partnerId: f.customer.id, quoteDate: '2026-03-02', taxable: true,
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 10000 }],
  })
  eq('창고·프로젝트 없이도 견적이 만들어진다', `${bare.warehouseName}/${bare.projectName}`, 'null/null')
}

async function scenarioAsConsumption(f) {
  section('■ 시나리오. A/S소모현황이 조건대로 걸러 합친다')

  const as = await must('POST', '/as-requests', {
    partnerId: f.customer.id, itemId: f.product.id,
    receiptDate: '2026-03-05', symptom: 'QA 소모현황용 접수', charge: 'QA담당',
    title: 'QA 제목', scheduledDate: '2026-03-12',
  })
  /*
   * 원본 A/S접수입력의 [제목]·[수리예정일자]. 응답 record 에 필드를 만들어 놓고
   * <b>Create 요청에 빠뜨리면 서버가 조용히 버린다</b>(record 에 없는 키는 JSON 에서 무시된다).
   * 화면은 값을 보내고 저장됐다고 믿는데 다시 열면 비어 있다.
   */
  eq('A/S 제목이 저장된다', as.title, 'QA 제목')
  eq('A/S 수리예정일자가 저장된다', as.scheduledDate, '2026-03-12')
  const reread = (await must('GET', '/as-requests')).find((x) => x.id === as.id)
  eq('다시 조회해도 제목·수리예정일자가 남아 있다',
    `${reread?.title}/${reread?.scheduledDate}`, 'QA 제목/2026-03-12')
  await must('POST', `/as-requests/${as.id}/parts`, {
    itemId: f.material.id, warehouseId: f.warehouse.id, quantity: 3, unitPrice: 1000,
  })

  const qtyOf = (rows) => {
    const r = rows.find((x) => x.itemId === f.material.id)
    return r ? Number(r.totalQty) : 0
  }
  const url = (q) => `/as-requests/parts/consumption?${q}`

  eq('접수일자 안이면 소모수량이 잡힌다',
    qtyOf(await must('GET', url('from=2026-03-01&to=2026-03-31'))) >= 3, true)
  eq('접수일자 밖이면 안 잡힌다',
    qtyOf(await must('GET', url('from=2026-01-01&to=2026-01-31'))), 0)
  eq('다른 창고로 거르면 안 잡힌다',
    qtyOf(await must('GET', url(`from=2026-03-01&to=2026-03-31&warehouseId=${f.warehouse.id + 99999}`))), 0)
  eq('그 거래처로 거르면 잡힌다',
    qtyOf(await must('GET', url(`from=2026-03-01&to=2026-03-31&partnerId=${f.customer.id}`))) >= 3, true)
  eq('다른 거래처로 거르면 안 잡힌다',
    qtyOf(await must('GET', url(`from=2026-03-01&to=2026-03-31&partnerId=${f.supplier.id}`))), 0)
  eq('수리품목으로 거르면 잡힌다 — 소모부품이 아니라 <b>수리 대상</b> 품목이다',
    qtyOf(await must('GET', url(`from=2026-03-01&to=2026-03-31&repairItemId=${f.product.id}`))) >= 3, true)
  eq('소모부품 품목을 수리품목으로 주면 안 잡힌다',
    qtyOf(await must('GET', url(`from=2026-03-01&to=2026-03-31&repairItemId=${f.material.id}`))), 0)
}

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

  // 만든 문서는 치운다. 순서가 있다 — 수주를 먼저 지워야 견적의 전환이 풀린다.
  await must('DELETE', `/sales-orders/${order.id}`)
  await must('DELETE', `/quotations/${quote.id}`)
  await must('DELETE', `/quotations/${dead.id}`)
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

  // 입고전환으로 생긴 라인에는 근거전표(발주서)가 붙는다 — 판매·구매입력 그리드의 [불러온 전표] 3열.
  eq('입고전표 라인에 근거 발주서가 실림', purchase.lines[0].sourceDocNo, po.orderNo)
  eq('근거전표 종류는 발주서', purchase.lines[0].sourceDocType, '발주서')
  eq('근거전표 일자도 실림', purchase.lines[0].sourceDocDate, '2026-07-14')
  eq('근거전표 id 가 그 발주서를 가리킴', purchase.lines[0].sourceOrderId, po.id)

  // 입고전표를 지우는 것이 곧 입고취소다(이카운트에도 별도 [입고취소] 버튼은 없다).
  // 발주서의 입고 연결을 풀어 주지 않으면 FK 에 걸려 영영 못 지운다 — 그 회귀를 막는 단언이다.
  await must('DELETE', `/purchases/${purchase.id}`)
  const reverted = (await must('GET', '/purchase-orders')).find((x) => x.id === po.id)
  eq('입고전표를 지우면 발주가 발주확정으로 돌아옴', reverted.statusName, '발주확정')
  isNull('입고 연결(convertedPurchaseId)도 함께 풀림', reverted.convertedPurchaseId)
  eq('입고전표 삭제로 재고도 원복', await stockOf(f.material.id), before)

  // 이후 시나리오의 전제를 되돌린다(발주는 다시 입고된 상태여야 한다).
  const purchase2 = await must('POST', `/purchase-orders/${po.id}/receive`, {
    warehouseId: f.warehouse.id, purchaseDate: '2026-07-14',
  })
  eq('입고취소한 발주를 다시 입고전환할 수 있음', purchase2.docNo.startsWith('PO-'), true)
  eq('재입고 후 재고가 다시 증가', await stockOf(f.material.id), before + 30)

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

  // ── 거래별부가세계산 (이카운트 [거래별부가세계산] / calcbySlip) ──
  // 라인마다 반올림하면 잔돈이 쌓인다. 공급가액 3,333 짜리 세 줄이 정확히 그 경우다.
  const vatLines = [0, 1, 2].map(() => ({ itemId: f.material.id, quantity: 3, unitPrice: 1111 }))

  const byLine = await must('POST', '/purchases', {
    partnerId: f.supplier.id, warehouseId: f.warehouse.id, purchaseDate: '2026-07-14',
    taxable: true, lines: vatLines,
  })
  eq('라인별 반올림: 공급가액 9,999', Number(byLine.supplyAmount), 9999)
  eq('라인별 반올림: 부가세 999 (333 × 3)', Number(byLine.vatAmount), 999)
  eq('기본은 라인별 계산', byLine.vatBySlip, false)

  const bySlip = await must('POST', '/purchases', {
    partnerId: f.supplier.id, warehouseId: f.warehouse.id, purchaseDate: '2026-07-14',
    taxable: true, vatBySlip: true, lines: vatLines,
  })
  eq('거래별 반올림: 부가세 1,000 (round(9,999 × 0.1))', Number(bySlip.vatAmount), 1000)
  eq('거래별 계산 전표로 표시됨', bySlip.vatBySlip, true)
  eq('라인 부가세 합 = 전표 부가세',
    bySlip.lines.reduce((sum, l) => sum + Number(l.vatAmount), 0), Number(bySlip.vatAmount))
  eq('잔차 1원은 한 줄에만 몰린다', bySlip.lines.filter((l) => Number(l.vatAmount) === 334).length, 1)
  eq('합계 = 공급가액 + 부가세', Number(bySlip.totalAmount), 10999)

  // 저장하지 않으면 다시 열었을 때 조용히 라인별로 되돌아가 합계가 바뀐다 — 그 회귀를 막는 단언이다.
  const reread = (await must('GET', '/purchases')).find((x) => x.id === bySlip.id)
  eq('다시 조회해도 거래별 계산이 유지된다', reread.vatBySlip, true)
  eq('다시 조회해도 부가세는 1,000', Number(reread.vatAmount), 1000)

  await must('DELETE', `/purchases/${byLine.id}`)
  await must('DELETE', `/purchases/${bySlip.id}`)

  // 이 시나리오가 만든 발주·입고전표도 치운다. 입고전표를 지우면 발주가 '발주확정' 으로
  // 돌아가므로 순서는 입고 → 발주다. 매 회차 입고전표 1장이 남던 자리다.
  await must('DELETE', `/purchases/${purchase2.id}`)
  await must('DELETE', `/purchase-orders/${po.id}`)
  await must('DELETE', `/purchase-orders/${dead.id}`)
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

  /*
   * <b>확정 전에는 신고 대상이 아니다.</b>
   *
   * 예전에는 이 단언들을 if (!existing) 안에 뒀는데, 첫 실행에서 명세를 확정해 버리므로
   * <b>두 번째 실행부터는 통째로 건너뛰었다</b> — 화면에 ✅ 조차 안 떠서 없어진 줄도 몰랐다.
   * 확정된 명세는 지울 수 없으니 <b>늘 초안인 다른 달</b>을 하나 만들어 그것으로 잰다.
   */
  const DRAFT_MONTH = '2026-12'
  for (const old of (await must('GET', `/payslips?month=${DRAFT_MONTH}`))
    .filter((x) => x.employeeId === emp.id && x.status === 'DRAFT')) {
    await call('DELETE', `/payslips/${old.id}`)
  }
  const draft = await must('POST', '/payslips', {
    employeeId: emp.id, payMonth: DRAFT_MONTH, baseSalary: 3000000,
    lines: [{ kind: 'ALLOWANCE', name: '식대', amount: 200000 }],
  })
  const beforeStmt = await must('GET', `/withholding/statement?month=${DRAFT_MONTH}`)
  eq('미확정 명세는 신고 인원에서 제외',
    beforeStmt.rows.some((r) => r.employeeId === emp.id), false)
  eq('미확정 건수로만 잡힘', beforeStmt.draftCount > 0, true)
  await must('DELETE', `/payslips/${draft.id}`)

  if (!existing) {
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
  /*
   * 원본 양식 20종의 <b>본문 서식</b>이 실제로 들어 있나.
   *
   * 사본 21장(기안서작성을 양식마다 하나씩 열어 둔 것)을 실측했더니 이름은 다 맞는데
   * 넷은 field_schema 가 빈 배열이었다 — 고르면 제목과 자유본문만 나오고 양식이
   * 아무 구실을 안 했다. 결재는 도는데 무엇을 결재하는지가 문서에 없는 상태다.
   */
  const forms = await must('GET', '/approval-form-templates')
  const byName = new Map(forms.map((t) => [t.name, t]))
  for (const [name, atLeast] of [['기술문서', 3], ['내부일반문서', 3],
                                 ['급여 지급결의서', 6], ['인사발령공고', 3]]) {
    const t = byName.get(name)
    eq(`${name} 양식이 있다`, !!t, true)
    eq(`${name} 본문 칸이 비어 있지 않다`, (t?.fieldSchema ?? []).length >= atLeast, true)
  }

  // 매달 같은 목록은 미리 깔아 둔다 — 원본이 없애 주는 수고가 바로 그것이다.
  const payroll = byName.get('급여 지급결의서')
  const deduct = (payroll?.fieldSchema ?? []).find((f) => f.key === 'deductDetail')
  eq('급여 지급결의서에 공제상세 표가 있다', deduct?.type, 'table')
  eq('공제 항목이 미리 깔려 있다', (deduct?.defaultRows ?? []).length, 12)
  eq('건강보험이 그 안에 있다',
    (deduct?.defaultRows ?? []).some((r) => r.kind === '건강보험'), true)

  // 열 이름을 바꿔도 기존 기안서의 값이 갈 곳을 잃으면 안 된다 — 키는 그대로 둔다.
  const expense = byName.get('개인경비 사용내역서')
  const cols = (expense?.fieldSchema ?? [])[0]?.columns ?? []
  eq('개인경비 표가 원본대로 7열', cols.length, 7)
  eq('쓰던 금액 키는 그대로다', cols.some((c) => c.key === 'amount'), true)
  eq('쓰던 일자 키도 그대로다', cols.some((c) => c.key === 'useDate'), true)

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

  // 시험용 양식은 치운다. 사용중으로 남겨 두면 실제 기안서작성의 양식 목록에 섞여
  // 사람이 'QA 양식' 을 고를 수 있게 된다 — 실제로 그렇게 남아 있었다.
  // 위 결재선이 이 양식을 가리키므로 그것을 지운 뒤에 지운다.
  eq('시험용 양식을 지울 수 있다',
    (await call('DELETE', `/approval-settings/templates/${template.id}`)).status, 204)
  eq('기안 화면 양식 목록에 남지 않는다',
    (await must('GET', '/approval-form-templates')).some((t) => t.code === code), false)
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

  // 다른 흐름이 만든 명세를 건드리지 않도록, 명세가 아직 없는 (사원, 귀속월) 자리를 골라 쓴다.
  // 확정·이체된 명세는 지울 수 없으므로(급여는 확정 후 지우면 안 되는 게 맞다) 매 실행 한 자리씩 소진된다.
  //
  // 예전엔 employees[0] 한 사원에만 매달려서 120번(10년×12달) 돌리면 하드 스톱이 났다.
  // 사원 축까지 훑으면 여유가 사원 수만큼 곱해진다. 달을 바깥 루프에 두는 건
  // /payslips?month= 한 번으로 그 달의 모든 사원을 한꺼번에 걸러내기 위해서다.
  let month = null
  let payEmp = emp
  outer:
  /*
   * <b>이 시나리오는 자리를 되돌려 놓지 못한다.</b> 확정한 급여명세는 지울 수 없어서다
   * (제품 규칙이 그렇다 — 확정을 되돌리는 길을 시험 때문에 만들 수는 없다).
   * 그래서 돌릴 때마다 귀속월 한 자리를 먹는다. 2036년까지로 두었더니 600자리를
   * 다 써서 하네스가 멈췄다(사원 5명 × 120달). 넉넉히 늘려 둔다.
   */
  for (let y = 2027; y <= 2086; y++) {
    for (let m = 1; m <= 12; m++) {
      const candidate = `${y}-${String(m).padStart(2, '0')}`
      const taken = new Set((await must('GET', `/payslips?month=${candidate}`)).map((p) => p.employeeId))
      const free = employees.find((e) => !taken.has(e.id))
      if (free) {
        month = candidate
        payEmp = free
        break outer
      }
    }
  }
  if (month === null) {
    throw new Error(
      `2027~2086년에 사원 ${employees.length}명 모두 빈 귀속월이 없습니다.`
      + ' 확정된 급여명세는 API 로 지울 수 없으니 개발 DB 에서 직접 지우세요:'
      + " delete from payslips where pay_month >= '2027-01' (딸린 payslip_lines·payroll_transfer_lines 먼저).")
  }

  const slip = await must('POST', '/payslips', {
    employeeId: payEmp.id, payMonth: month, payGroupId: group.id, lines: [],
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

  // ── 급여이체: 확정된 명세만, 계좌에서 실지급액이 나간다.
  // 계좌를 귀속월(month)별 전용으로 둔다. month 는 매 실행 '빈 귀속월'로 새로 선택되므로
  // 계좌도 매번 신선한 개설잔액(5천만)으로 생성돼, 반복 실행에도 잔액이 드리프트로 고갈되지 않는다.
  // (예전엔 계좌 하나를 재사용해 매 실행 ~3백만씩 빠져나가 ~15회 후 '잔액 부족'으로 중단됐다.)
  const accountNo = `${P}440-666-${month.replace('-', '')}`
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

  // 익명게시판(E070252)은 제목 칸이 없는 글상자 하나다. 제목을 강제하면 그 화면을 만들 수 없다.
  const wall = await must('POST', '/board', { content: `${P}익명 한마디
둘째 줄`, anonymous: true })
  eq('제목 없이 올리면 첫 줄이 제목이 된다', wall.title, `${P}익명 한마디`)
  eq('본문은 통째로 남는다', wall.content, `${P}익명 한마디
둘째 줄`)
  eq('목록에도 본문이 실린다',
    (await must('GET', '/board')).find((x) => x.id === wall.id).content, `${P}익명 한마디
둘째 줄`)
  await rejects('제목도 내용도 없으면 거부', 'POST', '/board', { anonymous: true }, '내용을 입력하세요')
  await must('DELETE', `/board/${wall.id}`)

  // 게시글번호는 게시판을 가로질러 한 줄기다 — 원본 공지사항 목록의 번호에 구멍이 보이는 이유다.
  const notice = await must('POST', '/work-posts', {
    board: 'NOTICE', title: `${P}공지`, content: '공지 내용', forwardTo: '전 직원', postDate: '2026-08-25',
  })
  const work = await must('POST', '/work-posts', {
    board: 'WORK', title: `${P}업무`, content: '업무 내용', postDate: '2026-08-25',
  })
  eq('게시판이 응답에 실린다', notice.boardName, '공지사항')
  eq('board 를 안 주면 WORK', (await must('POST', '/work-posts',
    { title: `${P}기본게시판`, content: '내용', postDate: '2026-08-25' })).boardName, 'WORK')
  eq('게시글번호는 게시판을 가로질러 이어진다', work.postNo, notice.postNo + 1)
  eq('공지사항 목록에는 공지만',
    (await must('GET', '/work-posts?board=NOTICE')).every((p) => p.board === 'NOTICE'), true)
  eq('WORK 목록에 공지는 안 낀다',
    (await must('GET', '/work-posts?board=WORK')).some((p) => p.id === notice.id), false)
  await must('DELETE', `/work-posts/${notice.id}`)
  await must('DELETE', `/work-posts/${work.id}`)
  for (const p of await must('GET', '/work-posts?board=WORK')) {
    if (p.title === `${P}기본게시판`) await must('DELETE', `/work-posts/${p.id}`)
  }
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

  // 만든 전표는 치운다. 안 치우면 매 회차 판매 2장·구매 1장이 쌓이는데,
  // 실제로 그렇게 개발 DB 의 전표가 통째로 QA 것이 되어 현황 화면을 실측할 수 없었다.
  for (const d of [sale, noOwner]) await must('DELETE', `/sales/${d.id}`)
  await must('DELETE', `/purchases/${buy.id}`)
  const cleaned = await must('GET', `/employees/performance?from=${FROM}&to=${TO}`)
  eq('치우고 나면 실적이 원래대로',
    Number(cleaned.rows.find((r) => r.employeeId === emp.id)?.salesAmount ?? 0), beforeSales)
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

  // 이 계좌는 하네스를 돌릴 때마다 돈이 빠져나간다(이동 50만 + 카드결제). 계좌를 재사용하므로
  // 실행을 반복하면 언젠가 잔액이 바닥나 시나리오 25 부터가 통째로 실행되지 않는다.
  // 실제로 그렇게 멈춰 있었다(잔액 240,000). 실행 횟수에 좌우되지 않도록 부족하면 먼저 채우고 시작한다.
  const NEEDED = 3_000_000
  if (await balanceOf(from.id) < NEEDED) {
    await must('POST', '/bank-cards/transactions', {
      bankAccountId: from.id, deposit: true, amount: NEEDED,
      counterAccountId: accounts.find((a) => a.code === '101').id,   // 현금
      txnDate: '2026-07-14', description: 'QA 시나리오 준비금 보충',
    })
  }

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

  /*
   * 원본 거래처검색·품목등록 리스트의 <b>[검색창내용]</b>.
   *
   * 공식 상호 말고 사람들이 실제로 부르는 이름(약칭·영문명·옛 상호)을 적어 두고 그걸로
   * 찾는 칸이다. 우리 코드도움은 코드와 이름 둘로만 찾아서, '한국기계전기전자시험연구원' 을
   * 'KTC' 로 기억하는 사람은 목록을 눈으로 훑는 수밖에 없었다. 거래처가 300곳이 넘으면
   * 그게 코드도움을 쓰는 이유를 지운다.
   */
  const ALIAS = 'QAALIAS7'
  const pBody = {
    name: f.customer.name, type: f.customer.type, bizRegNo: f.customer.bizRegNo,
    ceoName: f.customer.ceoName, manager: f.customer.manager, phone: f.customer.phone,
    address: f.customer.address, partnerGroupId: f.customer.partnerGroupId,
  }
  const iBody = {
    name: f.product.name, unit: f.product.unit, category: f.product.category,
    unitPrice: f.product.unitPrice, purchasePrice: f.product.purchasePrice,
    safetyStock: f.product.safetyStock, stockTracked: f.product.stockTracked,
  }
  const before = await must('GET', `/workspace/search?q=${ALIAS}`)
  eq('별명을 넣기 전에는 아무것도 안 걸린다', before.total, 0)

  const pKw = await must('PUT', `/partners/${f.customer.id}`, { ...pBody, searchKeyword: ALIAS })
  eq('거래처에 검색창내용이 저장된다', pKw.searchKeyword, ALIAS)
  const iKw = await must('PUT', `/items/${f.product.id}`, { ...iBody, searchKeyword: ALIAS })
  eq('품목에도 저장된다', iKw.searchKeyword, ALIAS)

  const byAlias = await must('GET', `/workspace/search?q=${ALIAS}`)
  eq('부르는 이름으로 거래처가 걸린다',
    byAlias.groups.find((g) => g.type === 'PARTNER')?.hits.length >= 1, true)
  eq('부르는 이름으로 품목도 걸린다',
    byAlias.groups.find((g) => g.type === 'ITEM')?.hits.length >= 1, true)

  await must('PUT', `/partners/${f.customer.id}`, { ...pBody, searchKeyword: '' })
  await must('PUT', `/items/${f.product.id}`, { ...iBody, searchKeyword: '' })
  eq('지우면 다시 안 걸린다', (await must('GET', `/workspace/search?q=${ALIAS}`)).total, 0)

  /*
   * 원본 품목등록 리스트의 <b>[구매처명]</b> — 이 품목을 늘 사 오는 곳.
   *
   * 우리 품목에는 적을 자리가 아예 없어서, 같은 물건을 어디서 사는지가 사람 머릿속에만 있었다.
   * inventory 는 trade 를 참조할 수 없어(DAG) 서버는 <b>id 만</b> 들고 이름은 화면이 붙인다 —
   * warehouses.outsourcing_partner_id 와 같은 자리다. 그래서 여기서 재는 것은 <b>id 가
   * 실제로 저장되고 되읽히는가</b>이다. 예전에 창고 PUT 이 안 보낸 칸을 null 로 만든 적이 있어
   * 되읽기까지 확인한다.
   */
  const sup = await must('PUT', `/items/${f.product.id}`, { ...iBody, supplierId: f.supplier.id })
  eq('품목에 구매처가 저장된다', sup.supplierId, f.supplier.id)
  eq('다시 조회해도 남는다',
    (await must('GET', '/items')).find((i) => i.id === f.product.id).supplierId, f.supplier.id)
  const cleared = await must('PUT', `/items/${f.product.id}`, { ...iBody, supplierId: null })
  eq('비우면 비워진다', cleared.supplierId, null)

  /*
   * 원본 품목등록 리스트의 <b>[이미지]</b> 열. 비슷하게 생긴 부품이 수십 개인데
   * 코드와 이름만으로 고르게 하고 있었다. 파일은 stored_files 가 든다 —
   * 기안서 첨부·ECDrive 와 같은 저장소다.
   *
   * <b>없는 파일 id 는 거절한다.</b> 조용히 null 로 저장하면 사람은 붙인 줄 알고 넘어간다.
   */
  const ghostImg = await call('PUT', `/items/${f.product.id}`, { ...iBody, imageFileId: 99999999 })
  eq('없는 이미지 파일은 거부', ghostImg.status, 404)
  isNull('거부됐으니 붙지 않았다',
    (await must('GET', '/items')).find((i) => i.id === f.product.id).imageFileId)

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

  // My품목 — 전표 입력 툴바 [My품목 ▾]. E Note 와 같은 '개인 소유물' 계열이라 여기서 함께 검증한다.
  // users × items 를 함께 참조해야 해서 백엔드에서는 groupware 모듈이 소유한다(모듈 규칙).
  const mine0 = await must('GET', '/my-items')
  const added = await must('POST', '/my-items', { itemId: f.product.id, defaultQty: 5 })
  eq('My품목에 담기면 품목 정보가 함께 실린다', added.itemCode, f.product.code)
  eq('기본수량이 저장된다', added.defaultQty, 5)
  eq('단가는 품목 마스터에서 온다', Number(added.unitPrice), Number(f.product.unitPrice))

  const added2 = await must('POST', '/my-items', { itemId: f.material.id })
  eq('기본수량을 안 주면 1', added2.defaultQty, 1)
  eq('나중에 담은 것이 뒤로 간다', added2.sortOrder > added.sortOrder, true)

  await rejects('같은 품목을 두 번 담을 수 없다', 'POST', '/my-items',
    { itemId: f.product.id }, '이미 My품목에')

  eq('내 My품목 목록에 둘 다 잡힌다',
    (await must('GET', '/my-items')).length, mine0.length + 2)

  await must('DELETE', `/my-items/${f.product.id}`)
  await must('DELETE', `/my-items/${f.material.id}`)
  await rejects('없는 품목은 뺄 수 없다', 'DELETE', `/my-items/${f.product.id}`,
    undefined, 'My품목에 없는')
  eq('빼고 나면 원래 개수로 돌아온다', (await must('GET', '/my-items')).length, mine0.length)
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

  /*
   * 승인된 휴가는 잔여일수에서 빠져야 한다.
   *
   * 예전에는 집계가 "승인".equals(v.getStatus()) 로 비교했는데 String 과 enum 이라
   * <b>언제나 거짓</b>이었다. 승인된 휴가가 227건 229.5일 있어도 잔여일수현황은
   * 전원 '사용 0일 · 잔여 15일' 로 나왔다. 화면은 멀쩡해 보이고 숫자만 틀린다.
   */
  const before = (await must('GET', '/hr/vacations/summary?year=2026'))
    .find((r) => r.empName === me.name)
  const extra = await must('POST', '/hr/vacations', {
    userId: me.id, type: '연차', startDate: '2026-05-06', endDate: '2026-05-06',
    days: 1, reason: 'QA 잔여일수',
  })
  await must('PUT', `/hr/vacations/${extra.id}/status`, { status: 'APPROVED' })
  const after = (await must('GET', '/hr/vacations/summary?year=2026'))
    .find((r) => r.empName === me.name)
  eq('승인한 만큼 사용일수가 는다', Number(after.usedDays) - Number(before.usedDays), 1)
  eq('잔여일수도 그만큼 준다', Number(before.remainingDays) - Number(after.remainingDays), 1)

  // 일수는 기간 안이어야 한다 — 하루짜리에 100일을 넣으면 잔여일수가 통째로 틀어진다
  await rejects('기간보다 많은 일수는 거부', 'POST', '/hr/vacations', {
    userId: me.id, type: '연차', startDate: '2026-05-07', endDate: '2026-05-07',
    days: 100, reason: 'QA 과다일수',
  })
  await rejects('0일짜리 휴가도 거부', 'POST', '/hr/vacations', {
    userId: me.id, type: '연차', startDate: '2026-05-07', endDate: '2026-05-07',
    days: 0, reason: 'QA 0일',
  })
  // 반차(0.5)는 되어야 한다 — 상한만 막고 하한은 0 초과다
  const half = await must('POST', '/hr/vacations', {
    userId: me.id, type: '반차', startDate: '2026-05-08', endDate: '2026-05-08',
    days: 0.5, reason: 'QA 반차',
  })
  eq('반차는 그대로 들어간다', Number(half.days), 0.5)

  /*
   * 시간 단위 휴가(0.125일 = 1시간).
   *
   * vacation_requests.days 가 numeric(5,1) 이라 DB 가 0.125 를 <b>0.1 로 잘랐다.</b>
   * 집계도 소수 1자리로 반올림해서 '사용 0.1 · 잔여 14.9' 가 나왔다 — 더하면 15가 아니다.
   * 원본(이카운트) 휴가사용실적현황에는 0.13 · 0.25 같은 값이 그대로 남아 있다.
   */
  const hourly = await must('POST', '/hr/vacations', {
    userId: me.id, type: '연차', startDate: '2026-05-09', endDate: '2026-05-09',
    days: 0.125, reason: 'QA 시간단위',
  })
  eq('시간 단위 휴가가 잘리지 않는다', Number(hourly.days), 0.125)
  await must('PUT', `/hr/vacations/${hourly.id}/status`, { status: 'APPROVED' })
  const fine = (await must('GET', '/hr/vacations/summary?year=2026')).find((r) => r.empName === me.name)
  eq('사용 + 잔여 = 휴가일수', Number(fine.usedDays) + Number(fine.remainingDays), Number(fine.totalDays))
  // 바로 앞 시점(after)과 비교한다 — before 시점에는 1일짜리가 아직 없다.
  eq('사용일수에 0.125 가 그대로 반영된다',
    Math.round((Number(fine.usedDays) - Number(after.usedDays)) * 1000) / 1000, 0.125)
  await must('DELETE', `/hr/vacations/${hourly.id}`)

  /*
   * 휴가일수(부여)는 사람마다 다르다.
   * 예전에는 HrService 의 상수 15일을 전원에게 똑같이 썼다 — 근속연수에 따라 다르고,
   * 원본에서도 사람마다 15.000 · 16.000 으로 갈린다.
   */
  const allUsers = await must('GET', '/users')
  const target = allUsers.find((u) => u.id === me.id) ?? allUsers[0]
  const orig = Number(target.annualLeaveDays)
  eq('사용자 응답에 휴가일수가 있다', Number.isFinite(orig), true)
  const patched = await must('PUT', `/users/${target.id}`, {
    name: target.name, email: target.email, department: target.department,
    annualLeaveDays: 16.5, enabled: true, roleNames: target.roles,
  })
  eq('사람마다 휴가일수를 정할 수 있다', Number(patched.annualLeaveDays), 16.5)
  eq('잔여일수현황이 그 값을 쓴다',
    Number((await must('GET', '/hr/vacations/summary?year=2026'))
      .find((r) => r.empName === target.name).totalDays), 16.5)
  await must('PUT', `/users/${target.id}`, {
    name: target.name, email: target.email, department: target.department,
    annualLeaveDays: orig, enabled: true, roleNames: target.roles,
  })

  // 재직구분: 예전에는 재직자만 무조건 걸러 퇴사자의 미사용 연차를 볼 수 없었다.
  eq('재직구분 전체가 재직자보다 적지 않다',
    (await must('GET', '/hr/vacations/summary?employment=ALL')).length >=
    (await must('GET', '/hr/vacations/summary')).length, true)

  // 근태는 지울 수 있어야 한다. 안 그러면 잘못 넣은 근태가 잔여일수에 영원히 남는다
  // (하네스가 만든 것도 매 회차 쌓여 잔여일수를 왜곡했다).
  eq('근태를 지울 수 있다', (await call('DELETE', `/hr/vacations/${half.id}`)).status, 204)
  eq('승인된 근태도 지울 수 있다(정정)', (await call('DELETE', `/hr/vacations/${extra.id}`)).status, 204)
  eq('지우면 잔여일수가 돌아온다',
    Number(((await must('GET', '/hr/vacations/summary?year=2026'))
      .find((r) => r.empName === me.name)).remainingDays), Number(before.remainingDays))
  await must('DELETE', `/hr/vacations/${vac.id}`)
  eq('시험용 근태는 남기지 않는다',
    (await must('GET', '/hr/vacations?year=2026')).filter((v) => (v.reason ?? '').startsWith('QA ')).length, 0)

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


/**
 * 공용품관리(E070204) — 공용품 사용/반납 내역.
 * 이 화면은 공용품 마스터가 아니라 "누가 언제 무엇을 빌려 쓰고 반납했는가"다.
 */
async function scenarioSupplyUsage() {
  section('■ 공용품 사용내역')

  const item = await ensure('/supplies', 'code', `${P}SUP`, null, {
    code: `${P}SUP`, name: 'QA공용품', category: '비품', unit: '개', stockQty: 1,
  })
  const me = (await must('GET', '/users')).find((u) => u.username === USER)

  const usage = await must('POST', '/supply-usages', {
    supplyItemId: item.id, userId: me.id, useDate: '2026-08-26',
    startTime: '09:00', endTime: '10:00', allDay: false,
    title: 'QA 사용내역', remark: 'QA 적요', returnStatus: 'NOT_RETURNED',
  })
  eq('사용내역에 공용품명이 실린다', usage.supplyItemName, 'QA공용품')
  eq('사용자명도 같이 온다', usage.userName, me.name)
  eq('반납여부 기본은 미반납', usage.returnStatusName, '미반납')

  await rejects('종료시간이 시작보다 빠르면 거부', 'POST', '/supply-usages', {
    supplyItemId: item.id, userId: me.id, useDate: '2026-08-26',
    startTime: '19:00', endTime: '18:00', allDay: false, title: 'QA 거꾸로',
  }, '종료시간')

  // 종일이면 시간은 지워진다 — 목록에 '종일'로만 보이기 때문
  const allDay = await must('POST', '/supply-usages', {
    supplyItemId: item.id, userId: me.id, useDate: '2026-08-27',
    startTime: '09:00', endTime: '10:00', allDay: true, title: 'QA 종일',
  })
  isNull('종일이면 시작시간은 비운다', allDay.startTime)
  isNull('종일이면 종료시간도 비운다', allDay.endTime)

  const returned = await must('PUT', `/supply-usages/${usage.id}`, { returnStatus: 'RETURNED' })
  eq('반납으로 바꿀 수 있다', returned.returnStatusName, '반납')

  await rejects('사용내역이 있는 공용품은 삭제 거부', 'DELETE', `/supplies/${item.id}`, undefined, '삭제할 수 없습니다')

  const inPeriod = await must('GET', '/supply-usages?from=2026-08-26&to=2026-08-26')
  eq('기간 밖 내역은 빠진다', inPeriod.filter((u) => u.supplyItemId === item.id).length, 1)

  await must('DELETE', `/supply-usages/${usage.id}`)
  await must('DELETE', `/supply-usages/${allDay.id}`)
  await must('DELETE', `/supplies/${item.id}`)
  eq('내역을 지우면 공용품도 지울 수 있다',
    (await must('GET', '/supplies')).some((s) => s.code === `${P}SUP`), false)
}


/**
 * 설문조사(E070256·E070257·E070258).
 * 예전에는 제목·기간과 '대상 인원수·응답 수 정수'뿐이라 질문도 응답도 없었다.
 * 지금은 문항·대상·응답·답이 실제로 저장된다.
 */
async function scenarioSurvey() {
  section('■ 설문조사')

  const me = (await must('GET', '/users')).find((u) => u.username === USER)
  const survey = await must('POST', '/surveys', {
    title: `${P}설문`,
    endAt: '2099-12-31T23:59:59',
    targetScope: 'INTERNAL',
    anonymous: false,
    resultVisibility: 'ALL',
    headerText: 'QA 안내문',
    targetUserIds: [me.id],
    questions: [
      { seq: 1, type: 'SINGLE', content: 'QA 단일선택', option1: '가', option2: '나', required: true },
      { seq: 2, type: 'MULTI', content: 'QA 복수선택', option1: 'A', option2: 'B', option3: 'C', required: false },
      { seq: 3, type: 'LONG_TEXT', content: 'QA 서술', required: false },
    ],
    draft: false,
  })
  eq('문항이 저장된다', survey.questionCount, 3)
  eq('대상이 저장된다', survey.targetCount, 1)
  eq('발송하면 진행중', survey.statusName, '진행중')
  eq('보기 없는 유형은 usesOptions=false', survey.questions[2].usesOptions, false)

  await rejects('보기 없는 선택형 문항은 거부', 'POST', '/surveys', {
    title: `${P}설문-보기없음`, questions: [{ seq: 1, type: 'SINGLE', content: '보기 없음' }], draft: false,
  }, '보기항목')

  await rejects('문항 없이 발송은 거부', 'POST', '/surveys', {
    title: `${P}설문-빈문항`, questions: [], draft: false,
  }, '문항이 없는')

  const draft = await must('POST', '/surveys', { title: `${P}설문-초안`, questions: [], draft: true })
  eq('초안은 문항 없이도 저장된다', draft.statusName, '초안')

  const [q1, q2, q3] = survey.questions
  await rejects('필수 문항 누락은 거부', 'POST', `/surveys/${survey.id}/respond`,
    { answers: [{ questionId: q3.id, values: ['서술만'] }] }, '필수 문항')
  await rejects('단일 선택에 값 2개는 거부', 'POST', `/surveys/${survey.id}/respond`,
    { answers: [{ questionId: q1.id, values: ['가', '나'] }] }, '단일 선택')
  await rejects('보기에 없는 값은 거부', 'POST', `/surveys/${survey.id}/respond`,
    { answers: [{ questionId: q1.id, values: ['다'] }] }, '보기에 없는')
  await rejects('남의 설문 문항은 거부', 'POST', `/surveys/${survey.id}/respond`,
    { answers: [{ questionId: 999999, values: ['가'] }] }, '문항이 아닙니다')

  const answered = await must('POST', `/surveys/${survey.id}/respond`, {
    answers: [
      { questionId: q1.id, values: ['가'] },
      { questionId: q2.id, values: ['A', 'C'] },
      { questionId: q3.id, values: ['QA 의견'] },
    ],
  })
  eq('응답 수는 세어서 낸다', answered.responseCount, 1)
  eq('응답률도 세어서 낸다', answered.responseRate, 100)
  eq('내가 응답했음이 표시된다', answered.answeredByMe, true)

  await rejects('같은 사람이 두 번 응답은 거부', 'POST', `/surveys/${survey.id}/respond`, {
    answers: [{ questionId: q1.id, values: ['나'] }],
  }, '이미 응답한')

  const result = await must('GET', `/surveys/${survey.id}/result`)
  eq('단일선택 집계', result.questions[0].counts['가'], 1)
  eq('고르지 않은 보기는 0', result.questions[0].counts['나'], 0)
  eq('복수선택은 고른 것마다 센다', result.questions[1].counts['A'] + result.questions[1].counts['C'], 2)
  eq('복수선택에서 안 고른 보기는 0', result.questions[1].counts['B'], 0)
  eq('서술형은 원문이 모인다', result.questions[2].texts[0], 'QA 의견')

  // 응답이 달린 뒤 문항을 갈아 끼우면 기존 응답이 다른 질문의 답이 된다
  await rejects('응답 있는 설문의 문항 교체는 거부', 'PATCH', `/surveys/${survey.id}`, {
    questions: [{ seq: 1, type: 'SHORT_TEXT', content: '바꿔치기' }],
  }, '문항을 바꿀 수 없습니다')

  // 비공개 설문은 대상자도 결과를 못 본다(작성자는 볼 수 있다)
  const secret = await must('POST', '/surveys', {
    title: `${P}설문-비공개`, resultVisibility: 'NONE', endAt: '2099-12-31T23:59:59',
    questions: [{ seq: 1, type: 'SHORT_TEXT', content: '비공개 질문' }], draft: false,
  })
  const asOwner = await must('GET', `/surveys/${secret.id}/result`)
  eq('비공개라도 작성자는 결과를 본다', asOwner.surveyId, secret.id)

  await must('DELETE', `/surveys/${survey.id}`)
  await must('DELETE', `/surveys/${draft.id}`)
  await must('DELETE', `/surveys/${secret.id}`)
  eq('지운 설문은 목록에서 빠진다',
    (await must('GET', '/surveys')).some((x) => x.title === `${P}설문`), false)
}


/**
 * CLAUDE.md 에 적힌, <b>어겨도 조용한</b> 규칙들을 소스에서 확인한다.
 * 컴파일도 되고 테스트도 통과하지만 나중에 아프게 무는 것들이라 여기서 잡는다.
 */
function scenarioSourceRules() {
  section('■ 소스 규칙 (CLAUDE.md)')

  const SRC = 'backend/src/main/java/com/erp'
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

  let javaFiles
  try {
    javaFiles = walk(SRC).filter((f) => f.endsWith('.java'))
  } catch {
    eq('백엔드 소스를 찾을 수 없어 소스 규칙 검사를 건너뜀', 'skipped', 'ok')
    return
  }
  /**
   * 주석을 걷어내고 본다. 안 그러면 주석 처리된 코드나 설명문에 든 단어가
   * 실제 호출인 척한다 — 실제로 lockNumberSpace 를 주석으로 만들어도 통과했다.
   */
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')

  const read = (f) => [f, stripComments(readFileSync(f, 'utf8'))]
  const sources = javaFiles.map(read)

  /** 경로 구분자가 OS 마다 달라서 파일명만 뽑아 비교한다. */
  const baseName = (f) => f.split(sep).pop()

  // §5.2 — 모든 연관관계는 LAZY. 유일한 예외가 User.roles 다.
  // EAGER 를 새로 넣으면 목록 한 번 부를 때마다 딸린 것들이 통째로 끌려온다.
  const eager = sources
    .filter(([, src]) => src.includes('FetchType.EAGER'))
    .map(([f]) => baseName(f))
    .sort()
  eq('EAGER 는 User.roles 하나뿐 (§5.2)', eager.join(',') || '없음', 'User.java')

  // 채번을 count()+1 로 하면 중간 것을 지웠을 때 이미 쓰는 번호를 가리키고,
  // 동시에 부르면 같은 번호를 준다. 번호 공간 락 없이 쓰면 안 된다.
  const unlockedCounting = sources
    .filter(([, src]) => /count\(\)\s*\+\s*1/.test(src) && !src.includes('lockNumberSpace'))
    .map(([f]) => baseName(f))
    .sort()
  eq('count()+1 채번은 번호 공간을 잠근 곳만',
    unlockedCounting.join(',') || '없음', '없음')

  // §6 — @Transactional 은 service 에만. controller/repository 에 붙으면
  // 트랜잭션 경계가 두 군데가 되어 롤백 범위를 아무도 설명할 수 없게 된다.
  const inLayer = (f, layer) => f.split(sep).includes(layer)
  const strayTx = sources
    .filter(([f, src]) =>
      (inLayer(f, 'controller') || inLayer(f, 'repository')) && src.includes('@Transactional'))
    .map(([f]) => baseName(f))
    .sort()
  eq('@Transactional 은 service 에만 (§6)', strayTx.join(',') || '없음', '없음')

  // §6 뒤집은 쪽 — service 에서 쓰기를 하는데 트랜잭션이 없으면, 여러 번 저장하는 흐름이
  // 중간에 실패했을 때 앞부분만 남는다. readOnly=true 인데 쓰는 것도 같은 부류다.
  //
  // CompanyService.create 는 예외다: 스키마 DDL·Flyway 를 각자 커밋해야 해서 일부러
  // 트랜잭션 밖이다(그 파일 주석에 근거가 있다).
  const TX_EXEMPT = new Set(['CompanyService.create'])
  const writeWithoutTx = []
  for (const [f, src] of sources) {
    if (!inLayer(f, 'service')) continue
    const classTx = /@Transactional[^\n]*\s*(?:public\s+)?class\s/.test(src)
    const methods = src.matchAll(
      /((?:@\w+(?:\([^)]*\))?\s*)*)public\s+[\w<>,[\]. ]+\s+(\w+)\s*\([^)]*\)\s*\{/g)
    for (const m of methods) {
      const [, anns, name] = m
      // 메서드 본문을 중괄호 짝으로 잘라낸다
      let depth = 1
      let i = m.index + m[0].length
      const start = i
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') depth--
        i++
      }
      const body = src.slice(start, i)
      if (!/\.(save|saveAll|delete|deleteAll|deleteById)\s*\(/.test(body)) continue

      const hasTx = anns.includes('@Transactional')
      const readOnly = /@Transactional\s*\(\s*readOnly\s*=\s*true/.test(anns)
      const id = `${baseName(f).replace('.java', '')}.${name}`
      if (TX_EXEMPT.has(id)) continue
      if (readOnly) writeWithoutTx.push(`${id}(readOnly인데 쓰기)`)
      else if (!hasTx && !classTx) writeWithoutTx.push(id)
    }
  }
  eq('service 의 쓰기 메서드는 트랜잭션 안에서 (§6)',
    writeWithoutTx.sort().join(',') || '없음', '없음')
}

/**
 * <b>권한 카탈로그에 빠진 컨트롤러 찾기.</b>
 *
 * AuthorizationInterceptor 는 카탈로그에 없는 경로를 그냥 통과시킨다
 * (required == null → return true). 그래서 컨트롤러를 새로 만들고 카탈로그에 넣는 걸
 * 잊으면 <b>그 기능이 역할과 무관하게 열린다</b> — 에러도 경고도 없이.
 * 실제로 재고실사·매출계획·자금계획·품질검사요청이 그렇게 뚫려 있었다.
 *
 * API 로는 확인할 수 없는 규칙이라 여기서만 소스를 읽는다.
 */
function scenarioPermissionCoverage() {
  section('■ 권한 카탈로그 커버리지')

  const SRC = 'backend/src/main/java/com/erp'
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

  let files
  try {
    files = walk(SRC).filter((f) => f.endsWith('Controller.java'))
  } catch {
    // 저장소 밖에서 돌리면 검사할 수 없다 — 조용히 건너뛰지 않고 그 사실을 말한다.
    eq('백엔드 소스를 찾을 수 없어 권한 커버리지 검사를 건너뜀', 'skipped', 'ok')
    return
  }

  const catalog = readFileSync(join(SRC, 'common/MenuPermissionCatalog.java'), 'utf8')
  const mapped = new Set(
    [...catalog.matchAll(/"\/api\/([a-z0-9-]+)/g)].map((m) => m[1]),
  )

  /** 역할로 막을 대상이 아닌 것들. 늘릴 때는 왜 여는지 이유가 있어야 한다. */
  const OPEN_BY_DESIGN = new Set([
    'auth',       // 로그인 자체
    'me',         // 내 정보
    'meta',       // 화면 메타
    'health',     // 헬스체크
    'files',      // 첨부 업/다운로드(개별 권한은 소유 화면이 본다)
    'workspace',  // 개인 메모·알림·통합검색 — 자기 것만 본다
    'my-items',   // My품목 — 개인 소유물(컨트롤러 주석에도 그렇게 적혀 있다)
    'bookmarks',  // 상단 북마크바 — 자기 것만 담고 뺀다(남의 것을 볼 경로가 없다)
  ])

  const roots = new Set()
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const m = src.match(/@RequestMapping\("\/api\/([a-z0-9-]+)/)
    if (m) roots.add(m[1])
  }

  const holes = [...roots].filter((r) => !mapped.has(r) && !OPEN_BY_DESIGN.has(r)).sort()
  eq(`컨트롤러 ${roots.size}개가 모두 카탈로그에 있거나 의도적으로 열려 있다`,
    holes.length ? `빠짐: ${holes.join(', ')}` : 'ok', 'ok')
}

/**
 * 현황 화면이 기대는 응답 필드. 화면은 대부분 프론트에서 계산하므로,
 * 백엔드가 필드를 하나 빼도 <b>에러 없이 빈칸이나 0</b>이 뜬다 — 그게 제일 나쁘다.
 * 그래서 계산의 재료가 되는 필드만 콕 집어 묶어 둔다.
 */
async function scenarioStatusScreenContracts(f) {
  section('■ 현황 화면이 기대는 응답 필드')

  const has = (label, obj, keys) => {
    const missing = keys.filter((k) => obj === undefined || obj === null || obj[k] === undefined)
    eq(label, missing.length ? `빠짐: ${missing.join(',')}` : 'ok', 'ok')
  }

  // 창고별재고현황 — 품목×창고 격자를 만들려면 양쪽 id 가 다 있어야 한다
  const stock = await must('GET', '/stock')
  has('재고현황: 품목×창고 필드', stock[0], ['itemId', 'warehouseId', 'quantity', 'unit', 'safetyStock'])

  // BOM환산재고현황 — 소요량이 없으면 환산 자체가 안 된다
  const boms = await must('GET', '/boms')
  has('BOM: 모품목·구성 필드', boms[0], ['productId', 'productUnit', 'active', 'lines'])
  has('BOM 라인: 구성품목·소요량', boms[0]?.lines?.[0], ['componentId', 'componentCode', 'quantity', 'unit'])

  // 기타이동현황 5종 — type 으로 화면이 갈린다. 이전/증감/이후가 다 있어야 이력이 뜻이 있다
  const adj = await must('GET', '/stock-adjustments')
  has('기타이동: 유형·증감 필드', adj[0], ['type', 'typeName', 'adjustDate', 'beforeQty', 'quantityChange', 'afterQty', 'warehouseId'])
  eq('기타이동 유형이 다섯 중 하나',
    ['SELF_USE', 'DEFECT', 'SUBSTITUTE', 'DISPOSAL', 'ADJUST'].includes(adj[0]?.type), true)

  // 생산입고/소모현황 — 생산실적이 소모자재를 같이 들고 와야 한 화면에서 맞댈 수 있다
  const prods = await must('GET', '/productions')
  has('생산실적: 입고 필드', prods[0], ['prodNo', 'productionDate', 'productId', 'producedQty', 'warehouseId', 'materials'])
  eq('생산실적이 소모자재를 같이 준다', Array.isArray(prods[0]?.materials), true)
  if (prods[0]?.materials?.length) {
    has('생산실적 소모자재 필드', prods[0].materials[0], ['componentId', 'componentCode', 'quantity', 'unit'])
  }

  // 재고실사현황 — 장부/실사/차이 세 값이 한 벌이다. 만들고 확인하고 지운다
  const staged = await must('POST', '/staged-adjustments', {
    itemId: f.product.id, warehouseId: f.warehouse.id, actualQty: 7,
    requestDate: '2026-07-20', reason: `${P}실사계약검증`,
  })
  has('재고실사: 장부·실사·차이·상태', staged,
    ['adjustNo', 'requestDate', 'bookQty', 'actualQty', 'diff', 'status', 'statusName', 'warehouseId'])
  eq('차이 = 실사 − 장부', staged.diff, staged.actualQty - staged.bookQty)
  eq('새 실사요청 상태는 요청', staged.statusName, '요청')
  await must('DELETE', `/staged-adjustments/${staged.id}`)
  eq('지운 실사요청은 목록에서 빠진다',
    (await must('GET', '/staged-adjustments')).some((x) => x.id === staged.id), false)

  // 일별재고현황·이익현황의 '월별원가' 기준
  const costs = await must('GET', '/costs')
  if (costs.length) has('원가: 기간·표준원가', costs[0], ['itemId', 'period', 'standardTotal'])

  // 창고이동현황 — 전표를 만들면 재고가 움직이고 되돌릴 API 가 없다. 자료가 있을 때만 모양을 본다.
  const transfers = await must('GET', '/stock-transfers')
  eq('창고이동 목록은 배열', Array.isArray(transfers), true)
  if (transfers.length) {
    has('창고이동: 출고·입고창고와 수량', transfers[0],
      ['transferNo', 'transferDate', 'itemId', 'fromWarehouseId', 'toWarehouseId', 'quantity'])
  }
}

/**
 * <b>급여는 권한 없이 읽히면 안 된다.</b>
 *
 * 이 시스템의 v1 정책은 "조회는 인증만 되면 통과" 다. 리소스끼리 참조 조회가 많아
 * 읽기를 한꺼번에 막으면 정상 화면이 깨지기 때문이고, 그건 납득할 만한 결정이다.
 * 다만 급여는 예외다 — 권한이 <b>하나도 없는</b> 계정으로도 전 직원 급여명세가 그대로 읽혔다.
 * 남의 급여를 보는 건 v1 이냐 아니냐의 문제가 아니다.
 */
async function scenarioPayrollReadGuard() {
  section('■ 급여 조회 권한')

  const P2 = `${P}READGUARD`
  const asUser = async (username, password, path) => {
    const login = await call('POST', '/auth/login', { username, password })
    if (!login.ok) return { status: login.status, data: login.data }
    const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${login.data.token}` } })
    return { status: res.status }
  }

  // 권한이 하나도 없는 역할·사용자
  await must('POST', '/roles', { name: `${P2}_NONE`, displayName: '권한없음', permissionCodes: [] })
  const none = await must('POST', '/users', {
    username: `${P2.toLowerCase()}none`, password: 'qatest1234', name: '권한없음', roleNames: [`${P2}_NONE`],
  })
  // PAYROLL 만 가진 역할·사용자
  await must('POST', '/roles', { name: `${P2}_PAY`, displayName: '급여만', permissionCodes: ['PAYROLL'] })
  const pay = await must('POST', '/users', {
    username: `${P2.toLowerCase()}pay`, password: 'qatest1234', name: '급여담당', roleNames: [`${P2}_PAY`],
  })

  eq('권한 없는 계정은 급여명세를 못 읽는다',
    (await asUser(`${P2.toLowerCase()}none`, 'qatest1234', '/payslips?month=2027-01')).status, 403)
  eq('권한 없는 계정은 급여설정도 못 읽는다',
    (await asUser(`${P2.toLowerCase()}none`, 'qatest1234', '/pay-settings/items')).status, 403)
  eq('PAYROLL 이 있으면 읽는다',
    (await asUser(`${P2.toLowerCase()}pay`, 'qatest1234', '/payslips?month=2027-01')).status, 200)

  // 나머지 조회는 v1 정책대로 열려 있어야 한다 — 급여만 막은 것이지 전체를 막은 게 아니다
  eq('다른 조회는 그대로 열려 있다',
    (await asUser(`${P2.toLowerCase()}none`, 'qatest1234', '/items')).status, 200)

  // 사원 목록은 담당자 드롭다운으로 여기저기 쓰여 막을 수 없다. 대신 급여 칸만 가린다 —
  // 안 그러면 급여명세를 막아 놔도 사원 목록으로 기본급이 그대로 새어 나간다.
  const rowsOf = async (username) => {
    const login = await call('POST', '/auth/login', { username, password: 'qatest1234' })
    const res = await fetch(`${BASE}/employees`, {
      headers: { Authorization: `Bearer ${login.data.token}` },
    })
    return res.json()
  }
  const noneRows = await rowsOf(`${P2.toLowerCase()}none`)
  eq('권한 없는 계정에게는 기본급을 안 보낸다',
    noneRows.every((r) => r.baseSalary === null), true)
  eq('사원 목록 자체는 열려 있다(담당자 드롭다운이 쓴다)',
    noneRows.length > 0 && noneRows.every((r) => r.id && r.name), true)

  const payRows = await rowsOf(`${P2.toLowerCase()}pay`)
  eq('PAYROLL 이 있으면 기본급이 온다',
    payRows.some((r) => Number(r.baseSalary) > 0), true)

  // 계좌번호·카드번호도 권한 없이 읽혔다. 다만 계좌 목록은 자금 화면 전용이 아니라
  // 전표입력·수입금액·급여이체가 드롭다운으로 같이 쓴다 — BANK 하나만 요구하면
  // 그 화면들이 조용히 빈 드롭다운이 되므로 넷 중 하나라도 있으면 통과시킨다.
  await must('POST', '/roles',
    { name: `${P2}_ACC`, displayName: '전표만', permissionCodes: ['ACCOUNTING'] })
  const acc = await must('POST', '/users', {
    username: `${P2.toLowerCase()}acc`, password: 'qatest1234', name: '전표담당', roleNames: [`${P2}_ACC`],
  })
  for (const path of ['/bank-cards/accounts', '/bank-cards/cards',
    '/bank-cards/transactions', '/bank-cards/usages']) {
    eq(`권한 없는 계정은 ${path} 를 못 읽는다`,
      (await asUser(`${P2.toLowerCase()}none`, 'qatest1234', path)).status, 403)
  }
  eq('BANK 이 없어도 ACCOUNTING 이면 계좌 드롭다운은 뜬다',
    (await asUser(`${P2.toLowerCase()}acc`, 'qatest1234', '/bank-cards/accounts')).status, 200)
  eq('PAYROLL(급여이체)도 계좌 드롭다운을 쓴다',
    (await asUser(`${P2.toLowerCase()}pay`, 'qatest1234', '/bank-cards/accounts')).status, 200)

  // 역할을 안 고르고 등록하면 예전에는 STAFF 가 조용히 붙었다. STAFF 는 권한이 22개라,
  // 권한 체크박스를 전부 해제하고 만든 계정이 사실상 전권을 가졌다.
  // 실수로 빠뜨린 것과 일부러 비운 것을 서버는 구분할 수 없으니 거절해야 한다.
  const noRole = await call('POST', '/users',
    { username: `${P2.toLowerCase()}norole`, password: 'qatest1234', name: '역할없음', roleNames: [] })
  eq('역할을 안 고르면 등록이 거절된다', noRole.status, 400)
  eq('거절 사유를 알려 준다', noRole.data?.message, '권한그룹을 하나 이상 선택하세요.')
  const noField = await call('POST', '/users',
    { username: `${P2.toLowerCase()}norole2`, password: 'qatest1234', name: '역할없음' })
  eq('roleNames 를 아예 빠뜨려도 마찬가지다', noField.status, 400)
  eq('조용히 STAFF 가 붙지 않는다',
    (await must('GET', '/users')).filter((u) => u.username.startsWith(`${P2.toLowerCase()}norole`)).length, 0)

  // 목록의 사용여부 토글은 사용여부만 보낸다. 행 전체를 되돌려 보내면, 그 목록을 띄운 뒤
  // 다른 사람이 바꾼 이름·권한을 토글한 사람이 모르는 채로 되돌린다.
  const stale = await must('POST', '/users',
    { username: `${P2.toLowerCase()}stale`, password: 'qatest1234', name: '토글전', roleNames: [`${P2}_NONE`] })
  await must('PUT', `/users/${stale.id}`, { name: '토글후', roleNames: [`${P2}_PAY`] })
  const toggled = await must('PATCH', `/users/${stale.id}`, { enabled: false })
  eq('사용여부 토글은 사용여부만 바꾼다', toggled.enabled, false)
  eq('그 사이 남이 바꾼 이름을 되돌리지 않는다', toggled.name, '토글후')
  eq('그 사이 남이 바꾼 권한도 되돌리지 않는다', toggled.roles.join(), `${P2}_PAY`)
  await must('DELETE', `/users/${stale.id}`)

  for (const u of [none, pay, acc]) await must('DELETE', `/users/${u.id}`)
  for (const r of (await must('GET', '/roles')).filter((r) => r.name.startsWith(P2))) {
    await must('DELETE', `/roles/${r.id}`)
  }
  eq('검증용 역할·사용자는 남기지 않는다',
    (await must('GET', '/roles')).filter((r) => r.name.startsWith(P2)).length, 0)
}

/**
 * <b>회사별 스키마 격리.</b>
 *
 * 회사코드로 로그인하면 그 회사 스키마(co_0002 …)를 보고, 본사는 public 을 본다.
 * 한 회사가 다른 회사 자료를 보게 되는 것이 이 시스템에서 제일 나쁜 실패다 —
 * 에러도 안 나고, 숫자가 그럴듯해서 한참 뒤에야 드러난다.
 *
 * 지금까지 하네스는 본사만 봤다. 스키마 구조는 qa/schema-check.mjs 가 대조하지만
 * <b>동작</b>은 아무도 안 봤다.
 */
async function scenarioTenantIsolation() {
  section('■ 회사별 스키마 격리')

  const co = await call('POST', '/auth/login',
    { companyCode: '0002', username: 'testco', password: 'testco1234' })
  if (!co.ok) {
    // 테넌트 회사가 없는 환경(새 DB 등)에서는 건너뛴다 — 조용히 통과시키지 않고 그 사실을 적는다.
    eq('테넌트 회사(0002)가 없어 격리 검사를 건너뜀', 'skipped', 'skipped')
    return
  }
  const coToken = co.data.token

  /** 테넌트 토큰으로 부른다. 전역 token 을 건드리면 뒤 시나리오가 남의 회사에서 돈다. */
  const asTenant = async (method, path) => {
    const res = await fetch(`${BASE}${path}`, {
      method, headers: { Authorization: `Bearer ${coToken}` },
    })
    const text = await res.text()
    return { status: res.status, data: text ? JSON.parse(text) : null }
  }

  const hqItems = await must('GET', '/items')
  const coItems = (await asTenant('GET', '/items')).data
  eq('본사와 테넌트가 서로 다른 품목 목록을 본다',
    hqItems.length === coItems.length && hqItems.every((h, i) => h.id === coItems[i]?.id), false)

  const hqCodes = new Set(hqItems.map((i) => i.code))
  eq('본사 품목이 테넌트에 섞여 보이지 않는다',
    coItems.filter((i) => hqCodes.has(i.code)).length, 0)

  const hqSales = await must('GET', '/sales')
  const coSales = (await asTenant('GET', '/sales')).data
  const hqIds = new Set(hqSales.map((x) => x.id))
  eq('본사 판매전표가 테넌트에 섞여 보이지 않는다',
    coSales.filter((x) => hqIds.has(x.id) && x.docNo === hqSales.find((h) => h.id === x.id)?.docNo).length, 0)

  // call() 은 전역 토큰을 붙이므로 이걸로는 '토큰 없음'을 시험할 수 없다 —
  // 헤더를 아예 안 붙인 요청을 따로 보낸다.
  const anonymous = await fetch(`${BASE}/items`)
  eq('토큰이 없으면 401', anonymous.status, 401)

  // 회사가 갈려도 <b>기준자료</b>는 있어야 한다. 계정과목이 없으면 그 회사는
  // 회계반영·급여이체를 아예 못 한다 — 코드가 108·255·251·135·801·254 를
  // 코드값으로 찾아 쓰기 때문이다("계정과목이 없습니다: 135").
  const coAccounts = (await asTenant('GET', '/accounts')).data ?? []
  const codes = new Set(coAccounts.map((a) => a.code))
  const needed = ['108', '110', '135', '251', '252', '253', '254', '255', '801', '936']
  eq('테넌트에도 코드가 찾아 쓰는 계정과목이 있다',
    needed.filter((c) => !codes.has(c)).join(', ') || '없음', '없음')

  // 회사정보(상호)도 있어야 한다. 비면 거래명세서·견적서·발주서 공급자란에
  // "(회사정보 미등록)" 이 찍힌다 — 거래처에 건네는 문서라 그대로 나가면 곤란하다.
  // 상호는 회사를 만들 때 이미 받은 값이라 비워 둘 이유가 없다.
  const coInfo = (await asTenant('GET', '/company')).data
  eq('테넌트 회사정보에 상호가 있다', Boolean(coInfo?.name), true)
}

/**
 * <b>전표번호 채번.</b>
 *
 * 번호가 겹치면 그 뒤로 전부 어긋난다 — 조회에서 두 전표가 같은 번호로 뜨고,
 * 세금계산서·회계전표가 어느 쪽을 가리키는지 알 수 없게 된다.
 * DocumentNoGenerator 는 max(seq)+1 을 읽기 전에 번호 공간을 잠가서 이를 막는데,
 * 그 락이 사라져도 평상시에는 아무 일도 안 일어난다(동시에 저장할 때만 드러난다).
 * 실제로 부서코드가 락 없이 count()+1 을 읽다가 같은 코드를 내주고 있었다.
 */
async function scenarioDocNo(f) {
  section('■ 전표번호 채번')

  const DAY = '2026-09-09'   // 다른 시나리오가 안 쓰는 날짜
  const make = (date = DAY) => must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: date,
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 100 }],
  })
  const countOn = async (date) =>
    (await must('GET', '/sales')).filter((x) => x.saleDate === date).length

  // 앞선 실행이 중간에 끊겨 남긴 게 있을 수 있다. '1번부터'를 기대하면 그때 깨진다 —
  // 번호가 겹치지 않고 <b>연달아</b> 붙는지를 본다(그게 실제로 지켜야 할 성질이다).
  const before = await countOn(DAY)

  const made = await Promise.all(Array.from({ length: 8 }, () => make()))
  const seqs = made.map((d) => Number(d.docNo.split('-')[2])).sort((a, b) => a - b)
  eq('동시에 8건을 저장해도 전표번호가 겹치지 않는다', new Set(seqs).size, 8)
  eq('번호가 빈틈없이 이어진다', seqs[7] - seqs[0], 7)
  eq('번호는 그날 접두어를 쓴다',
    made.every((d) => d.docNo.startsWith('SO-20260909-')), true)

  // 날짜가 다르면 번호 공간도 다르다
  const otherDay = await make('2026-09-10')
  eq('날짜가 바뀌면 번호가 이어지지 않는다',
    Number(otherDay.docNo.split('-')[2]), (await countOn('2026-09-10')))

  for (const d of [...made, otherDay]) await must('DELETE', `/sales/${d.id}`)
  eq('검증용 전표는 남기지 않는다', await countOn(DAY), before)
}

/**
 * <b>되돌릴 수 없는 처리를 두 번 하려 할 때.</b>
 *
 * 이런 곳은 서비스 코드에 가드가 있어도 테스트가 없으면, 나중에 리팩터링하다
 * 조용히 풀린다. 풀리면 재고나 장부가 두 번 움직이는데 에러는 안 난다.
 * 훑어 보니 아래는 다 제대로 막혀 있었다 — 막힌 채로 두려고 묶는다.
 */
async function scenarioDoubleProcess(f) {
  section('■ 두 번 처리 방지')

  const qtyOf = async (itemId, warehouseId) => {
    const row = (await must('GET', '/stock'))
      .find((r) => r.itemId === itemId && r.warehouseId === warehouseId)
    return row ? Number(row.quantity) : 0
  }

  // ── 재고실사 반영: 두 번 하면 재고가 두 번 바뀐다
  const before = await qtyOf(f.product.id, f.warehouse.id)
  const staged = await must('POST', '/staged-adjustments', {
    itemId: f.product.id, warehouseId: f.warehouse.id, actualQty: before + 10,
    requestDate: '2026-07-14', reason: `${P}이중반영검증`,
  })
  await must('POST', `/staged-adjustments/${staged.id}/apply`)
  const afterOnce = await qtyOf(f.product.id, f.warehouse.id)
  eq('실사 반영은 차이만큼만 움직인다', afterOnce, before + 10)

  await rejects('반영된 실사를 또 반영하면 거부', 'POST', `/staged-adjustments/${staged.id}/apply`,
    undefined, '이미 처리된')
  eq('거부됐으니 재고는 그대로', await qtyOf(f.product.id, f.warehouse.id), afterOnce)

  await rejects('반영된 실사는 반려도 안 된다', 'POST', `/staged-adjustments/${staged.id}/reject`,
    undefined, '이미 처리된')
  await rejects('반영된 실사는 삭제도 안 된다', 'DELETE', `/staged-adjustments/${staged.id}`,
    undefined, '이미 반영된')

  // 되돌린다 — 반영된 실사는 지울 수 없으므로 반대 방향 조정으로 원복한다
  await must('POST', '/stock-adjustments', {
    type: 'ADJUST', itemId: f.product.id, warehouseId: f.warehouse.id,
    actualQty: before, adjustDate: '2026-07-14', reason: `${P}이중반영검증 원복`,
  })
  eq('원복하면 처음 재고로 돌아온다', await qtyOf(f.product.id, f.warehouse.id), before)

  // ── 발주서: 단계를 건너뛸 수 없다
  const po = await must('POST', '/purchase-orders', {
    partnerId: f.supplier.id, warehouseId: f.warehouse.id, orderDate: '2026-07-14',
    lines: [{ itemId: f.product.id, quantity: 5, unitPrice: 1000 }],
  })
  eq('새 발주서는 발주요청', po.statusName, '발주요청')
  await rejects('단가확정 전에는 발주확정 불가', 'POST', `/purchase-orders/${po.id}/confirm`,
    undefined, '단가가 확정된 발주서만')
  await must('POST', `/purchase-orders/${po.id}/cancel`)
  // 취소만 하고 두면 매 회차 죽은 발주가 한 장씩 쌓인다.
  await must('DELETE', `/purchase-orders/${po.id}`)
}

/**
 * 판매전표 확인·확인취소의 상태 전이.
 *
 * 이미 확인된 전표를 또 확인하면 markConfirmed 가 <b>확인일시를 지금으로 덮어썼다.</b>
 * 확인일시는 마감·감사에서 "언제 확정했나"의 근거라, 더블클릭 한 번에 조용히 바뀌면 안 된다.
 */
async function scenarioConfirmTransition(f) {
  section('■ 판매전표 확인 상태 전이')

  const sale = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2026-07-14',
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }],
  })

  await rejects('확인 안 된 전표의 확인취소는 거부', 'POST', `/sales/${sale.id}/unconfirm`, undefined, '확인되지 않은')

  const first = await must('POST', `/sales/${sale.id}/confirm`)
  eq('확인하면 상태가 확인', first.confirmStatusName, '확인')

  await rejects('이미 확인된 전표의 재확인은 거부', 'POST', `/sales/${sale.id}/confirm`, undefined, '이미 확인된')

  // 재확인이 막혔으니 확인일시가 그대로여야 한다.
  // 문자열로 비교하면 안 된다 — 목록 응답은 나노초 끝자리를 다르게 찍는다
  // (11:13:32.1894579 vs .189458). 같은 시각인데 다르다고 나온다.
  const after = (await must('GET', '/sales')).find((x) => x.id === sale.id)
  eq('확인일시가 덮어써지지 않는다',
    new Date(after.confirmedAt).getTime(), new Date(first.confirmedAt).getTime())

  await rejects('확인된 전표는 삭제 불가', 'DELETE', `/sales/${sale.id}`, undefined, '확인된 전표는 삭제할 수 없습니다')

  await must('POST', `/sales/${sale.id}/unconfirm`)
  await must('DELETE', `/sales/${sale.id}`)
  eq('확인취소 후에는 지워진다',
    (await must('GET', '/sales')).some((x) => x.id === sale.id), false)
}

/**
 * HTTP 규약 수준의 잘못된 요청. 전부 <b>500</b> 으로 나가고 있었다 —
 * "Request method 'PUT' is not supported" 같은 내부 문구까지 실어서.
 *
 * 그중 Accept 건은 더 나빴다: 토큰이 멀쩡한데 <b>401</b> 이 나갔다.
 * 쓰는 사람 눈에는 멀쩡히 로그인한 상태에서 갑자기 로그인 화면으로 쫓겨나는 것으로 보인다.
 */
async function scenarioHttpProtocol() {
  section('■ HTTP 규약 위반 요청')

  const raw = async (method, path, headers, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body !== undefined ? { body } : {}),
    })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { data = text }
    return { status: res.status, data }
  }

  const put = await raw('PUT', '/items', { 'Content-Type': 'application/json' }, '{}')
  eq('지원 안 하는 메서드는 405', put.status, 405)

  const text = await raw('POST', '/items', { 'Content-Type': 'text/plain' }, 'x')
  eq('지원 안 하는 본문 형식은 415', text.status, 415)

  const xml = await raw('GET', '/items', { Accept: 'application/xml' })
  eq('만들 수 없는 응답 형식은 406', xml.status, 406)
  eq('토큰이 멀쩡한데 401 로 쫓아내지 않는다', xml.status === 401, false)

  const notMultipart = await raw('POST', '/files', { 'Content-Type': 'application/json' }, '{}')
  eq('multipart 가 아니면 400', notMultipart.status, 400)

  for (const [label, r] of [['405', put], ['415', text], ['406', xml], ['400', notMultipart]]) {
    eq(`${label}: 내부 문구가 새어 나가지 않는다`,
      /Exception|not supported|Current request|org\.|com\.erp/.test(String(r.data?.message ?? '')), false)
  }

  // 정상 요청은 그대로여야 한다
  eq('정상 요청은 200', (await call('GET', '/items')).status, 200)
}

/**
 * <b>쓰는 중인 마스터를 지우려 할 때.</b>
 *
 * 예전에는 500 이 나면서 Postgres 원문이 통째로 실려 나갔다 —
 * 제약 이름·테이블명·SQL 까지. 쓰는 사람은 "지울 수 없다"는 사실을
 * 영어 DB 오류 더미에서 읽어내야 했다.
 *
 * 서버가 고장난 게 아니라 요청이 성립하지 않는 것이므로 409 다.
 */
async function scenarioDeleteInUse(f) {
  section('■ 쓰는 중인 마스터 삭제')

  const cases = [
    ['품목', `/items/${f.product.id}`],
    ['거래처', `/partners/${f.customer.id}`],
    ['창고', `/warehouses/${f.warehouse.id}`],
  ]
  for (const [label, path] of cases) {
    const r = await call('DELETE', path)
    eq(`${label}: 쓰고 있으면 409`, r.status, 409)
    eq(`${label}: 어디서 쓰는지 알려 준다`,
      /쓰고 있어 지울 수 없습니다/.test(String(r.data?.message ?? '')), true)
    eq(`${label}: DB 원문이 새어 나가지 않는다`,
      /foreign key|constraint|violates|SQL/i.test(String(r.data?.message ?? '')), false)
  }

  // 없는 것을 지우는 건 여전히 404 여야 한다(409 로 뭉뚱그리면 안 된다)
  const missing = await call('DELETE', '/items/999999')
  eq('없는 품목 삭제는 그대로 404', missing.status, 404)
}

/**
 * <b>잔량재집계.</b>
 *
 * 거래별 잔량(balanceAfter)은 <b>입력 순서</b>로 매겨진다. 과거 일자 거래를 뒤늦게 넣으면
 * 일자순으로 읽을 때의 잔량과 어긋난다. 실제로 개발 DB 에서 거래 7,385건 중
 * <b>7,224건</b>이 어긋난 채였다 — 재고 수량 자체는 멀쩡했고, 어긋난 것을 알려 주는
 * 화면이 없어 아무도 몰랐다.
 *
 * <p>재집계가 그걸 고치는 기능인데, 고치고 나면 다시 점검했을 때 0 이어야 한다.
 * 그 <b>멱등성</b>을 여기서 못 박는다 — 재집계가 반쪽만 고치면 여기서 걸린다.
 */
async function scenarioStockRecalc() {
  section('■ 잔량재집계')

  const ALL = 'from=1900-01-01&to=2999-12-31'
  const applied = await must('POST', `/stock/recalc?${ALL}`)
  eq('재집계는 실제로 고친다(applied)', applied.applied, true)
  eq('재고 수량 자체는 어긋나지 않는다', applied.quantityMismatch, 0)

  const after = await must('GET', `/stock/recalc?${ALL}`)
  eq('재집계 뒤 다시 점검하면 어긋난 잔량이 없다', after.balanceMismatch, 0)
  eq('점검은 고치지 않는다', after.applied, false)
  eq('본 거래 수는 그대로', after.scannedTx, applied.scannedTx)

  // 과거 일자 거래를 하나 넣으면 그 뒤 잔량이 어긋나는 것이 정상이다 —
  // 재집계가 필요한 상황을 만들어, 재집계가 그걸 실제로 잡는지 본다.
  const item = (await must('GET', '/items')).find((i) => i.active)
  const wh = (await must('GET', '/warehouses'))[0]
  await must('POST', '/stock/transactions', {
    itemId: item.id, warehouseId: wh.id, type: 'INBOUND',
    quantity: 7, unitPrice: 100, transactionDate: '2000-01-05', note: `${P} 과거일자`,
  })
  const dirty = await must('GET', `/stock/recalc?${ALL}`)
  eq('과거 일자 거래를 넣으면 잔량이 어긋난다', dirty.balanceMismatch > 0, true)
  const fixed = await must('POST', `/stock/recalc?${ALL}`)
  eq('재집계가 그만큼 고친다', fixed.balanceMismatch, dirty.balanceMismatch)
  eq('고친 뒤에는 다시 0',
    (await must('GET', `/stock/recalc?${ALL}`)).balanceMismatch, 0)
}

/**
 * <b>검증 실패 문구.</b>
 *
 * 제약에 message 를 안 적으면 Hibernate 가 자기 한국어 번역을 쓴다. 품목 등록 실패 응답이
 * 실제로 이랬다: {@code "널이어서는 안됩니다 품목분류를 선택하세요. 널이어서는 안됩니다"}.
 * 무엇을 고쳐야 하는지 알 수 없고, 같은 문구가 여러 번 반복된다.
 *
 * <p>ValidationMessages.properties 로 기본 문구를 갈고, 자주 닿는 제약 58곳에 항목 이름을
 * 넣은 문구를 달았다. 여기서는 <b>사람이 읽을 수 있는 문구가 나오는지</b>를 못 박는다 —
 * 다음에 message 없이 제약을 하나 더 달면 이 단언이 잡는다.
 */
async function scenarioValidationMessages(f) {
  section('■ 검증 실패 문구')

  const cases = [
    ['품목', '/items', { code: `${P}VMSG`, name: '문구시험', unit: 'EA' }, ['단가', '안전재고', '품목분류']],
    ['판매', '/sales', { saleDate: '2026-08-26' }, ['거래처', '창고', '품목']],
    ['판매 라인', '/sales',
      { saleDate: '2026-08-26', partnerId: f.customer.id, warehouseId: f.warehouse.id,
        lines: [{ itemId: f.product.id }] }, ['수량', '단가']],
    ['판매계획', '/sales-plans', { itemId: f.product.id }, ['계획연도', '계획월', '계획수량']],
  ]

  for (const [label, path, body, expected] of cases) {
    const r = await call('POST', path, body)
    const message = String(r.data?.message ?? '')
    eq(`${label}: 400 으로 거절한다`, r.status, 400)
    eq(`${label}: 무엇을 고쳐야 하는지 한글로 말한다`,
      expected.filter((w) => message.includes(w)).join() || message, expected.join())
    eq(`${label}: Hibernate 기본 번역이 새어 나가지 않는다`,
      /널이어서는|must not be null|must not be blank/.test(message), false)
    eq(`${label}: 영문 필드명이 그대로 보이지 않는다`,
      /(unitPrice|safetyStock|quantity|planQty|planYear)/.test(message), false)
  }
}

/**
 * <b>사용중지한 품목</b>으로 새 전표·계획·구성을 만들 수 없다.
 *
 * <p>원본은 사용중지한 품목을 <b>코드도움에 아예 띄우지 않는다.</b> 어느 화면에서도 새로
 * 고를 수 없다는 뜻이다. 이미 들어가 있던 것은 그대로 남는다.
 *
 * <p>우리는 판매·구매·견적·주문·발주만 막고 있었다. 나머지는 리포지토리를 직접 잡고 있어
 * (CLAUDE.md 4.2 위반) 검사를 통째로 건너뛰었다 — 실제로 재 보니 작업지시서 · 생산계획 ·
 * BOM · 재고입고가 전부 통과했다. 화면 목록에는 안 뜨는데 id 만 알면 되는 상태였다.
 *
 * <p>재고는 <b>늘리는 것만</b> 막는다. 줄이는 것까지 막으면 이미 창고에 남은 재고를
 * 털어낼 길이 없어져 영영 장부에 붙어 있게 된다.
 */
async function scenarioInactiveItemGuards(f) {
  section('■ 사용중지 품목으로 새로 만들 수 없다')

  const body = {
    name: f.material.name, unit: f.material.unit, category: f.material.category,
    unitPrice: f.material.unitPrice, purchasePrice: f.material.purchasePrice,
    safetyStock: f.material.safetyStock,
  }
  const stopped = await must('PUT', `/items/${f.material.id}`, { ...body, active: false })
  eq('자재를 사용중지로 내린다', stopped.active, false)

  const D = '2093-03-03'
  const blocked = [
    ['작업지시서', '/work-orders',
      { productId: f.material.id, warehouseId: f.warehouse.id, plannedQty: 1, orderDate: D }],
    ['생산계획', '/production-plans',
      { productId: f.material.id, planWeek: '2093-W10', demandQty: 1, planQty: 1 }],
    ['BOM 의 제품', '/boms',
      { productId: f.material.id, lines: [{ componentId: f.product.id, quantity: 1 }] }],
    ['BOM 의 자재', '/boms',
      { productId: f.product.id, lines: [{ componentId: f.material.id, quantity: 1 }] }],
    ['재고입고', '/stock/transactions',
      { itemId: f.material.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 1 }],
  ]
  for (const [label, path, payload] of blocked) {
    const r = await call('POST', path, payload)
    eq(`${label}: 사용중지 품목은 거부`, r.status, 400)
    eq(`${label}: 무엇이 막혔는지 말한다`,
      /사용중지된 품목/.test(String(r.data?.message ?? '')), true)
  }

  // 창고 쪽도 같다 — 작업지시서의 창고.
  const whs = await must('GET', '/warehouses')
  const other = whs.find((w) => w.id !== f.warehouse.id)
  // 창고 수정은 안 보낸 칸을 지운다 — 되돌릴 때 잃지 않도록 통째로 싣는다.
  const whBody = {
    name: other.name, location: other.location, kind: other.kind,
    processId: other.processId, outsourcingPartnerId: other.outsourcingPartnerId,
  }
  const deadWh = await must('PUT', `/warehouses/${other.id}`, { ...whBody, active: false })
  eq('창고를 사용중지로 내린다', deadWh.active, false)
  await must('PUT', `/items/${f.material.id}`, { ...body, active: true })
  const woWh = await call('POST', '/work-orders',
    { productId: f.material.id, warehouseId: other.id, plannedQty: 1, orderDate: D })
  eq('작업지시서: 사용중지 창고도 거부', woWh.status, 400)
  eq('무엇이 막혔는지 말한다', /사용중지된 창고/.test(String(woWh.data?.message ?? '')), true)
  const back = await must('PUT', `/warehouses/${other.id}`, { ...whBody, active: true })
  eq('되돌린 창고가 원래대로다', `${back.name}|${back.location}|${back.kind}`,
    `${other.name}|${other.location}|${other.kind}`)

  // 줄이는 것은 열어 둔다 — 사용중지의 뒤처리가 바로 그 출고다.
  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 5,
  })
  await must('PUT', `/items/${f.material.id}`, { ...body, active: false })
  const out = await call('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: 5,
  })
  eq('사용중지해도 남은 재고는 뺄 수 있다', out.status, 200)
  await must('PUT', `/items/${f.material.id}`, { ...body, active: true })

  const listed = (await must('GET', '/items')).find((x) => x.id === f.material.id)
  eq('시험이 끝나면 자재는 다시 사용중이다', listed.active, true)
  eq('BOM 은 늘어나지 않았다',
    (await must('GET', '/boms')).filter((b) => b.productId === f.material.id).length, 0)
}

/**
 * 생산입고의 <b>[노무시간]</b>과 그것으로 낸 실제노무비.
 *
 * <p>원본 생산입고 I·II 그리드의 마지막 열이 노무시간이다. 우리에겐 그 칸이 없어서
 * <b>실제 노무비를 잴 근거가 아무것도 없었다</b> — 원가생성은 실제노무비를 표준과 같게
 * 깔아 두고 "실적이 들어오면 사람이 고친다" 고 적어 뒀는데, 고칠 근거가 화면에 없었다.
 * 그래서 차이분석이 늘 0 이었다.
 *
 * <p>요율은 표준과 <b>같은 것</b>을 쓰고 시간만 실제로 바꾼다. 요율까지 지어내면
 * 차이가 시간 때문인지 요율 때문인지 알 수 없게 된다.
 *
 * <p>노무시간을 안 적은 품목은 <b>표준 그대로</b>다. 0 으로 두면 "노무비가 안 들었다" 로
 * 읽혀 원가가 통째로 낮아지고, 그게 이익으로 둔갑한다.
 */
/**
 * 원본 생산입고 I 은 <b>격자</b>다 — 한 전표에 완제품 여러 줄을 입고한다.
 * 우리는 한 줄씩만 받아서, 같은 날 같은 공장에서 셋을 넣으려면 머리(일자·공장·창고·
 * 프로젝트)를 세 번 다시 골라야 했다.
 *
 * <p>한 줄이라도 막히면 <b>전부 되돌린다</b>. 자재가 모자라거나 지시수량을 넘겨
 * 두 줄만 들어가면 재고와 실적이 서로 다른 말을 한다.
 */
async function scenarioProductionBatch(f) {
  section('■ 생산입고 격자 — 한 번에 여러 줄')

  const D = '2087-03-03'
  const clear = async () => {
    for (const pr of (await must('GET', '/productions')).filter((x) => x.productionDate === D)) {
      await call('DELETE', `/productions/${pr.id}`)
    }
    for (const w of (await must('GET', '/work-orders')).filter((x) => x.orderDate === D)) {
      await call('DELETE', `/work-orders/${w.id}`)
    }
  }
  await clear()

  // 자재를 넉넉히 넣어 둔다 — 소모가 막혀서 실패하면 재는 것이 달라진다.
  const boms = await must('GET', '/boms')
  const line = boms.find((b) => b.productId === f.product.id).lines[0]
  await must('POST', '/stock/transactions', {
    itemId: line.componentId, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 100,
  })

  const wo = async (qty) => must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: qty, orderDate: D,
  })
  const a = await wo(5)
  const b = await wo(5)

  // 원본 머리의 [담당자]. 전표 하나에 한 사람이고 모든 줄에 같이 붙어야 한다.
  const emp = (await must('GET', '/employees'))[0]
  const made = await must('POST', '/productions/batch', {
    productionDate: D,
    employeeId: emp?.id ?? null,
    lines: [
      { workOrderId: a.id, producedQty: 2, note: `${P}줄1` },
      { workOrderId: b.id, producedQty: 3, note: `${P}줄2` },
    ],
  })
  eq('한 번에 두 줄이 들어간다', made.length, 2)
  eq('머리의 담당자가 모든 줄에 붙는다',
    made.every((x) => x.employeeId === (emp?.id ?? null)), true)
  eq('담당자는 다시 읽어도 남아 있다',
    (await must('GET', '/productions')).find((x) => x.id === made[0].id).employeeId, emp?.id ?? null)
  eq('줄마다 적요가 따로 남는다', made.map((x) => x.note).join(','), `${P}줄1,${P}줄2`)
  eq('줄마다 번호가 따로 매겨진다', new Set(made.map((x) => x.prodNo)).size, 2)
  eq('작업지시 기생산이 줄만큼 는다',
    Number((await must('GET', '/work-orders')).find((x) => x.id === a.id).producedQty), 2)

  // 둘째 줄이 지시수량을 넘으면 첫 줄도 들어가면 안 된다.
  const before = (await must('GET', '/productions')).filter((x) => x.productionDate === D).length
  const partial = await call('POST', '/productions/batch', {
    productionDate: D,
    lines: [{ workOrderId: a.id, producedQty: 1 }, { workOrderId: b.id, producedQty: 99999 }],
  })
  eq('한 줄이 막히면 거부한다', partial.status, 400)
  eq('막히면 앞 줄도 안 들어간다(전부 되돌림)',
    (await must('GET', '/productions')).filter((x) => x.productionDate === D).length, before)

  await clear()
  await must('POST', '/stock/transactions', {
    itemId: line.componentId, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: 100,
  })
  eq('시험용 생산은 남기지 않는다',
    (await must('GET', '/productions')).filter((x) => x.productionDate === D).length, 0)
}

async function scenarioWorkResultBatch(f) {
  section('■ 작업내역 격자 — 한 번에 여러 줄')

  const D = '2087-04-04'
  const clear = async () => {
    for (const wr of (await must('GET', '/work-results')).filter((x) => x.workDate === D)) {
      await call('DELETE', `/work-results/${wr.id}`)
    }
    for (const w of (await must('GET', '/work-orders')).filter((x) => x.orderDate === D)) {
      await call('DELETE', `/work-orders/${w.id}`)
    }
  }
  await clear()

  const wo = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: 10, orderDate: D,
  })

  // 원본 작업내역입력은 머리(일자·생산공장·담당자·프로젝트) 하나에 작업 여러 줄이다.
  const made = await must('POST', '/work-results/batch', {
    workDate: D, warehouseId: f.warehouse.id,
    lines: [
      { workOrderId: wo.id, process: '조립', worker: `${P}작업자`, goodQty: 3, defectQty: 1, workTimeMin: 30, note: `${P}줄1` },
      { workOrderId: wo.id, process: '검사', worker: `${P}작업자`, goodQty: 2, defectQty: 0, workTimeMin: 20, note: `${P}줄2` },
    ],
  })
  eq('한 번에 두 줄이 들어간다', made.length, 2)
  eq('줄마다 작업이 따로 남는다', made.map((x) => x.process).join(','), '조립,검사')
  eq('줄마다 적요가 따로 남는다', made.map((x) => x.note).join(','), `${P}줄1,${P}줄2`)
  eq('머리의 일자가 모든 줄에 붙는다', made.map((x) => x.workDate).join(','), `${D},${D}`)
  eq('머리의 생산공장이 모든 줄에 붙는다',
    made.every((x) => x.warehouseId === f.warehouse.id), true)
  eq('작업시간이 줄마다 따로 쌓인다', made.reduce((n, x) => n + x.workTimeMin, 0), 50)

  // 둘째 줄이 없는 작업지시를 가리키면 첫 줄도 들어가면 안 된다.
  // 두 줄만 들어가면 작업시간 합계가 조용히 모자란 채로 남고 효율현황이 그 값으로 계산된다.
  const before = (await must('GET', '/work-results')).filter((x) => x.workDate === D).length
  const partial = await call('POST', '/work-results/batch', {
    workDate: D, warehouseId: f.warehouse.id,
    lines: [
      { workOrderId: wo.id, process: '포장', workTimeMin: 5 },
      { workOrderId: 99999999, process: '포장', workTimeMin: 5 },
    ],
  })
  eq('없는 작업지시가 섞이면 거부한다', partial.status, 404)
  eq('막히면 앞 줄도 안 들어간다(전부 되돌림)',
    (await must('GET', '/work-results')).filter((x) => x.workDate === D).length, before)

  const empty = await call('POST', '/work-results/batch', { workDate: D, lines: [] })
  eq('빈 격자는 거부한다', empty.status, 400)

  await clear()
  eq('시험용 작업내역은 남기지 않는다',
    (await must('GET', '/work-results')).filter((x) => x.workDate === D).length, 0)
}

async function scenarioProductionLaborMinutes(f) {
  section('■ 생산입고 노무시간 → 실제노무비')

  const D = '2086-09-09'
  const period = '2086-09'
  const clearAll = async () => {
    for (const pr of (await must('GET', '/productions')).filter((x) => x.productionDate === D)) {
      await call('DELETE', `/productions/${pr.id}`)
    }
    for (const w of (await must('GET', '/work-orders')).filter((x) => x.orderDate === D)) {
      await call('DELETE', `/work-orders/${w.id}`)
    }
    for (const c of (await must('GET', '/costs')).filter((x) => x.period === period)) {
      await call('DELETE', `/costs/${c.id}`)
    }
  }
  await clearAll()

  /*
    * 이 품목에 <b>라우팅(BOR)</b>을 깔아 둔다. 없으면 표준노무비가 0 이고, 실제노무비도
    * 표준(0)으로 떨어져 <b>핵심 단언이 아무것도 재지 못한다.</b> 처음 쓴 판이 그랬다 —
    * 조건문 안에 넣어 뒀더니 통과는 하는데 실제로는 건너뛰고 있었다.
    */
  const proc = (await must('GET', '/processes')).find((x) => Number(x.costPerHr) > 0)
    ?? (await must('GET', '/processes'))[0]
  const bor = await must('POST', '/bor', {
    productId: f.product.id, processId: proc.id, seq: 1,
    workName: `${P}노무시험`, baseQty: 1, workHours: 2,
  })

  const wo = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: 10, orderDate: D,
  })

  // 노무시간을 안 적은 입고 — 실제노무비는 표준 그대로여야 한다.
  const plain = await must('POST', '/productions', {
    workOrderId: wo.id, producedQty: 5, productionDate: D,
  })
  isNull('안 적으면 null 이다', plain.laborMinutes)

  await must('POST', `/costs/build?period=${period}`)
  const c1 = (await must('GET', '/costs')).find((x) => x.period === period && x.itemId === f.product.id)
  eq('원가가 만들어진다', !!c1, true)
  eq('노무시간이 없으면 실제 = 표준', Number(c1.actualLabor), Number(c1.laborCost))

  // 노무시간을 적고 다시 만든다.
  await call('DELETE', `/productions/${plain.id}`)
  for (const c of (await must('GET', '/costs')).filter((x) => x.period === period)) {
    await call('DELETE', `/costs/${c.id}`)
  }
  const timed = await must('POST', '/productions', {
    // 표준은 1개당 2시간이다. 5개에 300분(=1개당 1시간)이면 <b>실제가 표준의 절반</b>이라
    // 단언이 실제로 문다. 600분으로 두면 1개당 2시간이 되어 표준과 같아져 아무것도 못 잰다.
    workOrderId: wo.id, producedQty: 5, productionDate: D, laborMinutes: 300,
  })
  eq('노무시간이 실린다', timed.laborMinutes, 300)
  eq('다시 조회해도 남는다',
    (await must('GET', '/productions')).find((x) => x.id === timed.id).laborMinutes, 300)

  await must('POST', `/costs/build?period=${period}`)
  const c2 = (await must('GET', '/costs')).find((x) => x.period === period && x.itemId === f.product.id)
  eq('원가가 다시 만들어진다', !!c2, true)
  eq('라우팅이 있어 표준노무비가 0 이 아니다', Number(c1.laborCost) > 0, true)
  eq('실제노무비가 0 은 아니다', Number(c2.actualLabor) > 0, true)
  // 실제가 표준의 절반이므로 노무비도 절반이어야 한다 — 요율은 같은 것을 쓰기 때문이다.
  eq('실제노무비 = 실제시간 × 표준요율(= 표준의 절반)',
    Number(c2.actualLabor), Math.round(Number(c1.laborCost) * 50) / 100)
  eq('실제와 표준이 실제로 다르다', Number(c2.actualLabor) !== Number(c2.laborCost), true)

  await clearAll()
  await call('DELETE', `/bor/${bor.id}`)
  eq('시험용 라우팅은 남기지 않는다',
    (await must('GET', '/bor')).some((x) => x.id === bor.id), false)
  eq('시험용 생산은 남기지 않는다',
    (await must('GET', '/productions')).filter((x) => x.productionDate === D).length, 0)
  eq('시험용 원가도 남기지 않는다',
    (await must('GET', '/costs')).filter((x) => x.period === period).length, 0)
}

/**
 * <b>기준일자 시점의 재고</b> — GET /stock?asOf=.
 *
 * <p>재고현황 · 창고별재고현황 · 일별재고현황 · BOM기준재고 다섯 화면이 [기준일자] 칸을
 * <b>받아 놓고 무시하고 있었다.</b> 날짜를 바꿔도 늘 현재고가 나왔다. 화면에 "과거 시점
 * 재고 계산은 아직 없다" 고 적어 두긴 했지만, <b>조건이 있으면 사람은 그 값이 반영된 줄
 * 안다.</b> 값이 안 바뀌는데 바뀌는 척하는 것이 제일 나쁜 실패다.
 *
 * <p>계산은 현재고에서 <b>그 뒤의 입출고를 빼는</b> 것이다. 이력만 더해서 구하지 않는다 —
 * 이력이 지워지거나 잔량만 손으로 고쳐진 자료가 섞이면 그 시점 숫자가 통째로 틀린다.
 */
async function scenarioStockAsOf(f) {
  section('■ 기준일자 시점 재고')

  const qtyOf = async (params) => {
    const rows = await must('GET', `/stock${params}`)
    const r = rows.find((x) => x.itemId === f.material.id && x.warehouseId === f.warehouse.id)
    return r ? Number(r.quantity) : 0
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const y = yesterday.toISOString().slice(0, 10)

  const now = await qtyOf('')
  /*
   * 어제 시점 값을 <b>먼저 재 둔다.</b> 개발 자료에는 오늘 날짜 이동이 내 것 말고도 있어서
   * '어제 = 현재고 − 내가 넣은 100' 이 아니다. 처음엔 그렇게 단언했다가 QA 가 물었다.
   * 이 시나리오가 재려는 것은 <b>오늘 넣은 것이 어제 시점에 안 섞이는가</b> 다.
   */
  const before = await qtyOf(`?asOf=${y}`)
  eq('현재고를 읽는다', now >= 0, true)

  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 100,
  })
  eq('현재고가 100 늘었다', await qtyOf(''), now + 100)
  eq('오늘 넣은 것은 어제 시점에 안 섞인다', await qtyOf(`?asOf=${y}`), before)
  eq('asOf 를 안 주면 현재고 그대로', await qtyOf(''), now + 100)

  // 앞날을 물으면 현재고 그대로 — 없는 미래를 지어내지 않는다.
  const future = new Date()
  future.setDate(future.getDate() + 30)
  eq('앞날을 물어도 현재고까지만',
    await qtyOf(`?asOf=${future.toISOString().slice(0, 10)}`), now + 100)

  // 되돌린다.
  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: 100,
  })
  eq('되돌리면 제자리', await qtyOf(''), now)
  eq('되돌린 뒤 어제 시점도 그대로', await qtyOf(`?asOf=${y}`), before)
}

/**
 * 설문조사의 <b>[첨부]</b>.
 *
 * <p>원본 설문조사입력에 [여기에 파일 놓기]가 있다. 우리 화면 주석에는
 * "파일 업로드가 이 화면에 아직 없다" 고 적혀 있었다 — 이제 붙일 수 있다.
 *
 * <p>수정은 <b>null 필드를 건너뛰는</b> 규칙이라, 첨부를 안 보내면 그대로 둬야 한다.
 * 이걸 다른 필드처럼 '통째로 덮기' 로 두면 제목만 고쳐도 첨부가 조용히 떨어진다.
 */
async function scenarioSurveyAttachment() {
  section('■ 설문조사 첨부')

  // 앞 실행이 중단됐으면 먼저 치운다.
  for (const x of (await must('GET', '/surveys')).filter((x) => (x.title ?? '').startsWith(`${P}첨부설문`))) {
    await call('DELETE', `/surveys/${x.id}`)
  }

  const made = await must('POST', '/surveys', {
    title: `${P}첨부설문`, targetScope: 'INTERNAL', anonymous: false,
    resultVisibility: 'ALL', questions: [], draft: true,
  })
  isNull('첨부를 안 주면 비어 있다', made.attachmentId)

  const ghost = await call('PATCH', `/surveys/${made.id}`, { attachmentId: 99999999 })
  eq('없는 첨부는 거부', ghost.status, 404)

  // 제목만 고쳐도 첨부가 떨어지면 안 된다(지금은 붙인 게 없으니 null 이 유지되는지만 본다).
  const renamed = await must('PATCH', `/surveys/${made.id}`, { title: `${P}첨부설문2` })
  eq('제목이 바뀐다', renamed.title, `${P}첨부설문2`)
  isNull('안 보낸 첨부는 그대로다', renamed.attachmentId)

  await must('DELETE', `/surveys/${made.id}`)
  eq('시험용 설문은 남기지 않는다',
    (await must('GET', '/surveys')).some((x) => x.id === made.id), false)
}

/**
 * 업무관리게시판의 <b>[첨부]</b>와 <b>[조회]</b>.
 *
 * <p>원본 WORK 격자의 열은 일자-No. · 게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태 ·
 * <b>첨부 · 조회</b> 다. 우리는 두 열을 만들어 두고 채우지 못했다 — 첨부 칸은 늘 비었고
 * (붙일 자리가 없었다), 조회 칸에는 완료/재개 버튼이 들어가 열 이름과 내용이 어긋났다.
 *
 * <p>조회수는 <b>글을 펼 때만</b> 오른다. 목록을 부르는 것만으로 올리면 화면을 열 때마다
 * 모든 글이 같이 올라가서 그 숫자가 '몇 명이 봤나' 를 뜻하지 않게 된다. QA 가 그걸 잰다.
 */
async function scenarioWorkPostAttachment() {
  section('■ 업무게시판 첨부·조회수')

  const post = await must('POST', '/work-posts', {
    board: 'WORK', title: `${P}첨부시험`, content: '내용', postDate: '2087-04-01',
  })
  isNull('첨부를 안 주면 비어 있다', post.attachmentId)
  eq('조회수는 0에서 시작한다', post.viewCount, 0)

  // 목록만 불러서는 조회수가 오르지 않아야 한다.
  await must('GET', '/work-posts?board=WORK')
  await must('GET', '/work-posts?board=WORK')
  eq('목록을 불러도 조회수는 그대로',
    (await must('GET', '/work-posts?board=WORK')).find((x) => x.id === post.id).viewCount, 0)

  const read1 = await must('POST', `/work-posts/${post.id}/read`)
  eq('펴면 하나 오른다', read1.viewCount, 1)
  const read2 = await must('POST', `/work-posts/${post.id}/read`)
  eq('또 펴면 또 오른다', read2.viewCount, 2)
  eq('다시 조회해도 남는다',
    (await must('GET', '/work-posts?board=WORK')).find((x) => x.id === post.id).viewCount, 2)

  // 없는 파일을 붙이려 하면 막힌다 — 조용히 null 로 저장하면 붙인 줄 안다.
  const ghost = await call('PUT', `/work-posts/${post.id}`, {
    title: `${P}첨부시험`, content: '내용', attachmentId: 99999999,
  })
  eq('없는 첨부는 거부', ghost.status, 404)

  // 첨부를 뗄 수 있다(수정은 통째로 덮는다).
  const cleared = await must('PUT', `/work-posts/${post.id}`, {
    title: `${P}첨부시험`, content: '내용', attachmentId: null,
  })
  isNull('첨부를 뗄 수 있다', cleared.attachmentId)
  eq('고쳐도 조회수는 그대로', cleared.viewCount, 2)

  /*
   * 원본 WORK입력 폼 실측(사본 'WORK'): 완료일시 · 전달자 · <b>참조자</b> · 권한 · 비밀번호 ·
   * 게시글비밀번호 · 제목 · <b>공지사항여부</b> · 첨부.
   * 우리 폼에는 제목·내용·전달자·첨부밖에 없었다.
   *
   * (게시글비밀번호는 안 만든다 — 글 비밀번호를 평문으로 들고 있게 되는 자리라,
   *  원본을 그대로 옮기는 것이 이 저장소에서 옳은 선택인지 따로 정해야 한다.)
   */
  const older = await must('POST', '/work-posts', {
    board: 'WORK', title: `${P}공지시험-오래된`, content: '내용', postDate: '2087-03-01',
    ccTo: '참조자시험', notice: true,
  })
  const newer = await must('POST', '/work-posts', {
    board: 'WORK', title: `${P}공지시험-최신`, content: '내용', postDate: '2087-04-02',
  })
  eq('참조자가 저장된다', older.ccTo, '참조자시험')
  eq('공지사항여부가 저장된다', older.notice, true)
  eq('안 주면 공지가 아니다', newer.notice, false)

  // 공지는 날짜가 더 오래됐어도 맨 위다 — 켜 놓고 날짜순으로 밀리면 공지가 아니다.
  const listed = await must('GET', '/work-posts?board=WORK')
  const iOld = listed.findIndex((x) => x.id === older.id)
  const iNew = listed.findIndex((x) => x.id === newer.id)
  eq('공지가 더 최신 글보다 위에 온다', iOld < iNew, true)
  eq('그런데 날짜는 공지 쪽이 더 오래됐다', older.postDate < newer.postDate, true)

  // 공지를 내리면 다시 날짜순으로 내려간다
  await must('PUT', `/work-posts/${older.id}`, {
    title: `${P}공지시험-오래된`, content: '내용', notice: false,
  })
  const after = await must('GET', '/work-posts?board=WORK')
  eq('공지를 내리면 날짜순으로 돌아간다',
    after.findIndex((x) => x.id === older.id) > after.findIndex((x) => x.id === newer.id), true)

  /*
   * 원본 [완료일시]. 진행상태는 '완료' 라고만 말하고 <b>언제 끝났는지는 아무 데도 안 남았다.</b>
   * 되돌릴 때 지우는 것까지 잰다 — 안 지우면 '진행중인데 완료일시가 있는' 줄이 남아,
   * 그 열을 근거로 무엇을 세는 순간 조용히 틀린다.
   */
  isNull('새 글은 완료일시가 없다', newer.completedAt)
  const done = await must('PATCH', `/work-posts/${newer.id}/status`, { status: 'DONE' })
  eq('완료로 바꾸면 완료일시가 찍힌다', typeof done.completedAt === 'string' && done.completedAt.length >= 16, true)
  const reopened = await must('PATCH', `/work-posts/${newer.id}/status`, { status: 'IN_PROGRESS' })
  isNull('되돌리면 완료일시를 지운다', reopened.completedAt)
  const backfilled = await must('PATCH', `/work-posts/${newer.id}/status`,
    { status: 'DONE', completedAt: '2087-04-03T09:30:00' })
  eq('뒤늦게 정리하려고 직접 적을 수도 있다', backfilled.completedAt.slice(0, 16), '2087-04-03T09:30')

  await must('DELETE', `/work-posts/${older.id}`)
  await must('DELETE', `/work-posts/${newer.id}`)
  eq('시험용 공지도 남기지 않는다',
    (await must('GET', '/work-posts?board=WORK'))
      .some((x) => x.id === older.id || x.id === newer.id), false)

  await must('DELETE', `/work-posts/${post.id}`)
  eq('시험용 글은 남기지 않는다',
    (await must('GET', '/work-posts?board=WORK')).some((x) => x.id === post.id), false)
}

/**
 * <b>사원등록</b> — 등록 · 수정 · 사용중단.
 *
 * <p>이 화면은 제목이 '사원등록' 인데 <b>등록을 할 수가 없었다.</b> 목록과 기본급 수정만
 * 있었고 서버에도 POST·PUT 이 아예 없었다 — 사람이 입사해도 넣을 자리가 없어서 사원은
 * 시드로만 존재했다. 사원은 판매·구매·출하의 담당자이고 급여·근태의 뿌리다.
 *
 * <p>사원은 <b>지우지 않는다.</b> 지우면 지난 전표가 누구 것인지 잃는다.
 * 퇴사하면 사용중단으로 내리고, 그 뒤로는 담당자로 못 고른다.
 *
 * <p>퇴사일과 사용 여부를 따로 두면 "퇴사일은 있는데 아직 담당자로 뜨는" 사원이 생긴다.
 * 그래서 퇴사일을 넣으면 사용중단이 함께 켜지고, 되살리면 퇴사일이 지워진다.
 */
async function scenarioEmployeeMaster(f) {
  section('■ 사원등록 (등록·수정·사용중단)')

  /*
    * 사원은 <b>지우는 경로를 두지 않았다</b> — 판매·구매·출하의 담당자이고 급여·근태의
    * 뿌리라 지우면 지난 전표가 누구 것인지 잃는다. 그래서 시험용 사원도 지우지 않고,
    * 이미 있으면 그것을 다시 쓴다. 남는 것은 QA 사원 하나뿐이고 늘 '사용중' 으로 끝난다.
    */
  const CODE = `${P}EMP`
  const exists = (await must('GET', '/employees/all')).find((x) => x.code === CODE)

  const dept = (await must('GET', '/departments'))[0]
  const before = (await must('GET', '/employees/all')).length
  const made = exists ?? await must('POST', '/employees', {
    code: CODE, name: `${P}신입`, jobTitle: '사원',
    departmentId: dept ? dept.id : null,
    hireDate: '2088-03-02', baseSalary: 2500000,
  })
  eq('사원을 새로 등록할 수 있다', made.code, CODE)
  eq('만든 직후 목록에 있다',
    (await must('GET', '/employees/all')).length, exists ? before : before + 1)

  /*
   * <b>처음 상태</b>를 늘 잰다. 예전에는 if (!exists) 안에 넣어 뒀는데, 사원은 지우지
   * 않으므로 두 번째 실행부터 통째로 건너뛰었다 — 한 번 재고 다시는 안 재는 단언이었다.
   * 있으면 처음 상태로 되돌려 놓고 잰다.
   */
  const reset = await must('PUT', `/employees/${made.id}`, {
    name: `${P}신입`, jobTitle: '사원', departmentId: dept ? dept.id : null,
    hireDate: '2088-03-02', baseSalary: 2500000, active: true,
  })
  eq('처음엔 사용중이다', reset.active, true)
  isNull('퇴사일은 비어 있다', reset.resignDate)

  const dup = await call('POST', '/employees', { code: CODE, name: '중복', baseSalary: 0 })
  eq('같은 사번은 거부', dup.status, 409)

  const edited = await must('PUT', `/employees/${made.id}`, {
    name: `${P}신입`, jobTitle: '주임', departmentId: dept ? dept.id : null,
    hireDate: '2088-03-02', baseSalary: 2700000,
  })
  eq('직위를 고칠 수 있다', edited.jobTitle, '주임')
  eq('부서도 붙는다', edited.department, dept ? dept.name : '')
  eq('기본급도 고쳐진다', Number(edited.baseSalary), 2700000)
  eq('고쳐도 사용중이다', edited.active, true)

  // 담당자로 고를 수 있다.
  const sale = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2088-03-05',
    employeeId: made.id, lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }],
  })
  eq('담당자로 붙는다', sale.employeeId, made.id)

  // 퇴사 → 사용중단이 함께 켜진다.
  const resigned = await must('PUT', `/employees/${made.id}`, {
    name: `${P}신입`, jobTitle: '주임', departmentId: dept ? dept.id : null,
    hireDate: '2088-03-02', baseSalary: 2700000, resignDate: '2088-12-31',
  })
  eq('퇴사일을 넣으면 사용중단이 함께 켜진다', resigned.active, false)
  eq('퇴사일이 저장된다', resigned.resignDate, '2088-12-31')

  const after = await call('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2088-03-06',
    employeeId: made.id, lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }],
  })
  eq('퇴사한 사원은 담당자로 못 고른다', after.status, 400)
  eq('무엇이 막혔는지 말한다', /사용중지된 사원/.test(String(after.data?.message ?? '')), true)

  // 이미 그 사람이 담당한 전표는 그대로다 — 퇴사했다고 지난 전표의 담당자가 사라지면 안 된다.
  const kept = (await must('GET', '/sales')).find((x) => x.id === sale.id)
  eq('지난 전표의 담당자는 그대로다', kept.employeeId, made.id)

  // 재직자 목록에서는 빠지고 전체 목록에는 남는다.
  eq('재직자 목록에서 빠진다',
    (await must('GET', '/employees')).some((x) => x.id === made.id), false)
  eq('전체 목록에는 남는다',
    (await must('GET', '/employees/all')).some((x) => x.id === made.id), true)

  const back = await must('PUT', `/employees/${made.id}`, {
    name: `${P}신입`, jobTitle: '주임', departmentId: dept ? dept.id : null,
    hireDate: '2088-03-02', baseSalary: 2700000, active: true,
  })
  eq('되살릴 수 있다', back.active, true)
  isNull('되살리면 퇴사일도 지워진다', back.resignDate)

  await must('DELETE', `/sales/${sale.id}`)
  eq('시험이 끝나면 사원은 사용중으로 남는다',
    (await must('GET', '/employees/all')).find((x) => x.id === made.id).active, true)
  eq('시험용 전표는 남기지 않는다',
    (await must('GET', '/sales')).filter((x) => String(x.saleDate).startsWith('2088-03')).length, 0)
}

/**
 * <b>사용중지한 계정과목 · 자원 · 관리항목</b>으로 새로 고를 수 없다.
 *
 * <p>사용중단 부류가 네 번째다(품목·창고 → 거래처 → 공정 → 여기). 그래서 하나씩 찾지 않고
 * <b>active 가 있는 마스터 37개를 세어</b> 토글이 되는 것부터 API 로 두드렸다.
 * 계정과목 · 자원 · 관리항목 셋이 그대로 통과했다.
 *
 * <p>계정이 제일 크다. 폐지한 계정에 새 잔액이 쌓이면 재무제표에 없어야 할 줄이 남는다.
 * <b>자동으로 만드는 분개는 막지 않는다</b> — 그쪽은 계정코드로 찾고, 거기까지 막으면
 * 기준계정 하나를 잘못 내렸을 때 판매·구매 저장이 통째로 멈춘다.
 */
async function scenarioInactiveMasterGuards(f) {
  section('■ 사용중지 마스터로 새로 만들 수 없다 (계정·자원·관리항목)')

  // ── 계정과목
  const cash = (await must('GET', '/accounts')).find((a) => a.code === '101')
  eq('현금 계정이 있다', !!cash, true)
  const accBody = { name: cash.name, division: cash.division, detailCategory: cash.detailCategory }
  await must('PATCH', `/accounts/${cash.id}`, { ...accBody, active: false })

  const je = await call('POST', '/journals', {
    entryDate: '2095-02-02', description: `${P}분개`,
    lines: [{ accountId: cash.id, debit: 1000 }, { accountId: cash.id, credit: 1000 }],
  })
  eq('사용중지 계정으로 분개할 수 없다', je.status, 400)
  eq('무엇이 막혔는지 말한다', /사용중지된 계정과목/.test(String(je.data?.message ?? '')), true)

  const ex = await call('POST', '/expenses', {
    expenseDate: '2095-02-02', accountId: cash.id, amount: 1000, description: `${P}비용`,
  })
  eq('비용등록도 막힌다', ex.status, 400)

  await must('PATCH', `/accounts/${cash.id}`, { ...accBody, active: true })
  eq('되살리면 다시 쓸 수 있다',
    (await must('GET', '/accounts')).find((a) => a.id === cash.id).active, true)

  // ── 자원(설비)
  const res = (await must('GET', '/resources'))[0]
  if (res) {
    const resBody = {
      name: res.name, type: res.type, capacity: res.capacity, unit: res.unit,
      costPerHr: res.costPerHr, warehouseId: res.warehouseId, processId: res.processId,
    }
    await must('PUT', `/resources/${res.id}`, { ...resBody, active: false })
    const wr = await call('POST', '/work-results', {
      workDate: '2095-02-02', process: res.processName ?? '절단', resourceId: res.id,
      goodQty: 1, defectQty: 0, workTimeMin: 10,
    })
    eq('사용중지 설비로 작업내역을 올릴 수 없다', wr.status, 400)
    eq('무엇이 막혔는지 말한다', /사용중지된 자원/.test(String(wr.data?.message ?? '')), true)
    await must('PUT', `/resources/${res.id}`, { ...resBody, active: true })
  }

  // ── 관리항목
  const mg = (await must('GET', '/management-items'))[0]
  if (mg) {
    const mgBody = { name: mg.name, description: mg.description }
    await must('PUT', `/management-items/${mg.id}`, { ...mgBody, active: false })
    const it = await call('POST', '/items', {
      code: `${P}MGI`, name: `${P}관리항목시험`, unit: 'EA', category: f.product.category,
      unitPrice: 0, purchasePrice: 0, safetyStock: 0, managementItemId: mg.id,
    })
    eq('사용중지 관리항목을 품목에 붙일 수 없다', it.status, 400)
    eq('무엇이 막혔는지 말한다', /사용중지된 관리항목/.test(String(it.data?.message ?? '')), true)
    await must('PUT', `/management-items/${mg.id}`, { ...mgBody, active: true })
    eq('시험용 품목은 안 생겼다',
      (await must('GET', '/items')).some((x) => x.code === `${P}MGI`), false)
  }

  eq('시험용 분개는 남기지 않는다',
    (await must('GET', '/journals?from=2095-01-01&to=2095-12-31')).length, 0)
}

/**
 * <b>사용중지한 공정</b>으로 새로 고를 수 없다.
 *
 * <p>원본 공정등록에는 [사용중단/재사용]이 있고, 사용중단한 공정은 코드도움에 안 뜬다.
 * 우리는 사용 여부를 <b>저장만 하고 아무 데서도 보지 않았다</b> — 화면에 내릴 버튼도
 * 없었고, 서버도 그 값을 안 봤다. 실측했더니 공정작업 · 자원 · 공정별경비가 전부 통과했다.
 *
 * <p><b>창고(공장)의 생산공정은 못 막는다.</b> inventory 는 아무 모듈에도 의존하지 않는
 * 기반층이라(CLAUDE.md 4.1) 거기서 production 을 참조하면 순환이 된다. 창고의 공정이
 * @ManyToOne 이 아니라 평범한 Long processId 인 것도 같은 이유다. 화면 목록이 거른다.
 */
async function scenarioInactiveProcessGuards() {
  section('■ 사용중지 공정으로 새로 만들 수 없다')

  const procs = await must('GET', '/processes')
  const proc = procs[0]
  eq('공정이 하나 이상 있다', !!proc, true)

  const body = {
    code: proc.code, name: proc.name, workcenter: proc.workcenter,
    stdTimeMin: proc.stdTimeMin, costPerHr: proc.costPerHr, sortOrder: proc.sortOrder,
  }
  const stopped = await must('PUT', `/processes/${proc.id}`, { ...body, active: false })
  eq('공정을 사용중지로 내릴 수 있다', stopped.active, false)
  eq('관리 목록에는 남는다',
    (await must('GET', '/processes')).some((x) => x.id === proc.id), true)

  const blocked = [
    ['공정작업(작업코드)', '/process-operations',
      { processId: proc.id, code: `${P}OP`, name: `${P}작업코드` }],
    ['자원등록', '/resources',
      { code: `${P}RES`, name: `${P}설비`, processId: proc.id, kind: '설비' }],
    ['공정별경비', '/process-expenses',
      { period: '2093-01', processId: proc.id, laborCost: 1000, overheadCost: 1000 }],
  ]
  for (const [label, path, payload] of blocked) {
    const r = await call('POST', path, payload)
    eq(`${label}: 사용중지 공정은 거부`, r.status, 400)
    eq(`${label}: 무엇이 막혔는지 말한다`,
      /사용중지된 공정/.test(String(r.data?.message ?? '')), true)
  }

  await must('PUT', `/processes/${proc.id}`, { ...body, active: true })
  eq('되살리면 다시 쓸 수 있다',
    (await must('GET', '/processes')).find((x) => x.id === proc.id).active, true)

  const op = await must('POST', '/process-operations',
    { processId: proc.id, code: `${P}OP`, name: `${P}작업코드` })
  eq('되살린 뒤에는 통과한다', op.processId, proc.id)
  await must('DELETE', `/process-operations/${op.id}`)
  eq('시험용 작업코드는 남기지 않는다',
    (await must('GET', '/process-operations')).some((x) => x.id === op.id), false)
}

/**
 * 원본 <b>생산계획/MRP생성</b> — [생산계획대상-전표] <b>미판매</b> 기준.
 *
 * <p>주문은 받았는데 아직 매출로 못 끊은 잔량에서 <b>현재고를 뺀 부족분</b>만큼
 * 계획을 만든다. 창고에 있는 것을 또 만들 이유가 없다.
 *
 * <p>조용히 틀리기 쉬운 자리가 둘이다.
 * <b>이미 있는 계획을 덮어쓰면</b> 사람이 손으로 고쳐 둔 수량이 사라지고,
 * <b>하나 더 만들면</b> 같은 주차에 두 계획이 생겨 둘 다 작업지시로 넘어간다.
 * 둘 다 화면에는 "생성 완료" 로 보인다.
 */
async function scenarioPlanGenerate(f) {
  section('■ 생산계획/MRP생성 (미판매 기준)')

  const WEEK = '2089-W33'
  const clear = async () => {
    for (const p of (await must('GET', '/production-plans')).filter((x) => x.planWeek === WEEK)) {
      await call('DELETE', `/production-plans/${p.id}`)
    }
  }
  await clear()

  // 앞 실행이 중간에 멈췄으면 주문이 남는다. 남아 있으면 미판매 잔량이 그만큼 부풀어
  // 다음 실행의 단언이 엉뚱한 값을 재게 된다.
  for (const o of (await must('GET', '/sales-orders')).filter((x) => x.orderDate === '2089-08-01')) {
    await call('DELETE', `/sales-orders/${o.id}`)
  }

  // 재고가 있으면 부족분이 안 생겨 아무것도 안 만들어진다. 있는 만큼 빼 두고 시작한다.
  const stockOf = async (itemId) => {
    const r = (await must('GET', '/stock')).find((x) => x.itemId === itemId && x.warehouseId === f.warehouse.id)
    return r ? Number(r.quantity) : 0
  }
  const before = await stockOf(f.product.id)
  if (before > 0) {
    await must('POST', '/stock/transactions', {
      itemId: f.product.id, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: before,
    })
  }

  const order = await must('POST', '/sales-orders', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, orderDate: '2089-08-01',
    lines: [{ itemId: f.product.id, quantity: 40, unitPrice: 1000 }],
  })

  /*
   * 이 품목의 미판매 잔량은 <b>내 주문만이 아니다</b> — 개발 자료에 이미 쌓여 있다.
   * 실측해서 그 값과 견준다. '40' 을 박아 두면 자료가 바뀔 때마다 QA 가 깨지고,
   * 정작 계산이 틀려도 알아채지 못한다.
   */
  const unsoldOf = async () => (await must('GET', '/sales-orders/unsold'))
    .filter((r) => r.itemId === f.product.id)
    .reduce((n, r) => n + Number(r.unsoldQty), 0)
  const demand = await unsoldOf()
  eq('내 주문이 미판매에 더해졌다', demand >= 40, true)

  const made = await must('POST', '/production-plans/generate', { planWeek: WEEK })
  eq('미판매 잔량으로 계획이 만들어진다', made.created >= 1, true)
  const mine = made.plans.find((x) => x.productId === f.product.id)
  eq('그 품목의 계획이 있다', !!mine, true)
  eq('수요량은 미판매 잔량이다', Number(mine.demandQty), demand)
  eq('재고가 0이면 계획수량 = 수요량', Number(mine.planQty), demand)
  eq('처음엔 검토 상태다', mine.status, 'REVIEW')
  eq('자동생성이라고 적어 둔다', mine.remark, '미판매 기준 자동생성')

  // 두 번째로 돌려도 같은 주차·같은 품목이면 건드리지 않는다.
  const again = await must('POST', '/production-plans/generate', { planWeek: WEEK })
  eq('이미 있으면 다시 안 만든다',
    again.plans.some((x) => x.productId === f.product.id), false)
  eq('건너뛴 이유를 센다', again.skippedExisting >= 1, true)
  eq('계획이 늘지 않았다',
    (await must('GET', '/production-plans'))
      .filter((x) => x.planWeek === WEEK && x.productId === f.product.id).length, 1)

  // 재고가 잔량을 덮으면 만들 것이 없다.
  await clear()
  const cover = demand + 10
  await must('POST', '/stock/transactions', {
    itemId: f.product.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: cover,
  })
  const covered = await must('POST', '/production-plans/generate', { planWeek: WEEK })
  eq('재고로 충당되면 안 만든다',
    covered.plans.some((x) => x.productId === f.product.id), false)
  eq('충당돼 건너뛴 것을 센다', covered.skippedCovered >= 1, true)

  // [현재고 차감]을 끄면 재고와 무관하게 잔량 그대로 만든다.
  const raw = await must('POST', '/production-plans/generate', { planWeek: WEEK, deductStock: false })
  const rawMine = raw.plans.find((x) => x.productId === f.product.id)
  eq('차감을 끄면 잔량 그대로', Number(rawMine.planQty), demand)

  await must('POST', '/stock/transactions', {
    itemId: f.product.id, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: cover,
  })
  if (before > 0) {
    await must('POST', '/stock/transactions', {
      itemId: f.product.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: before,
    })
  }
  await clear()
  await must('DELETE', `/sales-orders/${order.id}`)
  eq('시험용 주문도 남기지 않는다',
    (await must('GET', '/sales-orders')).filter((x) => x.orderDate === '2089-08-01').length, 0)
  eq('시험용 계획은 남기지 않는다',
    (await must('GET', '/production-plans')).filter((x) => x.planWeek === WEEK).length, 0)
  eq('재고도 제자리', await stockOf(f.product.id), before)
}

/**
 * 상단 <b>북마크바</b>(즐겨찾기).
 *
 * <p>원본은 [즐겨찾기]로 지금 화면을 담거나 뺀다. 사람마다 매일 여는 화면이 다르다.
 * 우리 북마크바는 코드에 박힌 6개라 아무도 자기 화면을 담을 수 없었고, 담을 수 없으니
 * 쓸 이유도 없었다.
 *
 * <p>까다로운 자리는 <b>처음 담는 순간</b>이다. 기본 여섯을 같이 저장하지 않으면
 * 하나를 담는 순간 여섯이 통째로 사라진다 — 담은 적 없는 것이 지워지는 셈이다.
 */
async function scenarioBookmarks() {
  section('■ 상단 북마크바')

  const start = await must('GET', '/bookmarks')
  eq('아무것도 안 담았으면 기본이 내려온다', start.length, 6)
  eq('기본은 아직 저장된 것이 아니다', start[0].id, null)

  const NEW = '/production/work-orders'
  const added = await must('POST', '/bookmarks', { label: '작업지시서', path: NEW })
  eq('담으면 일곱이 된다', added.length, 7)
  eq('기본 여섯이 살아남는다',
    added.filter((b) => b.path === '/inventory/items').length, 1)
  eq('담은 것이 맨 뒤에 붙는다', added[added.length - 1].path, NEW)
  eq('이제는 진짜 저장된 것이다', added.every((b) => b.id > 0), true)

  const dup = await call('POST', '/bookmarks', { label: '작업지시서', path: NEW })
  eq('같은 화면을 두 번 담을 수 없다', dup.status, 409)

  const removed = await must('DELETE', `/bookmarks?path=${encodeURIComponent(NEW)}`)
  eq('빼면 다시 여섯', removed.length, 6)

  // 기본 여섯 중 하나를 빼는 것도 된다 — 안 되면 '고정 6개' 시절과 다를 게 없다.
  const less = await must('DELETE', '/bookmarks?path=%2Finventory%2Fitems')
  eq('기본에 있던 것도 뺄 수 있다', less.length, 5)
  eq('뺀 것이 실제로 없다', less.some((b) => b.path === '/inventory/items'), false)
  eq('다시 조회해도 다섯', (await must('GET', '/bookmarks')).length, 5)

  await must('POST', '/bookmarks', { label: '품목등록', path: '/inventory/items' })
  eq('되돌리면 여섯', (await must('GET', '/bookmarks')).length, 6)

  // 담은 것을 전부 빼면 저장된 행이 하나도 없어 다시 '기본' 상태다 — 시험 전과 같다.
  for (const b of await must('GET', '/bookmarks')) {
    await must('DELETE', `/bookmarks?path=${encodeURIComponent(b.path)}`)
  }
  const back = await must('GET', '/bookmarks')
  eq('시험이 끝나면 처음 상태로 돌아온다', back.length, 6)
  eq('저장된 행은 남기지 않는다', back[0].id, null)
}

/**
 * <b>수금·지급(결제)의 회계반영.</b>
 *
 * <p>원본 결제내역조회에 [미반영 · 회계반영] 탭과 [회계전표] 열이 있다 — 결제 전표도
 * 회계로 넘어간다는 뜻이다. 우리는 넘기지 않았다. JournalSourceType 에 결제가 아예
 * 없었고 만드는 곳도 없었다.
 *
 * <p>그래서 <b>판매하면 외상매출금이 잡히는데 수금해도 안 줄었다.</b> 원장의
 * 외상매출금이 한 방향으로만 쌓인다. 채권현황은 따로 세니까 맞고, 어긋난 것은
 * 원장뿐이라 결산할 때까지 아무도 모른다.
 */
async function scenarioSettlementAccounting(f) {
  section('■ 수금·지급 회계반영')

  const D = '2092-06-10'
  // 합계잔액시산표에서 그 계정만 본다. 기간을 넓게 잡아야 실제로 걸린다 —
  // 좁게 잡아 아무 분개도 없는 구간을 재면 단언이 늘 통과하고 아무것도 못 잡는다.
  const balOf = async (code) => {
    const tb = await must('GET', '/journals/trial-balance?from=1900-01-01&to=2099-12-31')
    const row = tb.rows.find((r) => r.accountCode === code)
    return row ? Number(row.debit) - Number(row.credit) : 0
  }
  const ar = () => balOf('108')

  for (const x of (await must('GET', '/settlements')).filter((x) => x.settleDate === D)) {
    await call('DELETE', `/settlements/${x.id}`)
  }

  const before = await ar()
  const st = await must('POST', '/settlements', {
    type: 'RECEIPT', partnerId: f.customer.id, amount: 70000,
    method: '보통예금 이체', settleDate: D, note: `${P}수금반영`,
  })
  eq('만들면 미반영이다', st.accountingReflected, false)
  eq('만들기만 해서는 원장이 안 움직인다', await ar(), before)

  const done = await must('POST', '/accounting-reflection/reflect',
    { kind: 'SETTLEMENT', ids: [st.id] })
  eq('한 건 반영된다', done.reflectedCount, 1)

  const after = (await must('GET', '/settlements')).find((x) => x.id === st.id)
  eq('반영 표시가 켜진다', after.accountingReflected, true)
  eq('수금하면 외상매출금이 줄어든다', await ar(), before - 70000)

  eq('두 번 반영되지 않는다',
    (await must('POST', '/accounting-reflection/reflect',
      { kind: 'SETTLEMENT', ids: [st.id] })).reflectedCount, 0)

  // 반영된 전표를 지우면 분개만 남아 원장이 전표를 잃는다.
  const del = await call('DELETE', `/settlements/${st.id}`)
  eq('반영된 결제는 못 지운다', del.status, 400)
  eq('먼저 무엇을 하라고 말해 준다',
    /회계반영을 먼저 취소/.test(String(del.data?.message ?? '')), true)

  /*
   * 원본 판매·구매일괄회계반영의 <b>[회계전표No.]</b> 열.
   *
   * 반영했다는 표시만 있고 어느 분개가 됐는지가 없으면 그 전표를 찾아갈 길이 없다.
   * 금액이 이상할 때 사람이 회계전표를 뒤져 짝을 맞춰야 했다.
   */
  const listed = (await must('GET', '/accounting-reflection?kind=SETTLEMENT'))
    .find((x) => x.id === st.id)
  eq('반영하면 회계전표번호가 실린다', typeof listed.journalDocNo, 'string')
  eq('전표 id 도 같이 온다', listed.journalEntryId > 0, true)
  const entry = await must('GET', `/journals/${listed.journalEntryId}`)
  eq('그 번호가 실제 분개다', entry.docNo, listed.journalDocNo)
  eq('분개가 대차평형이다', entry.totalDebit, entry.totalCredit)
  eq('결제금액 그대로 잡힌다', entry.totalDebit, 70000)
  eq('결제요청자도 실린다', typeof listed.createdBy, 'string')

  eq('반영취소도 된다',
    (await must('POST', '/accounting-reflection/unreflect',
      { kind: 'SETTLEMENT', ids: [st.id] })).reflectedCount, 1)
  eq('되돌리면 원장도 제자리', await ar(), before)
  eq('되돌리면 전표번호도 사라진다',
    (await must('GET', '/accounting-reflection?kind=SETTLEMENT'))
      .find((x) => x.id === st.id).journalDocNo, null)

  // 지급은 반대다 — 차)외상매입금 / 대)현금.
  const ap = async () => -(await balOf('251'))
  const apBefore = await ap()
  const pay = await must('POST', '/settlements', {
    type: 'PAYMENT', partnerId: f.supplier.id, amount: 30000,
    method: '현금', settleDate: D, note: `${P}지급반영`,
  })
  await must('POST', '/accounting-reflection/reflect', { kind: 'SETTLEMENT', ids: [pay.id] })
  eq('지급하면 외상매입금이 줄어든다', await ap(), apBefore - 30000)

  await must('POST', '/accounting-reflection/unreflect', { kind: 'SETTLEMENT', ids: [pay.id] })
  for (const x of [st, pay]) await must('DELETE', `/settlements/${x.id}`)
  eq('시험용 결제는 남기지 않는다',
    (await must('GET', '/settlements')).filter((x) => x.settleDate === D).length, 0)
}

/**
 * 표준원가생성의 <b>[계산기준]</b> — 최종매입가 vs 총평균법.
 *
 * <p>원본 원가생성/수정 조건 실측(사본): 기준년월 · 원가계산방법 ·
 * [계산기준] <b>선입선출법 · 총평균법</b> · [기타] 기말금액재계산.
 *
 * <p>우리 표준원가는 자재 단가를 늘 <b>최종매입가</b> 하나로만 잡았다. 그러면 마지막 한 번의
 * 거래에 휘둘린다 — 같은 자재를 100개는 싸게, 마지막 1개만 비싸게 샀다면 표준원가가 그 비싼
 * 값으로 뛴다. 이 시나리오가 재는 것이 정확히 그 차이다.
 */
async function scenarioCostBasis(f) {
  section('■ 표준원가 계산기준')

  const period = '2087-05'
  const clear = async () => {
    for (const c of (await must('GET', '/costs')).filter((x) => x.period === period)) {
      await call('DELETE', `/costs/${c.id}`)
    }
  }
  await clear()

  // 같은 자재를 싸게 많이, 비싸게 조금 산다. 총평균과 최종매입가가 갈라지도록.
  const buys = []
  for (const [qty, price, day] of [[100, 1000, '2087-05-02'], [1, 5000, '2087-05-20']]) {
    buys.push(await must('POST', '/purchases', {
      partnerId: f.supplier.id, warehouseId: f.warehouse.id, purchaseDate: day,
      lines: [{ itemId: f.material.id, quantity: qty, unitPrice: price }],
    }))
  }

  const costOf = async (basis) => {
    await clear()
    await must('POST', `/costs/build?period=${period}&basis=${basis}`)
    const row = (await must('GET', '/costs'))
      .find((x) => x.period === period && x.itemId === f.material.id)
    return row ? Number(row.materialCost) : null
  }

  const last = await costOf('LAST_PURCHASE')
  const avg = await costOf('WEIGHTED_AVG')

  eq('최종매입가는 마지막 거래를 쓴다', last, 5000)
  // (100×1000 + 1×5000) / 101 = 1039.60…
  eq('총평균법은 그 달 전체로 잰다', Math.round(avg), 1040)
  eq('두 기준이 실제로 다르다', last !== avg, true)

  await clear()
  for (const b of buys) await must('DELETE', `/purchases/${b.id}`)
  eq('시험용 구매는 남기지 않는다',
    (await must('GET', '/purchases')).filter((x) => String(x.purchaseDate).startsWith('2087-05')).length, 0)
}

/**
 * 생산계획에서 <b>작업지시서생성</b>.
 *
 * <p>원본 생산계획/MRP리스트의 버튼이다(생산계획계산 · MRP계산 ·
 * <b>작업지시서생성</b> · 발주계획/발주서생성 …). 우리 생산계획(MPS) 화면에는 있었는데
 * MRP리스트에는 없어서, 같은 자료를 보면서 한쪽에서만 일을 할 수 있었다.
 *
 * <p><b>확정한 계획만</b> 넘어가야 한다. 검토 중인 계획으로 지시를 내면 아직 정하지도 않은
 * 수량이 현장으로 나간다. 이미 지시를 낸 계획을 또 넘기면 같은 것을 두 번 만든다.
 */
async function scenarioPlanToWorkOrder(f) {
  section('■ 생산계획 → 작업지시')

  const week = '2089-W15'
  for (const x of (await must('GET', '/production-plans')).filter((p) => p.planWeek === week)) {
    await call('DELETE', `/production-plans/${x.id}`)
  }

  const plan = await must('POST', '/production-plans', {
    productId: f.product.id, planWeek: week, demandQty: 5, planQty: 5, remark: `${P}계획`,
  })
  eq('처음엔 검토 상태다', plan.status, 'REVIEW')

  // 검토 중인 계획은 지시로 넘어가면 안 된다.
  const early = await call('POST', `/production-plans/${plan.id}/work-order`)
  eq('검토 중인 계획은 거절된다', early.status >= 400, true)

  await must('PATCH', `/production-plans/${plan.id}/status`, { status: 'CONFIRMED' })
  const made = await must('POST', `/production-plans/${plan.id}/work-order`)
  eq('확정하면 작업지시가 생긴다', !!made.workOrderNo, true)
  eq('상태가 지시완료로 바뀐다', made.status, 'ORDERED')

  // 두 번 넘기면 같은 것을 두 번 만든다.
  const again = await call('POST', `/production-plans/${plan.id}/work-order`)
  eq('이미 지시한 계획은 다시 안 넘어간다', again.status >= 400, true)

  // 작업지시를 먼저 지운다 — 계획만 사라지고 지시가 남으면
  // "이 작업지시는 어느 계획에서 나왔나" 에 답할 수 없어 서버가 막는다.
  const wo = (await must('GET', '/work-orders')).find((w) => w.orderNo === made.workOrderNo)
  if (wo) await must('DELETE', `/work-orders/${wo.id}`)
  await must('DELETE', `/production-plans/${plan.id}`)
  eq('시험용 계획은 남기지 않는다',
    (await must('GET', '/production-plans')).filter((x) => x.planWeek === week).length, 0)
}

/**
 * 출하·정산의 <b>프로젝트</b>.
 *
 * <p>원본 조건 판 실측(사본):
 *   출하현황 — 출하No. · 창고 · <b>프로젝트</b> · 관리항목 · 거래처 · 품목 · 시리얼/로트No.
 *   수금현황·지급현황 — 기준일자 · 거래처 · 부서 · <b>프로젝트</b> · 거래처관리담당자
 *
 * <p>판매·구매·비용은 진작 프로젝트를 단다 — Project 를 groupware 에서 inventory 로
 * 옮긴 것도 전표가 프로젝트를 참조할 수 있게 하려던 것이다. 그런데 <b>출하와 정산만</b>
 * 안 달았다. 프로젝트별 손익을 집계한다면서 돈이 들어오고 나가는 전표가 프로젝트를 모르면,
 * 그 프로젝트로 얼마를 받았는지 셀 수가 없다.
 */
async function scenarioShipmentSettlementProject(f) {
  section('■ 출하·정산 프로젝트')

  // 개발 자료에 프로젝트가 한 건도 없어 직접 만들어 쓴다.
  // 있는 것을 골라 쓰면 그 프로젝트가 지워졌을 때 이 시나리오가 조용히 안 재게 된다.
  for (const x of (await must('GET', '/projects')).filter((x) => (x.name ?? '').startsWith(P))) {
    await call('DELETE', `/projects/${x.id}`)
  }
  const pj = await must('POST', '/projects', { name: `${P}프로젝트`, manager: 'QA' })
  eq('프로젝트를 만들 수 있다', pj.name, `${P}프로젝트`)

  const ship = await must('POST', '/shipments', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, shipDate: '2090-03-04',
    projectId: pj.id,
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }],
  })
  eq('출하에 프로젝트가 붙는다', ship.projectId, pj.id)
  eq('프로젝트명도 실린다', ship.projectName, pj.name)
  eq('다시 조회해도 남는다',
    (await must('GET', '/shipments')).find((x) => x.id === ship.id).projectName, pj.name)

  const st = await must('POST', '/settlements', {
    type: 'RECEIPT', partnerId: f.customer.id, amount: 1000,
    method: '현금', settleDate: '2090-03-04', projectId: pj.id, note: `${P}프로젝트`,
  })
  eq('정산에 프로젝트가 붙는다', st.projectId, pj.id)
  eq('정산도 프로젝트명이 실린다', st.projectName, pj.name)

  // 안 정할 수 있어야 한다 — 프로젝트를 안 쓰는 회사도 있고,
  // 프로젝트에 안 묶이는 거래도 있다. 지어내면 남의 프로젝트 손익이 된다.
  const plain = await must('POST', '/settlements', {
    type: 'RECEIPT', partnerId: f.customer.id, amount: 500,
    method: '현금', settleDate: '2090-03-04', note: `${P}프로젝트없음`,
  })
  isNull('안 정하면 null 이다', plain.projectId)

  // 생산입고도 같은 프로젝트를 단다. 팔린 것만 세면 <b>아직 재고로 남은 생산분</b>이
  // 어느 프로젝트 것인지 잃는다 — 프로젝트별 손익이 그만큼 비어 보인다.
  const wo = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: 1, orderDate: '2090-03-04',
  })
  const made = await must('POST', '/productions', {
    workOrderId: wo.id, producedQty: 1, productionDate: '2090-03-04', projectId: pj.id,
  })
  eq('생산입고에 프로젝트가 붙는다', made.projectId, pj.id)
  eq('생산입고도 프로젝트명이 실린다', made.projectName, pj.name)
  eq('다시 조회해도 남는다',
    (await must('GET', '/productions')).find((x) => x.id === made.id).projectName, pj.name)

  await must('DELETE', `/productions/${made.id}`)
  await must('DELETE', `/work-orders/${wo.id}`)
  for (const x of [st, plain]) await must('DELETE', `/settlements/${x.id}`)
  await must('DELETE', `/shipments/${ship.id}`)
  await must('DELETE', `/projects/${pj.id}`)
  eq('시험용 전표는 남기지 않는다',
    (await must('GET', '/settlements')).filter((x) => x.settleDate === '2090-03-04').length, 0)
  eq('시험용 프로젝트도 남기지 않는다',
    (await must('GET', '/projects')).filter((x) => (x.name ?? '').startsWith(P)).length, 0)
}

/**
 * 생산불출의 <b>담당자</b>와 <b>생산품목</b>.
 *
 * <p>원본 생산불출입력·생산불출조회의 머리는 일자 · <b>담당자</b> · 보내는창고 ·
 * 받는공장 · <b>생산품목</b> 이고, 생산불출현황 조건에도 [담당자] 가 있다 —
 * 세 화면에서 나온 항목이다.
 *
 * <p>담당자가 없어 "누가 낸 불출인지" 를 적을 자리도, 그걸로 거를 자리도 없었다.
 * 생산품목은 작업지시가 이미 알고 있는데 응답에 안 실어서 화면이 볼 수 없었다.
 *
 * <p>담당자는 <b>id 만</b> 싣는다 — production 이 hr 을 참조하면
 * hr → accounting → production 과 맞물려 순환이 된다. 이름은 화면이 붙인다.
 */
async function scenarioIssueEmployee(f) {
  section('■ 생산불출 담당자·생산품목')

  const emps = await must('GET', '/employees')
  const emp = emps[0]
  const warehouses = await must('GET', '/warehouses')
  const factory = warehouses.find((w) => w.id !== f.warehouse.id) ?? f.warehouse

  const wo = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: 2, orderDate: '2091-07-08',
  })

  // 불출할 자재를 먼저 넣어 둔다.
  const boms = await must('GET', '/boms')
  const line = boms.find((b) => b.productId === f.product.id).lines[0]
  await must('POST', '/stock/transactions', {
    itemId: line.componentId, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 5,
  })

  const mi = await must('POST', '/material-issues', {
    itemId: line.componentId, warehouseId: f.warehouse.id, toWarehouseId: factory.id,
    workOrderId: wo.id, qty: 2, issueDate: '2091-07-08',
    employeeId: emp.id, note: `${P}불출담당`,
  })
  eq('담당자 id 가 실린다', mi.employeeId, emp.id)
  eq('담당자 이름은 서버가 안 붙인다', 'employeeName' in mi, false)
  eq('생산품목 코드가 실린다', mi.productCode, f.product.code)
  eq('생산품목명도 실린다', mi.productName, f.product.name)

  const re = (await must('GET', '/material-issues')).find((x) => x.id === mi.id)
  eq('다시 조회해도 담당자가 남는다', re.employeeId, emp.id)
  eq('다시 조회해도 생산품목이 붙는다', re.productName, f.product.name)

  /*
   * 원본 생산불출입력·작업내역입력 머리의 <b>[프로젝트]</b>.
   *
   * <p>생산입고(Production)에는 있었는데 이 둘만 없었다. 같은 작업에서 나온 불출과
   * 작업내역이 <b>프로젝트별 집계에 안 잡혔다</b> — 프로젝트 원가를 보면 완제품 입고만
   * 걸리고 거기 들어간 자재와 품이 빠졌다.
   */
  const proj = await must('POST', '/projects', { name: `${P}불출프로젝트`, manager: 'QA' })
  const withProj = await must('POST', '/material-issues', {
    itemId: line.componentId, warehouseId: f.warehouse.id, qty: 1, issueDate: '2091-07-08',
    projectId: proj.id, note: `${P}프로젝트불출`,
  })
  eq('불출에 프로젝트가 실린다', withProj.projectId, proj.id)
  eq('프로젝트 이름도 붙는다', withProj.projectName, `${P}불출프로젝트`)
  eq('다시 조회해도 프로젝트가 남는다',
    (await must('GET', '/material-issues')).find((x) => x.id === withProj.id).projectId, proj.id)

  const wrProj = await must('POST', '/work-results', {
    process: `${P}공정`, goodQty: 1, workDate: '2091-07-08', projectId: proj.id,
  })
  eq('작업내역에도 프로젝트가 실린다', wrProj.projectId, proj.id)
  eq('작업내역 프로젝트 이름도 붙는다', wrProj.projectName, `${P}불출프로젝트`)

  // 안 정할 수도 있어야 한다 — 원본도 빈칸을 허용한다.
  const noProj = await must('POST', '/work-results', { process: `${P}공정2`, goodQty: 1, workDate: '2091-07-08' })
  isNull('프로젝트를 안 정해도 된다', noProj.projectId)

  await must('DELETE', `/work-results/${wrProj.id}`)
  await must('DELETE', `/work-results/${noProj.id}`)
  await must('DELETE', `/material-issues/${withProj.id}`)
  await must('DELETE', `/projects/${proj.id}`)

  /*
   * 원본 생산불출입력은 <b>한 전표에 자재 여러 줄</b>을 넣는 격자다. 우리는 한 줄씩만
   * 받아서, 같은 날 같은 작업지시로 자재 다섯 개를 내보내려면 다섯 번 저장해야 했다.
   *
   * <p>여러 줄을 한 트랜잭션에 넣는다. <b>한 줄이라도 막히면 전부 되돌린다</b> —
   * 재고가 모자라 세 줄 중 둘만 들어가면 창고 수량도 전표도 반쪽이 되고,
   * 사람은 무엇이 들어갔는지 모른다.
   */
  await must('POST', '/stock/transactions', {
    itemId: line.componentId, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 6,
  })
  const before = (await must('GET', `/stock?warehouseId=${f.warehouse.id}`))
    .find((s) => s.itemId === line.componentId)?.quantity ?? 0

  const batch = await must('POST', '/material-issues/batch', {
    warehouseId: f.warehouse.id, issueDate: '2091-07-08', note: null,
    lines: [
      { itemId: line.componentId, qty: 1, note: `${P}줄1` },
      { itemId: line.componentId, qty: 2, note: `${P}줄2` },
    ],
  })
  eq('한 번에 두 줄이 들어간다', batch.length, 2)
  eq('줄마다 적요가 따로 남는다', batch.map((x) => x.note).join(','), `${P}줄1,${P}줄2`)
  const afterBatch = (await must('GET', `/stock?warehouseId=${f.warehouse.id}`))
    .find((s) => s.itemId === line.componentId)?.quantity ?? 0
  eq('두 줄 합만큼 재고가 준다', Number(before) - Number(afterBatch), 3)

  // 둘째 줄이 재고를 넘으면 첫 줄도 들어가면 안 된다.
  const partial = await call('POST', '/material-issues/batch', {
    warehouseId: f.warehouse.id, issueDate: '2091-07-08',
    lines: [{ itemId: line.componentId, qty: 1 }, { itemId: line.componentId, qty: 99999 }],
  })
  eq('한 줄이 막히면 거부한다', partial.status, 400)
  const afterFail = (await must('GET', `/stock?warehouseId=${f.warehouse.id}`))
    .find((s) => s.itemId === line.componentId)?.quantity ?? 0
  eq('막히면 앞 줄도 안 들어간다(전부 되돌림)', Number(afterFail), Number(afterBatch))

  for (const x of batch) await must('DELETE', `/material-issues/${x.id}`)
  await must('POST', '/stock/transactions', {
    itemId: line.componentId, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: 6,
  })

  // 작업지시 없이 낸 불출은 생산품목이 없다. 지어내면 남의 지시 자재가 된다.
  const loose = await must('POST', '/material-issues', {
    itemId: line.componentId, warehouseId: f.warehouse.id, toWarehouseId: factory.id,
    qty: 1, issueDate: '2091-07-08', note: `${P}지시없음`,
  })
  isNull('작업지시가 없으면 생산품목도 없다', loose.productCode)

  for (const x of [mi, loose]) await must('DELETE', `/material-issues/${x.id}`)
  await must('DELETE', `/work-orders/${wo.id}`)
  await must('POST', '/stock/transactions', {
    itemId: line.componentId, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: 5,
  })
  eq('시험용 불출은 남기지 않는다',
    (await must('GET', '/material-issues')).filter((x) => x.issueDate === '2091-07-08').length, 0)
}

/**
 * 작업지시서의 <b>납품처 · 담당자 · 납기일자</b>.
 *
 * <p>원본 작업지시서입력 머리 실측(사본): 작업지시No. · 일자 · <b>납품처</b> ·
 * <b>담당자</b> · 납기일자. 작업지시서조회 열은 일자-No. · <b>거래처명</b> ·
 * <b>담당자명</b> · <b>납기일자</b> · 작업지시No. · 품목명[규격] · 지시수량 ·
 * 생산수량 · 진행상태 · (불출/생산/작업현황 바로가기).
 *
 * <p>우리 작업지시에는 납품처도 담당자도 없어 "이 지시가 어느 거래처 납품 건인지" 도
 * "누가 맡았는지" 도 적을 자리가 없었다. 납기일자는 진작 있었는데 목록에 안 보여 줬다.
 *
 * <p>담당자는 <b>id 만</b> 싣는다 — production 이 hr 을 참조하면
 * hr → accounting → production 과 맞물려 순환이 된다(CLAUDE.md 4.1).
 * 이름은 화면이 사원 목록에서 붙인다. 그래서 <b>응답에 employeeName 이 없는 것이 정상</b>이다.
 */
async function scenarioWorkOrderPartner(f) {
  section('■ 작업지시 납품처·담당자')

  const emps = await must('GET', '/employees')
  const emp = emps[0]

  const wo = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: 5,
    orderDate: '2092-02-03', dueDate: '2092-02-20',
    partnerId: f.customer.id, employeeId: emp.id,
  })
  eq('납품처가 실린다', wo.partnerId, f.customer.id)
  eq('납품처 이름도 실린다', wo.partnerName, f.customer.name)
  eq('담당자 id 가 실린다', wo.employeeId, emp.id)
  eq('담당자 이름은 서버가 안 붙인다', 'employeeName' in wo, false)
  eq('납기일자가 실린다', wo.dueDate, '2092-02-20')

  const re = (await must('GET', '/work-orders')).find((x) => x.id === wo.id)
  eq('다시 조회해도 납품처가 남는다', re.partnerName, f.customer.name)
  eq('다시 조회해도 담당자가 남는다', re.employeeId, emp.id)

  // 안 주면 빈칸이다. 지어내면 남의 거래처 납품 건이 된다.
  const plain = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: 1, orderDate: '2092-02-03',
  })
  isNull('안 주면 납품처는 null', plain.partnerId)
  isNull('안 주면 담당자도 null', plain.employeeId)

  for (const x of [wo, plain]) await must('DELETE', `/work-orders/${x.id}`)
  eq('시험용 작업지시는 남기지 않는다',
    (await must('GET', '/work-orders')).filter((x) => x.orderDate === '2092-02-03').length, 0)
}

/**
 * 판매조회의 <b>진행상태변경</b> — 여러 전표를 한 번에 확인·확인해제한다.
 *
 * <p>원본 판매조회·구매조회의 버튼이다(신규(F2) · <b>진행상태변경</b> · 보내기 ·
 * 바코드(품목) · 선택삭제 · 이력조회). 우리는 한 줄씩 [확인] 을 누르는 것밖에 없어서,
 * 월말에 수십 장을 확인하려면 수십 번을 눌러야 했다.
 *
 * <p>확인한 전표는 <b>지울 수 없어야</b> 한다. 확인은 "이 거래는 끝났다" 는 표시라,
 * 그 뒤에 지워지면 확인했다는 사실이 거짓이 된다. 해제하면 다시 지울 수 있다.
 */
async function scenarioSalesConfirmBulk(f) {
  section('■ 판매 진행상태변경')

  const mk = (n) => must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2093-12-0' + n,
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }],
  })
  const a = await mk(1)
  const b = await mk(2)

  eq('처음엔 미확인이다', a.confirmStatus, 'UNCONFIRMED')

  for (const x of [a, b]) await must('POST', `/sales/${x.id}/confirm`)
  const after = await must('GET', '/sales')
  eq('둘 다 확인된다',
    after.filter((x) => [a.id, b.id].includes(x.id) && x.confirmStatus === 'CONFIRMED').length, 2)

  // 확인한 전표는 못 지운다 — 확인이 "끝났다" 는 표시이기 때문이다.
  const blocked = await call('DELETE', `/sales/${a.id}`)
  eq('확인한 전표는 삭제가 막힌다', blocked.status >= 400, true)

  for (const x of [a, b]) await must('POST', `/sales/${x.id}/unconfirm`)
  eq('해제하면 미확인으로 돌아온다',
    (await must('GET', '/sales')).find((x) => x.id === a.id).confirmStatus, 'UNCONFIRMED')

  for (const x of [a, b]) await must('DELETE', `/sales/${x.id}`)
  eq('시험용 전표는 남기지 않는다',
    (await must('GET', '/sales')).filter((x) => String(x.saleDate).startsWith('2093-12')).length, 0)
}

/**
 * 기안서통합관리의 <b>작업자 · 작업일시</b>.
 *
 * <p>원본 열 실측(사본): 기안일자 · 제목 · 구분 · 기안자 · 결재자 ·
 * <b>작업자</b> · <b>작업일시</b>. 마지막으로 이 문서를 움직인 사람과 그 시각이다.
 *
 * <p>우리에겐 그 두 칸이 없어 "누가 마지막으로 손댔나" 를 알 수 없었다.
 * 컬럼을 새로 만들지 않았다 — 결재선이 이미 누가 언제 처리했는지(actedAt)를 들고 있어서
 * 컬럼을 더 두면 같은 사실이 두 군데 적히고 어긋난다.
 *
 * <p>아직 아무도 결재하지 않았으면 <b>기안자와 기안 시각</b>이다. 그것이 이 문서에
 * 마지막으로 일어난 일이기 때문이다 — 빈칸으로 두면 "아무 일도 없었다" 로 읽힌다.
 */
async function scenarioApprovalLastActor() {
  section('■ 기안서 작업자·작업일시')

  // 기안서를 만들지 않는다. 결재가 끝난 문서는 지울 수 없고 지운 문서도 <b>남기 때문</b>에
  // (원본에도 [삭제] 탭이 있다), 만들었다 지우면 실행할 때마다 한 줄씩 불어난다.
  // 그래서 이미 있는 문서로 잰다 — 이 값들은 저장된 것이 아니라 결재선에서 <b>끌어내는</b> 것이라
  // 읽기만 해도 계산이 맞는지 알 수 있다.
  //
  // <b>지금 개발 자료에는 결재가 처리된 문서가 없다.</b> 그래서 아래 두 가지 중
  // '처리됨' 쪽은 아직 실행되지 않는다 — lastActedAt 을 createdAt 으로 바꿔 봐도
  // 이 시나리오는 통과한다. 결재를 처리한 문서가 생기면 그때부터 진짜로 잰다.
  // 만들었다 지우는 방식으로 메우지 않은 이유는 위와 같다.
  const docs = await must('GET', '/approvals?scope=all&includeDeleted=true')
  eq('기안서가 있다', docs.length > 0, true)

  for (const d of docs) {
    const detail = await must('GET', `/approvals/${d.id}`)
    const acted = (detail.lines ?? []).filter((l) => l.actedAt)
    if (acted.length === 0) {
      // 아무도 처리 안 했으면 기안자와 기안 시각이다 —
      // 빈칸으로 두면 "아무 일도 없었다" 로 읽힌다.
      eq(`#${d.id} 결재 전이면 기안자가 작업자`, d.lastActorName, d.drafterName)
      eq(`#${d.id} 작업일시가 비어 있지 않다`, !!d.lastActedAt, true)
    } else {
      // 처리됐으면 <b>가장 늦게</b> 처리된 줄이다. 첫 줄을 쓰면 결재가 진행돼도 안 움직인다.
      const last = acted.reduce((a, b) => (a.actedAt >= b.actedAt ? a : b))
      eq(`#${d.id} 가장 늦게 처리한 사람이 작업자`, d.lastActorName, last.approverName)
      eq(`#${d.id} 작업일시가 그 처리 시각`, d.lastActedAt, last.actedAt)
    }
  }
}

/**
 * 휴가잔여일수현황이 <b>몇 년치인지</b> 말하는가.
 *
 * <p>원본 열 실측(사본): <b>휴가명</b> · 부서명 · 성명 · 휴가일수 · 휴가사용일수 ·
 * 휴가잔여일수. 첫 열 값이 '연차(2026년)' 이다.
 *
 * <p>이 화면은 원래부터 연도별로 센다 — 서버가 그 해에 시작한 휴가만 사용일수에 넣는다.
 * 그런데 화면이 연도를 <b>보내지도 보여 주지도</b> 않아서, 지금 보는 숫자가 몇 년치인지
 * 알 방법이 없었다. 다른 해 휴가가 섞여 보이는지도 확인할 수 없었다.
 */
async function scenarioVacationYear(f) {
  section('■ 휴가잔여일수현황 기준연도')

  const users = await must('GET', '/users')
  const me = users[0]
  const mk = (day) => must('POST', '/hr/vacations', {
    userId: me.id, type: '연차', startDate: day, endDate: day, days: 1, reason: `${P}연도`,
  })

  const usedIn = async (year) => {
    const rows = await must('GET', `/hr/vacations/summary?year=${year}&employment=ALL`)
    const r = rows.find((x) => x.empName === me.name)
    return { used: Number(r.usedDays), leaveName: r.leaveName }
  }

  const before2088 = await usedIn(2088)
  const before2089 = await usedIn(2089)
  eq('휴가명이 그 해를 말한다', before2088.leaveName, '연차(2088년)')
  eq('연도가 다르면 휴가명도 다르다', before2089.leaveName, '연차(2089년)')

  const a = await mk('2088-04-05')
  await must('PUT', `/hr/vacations/${a.id}/status`, { status: 'APPROVED' })

  eq('그 해 휴가는 그 해 사용일수에 들어간다',
    (await usedIn(2088)).used, before2088.used + 1)
  eq('다른 해에는 안 섞인다', (await usedIn(2089)).used, before2089.used)

  await must('DELETE', `/hr/vacations/${a.id}`)
  eq('시험용 휴가는 남기지 않는다',
    (await must('GET', '/hr/vacations')).filter((x) => (x.reason ?? '').startsWith(P)).length, 0)
  eq('지우면 사용일수가 되돌아온다', (await usedIn(2088)).used, before2088.used)
}

/**
 * 거래처의 <b>모바일</b>·<b>이체정보</b>와 사용구분.
 *
 * <p>원본 거래처리스트의 열은 거래처코드 · 거래처명 · 대표자명 · 전화 · <b>모바일</b> ·
 * 검색창내용 · <b>사용구분</b> · <b>이체정보</b>다. 버튼은 신규(F2) · 관계설정 ·
 * 계층그룹 · 변경 · <b>사용중단/재사용</b> · 웹자료올리기.
 *
 * <p>우리 거래처에는 전화 한 칸뿐이라 담당자 휴대폰을 적을 자리가 없었고,
 * 이체정보(지급할 계좌)는 아예 없었다.
 *
 * <p>그리고 수정 화면이 저장할 때 <b>늘 active=true 를 보냈다</b> —
 * 사용중단한 거래처를 고치기만 해도 조용히 되살아났다. 그 회귀를 막는 단언이다.
 */
async function scenarioPartnerContactAndBank() {
  section('■ 거래처 모바일·이체정보')

  const code = `${P}PT`
  for (const x of (await must('GET', '/partners')).filter((y) => y.code === code)) {
    await call('DELETE', `/partners/${x.id}`)
  }

  const made = await must('POST', '/partners', {
    code, name: `${P}거래처`, type: 'CUSTOMER',
    phone: '02-000-0000', mobile: '010-1234-5678',
    email: 'qa@example.test', fax: '02-000-0001', creditLimit: 5000000,
    bankName: '국민', accountNo: '123-45-678910', accountHolder: '홍길동',
    postalCode: '13529', address: '경기 성남시 분당구',
    salesPriceGroup: 'A', purchasePriceGroup: 'B',
  })

  // 원본 거래처등록 [기본] 탭의 [주소1 우편번호]. 주소 안에 섞어 적으면
  // 거래명세서·출하지시서에 우편번호만 따로 뽑을 수가 없다.
  eq('우편번호가 실린다', made.postalCode, '13529')
  eq('주소와 따로다', made.address, '경기 성남시 분당구')

  // 단가그룹은 특별단가등록의 '그룹별' 이 보는 값인데, 폼에 칸이 없어
  // PATCH /partners/{id}/price-group 을 직접 부르지 않으면 정할 수가 없었다.
  eq('판매단가그룹을 등록에서 정할 수 있다', made.salesPriceGroup, 'A')
  eq('구매단가그룹도 마찬가지다', made.purchasePriceGroup, 'B')
  eq('모바일이 실린다', made.mobile, '010-1234-5678')

  /*
   * 원본 거래처관리대장 I 머리말 실측(사본): 사업자등록번호 · 대표자 · <b>여신한도</b> ·
   * 전화 · <b>Email</b> · <b>Fax</b> · 주 소 · 기타사항. 실제 값까지 찍혀 있다.
   * 우리 거래처에는 셋 다 적을 자리가 없어서 대장을 인쇄해도 머리말이 비어 있었다.
   */
  eq('Email 이 실린다', made.email, 'qa@example.test')
  eq('Fax 가 실린다', made.fax, '02-000-0001')
  eq('여신한도가 실린다', Number(made.creditLimit), 5000000)
  eq('은행이 실린다', made.bankName, '국민')
  eq('계좌번호가 실린다', made.accountNo, '123-45-678910')
  eq('예금주가 실린다', made.accountHolder, '홍길동')
  eq('전화와 모바일은 따로다', made.phone, '02-000-0000')

  /*
   * 안 주면 0 — 원본도 0 을 찍는다('한도 없음' 이 아니라 값이 0 인 것이다).
   * <b>따로 만든 거래처로 잰다.</b> 위 거래처에 대고 PUT 하면 수정은 통째로 덮으므로
   * 이체정보·우편번호가 다 날아가고, 바로 뒤 단언이 그것을 잡는다.
   */
  const bare = await must('POST', '/partners',
    { code: `${code}0`, name: `${P}여신없음`, type: 'CUSTOMER' })
  eq('여신한도를 안 주면 0', Number(bare.creditLimit), 0)
  isNull('Email 도 안 주면 비어 있다', bare.email)
  await must('DELETE', `/partners/${bare.id}`)

  const re = (await must('GET', '/partners')).find((x) => x.id === made.id)
  eq('다시 조회해도 이체정보가 남는다', re.accountNo, '123-45-678910')

  /*
   * 원본 [거래처정보] 탭의 나머지 칸들.
   *
   * <p>거래처코드구분은 그냥 두는 값이 아니다 — 등록번호 자릿수가 여기서 갈린다.
   * 세금계산서에 그대로 찍히는 값인데 우리는 지금까지 아무 글자나 받았다.
   * 틀린 채로 들어가면 발행하고 나서야 안다.
   */
  const baseBody = {
    name: made.name, type: made.type, ceoName: made.ceoName,
    manager: made.manager, phone: made.phone, address: made.address,
  }
  eq('안 주면 사업자등록번호다', made.regNoKind, '사업자등록번호')
  eq('안 주면 일반 업종이다', made.industryKind, '일반')
  eq('안 주면 세무신고 대상이다', made.taxReport, true)
  eq('안 주면 출하 대상이다', made.shipmentTarget, true)

  const short = await call('PUT', `/partners/${made.id}`, { ...baseBody, bizRegNo: '123-45' })
  eq('사업자번호가 10자리가 아니면 거부', short.status, 400)
  eq('몇 자리인지 말해 준다', /10자리/.test(String(short.data?.message ?? '')), true)

  const ok10 = await must('PUT', `/partners/${made.id}`, { ...baseBody, bizRegNo: '123-45-67890' })
  eq('구분자가 섞여 있어도 숫자 10자리면 된다', ok10.bizRegNo, '123-45-67890')

  const rrnShort = await call('PUT', `/partners/${made.id}`,
    { ...baseBody, regNoKind: '주민등록번호', bizRegNo: '123-45-67890' })
  eq('주민등록번호로 바꾸면 13자리를 요구한다', rrnShort.status, 400)
  const rrn = await must('PUT', `/partners/${made.id}`,
    { ...baseBody, regNoKind: '주민등록번호', bizRegNo: '900101-1234567' })
  eq('주민등록번호 13자리는 통과', rrn.regNoKind, '주민등록번호')

  // 외국인은 나라마다 형식이 달라 검사할 규칙이 없다. 막으면 넣을 방법이 없어진다.
  const foreign = await must('PUT', `/partners/${made.id}`,
    { ...baseBody, regNoKind: '외국인', bizRegNo: 'US-TAX-9' })
  eq('외국인은 형식을 따지지 않는다', foreign.bizRegNo, 'US-TAX-9')

  const badKind = await call('PUT', `/partners/${made.id}`,
    { ...baseBody, regNoKind: '여권번호' })
  eq('없는 거래처코드구분은 거부', badKind.status, 400)

  const filled = await must('PUT', `/partners/${made.id}`, {
    ...baseBody, regNoKind: '외국인', bizRegNo: 'US-TAX-9',
    industryKind: '관세사', subBizNo: '0001',
    postalCode2: '06236', address2: '서울 강남구 배송지',
    homepage: 'https://example.test', remark: '적요 시험',
    taxReport: false, shipmentTarget: false,
  })
  eq('업종별구분이 저장된다', filled.industryKind, '관세사')
  eq('종사업장번호가 저장된다', filled.subBizNo, '0001')
  eq('주소2가 저장된다', filled.address2, '서울 강남구 배송지')
  eq('주소2 우편번호가 저장된다', filled.postalCode2, '06236')
  eq('홈페이지가 저장된다', filled.homepage, 'https://example.test')
  eq('적요가 저장된다', filled.remark, '적요 시험')
  eq('세무신고 제외로 내릴 수 있다', filled.taxReport, false)
  eq('출하 제외로 내릴 수 있다', filled.shipmentTarget, false)

  const badIndustry = await call('PUT', `/partners/${made.id}`,
    { ...baseBody, regNoKind: '외국인', industryKind: '제조업' })
  eq('없는 업종별구분은 거부', badIndustry.status, 400)

  // 다시 조회해도 남는가 — 응답만 채우고 저장은 안 하는 실수를 잡는다.
  const again = (await must('GET', '/partners')).find((x) => x.id === made.id)
  eq('다시 조회해도 남는다', `${again.industryKind}|${again.subBizNo}|${again.taxReport}`,
    '관세사|0001|false')

  // 사용중단 → 고쳐도 되살아나면 안 된다.
  const body = {
    name: made.name, type: made.type, phone: made.phone, mobile: made.mobile,
    bankName: made.bankName, accountNo: made.accountNo, accountHolder: made.accountHolder,
    postalCode: made.postalCode, address: made.address,
    salesPriceGroup: made.salesPriceGroup, purchasePriceGroup: made.purchasePriceGroup,
  }
  const stopped = await must('PUT', `/partners/${made.id}`, { ...body, active: false })
  eq('사용중단할 수 있다', stopped.active, false)

  const edited = await must('PUT', `/partners/${made.id}`, { ...body, active: false, mobile: '010-9999-9999' })
  eq('고쳐도 사용중단이 유지된다', edited.active, false)
  eq('고친 값은 반영된다', edited.mobile, '010-9999-9999')
  eq('고쳐도 우편번호가 안 날아간다', edited.postalCode, '13529')
  eq('고쳐도 단가그룹이 안 날아간다', edited.salesPriceGroup, 'A')

  const revived = await must('PUT', `/partners/${made.id}`, { ...body, active: true })
  eq('되살릴 수 있다', revived.active, true)

  /*
   * <b>거래처 관계설정 — 대표거래처.</b>
   *
   * 원본 근거(사본): 거래처리스트 하단 버튼에 [관계설정] 이 있고, 거래처관리대장 II 조건에
   * [대표거래처로 합산] 이 있으며 그 값이 '거래처관계기준' 과 '개별거래처기준' 둘이다.
   * 한 회사가 지점·사업장별로 거래처코드를 따로 쓰면 채권채무를 회사 단위로 봐야 하는데
   * 우리는 코드 단위로밖에 볼 수 없었다.
   *
   * <b>두 단계까지만</b> 둔다. 사슬을 허용하면 합산이 어디서 멈추는지가 읽는 사람마다
   * 달라지고, 되돌아오면 무한루프다. 그래서 거절을 세 가지 다 잰다.
   */
  const parentCode = `${P}PTHEAD`
  for (const x of (await must('GET', '/partners')).filter((y) => y.code === parentCode)) {
    await call('DELETE', `/partners/${x.id}`)
  }
  const head = await must('POST', '/partners',
    { code: parentCode, name: `${P}본사`, type: 'CUSTOMER' })
  const branchCode = `${P}PTBR`
  for (const x of (await must('GET', '/partners')).filter((y) => y.code === branchCode)) {
    await call('DELETE', `/partners/${x.id}`)
  }
  const branch = await must('POST', '/partners',
    { code: branchCode, name: `${P}지점`, type: 'CUSTOMER', parentId: head.id })
  eq('대표거래처가 저장된다', branch.parentId, head.id)
  eq('대표거래처명도 같이 온다', branch.parentName, `${P}본사`)
  isNull('대표를 안 주면 자기가 곧 대표다', head.parentId)
  eq('다시 조회해도 남는다',
    (await must('GET', '/partners')).find((x) => x.id === branch.id).parentId, head.id)

  const selfBody = { name: `${P}지점`, type: 'CUSTOMER' }
  await rejects('자기 자신은 대표가 될 수 없다', 'PUT', `/partners/${branch.id}`,
    { ...selfBody, parentId: branch.id }, '자기 자신')
  await rejects('없는 거래처는 대표가 될 수 없다', 'PUT', `/partners/${branch.id}`,
    { ...selfBody, parentId: 99999999 }, '대표거래처를 찾을 수 없습니다')

  // 종속거래처를 다시 남의 대표로 삼을 수 없다 (대표 → 종속 → 종속 사슬 금지)
  const thirdCode = `${P}PT3`
  for (const x of (await must('GET', '/partners')).filter((y) => y.code === thirdCode)) {
    await call('DELETE', `/partners/${x.id}`)
  }
  const third = await must('POST', '/partners',
    { code: thirdCode, name: `${P}셋째`, type: 'CUSTOMER' })
  await rejects('종속거래처를 대표로 삼을 수 없다', 'PUT', `/partners/${third.id}`,
    { name: `${P}셋째`, type: 'CUSTOMER', parentId: branch.id }, '다시 다른 거래처에 딸릴 수 없습니다')

  // 반대 방향도 막는다: 이미 종속을 거느린 거래처는 남의 밑으로 갈 수 없다
  await rejects('대표거래처는 남의 밑으로 갈 수 없다', 'PUT', `/partners/${head.id}`,
    { name: `${P}본사`, type: 'CUSTOMER', parentId: third.id }, '대표로 삼는 거래처가 있어')

  // 관계를 풀 수 있다
  const freed = await must('PUT', `/partners/${branch.id}`, { ...selfBody, parentId: null })
  isNull('관계를 풀 수 있다', freed.parentId)

  for (const id of [branch.id, head.id, third.id]) await must('DELETE', `/partners/${id}`)
  eq('시험용 관계 거래처도 남기지 않는다',
    (await must('GET', '/partners'))
      .filter((x) => [parentCode, branchCode, thirdCode].includes(x.code)).length, 0)

  await must('DELETE', `/partners/${made.id}`)
  eq('시험용 거래처는 남기지 않는다',
    (await must('GET', '/partners')).filter((x) => x.code === code).length, 0)
}

/**
 * 품목의 <b>재고수량관리</b>(수량관리대상 / 수량관리제외).
 *
 * <p>원본 품목등록 리스트의 열이고 줄 값이 '수량관리대상'·'수량관리제외' 다.
 * 일별이익현황 조건에도 [수량관리제외품목포함] 이 있다.
 *
 * <p>우리는 <b>모든 품목의 재고를 잡았다</b>. 용역·운반비 같은 품목을 판매전표에 넣으면
 * 재고가 없어 "재고가 부족합니다" 로 막힌다 — 팔 수가 없다.
 *
 * <p>막는 자리는 StockService.applyDelta 한 곳이다. 부르는 데가 25 군데라
 * 각자 막게 두면 어느 한 곳이 빠진다. 다만 <b>재고를 움직이는 것 자체가 목적</b>인 자리
 * (재고조정·실사·재고전표 직접입력)는 조용히 건너뛰지 않고 거절한다 — 아무 일도 안 하고
 * 성공했다고 답하면 사람이 조정한 줄 알고 넘어간다.
 */
async function scenarioStockTracked(f) {
  section('■ 재고수량관리(수량관리제외)')

  const code = `${P}SVC`
  for (const it of (await must('GET', '/items')).filter((x) => x.code === code)) {
    await call('DELETE', `/items/${it.id}`)
  }

  const svc = await must('POST', '/items', {
    code, name: `${P}운반비`, unit: 'EA', category: 'RAW_MATERIAL',
    unitPrice: 5000, purchasePrice: 0, safetyStock: 0, stockTracked: false,
  })
  eq('수량관리제외로 만들 수 있다', svc.stockTracked, false)

  /*
   * 품목구분 <b>표시 이름은 원본(이카운트) 표기를 따른다.</b>
   * 사본의 품목등록 리스트에 '[원재료]' '[부재료]' '[반제품]' '[제품]' '[상품]' 으로 찍혀 있다.
   * 우리는 '원자재·부자재' 로 부르고 있어서, 실제원가현황의 소계 이름('원재료 계')과
   * 품목등록의 구분 이름이 서로 다른 말이 됐다.
   * enum 상수(RAW_MATERIAL)는 그대로다 — DB 값이고 CHECK 제약이 그것을 본다.
   */
  eq('품목구분 표시 이름이 원본과 같다', svc.categoryName, '원재료')
  eq('그래도 저장되는 값은 그대로', svc.category, 'RAW_MATERIAL')
  eq('메타 목록도 같은 말을 쓴다',
    (await must('GET', '/meta/item-categories')).map((c) => c.name).join('·'),
    '원재료·부재료·반제품·제품·상품')
  eq('안 주면 관리대상이다',
    (await must('POST', '/items', {
      code: `${code}2`, name: `${P}보통품목`, unit: 'EA', category: 'RAW_MATERIAL',
      unitPrice: 100, purchasePrice: 0, safetyStock: 0,
    })).stockTracked, true)

  const stockOf = async (itemId) => {
    const rows = await must('GET', '/stock')
    return rows.filter((x) => x.itemId === itemId).reduce((n, x) => n + Number(x.quantity), 0)
  }

  // 재고가 한 톨도 없는데 팔 수 있어야 한다 — 이게 이 설정의 값어치다.
  const sale = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2098-06-07',
    lines: [{ itemId: svc.id, quantity: 3, unitPrice: 5000 }],
  })
  eq('재고 없이도 팔린다', Number(sale.supplyAmount), 15000)
  eq('그래도 재고는 안 움직인다', await stockOf(svc.id), 0)

  await must('DELETE', `/sales/${sale.id}`)
  eq('지워도 재고는 그대로다', await stockOf(svc.id), 0)

  // 원가 화면들(표준원가현황·실제원가현황·차이분석)의 [수량관리제외품목포함] 조건이
  // 품목 응답의 이 값을 본다. id 만 오고 stockTracked 가 빠지면 화면이 걸러낼 수가 없다.
  const listed = (await must('GET', '/items')).find((x) => x.id === svc.id)
  eq('품목 목록에도 수량관리 구분이 실린다', listed.stockTracked, false)
  eq('보통 품목은 관리대상으로 실린다',
    (await must('GET', '/items')).find((x) => x.code === `${code}2`).stockTracked, true)

  // 사용중단한 품목을 <b>고치기만 해도</b> 되살아나면 안 된다.
  // 거래처에서 똑같은 버그를 고쳤는데 품목 화면에도 같은 것이 남아 있었다 —
  // 수정 저장이 늘 active:true 를 실어 보내고 있었다.
  const body = {
    name: svc.name, unit: svc.unit, category: svc.category,
    unitPrice: svc.unitPrice, purchasePrice: svc.purchasePrice, safetyStock: svc.safetyStock,
    stockTracked: svc.stockTracked,
  }
  const stopped = await must('PUT', `/items/${svc.id}`, { ...body, active: false })
  eq('품목을 사용중단할 수 있다', stopped.active, false)
  const edited = await must('PUT', `/items/${svc.id}`, { ...body, active: false, safetyStock: 3 })
  eq('고쳐도 사용중단이 유지된다', edited.active, false)
  eq('고친 값은 반영된다', Number(edited.safetyStock), 3)
  await must('PUT', `/items/${svc.id}`, { ...body, active: true })

  // 재고를 움직이는 것이 목적인 자리는 거절한다.
  const tx = await call('POST', '/stock/transactions', {
    itemId: svc.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 5,
  })
  eq('재고전표 직접입력은 400', tx.status, 400)
  eq('왜 안 되는지 말한다', /수량관리제외/.test(String(tx.data?.message ?? '')), true)

  const adj = await call('POST', '/stock-adjustments', {
    type: 'ADJUST', itemId: svc.id, warehouseId: f.warehouse.id, actualQty: 7,
  })
  eq('재고실사도 400', adj.status, 400)

  for (const it of (await must('GET', '/items')).filter((x) => (x.code ?? '').startsWith(code))) {
    await must('DELETE', `/items/${it.id}`)
  }
  eq('시험용 품목은 남기지 않는다',
    (await must('GET', '/items')).filter((x) => (x.code ?? '').startsWith(code)).length, 0)
}

/**
 * 계정 ↔ 사원 연결이 근태현황의 <b>직급·사원번호·부서명</b>을 채우는가.
 *
 * <p>원본 근태현황의 열은 전표일자 · 근태일자 · <b>부서명</b> · <b>직급</b> ·
 * <b>사원번호</b> · 사원명 · 근태종류 · 적요다. 우리 근태는 User 에 매달려 있는데
 * User 에는 직급도 사원번호도 없고 부서는 자유입력 문자열이라, 그 세 칸을 아예 못 만들었다.
 *
 * <p>User 는 사원 <b>id 만</b> 든다 — auth 는 기반층이라 hr 을 참조할 수 없다(CLAUDE.md 4.1).
 * 이름·직급·사원번호를 붙이는 일은 hr 이 맡는다. 그 연결이 실제로 이어지는지 못 박는다.
 *
 * <p>안 이은 계정은 <b>null</b> 이어야 한다. 지어내면 그 사람이 아닌 직급이 근태에 찍힌다.
 */
async function scenarioUserEmployeeLink() {
  section('■ 계정↔사원 연결')

  const emps = await must('GET', '/employees')
  // 직급이 적힌 사원을 고른다 — 빈 직급이면 '직급이 실린다' 가 아무것도 안 재게 된다.
  const emp = emps.find((e) => e.jobTitle) ?? emps[0]
  eq('사원 마스터가 있다', !!emp, true)

  const uname = `${P}link`.toLowerCase().replace(/[^a-z0-9-]/g, '')
  for (const u of (await must('GET', '/users')).filter((x) => x.username === uname)) {
    await call('DELETE', `/users/${u.id}`)
  }

  const linked = await must('POST', '/users', {
    username: uname, password: 'qa-pass-1234', name: 'QA연결',
    department: '자유입력부서', employeeId: emp.id, roleNames: ['STAFF'],
  })
  eq('계정에 사원이 붙는다', linked.employeeId, emp.id)

  const day = '2097-09-14'
  const vac = await must('POST', '/hr/vacations', {
    userId: linked.id, type: '연차', startDate: day, endDate: day, days: 1,
    reason: `${P}연결확인`,
  })
  eq('사원번호가 실린다', vac.empCode, emp.code)
  /*
   * 예전에는 사원 등록 API 가 없어 직급이 전부 비어 있었고, 이 단언은 '지어내지 않느냐'
   * 만 잴 수 있었다. 사원등록이 생기면서 QA 사원이 직급·부서를 갖게 돼 <b>이제 실제로
   * 값을 견준다.</b> 마스터에 없는 직급이 근태에 찍히면 그 사람이 아닌 직급이 남는다.
   */
  eq('직급이 실제로 채워져 있다', (emp.jobTitle ?? '').length > 0, true)
  eq('직급은 사원 마스터와 같다', vac.jobTitle ?? '', emp.jobTitle ?? '')
  // 부서명은 이어져 있으면 부서 마스터의 이름을 쓴다 — 계정의 자유입력 부서가 아니다.
  eq('부서명은 마스터에서 온다', vac.department, emp.department ?? '자유입력부서')
  eq('전표일자가 실린다', /^\d{4}-\d{2}-\d{2}$/.test(String(vac.docDate)), true)

  // 안 이은 계정은 빈칸이다. 지어내면 그 사람이 아닌 직급이 근태에 찍힌다.
  const users = await must('GET', '/users')
  const loose = users.find((u) => u.employeeId == null)
  if (loose) {
    const v2 = await must('POST', '/hr/vacations', {
      userId: loose.id, type: '연차', startDate: day, endDate: day, days: 1,
      reason: `${P}미연결`,
    })
    isNull('안 이은 계정은 사원번호가 없다', v2.empCode)
    isNull('안 이은 계정은 직급도 없다', v2.jobTitle)
    await must('DELETE', `/hr/vacations/${v2.id}`)
  }

  await must('DELETE', `/hr/vacations/${vac.id}`)
  await must('DELETE', `/users/${linked.id}`)
  eq('시험용 계정·근태는 남기지 않는다',
    (await must('GET', '/users')).filter((u) => u.username === uname).length, 0)
}

/**
 * 출하 <b>줄 적요</b>.
 *
 * <p>원본 출하지시서입력 그리드의 마지막 열이 적요다(품목 · 품목명 · 규격 · 수량 · 적요).
 * 출하지시서현황·출하현황의 결과 열에도 적요가 들어간다.
 *
 * <p>우리 출하에는 전표 적요만 있어서 "이 품목만 왜 따로 보내는지" 를 줄에 적을 자리가
 * 없었다. 판매·구매·생산불출 라인은 이미 다 들고 있다.
 *
 * <p>전표 적요와 줄 적요는 <b>따로</b>여야 한다. 하나로 합치면 줄마다 다른 말을 못 적는다.
 */
async function scenarioShipmentLineRemark(f) {
  section('■ 출하 줄 적요')

  const ship = await must('POST', '/shipments', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, shipDate: '2096-11-12',
    remark: `${P}전표적요`,
    lines: [
      { itemId: f.product.id, quantity: 1, unitPrice: 10000, remark: `${P}줄적요1` },
      { itemId: f.material.id, quantity: 2, unitPrice: 500 },
    ],
  })
  eq('줄 적요가 실린다', ship.lines[0].remark, `${P}줄적요1`)
  isNull('안 적은 줄은 null', ship.lines[1].remark)
  eq('전표 적요는 따로다', ship.remark, `${P}전표적요`)

  const re = (await must('GET', '/shipments')).find((x) => x.id === ship.id)
  eq('다시 조회해도 줄 적요가 남는다', re.lines[0].remark, `${P}줄적요1`)
  // 출하현황의 [창고] 조건과 [창고명] 열이 이 값을 본다.
  // 예전에는 응답에 안 실어서 "출하 전표에 창고가 없다" 고 여기고 조건을 안 만들었다.
  eq('창고명이 실린다', re.warehouseName, f.warehouse.name)

  /*
   * 원본 출하지시서현황·출하현황의 결과 열은 <b>품목명(규격)</b> 이다.
   * 규격이 응답에 없으면 화면이 품목명만 찍고, 같은 이름에 규격만 다른 품목이
   * 한 줄로 보인다 — 그걸 보고 다른 물건을 실어 보낸다.
   */
  eq('줄에 규격이 실린다', 'spec' in re.lines[0], true)

  // 출하지시서현황이 보는 것은 <b>아직 안 나간 것</b>이다.
  eq('만든 직후는 출하지시 상태다', re.status, 'READY')
  eq('상태 이름도 실린다', re.statusName, '출하지시')

  // 연락처는 원본 출하지시서현황에만 있는 열이다 — 보낼 곳에 연락하려고 보는 화면이다.
  eq('연락처 칸이 응답에 있다', 'contact' in re, true)

  await must('DELETE', `/shipments/${ship.id}`)
  eq('시험용 출하는 남기지 않는다',
    (await must('GET', '/shipments')).filter((x) => x.shipDate === '2096-11-12').length, 0)
}

/**
 * 판매 라인의 <b>부대비용</b>이 응답에 실리고 합계에는 안 들어가는가.
 *
 * <p>원본 이익현황의 열은 … 원가 · 이익 · 이익율 · <b>이익금액(부대비용포함)</b> ·
 * <b>판매부대비용</b> 이다. 부대비용은 거래처에 청구한 돈이 아니라 우리가 쓴 돈이라
 * <b>판매액(공급가액)에는 안 들어가고 이익에서는 빠져야</b> 한다.
 *
 * <p>둘 중 하나라도 어긋나면 조용히 틀린다. 합계에 들어가면 거래처에 더 청구한 것이 되고,
 * 이익에서 안 빠지면 운반비를 쓸수록 이익이 좋아 보인다. 뒤엣것이 실제로 그랬다.
 */
async function scenarioSalesExtraCost(f) {
  section('■ 판매 부대비용')

  const sale = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2095-08-09',
    lines: [{ itemId: f.product.id, quantity: 2, unitPrice: 10000, extraCost: 1500 }],
  })
  const line = sale.lines[0]
  eq('부대비용이 실린다', Number(line.extraCost), 1500)
  eq('공급가액에는 안 들어간다', Number(line.supplyAmount), 20000)
  eq('전표 합계에도 안 들어간다', Number(sale.supplyAmount), 20000)

  const re = (await must('GET', '/sales')).find((x) => x.id === sale.id)
  eq('다시 조회해도 부대비용이 남는다', Number(re.lines[0].extraCost), 1500)

  // 안 적으면 null 이거나 0 이다. 화면은 둘 다 0 으로 읽는다.
  const plain = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2095-08-09',
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 10000 }],
  })
  eq('안 적으면 부대비용이 없다', Number(plain.lines[0].extraCost ?? 0), 0)

  for (const x of [sale, plain]) await must('DELETE', `/sales/${x.id}`)
  eq('시험용 전표는 남기지 않는다',
    (await must('GET', '/sales')).filter((x) => x.saleDate === '2095-08-09').length, 0)
}

/**
 * 회계미반영현황이 <b>품목 줄</b>을 실어 오는가.
 *
 * <p>원본 회계미반영현황(판매)의 결과 열은 일자-No. · 거래처명 · <b>품목코드</b> ·
 * <b>품목명</b> · <b>수량</b> · <b>단가</b> · 공급가액 · 부가세 · 적요이고,
 * 월이 바뀌는 자리마다 소계가 들어간다.
 *
 * <p>우리 응답은 "첫 품목 외 N건" 요약뿐이라 <b>어느 품목이 회계로 안 넘어갔는지</b>
 * 알 수가 없었다. 화면이 품목별로 펼치려면 응답이 라인을 들고 와야 한다.
 *
 * <p>라인 금액의 합은 전표 합계와 <b>같아야</b> 한다. 어긋나면 월 소계와 총합계가
 * 서로 다른 숫자를 말하게 된다.
 */
async function scenarioReflectionLines(f) {
  section('■ 회계미반영현황 품목 줄')

  const sale = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2094-02-17',
    lines: [
      { itemId: f.product.id, quantity: 2, unitPrice: 30000, remark: `${P}줄1` },
      { itemId: f.material.id, quantity: 3, unitPrice: 1000, remark: `${P}줄2` },
    ],
  })

  const slips = await must('GET', '/accounting-reflection?kind=SALES')
  const row = slips.find((x) => x.id === sale.id)
  eq('그 전표가 나온다', !!row, true)
  eq('품목 줄이 실린다', row.lines.length, 2)
  eq('품목코드가 실린다', row.lines[0].itemCode, f.product.code)
  eq('수량이 실린다', Number(row.lines[0].quantity), 2)
  eq('단가가 실린다', Number(row.lines[0].unitPrice), 30000)
  eq('줄 적요가 실린다', row.lines[0].remark, `${P}줄1`)

  // 라인 합 = 전표 합. 어긋나면 월 소계와 총합계가 다른 말을 한다.
  const sum = (k) => row.lines.reduce((n, l) => n + Number(l[k]), 0)
  eq('라인 공급가액 합이 전표 공급가액과 같다', sum('supplyAmount'), Number(row.supplyAmount))
  eq('라인 부가세 합이 전표 부가세와 같다', sum('vatAmount'), Number(row.vatAmount))

  await must('DELETE', `/sales/${sale.id}`)
  eq('시험용 전표는 남기지 않는다',
    (await must('GET', '/accounting-reflection?kind=SALES')).filter((x) => x.id === sale.id).length, 0)
}

/**
 * 게시판 글을 <b>읽고 고칠 수 있는가</b>.
 *
 * <p>원본 게시판(WORK·건설예정공정표 …)은 제목을 누르면 그 자리에서 펼쳐지고,
 * 펼친 글 아래에 답글(F8) · 복사 · <b>수정</b> · <b>삭제</b> · 닫기가 붙는다.
 * 우리 화면은 제목만 있고 펼치거나 여는 자리가 없어 <b>올린 내용을 볼 방법이 아예 없었다</b> —
 * 게시판인데 읽기가 안 되는 셈이었다.
 *
 * <p>화면이 목록만으로 내용을 펼치려면 목록 응답이 content 를 실어 와야 한다.
 * 그리고 고치려면 PUT 이 있어야 한다 — 상태만 바꾸는 PATCH 뿐이었다.
 *
 * <p>작성자·게시글번호·일자는 고치지 못하게 둔다. 그 글이 언제 누구 것으로 올라갔는지라,
 * 나중에 고칠 수 있으면 기록이 아니게 된다.
 */
async function scenarioWorkPostEdit() {
  section('■ 게시판 읽기·수정')

  const made = await must('POST', '/work-posts', {
    board: 'WORK', title: `${P}업무글`, content: '처음 내용', forwardTo: '홍길동',
    postDate: '2093-05-06',
  })
  eq('내용이 실린다', made.content, '처음 내용')

  // 목록에서 바로 펼쳐야 하므로 목록 응답에도 내용이 있어야 한다.
  const listed = (await must('GET', '/work-posts?board=WORK')).find((x) => x.id === made.id)
  eq('목록에도 내용이 실린다', listed.content, '처음 내용')

  const edited = await must('PUT', `/work-posts/${made.id}`, {
    title: `${P}고친제목`, content: '고친 내용', forwardTo: '김철수',
  })
  eq('제목을 고칠 수 있다', edited.title, `${P}고친제목`)
  eq('내용을 고칠 수 있다', edited.content, '고친 내용')
  eq('전달자도 고칠 수 있다', edited.forwardTo, '김철수')
  eq('게시글번호는 그대로다', edited.postNo, made.postNo)
  eq('일자는 그대로다', edited.postDate, made.postDate)
  eq('작성자도 그대로다', edited.writer, made.writer)

  const blank = await call('PUT', `/work-posts/${made.id}`, { title: '', content: '내용' })
  eq('제목을 비우면 400', blank.status, 400)
  eq('고친 내용은 다시 조회해도 남는다',
    (await must('GET', '/work-posts?board=WORK')).find((x) => x.id === made.id).content, '고친 내용')

  await must('DELETE', `/work-posts/${made.id}`)
  eq('시험용 게시글은 남기지 않는다',
    (await must('GET', '/work-posts?board=WORK')).filter((x) => (x.title ?? '').startsWith(P)).length, 0)
}

/**
 * 거래처별채권·거래처별채무의 <b>잔액 분해</b>.
 *
 * <p>원본 열 실측(사본): 거래처명 · 기초채권 · 재고매출 · 회계매출 · 수금합계 ·
 * 기타할인등차액 · 잔액(채무는 기초채무 · 재고매입 · 회계매입 · 지급합계 · …).
 * 우리는 잔액 한 칸뿐이라 왜 움직였는지 알 수가 없었다 — 새로 판 것 때문인지
 * 수금이 안 들어온 것인지 구분이 안 됐다.
 *
 * <p>이 화면의 값어치는 <b>항등식</b>에 있다:
 * 기초 + 재고 + 회계 − 수금 + 기타차액 = 잔액.
 * 기타차액은 나머지라 우리가 이름 붙여 세지 못한 움직임이 있으면 거기 남는다.
 * 항등식이 깨지면 어느 칸이 거짓말을 하고 있다는 뜻이라 못 박아 둔다.
 */
async function scenarioPartnerMovements(f) {
  section('■ 거래처별채권 잔액분해')

  const day = '2091-03-11'
  const from = '2091-03-01'
  const to = '2091-03-31'
  const get = async (side) => must('GET',
    `/ledger/partner-movements?from=${from}&to=${to}&side=${side}`)

  const before = (await get('AR')).find((m) => m.partnerId === f.customer.id)
  const openBefore = before ? before.opening : 0

  // 기간 안에 판매 하나, 수금 하나.
  const sale = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: day,
    lines: [{ itemId: f.product.id, quantity: 2, unitPrice: 50000 }],
  })
  const settle = await must('POST', '/settlements', {
    partnerId: f.customer.id, type: 'RECEIPT', settleDate: day, amount: 30000,
    method: '현금', note: `${P}분해`,
  })

  const row = (await get('AR')).find((m) => m.partnerId === f.customer.id)
  eq('그 거래처 줄이 나온다', !!row, true)
  eq('기초는 기간 전날까지의 잔액이라 안 움직인다', row.opening, openBefore)
  eq('재고매출에 판매전표가 잡힌다', Number(row.stockAmount), Number(sale.totalAmount))
  eq('수금합계에 수금전표가 잡힌다', Number(row.settledAmount) >= 30000, true)

  // 항등식 — 모든 줄에서 성립해야 한다.
  //
  // 시험용 기간만 재면 소용이 없다. 그 기간에는 회계전표가 없어 기타차액이 0 이고,
  // 기타차액을 아예 0 으로 고정해도 항등식이 그냥 통과한다(실제로 그렇게 만들어 확인했다).
  // 그래서 <b>전 기간</b>으로 잰다 — 회계전표가 통제계정을 움직인 것까지 들어와야
  // 기타차액이 제 일을 하는지 알 수 있다.
  const holds = (rows) => rows.every((m) =>
    Math.abs((m.opening + m.stockAmount + m.accountingAmount - m.settledAmount + m.otherDiff) - m.closing) < 0.5)
  const wide = async (side) => must('GET',
    `/ledger/partner-movements?from=1900-01-01&to=2099-12-31&side=${side}`)
  eq('채권 분해가 항등식을 지킨다', holds(await wide('AR')), true)
  eq('채무 분해가 항등식을 지킨다', holds(await wide('AP')), true)
  eq('시험 기간에서도 항등식을 지킨다', holds(await get('AR')), true)

  // 아무 일도 없던 거래처는 줄을 만들지 않는다 — 빈 줄로 표를 채우면 못 읽는다.
  const quiet = (await get('AR')).filter((m) =>
    m.opening === 0 && m.closing === 0 && m.stockAmount === 0
    && m.accountingAmount === 0 && m.settledAmount === 0)
  eq('아무 움직임 없는 거래처는 줄이 없다', quiet.length, 0)

  await must('DELETE', `/settlements/${settle.id}`)
  await must('DELETE', `/sales/${sale.id}`)
  eq('시험용 전표는 남기지 않는다',
    (await get('AR')).filter((m) => m.partnerId === f.customer.id && m.stockAmount !== 0).length, 0)
}

/**
 * 생산입고가 <b>생산된공장 → 받는창고</b>로 옮기는가.
 *
 * <p>원본 생산입고조회의 열은 일자-No. · <b>생산된공장명</b> · <b>받는창고명</b> ·
 * 품목명[규격] · 수량 · 담당자명이다. 생산불출(창고 → 공장)과 짝을 이루는 반대 방향이다 —
 * 자재는 공장에서 소모되고 완제품은 공장에서 만들어져 창고로 들어간다.
 *
 * <p>우리 생산실적에는 창고가 하나뿐이라 자재도 완제품도 같은 창고에서 오갔다.
 * 그래서 공장으로 불출한 자재가 정작 생산에서는 <b>창고 재고</b>에서 빠졌다.
 *
 * <p>되돌릴 때가 특히 중요하다 — 뺐던 곳(공장)으로 돌려놓지 않고 받는창고로 넣으면
 * 공장 재고가 영영 모자란 채로 남는다.
 */
async function scenarioProductionWarehouses(f) {
  section('■ 생산입고 공장→창고')

  const warehouses = await must('GET', '/warehouses')
  const store = warehouses.find((w) => w.id !== f.warehouse.id)
  eq('옮길 창고가 둘 이상 있다', !!store, true)

  const boms = await must('GET', '/boms')
  const bom = boms.find((b) => b.productId === f.product.id)
  const line = bom.lines[0]
  const per = Number(line.quantity)

  const stockOf = async (itemId, warehouseId) => {
    const rows = await must('GET', '/stock')
    const r = rows.find((x) => x.itemId === itemId && x.warehouseId === warehouseId)
    return r ? Number(r.quantity) : 0
  }

  // 공장(f.warehouse)에 자재를 넣어 둔다.
  await must('POST', '/stock/transactions', {
    itemId: line.componentId, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: per * 2,
  })
  const matBefore = await stockOf(line.componentId, f.warehouse.id)
  const prodBefore = await stockOf(f.product.id, store.id)

  const wo = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: store.id, plannedQty: 2, orderDate: '2026-07-15',
  })
  const made = await must('POST', '/productions', {
    workOrderId: wo.id, producedQty: 2, productionDate: '2026-07-15',
    fromWarehouseId: f.warehouse.id, warehouseId: store.id, note: `${P}생산적요`,
  })

  // 적요는 원본 생산입고현황의 마지막 열이고 생산입고 III 그리드의 마지막 열이다.
  // 판매·구매·생산불출은 이미 다 들고 있는데 생산입고에만 없었다.
  eq('적요가 실린다', made.note, `${P}생산적요`)
  eq('다시 조회해도 적요가 유지된다',
    (await must('GET', '/productions')).find((x) => x.id === made.id).note, `${P}생산적요`)
  eq('생산된공장이 실린다', made.fromWarehouseId, f.warehouse.id)
  eq('받는창고가 실린다', made.warehouseId, store.id)
  // 생산입고 I·II·III·조회 네 화면이 [생산된공장] 칸에 이 이름을 그대로 찍는다.
  // id 만 오면 화면이 창고 목록을 따로 뒤져야 하고, 지운 창고면 빈칸이 된다.
  eq('생산된공장 이름이 실린다', made.fromWarehouseName, f.warehouse.name)
  eq('받는창고 이름이 실린다', made.warehouseName, store.name)
  eq('자재는 공장에서 빠진다', await stockOf(line.componentId, f.warehouse.id), matBefore - per * 2)
  eq('완제품은 받는창고로 들어간다', await stockOf(f.product.id, store.id), prodBefore + 2)

  await must('DELETE', `/productions/${made.id}`)
  eq('지우면 자재가 공장으로 돌아온다', await stockOf(line.componentId, f.warehouse.id), matBefore)
  eq('지우면 완제품이 받는창고에서 빠진다', await stockOf(f.product.id, store.id), prodBefore)

  await must('DELETE', `/work-orders/${wo.id}`)
  await must('POST', '/stock/transactions', {
    itemId: line.componentId, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: per * 2,
  })
}

/**
 * 근태(휴가) 전표의 <b>근태번호</b>.
 *
 * <p>원본 근태조회의 첫 열이 [근태번호] 다. 우리 휴가에는 번호가 없어서 "그 근태 건" 을
 * 지목할 방법이 없었다 — 사원과 일자로 더듬어야 한다. 판매·구매·수금·비용은 이미 다 번호가 있다.
 *
 * <p>채번은 DocumentNoGenerator 로만 한다. count()+1 로 매기면 중간을 지운 뒤 같은 번호가
 * 두 번 나온다 — 비용 전표에서 이미 못 박은 것과 같은 함정이다.
 */
async function scenarioLeaveDocNo() {
  section('■ 근태번호')

  const users = await must('GET', '/users')
  const me = users[0]
  const day = '2097-04-09'
  const mk = (n) => must('POST', '/hr/vacations', {
    userId: me.id, type: '연차', startDate: day, endDate: day, days: 1, reason: `${P}근태번호${n}`,
  })

  const a = await mk(1)
  const b = await mk(2)
  const c = await mk(3)

  eq('근태에 번호가 붙는다', /^AT-\d{8}-\d{4}$/.test(String(a.docNo)), true)
  eq('같은 날은 번호가 이어진다',
    [a.docNo, b.docNo, c.docNo].map((x) => x.slice(-4)).join(','), '0001,0002,0003')
  eq('번호는 겹치지 않는다', new Set([a.docNo, b.docNo, c.docNo]).size, 3)

  // 가운데를 지우고 새로 넣어도 겹치면 안 된다.
  await must('DELETE', `/hr/vacations/${b.id}`)
  const d = await mk(4)
  eq('중간을 지운 뒤에도 번호가 안 겹친다', d.docNo === b.docNo, false)
  eq('지운 다음 번호로 이어진다', d.docNo.slice(-4), '0004')

  // 근태조회 화면이 기대는 칸들
  eq('사원명이 실린다', typeof a.empName, 'string')
  eq('근태코드(휴가종류)가 실린다', a.type, '연차')
  eq('근태수가 실린다', Number(a.days), 1)
  eq('진행상태가 실린다', a.status, 'PENDING')
  // 원본 휴가사용실적현황·근태조회의 [재직구분] 조건이 이 값을 본다.
  // 퇴사자의 사용실적은 정산 대상이라 봐야 하는데, 없어서 걸러 볼 수가 없었다.
  eq('재직 여부가 실린다', a.active, true)

  for (const x of [a, c, d]) await must('DELETE', `/hr/vacations/${x.id}`)
  eq('시험용 근태는 남기지 않는다',
    (await must('GET', '/hr/vacations')).filter((x) => (x.reason ?? '').startsWith(P)).length, 0)
}

/**
 * 공정의 <b>순번</b>과 작업코드 마스터.
 *
 * <p>원본 공정등록의 열은 생산공정코드 · 생산공정명 · <b>순번</b> · <b>작업코드등록</b> 이다.
 *
 * <p>순번이 없으면 공정을 고르는 자리(BOR·작업내역·자원등록)마다 코드순으로만 나온다.
 * 공정은 흐름이라 순서대로 보여야 고르기 쉽다.
 *
 * <p>작업코드는 그 공정 안에서 하는 작업들이다. BOR 의 작업명을 자유입력으로만 두면
 * 같은 작업이 '절단'·'절단작업'·'컷팅' 으로 갈라져 공정별 집계가 어긋난다.
 */
async function scenarioProcessOrderAndOperations() {
  section('■ 공정 순번·작업코드')

  const before = await must('GET', '/processes')
  eq('공정에 순번이 실린다', typeof before[0].sortOrder, 'number')

  const target = before[before.length - 1]
  const body = {
    name: target.name, workcenter: target.workcenter,
    stdTimeMin: target.stdTimeMin, costPerHr: target.costPerHr, active: true,
  }
  await must('PUT', `/processes/${target.id}`, { ...body, sortOrder: -5 })
  const sorted = await must('GET', '/processes')
  eq('순번이 앞서면 목록에서도 앞에 온다', sorted[0].id, target.id)
  await must('PUT', `/processes/${target.id}`, { ...body, sortOrder: target.sortOrder })

  // 작업코드
  for (const o of (await must('GET', '/process-operations')).filter((x) => x.code.startsWith(`${P}OP`))) {
    await call('DELETE', `/process-operations/${o.id}`)
  }
  const op = await must('POST', '/process-operations', {
    processId: before[0].id, code: `${P}OP1`, name: `${P}절단작업`, seq: 1,
  })
  eq('작업코드가 공정에 붙는다', op.processId, before[0].id)
  eq('공정 이름도 실려 나온다', op.processName, before[0].name)

  /*
   * 작업코드는 회사 안에서 유일하다. 같은 코드가 두 공정에 있으면 BOR 에서 코드를 보고도
   * 어느 공정 것인지 알 수 없다.
   */
  const dup = await call('POST', '/process-operations', {
    processId: before[1].id, code: `${P}OP1`, name: `${P}딴작업`, seq: 1,
  })
  eq('같은 작업코드는 다른 공정에도 못 만든다', dup.status, 409)

  // 이름만 고치는 수정은 자기 코드를 중복으로 보지 않는다.
  const renamed = await must('PUT', `/process-operations/${op.id}`, {
    processId: before[0].id, code: `${P}OP1`, name: `${P}절단작업2`, seq: 2,
  })
  eq('자기 코드는 중복이 아니다', renamed.name, `${P}절단작업2`)

  await must('DELETE', `/process-operations/${op.id}`)
  eq('시험용 작업코드는 남기지 않는다',
    (await must('GET', '/process-operations')).filter((x) => x.code.startsWith(`${P}OP`)).length, 0)
}

/**
 * 작업내역의 <b>투입자원</b>과 전용 설비 규칙.
 *
 * <p>원본 작업내역입력 그리드 열은 생산품목코드 · 생산품목명 · 작업품목코드 · 작업품목명 ·
 * 수량 · <b>투입자원</b> · 작업시간 · 적요다. 우리 작업내역에는 공정·작업자·수량·시간만 있어
 * <b>어느 설비로 했는지</b>가 없었다.
 *
 * <p>자원등록에 [대상작업](공정)을 붙여 뒀으니 짝이 맞아야 한다 — 절단기로 검사를 했다고
 * 적히면 "이 공정을 어느 설비로 돌렸나" 가 뜻을 잃는다. 대상작업을 안 정한 범용 설비는
 * 아무 공정에나 쓸 수 있다.
 */
async function scenarioWorkResultResource() {
  section('■ 작업내역 투입자원')

  const procs = await must('GET', '/processes')
  const [cut, , weld] = procs

  for (const r of (await must('GET', '/resources')).filter((x) => x.code.startsWith(`${P}RSC`))) {
    await call('DELETE', `/resources/${r.id}`)
  }

  const dedicated = await must('POST', '/resources', {
    code: `${P}RSC1`, name: `${P}절단기`, type: '설비', processId: cut.id,
  })
  const generic = await must('POST', '/resources', {
    code: `${P}RSC2`, name: `${P}범용설비`, type: '설비',
  })

  const okRow = await must('POST', '/work-results', {
    process: cut.name, resourceId: dedicated.id, worker: 'QA',
    goodQty: 5, defectQty: 0, workTimeMin: 30, workDate: '2026-07-14',
  })
  eq('투입자원이 작업내역에 붙는다', okRow.resourceId, dedicated.id)
  eq('자원 이름도 실려 나온다', okRow.resourceName, `${P}절단기`)

  const wrong = await call('POST', '/work-results', {
    process: weld.name, resourceId: dedicated.id, worker: 'QA',
    goodQty: 5, defectQty: 0, workTimeMin: 30, workDate: '2026-07-14',
  })
  eq('전용 설비를 다른 공정에 쓰면 거부', wrong.status, 400)
  eq('어느 공정 전용인지 말한다',
    /전용/.test(String(wrong.data?.message ?? '')) && String(wrong.data?.message ?? '').includes(cut.name), true)

  const anyProc = await must('POST', '/work-results', {
    process: weld.name, resourceId: generic.id, worker: 'QA',
    goodQty: 1, defectQty: 0, workTimeMin: 5, workDate: '2026-07-14',
  })
  eq('대상작업을 안 정한 자원은 아무 공정에나 쓴다', anyProc.resourceId, generic.id)

  const missing = await call('POST', '/work-results', {
    process: cut.name, resourceId: 99999999, worker: 'QA',
    goodQty: 1, defectQty: 0, workTimeMin: 1, workDate: '2026-07-14',
  })
  // 없는 id 는 404 다. 이 자리만 badRequest 였고 품목·창고·공정은 notFound 였다 —
  // 사용중지 검사를 붙이면서 같은 경로(ResourceService.getUsable)를 쓰게 돼 맞춰졌다.
  eq('없는 자원은 404', missing.status, 404)

  for (const r of [okRow, anyProc]) await must('DELETE', `/work-results/${r.id}`)
  for (const r of [dedicated, generic]) await must('DELETE', `/resources/${r.id}`)
  eq('시험용 자원은 남기지 않는다',
    (await must('GET', '/resources')).filter((x) => x.code.startsWith(`${P}RSC`)).length, 0)
}

/**
 * 생산불출이 <b>재고를 실제로 옮기는가.</b>
 *
 * <p>원본 생산불출입력의 머리는 일자 · 담당자 · <b>보내는창고</b> · <b>받는공장</b> · 생산품목이다.
 * 우리에겐 창고가 하나뿐이라 "어디서 어디로" 가 아니라 "어디서" 만 있었고, 그마저
 * <b>재고를 전혀 움직이지 않았다</b> — 자재를 공장으로 보냈는데 창고에는 그대로 있는 것으로
 * 보였고, 재고현황과 불출현황이 서로 다른 말을 했다.
 */
async function scenarioMaterialIssueMove(f) {
  section('■ 생산불출 창고 이동')

  const warehouses = await must('GET', '/warehouses')
  const to = warehouses.find((w) => w.id !== f.warehouse.id)
  eq('옮길 창고가 둘 이상 있다', !!to, true)

  const stockOf = async (warehouseId) => {
    const rows = await must('GET', '/stock')
    const r = rows.find((x) => x.itemId === f.material.id && x.warehouseId === warehouseId)
    return r ? Number(r.quantity) : 0
  }

  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 50,
  })
  const fromBefore = await stockOf(f.warehouse.id)
  const toBefore = await stockOf(to.id)

  const issue = await must('POST', '/material-issues', {
    itemId: f.material.id, warehouseId: f.warehouse.id, toWarehouseId: to.id,
    qty: 20, issueDate: '2026-07-13', note: `${P} 불출`,
  })
  eq('보내는창고가 실린다', issue.warehouseId, f.warehouse.id)
  eq('받는공장이 실린다', issue.toWarehouseId, to.id)
  eq('보내는창고에서 빠진다', await stockOf(f.warehouse.id), fromBefore - 20)
  eq('받는공장에 들어온다', await stockOf(to.id), toBefore + 20)

  const same = await call('POST', '/material-issues', {
    itemId: f.material.id, warehouseId: f.warehouse.id, toWarehouseId: f.warehouse.id, qty: 1,
  })
  eq('보내는창고와 받는공장이 같으면 거부', same.status, 400)

  // 재고보다 많이 보낼 수 없다 — 받는 쪽만 늘고 보내는 쪽이 음수가 되면 안 된다.
  const over = await call('POST', '/material-issues', {
    itemId: f.material.id, warehouseId: to.id, toWarehouseId: f.warehouse.id,
    qty: (await stockOf(to.id)) + 1,
  })
  eq('재고보다 많이 보내면 거부', over.status, 400)
  eq('거절된 요청은 재고를 건드리지 않는다', await stockOf(to.id), toBefore + 20)

  /*
   * 사용중단한 자재·창고로는 불출할 수 없다.
   *
   * 예전에는 MaterialIssueService 가 inventory 의 리포지토리를 직접 잡고 있어서
   * (CLAUDE.md 4.2 위반) 그 모듈의 규칙을 통째로 건너뛰었다 — 화면 목록에는 안 뜨는
   * 사용중단 자재도 id 만 알면 그대로 불출됐고, 재고까지 실제로 움직였다.
   */
  const itemBody = {
    name: f.material.name, unit: f.material.unit, category: f.material.category,
    unitPrice: f.material.unitPrice, purchasePrice: f.material.purchasePrice,
    safetyStock: f.material.safetyStock,
  }
  await must('PUT', `/items/${f.material.id}`, { ...itemBody, active: false })
  const deadItem = await call('POST', '/material-issues', {
    itemId: f.material.id, warehouseId: f.warehouse.id, toWarehouseId: to.id, qty: 1,
  })
  eq('사용중단한 자재는 불출할 수 없다', deadItem.status, 400)
  eq('무엇이 막혔는지 말한다', /사용중지된 품목/.test(String(deadItem.data?.message ?? '')), true)
  await must('PUT', `/items/${f.material.id}`, { ...itemBody, active: true })
  eq('막힌 요청은 재고를 건드리지 않는다', await stockOf(f.warehouse.id), fromBefore - 20)

  // 창고 등록에는 [사용] 이 없다 — 만들 때는 늘 사용중이고, 내리는 것은 수정이다.
  // (처음엔 POST 에 active:false 를 실었는데 조용히 무시되고 불출이 그대로 됐다.)
  const madeWh = await must('POST', '/warehouses', { code: `${P}DW`, name: `${P}폐쇄창고` })
  const deadWh = await must('PUT', `/warehouses/${madeWh.id}`, {
    name: madeWh.name, active: false,
  })
  eq('창고를 사용중단할 수 있다', deadWh.active, false)
  const toDead = await call('POST', '/material-issues', {
    itemId: f.material.id, warehouseId: f.warehouse.id, toWarehouseId: deadWh.id, qty: 1,
  })
  eq('사용중단한 창고로는 보낼 수 없다', toDead.status, 400)
  eq('무엇이 막혔는지 말한다', /사용중지된 창고/.test(String(toDead.data?.message ?? '')), true)
  await must('DELETE', `/warehouses/${deadWh.id}`)

  eq('불출을 지울 수 있다', (await call('DELETE', `/material-issues/${issue.id}`)).status, 204)
  eq('지우면 보내는창고로 돌아온다', await stockOf(f.warehouse.id), fromBefore)
  eq('지우면 받는공장에서 빠진다', await stockOf(to.id), toBefore)

  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: 50,
  })
}

/**
 * 창고의 <b>구분</b>(창고·공장·외주)과 생산공정·외주거래처.
 *
 * <p>원본 창고등록리스트의 열은 창고코드 · 창고명 · <b>구분</b> · 생산공정명 ·
 * 외주거래처명 · 사용 · 추가사업장명이다. 실제 자료에서 구분이 '창고'/'공장' 으로 갈리고
 * 공장인 곳에는 생산공정이 붙어 있다(반제품제조=반제품공정).
 *
 * <p>우리 창고에는 코드·이름·위치뿐이라 생산이 일어나는 <b>공장</b>과 그냥 쌓아 두는
 * <b>창고</b>를 구분할 수 없었고, 외주처에 나가 있는 자재를 담을 자리도 없었다.
 *
 * <p>공정·거래처는 <b>id 로만</b> 든다. inventory 는 아무 모듈에도 의존하지 않는 기반층이라
 * (CLAUDE.md 4.1) 여기서 production·trade 엔티티를 참조하면 순환이 된다.
 */
async function scenarioWarehouseKind() {
  section('■ 창고 구분·생산공정·외주거래처')

  const procs = await must('GET', '/processes')
  const partners = await must('GET', '/partners')
  const supplier = partners.find((p2) => p2.type !== 'CUSTOMER')

  /*
   * 접두어를 'QA-WHT' 로 잡는다. 픽스처 창고 코드가 'QA-WH' 라서 'QA-WH' 로 걸면
   * <b>픽스처를 지우려 든다</b> — 처음에 그렇게 썼다가 409(생산실적이 쓰는 중)로 막혔고,
   * 막히지 않았더라면 뒤따르는 시나리오가 통째로 무너졌을 자리다.
   */
  const WH = `${P}WHT`
  for (const w of (await must('GET', '/warehouses')).filter((x) => x.code.startsWith(WH))) {
    await call('DELETE', `/warehouses/${w.id}`)
  }

  const plain = await must('POST', '/warehouses', { code: `${WH}1`, name: `${P}보관창고` })
  eq('구분을 안 주면 창고다', plain.kind, '창고')

  const plant = await must('POST', '/warehouses', {
    code: `${WH}2`, name: `${P}완제품제조`, kind: '공장', processId: procs[0].id,
  })
  eq('공장으로 등록된다', plant.kind, '공장')
  eq('공장에 생산공정이 붙는다', plant.processId, procs[0].id)

  const noPartner = await call('POST', '/warehouses', { code: `${WH}3`, name: `${P}외주`, kind: '외주' })
  eq('외주 창고인데 거래처가 없으면 거부', noPartner.status, 400)
  eq('무엇이 없는지 말한다', /외주거래처/.test(String(noPartner.data?.message ?? '')), true)

  const outsourced = await must('POST', '/warehouses', {
    code: `${WH}3`, name: `${P}외주`, kind: '외주', outsourcingPartnerId: supplier.id,
  })
  eq('외주 창고에 거래처가 붙는다', outsourced.outsourcingPartnerId, supplier.id)

  const badKind = await call('POST', '/warehouses', { code: `${WH}4`, name: `${P}이상`, kind: '창고아님' })
  eq('없는 구분은 거부', badKind.status, 400)

  // 구분을 바꾸면 안 맞는 연결은 끊는다 — 창고인데 생산공정이 붙어 있으면 뜻이 없다.
  const changed = await must('PUT', `/warehouses/${plant.id}`, {
    name: plant.name, kind: '창고', processId: procs[0].id, active: true,
  })
  isNull('공장에서 창고로 바꾸면 공정이 떨어진다', changed.processId)

  for (const w of [plain, plant, outsourced]) await call('DELETE', `/warehouses/${w.id}`)
  eq('시험용 창고는 남기지 않는다',
    (await must('GET', '/warehouses')).filter((x) => x.code.startsWith(WH)).length, 0)
}

/**
 * 출하지시서의 <b>배송지</b>와 출하예정일.
 *
 * <p>원본 출하지시서입력의 머리는 일자-No. · 거래처 · 담당자 · 출하창고 · 연락처 ·
 * 출하예정일 · 우편번호 · 주소다. 우리 출하에는 거래처·일자·적요밖에 없어서
 * <b>어디로 보낼지 적을 자리가 없었다</b> — 적요에 손으로 적으면 아무 화면도 그걸
 * 배송지로 알아보지 못한다.
 *
 * <p>출하예정일은 미출하현황의 조건이기도 한데 값이 없어 그 조건으로는 아무것도 못 걸렀다.
 * 그래서 안 주면 <b>출하일자로 채운다</b> — 비워 두면 그 화면에서 통째로 빠진다.
 */
async function scenarioShipmentDelivery(f) {
  section('■ 출하지시서 배송지')

  const line = [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }]

  const bare = await must('POST', '/shipments', {
    partnerId: f.customer.id, shipDate: '2026-07-12', lines: line,
  })
  eq('출하예정일을 안 주면 출하일자로 채운다', bare.dueDate, '2026-07-12')
  eq('배송지 칸이 응답에 있다', 'address' in bare && 'contact' in bare && 'postalCode' in bare, true)

  const full = await must('POST', '/shipments', {
    partnerId: f.customer.id, shipDate: '2026-07-12', dueDate: '2026-07-20',
    warehouseId: f.warehouse.id,
    contact: '010-0000-0000', postalCode: '06236', address: `${P}서울시 강남구`,
    lines: line,
  })
  eq('출하예정일이 따로 잡힌다', full.dueDate, '2026-07-20')
  eq('출하창고가 붙는다', full.warehouseId, f.warehouse.id)
  eq('연락처가 남는다', full.contact, '010-0000-0000')
  eq('우편번호가 남는다', full.postalCode, '06236')
  eq('배송지 주소가 남는다', full.address, `${P}서울시 강남구`)

  // 다시 읽어도 남아 있어야 한다 — 저장은 됐는데 목록이 안 실어 주면 화면에서 사라진다.
  const reread = (await must('GET', '/shipments')).find((x) => x.id === full.id)
  eq('목록에도 배송지가 실린다', reread.address, `${P}서울시 강남구`)
  eq('목록에도 출하예정일이 실린다', reread.dueDate, '2026-07-20')

  await must('DELETE', `/shipments/${full.id}`)
  await must('DELETE', `/shipments/${bare.id}`)
  eq('시험용 출하는 남기지 않는다',
    (await must('GET', '/shipments')).filter((x) => (x.address ?? '').startsWith(P)).length, 0)
}

/**
 * 작업지시서작업처리가 기대는 것 — <b>공정별 진행</b>과 직전작업 잔량.
 *
 * <p>원본 조건에 [잔량기준] 직전작업이 있다. <b>앞 공정이 끝낸 만큼만</b> 다음 공정을 할 수
 * 있다는 뜻이다. 이걸 안 보면 조립을 하나도 안 했는데 검사를 100개 했다고 적을 수 있다.
 *
 * <p>화면이 그걸 세려면 작업내역이 <b>어느 작업지시의 어느 공정</b>인지 실어 와야 한다.
 * processId 가 null 로 오면(마스터에 없는 자유입력 공정) 그 줄은 어느 공정도 못 채운다.
 */
async function scenarioWorkProcess(f) {
  section('■ 작업지시서작업처리 근거')

  for (const o of (await must('GET', '/bor')).filter((x) => x.productId === f.product.id)) {
    await call('DELETE', `/bor/${o.id}`)
  }
  const procs = await must('GET', '/processes')
  const ops = []
  for (const [i, pc] of [procs[0], procs[1], procs[2]].entries()) {
    ops.push(await must('POST', '/bor', {
      productId: f.product.id, processId: pc.id, seq: 60 + i,
      workName: `${P}공정${i}`, baseQty: 1, workHours: 0.1,
    }))
  }

  const wo = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: 100, orderDate: '2026-07-11',
  })

  /** 그 작업지시의 공정별 완료 수량. 화면이 이 셈으로 미작업량을 낸다. */
  const doneOf = async () => {
    const rows = (await must('GET', '/work-results')).filter((r) => r.workOrderId === wo.id)
    const m = new Map()
    for (const r of rows) {
      if (r.processId == null) continue
      m.set(r.processId, (m.get(r.processId) ?? 0) + Number(r.goodQty) + Number(r.defectQty))
    }
    return m
  }
  /** 직전작업 기준 미작업량. 첫 공정의 상한은 지시수량이다. */
  const remainOf = (done) => {
    let prev = Number(wo.plannedQty)
    return ops.map((o) => {
      const d = done.get(o.processId) ?? 0
      const r = Math.max(0, Math.min(Number(wo.plannedQty) - d, prev - d))
      prev = d
      return r
    })
  }

  eq('처음엔 첫 공정만 열린다', remainOf(await doneOf()).join(','), '100,0,0')

  const first = await must('POST', '/work-results', {
    workOrderId: wo.id, process: procs[0].name, goodQty: 40, defectQty: 0,
    workTimeMin: 60, workDate: '2026-07-11',
  })
  eq('작업내역이 작업지시를 가리킨다', first.workOrderId, wo.id)
  eq('마스터에 있는 공정이면 processId 가 채워진다', first.processId, procs[0].id)

  // 작업내역현황의 [표준작업시간]·[차이(표준-실제)] 는 BOR 이 근거다.
  // 위 ops 는 1개당 0.1H = 6분이므로 40개면 240분이다.
  eq('생산품목이 실린다', first.productId, f.product.id)
  eq('BOR 로 표준작업시간이 나온다', first.standardTimeMin, 240)

  eq('앞 공정이 40 끝나면 다음 공정도 40 까지만 열린다',
    remainOf(await doneOf()).join(','), '60,40,0')

  // 불량도 '한 것' 이다 — 양품만 세면 불량 낸 만큼 다음 공정이 영영 안 열린다.
  await must('POST', '/work-results', {
    workOrderId: wo.id, process: procs[1].name, goodQty: 30, defectQty: 10,
    workTimeMin: 40, workDate: '2026-07-11',
  })
  eq('불량도 진행에 포함된다', remainOf(await doneOf()).join(','), '60,0,40')

  // 불량도 만드느라 시간을 쓴 것이다. 양품만 세면 불량이 많은 날일수록
  // '표준보다 오래 걸림' 으로 부풀려진다 — 30+10 = 40 개 기준 240분.
  const withDefect = (await must('GET', '/work-results'))
    .find((r) => r.workOrderId === wo.id && r.processId === procs[1].id)
  eq('불량까지 세어 표준시간을 잡는다', withDefect.standardTimeMin, 240)

  // 라우팅에 없는 공정은 표준을 말할 수 없다. 0 을 주면 그 줄이 전부
  // '표준보다 오래 걸림' 이 되어, 라우팅을 안 세운 품목이 통째로 불리하게 보인다.
  const noRouting = await must('POST', '/work-results', {
    workOrderId: wo.id, process: procs[3].name, goodQty: 5, defectQty: 0,
    workTimeMin: 10, workDate: '2026-07-11',
  })
  isNull('라우팅에 없는 공정은 표준시간이 null', noRouting.standardTimeMin)

  for (const r of (await must('GET', '/work-results')).filter((x) => x.workOrderId === wo.id)) {
    await must('DELETE', `/work-results/${r.id}`)
  }
  await must('DELETE', `/work-orders/${wo.id}`)
  for (const o of ops) await must('DELETE', `/bor/${o.id}`)
  eq('시험용 자료는 남기지 않는다',
    (await must('GET', '/bor')).filter((x) => x.productId === f.product.id).length, 0)
}

/**
 * 자원(설비)의 <b>위치</b>와 <b>대상작업</b>.
 *
 * <p>원본 자원등록의 열은 자원코드 · 자원명 · 위치 · 대상작업이다
 * (사본 열 id MT0_WH = 창고, MT0_JOB = 작업). 우리 자원에는 구분·가용능력·단위·시간당비용만
 * 있어서, 설비를 등록해도 어디 있는지도 무슨 작업에 쓰는지도 알 수 없었다.
 *
 * <p>둘 다 <b>비울 수 있어야</b> 한다 — 자리를 안 정한 설비도, 작업을 아직 안 맡긴 설비도 있다.
 * 대신 없는 공정 id 를 주면 조용히 무시하지 않고 알린다.
 */
async function scenarioResourceLocation() {
  section('■ 자원 위치·대상작업')

  const warehouses = await must('GET', '/warehouses')
  const processes = await must('GET', '/processes')

  for (const r of (await must('GET', '/resources')).filter((x) => x.code === `${P}RES`)) {
    await call('DELETE', `/resources/${r.id}`)
  }

  const made = await must('POST', '/resources', {
    code: `${P}RES`, name: `${P}절단기`, type: '설비', capacity: 8, unit: '시간/일', costPerHr: 15000,
    warehouseId: warehouses[0].id, processId: processes[0].id,
  })
  eq('위치가 붙는다', made.warehouseName, warehouses[0].name)
  eq('대상작업이 붙는다', made.processName, processes[0].name)

  const body = {
    name: made.name, type: made.type, capacity: made.capacity, unit: made.unit,
    costPerHr: made.costPerHr, active: true,
  }
  const cleared = await must('PUT', `/resources/${made.id}`, { ...body, warehouseId: null, processId: null })
  isNull('위치를 비울 수 있다', cleared.warehouseId)
  isNull('대상작업도 비울 수 있다', cleared.processId)

  // 없는 id 는 404 다. 예전에는 이 자리만 400 을 냈는데, 사용중지 검사를 붙이면서
  // 품목·창고와 같은 경로(ProcessService.getUsable)를 쓰게 돼 응답이 맞춰졌다.
  // 400 은 '요청이 잘못됐다', 404 는 '그런 것이 없다' 다 — 후자가 맞다.
  const bad = await call('PUT', `/resources/${made.id}`, { ...body, processId: 99999999 })
  eq('없는 공정은 404', bad.status, 404)
  eq('무엇이 없는지 말한다', /공정/.test(String(bad.data?.message ?? '')), true)

  // 원본 자원등록의 버튼은 [삭제]가 아니라 <b>사용중단/재사용</b>이다.
  // 설비를 지우면 그 설비로 적어 둔 작업내역이 어느 설비였는지 잃는다.
  const stopped = await must('PUT', `/resources/${made.id}`, { ...body, active: false })
  eq('사용중단할 수 있다', stopped.active, false)
  eq('사용중단해도 목록에는 남는다',
    (await must('GET', '/resources')).some((x) => x.id === made.id), true)
  const revived = await must('PUT', `/resources/${made.id}`, { ...body, active: true })
  eq('되살릴 수 있다', revived.active, true)

  await must('DELETE', `/resources/${made.id}`)
  eq('시험용 자원은 남기지 않는다',
    (await must('GET', '/resources')).filter((x) => x.code === `${P}RES`).length, 0)
}

/**
 * 일괄회계반영의 <b>거래처별</b> 묶음과 '일부반영'.
 *
 * <p>원본 판매일괄회계반영의 [구분] 은 거래처별 · 전표별 둘이고, 결과에 <b>일부반영</b>
 * 열이 있다. 우리는 전표별 하나뿐이라 월말에 거래처별로 묶어 반영하는 흐름이 없었다 —
 * 전표가 수십 장이면 체크를 수십 번 해야 한다.
 *
 * <p>화면은 목록을 거래처로 묶어 세지만, 그 셈이 맞으려면 응답이 거래처와 반영여부를
 * 줄마다 정확히 실어야 한다. 특히 <b>일부만 반영된 거래처</b>가 구분되지 않으면
 * "이 거래처는 끝냈다" 고 착각한다.
 */
async function scenarioAccountingReflectionByPartner(f) {
  section('■ 일괄회계반영 거래처별')

  const made = []
  for (let i = 0; i < 3; i++) {
    made.push(await must('POST', '/sales', {
      saleDate: `2026-06-1${4 + i}`, partnerId: f.customer.id, warehouseId: f.warehouse.id, taxable: true,
      lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 10000 * (i + 1) }],
    }))
  }
  const ids = made.map((d) => d.id)
  const mineOf = async () => (await must('GET', '/accounting-reflection?kind=SALES'))
    .filter((s) => ids.includes(s.id))

  const before = await mineOf()
  eq('세 장이 다 미반영으로 잡힌다', before.filter((s) => !s.reflected).length, 3)
  eq('거래처가 줄마다 실린다', new Set(before.map((s) => s.partnerId)).size, 1)
  eq('거래처별 공급가액 합', before.reduce((n, s) => n + Number(s.supplyAmount), 0), 60000)

  // 한 장만 반영 → 그 거래처는 '일부반영' 이다.
  await must('POST', '/accounting-reflection/reflect', { kind: 'SALES', ids: [ids[0]] })
  const mid = await mineOf()
  const reflected = mid.filter((s) => s.reflected).length
  const unreflected = mid.length - reflected
  eq('한 장만 반영된다', reflected, 1)
  eq('나머지는 미반영으로 남는다', unreflected, 2)
  eq('일부반영으로 갈린다', reflected > 0 && unreflected > 0, true)

  // 남은 것을 한 번에 반영하면 그 거래처는 끝난다.
  await must('POST', '/accounting-reflection/reflect', {
    kind: 'SALES', ids: mid.filter((s) => !s.reflected).map((s) => s.id),
  })
  const done = await mineOf()
  eq('묶어서 반영하면 남는 것이 없다', done.filter((s) => !s.reflected).length, 0)

  // 회계반영된 전표는 지울 수 없다 — 반영을 먼저 되돌린다.
  const blocked = await call('DELETE', `/sales/${ids[0]}`)
  eq('반영된 전표는 삭제가 막힌다', blocked.status, 400)

  await must('POST', '/accounting-reflection/unreflect', { kind: 'SALES', ids })
  for (const id of ids) await must('DELETE', `/sales/${id}`)
  eq('시험용 전표는 남기지 않는다', (await mineOf()).length, 0)
}

/**
 * 전표 <b>라인</b>에 추가항목을 붙일 수 있는가.
 *
 * <p>원본 판매입력II 그리드에는 ADD_TXT_01~06 · ADD_NUM_01~05 · ADD_LTXT_01 ·
 * ADD_DATE_01~03 · ADD_CD_01~03 같은 <b>라인 추가항목 열</b>이 있다. 우리 추가항목은
 * 전표 <b>머리</b>에만 붙어서 줄마다 다른 값(차수·납품처 같은 것)을 적을 자리가 없었다.
 *
 * <p>붙이려면 먼저 <b>라인을 지목할 키</b>가 있어야 하는데, 판매·구매 라인 응답에
 * 라인 id 가 없었다(수주는 예전부터 준다). 키가 없으면 라인 단위로 아무것도 못 붙인다.
 */
async function scenarioLineCustomFields(f) {
  section('■ 전표 라인 추가항목')

  const doc = await must('POST', '/sales', {
    saleDate: '2026-06-13', partnerId: f.customer.id, warehouseId: f.warehouse.id, taxable: true,
    lines: [
      { itemId: f.product.id, quantity: 1, unitPrice: 1000 },
      { itemId: f.product.id, quantity: 2, unitPrice: 2000 },
    ],
  })
  eq('판매 라인에 라인 id 가 실린다', typeof doc.lines[0].lineId, 'number')
  eq('줄마다 다른 id 다', doc.lines[0].lineId === doc.lines[1].lineId, false)

  const buy = await must('POST', '/purchases', {
    purchaseDate: '2026-06-13', partnerId: f.supplier.id, warehouseId: f.warehouse.id,
    lines: [{ itemId: f.material.id, quantity: 1, unitPrice: 500 }],
  })
  eq('구매 라인에도 라인 id 가 실린다', typeof buy.lines[0].lineId, 'number')

  // 라인 추가항목 정의 — entityType 은 전표 것 뒤에 _LINE 을 붙인다.
  const def = await must('POST', '/custom-fields/defs', {
    entityType: 'SALES_LINE', fieldKey: `${P.toLowerCase()}lot_seq`, label: '차수',
    fieldType: 'TEXT', sortOrder: 1,
  })
  eq('라인용 정의를 만들 수 있다', def.entityType, 'SALES_LINE')

  const lineId = doc.lines[0].lineId
  const saved = await must('PUT',
    `/custom-fields/values?entityType=SALES_LINE&entityId=${lineId}`,
    { values: { [def.fieldKey]: '2차' } })
  eq('라인에 값이 붙는다', saved.values[def.fieldKey], '2차')
  eq('다시 읽어도 남아 있다',
    (await must('GET', `/custom-fields/values?entityType=SALES_LINE&entityId=${lineId}`)).values[def.fieldKey], '2차')

  // 같은 전표의 다른 줄은 영향을 받지 않는다 — 줄마다 다른 값을 적는 것이 이 기능의 요점이다.
  const other = await must('GET',
    `/custom-fields/values?entityType=SALES_LINE&entityId=${doc.lines[1].lineId}`)
  eq('다른 줄은 비어 있다', Object.keys(other.values ?? {}).length, 0)

  // 전표 머리의 추가항목과도 섞이지 않는다.
  const head = await must('GET', `/custom-fields/values?entityType=SALES&entityId=${doc.id}`)
  eq('머리 추가항목과 섞이지 않는다', Object.keys(head.values ?? {}).length, 0)

  await must('PUT', `/custom-fields/values?entityType=SALES_LINE&entityId=${lineId}`, { values: {} })
  await must('DELETE', `/custom-fields/defs/${def.id}`)
  await must('DELETE', `/purchases/${buy.id}`)
  await must('DELETE', `/sales/${doc.id}`)
  eq('시험용 정의는 남기지 않는다',
    (await must('GET', '/custom-fields/defs?entityType=SALES_LINE')).length, 0)
}

/**
 * 소요시간계산이 기대는 것 — 품목 라우팅의 <b>1개당 시간 합</b>.
 *
 * <p>원본 소요시간계산은 생산품목과 수량을 넣고 [계산(F8)] 하면 시간을 돌려준다.
 * 우리 화면은 공정마다 수량을 넣는 계산기였다 — "이 제품 100개를 만들면 몇 시간" 이 아니라
 * "절단 공정에 100개를 태우면 몇 분" 을 묻는 셈이라, 정작 제품 기준 시간은 사람이
 * 공정을 하나씩 골라 더해야 했다.
 *
 * <p>BOR 이 생겨 품목 하나로 답이 나온다. 그 답이 성립하려면 <b>같은 품목의 작업들이
 * 순서대로, 1개당 시간으로 환산돼</b> 와야 한다. 환산을 빠뜨리면 로트 배수만큼 틀린다.
 */
async function scenarioTimeCalc(f) {
  section('■ 소요시간계산 근거')

  for (const o of (await must('GET', '/bor')).filter((x) => x.productId === f.product.id)) {
    await call('DELETE', `/bor/${o.id}`)
  }
  const procs = await must('GET', '/processes')

  // 10개 기준 0.5H, 10개 기준 1.25H, 1개 기준 0.2H → 1개당 0.05 + 0.125 + 0.2 = 0.375H
  const specs = [[procs[0], 10, 0.5], [procs[1], 10, 1.25], [procs[2], 1, 0.2]]
  const ops = []
  for (const [i, spec] of specs.entries()) {
    const [pc, base, hours] = spec
    ops.push(await must('POST', '/bor', {
      productId: f.product.id, processId: pc.id, seq: 70 + i,
      workName: `${P}소요${i}`, baseQty: base, workHours: hours,
    }))
  }

  const mine = (await must('GET', '/bor')).filter((x) => x.productId === f.product.id)
  eq('같은 품목의 작업이 모두 온다', mine.length, 3)
  eq('작업순서대로 온다', mine.map((x) => x.seq).join(','), '70,71,72')

  const perUnit = mine.reduce((n, x) => n + Number(x.hoursPerUnit), 0)
  eq('1개당 시간 합', Math.round(perUnit * 10000) / 10000, 0.375)

  // 화면은 (수량 + 추가수량) 을 곱한다. 곱셈 자체가 아니라 '환산이 됐는지' 가 요점이다.
  eq('100개면 37.5시간', Math.round(perUnit * 100 * 100) / 100, 37.5)
  eq('추가수량 5를 더하면 105개분', Math.round(perUnit * 105 * 100) / 100, 39.38)

  for (const o of ops) await must('DELETE', `/bor/${o.id}`)
  eq('시험용 라우팅은 남기지 않는다',
    (await must('GET', '/bor')).filter((x) => x.productId === f.product.id).length, 0)
}

/**
 * 비용 전표번호.
 *
 * <p>원본 비용내역현황의 첫 열이 [일자-No.] 다. 비용도 전표인데 우리에겐 번호가 없어서
 * "그 비용 건" 을 지목할 방법이 없었다 — 증빙을 붙이거나 회계반영을 되짚을 때 일자와
 * 금액으로 더듬는 수밖에 없다. 판매·구매·수금·은행거래·카드사용은 이미 다 번호가 있다.
 *
 * <p>채번은 DocumentNoGenerator 로만 한다. count()+1 로 매기면 <b>중간을 지운 뒤</b>
 * 같은 번호가 두 번 나온다 — 다른 전표에서 이미 겪은 일이라 여기서도 못 박는다.
 */
async function scenarioExpenseDocNo() {
  section('■ 비용 전표번호')

  const accounts = await must('GET', '/accounts')
  const account = accounts[0]
  const date = '2098-03-14'
  const mk = (n) => must('POST', '/expenses', {
    expenseDate: date, accountId: account.id, content: `${P}채번${n}`,
    amount: 1000 + n, paymentMethod: '현금', department: 'QA',
  })

  const a = await mk(1)
  const b = await mk(2)
  const c = await mk(3)

  eq('비용에 전표번호가 붙는다', /^EX-\d{8}-\d{4}$/.test(String(a.docNo)), true)
  eq('같은 날은 번호가 이어진다', [a.docNo, b.docNo, c.docNo].map((x) => x.slice(-4)).join(','), '0001,0002,0003')
  eq('전표번호는 겹치지 않는다', new Set([a.docNo, b.docNo, c.docNo]).size, 3)
  eq('원본 [비용그룹명] 자리에 넣을 값이 있다', 'accountGroupName' in a, true)

  // 가운데를 지우고 새로 넣어도 번호가 겹치면 안 된다(count()+1 이면 여기서 겹친다).
  await must('DELETE', `/expenses/${b.id}`)
  const d = await mk(4)
  eq('중간을 지운 뒤에도 번호가 겹치지 않는다', d.docNo === b.docNo, false)
  eq('지운 다음 번호로 이어진다', d.docNo.slice(-4), '0004')

  for (const x of [a, c, d]) await must('DELETE', `/expenses/${x.id}`)
  eq('시험용 비용은 남기지 않는다',
    (await must('GET', '/expenses')).filter((x) => (x.content ?? '').startsWith(P)).length, 0)
}

/**
 * 거래명세서의 <b>미수금집계</b>가 기준일 시점을 보는가.
 *
 * <p>원본 거래명세서인쇄의 [기타] 조건에 미수금집계가 있다. 거래명세서는 대개
 * "지난 미수 + 이번 거래" 를 함께 찍어 보내는 문서라 이 값이 핵심이다.
 *
 * <p>미수금은 반드시 <b>기준일자 끝</b> 시점이어야 한다. 지금 시점으로 잡으면 지난달
 * 명세서를 다시 뽑을 때 그 뒤에 들어온 수금까지 빠져 숫자가 달라진다 — 같은 명세서를
 * 두 번 뽑았는데 미수금이 다르면 받는 쪽이 믿지 않는다.
 */
async function scenarioStatementReceivable(f) {
  section('■ 거래명세서 미수금집계')

  const day = '2026-06-12'
  const later = '2026-06-20'

  const sale = await must('POST', '/sales', {
    saleDate: day, partnerId: f.customer.id, warehouseId: f.warehouse.id, taxable: true,
    lines: [{ itemId: f.product.id, quantity: 2, unitPrice: 10000 }],
  })

  const at = async (asOf) => {
    const rows = await must('GET', `/ledger/partner-balances?asOf=${asOf}`)
    const mine = rows.find((r) => r.partnerId === f.customer.id)
    return Number(mine?.receivable ?? 0)
  }

  const afterSale = await at(day)
  eq('판매하면 그날 채권이 는다', afterSale >= Number(sale.totalAmount), true)

  // 판매 전날에는 이 판매가 잡히면 안 된다.
  const before = await at('2026-06-11')
  eq('기준일 이전에는 이 판매가 안 잡힌다', afterSale - before, Number(sale.totalAmount))

  // 나중에 수금하면 '그날' 잔액은 그대로여야 한다 — 여기가 틀리면 지난 명세서가 바뀐다.
  const receipt = await must('POST', '/settlements', {
    type: 'RECEIPT', partnerId: f.customer.id, amount: Number(sale.totalAmount),
    method: '현금', settleDate: later, note: `${P} 나중수금`,
  })
  eq('나중 수금은 그날 잔액을 바꾸지 않는다', await at(day), afterSale)
  eq('수금일 이후에는 잔액이 준다', await at(later), afterSale - Number(sale.totalAmount))

  await must('DELETE', `/settlements/${receipt.id}`)
  await must('DELETE', `/sales/${sale.id}`)
  eq('시험용 전표는 남기지 않는다', await at(later), before)
}

/**
 * 결제내역자료비교가 기대는 자료.
 *
 * <p>원본은 <b>[결제내역] 과 [판매전표II]</b> 를 좌우로 놓고 차이를 본다.
 * 우리 화면은 "장부금액 대 통장금액" 을 비교했는데, 통장금액을 <b>결제수단 문자열로
 * 추정</b>했다 — 계좌이체·카드면 통장에서 확인된 것으로 치고 현금·어음이면 0 으로 쳤다.
 * 은행 자료를 읽은 것이 아니라 글자만 보고 지어낸 값이라 현금 수금은 전부 '불일치' 였다.
 *
 * <p>이제 판매전표 금액과 결제(수금) 금액을 맞댄다. 둘 다 실제로 가진 자료다.
 * 이 시나리오는 그 두 자료가 화면이 기대는 모양으로 오는지, 그리고 결제수단과 무관하게
 * 금액만으로 대사되는지를 본다.
 */
async function scenarioPaymentCompare(f) {
  section('■ 결제내역자료비교')

  const day = '2026-06-11'
  const sale = await must('POST', '/sales', {
    saleDate: day, partnerId: f.customer.id, warehouseId: f.warehouse.id, taxable: true,
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 10000 }],
  })
  eq('판매전표에 대사에 쓸 금액이 다 있다',
    typeof sale.supplyAmount === 'number' && typeof sale.vatAmount === 'number'
      && typeof sale.totalAmount === 'number', true)
  eq('합계 = 공급가액 + 부가세', Number(sale.totalAmount),
    Number(sale.supplyAmount) + Number(sale.vatAmount))

  // 현금으로 전액 수금 — 예전 화면이라면 통장금액 0 이라 불일치로 찍혔을 자리다.
  const receipt = await must('POST', '/settlements', {
    type: 'RECEIPT', partnerId: f.customer.id, amount: Number(sale.totalAmount),
    method: '현금', settleDate: day, note: `${P} 대사`,
  })
  eq('수금에 일자·거래처·금액이 실린다',
    typeof receipt.settleDate === 'string' && typeof receipt.amount === 'number'
      && typeof receipt.partnerName === 'string', true)
  eq('수금과 지급을 구분할 수 있다', receipt.typeName, '수금')

  const settlements = await must('GET', '/settlements')
  const sales = await must('GET', '/sales')
  const saleSum = sales
    .filter((x) => x.saleDate === day && x.partnerName === receipt.partnerName)
    .reduce((n, x) => n + Number(x.totalAmount), 0)
  const paySum = settlements
    .filter((x) => x.settleDate === day && x.typeName === '수금' && x.partnerName === receipt.partnerName)
    .reduce((n, x) => n + Number(x.amount), 0)
  eq('현금이어도 금액이 같으면 일치', Math.abs(saleSum - paySum) < 0.005, true)

  // 지급은 판매와 맞댈 것이 아니다 — 섞이면 차이가 엉뚱해진다.
  const payment = await must('POST', '/settlements', {
    type: 'PAYMENT', partnerId: f.supplier.id, amount: 5000,
    method: '계좌이체', settleDate: day, note: `${P} 지급`,
  })
  eq('지급은 수금이 아니다', payment.typeName, '지급')
  const paySumAfter = (await must('GET', '/settlements'))
    .filter((x) => x.settleDate === day && x.typeName === '수금' && x.partnerName === receipt.partnerName)
    .reduce((n, x) => n + Number(x.amount), 0)
  eq('지급을 넣어도 수금 합계는 그대로', paySumAfter, paySum)

  await must('DELETE', `/settlements/${payment.id}`)
  await must('DELETE', `/settlements/${receipt.id}`)
  await must('DELETE', `/sales/${sale.id}`)
  eq('시험용 전표는 남기지 않는다',
    (await must('GET', '/settlements')).filter((x) => (x.note ?? '').startsWith(P)).length, 0)
}

/**
 * 오더관리 — 유형의 <b>단계 순서</b>와 오더의 진행.
 *
 * <p>원본 오더관리유형리스트의 열은 유형코드 · 유형명 · [1단계]~[10단계] · 사용구분 ·
 * 입력메뉴에서 사용 · 담당자다. 유형은 <b>그 오더가 밟아 갈 순서</b>를 담는 템플릿이고,
 * 오더관리진행단계 화면은 실제 오더가 지금 어디까지 갔나를 보여 준다.
 *
 * <p>우리 유형에는 단계가 없었고, 수주(SalesOrder)는 유형·단계를 엔티티에 들고 있으면서도
 * <b>응답에 안 실어</b> 아무도 못 봤다. 그래서 진행단계 화면은 단계 마스터만 나열했다.
 */
async function scenarioOrderStages(f) {
  section('■ 오더관리 유형·진행단계')

  const stages = await must('GET', '/order-stages')
  eq('진행단계 마스터가 있다', stages.length >= 3, true)

  const type = await must('POST', '/order-types', {
    code: `${P}OT`, name: `${P}시험유형`,
    stageIds: [stages[0].id, stages[1].id, stages[2].id],
    useInInput: true, manager: 'QA담당',
  })
  eq('유형에 단계가 순서대로 붙는다', type.steps.map((s) => s.seq).join(','), '1,2,3')
  eq('첫 단계가 맞다', type.steps[0].stageName, stages[0].name)
  eq('담당자도 저장된다', type.manager, 'QA담당')
  eq('입력메뉴에서 사용도 저장된다', type.useInInput, true)

  const dup = await call('PUT', `/order-types/${type.id}`, {
    name: type.name, stageIds: [stages[0].id, stages[0].id], active: true,
  })
  eq('같은 단계를 두 번 넣으면 거부', dup.status, 400)

  const tooMany = await call('PUT', `/order-types/${type.id}`, {
    name: type.name, stageIds: Array.from({ length: 11 }, (_, i) => stages[i % stages.length].id), active: true,
  })
  eq('11단계 이상은 거부(원본이 10단계까지)', tooMany.status, 400)

  // 단계를 안 주는 수정은 단계를 건드리지 않는다.
  const renamed = await must('PUT', `/order-types/${type.id}`, { name: `${P}시험유형2`, active: true })
  eq('이름만 고치면 단계는 그대로', renamed.steps.length, 3)

  /*
   * 단계가 <b>이미 있는</b> 유형을 다시 저장할 수 있나.
   *
   * <p>(order_type_id, seq) 에 유니크 인덱스가 있는데 단계를 갈아 끼울 때 delete 를
   * 영속성 컨텍스트가 미뤄 두는 바람에, 같은 seq 의 insert 가 먼저 나가 409 로 막혔다.
   * 화면에서 <b>단계를 한 번 정하고 나면 다시 못 고쳤다</b>. 사용중단/재사용도 단계를
   * 함께 보내므로 같이 막혔다.
   */
  const resaved = await call('PUT', `/order-types/${type.id}`, {
    name: `${P}시험유형2`, stageIds: [stages[0].id, stages[1].id, stages[2].id], active: true,
  })
  eq('단계가 있는 유형을 같은 단계로 다시 저장해도 된다', resaved.status, 200)
  eq('다시 저장해도 단계가 그대로다', resaved.data?.steps?.length, 3)

  const swapped = await must('PUT', `/order-types/${type.id}`, {
    name: `${P}시험유형2`, stageIds: [stages[1].id, stages[0].id], active: true,
  })
  eq('단계를 바꿔 끼우면 순서도 바뀐다', swapped.steps.map((s) => s.stageName).join(','),
    `${stages[1].name},${stages[0].name}`)

  const off = await must('PUT', `/order-types/${type.id}`, {
    name: `${P}시험유형2`, stageIds: swapped.steps.map((s) => s.stageId),
    useInInput: swapped.useInInput, manager: swapped.manager, active: false,
  })
  eq('사용중단해도 단계가 남는다', off.steps.length, 2)
  eq('사용중단이 실제로 걸린다', off.active, false)
  await must('PUT', `/order-types/${type.id}`, {
    name: `${P}시험유형2`, stageIds: [stages[0].id, stages[1].id, stages[2].id], active: true,
  })

  // ── 오더(수주)의 진행
  const order = await must('POST', '/sales-orders', {
    partnerId: f.customer.id, orderDate: '2026-07-20',
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }],
  })
  eq('수주 응답에 유형·단계 칸이 있다',
    'orderTypeId' in order && 'stageId' in order, true)
  isNull('처음에는 유형이 없다', order.orderTypeId)

  const noType = await call('PATCH', `/sales-orders/${order.id}/stage`)
  eq('유형 없이 다음 단계로는 못 간다', noType.status, 400)
  eq('유형을 먼저 정하라고 말한다', /오더유형/.test(String(noType.data?.message ?? '')), true)

  const typed = await must('PATCH', `/sales-orders/${order.id}/stage?orderTypeId=${type.id}`)
  eq('유형을 지정하면 첫 단계로 들어간다', typed.stageName, stages[0].name)

  const next = await must('PATCH', `/sales-orders/${order.id}/stage`)
  eq('다음 단계로 한 칸 나아간다', next.stageName, stages[1].name)

  const done = await must('PATCH', `/sales-orders/${order.id}/stage?complete=true`)
  eq('전체단계완료는 마지막 단계로', done.stageName, stages[2].name)

  const past = await call('PATCH', `/sales-orders/${order.id}/stage`)
  eq('마지막에서 더 가려 하면 거부', past.status, 400)

  // 뒷정리
  await must('DELETE', `/sales-orders/${order.id}`)
  await must('DELETE', `/order-types/${type.id}`)
  eq('시험용 유형은 남기지 않는다',
    (await must('GET', '/order-types')).filter((t) => t.code === `${P}OT`).length, 0)
}

/**
 * 노무비/경비등록 → <b>실제원가 계산</b>.
 *
 * <p>원본도 [표준원가생성] 과 [생성](원가계산)이 다른 버튼이다. 표준은 BOM·BOR 대로
 * "들었어야 할" 값이고, 실제는 그 달 생산실적과 노무비/경비등록의 실제 발생액에서 나온다.
 * 우리는 표준만 있었고 실제원가는 사람이 손으로 넣어야 했다 — 그래서 차이분석의
 * 노무비·경비 차이가 늘 0 이었다.
 *
 * <p>배부는 <b>표준 작업시간 비율</b>로 한다. 실제 작업시간으로 하면 작업내역을 안 적은
 * 생산이 배부에서 통째로 빠지고, 남은 품목이 경비를 다 뒤집어쓴다.
 */
async function scenarioActualCost(f) {
  section('■ 노무비/경비등록 → 실제원가')

  const period = '2098-05'
  const day = `${period}-15`

  // 이전 실행 잔재를 치운다.
  for (const c of (await must('GET', '/costs')).filter((x) => x.period === period)) {
    await call('DELETE', `/costs/${c.id}`)
  }
  for (const e of await must('GET', `/process-expenses?period=${period}`)) {
    await call('DELETE', `/process-expenses/${e.id}`)
  }
  for (const o of (await must('GET', '/bor')).filter((x) => x.productId === f.product.id)) {
    await call('DELETE', `/bor/${o.id}`)
  }

  const procs = await must('GET', '/processes')
  const op = await must('POST', '/bor', {
    productId: f.product.id, processId: procs[0].id, seq: 80,
    workName: `${P}실제원가시험`, baseQty: 1, workHours: 2,
  })

  // 그 달 생산실적을 하나 만든다(자재는 BOM 대로 자동 소모).
  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 20,
  })
  const wo = await must('POST', '/work-orders', {
    productId: f.product.id, warehouseId: f.warehouse.id, plannedQty: 5, orderDate: day,
  })
  const prod = await must('POST', '/productions', {
    workOrderId: wo.id, producedQty: 5, productionDate: day,
  })

  // 사전작업: 그 공정에 노무비 500,000 · 경비 200,000
  const exp = await must('POST', '/process-expenses', {
    period, processId: procs[0].id, laborCost: 500000, overheadCost: 200000,
  })
  eq('노무비/경비를 등록할 수 있다', Number(exp.overheadCost), 200000)
  eq('창고를 안 주면 전사 공통', exp.warehouseId, null)

  const dup = await call('POST', '/process-expenses', {
    period, processId: procs[0].id, laborCost: 1, overheadCost: 1,
  })
  eq('같은 달·공정·창고는 한 줄만', dup.status, 400)

  // 표준원가를 먼저 만들어야 실제원가가 붙을 자리가 생긴다.
  const built = await must('POST', `/costs/build?period=${period}`)
  eq('표준원가가 먼저 만들어진다', built.some((c) => c.itemId === f.product.id), true)

  const actual = await must('POST', `/costs/actual?period=${period}`)
  const mine = actual.find((c) => c.itemId === f.product.id)
  eq('실제원가가 계산된다', !!mine, true)

  // 이 달 이 공정을 쓰는 품목이 하나뿐이므로 총액이 전부 이 품목에 배부된다.
  eq('실제노무비 = 노무비 총액 ÷ 생산수량', Number(mine.actualLabor), 100000)
  eq('실제경비 = 경비 총액 ÷ 생산수량', Number(mine.actualOverhead), 40000)

  // BOM 대로 투입했으니 실제재료비는 표준재료비와 같아야 한다.
  eq('BOM 대로 썼으면 실제재료비 = 표준재료비',
    Number(mine.actualMaterial), Number(mine.materialCost))

  // 등록을 지우면 실제 노무비·경비가 사라진다 — 근거 없이 남아 있으면 안 된다.
  await must('DELETE', `/process-expenses/${exp.id}`)
  const recalc = (await must('POST', `/costs/actual?period=${period}`))
    .find((c) => c.itemId === f.product.id)
  eq('근거를 지우면 실제노무비도 0', Number(recalc.actualLabor), 0)
  eq('근거를 지우면 실제경비도 0', Number(recalc.actualOverhead), 0)

  // 뒷정리
  await must('DELETE', `/productions/${prod.id}`)
  await must('DELETE', `/work-orders/${wo.id}`)
  await must('POST', '/stock/transactions', {
    itemId: f.material.id, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: 20,
  })
  for (const c of built) await call('DELETE', `/costs/${c.id}`)
  await must('DELETE', `/bor/${op.id}`)
  eq('시험용 자료는 남기지 않는다',
    (await must('GET', '/costs')).filter((c) => c.period === period).length, 0)
}

/**
 * BOR(작업소요시간) — 품목별 작업 라우팅.
 *
 * <p>BOM 이 "무엇으로 만드는가" 라면 BOR 은 "어떻게 만드는가" 다. 이 표가 없어서
 * 작업지시서효율현황의 '시간 표준' 은 <b>실제로 작업한 공정</b>만 되짚어 셀 수밖에 없었다 —
 * 공정을 하나 건너뛰면 표준에서도 빠지니 오히려 시간을 아낀 것처럼 보인다.
 *
 * <p>작업시간은 '생산수량 기준' 으로 적는다(100개 로트에 3시간처럼). 그래서 1개당으로
 * 환산해서 쓴다. 이 환산을 빠뜨리면 표준시간이 로트 배수만큼 부풀거나 줄어든다.
 */
async function scenarioBor(f) {
  section('■ BOR(작업소요시간)')

  const processes = await must('GET', '/processes')
  eq('공정 마스터가 있다', processes.length >= 2, true)

  // 이전 실행이 남긴 것이 있으면 치운다.
  for (const o of (await must('GET', '/bor')).filter((x) => x.productId === f.product.id)) {
    await call('DELETE', `/bor/${o.id}`)
  }

  const first = await must('POST', '/bor', {
    productId: f.product.id, processId: processes[0].id, seq: 1,
    workName: `${P}절단`, baseQty: 10, workHours: 0.5,
  })
  eq('작업시간이 그대로 저장된다', Number(first.workHours), 0.5)
  eq('1개당 시간 = 작업시간 ÷ 생산수량', Number(first.hoursPerUnit), 0.05)

  const second = await must('POST', '/bor', {
    productId: f.product.id, processId: processes[1].id, seq: 2,
    workName: `${P}조립`, baseQty: 10, workHours: 1.25,
  })
  eq('둘째 작업도 들어간다', Number(second.hoursPerUnit), 0.125)

  const dup = await call('POST', '/bor', {
    productId: f.product.id, processId: processes[0].id, seq: 1,
    workName: `${P}중복`, baseQty: 1, workHours: 1,
  })
  eq('같은 품목에 작업순서가 겹치면 거부', dup.status, 400)
  eq('무엇이 겹치는지 말한다', /작업순서/.test(String(dup.data?.message ?? '')), true)

  // 생산수량을 안 주면 1개 기준이다.
  const noBase = await must('POST', '/bor', {
    productId: f.product.id, processId: processes[0].id, seq: 3,
    workName: `${P}검사`, workHours: 0.2,
  })
  eq('생산수량을 안 주면 1개 기준', Number(noBase.baseQty), 1)
  eq('그때는 1개당 시간이 작업시간과 같다', Number(noBase.hoursPerUnit), 0.2)

  const mine = (await must('GET', '/bor')).filter((x) => x.productId === f.product.id)
  eq('품목 라우팅이 3줄', mine.length, 3)
  eq('작업순서대로 나온다', mine.map((x) => x.seq).join(','), '1,2,3')
  eq('1개당 표준시간 합', Math.round(mine.reduce((n, x) => n + Number(x.hoursPerUnit), 0) * 1000) / 1000, 0.375)

  await rejects('음수 작업시간은 거부', 'POST', '/bor', {
    productId: f.product.id, processId: processes[0].id, seq: 9,
    workName: `${P}음수`, workHours: -1,
  }, '0 이상')
  await rejects('생산수량 0 은 거부', 'POST', '/bor', {
    productId: f.product.id, processId: processes[0].id, seq: 9,
    workName: `${P}영`, baseQty: 0, workHours: 1,
  }, '0보다')

  // 수정: 작업순서를 그대로 둔 수정은 "겹친다" 로 거부되면 안 된다(자기 자신 제외).
  const edited = await must('PUT', `/bor/${first.id}`, {
    productId: f.product.id, processId: processes[0].id, seq: 1,
    workName: `${P}절단(수정)`, baseQty: 10, workHours: 0.75,
  })
  eq('자기 자신은 겹침으로 보지 않는다', Number(edited.workHours), 0.75)

  for (const o of mine) eq(`작업을 지울 수 있다(${o.seq})`, (await call('DELETE', `/bor/${o.id}`)).status, 204)
  eq('시험용 라우팅은 남기지 않는다',
    (await must('GET', '/bor')).filter((x) => x.productId === f.product.id).length, 0)
}

/**
 * 표준원가 자동생성이 <b>판매단가에서 역산되지 않는가.</b>
 *
 * <p>예전에는 표준원가를 판매단가 × 고정비율(재료 60% · 노무 25% · 경비 15%)로 지어냈다.
 * 원가를 판매가에서 역산한 셈이라 방향이 거꾸로였다 — 판매가를 올리면 원가가 따라 오르고
 * 매출총이익률은 언제나 40%로 고정된다. 이익현황·차이분석·매출원가가 전부 이 값에 기댄다.
 *
 * <p>개발 자료에서 완제품의 표준재료비가 6,000원(판매가 10,000 × 60%)이었는데,
 * BOM 대로 세면 자재 2개 × 1,200원 = 2,400원이다 — <b>2.5배 부풀려져</b> 있었다.
 *
 * <p>이제는 BOM 자재 소요량 × 자재 단가로 센다. 노무비·경비는 배부 근거(품목→공정 라우팅)가
 * 없어 0 으로 두고 사람이 넣는다 — 원본도 [노무비/경비등록] 이라는 사전작업 화면에서
 * 공정·창고별로 직접 넣게 돼 있다.
 */
async function scenarioStandardCostBuild(f) {
  section('■ 표준원가 자동생성')

  const period = '2099-01'   // 실제 자료와 겹치지 않는 기간
  const existing = (await must('GET', '/costs')).filter((c) => c.period === period)
  for (const c of existing) await call('DELETE', `/costs/${c.id}`)

  const made = await must('POST', `/costs/build?period=${period}`)
  eq('표준원가가 생성된다', made.length > 0, true)

  const items = await must('GET', '/items')
  const boms = await must('GET', '/boms')
  const purchases = await must('GET', '/purchases')

  // 자재 단가: 마지막 매입단가 → 품목 구매단가 (재고자산평가와 같은 규칙)
  const lastPrice = new Map()
  const lastDate = new Map()
  for (const d of purchases) {
    for (const l of d.lines ?? []) {
      if (!lastDate.has(l.itemId) || d.purchaseDate >= lastDate.get(l.itemId)) {
        lastDate.set(l.itemId, d.purchaseDate)
        lastPrice.set(l.itemId, Number(l.unitPrice))
      }
    }
  }
  const unitCost = (id) => {
    const last = lastPrice.get(id)
    if (last != null && last > 0) return last
    const it = items.find((x) => x.id === id)
    return it && Number(it.purchasePrice) > 0 ? Number(it.purchasePrice) : null
  }

  const product = made.find((c) => c.itemId === f.product.id)
  eq('완제품 표준원가가 생성됐다', !!product, true)

  const bom = boms.find((b) => b.productId === f.product.id)
  const expected = (bom?.lines ?? []).reduce((n, l) => {
    const price = unitCost(l.componentId)
    return price == null ? n : n + price * Number(l.quantity)
  }, 0)
  eq('표준재료비 = BOM 소요량 × 자재단가', Number(product.materialCost), expected)

  const item = items.find((x) => x.id === f.product.id)
  eq('판매단가 × 60% 가 아니다(예전 방식)',
    Number(product.materialCost) === Math.round(Number(item.unitPrice) * 0.6 * 100) / 100, false)

  /*
   * 표준노무비 = BOR(작업 라우팅) 1개당 시간 × 그 공정의 시간당 비용.
   * 라우팅이 없으면 0 이다 — 사 오는 품목에는 노무비가 없고, 라우팅을 세우면 그때 잡힌다.
   * 경비는 여전히 0 이다. 원본은 [노무비/경비등록] 에서 월별 총액을 넣고 배부하는데
   * 우리에겐 그 총액을 넣을 자리가 없다. 노무비와 달리 요율이 없어 지어낼 근거가 없다.
   */
  // 자재처럼 BOM 이 없는 품목은 자기 매입단가가 재료비다.
  const material = made.find((c) => c.itemId === f.material.id)
  eq('BOM 이 없는 품목도 원가가 잡힌다', !!material, true)
  eq('BOM 이 없는 품목은 자기 매입단가가 재료비', Number(material.materialCost), unitCost(f.material.id))

  eq('라우팅이 없으면 노무비 0', Number(product.laborCost), 0)
  eq('경비는 지어내지 않는다', Number(product.overheadCost), 0)
  eq('표준원가 = 재료비 + 노무비 + 경비', Number(product.standardTotal), Number(product.materialCost))

  // 라우팅을 세우면 노무비가 잡힌다.
  const procs = await must('GET', '/processes')
  const ops = []
  for (const [i, spec] of [[procs[0], 10, 0.5], [procs[1], 10, 1.25]].entries()) {
    const [pc, base, hours] = spec
    ops.push(await must('POST', '/bor', {
      productId: f.product.id, processId: pc.id, seq: 90 + i,
      workName: `${P}노무비시험${i}`, baseQty: base, workHours: hours,
    }))
  }
  const expectedLabor = ops.reduce((n, o) => {
    const pc = procs.find((x) => x.id === o.processId)
    return n + Number(o.hoursPerUnit) * Number(pc.costPerHr)
  }, 0)

  for (const c of made) await must('DELETE', `/costs/${c.id}`)
  const remade = await must('POST', `/costs/build?period=${period}`)
  const withLabor = remade.find((c) => c.itemId === f.product.id)
  eq('표준노무비 = Σ(1개당 시간 × 공정 시간당비용)',
    Math.round(Number(withLabor.laborCost) * 100) / 100, Math.round(expectedLabor * 100) / 100)
  eq('표준원가에 노무비가 더해진다',
    Number(withLabor.standardTotal), Number(withLabor.materialCost) + Number(withLabor.laborCost))

  for (const c of remade) await must('DELETE', `/costs/${c.id}`)
  for (const o of ops) await must('DELETE', `/bor/${o.id}`)
  // made 는 위에서 이미 지웠다 — 아래 정리 루프가 두 번 지우지 않게 비운다.
  made.length = 0

  // 시험용으로 만든 기간은 지운다(위에서 이미 지웠으면 made 는 비어 있다).
  for (const c of made) await must('DELETE', `/costs/${c.id}`)
  eq('시험용 원가는 남기지 않는다',
    (await must('GET', '/costs')).filter((c) => c.period === period).length, 0)
}

/**
 * 차이분석이 기대는 자료.
 *
 * <p>원본 [구분] 은 원가비교집계표 · 재료비단가차이 · 소모수량차이 · 노무비/경비/외주비차이다.
 * 총액 차이 한 줄로는 <b>왜</b> 차이가 났는지 알 수 없다 — 비싸게 산 것인지 많이 쓴 것인지가
 * 갈려야 손 쓸 곳이 정해진다. 세 갈래가 각각 다른 자료에 기대므로 그 자료를 못 박는다.
 *
 * <p>특히 원가(ItemCost)에 <b>표준과 실제가 항목별로</b> 실려 있어야 한다. 총액만 남고
 * 노무비·경비가 사라지면 '노무비·경비차이' 갈래가 통째로 빈 화면이 된다.
 */
async function scenarioVarianceInputs(f) {
  section('■ 차이분석이 기대는 자료')

  const costs = await must('GET', '/costs')
  eq('원가 자료가 있다', costs.length > 0, true)
  const c = costs[0]
  for (const k of ['materialCost', 'laborCost', 'overheadCost', 'standardTotal',
    'actualMaterial', 'actualLabor', 'actualOverhead', 'actualTotal']) {
    eq(`원가에 ${k} 가 실린다`, typeof c[k], 'number')
  }
  eq('표준 총액 = 재료비 + 노무비 + 경비',
    Number(c.standardTotal),
    Number(c.materialCost) + Number(c.laborCost) + Number(c.overheadCost))
  eq('실제 총액 = 실제재료비 + 실제노무비 + 실제경비',
    Number(c.actualTotal),
    Number(c.actualMaterial) + Number(c.actualLabor) + Number(c.actualOverhead))
  eq('차이 = 실제 − 표준', Number(c.variance), Number(c.actualTotal) - Number(c.standardTotal))

  /*
   * 재료비단가차이는 <b>품목의 기준(구매)단가</b>가 있어야 잴 수 있다.
   * 기준이 0 이면 재지 않는다 — 없는 기준으로 만든 숫자를 보여 주느니 '기준 없음' 이 낫다.
   * 구매할인현황에서 이미 같은 결정을 했고, 여기서도 같은 필드를 본다.
   */
  const item = (await must('GET', '/items')).find((x) => x.id === f.material.id)
  eq('품목에 기준단가 칸이 있다', typeof item.purchasePrice, 'number')

  const before = Number(item.purchasePrice)
  const body = {
    name: item.name, spec: item.spec, unit: item.unit, category: item.category,
    unitPrice: item.unitPrice, safetyStock: item.safetyStock, barcode: item.barcode,
    udiDi: item.udiDi, managementItemId: item.managementItemId, active: true,
  }
  const withBase = await must('PUT', `/items/${f.material.id}`, { ...body, purchasePrice: 900 })
  eq('기준단가를 정할 수 있다', Number(withBase.purchasePrice), 900)
  await must('PUT', `/items/${f.material.id}`, { ...body, purchasePrice: before })
  eq('되돌려 놓는다',
    Number((await must('GET', `/items/${f.material.id}`)).purchasePrice), before)

  // 소모수량차이는 BOM(표준)과 생산실적의 투입자재(실제) 둘 다 있어야 한다.
  const boms = await must('GET', '/boms')
  eq('BOM 에 소요량이 있다', typeof boms[0]?.lines?.[0]?.quantity, 'number')
  const prodWithMat = (await must('GET', '/productions')).find((x) => (x.materials ?? []).length > 0)
  eq('생산실적에 실제 투입량이 있다', typeof prodWithMat?.materials?.[0]?.quantity, 'number')
}

/**
 * 실제원가현황(원가집계표)의 <b>롤포워드 항등식</b>.
 *
 * <p>원본 원가집계표는 기초 → 증가 → 감소 → 기말을 수량·단가·금액으로 늘어놓는다
 * (원가생성/수정 사본의 열 id B_QTY·I_QTY·D_QTY·L_QTY 가 그것이다).
 * 그 표가 뜻을 가지려면 <b>기초 + 증가 − 감소 = 기말</b> 이 언제나 맞아야 한다.
 * 한 품목이라도 어긋나면 기말재고 금액이 틀리고, 그 값이 재무제표까지 간다.
 *
 * <p>증가내역·감소내역은 같은 기간 수불부를 부호로 가른 것이다 — 두 갈래의 건수 합이
 * 수불부 전체와 같아야 한다. 안 그러면 어느 한쪽 화면에서 거래가 사라진다.
 */
async function scenarioCostRollForward() {
  section('■ 실제원가현황 롤포워드')

  const from = '2026-07-01'
  const to = '2026-07-31'
  const movement = await must('GET', `/stock/movement?from=${from}&to=${to}`)
  eq('기간 재고변동표가 나온다', movement.length > 0, true)

  const broken = movement.filter(
    (r) => Math.abs((Number(r.opening) + Number(r.inQty) - Number(r.outQty)) - Number(r.closing)) > 1e-6)
  eq('기초 + 증가 − 감소 = 기말 (어긋난 품목 수)', broken.length, 0)

  const ledger = await must('GET', `/stock/ledger?from=${from}&to=${to}`)
  const inc = ledger.rows.filter((r) => Number(r.quantityChange) > 0)
  const dec = ledger.rows.filter((r) => Number(r.quantityChange) < 0)
  eq('증가내역 + 감소내역 = 수불부 전체', inc.length + dec.length, ledger.rows.length)
  eq('수량이 0 인 거래는 없다', ledger.rows.filter((r) => Number(r.quantityChange) === 0).length, 0)

  // 수불부의 증가 합이 변동표의 증가 합과 같아야 한다 — 두 화면이 같은 자료를 다르게 세면 안 된다.
  const sumIn = inc.reduce((n, r) => n + Number(r.quantityChange), 0)
  const sumOut = dec.reduce((n, r) => n - Number(r.quantityChange), 0)
  eq('증가 수량 합이 변동표와 같다',
    Math.round(sumIn * 1000) / 1000, Math.round(movement.reduce((n, r) => n + Number(r.inQty), 0) * 1000) / 1000)
  eq('감소 수량 합이 변동표와 같다',
    Math.round(sumOut * 1000) / 1000, Math.round(movement.reduce((n, r) => n + Number(r.outQty), 0) * 1000) / 1000)

  // 화면이 기대는 필드
  const row = movement[0]
  eq('변동표에 품목코드·단위가 실린다',
    typeof row.itemCode === 'string' && typeof row.unit === 'string', true)
  eq('수불부에 일자·적요가 실린다',
    typeof ledger.rows[0]?.transactionDate === 'string' && 'note' in (ledger.rows[0] ?? {}), true)
}

/**
 * 작업지시서효율현황이 기대는 <b>응답 필드</b>.
 *
 * <p>이 화면은 원본처럼 소모 표준(BOM 대로) 대 실제(정말 쓴 것)를 금액으로 견준다.
 * 계산은 프론트에서 하므로 하네스가 숫자를 볼 수는 없지만, <b>기대는 필드가 사라지면</b>
 * 화면이 조용히 0원으로 나온다 — 그건 "차이가 없다"와 구별되지 않는다.
 *
 * <p>실제로 이 자료를 처음 다룰 때 자재 키를 itemId 로 짐작했다가 원재료 투입이 늘 0으로
 * 나온 적이 있다(진짜 이름은 componentId). 그래서 이름까지 못 박는다.
 */
async function scenarioWoEfficiencyFields() {
  section('■ 작업지시서효율현황이 기대는 필드')

  const wos = await must('GET', '/work-orders')
  eq('작업지시에 productId 가 있다(BOM 을 찾는 열쇠)', typeof wos[0]?.productId, 'number')
  eq('작업지시에 dueDate 칸이 있다', 'dueDate' in (wos[0] ?? {}), true)

  const prods = await must('GET', '/productions')
  const withMat = prods.find((x) => (x.materials ?? []).length > 0)
  eq('생산실적에 투입자재가 실린다', !!withMat, true)
  eq('자재 키는 componentId 다(itemId 가 아니다)', typeof withMat.materials[0].componentId, 'number')
  eq('자재 수량이 숫자다', typeof withMat.materials[0].quantity, 'number')

  const boms = await must('GET', '/boms')
  eq('BOM 라인도 componentId 를 쓴다', typeof boms[0]?.lines?.[0]?.componentId, 'number')

  const procs = await must('GET', '/processes')
  eq('공정에 표준시간이 있다', typeof procs[0]?.stdTimeMin, 'number')

  const results = await must('GET', '/work-results')
  eq('작업내역에 실제 작업시간이 있다', typeof results[0]?.workTimeMin, 'number')
  eq('작업내역이 작업지시를 가리킬 수 있다', 'workOrderId' in (results[0] ?? {}), true)

  // 자재 단가는 재고자산평가와 같은 규칙(마지막 입고단가 → 품목 구매단가)을 쓴다.
  const items = await must('GET', '/items')
  eq('품목에 구매단가가 있다', typeof items[0]?.purchasePrice, 'number')
  const purchases = await must('GET', '/purchases')
  eq('구매 라인에 itemId·단가가 있다',
    typeof purchases[0]?.lines?.[0]?.itemId === 'number' && typeof purchases[0]?.lines?.[0]?.unitPrice === 'number', true)
}

/**
 * <b>리스트 안쪽 제약이 실제로 걸리는가.</b>
 *
 * <p>{@code List<LineInput>} 에 원소마다 {@code @Valid} 를 안 붙이면 그 안의
 * {@code @NotNull}·{@code @NotBlank} 가 <b>통째로 무시된다.</b> 컴파일도 되고 기동도 되고
 * 단위 시험도 통과하는데 실행 때만 조용히 안 걸린다.
 *
 * <p>실제로 단가일괄변경에서 음수 단가가 그대로 저장돼 공급가액이 음수가 됐고,
 * 일반전표는 계정 없는 라인을 받아 500(“The given id must not be null”)으로 터졌다 —
 * 사용자에게는 서버 내부 사정이 그대로 보였다.
 *
 * <p>네 화면(일반전표·급여명세·설문·단가적용순서)이 같은 상태였다. 다시 빠지면 여기서 잡는다.
 */
async function scenarioNestedValidation(f) {
  section('■ 리스트 안쪽 검증')

  const journal = await call('POST', '/journals', {
    entryDate: '2026-08-01', description: `${P}중첩검증`,
    lines: [{ accountId: null, debit: 1000, credit: 0 }, { accountId: null, debit: 0, credit: 1000 }],
  })
  eq('일반전표: 계정 없는 라인은 400', journal.status, 400)
  eq('일반전표: 무엇을 고쳐야 하는지 말한다', String(journal.data?.message ?? '').includes('계정'), true)
  eq('일반전표: 500 으로 터지지 않는다',
    /given id must not be null|서버 오류/.test(String(journal.data?.message ?? '')), false)

  const survey = await call('POST', '/surveys', {
    title: `${P}중첩검증`,
    questions: [{ seq: 1, type: 'SINGLE', content: '', required: true }],
  })
  eq('설문: 내용 없는 문항은 400', survey.status, 400)
  eq('설문: 문항 내용을 지적한다', String(survey.data?.message ?? '').includes('문항'), true)

  const emps = await must('GET', '/employees')
  if (emps.length > 0) {
    const slip = await call('POST', '/payslips', {
      employeeId: emps[0].id, payMonth: '2026-08',
      lines: [{ kind: 'ALLOWANCE', name: '', amount: 100, taxable: true }],
    })
    eq('급여명세: 항목명 빈 라인은 400', slip.status, 400)
    eq('급여명세: 항목명을 지적한다', String(slip.data?.message ?? '').includes('항목명'), true)
  }

  const order = await call('PUT', '/price-order-settings', {
    settings: [{ functionName: '', applyOrder: 1, active: true }],
  })
  eq('단가적용순서: 기능명 빈 줄은 400', order.status, 400)
  eq('단가적용순서: 기능명을 지적한다', String(order.data?.message ?? '').includes('기능명'), true)

  // 단가일괄변경도 같은 종류였다 — 음수 단가가 그대로 들어가 공급가액이 음수가 됐다.
  const rows = await must('GET', '/price-bulk/lines?tradeType=SALES&from=2020-01-01&to=2030-12-31')
  const line = rows.find((r) => r.editable)
  if (line) {
    const neg = await call('PUT', '/price-bulk/lines', {
      tradeType: 'SALES', changes: [{ lineId: line.lineId, unitPrice: -1 }],
    })
    eq('단가일괄변경: 음수 단가는 400', neg.status, 400)
    const same = (await must('GET', '/price-bulk/lines?tradeType=SALES&from=2020-01-01&to=2030-12-31'))
      .find((r) => r.lineId === line.lineId)
    eq('거절된 요청은 아무것도 바꾸지 않는다', same.unitPrice, line.unitPrice)
  }
}

/**
 * <b>견적·수주·발주·출하를 지울 수 있는가.</b>
 *
 * 넷 다 삭제가 아예 없었다. 거래처나 단가를 잘못 넣어도 지울 방법이 없어 취소로 덮어 두는
 * 수밖에 없었고, 목록이 죽은 문서로 불어났다. 정산에서 한 번 고쳤던 것과 같은 종류다.
 *
 * <p>뒤에 붙은 것이 있으면 막아야 한다. 출하·판매전표가 수주를 근거로 가리키는데 수주만
 * 사라지면 그쪽 화면의 출처가 빈칸이 되고 미출하 집계가 어긋난다.
 *
 * <p>그런데 막기만 하면 <b>서로를 막는다</b> — 견적은 "수주를 먼저 지우라", 수주는 "견적의
 * 전환을 되돌리라" 하는데 되돌리는 기능이 없다. 그래서 수주를 지우면 견적의 전환이 풀린다.
 * 이 시나리오가 그 고리까지 같이 본다.
 */
async function scenarioSlipDelete(f) {
  section('■ 견적·수주·발주·출하 삭제')

  const today = new Date().toISOString().slice(0, 10)
  const line = [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }]

  for (const [label, path, body] of [
    ['견적서', '/quotations', { partnerId: f.customer.id, quoteDate: today, lines: line }],
    ['수주', '/sales-orders', { partnerId: f.customer.id, orderDate: today, lines: line }],
    ['발주', '/purchase-orders',
      { partnerId: f.supplier.id, orderDate: today, warehouseId: f.warehouse.id, lines: line }],
    ['출하', '/shipments', { partnerId: f.customer.id, shipDate: today, lines: line }],
  ]) {
    const made = await must('POST', path, body)
    eq(`${label}: 지울 수 있다`, (await call('DELETE', `${path}/${made.id}`)).status, 204)
    eq(`${label}: 목록에서도 사라진다`,
      (await must('GET', path)).some((x) => x.id === made.id), false)
  }

  // 뒤에 출하가 붙은 수주는 막힌다
  const order = await must('POST', '/sales-orders',
    { partnerId: f.customer.id, orderDate: today, lines: line })
  const ship = await must('POST', `/sales-orders/${order.id}/ship`, { shipDate: today })
  const blocked = await call('DELETE', `/sales-orders/${order.id}`)
  eq('출하가 붙은 수주는 못 지운다', blocked.status, 409)
  eq('무엇을 먼저 지워야 하는지 알려 준다',
    /출하가 있어 지울 수 없습니다/.test(String(blocked.data?.message ?? '')), true)
  await must('DELETE', `/shipments/${ship.id}`)
  eq('출하를 지우면 수주도 지워진다', (await call('DELETE', `/sales-orders/${order.id}`)).status, 204)

  // 견적 → 수주 전환쌍이 서로를 막지 않는다
  const quote = await must('POST', '/quotations',
    { partnerId: f.customer.id, quoteDate: today, lines: line })
  const converted = await must('POST', `/quotations/${quote.id}/convert`)
  const lockedQuote = await call('DELETE', `/quotations/${quote.id}`)
  eq('전환된 견적서는 못 지운다', lockedQuote.status, 409)
  eq('수주를 지우면 전환이 풀린다', (await call('DELETE', `/sales-orders/${converted.id}`)).status, 204)
  const after = (await must('GET', '/quotations')).find((x) => x.id === quote.id)
  eq('견적서가 전환 이전 상태로 돌아간다', after.status, 'SENT')
  eq('전환된 수주번호도 지워진다', after.convertedOrderId ?? null, null)
  eq('그러고 나면 견적서도 지워진다', (await call('DELETE', `/quotations/${quote.id}`)).status, 204)
}

/**
 * <b>사용중지한 마스터로 새 전표를 쓸 수 있는가.</b>
 *
 * 사용중지는 "더 이상 쓰지 말자"는 표시인데 지금까지는 표시만 되고 아무것도 막지 않았다.
 * 중지한 품목·거래처로 판매·구매 전표가 그대로 저장됐고, 코드도움 목록에도 남아 있어
 * 실수로 고르기 쉬웠다. 잘못 고르면 재고와 채권 잔액이 조용히 움직인다.
 *
 * <p>수정은 일부러 막지 않는다 — 그때는 살아 있던 품목이 든 옛 전표의 비고 한 줄도
 * 못 고치게 되기 때문이다. 여기서도 그 성질을 같이 못 박는다.
 */
async function scenarioInactiveMaster(f) {
  section('■ 사용중지한 마스터')

  const today = new Date().toISOString().slice(0, 10)
  const item = await must('POST', '/items', {
    code: `${P}DEADITEM`, name: '중지품목', unit: 'EA',
    category: 'MERCHANDISE', unitPrice: 1000, safetyStock: 0,
  })
  const partner = await must('POST', '/partners',
    { code: `${P}DEADPT`, name: '중지거래처', type: 'CUSTOMER' })

  // 살아 있는 동안 만든 전표는 그대로 남아야 한다 — 중지가 소급되면 안 된다
  const before = await must('POST', '/sales', {
    saleDate: today, partnerId: partner.id, warehouseId: f.warehouse.id,
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }],
  })

  await must('PUT', `/items/${item.id}`, {
    name: '중지품목', unit: 'EA', category: 'MERCHANDISE',
    unitPrice: 1000, safetyStock: 0, active: false,
  })
  await must('PUT', `/partners/${partner.id}`,
    { code: `${P}DEADPT`, name: '중지거래처', type: 'CUSTOMER', active: false })

  const withDeadItem = await call('POST', '/sales', {
    saleDate: today, partnerId: f.customer.id, warehouseId: f.warehouse.id,
    lines: [{ itemId: item.id, quantity: 1, unitPrice: 1000 }],
  })
  eq('중지된 품목으로는 판매전표를 못 쓴다', withDeadItem.status, 400)
  eq('어느 품목인지 알려 준다',
    /사용중지된 품목입니다/.test(String(withDeadItem.data?.message ?? '')), true)

  const withDeadPartner = await call('POST', '/sales', {
    saleDate: today, partnerId: partner.id, warehouseId: f.warehouse.id,
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }],
  })
  eq('중지된 거래처로는 판매전표를 못 쓴다', withDeadPartner.status, 400)

  const purchase = await call('POST', '/purchases', {
    purchaseDate: today, partnerId: f.supplier.id, warehouseId: f.warehouse.id,
    lines: [{ itemId: item.id, quantity: 1, unitPrice: 500 }],
  })
  eq('구매전표도 마찬가지다', purchase.status, 400)

  // 판매·구매만 막고 끝내면 옆문이 남는다 — 견적서로 쓰고 수주로 전환하면 그만이다.
  // 품목·거래처를 받는 전표 전부에 같은 검사를 건다.
  const line = (itemId) => [{ itemId, quantity: 1, unitPrice: 1000 }]
  const others = [
    ['견적서', '/quotations', (pid, iid) => ({ partnerId: pid, quoteDate: today, lines: line(iid) })],
    ['수주', '/sales-orders', (pid, iid) => ({ partnerId: pid, orderDate: today, lines: line(iid) })],
    ['발주', '/purchase-orders',
      (pid, iid) => ({ partnerId: pid, orderDate: today, warehouseId: f.warehouse.id, lines: line(iid) })],
    ['출하', '/shipments', (pid, iid) => ({ partnerId: pid, shipDate: today, lines: line(iid) })],
  ]
  for (const [label, path, body] of others) {
    const partnerId = path === '/purchase-orders' ? f.supplier.id : f.customer.id
    const byItem = await call('POST', path, body(partnerId, item.id))
    eq(`${label}: 중지된 품목을 막는다`, byItem.status, 400)
    eq(`${label}: 사유가 품목이라고 나온다`,
      /사용중지된 품목입니다/.test(String(byItem.data?.message ?? '')), true)
    const byPartner = await call('POST', path, body(partner.id, f.product.id))
    eq(`${label}: 중지된 거래처를 막는다`, byPartner.status, 400)
  }

  // 중지 전에 쓴 전표는 여전히 읽히고 고쳐진다
  // 단건 조회 엔드포인트는 없다 — 화면도 목록에서 행을 열므로 목록에 남아 있는지로 본다.
  eq('중지 전에 쓴 전표는 목록에 그대로 남는다',
    (await must('GET', '/sales')).some((x) => x.id === before.id), true)
  const edit = await call('PUT', `/sales/${before.id}`, {
    saleDate: today, partnerId: partner.id, warehouseId: f.warehouse.id,
    remark: '중지 뒤에도 비고는 고쳐진다',
    lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 1000 }],
  })
  eq('중지된 거래처의 옛 전표도 수정은 된다', edit.status, 200)

  await must('DELETE', `/sales/${before.id}`)
  await must('DELETE', `/partners/${partner.id}`)
  await must('DELETE', `/items/${item.id}`)
  eq('시험 자료는 남기지 않는다',
    (await must('GET', '/items')).filter((i) => i.code === `${P}DEADITEM`).length, 0)
}

/**
 * 없는 API 경로. 예전에는 <b>500</b> 이 나면서 "No static resource api/..." 라는
 * 내부 사정까지 실려 나갔다. 프론트가 오타를 낸 건지 서버가 죽은 건지 구분이 안 되고,
 * 내부 구조까지 새어 나간다.
 */
/**
 * 품목그룹·거래처그룹. 마스터 테이블과 엔티티 관계는 오래전부터 있었는데
 * <b>등록/수정 요청 DTO 에만 그룹 id 가 빠져 있어</b> 아무도 그룹을 지정할 수 없었다.
 * 그래서 채권/채무현황의 거래처그룹 소계는 늘 '(미지정)' 한 줄이었고,
 * 조건검색의 '그룹 전체' 도 언제나 자기 자신 한 건만 나왔다.
 * 지정 → 되읽기 → 해제 왕복을 못 박는다.
 */
async function scenarioGroups(f) {
  section('■ 품목그룹·거래처그룹')

  // 이전 실행이 중간에 끊겨 남아 있을 수 있다 — 있으면 그것을 쓴다.
  const groupOf = async (endpoint, code, name) => {
    const found = (await must('GET', endpoint)).find((g) => g.code === code)
    return found ?? await must('POST', endpoint, { code, name, sortOrder: 0 })
  }
  const pg = await groupOf('/partner-groups', `${P}PG`, `${P}거래처그룹`)
  const ig = await groupOf('/item-groups', `${P}IG`, `${P}품목그룹`)

  // 단건 GET 은 없다 — 원본도 목록에서 행을 열어 수정한다.
  const pt = (await must('GET', '/partners')).find((x) => x.id === f.customer.id)
  const pBody = {
    code: pt.code, name: pt.name, type: pt.type,
    bizRegNo: pt.bizRegNo, ceoName: pt.ceoName, manager: pt.manager,
    phone: pt.phone, address: pt.address, active: true,
  }
  const upd = await must('PUT', `/partners/${f.customer.id}`, { ...pBody, partnerGroupId: pg.id })
  eq('거래처에 그룹을 지정할 수 있다', upd.partnerGroupName, `${P}거래처그룹`)

  const bal = await must('GET', '/ledger/partner-balances')
  const mine = bal.find((b) => b.partnerId === f.customer.id)
  eq('채권/채무현황에 그룹명이 실려 나온다', mine?.partnerGroupName, `${P}거래처그룹`)

  const it = await must('GET', `/items/${f.product.id}`)
  const iBody = {
    name: it.name, spec: it.spec, unit: it.unit, category: it.category,
    unitPrice: it.unitPrice, purchasePrice: it.purchasePrice, safetyStock: it.safetyStock,
    barcode: it.barcode, udiDi: it.udiDi, managementItemId: it.managementItemId, active: true,
  }
  const iu = await must('PUT', `/items/${f.product.id}`, { ...iBody, itemGroupId: ig.id })
  eq('품목에 그룹을 지정할 수 있다', iu.itemGroupName, `${P}품목그룹`)
  eq('다시 읽어도 남아 있다', (await must('GET', `/items/${f.product.id}`)).itemGroupId, ig.id)

  const bad = await call('PUT', `/items/${f.product.id}`, { ...iBody, itemGroupId: 99999999 })
  eq('없는 그룹 id 는 조용히 무시하지 않고 400', bad.status, 400)

  // 해제: null 을 주면 그룹이 떨어진다
  eq('그룹 해제', (await must('PUT', `/items/${f.product.id}`, { ...iBody, itemGroupId: null })).itemGroupId, null)
  eq('거래처 그룹 해제',
    (await must('PUT', `/partners/${f.customer.id}`, { ...pBody, partnerGroupId: null })).partnerGroupId, null)

  await call('DELETE', `/item-groups/${ig.id}`)
  await call('DELETE', `/partner-groups/${pg.id}`)
}

/**
 * 단가일괄변경(전표). 원본은 <b>이미 입력한 전표의 단가</b>를 고치는 화면인데
 * 우리는 오랫동안 품목 표준단가만 바꿨다 — 이름이 같고 하는 일이 달랐다.
 * 단가를 고치면 공급가액·부가세·전표합계가 함께 맞아야 한다. 안 맞으면
 * 매출 합계가 조용히 틀어져 채권·부가세신고까지 번진다.
 */
async function scenarioSlipPriceBulk(f) {
  section('■ 단가일괄변경(전표 단가)')

  const q = `from=2020-01-01&to=2030-12-31`
  const rows = await must('GET', `/price-bulk/lines?tradeType=SALES&${q}`)
  eq('전표 라인이 조회된다', rows.length > 0, true)

  const mine = rows.find((r) => r.docNo && r.editable && r.quantity > 0)
  eq('고칠 수 있는 라인이 있다', !!mine, true)

  const before = (await must('GET', '/sales')).find((s) => s.id === mine.slipId)
  const newPrice = Number(mine.unitPrice) + 1000
  const res = await must('PUT', '/price-bulk/lines', {
    tradeType: 'SALES', changes: [{ lineId: mine.lineId, unitPrice: newPrice }],
  })
  eq('한 줄 바꾸면 한 전표', res.changedSlips, 1)

  const after = (await must('GET', `/price-bulk/lines?tradeType=SALES&${q}`))
    .find((r) => r.lineId === mine.lineId)
  eq('단가가 바뀐다', after.unitPrice, newPrice)
  eq('공급가액 = 수량 × 단가', after.supplyAmount, mine.quantity * newPrice)

  const slip = (await must('GET', '/sales')).find((s) => s.id === mine.slipId)
  const lineSum = (await must('GET', `/price-bulk/lines?tradeType=SALES&${q}`))
    .filter((r) => r.slipId === mine.slipId)
    .reduce((a, r) => ({ supply: a.supply + r.supplyAmount, vat: a.vat + r.vatAmount }), { supply: 0, vat: 0 })
  eq('전표 공급가액 = 라인 합', slip.supplyAmount, lineSum.supply)
  eq('전표 부가세 = 라인 합', slip.vatAmount, lineSum.vat)
  eq('전표 합계 = 공급가액 + 부가세', slip.totalAmount, slip.supplyAmount + slip.vatAmount)
  eq('금액이 실제로 늘었다', slip.supplyAmount > before.supplyAmount, true)

  /*
    * 예전에는 여기서 "고른 줄이 면세면 면세로 남는지" 를 조건부로 봤다. 개발 자료에서
    * 그 줄이 면세인 적이 없어 <b>한 번도 실행되지 않았다.</b> 아래에서 면세 전표를
    * 직접 만들어 재고 있으므로(면세는 단가를 올려도 부가세가 안 생긴다) 이 줄은 지웠다.
    */

  /*
   * <b>반올림으로 부가세가 0 이 된 과세 전표.</b>
   *
   * 예전에는 과세 여부를 전표에 저장하지 않고 '부가세가 0이면 면세' 로 되짚었다.
   * 부가세는 반올림하므로 공급가액 4원이면 부가세 0.4원 → 0원이다. 이 전표의 단가를
   * 단가일괄변경으로 올리면 면세로 오인해 <b>부가세가 계속 0 으로 남았다</b> —
   * 실측했다(공급가액 100,000 · 부가세 0). 그 금액으로 세금계산서를 끊으면 부가세를 못 받는다.
   */
  // 앞 실행이 중단됐으면 먼저 치운다 — 안 그러면 다음 실행이 남은 것을 보고 실패한다.
  for (const x of (await must('GET', '/sales')).filter((x) => String(x.saleDate).startsWith('2094'))) {
    await call('DELETE', `/sales/${x.id}`)
  }

  const tiny = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2094-01-05',
    taxable: true, lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 4 }],
  })
  eq('과세 전표로 저장된다', tiny.taxable, true)
  eq('반올림해서 부가세가 0 이 된다', tiny.vatAmount, 0)

  await must('PUT', '/price-bulk/lines', {
    tradeType: 'SALES', changes: [{ lineId: tiny.lines[0].lineId, unitPrice: 100000 }],
  })
  const grown = (await must('GET', '/sales')).find((x) => x.id === tiny.id)
  eq('단가를 올리면 공급가액이 따라온다', grown.supplyAmount, 100000)
  eq('과세 전표이므로 부가세가 붙는다', grown.vatAmount, 10000)
  eq('합계도 맞는다', grown.totalAmount, 110000)
  eq('과세 표시가 유지된다', grown.taxable, true)

  // 면세 전표는 반대로, 단가를 올려도 부가세가 생기면 안 된다.
  const free = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2094-01-06',
    taxable: false, lines: [{ itemId: f.product.id, quantity: 1, unitPrice: 50000 }],
  })
  eq('면세 전표로 저장된다', free.taxable, false)
  eq('면세는 부가세가 없다', free.vatAmount, 0)
  await must('PUT', '/price-bulk/lines', {
    tradeType: 'SALES', changes: [{ lineId: free.lines[0].lineId, unitPrice: 200000 }],
  })

  /*
   * 원본 단가일괄변경 조건의 <b>[거래유형]</b>(과세·면세).
   *
   * <p>예전에는 만들지 않았다 — 전표가 과세 여부를 안 들고 있어서 부가세가 0 인지로
   * 되짚어야 했고, <b>반올림으로 0 이 된 과세 전표가 면세로 섞였다.</b>
   * 이제 전표가 그 값을 저장하므로 조건으로 걸 수 있다.
   */
  const q94 = 'from=2094-01-01&to=2094-12-31'
  const onlyTaxed = await must('GET', `/price-bulk/lines?tradeType=SALES&${q94}&taxType=과세`)
  const onlyFree = await must('GET', `/price-bulk/lines?tradeType=SALES&${q94}&taxType=면세`)
  const both = await must('GET', `/price-bulk/lines?tradeType=SALES&${q94}`)

  eq('과세만 고르면 과세 전표가 걸린다',
    onlyTaxed.some((r) => r.slipId === tiny.id), true)
  eq('과세만 고르면 면세 전표는 빠진다',
    onlyTaxed.some((r) => r.slipId === free.id), false)
  eq('면세만 고르면 면세 전표가 걸린다',
    onlyFree.some((r) => r.slipId === free.id), true)
  eq('면세만 고르면 과세 전표는 빠진다',
    onlyFree.some((r) => r.slipId === tiny.id), false)
  eq('안 고르면 둘 다 걸린다',
    both.some((r) => r.slipId === tiny.id) && both.some((r) => r.slipId === free.id), true)
  // 반올림으로 부가세가 0 인 과세 전표가 면세로 새지 않는지 — 이 조건을 만든 이유다.
  eq('부가세가 0 이어도 과세는 과세다',
    onlyTaxed.find((r) => r.slipId === tiny.id)?.taxTypeName, '과세')
  const freeAfter = (await must('GET', '/sales')).find((x) => x.id === free.id)
  eq('면세는 단가를 올려도 부가세가 안 생긴다', freeAfter.vatAmount, 0)

  // 원본 일괄회계반영의 [부가세유형] 열이 이 값을 본다.
  const reflect = await must('GET', '/accounting-reflection?kind=SALES')
  eq('회계반영 목록에 부가세유형이 실린다',
    reflect.find((x) => x.id === tiny.id)?.vatType, '과세')
  eq('면세 전표는 면세로 실린다',
    reflect.find((x) => x.id === free.id)?.vatType, '면세')

  for (const x of [tiny, free]) await must('DELETE', `/sales/${x.id}`)
  eq('시험 전표는 남기지 않는다',
    (await must('GET', '/sales')).filter((x) => String(x.saleDate).startsWith('2094')).length, 0)

  await must('PUT', '/price-bulk/lines', {
    tradeType: 'SALES', changes: [{ lineId: mine.lineId, unitPrice: mine.unitPrice }],
  })
  const restored = (await must('GET', '/sales')).find((s) => s.id === mine.slipId)
  eq('되돌리면 원래 금액', restored.totalAmount, before.totalAmount)

  const locked = rows.find((r) => !r.editable)
  if (locked) {
    const bad = await call('PUT', '/price-bulk/lines', {
      tradeType: 'SALES', changes: [{ lineId: locked.lineId, unitPrice: 1 }],
    })
    eq('잠긴 전표는 단가도 못 고친다', bad.status, 400)
  }

  const missing = await call('PUT', '/price-bulk/lines', {
    tradeType: 'SALES', changes: [{ lineId: 99999999, unitPrice: 1 }],
  })
  eq('없는 라인은 404', missing.status, 404)

  const neg = await call('PUT', '/price-bulk/lines', {
    tradeType: 'SALES', changes: [{ lineId: mine.lineId, unitPrice: -1 }],
  })
  eq('음수 단가는 400', neg.status, 400)

  eq('구매도 같은 방식으로 조회된다',
    Array.isArray(await must('GET', `/price-bulk/lines?tradeType=PURCHASE&${q}`)), true)
}

/**
 * <b>거래구분 — 일반 · 반품.</b>
 *
 * <p>원본 근거(사본): 판매일괄회계반영 [거래구분] 일반·반품, 구매일괄회계반영 [구매구분],
 * 구매단가일괄변경 [구매구분] 전체·일반·반품, 일별이익현황 [반품만]·[반품제외].
 * <b>네 화면</b>이 이 구분을 조건으로 든다.
 *
 * <p>우리에겐 반품 개념이 아예 없어서, 되돌려받은 물건을 다시 '판매' 로 적거나 아무 데도
 * 안 적었다. 어느 쪽이든 재고와 채권이 실제와 어긋난다.
 *
 * <p>반품은 그 거래의 <b>반대</b>다. 저장할 때 수량·금액을 음수로 뒤집으므로,
 * 읽는 쪽(재고·채권·현황)은 아무것도 안 바꿔도 맞는다 — 그것을 여기서 잰다.
 */
async function scenarioReturnSlip(f) {
  section('■ 거래구분 — 일반 · 반품')

  const stockOf = async (itemId) => {
    const rows = await must('GET', '/stock')
    const r = rows.find((x) => x.itemId === itemId && x.warehouseId === f.warehouse.id)
    return r ? Number(r.quantity) : 0
  }
  const arOf = async () => {
    const rows = await must('GET', '/ledger/partner-balances')
    const r = rows.find((x) => x.partnerId === f.customer.id)
    return r ? Number(r.receivable ?? 0) : 0
  }

  // 팔 물건을 넣어 둔다 (반품을 재려면 먼저 정상 판매가 있어야 한다)
  await must('POST', '/stock/transactions', {
    itemId: f.product.id, warehouseId: f.warehouse.id, type: 'INBOUND', quantity: 20,
  })

  const stock0 = await stockOf(f.product.id)
  const ar0 = await arOf()

  const sale = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2026-07-20',
    lines: [{ itemId: f.product.id, quantity: 10, unitPrice: 1000 }],
  })
  eq('안 주면 일반 거래다', sale.returnSlip, false)
  eq('거래구분 표시값도 일반', sale.tradeKindName, '일반')
  eq('판매하면 재고가 준다', await stockOf(f.product.id), stock0 - 10)
  eq('판매 금액은 양수', Number(sale.totalAmount), 11000)
  eq('채권이 는다', await arOf(), ar0 + 11000)

  /*
   * 반품. 화면은 <b>되돌려받는 수량을 양수로</b> 적는다(원본도 그렇다) —
   * 부호를 뒤집는 것은 서버가 한 번만 한다.
   */
  const ret = await must('POST', '/sales', {
    partnerId: f.customer.id, warehouseId: f.warehouse.id, saleDate: '2026-07-21',
    returnSlip: true,
    lines: [{ itemId: f.product.id, quantity: 4, unitPrice: 1000 }],
  })
  eq('반품으로 저장된다', ret.returnSlip, true)
  eq('거래구분 표시값은 반품', ret.tradeKindName, '반품')
  // 저장은 음수다 — 읽는 쪽이 아무것도 안 바꿔도 맞게 하려고 여기서 한 번 뒤집는다
  eq('반품 전표의 금액은 음수', Number(ret.totalAmount), -4400)
  eq('반품 라인 수량도 음수', Number(ret.lines[0].quantity), -4)
  eq('되돌려받은 물건이 창고로 들어온다', await stockOf(f.product.id), stock0 - 10 + 4)
  eq('채권이 그만큼 준다', await arOf(), ar0 + 11000 - 4400)

  // 반품을 지우면 원상복구된다 — 되돌려받아 들여놨던 물건이 다시 나간다
  await must('DELETE', `/sales/${ret.id}`)
  eq('반품을 지우면 재고가 되돌아간다', await stockOf(f.product.id), stock0 - 10)
  eq('채권도 되돌아간다', await arOf(), ar0 + 11000)

  // ── 구매반품: 구매의 반대 — 물건이 나가고 채무가 준다
  const apOf = async () => {
    const rows = await must('GET', '/ledger/partner-balances')
    const r = rows.find((x) => x.partnerId === f.supplier.id)
    return r ? Number(r.payable ?? 0) : 0
  }
  const pStock0 = await stockOf(f.material.id)
  const ap0 = await apOf()
  const buy = await must('POST', '/purchases', {
    partnerId: f.supplier.id, warehouseId: f.warehouse.id, purchaseDate: '2026-07-20',
    lines: [{ itemId: f.material.id, quantity: 10, unitPrice: 500 }],
  })
  eq('구매하면 재고가 는다', await stockOf(f.material.id), pStock0 + 10)
  eq('채무가 는다', await apOf(), ap0 + 5500)

  const pRet = await must('POST', '/purchases', {
    partnerId: f.supplier.id, warehouseId: f.warehouse.id, purchaseDate: '2026-07-21',
    returnSlip: true,
    lines: [{ itemId: f.material.id, quantity: 3, unitPrice: 500 }],
  })
  eq('구매반품도 음수로 저장된다', Number(pRet.totalAmount), -1650)
  eq('되돌려주는 물건이 창고에서 나간다', await stockOf(f.material.id), pStock0 + 10 - 3)
  eq('채무가 그만큼 준다', await apOf(), ap0 + 5500 - 1650)

  /*
   * 재고보다 많이 되돌려줄 수는 없다. 반품도 <b>같은 재고 규칙</b>을 지난다 —
   * 부호만 뒤집었지 따로 난 길이 아니다.
   */
  await rejects('재고보다 많이 되돌려줄 수 없다', 'POST', '/purchases',
    {
      partnerId: f.supplier.id, warehouseId: f.warehouse.id, purchaseDate: '2026-07-21',
      returnSlip: true,
      lines: [{ itemId: f.material.id, quantity: 999999, unitPrice: 500 }],
    }, '재고가 부족합니다')

  /*
   * 네 화면이 이 구분을 <b>조건으로</b> 든다. 저장만 되고 걸리지 않으면
   * 화면에 이름만 있는 것과 같다 — 실제로 갈라지는지 잰다.
   */
  const bulk = async (kind) => (await must('GET',
    `/price-bulk/lines?tradeType=PURCHASE&from=2026-07-20&to=2026-07-21`
    + (kind ? `&tradeKind=${encodeURIComponent(kind)}` : '')))
    .filter((r) => r.docNo === buy.docNo || r.docNo === pRet.docNo)
  eq('단가일괄변경 [구매구분] 전체는 둘 다', (await bulk('')).length, 2)
  eq('일반만 고르면 일반 전표만', (await bulk('일반')).map((r) => r.docNo).join(), buy.docNo)
  eq('반품만 고르면 반품 전표만', (await bulk('반품')).map((r) => r.docNo).join(), pRet.docNo)

  const refl = (await must('GET', '/accounting-reflection?kind=PURCHASE'))
    .filter((r) => r.docNo === buy.docNo || r.docNo === pRet.docNo)
  /*
   * 원본 결제내역조회의 첫 열이 <b>[결제요청일시]</b> 다. 날짜만으로는 그 이름을 지킬 수 없고,
   * 같은 날 여러 건이면 순서도 안 보인다 — 응답이 전표를 만든 시각을 같이 준다.
   */
  eq('일괄회계반영 줄이 만든 시각을 싣는다',
    typeof refl[0].createdAt === 'string' && refl[0].createdAt.length >= 16, true)

  eq('일괄회계반영도 거래구분을 싣는다',
    refl.map((r) => `${r.docNo}=${r.tradeKind}`).sort().join(' '),
    [`${buy.docNo}=일반`, `${pRet.docNo}=반품`].sort().join(' '))

  /*
   * 원본 구매조회의 <b>[반품처리]</b> — 그 전표를 근거로 반품 전표를 <b>새로</b> 만든다.
   * 화면은 구매입력을 [거래구분: 반품]으로 열어 라인을 담아 주고, 저장은 평범한 등록이다.
   * 여기서 재는 것은 <b>원 전표가 손대지 않고 그대로 남는가</b>이다 —
   * 원 전표의 수량을 깎으면 애초에 그만큼만 산 것이 되어 이력이 사라진다.
   */
  const beforeBuy = (await must('GET', '/purchases')).find((x) => x.id === buy.id)
  const partial = await must('POST', '/purchases', {
    partnerId: f.supplier.id, warehouseId: f.warehouse.id, purchaseDate: '2026-07-22',
    returnSlip: true, remark: `반품 (근거전표 ${buy.docNo})`,
    lines: [{ itemId: f.material.id, quantity: 2, unitPrice: 500 }],
  })
  eq('일부만 되돌려줄 수 있다', Number(partial.lines[0].quantity), -2)
  const afterBuy = (await must('GET', '/purchases')).find((x) => x.id === buy.id)
  eq('원 전표의 수량은 그대로다',
    Number(afterBuy.lines[0].quantity), Number(beforeBuy.lines[0].quantity))
  eq('원 전표의 금액도 그대로다', Number(afterBuy.totalAmount), Number(beforeBuy.totalAmount))
  eq('근거전표를 적요에 남긴다', partial.remark.includes(buy.docNo), true)
  await must('DELETE', `/purchases/${partial.id}`)

  /*
   * 원본 구매입력 격자의 <b>[품질검사요청]</b>(열 id qcRequest_chk).
   *
   * <p>켜 두고 저장하면 그 줄의 품목·수량으로 입고검사 요청이 만들어진다. 지금까지는
   * 사 온 물건을 검사하려면 품질검사요청 화면에 가서 품목·수량을 <b>다시 적어야</b> 했고,
   * 옮겨 적는 사이에 수량이 어긋나면 검사한 것과 산 것이 다른 물건이 된다.
   *
   * <p>화면이 전표를 저장한 <b>뒤에</b> 요청을 만든다(생산입고 III 과 같은 흐름).
   * 여기서는 그 요청이 실제로 만들어지고 <b>산 수량 그대로</b> 실리는지를 잰다.
   */
  const qcBefore = (await must('GET', '/quality-inspection-requests')).length
  const qc = await must('POST', '/quality-inspection-requests', {
    type: 'INCOMING', itemId: f.material.id, requestQty: 10,
    requestDate: '2026-07-20', remark: `구매 ${buy.docNo}`,
  })
  eq('입고검사 요청이 만들어진다', qc.type, 'INCOMING')
  eq('수입검사로 표시된다', qc.typeName, '수입검사')
  eq('산 수량 그대로 실린다', Number(qc.requestQty), 10)
  eq('어느 구매에서 왔는지 남는다', qc.remark, `구매 ${buy.docNo}`)
  eq('요청 상태로 시작한다', qc.status, 'REQUESTED')
  await must('DELETE', `/quality-inspection-requests/${qc.id}`)
  eq('시험용 검사요청은 남기지 않는다',
    (await must('GET', '/quality-inspection-requests')).length, qcBefore)

  // 뒷정리 — 시험용 전표와 재고를 되돌린다
  await must('DELETE', `/purchases/${pRet.id}`)
  await must('DELETE', `/purchases/${buy.id}`)
  await must('DELETE', `/sales/${sale.id}`)
  eq('시험용 전표는 남기지 않는다', await stockOf(f.product.id), stock0)
  eq('구매 쪽 재고도 제자리', await stockOf(f.material.id), pStock0)
  await must('POST', '/stock/transactions', {
    itemId: f.product.id, warehouseId: f.warehouse.id, type: 'OUTBOUND', quantity: 20,
  })
  eq('넣어 둔 시험 재고도 뺀다', await stockOf(f.product.id), stock0 - 20)
}

async function scenarioNotFound() {
  section('■ 없는 경로')

  const r = await call('GET', '/definitely-not-a-real-path')
  eq('없는 경로는 404', r.status, 404)
  eq('메시지가 내부 사정을 흘리지 않는다', r.data?.message, '요청한 경로를 찾을 수 없습니다.')
  eq('"No static resource" 가 새어 나가지 않는다',
    String(r.data?.message ?? '').includes('No static resource'), false)

  // 지운 이익현황 엔드포인트가 되살아나면 여기서 잡힌다(매출−매입을 '이익'이라 부르던 것들).
  eq('/profit/daily 는 지워진 채로 있다', (await call('GET', '/profit/daily')).status, 404)
  eq('/profit/monthly 는 지워진 채로 있다', (await call('GET', '/profit/monthly')).status, 404)
}

/**
 * 정산(수금/지급). 삭제가 아예 없어서 잘못 넣은 전표를 지울 방법이 없었다 —
 * 정산은 거래처 채권·채무 잔액에 그대로 반영되므로 오타 하나가 잔액을 영구히 틀리게 만든다.
 */
async function scenarioSettlement(f) {
  section('■ 정산(수금/지급)')

  const receipt = await must('POST', '/settlements', {
    type: 'RECEIPT', partnerId: f.customer.id, amount: 550000, method: '계좌이체',
    settleDate: '2026-08-20', note: `${P} 수금`,
  })
  eq('수금 전표번호는 RC- 로 채번된다', receipt.docNo.startsWith('RC-'), true)
  eq('유형 이름이 온다', receipt.typeName, '수금')

  const payment = await must('POST', '/settlements', {
    type: 'PAYMENT', partnerId: f.supplier.id, amount: 330000, method: '현금',
    settleDate: '2026-08-21', note: `${P} 지급`,
  })
  eq('지급 전표번호는 PY- 로 채번된다', payment.docNo.startsWith('PY-'), true)

  await rejects('금액이 0이면 거부', 'POST', '/settlements', {
    type: 'RECEIPT', partnerId: f.customer.id, amount: 0, settleDate: '2026-08-20',
  }, '0보다')
  await rejects('없는 거래처는 거부', 'POST', '/settlements', {
    type: 'RECEIPT', partnerId: 999999, amount: 1000, settleDate: '2026-08-20',
  }, '거래처를 찾을 수 없습니다')

  /*
   * <b>채권 = 판매 − 수금, 채무 = 구매 − 지급.</b>
   *
   * 이건 눈으로 못 본다. 거래처별채권 화면에는 오래도록 "채권 = 판매 합계" 라고 적혀 있었고,
   * 그 말이 맞다면 수금을 넣어도 잔액이 그대로여야 한다. 실제 서버는 차감하고 있었으니
   * <b>화면 설명이 틀린 것</b>이었는데, 어느 쪽이 맞는지 아무도 확인하지 않았다.
   * 이제 여기서 확인한다 — 수금·지급을 넣었다 지우며 잔액이 오르내리는지 본다.
   */
  const balanceOf = async (partnerId) =>
    (await must('GET', '/ledger/partner-balances')).find((b) => b.partnerId === partnerId)
  const arAfter = await balanceOf(f.customer.id)
  const apAfter = await balanceOf(f.supplier.id)

  await must('DELETE', `/settlements/${receipt.id}`)
  await must('DELETE', `/settlements/${payment.id}`)

  const arBack = await balanceOf(f.customer.id)
  const apBack = await balanceOf(f.supplier.id)
  eq('수금은 채권에서 빠진다',
    Number(arBack.receivable) - Number(arAfter.receivable), 550000)

  /*
   * 받을 돈보다 더 받으면 채권이 <b>음수</b>가 된다(선수금). 그게 맞다 —
   * 다만 화면이 음수를 0 과 같은 회색으로 죽여 놔서 선수금 100만원이 '값 없음' 처럼 보였다.
   * 여기서는 서버가 음수를 제대로 내는지만 본다(색은 화면 몫이다).
   */
  const beforeAdvance = await balanceOf(f.customer.id)
  const advance = await must('POST', '/settlements', {
    type: 'RECEIPT', partnerId: f.customer.id, amount: Number(beforeAdvance.receivable) + 1000,
    method: '현금', settleDate: '2026-08-22', note: `${P} 선수금`,
  })
  const negative = await balanceOf(f.customer.id)
  eq('채권보다 많이 수금하면 음수(선수금)가 된다', Number(negative.receivable), -1000)
  await must('DELETE', `/settlements/${advance.id}`)
  eq('선수금을 지우면 원래 잔액으로 돌아온다',
    Number((await balanceOf(f.customer.id)).receivable), Number(beforeAdvance.receivable))
  eq('지급은 채무에서 빠진다',
    Number(apBack.payable) - Number(apAfter.payable), 330000)

  eq('지운 정산은 목록에서 빠진다',
    (await must('GET', '/settlements')).some((x) => x.id === receipt.id), false)
  await rejects('없는 정산 삭제는 404', 'DELETE', '/settlements/999999', undefined, '찾을 수 없습니다')
}

// ── main ────────────────────────────────────────────────────────────────────

/**
 * <b>마스터를 같은 값으로 다시 저장할 수 있나.</b>
 *
 * <p>화면에서 [수정]을 열었다가 아무것도 안 고치고 [저장]을 누르는 것과 같은 일이다.
 * 당연히 되어야 하는데 <b>오더관리유형이 이걸 못 했다</b> — order_type_steps 의
 * (order_type_id, seq) 유니크 인덱스에 걸려 409 로 막혔고, 단계를 한 번 정하고 나면
 * 다시는 고칠 수 없었다. 새로 만드는 것만 재던 단언들은 그걸 못 봤다.
 *
 * <p>그래서 <b>모든 마스터</b>를 같은 방식으로 재 둔다: 읽은 응답을 그대로 PUT 하고,
 * 200 인지와 <b>값이 그대로인지</b>를 본다. 값이 달라지면 어느 칸이 사라졌는지 적는다
 * (요청 DTO 에 없는 칸은 조용히 버려지므로 이 방식이 그것도 같이 잡는다).
 */
/**
 * <b>화면이 실제로 보내는 모양</b>으로 마스터를 고칠 수 있나.
 *
 * <p>창고·공정·관리항목은 <b>수정 화면이 아예 없었다</b> — 만들기만 되고, 이름이나
 * 표준시간을 잘못 넣으면 지우고 다시 만들어야 했는데 전표가 물려 있으면 지울 수도
 * 없었다. 백엔드 PUT 은 이미 있었고 화면만 없던 것이라, 화면이 보내는 그대로 재 둔다.
 *
 * <p>이름만 바꾼 요청에서 <b>나머지 칸이 살아남는지</b>도 같이 본다. 수정은 통째로
 * 덮으므로, 화면이 몇 칸만 보내면 안 보낸 칸이 조용히 지워진다.
 */
async function scenarioMasterEditFromScreen() {
  section('■ 화면이 보내는 모양으로 마스터 수정')

  /*
   * 원본 거래처리스트의 <b>[변경]</b> — 고른 거래처의 한 칸을 한 번에 바꾼다.
   * 담당자가 바뀌거나 그룹을 다시 나눌 때 거래처를 하나씩 열어 고칠 일이 아니다.
   *
   * <p>화면은 바꿀 칸만 얹고 <b>나머지는 있는 값 그대로</b> 보낸다. 수정은 통째로
   * 덮으므로 몇 칸만 보내면 검색창내용·주소2·단가그룹이 조용히 지워진다.
   */
  const bulkTarget = await must('POST', '/partners', {
    code: `${P}BULK`, name: `${P}일괄대상`, type: 'CUSTOMER',
    manager: '이전담당', searchKeyword: `${P}별칭`, address: '서울시 어딘가',
    salesPriceGroup: '단가A', remark: `${P}적요`,
  })
  const whole = (x, patch) => ({
    name: x.name, type: x.type, bizRegNo: x.bizRegNo, ceoName: x.ceoName,
    bizType: x.bizType, bizItem: x.bizItem, manager: x.manager,
    phone: x.phone, mobile: x.mobile, email: x.email, fax: x.fax, creditLimit: x.creditLimit,
    bankName: x.bankName, accountNo: x.accountNo, accountHolder: x.accountHolder,
    postalCode: x.postalCode, address: x.address,
    salesPriceGroup: x.salesPriceGroup, purchasePriceGroup: x.purchasePriceGroup,
    searchKeyword: x.searchKeyword, regNoKind: x.regNoKind, industryKind: x.industryKind,
    subBizNo: x.subBizNo, postalCode2: x.postalCode2, address2: x.address2,
    homepage: x.homepage, remark: x.remark, taxReport: x.taxReport,
    shipmentTarget: x.shipmentTarget, parentId: x.parentId, partnerGroupId: x.partnerGroupId,
    active: x.active, ...patch,
  })
  const bulkChanged = await must('PUT', `/partners/${bulkTarget.id}`,
    whole(bulkTarget, { manager: '새담당' }))
  eq('일괄변경이 그 칸을 바꾼다', bulkChanged.manager, '새담당')
  eq('검색창내용은 그대로', bulkChanged.searchKeyword, `${P}별칭`)
  eq('주소는 그대로', bulkChanged.address, '서울시 어딘가')
  eq('판매단가그룹은 그대로', bulkChanged.salesPriceGroup, '단가A')
  eq('적요는 그대로', bulkChanged.remark, `${P}적요`)

  // 비우는 것도 되어야 한다 — 원본도 빈 값을 허용한다(담당자 없음).
  const cleared = await must('PUT', `/partners/${bulkTarget.id}`, whole(bulkTarget, { manager: null }))
  isNull('담당자를 비울 수 있다', cleared.manager)
  await must('DELETE', `/partners/${bulkTarget.id}`)


  /*
   * 원본 품목등록 리스트의 <b>[변경]</b> — 고른 품목의 한 칸을 한 번에 바꾼다.
   * 거래처와 같은 규칙이다: 바꿀 칸만 얹고 나머지는 있는 값 그대로 보낸다.
   */
  const bulkGroup = await must('POST', '/item-groups', { code: `${P}G`, name: `${P}품목그룹` })
  const bulkItem = await must('POST', '/items', {
    code: `${P}BULKI`, name: `${P}일괄품목`, unit: 'EA', category: 'FINISHED',
    unitPrice: 1000, purchasePrice: 500, safetyStock: 1,
    spec: `${P}규격`, barcode: `${P}바코드`, searchKeyword: `${P}별칭`,
  })
  const wholeItem = (it, patch) => ({
    code: it.code, name: it.name, spec: it.spec, unit: it.unit, category: it.category,
    unitPrice: it.unitPrice, purchasePrice: it.purchasePrice ?? 0, safetyStock: it.safetyStock,
    barcode: it.barcode, searchKeyword: it.searchKeyword, udiDi: it.udiDi,
    stockTracked: it.stockTracked !== false, active: it.active,
    managementItemId: it.managementItemId ?? null, itemGroupId: it.itemGroupId ?? null,
    supplierId: it.supplierId ?? null, imageFileId: it.imageFileId ?? null, ...patch,
  })
  const grouped = await must('PUT', `/items/${bulkItem.id}`,
    wholeItem(bulkItem, { itemGroupId: bulkGroup.id }))
  eq('품목 일괄변경이 그룹을 붙인다', grouped.itemGroupId, bulkGroup.id)
  eq('규격은 그대로', grouped.spec, `${P}규격`)
  eq('바코드는 그대로', grouped.barcode, `${P}바코드`)
  eq('검색창내용은 그대로', grouped.searchKeyword, `${P}별칭`)
  eq('판매단가는 그대로', Number(grouped.unitPrice), 1000)

  const untracked = await must('PUT', `/items/${bulkItem.id}`,
    wholeItem(grouped, { stockTracked: false }))
  eq('수량관리제외로 한 번에 바꾼다', untracked.stockTracked, false)
  eq('그때도 그룹은 그대로', untracked.itemGroupId, bulkGroup.id)

  await must('DELETE', `/items/${bulkItem.id}`)
  await must('DELETE', `/item-groups/${bulkGroup.id}`)
  const wh = (await must('GET', '/warehouses'))[0]
  const whBody = {
    name: wh.name, location: wh.location, kind: wh.kind,
    processId: wh.processId, outsourcingPartnerId: wh.outsourcingPartnerId, active: wh.active,
  }
  const wh2 = await must('PUT', `/warehouses/${wh.id}`, { ...whBody, name: `${wh.name}${P}` })
  eq('창고 이름을 고칠 수 있다', wh2.name, `${wh.name}${P}`)
  eq('창고 위치가 살아남는다', wh2.location ?? null, wh.location ?? null)
  eq('창고 구분이 살아남는다', wh2.kind, wh.kind)
  await must('PUT', `/warehouses/${wh.id}`, whBody)

  const pr = (await must('GET', '/processes'))[0]
  const prBody = {
    sortOrder: pr.sortOrder, name: pr.name, workcenter: pr.workcenter,
    stdTimeMin: pr.stdTimeMin, costPerHr: pr.costPerHr, active: pr.active,
  }
  const pr2 = await must('PUT', `/processes/${pr.id}`, { ...prBody, name: `${pr.name}${P}` })
  eq('공정 이름을 고칠 수 있다', pr2.name, `${pr.name}${P}`)
  eq('공정 표준시간이 살아남는다', String(pr2.stdTimeMin), String(pr.stdTimeMin))
  eq('공정 시간당비용이 살아남는다', String(pr2.costPerHr), String(pr.costPerHr))
  await must('PUT', `/processes/${pr.id}`, prBody)

  const mg = (await must('GET', '/management-items'))[0]
  const mgBody = { name: mg.name, description: mg.description ?? undefined, active: mg.active }
  const mg2 = await must('PUT', `/management-items/${mg.id}`, { ...mgBody, name: `${mg.name}${P}` })
  eq('관리항목 이름을 고칠 수 있다', mg2.name, `${mg.name}${P}`)
  eq('관리항목 설명이 살아남는다', mg2.description ?? null, mg.description ?? null)
  await must('PUT', `/management-items/${mg.id}`, mgBody)

  eq('셋 다 원래 이름으로 돌아왔다',
    [(await must('GET', '/warehouses')).find((x) => x.id === wh.id).name,
      (await must('GET', '/processes')).find((x) => x.id === pr.id).name,
      (await must('GET', '/management-items')).find((x) => x.id === mg.id).name].join(','),
    [wh.name, pr.name, mg.name].join(','))
}

async function scenarioMasterResave() {
  section('■ 마스터를 같은 값으로 다시 저장')

  const PATHS = ['/collect-sources', '/currencies', '/departments', '/employees', '/items',
    '/management-items', '/order-stages', '/order-types', '/partners', '/processes',
    '/resources', '/supplies', '/warehouses']

  for (const p of PATHS) {
    const list = await call('GET', p)
    if (!list.ok || !Array.isArray(list.data) || list.data.length === 0) continue
    const row = list.data[0]
    const before = JSON.stringify(row)
    const again = await call('PUT', `${p}/${row.id}`, row)
    eq(`${p} 를 같은 값으로 다시 저장해도 된다`, again.status, 200)
    if (!again.ok) continue
    const after = (await must('GET', p)).find((x) => x.id === row.id)
    const lost = Object.keys(row).filter((k) => JSON.stringify(row[k]) !== JSON.stringify(after?.[k]))
    eq(`${p} 를 다시 저장해도 값이 그대로다`, lost.join(',') || '없음', '없음')
  }
}

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
  await scenarioUnsold(fixtures)
  await scenarioUnshippedMatchesRemaining(fixtures)
  await scenarioSaleWithinOrder(fixtures)
  await scenarioPurchaseDiscountBase(fixtures)
  await scenarioPriceBulkField(fixtures)
  await scenarioSpecialPrice(fixtures)
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
  await scenarioSupplyUsage()
  await scenarioSurvey()
  await scenarioSettlement(fixtures)
  scenarioSourceRules()
  scenarioPermissionCoverage()
  await scenarioStatusScreenContracts(fixtures)
  await scenarioPayrollReadGuard()
  await scenarioTenantIsolation()
  await scenarioDocNo(fixtures)
  await scenarioDoubleProcess(fixtures)
  await scenarioConfirmTransition(fixtures)
  await scenarioHttpProtocol()
  await scenarioDeleteInUse(fixtures)
  await scenarioNotFound()
  await scenarioInactiveMaster(fixtures)
  await scenarioSlipDelete(fixtures)
  await scenarioValidationMessages(fixtures)
  await scenarioStockRecalc()
  await scenarioGroups(fixtures)
  await scenarioSlipPriceBulk(fixtures)
  await scenarioNestedValidation(fixtures)
  await scenarioWoEfficiencyFields()
  await scenarioCostRollForward()
  await scenarioVarianceInputs(fixtures)
  await scenarioStandardCostBuild(fixtures)
  await scenarioBor(fixtures)
  await scenarioActualCost(fixtures)
  await scenarioOrderStages(fixtures)
  await scenarioPaymentCompare(fixtures)
  await scenarioStatementReceivable(fixtures)
  await scenarioExpenseDocNo()
  await scenarioTimeCalc(fixtures)
  await scenarioLineCustomFields(fixtures)
  await scenarioAccountingReflectionByPartner(fixtures)
  await scenarioResourceLocation()
  await scenarioWorkProcess(fixtures)
  await scenarioShipmentDelivery(fixtures)
  await scenarioWarehouseKind()
  await scenarioMaterialIssueMove(fixtures)
  await scenarioWorkResultResource()
  await scenarioProcessOrderAndOperations()
  await scenarioLeaveDocNo()
  await scenarioProductionWarehouses(fixtures)
  await scenarioPartnerMovements(fixtures)
  await scenarioWorkPostEdit()
  await scenarioReflectionLines(fixtures)
  await scenarioSalesExtraCost(fixtures)
  await scenarioShipmentLineRemark(fixtures)
  await scenarioUserEmployeeLink()
  await scenarioStockTracked(fixtures)
  await scenarioPartnerContactAndBank()
  await scenarioVacationYear(fixtures)
  await scenarioApprovalLastActor()
  await scenarioSalesConfirmBulk(fixtures)
  await scenarioWorkOrderPartner(fixtures)
  await scenarioIssueEmployee(fixtures)
  await scenarioShipmentSettlementProject(fixtures)
  await scenarioPlanToWorkOrder(fixtures)
  await scenarioCostBasis(fixtures)
  await scenarioInactiveItemGuards(fixtures)
  await scenarioSettlementAccounting(fixtures)
  await scenarioBookmarks()
  await scenarioPlanGenerate(fixtures)
  await scenarioInactiveProcessGuards()
  await scenarioInactiveMasterGuards(fixtures)
  await scenarioEmployeeMaster(fixtures)
  await scenarioWorkPostAttachment()
  await scenarioSurveyAttachment()
  await scenarioStockAsOf(fixtures)
  await scenarioProductionLaborMinutes(fixtures)
  await scenarioProductionBatch(fixtures)
  await scenarioWorkResultBatch(fixtures)
  await scenarioReturnSlip(fixtures)
  await scenarioMasterResave()
  await scenarioMasterEditFromScreen()
  await scenarioAsConsumption(fixtures)
  await scenarioQuotationWarehouseProject(fixtures)

  checkDeadAssertions()

  console.log(`\n${'─'.repeat(50)}`)
  console.log(`통과 ${pass} · 실패 ${fail}`)
  if (fail > 0) {
    console.log('\n실패가 있습니다. 위 ❌ 항목을 확인하세요.')
    process.exit(1)
  }
  console.log('전부 통과했습니다.')
}

/**
 * <b>한 번도 재 보지 않은 단언</b>을 찾는다.
 *
 * <p>조건문 안에 든 단언은 그 조건이 거짓이면 그냥 사라진다 — 화면에 ✅ 조차 안 뜨므로
 * <b>없어진 줄도 모른다.</b> 통과 수만 보고 있으면 영영 눈치채지 못한다.
 *
 * <p>실제로 네 번 겪었다. 급여의 '확정 전' 단언은 첫 실행이 명세를 확정해 버려서
 * 두 번째 실행부터 죽었고, 사원등록의 '처음 상태' 셋은 사원을 지우지 않게 바꾸면서 죽었고,
 * 단가일괄변경의 면세 단언은 개발 자료에 면세 줄이 없어 <b>한 번도</b> 안 돌았고,
 * 생산입고 노무시간은 조건문 안에서 통과만 하고 있었다.
 *
 * <p>이름이 템플릿(\`${...}\`)인 단언은 뺀다 — 실행할 때 값이 박혀 이름이 달라진다.
 * '건너뜀' 이라고 이름에 적어 둔 것도 뺀다 — 그건 안 도는 것이 정상인 안내다.
 */
function checkDeadAssertions() {
  const src = readFileSync(new URL('./qa.mjs', import.meta.url), 'utf8')
  const declared = new Set()
  for (const m of src.matchAll(/\b(?:eq|isNull|rejects)\('([^']+)'/g)) {
    if (!m[1].includes('${') && !m[1].includes('건너뜀')) declared.add(m[1])
  }
  // 자기 자신은 뺀다 — 이 단언은 검사가 끝난 <b>뒤에</b> 담기므로 늘 안 돈 것으로 보인다.
  const SELF = '모든 단언이 이번 실행에서 실제로 돌았다'
  const dead = [...declared].filter((d) => d !== SELF && !ranLabels.has(d)).sort()

  section('■ 한 번도 재 보지 않은 단언')
  eq('모든 단언이 이번 실행에서 실제로 돌았다',
    dead.length ? dead.join(' / ') : '없음', '없음')
}

main().catch((e) => {
  console.error(`\n중단: ${e.message}`)
  process.exit(2)
})
