#!/usr/bin/env node
/**
 * 모듈 의존 검사 — 백엔드 소스의 import 로 모듈 간 간선을 재서, CLAUDE.md 4.1 표와 맞춘 허용 목록에 없는
 * <b>새 간선</b>이 생기면 실패한다(래칫). 서버 없이 돈다.
 *
 *   node qa/arch-check.mjs
 *
 * 2026-10-01(QA 13회차)에 재 보니 표는 "순환이 없다(DAG)" 고 했는데 실제로는 순환이 넷 있었다
 * (accounting↔trade · accounting↔hr · accounting↔groupware · hr↔trade). 한꺼번에 끊기엔 크다 —
 * 그래서 지금 있는 것은 KNOWN 으로 적어 두고(끊을 때마다 지운다), <b>더 늘지는 않게</b> 막는다.
 * qa.mjs 의 '기반층이 위층을 참조하지 않는다' 는 inventory·settings·auth 만 봤다 — 이건 전부 본다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'

const ROOT = new URL('../backend/src/main/java/com/erp/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const MODULES = ['common', 'auth', 'inventory', 'trade', 'production', 'accounting', 'quality', 'hr', 'groupware', 'settings']

/** CLAUDE.md 4.1 표의 간선 — 설계상 허용. */
const ALLOWED = [
  'trade→inventory',
  'production→inventory', 'production→trade',
  'quality→inventory', 'quality→trade',
  'accounting→inventory', 'accounting→trade', 'accounting→production',
  'hr→accounting',
  'groupware→auth', 'groupware→trade', 'groupware→inventory',
  'auth→settings',
  // 통화(Currency)는 설정 모듈의 기준자료다 — 수출·은행계좌가 든다(14회차, 그 전엔 accounting 에 있어 accounting↔trade 순환)
  'trade→settings', 'accounting→settings',
]
/** 표에 없는데 지금 있는 간선(부채). 끊으면 여기서 지운다 — 남아 있는데 없어지면 지우라고 알려 준다. */
const KNOWN = {
  'trade→hr': '판매·구매·주문의 담당자가 Employee 엔티티 — hr↔trade, hr→accounting→trade 순환',
  'hr→trade': '사원 실적이 판매·구매를 읽는다(EmployeePerformanceService)',
  'hr→auth': '근태가 User 를 든다',
  'accounting→hr': '급여이체 분개·원천징수가 Payslip·PayrollTransfer 를 읽는다 — accounting↔hr 순환',
  'groupware→accounting': '전자결재 첨부 전표가 지출(Expense)을 든다',
}

const walk = (d) => readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))

const edges = new Map()
for (const m of MODULES) {
  let files
  try { files = walk(join(ROOT, m)).filter((f) => f.endsWith('.java')) } catch { continue }
  for (const f of files) {
    for (const x of readFileSync(f, 'utf8').matchAll(/com\.erp\.(\w+)\.[\w.]*[A-Z]\w*/g)) {
      const t = x[1]
      if (t === m || !MODULES.includes(t) || t === 'common') continue
      const k = `${m}→${t}`
      if (!edges.has(k)) edges.set(k, new Set())
      edges.get(k).add(`${basename(f)} → ${x[0].split('.').pop()}`)
    }
  }
}

let fail = 0
console.log('■ 모듈 의존 (CLAUDE.md 4.1)')
for (const [k, ex] of [...edges].sort()) {
  if (ALLOWED.includes(k)) continue
  if (KNOWN[k]) { console.log(`  ⚠ ${k} (알려진 부채: ${KNOWN[k]})`); continue }
  fail++
  console.log(`  ❌ ${k} — 표에 없는 새 의존. 예: ${[...ex].slice(0, 3).join(', ')}`)
}
for (const k of Object.keys(KNOWN)) {
  if (!edges.has(k)) { fail++; console.log(`  ❌ ${k} 는 이제 없다 — KNOWN 에서 지우세요(래칫을 조인다)`) }
}
const cycles = [...edges.keys()].filter((k) => { const [a, b] = k.split('→'); return edges.has(`${b}→${a}`) && a < b })
console.log(`  순환: ${cycles.length ? cycles.map((k) => k.replace('→', '↔')).join(', ') : '없음'}`)
console.log(fail ? `\n실패 ${fail}` : '\n새 의존 없음')
process.exit(fail ? 1 : 0)
