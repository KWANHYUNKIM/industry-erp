#!/usr/bin/env node
/**
 * 프론트 코드 래칫 — 한 번 치운 것이 다시 쌓이지 않게 막는다. 서버 없이 돈다(docs/프론트-코드-정리.md 5장).
 *
 *   node qa/front-guard.mjs            검사
 *   node qa/front-guard.mjs --update   지역 won · num 기준(qa/front-guard-baseline.json)을 지금 상태로 조인다
 *
 * 막는 것
 *   fetch   전역 fetch( 직접 호출 — api/client 를 쓴다(인증 · 회사 머리 · 오류 알림이 거기 있다).
 *           예외: api/client.ts · utils/fileDownload.ts. `x.fetch(` 처럼 점 뒤의 이름은 세지 않는다.
 *   dialog  window.alert( · window.confirm( · 맨 alert( · confirm( — 화면 안 창 ecAlert · ecConfirm(components/EcDialog)을 쓴다.
 *           기본 창은 탭의 JS 를 멈춰 같은 Chrome 을 쓰는 작업자 · 자동 검사를 세운다(CLAUDE.md 10.1).
 *   won     파일 최상위의 지역 `const won = …` — utils/format.ts 의 fmtAmount · fmtAmountBlank … 에서 고른다.
 *           아직 남은 파일은 기준에 적혀 있고, 새 파일에 생기면 실패. 기준 파일에서 없어지면 --update 로 조이라고 알린다.
 *   num     파일 최상위의 지역 `const num = …` — 같은 이름이 '표시'(toLocaleString)와 '읽기'(문자열 → 숫자) 두 일을 했다.
 *           표시는 utils/format 의 fmt*, 읽기는 parseNum(콤마 지움) · parseNumPlain(콤마 안 지움). won 과 같은 방식의 기준.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('../frontend/src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const BASELINE = new URL('./front-guard-baseline.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const walk = (d) => readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
/** 주석 · 문자열을 비운다(줄 수는 그대로 — 줄 번호를 찍으려고). */
const code = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''")

const FETCH_OK = new Set(['api/client.ts', 'utils/fileDownload.ts'])
const DIALOG_OK = new Set(['components/EcDialog.tsx'])
const bad = []
const wonFiles = []
const numFiles = []
for (const f of walk(ROOT).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))) {
  const rel = relative(ROOT, f).replace(/\\/g, '/')
  const src = readFileSync(f, 'utf8')
  const c = code(src)
  const lineOf = (i) => c.slice(0, i).split('\n').length
  if (!FETCH_OK.has(rel))
    for (const m of c.matchAll(/(?<![.\w$])fetch\(/g)) bad.push(`fetch   ${rel}:${lineOf(m.index)} — api/client 의 api.get/post 를 쓰세요`)
  if (!DIALOG_OK.has(rel))
    for (const m of c.matchAll(/\bwindow\.(alert|confirm)\(|(?<![.\w$])(alert|confirm)\(/g)) {
      // 지역 함수 이름이 confirm 인 경우(async function confirm(…)) · 그 호출은 뺀다
      const name = m[1] ?? m[2]
      if (!m[1] && new RegExp(`(?:function|const|let)\\s+${name}\\b`).test(c)) continue
      bad.push(`dialog  ${rel}:${lineOf(m.index)} — window.${name} 대신 ${name === 'alert' ? 'ecAlert' : 'await ecConfirm'}(components/EcDialog)`)
    }
  if (/^(?:export )?const won = /m.test(src)) wonFiles.push(rel)
  if (/^(?:export )?const num = /m.test(src)) numFiles.push(rel)
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
base.won ??= []
base.num ??= []
if (process.argv.includes('--update')) {
  writeFileSync(BASELINE, JSON.stringify({ won: wonFiles.sort(), num: numFiles.sort() }, null, 1) + '\n')
  console.log(`기준을 적었다 — 지역 won ${wonFiles.length} 파일 · 지역 num ${numFiles.length} 파일`)
  process.exit(bad.length ? 1 : 0)
}
const known = new Set(base.won)
for (const f of wonFiles) if (!known.has(f)) bad.push(`won     ${f} — 지역 won 을 새로 만들지 말고 utils/format 의 fmtAmount · fmtAmountBlank · fmtNumber … 에서 고르세요`)
const gone = base.won.filter((f) => !wonFiles.includes(f))
if (gone.length) bad.push(`won     기준보다 줄었다(${gone.length}) — node qa/front-guard.mjs --update 로 조이세요: ${gone.slice(0, 5).join(' · ')}${gone.length > 5 ? ' …' : ''}`)
const knownNum = new Set(base.num)
for (const f of numFiles) if (!knownNum.has(f)) bad.push(`num     ${f} — 지역 num 을 새로 만들지 말고 utils/format 의 fmt* · parseNum 을 쓰세요(표시는 fmtNumber · fmtAmount …, 글자 → 숫자는 parseNum · parseNumPlain)`)
const goneNum = base.num.filter((f) => !numFiles.includes(f))
if (goneNum.length) bad.push(`num     기준보다 줄었다(${goneNum.length}) — node qa/front-guard.mjs --update 로 조이세요: ${goneNum.slice(0, 5).join(' · ')}${goneNum.length > 5 ? ' …' : ''}`)
if (bad.length) { console.log(bad.join('\n')); console.log(`❌ front-guard ${bad.length}`); process.exit(1) }
console.log(`✅ front-guard — fetch 0 · alert/confirm 0 · 지역 won ${wonFiles.length} 파일 · 지역 num ${numFiles.length} 파일(기준 그대로)`)
