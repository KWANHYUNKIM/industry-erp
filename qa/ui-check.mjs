#!/usr/bin/env node
/**
 * 화면 정적 검사 — 타입체크가 통과시키는데 화면에서 어긋나는 것들.
 *
 *   node qa/ui-check.mjs
 *
 *  1) 표의 헤더 열 수 vs 합계행(tfoot) 열 수
 *     합계행 colSpan 을 잘못 잡으면 합계 칸이 밀려서 엉뚱한 열 아래 붙는다.
 *     타입체크는 아무 말도 안 한다. 이 저장소에서 가장 자주 낸 실수라 못 박아 둔다.
 *
 *  2) 메뉴가 가리키는 경로 vs 실제 라우트
 *     메뉴에만 있으면 눌렀을 때 빈 화면이 뜨고, 라우트에만 있으면 메뉴로 닿을 수 없다
 *     (실제로 채권/채무현황의 채무 쪽이 라우트 없이 화면만 있었다).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

let pass = 0
let fail = 0
const eq = (label, actual, expected) => {
  const ok = String(actual) === String(expected)
  console.log(`  ${ok ? '✅' : '❌'} ${label}`)
  if (!ok) String(actual).split('\n').forEach((l) => console.log(`     ${l}`))
  ok ? pass++ : fail++
}

/**
 * `to={'/a/b'}` · `to="/a/b"` · `to: (p) => `/a/b`` · `navigate('/a/b')` 를 잡는다.
 * 템플릿 문자열은 ${ 앞까지만 본다. 문자 범위로 자르면 한글이 든 경로가
 * 조용히 잘려 나가 '/sales/' 같은 조각이 되고, 그러면 깨진 길을 못 잡는다.
 * 처음엔 `to=` 만 봤는데, 정작 바로가기 목록을 배열로 두면 `to:` 라서 하나도 안 잡혔다.
 */
