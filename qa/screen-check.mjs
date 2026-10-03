#!/usr/bin/env node
/**
 * 화면 점검 — 실제로 그려진 화면을 헤드리스 Chrome 으로 훑는다. 타입체크·ui-check(소스 읽기)가
 * 못 보는 것, 즉 <b>그려진 결과</b>를 본다.
 *
 *   node qa/screen-check.mjs            # 라우트 전부
 *   node qa/screen-check.mjs sales      # 그 접두사(/sales)의 라우트만 — Git Bash 는 '/sales' 를 C:/Program Files/Git/sales 로 바꾼다
 *
 * 보는 것
 *  1. 빈 화면 — 라우트를 열었는데 #root 가 비었다(런타임 오류로 하얗게 뜬 것).
 *  2. 열 이름에 '규격' 이 있는데 규격을 안 찍는 칸 — 품목 마스터에서 규격이 있는 품목의 이름이
 *     칸에 보이는데 그 규격은 안 보이면 걸린다. 이름이 같고 규격만 다른 품목이 나란히 서면
 *     어느 줄이 어느 것인지 볼 길이 없다(5회차 #23 — 미출하현황·창고이동현황이 그랬다).
 *     소스를 읽어 열과 칸을 짝짓는 방식은 조건부 열·map 때문에 50개 표 중 3개만 짝지어져 버렸다.
 *
 *  3. 눌러 봐도 깨지지 않는가 — 화면마다 알약 버튼(보기형식·정렬·진행상태 …)을 차례로 누르고
 *     [검색]을 누른 뒤, 그동안 난 <b>JS 예외 · 실패한 API(4xx/5xx) · 빈 화면</b>을 모은다.
 *     저장·삭제처럼 자료를 바꾸는 버튼은 누르지 않는다.
 *
 * 자료가 없는 화면은 2번을 볼 수 없다 — 결과에 '본 표' 수를 같이 찍는다.
 */
import { readFileSync } from 'node:fs'
import { API, openBrowser } from './browser.mjs'

const raw = process.argv[2] ?? ''
const prefix = raw ? '/' + raw.replace(/^[A-Za-z]:.*?\/Git\//, '').replace(/^\/+/, '') : ''
const router = readFileSync(new URL('../frontend/src/app/router.tsx', import.meta.url), 'utf8')
const routes = [...new Set([...router.matchAll(/path="([^"]+)"/g)].map((m) => m[1]))]
  .filter((p) => p.startsWith('/') && !p.includes(':') && !p.includes('*') && p !== '/login' && p.startsWith(prefix || '/'))

const b = await openBrowser()
const items = await (await fetch(`${API}/items`, { headers: { Authorization: `Bearer ${b.token}` } })).json()
// 이름 → 규격들. 규격이 있는 품목만 본다(없으면 찍을 게 없다).
const specsByName = {}
for (const i of items) if (i.spec && i.name.length >= 2) (specsByName[i.name] ??= []).push(i.spec)

const scan = `(() => {
  const specsByName = ${JSON.stringify(specsByName)};
  const names = Object.keys(specsByName).sort((a, b) => b.length - a.length);
  const root = document.getElementById('root');
  const out = { blank: !root || root.innerText.trim().length < 20, tables: 0, bad: [] };
  for (const table of document.querySelectorAll('table')) {
    const head = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!head) continue;
    // colspan 을 펼쳐 열 번호를 맞춘다
    const cols = [];
    for (const th of head.cells) for (let k = 0; k < (th.colSpan || 1); k++) cols.push(th.innerText.trim());
    const idx = cols.findIndex((t) => /규격/.test(t) && /품목|자재|제품/.test(t));
    if (idx < 0) continue;
    out.tables++;
    for (const tr of table.tBodies[0]?.rows ?? []) {
      const pos = []; for (const td of tr.cells) for (let k = 0; k < (td.colSpan || 1); k++) pos.push(td);
      if (pos.length !== cols.length) continue;           // 소계·펼침 줄
      const text = pos[idx].innerText;
      const name = names.find((n) => text.includes(n));
      if (!name) continue;
      if (specsByName[name].some((s) => text.includes(s))) continue;
      out.bad.push('[' + cols[idx] + '] ' + text.replace(/\\s+/g, ' ').slice(0, 60) + '  (규격: ' + specsByName[name].slice(0, 3).join('/') + ')');
      break;                                              // 표마다 한 줄이면 충분하다
    }
  }
  return out;
})()`

/* 알약을 차례로 누르고 [검색] — 자료를 바꾸지 않는 버튼만 */
const poke = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let clicked = 0;
  for (const p of [...document.querySelectorAll('.ec-pill')].slice(0, 20)) {
    if (!p.isConnected) continue;
    p.click(); clicked++; await sleep(120);
  }
  const search = [...document.querySelectorAll('button')].find((b) => /^(검색|Search)/.test(b.textContent.trim()));
  if (search) { search.click(); clicked++; await sleep(700); }
  const root = document.getElementById('root');
  return { clicked, blank: !root || root.innerText.trim().length < 20 };
})()`

const problems = []
let clicks = 0
let tablesSeen = 0
try {
  for (const r of routes) {
    let res
    try {
      await b.goto(r, 1200)
      res = await b.evaluate(scan)
      for (const e of b.takeErrors()) problems.push(`${r}  열 때 ${e}`)
      const poked = await b.evaluate(poke)
      clicks += poked.clicked
      for (const e of b.takeErrors()) problems.push(`${r}  눌러 보니 ${e}`)
      if (poked.blank && !res.blank) problems.push(`${r}  눌러 보니 빈 화면`)
    } catch (e) {
      problems.push(`${r}  열지 못함: ${e.message.slice(0, 80)}`)
      continue
    }
    tablesSeen += res.tables
    if (res.blank) problems.push(`${r}  빈 화면`)
    for (const x of res.bad) problems.push(`${r}  규격 안 찍음 ${x}`)
  }
} finally {
  await b.close()
}

console.log(`라우트 ${routes.length}개 · 품목(규격) 열이 있는 표 ${tablesSeen}개 · 버튼 ${clicks}번 눌러 봤다`)
if (problems.length) {
  console.log(problems.map((p) => '  ❌ ' + p).join('\n'))
  process.exit(1)
}
console.log('  ✅ 문제 없음')
