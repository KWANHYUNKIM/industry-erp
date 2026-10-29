// 진행자용 — 데이터이관 프로젝트가 얼마나 됐고 언제 끝나는지 한 화면으로. 의존성 없음.
//   node qa/migrate-progress.mjs
// 근거: plans/데이터이관/_진행.md 의 진행표(원본 건수 | 넣은 건수), _현황판.md 의 '경우' 체크리스트(- [x] / - [ ]),
//       git log 의 '루프 N회' 커밋 시각(최근 회차 간격 → 속도).
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const base = '.claude/skills/ecount-diff/plans/데이터이관/'
// 스레드마다 진행 파일 · 현황판이 따로 있다(_진행.md · _진행-B.md …) — 모두 합쳐 센다.
const files = fs.readdirSync(base)
const prog = files.filter((f) => /^_진행.*\.md$/.test(f)).map((f) => fs.readFileSync(base + f, 'utf8')).join('\n')
const board = files.filter((f) => /^_현황판.*\.md$/.test(f)).map((f) => fs.readFileSync(base + f, 'utf8')).join('\n')

/** '26' · '26+' · '11 · 13' · '49 품목 · 창고별' · '1전표 2줄' → 앞쪽 숫자들의 합(· 로 나뉜 것만). */
function count(cell) {
  const nums = cell.split('·').map((p) => p.trim().match(/^(\d+)/)?.[1]).filter(Boolean).map(Number)
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null
}

const rows = []
for (const line of prog.split('\n')) {
  const c = line.split('|').map((s) => s.trim())
  if (c.length < 7 || c[1] === '모듈' || /^-+$/.test(c[1])) continue
  const total = count(c[3]); const done = count(c[4])
  if (total == null || done == null) continue
  rows.push({ name: `${c[1]} ${c[2]}`, total, done: Math.min(done, total), note: c[5] })
}

const bar = (r) => { const n = Math.round(r * 20); return '█'.repeat(n) + '░'.repeat(20 - n) }
const pct = (a, b) => (b ? Math.round((a * 100) / b) : 100)

const vouchers = rows.filter((r) => /전표|입력|이동|견적|주문|발주|출하|불량|생산입고|수금|출금|반영|실사|급여|근태|결재|일지|신고/.test(r.name))
const masters = rows.filter((r) => !vouchers.includes(r))
const sum = (xs, k) => xs.reduce((a, r) => a + r[k], 0)

console.log('■ 데이터이관 진척\n')
for (const [title, xs] of [['기초자료', masters], ['전표', vouchers]]) {
  const t = sum(xs, 'total'); const d = sum(xs, 'done')
  console.log(`${title.padEnd(6)} ${bar(d / t)} ${String(pct(d, t)).padStart(3)}%  (${d} / ${t})`)
  for (const r of xs.filter((x) => x.done < x.total)) console.log(`   · ${r.name.padEnd(28)} ${r.done}/${r.total}`)
}

const cases = [...board.matchAll(/^- \[( |x)\] (.+)$/gm)].map((m) => ({ done: m[1] === 'x', text: m[2] }))
const cd = cases.filter((c) => c.done).length
if (cases.length) {
  console.log(`\n경우    ${bar(cd / cases.length)} ${String(pct(cd, cases.length)).padStart(3)}%  (${cd} / ${cases.length})`)
  for (const c of cases.filter((x) => !x.done)) console.log(`   · ${c.text}`)
}

// 속도: 최근 '루프 N회' 커밋 간격(같은 날 연달아 돈 것만 — 퇴근 사이 간격은 뺀다)
let mins = null
try {
  const ts = execSync('git log --format=%ct --grep="루프 [0-9]*회" -n 12').toString().trim().split('\n').map(Number)
  const gaps = ts.slice(0, -1).map((t, i) => (t - ts[i + 1]) / 60).filter((g) => g > 0 && g < 60)
  if (gaps.length) mins = gaps.reduce((a, b) => a + b, 0) / gaps.length
} catch { /* git 없음 */ }

const leftV = sum(vouchers, 'total') - sum(vouchers, 'done')
const leftC = cases.length - cd
console.log('\n■ 남은 시간')
if (mins) {
  const h = (n) => { const m = n * mins; return m < 60 ? `${Math.round(m)}분` : `${(m / 60).toFixed(1)}시간` }
  console.log(`회차당 평균 ${mins.toFixed(0)}분 (최근 회차 커밋 간격)`)
  console.log(`· 안 해 본 경우만(${leftC}개, 회차당 하나): 약 ${h(leftC)}`)
  console.log(`· 남은 전표 전부(${leftV}건, 회차당 한 건): 약 ${h(leftV)}`)
} else console.log('회차 커밋이 없어 속도를 못 잼')