const LINK_RE = /(?:to=\{?|to:\s*(?:\([^)]*\)\s*=>\s*)?|navigate\()\s*[`'"](\/[^`'"$\s)]*)/g
const SEP = /[\\/]/
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

// ── 1) 표 열 수 ────────────────────────────────────────────────────────────
console.log('\n■ 표 헤더 ↔ 합계행 열 수')

/** colSpan 을 반영해 센다. colSpan={표현식} 이면 정적으로 못 세므로 null. */
const countCells = (row, tag) => {
  let total = 0
  for (const m of row.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))) {
    const attrs = m[1]
    const fixed = attrs.match(/colSpan=\{(\d+)\}/)
    if (fixed) total += Number(fixed[1])
    else if (attrs.includes('colSpan')) return null
    else total += 1
  }
  return total
}
const firstRow = (block) => block.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/)?.[1] ?? null
// 조건부 열이 섞인 표는 셀 수가 상황마다 달라 정적으로 셀 수 없다.
const hasConditionalCell = (block) => /\{[^{}]*(?:&&|\?)[^{}]*<t[hd]\b/s.test(block)

const mismatches = []
let compared = 0
let skipped = 0
for (const f of walk('frontend/src/pages').filter((x) => x.endsWith('.tsx'))) {
  const src = readFileSync(f, 'utf8')
  for (const tm of src.matchAll(/<table\b[\s\S]*?<\/table>/g)) {
    const t = tm[0]
    const head = t.match(/<thead\b[\s\S]*?<\/thead>/)?.[0]
    const foot = t.match(/<tfoot\b[\s\S]*?<\/tfoot>/)?.[0]
    if (!head || !foot) continue
    if (hasConditionalCell(head) || hasConditionalCell(foot)) { skipped++; continue }
    const hRow = firstRow(head)
    const fRow = firstRow(foot)
    if (!hRow || !fRow) { skipped++; continue }
    const hc = countCells(hRow, 'th')
    const fc = countCells(fRow, 'td')
    if (hc === null || fc === null || !hc || !fc) { skipped++; continue }
    compared++
    if (hc !== fc) {
      const line = src.slice(0, tm.index).split('\n').length
      mismatches.push(`${f.split(sep).pop()}:${line}  헤더 ${hc}칸 vs 합계행 ${fc}칸`)
    }
  }
}
eq(`표 ${compared}개의 헤더와 합계행 열 수가 같다 (조건부 열 ${skipped}개는 정적으로 셀 수 없어 건너뜀)`,
  mismatches.join('\n') || '없음', '없음')

// ── 1-a2) 표 헤더 ↔ tbody 본문 열 수 ──────────────────────────────────────
/*
 * <b>헤더가 약속한 열 수와 본문이 그리는 열 수가 같은가.</b>
 *
 * <p>1-a 는 합계행만 봤다. 합계행이 없는 표는 아무도 안 보고 있었고, 실제로
 * 오더관리유형리스트가 <b>헤더 8칸 · 본문 6칸</b>으로 돌아가고 있었다 —
 * 헤더에는 [담당자]·[입력메뉴에서 사용] 이 있는데 본문은 그 자리에 설명을 그리고
 * 뒤 두 칸을 아예 안 그려서, 사용구분이 두 칸 밀려 담당자 자리에 찍혔다.
 * <b>화면은 멀쩡해 보인다</b> — 밀린 것을 알아채려면 원본과 나란히 놓아야 한다.
 *
 * <p>불러오는 중·데이터 없음 같은 안내 줄은 뺀다(colSpan 하나로 다 덮는 줄이다).
 */
console.log('\n■ 표 헤더 ↔ 본문 열 수')

const bodyMismatch = []
let bodyCompared = 0
let bodySkipped = 0
for (const f of walk('frontend/src/pages').filter((x) => x.endsWith('.tsx'))) {
  const src = readFileSync(f, 'utf8')
  for (const tm of src.matchAll(/<table\b[\s\S]*?<\/table>/g)) {
    const t = tm[0]
    const head = t.match(/<thead\b[\s\S]*?<\/thead>/)?.[0]
    const body = t.match(/<tbody\b[\s\S]*?<\/tbody>/)?.[0]
    if (!head || !body) continue
    if (hasConditionalCell(head) || hasConditionalCell(body)) { bodySkipped++; continue }

    // 머리든 본문이든 한쪽만 그래도 두 쪽을 견줄 수 없다(설문조사입력의 보기항목 5칸이 그렇다).
    /*
     * <b>칸을 만드는 map</b> 이 있으면 정적으로 셀 수 없다 — 자료 수만큼 칸이 늘어난다
     * (설문조사입력의 보기항목 5칸, 오더관리유형리스트의 1~10단계).
     *
     * <p>줄을 만드는 map(`rows.map((r) => (<tr>…`)은 그냥 지나간다. 그것까지 건너뛰면
     * 거의 모든 표가 빠져 이 검사가 아무것도 안 보게 된다(실제로 301개 중 2개만 봤다).
     * 가르는 기준은 <b>map 뒤에 처음 나오는 표 태그</b>다 — tr 이면 줄, td/th 면 칸.
     */
    const mapsCells = (x) => {
      for (const m of x.matchAll(/\.map\(/g)) {
        const after = x.slice(m.index)
        const first = after.match(/<(tr|td|th)\b/)
        if (first && first[1] !== "tr") return true
      }
      return false
    }
    if (mapsCells(head) || mapsCells(body)) { bodySkipped++; continue }
    const hRow = firstRow(head)
    if (!hRow) { bodySkipped++; continue }
    const hc = countCells(hRow, 'th')
    if (hc === null || !hc) { bodySkipped++; continue }
    /*
     * 자료 줄 = tbody 안에서 <td> 가 두 칸 이상인 첫 줄. 한 칸짜리는 안내 줄이다.
     * 여러 줄을 그려도 자료 줄의 모양은 하나뿐이라 첫 줄이면 충분하다.
     */
    let picked = null
    let unknown = false
    for (const rm of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
      const c = countCells(rm[1], 'td')
      if (c === null) { unknown = true; break }
      if (c >= 2) { picked = c; break }
    }
    if (unknown || picked === null) { bodySkipped++; continue }
    bodyCompared++
    if (picked !== hc) {
      const line = src.slice(0, tm.index).split('\n').length
      bodyMismatch.push(`${f.split(sep).pop()}:${line}  헤더 ${hc}칸 vs 본문 ${picked}칸`)
    }
  }
}
eq(`표 ${bodyCompared}개의 헤더와 본문 열 수가 같다 (정적으로 셀 수 없는 ${bodySkipped}개는 건너뜀)`,
  bodyMismatch.join('\n') || '없음', '없음')

// ── 1-b) 조건부 열 표의 런타임 검사 ────────────────────────────────────────
console.log('\n■ 조건부 열 표의 개발 모드 검사')

/**
 * 위 정적 검사는 조건부 열(&&, ?:)이 섞인 표를 셀 수 없어 건너뛴다.
 * 그 표들은 useTableColumnCheck 훅이 렌더된 DOM 을 직접 재서 잡는데,
 * <b>훅만 부르고 ref 를 요소에 안 달면 조용히 아무것도 안 한다</b> — 실제로 그렇게 넣었다가 고쳤다.
 * 훅을 쓰는 화면은 ref 가 실제로 달려 있어야 한다.
 */
{
  const pages = walk('frontend/src/pages').filter((f) => f.endsWith('.tsx'))
  const bad = []
  let hooked = 0
  for (const f of pages) {
    const src = readFileSync(f, 'utf8')
    // 한 화면에 표가 둘이면 훅도 둘이다 — 첫 번째만 보면 나머지는 그냥 새 나간다.
    for (const call of src.matchAll(/useTableColumnCheck\(\s*(\w+)/g)) {
      hooked++
      if (!new RegExp(`ref=\\{${call[1]}\\}`).test(src)) {
        bad.push(`${f.split(sep).pop()}: ${call[1]} 를 요소에 안 달았다`)
      }
    }
  }
  eq(`훅 호출 ${hooked}개가 ref 를 요소에 달았다`, bad.join('\n') || '없음', '없음')
}

// ── 1-c) tbody 의 넓은 칸 ─────────────────────────────────────────────────
console.log('\n■ tbody 의 넓은 칸이 표 너비와 맞나')

/**
 * "내역이 없습니다" 한 줄은 표 전체를 가로질러야 하고, 소계 줄의 넓은 칸도 남는 칸을
 * 정확히 덮어야 한다. colSpan 이 모자라면 문구가 왼쪽에만 붙고 오른쪽이 비고,
 * 넘치면 표가 옆으로 삐져나온다.
 *
 * <p>열을 빼거나 더할 때 이 숫자를 같이 안 고쳐서 생긴다 — 실제로 미출하현황에서
 * 열을 10개에서 9개로 줄이면서 colSpan={10} 을 그대로 뒀다.
 * 위 1) 검사는 헤더와 <b>합계행(tfoot)</b>만 보므로 tbody 의 이 줄은 아무도 안 봤다.
 *
 * <p><b>칸 하나가 아니라 줄 전체로 센다.</b> 4칸 표의 "납부세액 | colSpan=3" 처럼
 * 다른 칸과 나눠 덮는 줄이 흔하다. colSpan 만 보면 그게 전부 오류로 잡힌다.
 */
{
  /** map 이 칸을 찍어 내는 표(기간 버킷·피벗 열)는 열 수가 자료에 따라 달라 못 센다. */
  const hasMappedCell = (block) => /\.map\([\s\S]{0,300}?<t[hd]\b/.test(block)

  const bad = []
  let checked = 0
  let skipped = 0
  for (const f of walk('frontend/src/pages').filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(f, 'utf8')
    for (const tm of src.matchAll(/<table\b[\s\S]*?<\/table>/g)) {
      const t = tm[0]
      const head = t.match(/<thead\b[\s\S]*?<\/thead>/)?.[0]
      const body = t.match(/<tbody\b[\s\S]*?<\/tbody>/)?.[0]
      if (!head || !body) continue
      if (hasConditionalCell(head) || hasMappedCell(head)) { skipped++; continue }
      const hRow = firstRow(head)
      if (!hRow) continue
      const cols = countCells(hRow, 'th')
      if (!cols) continue
      for (const rm of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
        const row = rm[1]
        // 넓은 칸(3칸 이상)이 있는 줄만 본다 — 보통 빈 상태 문구나 소계 줄이다.
        if (!/colSpan=\{([3-9]|\d\d+)\}/.test(row)) continue
        if (hasConditionalCell(row) || hasMappedCell(row)) { skipped++; continue }
        const width = countCells(row, 'td')
        if (width === null || !width) continue
        checked++
        if (width !== cols) {
          const line = src.slice(0, tm.index + rm.index).split('\n').length
          bad.push(`${f.split(sep).pop()}:${line}  열 ${cols}칸인데 줄은 ${width}칸`)
        }
      }
    }
  }
  eq(`넓은 칸이 든 줄 ${checked}개가 표 너비와 맞는다 (열이 자료에 따라 변하는 ${skipped}개는 건너뜀)`,
    bad.join('\n') || '없음', '없음')
}

// ── 1-d) 훅이 콜백 안에 들어갔나 ──────────────────────────────────────────
console.log('\n■ 훅을 컴포넌트 최상위에서 부르나')

/**
 * React 훅은 컴포넌트 본문 <b>최상위</b>에서만 불러야 한다. 콜백 안에 들어가면
 * 그 콜백이 도는 렌더에서만 훅이 세어져 다음 렌더에 개수가 달라지고,
 * React 가 "Rendered fewer hooks than expected" 로 화면을 통째로 죽인다.
 *
 * <p>특히 <b>useState(() => {…}) 의 초기화 함수</b>가 위험하다. 첫 렌더에만 돌기 때문이다.
 * 실제로 업무일지에서 useShortcut 한 줄이 그 안에 들어가 있었다 — 스크립트로 훅을
 * "마지막 useState 다음 줄"에 끼워 넣다가 여러 줄짜리 초기화 함수 안에 떨어진 것이다.
 * 타입체크는 아무 말도 안 한다.
 */
{
  const HOOK = /\buse[A-Z]\w*\s*\(/
  const bad = []
  let checked = 0
  for (const f of walk('frontend/src').filter((x) => x.endsWith('.tsx') || x.endsWith('.ts'))) {
    const src = readFileSync(f, 'utf8')
    const lines = src.split('\n')
    // 아주 단순한 중괄호 깊이 추적: 컴포넌트 본문(깊이 1)보다 깊은 곳의 훅 호출을 본다.
    let depth = 0
    let inComponent = false
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '')
      if (/^(export default )?function [A-Z]/.test(code.trim()) || /^const [A-Z]\w* = \(/.test(code.trim())) {
        inComponent = true
        depth = 0
      }
      const opens = (code.match(/[{(]/g) ?? []).length
      const closes = (code.match(/[})]/g) ?? []).length
      const before = depth
      depth += opens - closes
      if (!inComponent) return
      if (!HOOK.test(code)) return
      // 훅 줄이 시작될 때의 깊이가 1(컴포넌트 본문)보다 깊으면 콜백 안이다.
      if (before > 1) {
        checked++
        bad.push(`${f.split(sep).pop()}:${i + 1}  ${code.trim().slice(0, 60)}`)
      } else {
        checked++
      }
    })
  }
  eq(`훅 호출 ${checked}개가 컴포넌트 최상위에 있다`, bad.join('\n') || '없음', '없음')
}

// ── 2) 메뉴 ↔ 라우트 ───────────────────────────────────────────────────────
console.log('\n■ 메뉴 ↔ 라우트')

const app = readFileSync('frontend/src/App.tsx', 'utf8')
const menu = readFileSync('frontend/src/components/EcountLayout.tsx', 'utf8')

const routes = new Set([...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]))
const menuTargets = new Map()
/*
 * <b>잎만</b> 잡는다. 예전 정규식(label 뒤 아무 to)은 그룹 라벨과 첫 자식의 to 를 이어
 * 붙였다 — 실패 메시지에 '월별이익 → /accounting/cost-build' 처럼 엉뚱한 짝이 찍혔다.
 */
for (const m of menu.matchAll(/\{ label: '([^']+)', to: '([^']+)'/g)) {
  const path = m[2].split('?')[0]
  menuTargets.set(path, [...(menuTargets.get(path) ?? []), m[1]])
}

/** /a/:id 같은 동적 세그먼트도 맞다고 본다. */
const matches = (path) => {
  if (routes.has(path)) return true
  for (const r of routes) {
    if (!r.includes(':')) continue
    const rp = r.replace(/^\//, '').split('/')
    const pp = path.replace(/^\//, '').split('/')
    if (rp.length === pp.length && rp.every((a, i) => a.startsWith(':') || a === pp[i])) return true
  }
  return false
}

const dead = [...menuTargets.keys()].filter((p) => !matches(p)).sort()
eq('메뉴가 가리키는 경로에 라우트가 다 있다',
  dead.map((p) => `${p}  (${menuTargets.get(p).join(', ')})`).join('\n') || '없음', '없음')

// ── 2-b) 화면 안에서 코드로 만드는 바로가기도 살아 있나 ────────────────────
console.log('\n■ 화면 안 바로가기 ↔ 라우트')

/*
 * 메뉴에 없는 <Link to=...> 나 navigate(...) 로 가는 길이 있다. 거래처중심입력의
 * 바로가기 묶음이 그렇다 — 라우트를 옮기거나 지우면 그 버튼은 눌러야만 죽은 것이 드러난다.
 * 쿼리스트링은 ? 앞까지만 본다.
 */
{
  const pageFiles = walk('frontend/src/pages')
  const bad = []
  for (const f of pageFiles) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(LINK_RE)) {
      const path = m[1].split('?')[0].replace(/\/$/, '')
      if (!path || path === '/') continue
      if (!matches(path)) bad.push(f.split(SEP).pop() + "  " + path)
    }
  }
  eq('화면 안 바로가기가 가리키는 경로에 라우트가 다 있다',
    [...new Set(bad)].sort().join('\n') || '없음', '없음')
}

// ── 2-c) 화면이 구분해 보여 주는 것을 메뉴가 지목하나 ──────────────────────
console.log('\n■ 메뉴 이름 ↔ 화면이 여는 자리')

/*
 * 서로 다른 이름의 메뉴 둘이 <b>글자까지 똑같은 경로</b>를 가리키는데, 그 화면이
 * 두 이름을 각각 다른 탭·구분으로 갖고 있으면 <b>무엇을 눌러도 첫 번째 것이 뜬다.</b>
 *
 * 실제로 그랬다. [근로소득원천징수영수증]을 눌러도 원천징수이행상황신고서가 떴고
 * ([전혀 다른 서류다] — 신고서는 매월 세무서에, 영수증은 연말정산 뒤 근로자에게 준다),
 * [입금보고서]·[가지급금정산서]를 눌러도 지출결의서가 떴다.
 * 라우트는 있으니 위 검사들은 전부 통과했다.
 *
 * <b>화면이 그 이름을 문자열로 갖고 있을 때만</b> 건다 — 그때는 화면 스스로가
 * "이 둘은 다른 것" 이라고 말하고 있는 셈이다. 이름이 그냥 비슷한 경우는 걸지 않는다.
 */
{
  const byTo = new Map()
  for (const m of menu.matchAll(/\{ label: '([^']+)', to: '([^']+)'/g)) {
    byTo.set(m[2], [...new Set([...(byTo.get(m[2]) ?? []), m[1]])])
  }
  const routeComp = new Map()
  for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)) routeComp.set(m[1], m[2])
  const compFile = new Map()
  for (const m of app.matchAll(/const (\w+) = lazy\(\(\) => import\('\.\/([^']+)'\)\)/g)) compFile.set(m[1], m[2])
  for (const m of app.matchAll(/import (\w+) from '\.\/([^']+)'/g)) compFile.set(m[1], m[2])

  const bad = []
  for (const [to, labels] of byTo) {
    if (labels.length < 2) continue
    const rel = compFile.get(routeComp.get(to.split('?')[0]))
    if (!rel) continue
    const file = 'frontend/src/' + rel + '.tsx'
    if (!existsSync(file)) continue
    const src = readFileSync(file, 'utf8')
    const own = labels.filter((l) => src.includes("'" + l + "'"))
    if (own.length >= 2) bad.push(to + '  (' + own.join(' · ') + ')')
  }
  eq('화면이 나눠 놓은 것을 메뉴가 각각 지목한다', bad.sort().join('\n') || '없음', '없음')
}

// ── 2-d) 형제 메뉴의 성격이 갈리지 않나 ────────────────────────────────────
console.log('\n■ 형제 메뉴는 같은 종류인가')

/*
 * <b>이름이 나란한 형제 메뉴(생산입고 I·II·III)가 성격이 갈리면</b> 알린다.
 *
 * <p>메뉴 [생산입고 I(BOM기준소모)]이 오랫동안 <b>조회 화면</b>을 가리키고 있었다.
 * 원본의 생산입고 I·II·III 은 셋 다 입력인데 우리만 I 이 조회였고, 정작 입력은
 * 원본에 없는 이름([생산실적])에 숨어 있었다. 사람은 셋이 같은 종류라고 읽고
 * I 에서 입력을 찾다가 못 찾는다 — <b>경로는 멀쩡해서</b> 기존 검사에 안 걸렸다.
 *
 * <p>이름 하나만 보고 "[입력]으로 끝나면 저장이 있어야 한다" 로 잡으려 했는데
 * 그 규칙은 이 버그를 <b>못 잡는다</b>('생산입고 I(BOM기준소모)' 은 입력으로 안 끝난다).
 * 접미사를 넓히면 재고수불부·일보·집계표 같은 멀쩡한 조회 화면 49개가 걸려 예외 목록이
 * 검사보다 길어진다. 그래서 <b>형제끼리만</b> 견준다 — 무리가 셋뿐이라 잡음이 없고,
 * 갈리는 순간 그것은 거의 항상 실수다.
 *
 * <p>형제는 뒤에 붙은 로마숫자·괄호를 뗀 줄기가 같은 메뉴들이다.
 */
{
  const routeComp2 = new Map()
  for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)/g)) routeComp2.set(m[1], m[2])
  const compFile2 = new Map()
  for (const m of app.matchAll(/const (\w+) = lazy\(\(\) => import\('\.\/([^']+)'\)\)/g)) compFile2.set(m[1], m[2])
  for (const m of app.matchAll(/import (\w+) from '\.\/([^']+)'/g)) compFile2.set(m[1], m[2])

  /** 뒤에 붙은 (…) 와 로마숫자·번호를 떼고 남는 줄기. 줄기가 같으면 형제다. */
  const stem = (s) => s.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s*(I{1,3}|IV|V|\d+)\s*$/, '').trim()

  const groups = new Map()
  for (const m of menu.matchAll(/\{ label: '([^']+)', to: '([^']+)'/g)) {
    const label = m[1]
    const rel = compFile2.get(routeComp2.get(m[2].split('?')[0]))
    if (!rel) continue
    const file = 'frontend/src/' + rel + '.tsx'
    if (!existsSync(file)) continue
    // 저장하는 화면은 반드시 쓰기 요청을 한다. api.post<T>(…) 처럼 제네릭이 붙기도 한다.
    const saves = /api\.(post|put|patch)[<(]/.test(readFileSync(file, 'utf8'))
    const k = stem(label)
    if (k === label) continue          // 형제가 아닌 홑이름
    const cur = groups.get(k) ?? []
    if (!cur.some((x) => x.label === label)) cur.push({ label, saves })
    groups.set(k, cur)
  }

  const mixed = []
  let families = 0
  for (const [k, ms] of groups) {
    if (ms.length < 2) continue
    families++
    if (new Set(ms.map((x) => x.saves)).size > 1) {
      mixed.push(k + ' — ' + ms.map((x) => x.label + (x.saves ? '(저장O)' : '(저장X)')).join(' · '))
    }
  }
  eq('형제 메뉴 ' + families + '무리가 저마다 같은 종류다', mixed.join('\n') || '없음', '없음')
}

// ── 2-e) 원본 메뉴 이름 ↔ 우리 메뉴 이름 ──────────────────────────────────
console.log('\n■ 원본 메뉴 이름을 우리도 쓰고 있나')

/*
 * <b>원본(이카운트) 좌측 메뉴에 있는 이름을 우리도 그대로 쓰는가.</b>
 *
 * <p>qa/fixtures/ecount-menu.json 은 사본 173장의 좌측 메뉴(link_depth3/4)에서 뽑은
 * 탭별 항목이다. 사본마다 열려 있는 탭이 달라 전부 모아야 한 벌이 된다.
 *
 * <p>이 검사가 없을 때 [작업소요시간(BOR)]·[생산계획(MRP)리스트]·[오더관리유형리스트]가
 * 원본과 다른 이름으로 오래 남아 있었다. 이름이 다르면 원본과 대조할 때마다
 * <b>같은 화면인지 아닌지를 사람이 매번 다시 판단</b>해야 한다.
 *
 * <p>없는 것을 억지로 만들라는 검사가 아니다 — 만들지 않기로 한 것은 <b>이유를 적어</b>
 * 예외에 둔다. 적을 말이 없으면 그건 예외가 아니라 빠뜨린 것이다.
 */
{
  const capMenu = JSON.parse(readFileSync('qa/fixtures/ecount-menu.json', 'utf8'))

  /** 원본에 있으나 우리 메뉴에 그 이름이 없는 것. 왜 없는지를 적는다. */
  const NOT_OURS = new Map([
    // 원본 좌측 메뉴의 접힌 그룹 이름. 우리는 그 아래 항목만 평평하게 둔다.
    ['BOM(소요량)', '원본의 접힌 그룹 이름 — 우리는 그 아래 [BOM(소요량)등록] 만 둔다'],
    ['공정', '접힌 그룹 이름 — 아래에 공정등록·자원등록이 있다'],
    ['작업지시서', '접힌 그룹 이름'],
    ['작업', '접힌 그룹 이름 — 아래에 작업내역입력·조회·현황이 있다'],
    ['생산입고', '접힌 그룹 이름'],
    ['생산불출', '접힌 그룹 이름 — 우리는 겸용 화면 하나를 [생산불출] 로 건다'],
    ['비용내역', '접힌 그룹 이름'],
    ['단가관리', '접힌 그룹 이름 — 아래 네 항목을 우리는 기초등록에 평평하게 둔다'],
    ['기본 메일함', '접힌 그룹 이름'],

    // 한 화면이 원본의 입력·조회를 겸한다. 없는 이름을 만들지 않고 있는 것만 건다.
    ['출하입력', '출하지시서조회 화면이 입력을 겸한다'],
    ['출하지시서입력', '위와 같다'],
    ['생산불출입력', '[생산불출] 한 화면이 입력·조회를 겸한다'],
    ['생산불출조회', '위와 같다'],
    ['작업지시서입력', '[작업지시] 한 화면이 입력·조회를 겸한다'],
    ['작업지시서조회', '위와 같다'],
    ['비용내역조회', '[비용내역현황] 이 조회를 겸한다'],

    // 화면 안에 있는 것 — 메뉴로 나누지 않는다.
    ['메일 쓰기', '메일함 화면 안의 버튼이다'],
    ['전체 메일함', '메일함 화면 왼쪽 트리에 원본 이름 그대로 있다'],
    ['받은 메일함', '위와 같다'],
    ['보낸 메일함', '위와 같다'],
    ['수신확인함', '위와 같다'],
    ['임시 보관함', '위와 같다'],
    ['스팸 메일함', '위와 같다'],
    ['지운 메일함', '위와 같다'],

    // 아직 안 만든 것 — 무엇을 그릴지 잴 근거가 없다.
    ['판매입력 II', '조정 그리드 구조를 사본만으로 확정할 수 없다(금액조정항목명·증감구분)'],
    ['외주비회계반영', '외주가공비를 전표로 받는 자리가 없어 반영할 것이 없다. 화면 사본도 없다'],
    ['품목별단가', '화면 사본이 없어 무엇을 그릴지 잴 수가 없다'],
    ['각종코드변경', '위와 같다'],
    ['인쇄용결재라인등록(재고)', '우리 인쇄 결재란은 [인쇄용결재라인] 하나로 두고 재고/회계를 안 가른다'],
    ['진척관리', '원본의 접힌 그룹 이름이고, 그 아래 건설예정공정표·SW개발일정관리는 우리에게 있다'],
    ['거래처관리대장 I', '우리는 [거래처관리대장] 한 이름으로 걸고 채권·채무 전용 둘을 더 둔다'],
    ['거래처관리대장 II', '거래처별채권·거래처별채무가 그 자리다'],
  ])

  const ourLabels = new Set([...menu.matchAll(/label: '([^']+)'/g)].map((m) => m[1]))
  const norm = (s) => s.replace(/[\s()[\]/·.]/g, '')
  const ourNorm = new Set([...ourLabels].map(norm))
  const tabs = new Set(Object.keys(capMenu))

  const missing = []
  let counted = 0
  for (const [tab, items] of Object.entries(capMenu)) {
    for (const t of items) {
      if (tabs.has(t)) continue          // 탭 이름이 항목 목록에 섞여 들어온 것
      counted++
      if (ourNorm.has(norm(t))) continue
      if (NOT_OURS.has(t)) continue
      missing.push(tab + ' / ' + t)
    }
  }
  eq('원본 메뉴 이름 ' + counted + '개 중 우리가 안 쓰는 것은 이유가 적힌 ' + NOT_OURS.size + '개뿐',
    missing.join('\n') || '없음', '없음')
}

// ── 2-f) 원본 기본 조회기간 ↔ 우리 기본값 ────────────────────────────────
console.log('\n■ 화면을 열었을 때 보이는 기간이 원본과 같나')

/*
 * <b>화면마다 처음 보이는 기간이 원본과 같은가.</b>
 *
 * <p>qa/fixtures/ecount-period-default.json 은 사본 조건 판에 <b>눌려 있던</b> 기간
 * 빠른선택이다. 늘 있는 것(금일·전일·금주…)은 빼고 그 화면만의 것만 남겼다.
 *
 * <p>이게 다르면 같은 화면인데 <b>처음 보이는 숫자가 다르다.</b> 판매현황은 원본이
 * [전월+금월]인데 우리는 금월(~오늘)이라 지난달에 판 것이 안 보였고, 구매현황은
 * 아예 비워 두어 몇 해치가 한 번에 쏟아졌다. 작업지시서작업처리는 원본이
 * [최근30일(+1개월)]로 <b>미래까지</b> 보는데 우리는 오늘까지만 봐서, 아직 안 온 납기의
 * 작업지시가 목록에서 빠져 '할 일이 없다' 로 보였다.
 *
 * <p>화면 파일에서 periodOf('…') 로 잡는다. 기간을 그 함수로 안 정하는 화면은
 * 정적으로 알 수 없어 건너뛴다.
 */
{
  const capPeriod = JSON.parse(readFileSync('qa/fixtures/ecount-period-default.json', 'utf8'))

  /** 사본 화면 이름 → 우리 화면 파일 */
  const FILE_OF = new Map([
    ['판매현황', 'trade/SalesStatusPage.tsx'],
    ['구매현황', 'trade/PurchaseStatusPage.tsx'],
    ['거래처관리대장 I', 'trade/PartnerLedgerPage.tsx'],
    ['결제내역자료비교', 'trade/PaymentComparePage.tsx'],
    ['구매할인현황', 'trade/PurchaseDiscountPage.tsx'],
    ['수금현황', 'trade/CollectionPage.tsx'],
    ['지급현황', 'trade/CollectionPage.tsx'],
    ['업무일지', 'groupware/WorkLogPage.tsx'],
    ['작업지시서작업처리', 'production/WorkProcessPage.tsx'],
  ])

  /** 아직 못 맞춘 것. 왜 못 맞추는지를 적는다. */
  const NOT_YET = new Map([
    ['거래처별채권', '기간이 아니라 기준일자 한 점으로 보는 화면이라 그 버튼을 걸 자리가 없다'],
    ['거래처별채무', '위와 같다'],
    ['설문조사현황', '기간을 periodOf 로 정하지 않는다 — 설문 목록을 통째로 받아 거른다'],
  ])

  const bad = []
  let checked = 0
  for (const [fam, labels] of Object.entries(capPeriod)) {
    if (NOT_YET.has(fam)) continue
    const rel = FILE_OF.get(fam)
    if (!rel) { bad.push(fam + '  (어느 화면인지 안 이어 놓았다)'); continue }
    const file = 'frontend/src/pages/' + rel
    if (!existsSync(file)) { bad.push(fam + '  (' + rel + ' 없음)'); continue }
    const src = readFileSync(file, 'utf8')
    checked++
    // 그 화면이 쓰는 periodOf 라벨 가운데 원본 기본값이 하나라도 있으면 통과.
    const used = [...src.matchAll(/periodOf\('([^']+)'\)/g)].map((m) => m[1])
    if (!labels.some((l) => used.includes(l))) {
      bad.push(fam + '  원본 [' + labels.join(' | ') + '] · 우리 [' + [...new Set(used)].join(' | ') + ']')
    }
  }
  eq('기간 기본값을 잰 화면 ' + checked + '개가 원본과 같다 (못 맞춘 ' + NOT_YET.size + '개는 이유가 적혀 있다)',
    bad.join('\n') || '없음', '없음')
}

// ── 2-g) 원본 [구분] 기본값 ↔ 우리 기본 모드 ─────────────────────────────
console.log('\n■ 화면을 열었을 때 켜져 있는 [구분]이 원본과 같나')

/*
 * <b>조건 판의 [구분] 라디오 중 원본이 켜 둔 것과 우리 기본 모드가 같은가.</b>
 *
 * <p>qa/fixtures/ecount-mode-default.json 은 사본 조건 판에서 <b>checked 가 붙은</b>
 * 라디오를 뽑은 것이다.
 *
 * <p>판매일괄회계반영이 원본은 [거래처별]로 열리는데 우리는 [전표별]로 열고 있었다.
 * 회계반영은 거래처 단위로 묶어서 하는 일이라, 전표별로 열면 같은 거래처가 여러 줄로
 * 흩어져 <b>한 번에 반영할 것을 눈으로 모아야</b> 한다. 기간과 마찬가지로
 * 화면을 열었을 때 보이는 모양이 원본과 다른 것이다.
 */
{
  const capMode = JSON.parse(readFileSync('qa/fixtures/ecount-mode-default.json', 'utf8'))

  /** 사본 화면 이름 → 우리 화면 파일 */
  const FILE_OF = new Map([
    ['판매현황', 'trade/SalesStatusPage.tsx'],
    ['출하현황', 'trade/ShipmentPage.tsx'],
    ['출하지시서현황', 'trade/ShipmentOrderStatusPage.tsx'],
    ['미출하현황', 'trade/UnshippedPage.tsx'],
    ['판매일괄회계반영', 'trade/AccountingReflectionPage.tsx'],
  ])

  const bad = []
  let checked = 0
  for (const [fam, conds] of Object.entries(capMode)) {
    const rel = FILE_OF.get(fam)
    if (!rel) { bad.push(fam + '  (어느 화면인지 안 이어 놓았다)'); continue }
    const file = 'frontend/src/pages/' + rel
    if (!existsSync(file)) { bad.push(fam + '  (' + rel + ' 없음)'); continue }
    const src = readFileSync(file, 'utf8')
    const want = conds['구분']
    if (!want) continue
    // 기본 모드는 useState<...>('…') 로 잡는다. 못 찾으면 셀 수 없어 알린다.
    const got = src.match(/useState<(?:Mode|Tab)[^>]*>\('([^']+)'\)/)
    if (!got) { bad.push(fam + '  (기본 모드를 useState 에서 못 찾았다)'); continue }
    checked++
    if (got[1] !== want['기본']) {
      bad.push(fam + '  원본 [' + want['기본'] + '] · 우리 [' + got[1] + ']')
    }
  }
  eq('[구분] 기본값을 잰 화면 ' + checked + '개가 원본과 같다', bad.join('\n') || '없음', '없음')
}

// ── 1-e) 코드도움 후보를 안 받고 쓰지 않나 ────────────────────────────────
console.log('\n■ 코드도움 후보를 받아 놓고 쓰나')

/*
 * <b>useCondPickers 가 안 받는 목록을 화면이 쓰고 있지 않나.</b>
 *
 * <p>이 훅은 받을 것을 인자로 고른다(품목이 수천 건인 회사에서 모든 화면이 품목을 받으면
 * 조건을 안 쓰는 화면까지 느려진다). 그래서 <b>인자에 없는 것을 쓰면 빈 배열</b>이 온다 —
 * 코드도움 팝업이 <b>아무것도 없는 채로</b> 뜨고, 화면은 멀쩡해 보인다.
 * 조건에 걸 후보가 없으니 "그런 거래처가 없다" 처럼 읽힌다.
 *
 * <p>실제로 담당자 조건을 코드도움으로 바꾸면서 10개 화면이 그 상태가 됐다.
 * 타입은 통과한다 — pickers.employees 는 늘 있는 필드이고 값이 빈 배열일 뿐이다.
 */
{
  const bad = []
  let checked = 0
  for (const f of walk('frontend/src/pages').filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(f, 'utf8')
    const call = src.match(/useCondPickers\(\[([^\]]*)\]\)/)
    if (!call) continue
    checked++
    const want = new Set([...call[1].matchAll(/'(\w+)'/g)].map((m) => m[1]))
    const used = new Set([...src.matchAll(/pickers\.(\w+)/g)].map((m) => m[1]))
    const miss = [...used].filter((u) => !want.has(u))
    if (miss.length) {
      bad.push(f.split(sep).pop() + '  안 받고 쓰는 것: ' + miss.join(', '))
    }
  }
  eq('코드도움을 쓰는 화면 ' + checked + '개가 쓰는 것을 다 받는다', bad.join('\n') || '없음', '없음')
}

// ── 1-f) 마스터 조건은 코드도움인가 ───────────────────────────────────────
console.log('\n■ 마스터를 고르는 조건이 코드도움인가')

/*
 * <b>창고·거래처·품목·프로젝트·담당자·관리항목 조건이 코드도움인가.</b>
 *
 * <p>원본은 이 조건들을 모두 코드도움으로 둔다(사본 조건 판에 [선택] 버튼이 붙어 있다).
 * 우리는 41개 화면 101개 조건이 "거래처명 일부" 를 손으로 치는 칸이었다 —
 * 거래처가 300곳이 넘으면 <b>이름을 외우고 있는 사람만</b> 쓸 수 있고, 한 글자 틀리면
 * 아무것도 안 나오는데 화면은 "그런 자료가 없다" 처럼 보인다.
 *
 * <p>더 나빴던 것은 <b>화면마다 달랐다</b>는 점이다. 같은 [거래처] 조건이 어떤 화면에서는
 * 골라지고 어떤 화면에서는 안 골라지면, 사람은 그것을 버그로 안 읽고 자기 탓으로 읽는다.
 *
 * <p>날짜·번호·금액 칸은 마스터가 아니라 그대로 친다 — 여기서 안 본다.
 */
{
  const MASTER = new Set(['창고', '거래처', '품목', '프로젝트', '담당자',
    '거래처관리담당자', '관리항목', '생산품목', '소모품목'])
  const bad = []
  let checked = 0
  for (const f of walk('frontend/src/pages').filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/<EcCond label="([^"]+)"[^>]*>([\s\S]{0,460}?)<\/EcCond>/g)) {
      const label = m[1].replace(/\s/g, '')
      if (!MASTER.has(label)) continue
      checked++
      const body = m[2]
      if (/CodePickerField/.test(body)) continue
      const kind = /<select/.test(body) ? 'select' : /<input/.test(body) ? '직접입력' : '알 수 없음'
      bad.push(f.split(sep).pop() + '  [' + label + '] ' + kind)
    }
  }
  eq('마스터 조건 ' + checked + '개가 코드도움이다', bad.join('\n') || '없음', '없음')
}

// ── 3) 메뉴 그룹 ↔ 권한 ────────────────────────────────────────────────────
console.log('\n■ 같은 메뉴 그룹은 같은 권한')

/**
 * 한 메뉴 그룹(재고현황·영업관리현황 …) 안의 화면들은 같은 권한으로 묶여야 한다.
 * 하나만 다른 바구니에 들어가면 메뉴가 사람마다 들쭉날쭉해진다 —
 * STOCK_MOVE 만 가진 사람에게 재고현황은 보이는데 창고별재고현황은 안 보이는 식이다.
 *
 * 실제로 새로 만든 재고현황 8개가 접두어 규칙에 걸려 INV_MASTER 로 새고 있었다.
 */
{
  const menuSrc = readFileSync('frontend/src/components/EcountLayout.tsx', 'utf8')
  const permSrc = readFileSync('frontend/src/auth/menuPermissions.ts', 'utf8')

  // menuPermissions 의 규칙을 그대로 읽어 같은 방식(최장 접두어)으로 푼다.
  const rules = [...permSrc.matchAll(/\['(\/[^']*)',\s*(?:'(\w+)'|null)\]/g)]
    .map((m) => [m[1], m[2] ?? null])
  const permFor = (path) => {
    let best = null
    for (const [prefix, code] of rules) {
      if (prefix === '/') continue
      if (path === prefix || path.startsWith(prefix + '/')) {
        if (!best || prefix.length > best[0].length) best = [prefix, code]
      }
    }
    return best ? best[1] : null
  }

  // children 배열을 가진 그룹을 통째로 떠서 그 안의 to: 들을 모은다.
  const groups = []
  /*
   * children 배열을 <b>괄호를 세어</b> 끊는다. 예전에는 줄바꿈+']' 를 끝으로 봤는데,
   * 한 줄짜리 그룹(`children: [{ … }]`)은 그 모양이 없어 <b>뒤 그룹들까지 삼켰다</b> —
   * 그래서 판매 그룹이 어긋난 것을 [견적서] 탓으로 보고했다. 이름이 틀리면 사람은
   * 엉뚱한 곳을 고치거나, 그 이름으로 예외를 적어 진짜 문제를 덮는다.
   */
  // 소스가 CRLF 라 label 과 children 사이에 \r 이 낀다 — [ \t] 로만 두면 여러 줄 그룹을
  // 통째로 놓치고, 검사는 거의 아무것도 안 보면서 통과한다(실제로 23개가 2개로 줄었다).
  for (const m of menuSrc.matchAll(/label: '([^']+)',[ \t\r]*\n?[ \t\r]*children: \[/g)) {
    let k = m.index + m[0].length - 1
    let depth = 0
    let end = k
    for (; k < menuSrc.length; k++) {
      const c = menuSrc[k]
      if (c === '[') depth++
      else if (c === ']') { depth--; if (depth === 0) { end = k; break } }
    }
    const body = menuSrc.slice(m.index + m[0].length, end)
    const paths = [...body.matchAll(/to: '([^']+)'/g)].map((x) => x[1].split('?')[0])
    if (paths.length > 1) groups.push([m[1], paths])
  }

  /**
   * 섞여도 되는 그룹. 성격이 다른 화면을 한 묶음에 둔 것이라 권한도 갈리는 게 맞다.
   * 늘릴 때는 <b>왜 섞이는지</b> 한 줄로 적는다 — 적을 말이 없으면 그건 새는 것이다.
   */
  const MIXED_BY_DESIGN = new Map([
    ['판매일괄회계반영', '회계반영 화면이라 ACCOUNTING 이 섞인다'],
    ['판매', '원본 영업관리 탭이 판매 그룹에 회계미반영현황(판매)까지 둔다 — 그 하나만 ACCOUNTING'],
    ['구매', '원본 구매관리 탭이 구매 그룹에 회계미반영현황(구매)까지 둔다 — 그 하나만 ACCOUNTING'],
    ['영업관리현황', '회계미반영현황(판매)만 ACCOUNTING'],
    ['구매관리현황', '채무 화면이 /sales 경로를 쓰고, 회계미반영현황은 ACCOUNTING'],
    ['기타이동현황', '불량률파악보고서만 QUALITY'],
    ['기타', '거래이력·집계표·경영자보고서를 모아 둔 잡동사니 묶음'],
    ['일별이익', '일별재고현황(STOCK_MOVE)과 일별이익현황(PROFIT)을 나란히 둔다'],
    ['기본사항등록', '회계 기초와 인사 기초가 같은 이름을 쓴다 — 각자 제 권한'],
    ['출/퇴근(사원)', '근태(HR)와 그룹웨어 화면이 섞인다'],
    ['출/퇴근', '위와 같다'],
    ['조직도관리', '사원(HR)과 조직도·연락처(GROUPWARE)가 섞인다'],
  ])

  const mixed = []
  for (const [name, paths] of groups) {
    const byPerm = new Map()
    for (const p of paths) {
      const code = permFor(p) ?? '(권한없음)'
      byPerm.set(code, [...(byPerm.get(code) ?? []), p])
    }
    if (byPerm.size > 1 && !MIXED_BY_DESIGN.has(name)) {
      const detail = [...byPerm.entries()]
        .map(([c, ps]) => `${c}(${ps.join(', ')})`).join(' / ')
      mixed.push(`${name} — ${detail}`)
    }
  }
  eq(`메뉴 그룹 ${groups.length}개 중 섞인 것은 이유가 적힌 ${MIXED_BY_DESIGN.size}개뿐`,
    mixed.join('\n') || '없음', '없음')
}

// ── 1-g) 원본 열 정렬 ↔ 우리 열 정렬 ──────────────────────────────────────
console.log('\n■ 표 안의 값이 원본과 같은 쪽으로 붙나')

/*
 * <b>같은 열이 원본에서는 오른쪽인데 우리는 왼쪽으로 붙어 있지 않나.</b>
 *
 * <p>숫자를 왼쪽으로 붙이면 자릿수가 안 맞아 1,000 과 900 중 어느 쪽이 큰지
 * <b>눈으로 못 고른다.</b> 반대로 이름을 오른쪽으로 붙이면 줄마다 시작점이 달라
 * 훑어 내려가지 못한다. 표를 하나씩 만들다 보면 이게 화면마다 갈리는데,
 * 타입체크도 눈으로 보는 것도 잘 못 잡는다 — 한 화면만 보면 그럴듯해 보이기 때문이다.
 *
 * <p>원본 사본에서 뽑은 <code>qa/fixtures/ecount-column-align.json</code>(49화면 338열)과
 * 대조한다. 한 화면에 표가 여럿이면 <b>열 이름이 가장 많이 겹치는 표</b>를 고른다 —
 * 파일에 먼저 나오는 표를 집으면 엉뚱한 표를 고치게 된다(생산입고현황이 실제로 그랬다).
 */
{
  const ALIGN_MAP = new Map([
    ['거래처리스트', 'trade/PartnersPage.tsx'],
    ['거래처별채권', 'trade/ArApStatusPage.tsx'],
    ['거래처특별단가그룹', 'inventory/SpecialPriceGroupPage.tsx'],
    ['공정등록', 'production/ProcessPage.tsx'],
    ['구매단가일괄변경', 'trade/PriceBulkScreen.tsx'],
    ['구매일괄회계반영', 'trade/AccountingReflectionPage.tsx'],
    ['근태조회', 'hr/LeaveListPage.tsx'],
    ['근태현황', 'hr/AttendanceKindStatusPage.tsx'],
    ['단가적용순서설정', 'inventory/PriceOrderPage.tsx'],
    ['비용내역현황', 'accounting/ExpenseDetailPage.tsx'],
    ['생산불출조회', 'production/IssuePage.tsx'],
    ['생산입고조회', 'production/ReceiptInquiryPage.tsx'],
    ['생산입고현황', 'production/ReceiptStatusPage.tsx'],
    ['생산입고_소모현황 I', 'production/ProductionIssueStatusPage.tsx'],
    ['오더관리유형리스트', 'trade/OrderTypePage.tsx'],
    ['오더관리진행단계', 'trade/OrderStagePage.tsx'],
    ['외주비할인현황', 'trade/OutsourcingDiscountPage.tsx'],
    ['일별이익현황', 'accounting/DailyProfitPage.tsx'],
    ['자원등록', 'production/ResourcePage.tsx'],
    ['작업내역조회', 'production/WorkResultInquiryPage.tsx'],
    ['작업내역현황', 'production/WorkResultListPage.tsx'],
    ['작업지시서조회', 'production/WorkOrderPage.tsx'],
    ['작업지시서현황', 'production/WoStatusPage.tsx'],
    ['창고등록리스트', 'inventory/WarehousesPage.tsx'],
    ['품목등록 리스트', 'inventory/ItemsPage.tsx'],
    ['휴가잔여일수현황', 'hr/VacationRemainPage.tsx'],
    ['관리항목리스트', 'inventory/ManageItemsPage.tsx'],
    ['결제내역조회', 'trade/PaymentHistoryPage.tsx'],
  ])
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)
  const alignOf = (attrs) => (/textAlign:\s*'right'/.test(attrs) ? '우'
    : /textAlign:\s*'center'/.test(attrs) ? '중' : '좌')

  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-column-align.json'), 'utf8'))
  const bad = []
  const skipped = []
  let checked = 0

  for (const [screen, cols] of Object.entries(cap)) {
    const rel = ALIGN_MAP.get(screen)
    if (!rel) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (!existsSync(path)) { bad.push(`${screen} — ${rel} 없음`); continue }
    const src = readFileSync(path, 'utf8')

    // 열 이름이 가장 많이 겹치는 <thead> 를 고른다
    const scored = [...src.matchAll(/<thead>[\s\S]*?<\/thead>/g)].map((head) => ({
      head: head[0],
      hit: Object.keys(cols)
        .filter((n) => new RegExp('<th[^>]*>\\s*' + esc(n) + '\\s*(?:\u25bc)?\\s*</th>').test(head[0]))
        .length,
    })).filter((x) => x.hit > 0).sort((a, b) => b.hit - a.hit)
    if (scored.length === 0) continue
    // 두 표가 똑같이 걸리면 어느 쪽이 원본의 그 표인지 못 고른다 — 세지 않는다
    if (scored.length > 1 && scored[0].hit === scored[1].hit) { skipped.push(screen); continue }
    const best = scored[0].head

    for (const [name, want] of Object.entries(cols)) {
      const m = best.match(new RegExp('<th([^>]*)>\\s*' + esc(name) + '\\s*(?:\u25bc)?\\s*</th>'))
      if (!m) continue
      checked++
      const got = alignOf(m[1])
      if (got !== want) bad.push(`${rel.split('/').pop()}  [${name}] 원본 ${want} · 우리 ${got}`)
    }
  }
  eq(`원본과 견준 열 ${checked}개의 정렬이 같다`
    + (skipped.length ? ` (표를 못 짝지어 건너뛴 화면 ${skipped.length}: ${skipped.join(', ')})` : ''),
    bad.join('\n') || '없음', '없음')
}

// ── 1-h) 원본이 합계를 찍는 자리에 우리도 찍나 ────────────────────────────
console.log('\n■ 원본이 표 아래에 합계를 두는 화면')

/*
 * <b>원본이 합계행을 두는 화면에 우리도 합계행이 있나.</b>
 *
 * <p>원본은 전표 입력 격자와 채권·채무 표 아래에 합계행을 둔다. 사본에서
 * <code>data-columnsectiontype=tfoot</code> 칸에 <b>값이 들어 있는 열</b>을 뽑아
 * <code>qa/fixtures/ecount-total-columns.json</code> 에 적어 두었다
 * (text-bold 는 합계 표시가 아니다 — 빈 칸에도 붙어 있다).
 *
 * <p>합계를 화면 위 카드에만 두면, 표를 스크롤해 내려간 사람은 총계를 보려고
 * <b>다시 올라가야 한다.</b> 거래처별채권이 실제로 그랬다. 자재를 여러 줄 넣는
 * 입력 격자는 더해 보지 않으면 총 소모량을 아예 모른다.
 *
 * <p>열 이름까지 견주지는 않는다 — 우리 표는 열 구성이 다른 곳이 있다
 * (채권 표가 [기초채권·회계매출] 대신 [채권·채무·순액]). 합계행 자체가 있나만 본다.
 */
{
  const TOTAL_MAP = new Map([
    ['거래처별채권', 'trade/ArApStatusPage.tsx'],
    ['거래처별채무', 'trade/ArApStatusPage.tsx'],
    ['구매입력', 'trade/TradeEntry.tsx'],
    ['판매입력', 'trade/TradeEntry.tsx'],
    ['구매조회', 'trade/TradeInquiryPage.tsx'],
    ['근태현황', 'hr/AttendanceKindStatusPage.tsx'],
    ['생산불출입력', 'production/IssuePage.tsx'],
    ['생산불출조회', 'production/IssuePage.tsx'],
    ['생산입고 III-소모품목 선택', 'production/ManualConsumeReceiptPage.tsx'],
    ['생산입고II-소모품목 선택', 'production/ManualConsumeReceiptPage.tsx'],
    ['소요시간계산', 'production/TimeCalcPage.tsx'],
    ['작업내역입력', 'production/WorkResultPage.tsx'],
    ['회계미반영현황(판매)', 'trade/AccountingReflectionPage.tsx'],
    ['회계미반영현황 (구매)', 'trade/AccountingReflectionPage.tsx'],
  ])
  /** 원본에는 합계가 있지만 우리 화면 구조가 달라 붙일 자리가 없는 것 — 이유를 적는다. */
  const NO_PLACE = new Map([
    ['작업지시서입력', '우리 작업지시서는 품목 하나짜리 폼이라 더할 줄이 없다'],
    ['판매입력II', '금액조정 화면을 아직 안 만들었다'],
    ['생산입고I-BOM기준소모', 'BOM대로 자동 소모라 사람이 줄을 넣지 않는다'],
  ])

  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-total-columns.json'), 'utf8'))
  const bad = []
  let checked = 0
  for (const screen of Object.keys(cap)) {
    if (NO_PLACE.has(screen)) continue
    const rel = TOTAL_MAP.get(screen)
    if (!rel) { bad.push(`${screen} — 어느 화면인지 안 적혀 있다`); continue }
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (!existsSync(path)) { bad.push(`${screen} — ${rel} 없음`); continue }
    checked++
    if (!/<tfoot/.test(readFileSync(path, 'utf8'))) {
      bad.push(`${rel.split('/').pop()} — 원본 ${screen} 은 [${cap[screen].join('·')}] 합계를 찍는데 합계행이 없다`)
    }
  }
  eq(`원본이 합계를 두는 화면 ${checked}개에 우리도 합계행이 있다`
    + ` (구조가 달라 못 붙이는 ${NO_PLACE.size}개는 이유를 적고 뺐다)`,
    bad.join('\n') || '없음', '없음')
}

// ── 2-h) 원본 체크박스 기본값 ↔ 우리 기본값 ───────────────────────────────
console.log('\n■ 화면을 열었을 때 켜져 있는 조건이 원본과 같나')

/*
 * <b>[사용중단거래처포함] 같은 조건이 원본과 반대로 꺼져 있지 않나.</b>
 *
 * <p>기간·구분과 마찬가지로 <b>화면을 열자마자 보는 자료가 달라진다.</b> 거래처별채권이
 * 실제로 그랬다 — 원본은 사용중단 거래처를 기본으로 포함하는데 우리는 뺐다. 거래를
 * 그만둔 곳이라도 <b>못 받은 돈은 남아 있어서</b>, 화면의 채권 합계가 실제보다 작았다.
 * 실제원가현황·차이분석도 [사용중단품목포함]이 반대였다.
 *
 * <p>사본에서 <code>&lt;input type=checkbox … checked&gt;</code> 여부를 뽑아
 * <code>qa/fixtures/ecount-checkbox-default.json</code>(35화면 88개)에 적었다.
 * 우리에 없는 조건은 건너뛴다 — 조건을 다 만들었는지가 아니라 <b>만든 것의 기본값</b>을 본다.
 */
{
  const BOX_MAP = new Map([
    ['거래처별채권', 'trade/ArApStatusPage.tsx'],
    ['거래처별채무', 'trade/ArApStatusPage.tsx'],
    ['실제원가현황', 'accounting/ActualCostPage.tsx'],
    ['차이분석', 'accounting/VariancePage.tsx'],
    ['표준원가현황', 'accounting/StandardCostPage.tsx'],
    ['업무일지', 'groupware/WorkLogPage.tsx'],
    ['휴가사용실적현황', 'hr/VacationUsePage.tsx'],
    ['휴가잔여일수현황', 'hr/VacationRemainPage.tsx'],
    ['일별이익현황', 'accounting/DailyProfitPage.tsx'],
  ])
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-checkbox-default.json'), 'utf8'))
  const bad = []
  let checked = 0
  for (const [screen, boxes] of Object.entries(cap)) {
    const rel = BOX_MAP.get(screen)
    if (!rel) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (!existsSync(path)) continue
    const src = readFileSync(path, 'utf8')
    for (const [label, want] of Object.entries(boxes)) {
      // 라벨 앞의 <input type="checkbox" checked={변수} … /> 를 찾는다
      let m = null
      for (let at = src.indexOf(label); at >= 0; at = src.indexOf(label, at + 1)) {
        const near = src.slice(Math.max(0, at - 400), at)
        if (!/type="checkbox"/.test(near)) continue     // 주석에 적힌 이름은 건너뛴다
        m = [...near.matchAll(/checked=\{(!?)(\w+)\}/g)].pop()
        if (m) break
      }
      if (!m) continue
      const init = src.match(new RegExp('\\[' + m[2] + ',[^\\]]*\\] = useState(?:<[^>]*>)?\\((true|false)\\)'))
      if (!init) continue
      checked++
      const got = (init[1] === 'true') !== (m[1] === '!') ? '켜짐' : '꺼짐'
      if (got !== want) bad.push(`${rel.split('/').pop()}  [${label}] 원본 ${want} · 우리 ${got}`)
    }
  }
  eq(`원본과 견준 조건 ${checked}개의 기본 켜짐이 같다`, bad.join('\n') || '없음', '없음')
}

console.log('\n' + '─'.repeat(50))
console.log(`통과 ${pass} · 실패 ${fail}`)
if (fail) process.exit(1)
console.log('전부 통과했습니다.')
