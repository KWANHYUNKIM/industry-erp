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

/**
 * 그 화면의 글자. <b>다른 화면을 감싸기만 하는 파일</b>이면 감싸인 쪽까지 같이 읽는다.
 *
 * <p>기안서통합관리·내결재관리는 ApprovalListPage 를 제목만 바꿔 부르는 열 줄짜리
 * 파일이다. 감싸는 쪽만 보면 열도 버튼도 <b>하나도 없는 것</b>처럼 보인다 —
 * 실제로 원본 열 13개가 전부 없다고 잘못 잡았다.
 */
/**
 * <b>아직 원본과 못 맞춘 화면</b>. 대응표를 35→88 로 넓히면서 한꺼번에 드러난 것들이라
 * 한 번에 다 고칠 수 없어 여기 적어 두고 <b>하나씩 지워 간다</b>.
 *
 * <p>이 목록에 있는 화면은 열·버튼·조건·제목 검사를 건너뛴다. 대신 몇 개가 남았는지
 * 늘 찍는다 — 숨기는 것이 아니라 <b>세어 두는</b> 것이다. 목록에서 이름을 지우면
 * 그 화면이 곧바로 검사 대상이 된다.
 */
const PENDING = new Set(JSON.parse(readFileSync(join('qa', 'fixtures', 'pending-screens.json'), 'utf8')))

const pageSource = (rel) => {
  const path = join('frontend', 'src', 'pages', ...rel.split('/'))
  if (!existsSync(path)) return null
  let src = readFileSync(path, 'utf8')
  /* 기본 import(감싸는 화면)와 이름 있는 import(공용 화면을 꺼내 쓰는 것) 둘 다 따라간다. */
  for (const m of src.matchAll(/^import\s+(?:(\w+)|\{([^}]+)\})\s+from\s+'(\.[^']+)'/gm)) {
    const dir = rel.split('/').slice(0, -1)
    const parts = m[3].replace(/^\.\//, '').split('/')
    const abs = join('frontend', 'src', 'pages', ...dir, ...parts) + '.tsx'
    if (/Page|Screen/.test(m[1] ?? m[2]) && existsSync(abs)) src += readFileSync(abs, 'utf8')
  }
  /*
   * <b>주석은 뺀다.</b> 안 그러면 '원본 [채권채무구분]' 이라고 적어 둔 주석만으로
   * 그 조건이 있는 것처럼 통과한다 — 실제로 그렇게 새 나갔다.
   */
  return src
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ')
    .replace(/^[ 	]*\/\/.*$/gm, ' ')
}

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

// ── 1-i) 원본 열 순서 ↔ 우리 열 순서 ──────────────────────────────────────
console.log('\n■ 표의 열이 원본과 같은 차례로 서 있나')

/*
 * <b>같은 열들이 원본과 다른 차례로 서 있지 않나.</b>
 *
 * <p>열이 다 있어도 차례가 다르면 <b>눈이 가는 자리가 달라진다.</b> 오더관리유형리스트가
 * 그랬다 — 원본은 [사용구분·입력메뉴에서 사용·담당자]인데 우리는 정확히 거꾸로였다.
 * 품목등록은 [품목구분]과 [규격정보]가 뒤바뀌어 있었고, 공정등록은 [순번]이 코드·이름
 * 앞으로 나와 있었다.
 *
 * <p>정렬 fixture(<code>ecount-column-align.json</code>)는 원본 열 차례를 그대로 담고 있다.
 * 양쪽에 다 있는 열만 골라 <b>상대 차례</b>를 견준다 — 우리에만 있는 열(단위·상태·관리)은
 * 자리를 따지지 않는다.
 */
{
  const ORDER_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-column-align.json'), 'utf8'))
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)
  const flat = (s) => s.replace(/<[^>]*>/g, '').replace(/[\s\u25bc]/g, '')

  const bad = []
  let checked = 0
  for (const [screen, cols] of Object.entries(cap)) {
    const rel = ORDER_MAP.get(screen)
    if (!rel) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (!existsSync(path)) continue
    const src = readFileSync(path, 'utf8')
    const names = Object.keys(cols)
    const scored = [...src.matchAll(/<thead>[\s\S]*?<\/thead>/g)].map((h) => ({
      head: h[0],
      hit: names.filter((n) => new RegExp('<th[^>]*>\\s*' + esc(n) + '\\s*(?:\u25bc)?\\s*</th>').test(h[0])).length,
    })).filter((x) => x.hit > 1).sort((a, b) => b.hit - a.hit)
    if (!scored.length || (scored.length > 1 && scored[0].hit === scored[1].hit)) continue
    const ours = [...scored[0].head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => flat(m[1]))
    const want = names.map(flat).filter((n) => ours.includes(n))
    const got = ours.filter((n) => want.includes(n))
    checked += want.length
    if (want.join(' ') !== got.join(' ')) {
      bad.push(`${rel.split('/').pop()}\n     원본 ${want.join(' · ')}\n     우리 ${got.join(' · ')}`)
    }
  }
  eq(`원본과 견준 열 ${checked}개가 같은 차례로 서 있다`, bad.join('\n') || '없음', '없음')
}

// ── 1-j) 원본에는 있는데 우리 표에 없는 열 ────────────────────────────────
console.log('\n■ 원본 표의 열이 우리 표에도 있나')

/*
 * <b>원본 열 이름이 우리 표에 그대로 있나.</b>
 *
 * <p>열 정렬·차례를 견주다 보니 <b>이름이 어긋난 열은 아예 짝이 안 지어져</b> 조용히
 * 빠져 있었다. 생산불출조회가 그랬다 — 원본 [품목명·수량·적요]를 우리는
 * [자재명·불출수량·비고]라고 부르고 있었고, [품목코드] 열은 없었다. 같은 자료를
 * 두 이름으로 부르면 원본을 아는 사람이 화면마다 다시 배워야 한다.
 *
 * <p>여기서 걸린 것들: 거래처리스트 [대표자]→[대표자명], 품목등록 [품목그룹]→
 * [품목그룹1명], 근태현황 [근태(일)]→[근태], 근태입력 [근태코드]→[근태]·
 * [근태(일)]→[근태(일/시간)], 작업지시서현황은 [지시일자]+[작업지시번호]를
 * 원본처럼 [일자-No.] 한 칸으로 합쳤고, 근태조회에는 원본 마지막 열 [인쇄]가 없었다.
 *
 * <p>원본에 있지만 우리 구조상 못 만드는 열은 <b>이유를 적고</b> 뺀다.
 */
{
  const MISS_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-column-align.json'), 'utf8'))
  const flat = (s) => s.replace(/<[^>]*>/g, '').replace(/[\s\u25bc]/g, '')
  /** 원본에 있지만 우리에게 없는 열 — 왜 없는지 적는다. 이유 없이 늘리지 말 것. */
  const NO_COLUMN = new Map([
    ['거래처별채권|기초채권', '잔액 API 가 기초·발생·수금으로 분해해 주지 않는다'],
    ['거래처별채권|재고매출', '위와 같음'], ['거래처별채권|회계매출', '위와 같음'],
    ['거래처별채권|수금합계', '위와 같음'], ['거래처별채권|기타할인등차액', '위와 같음'],
    ['거래처별채권|잔액', '우리 열 이름은 [채권]이다'],
    ['거래처별채무|기초채무', '위와 같음'], ['거래처별채무|재고매입', '위와 같음'],
    ['거래처별채무|회계매입', '위와 같음'], ['거래처별채무|지급합계', '위와 같음'],
    ['거래처별채무|기타할인등차액', '위와 같음'], ['거래처별채무|잔액', '우리 열 이름은 [채무]이다'],
    ['공정등록|작업코드등록', '줄마다가 아니라 화면 위 버튼 하나로 연다'],
    ['구매단가일괄변경|환율', '외화 전표를 만들지 않는다'],
    ['구매일괄회계반영|거래가액', '외화·조정 항목을 만들지 않는다'],
    ['구매일괄회계반영|조정', '위와 같음'], ['구매일괄회계반영|외화금액', '위와 같음'],
    ['구매일괄회계반영|환율', '위와 같음'], ['구매일괄회계반영|상세', '전표를 눌러 연다'],
    ['생산불출조회|불러온 전표일자', '작업지시번호 한 칸으로 갈음한다'],
    ['생산불출조회|불러온 전표No.', '위와 같음'],
    ['생산불출조회|작업지시품목코드', '우리 열 이름은 [생산품목]이다'],
    /* 격자로 바꾼 뒤에도 남는 셋 — [전표불러오기] 로 채워지는 칸이라 그 기능이 없으면 뜻이 없다. */
    ['생산불출입력|불러온 전표일자', '전표불러오기를 안 만든다 — 작업지시를 골라 잇는다'],
    ['생산불출입력|불러온 전표No.', '위와 같음'],
    ['생산불출입력|작업지시품목코드', '머리에서 작업지시를 고르면 생산품목이 따라온다'],
    ['설문조사조회|질문유형', '질문은 설문 상세 화면에서 다룬다'],
    ['설문조사조회|질문내용', '위와 같음'], ['설문조사조회|보기항목1', '위와 같음'],
    ['설문조사조회|보기항목2', '위와 같음'], ['설문조사조회|보기항목3', '위와 같음'],
    ['설문조사조회|보기항목4', '위와 같음'], ['설문조사조회|보기항목5', '위와 같음'],
    ['설문조사조회|필수항목', '위와 같음'],
    ['소요시간계산|생산품목명', '첫 칸이 코드도움 입력이라 이름 열을 따로 두지 않는다'],
    ['작업내역입력|생산품목코드', '작업(BOR) 기준 품목을 우리 작업내역에 붙이지 않는다'],
    ['작업내역입력|작업', '위와 같음'], ['작업내역입력|작업품목코드', '위와 같음'],
    ['작업내역입력|작업품목명', '위와 같음'],
    ['작업내역입력|수량', '우리는 양품·불량을 나눠 센다'],
    ['작업내역입력|작업시간', '우리 열 이름은 [작업시간(분)]이다 — 단위가 다르다'],
    ['작업내역현황|일자-No.', '우리 작업내역에는 전표번호가 없다'],
    /*
     * BOR 의 [작업]·[작업기준품목코드/명]·[작업량]. 사본에서 이 네 칸은 <b>값이 전부 비어</b>
     * 있어서, [작업량]이 [생산수량]과 어떻게 다른지·작업시간과 어떻게 곱해지는지를
     * 잴 수 없었다. 뜻을 모르는 채 칸만 만들면 <b>두 수량이 같은 것을 두 번 말하는</b>
     * 화면이 된다. 값이 든 사본을 얻으면 그때 만든다.
     */
    ['BOR(작업소요시간)|작업', '사본에 값이 비어 있어 [생산수량]과의 관계를 못 쟀다'],
    ['BOR(작업소요시간)|작업기준품목코드', '위와 같음'],
    ['BOR(작업소요시간)|작업기준품목명', '위와 같음'],
    ['BOR(작업소요시간)|작업량', '위와 같음'],
    /*
     * 사본 '원가생성_수정' 도 표가 아니라 <b>원가생성 실행 화면</b>이다. 그 칸들이
     * 격자 열처럼 잡혔다. [공정명]·[창고코드/명]은 우리가 원가를 공정·창고 단위로
     * 쌓지 않아 값 자체가 없다(표준·실제·차이 화면의 [생산공정]과 같은 이유).
     */
    ['원가생성_수정|기준년월', '표가 아니라 원가생성 실행 화면의 칸이다'],
    ['원가생성_수정|원가계산방법', '위와 같음'], ['원가생성_수정|사전작업', '위와 같음'],
    ['원가생성_수정|원가계산', '위와 같음'], ['원가생성_수정|원가현황', '위와 같음'],
    ['원가생성_수정|기타', '위와 같음'],
    ['원가생성_수정|공정명', '원가를 공정 단위로 쌓지 않는다'],
    ['원가생성_수정|창고코드', '원가를 창고 단위로 쌓지 않는다'],
    ['원가생성_수정|창고명', '위와 같음'],
    /*
     * 사본 '생산계획_MRP리스트' 는 표가 아니라 <b>[생산계획/MRP생성] 팝업의 폼</b>이다.
     * 그 칸들이 격자 열처럼 잡혔다. 우리는 그 팝업을 만들지 않는다 — 매출계획·미구매·
     * 미생산 소요량 전개(BOM 역산) 엔진이 있어야 하고, 없는 채로 버튼만 두면
     * 눌러도 아무 일이 없다(MrpPage 주석에 적어 둔 이유와 같다).
     */
    ['생산계획_MRP리스트|생성일자', '표가 아니라 생성 팝업의 폼이다 — 그 팝업을 안 만든다'],
    ['생산계획_MRP리스트|생산계획기간', '위와 같음'],
    ['생산계획_MRP리스트|기준품목', '위와 같음'],
    ['생산계획_MRP리스트|생산계획계산', '위와 같음'],
    ['생산계획_MRP리스트|MRP계산', '위와 같음 — 소요량 전개 엔진이 없다'],
    ['생산계획_MRP리스트|생산계획/MRP현황', '위와 같음'],
    ['생산계획_MRP리스트|기타', '위와 같음'],
    ['생산계획_MRP리스트|적요', '위와 같음'],
  ])
  for (let n = 1; n <= 10; n++) NO_COLUMN.set(`오더관리유형리스트|${n}단계`, 'STEP_COLS.map 으로 그려 이름이 코드에 안 보인다')
  /*
   * <b>원본 전표 입력 화면은 여러 줄 격자다.</b> 한 전표에 품목을 여러 줄 넣고,
   * 위에 공통 툴바(정렬·My품목·전표불러오기·재고불러오기·바코드·검증·저장(F8)·
   * 저장/전표(F7)·리스트)가 붙는다.
   *
   * <p>우리는 그 화면들을 <b>한 건씩 넣는 폼</b>으로 만들었다. 같은 값이 열이 아니라
   * 칸(label)으로 있어서 열 검사에 안 잡힌다 — 없는 것이 아니라 <b>모양이 다르다</b>.
   * 격자로 바꾸는 것은 화면 몇 개를 다시 만드는 일이라 여기 이유를 적어 둔다.
   */
  /* 생산불출입력은 격자로 바꿨다 — 그 화면은 이 예외에서 뺀다. */
  for (const screen of ['생산입고I-BOM기준소모', '생산입고II-소모품목 선택',
    '생산입고 III-소모품목 선택', '작업지시서입력']) {
    for (const c of ['불러온 전표일자', '불러온 전표No.', '작업지시품목코드', '생산품목코드',
      '생산품목명', '생산공정', '규격', '수량', '적요', '시리얼/로트No.', 'BOM버전',
      '노무시간', '작지 수량', '품목코드', '품목명']) {
      NO_COLUMN.set(screen + '|' + c, '원본은 여러 줄 격자, 우리는 한 건씩 넣는 폼이라 같은 값이 칸으로 있다')
    }
  }


  const bad = []
  let checked = 0
  let pending = 0
  for (const [screen, cols] of Object.entries(cap)) {
    const rel = MISS_MAP.get(screen)
    if (!rel) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (PENDING.has(screen)) { pending++; continue }
    if (!pageSource(rel)) continue
    const src = pageSource(rel)   // 감싸기만 하는 화면은 감싸인 쪽까지 읽는다
    const ours = new Set([...src.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => flat(m[1])))
    for (const name of Object.keys(cols)) {
      if (NO_COLUMN.has(screen + '|' + name)) continue
      checked++
      /*
       * 열 이름이 <b>식</b>인 것도 있다 — 판매는 [수량], 구매는 [기본수량] 처럼
       * 같은 칸을 구분에 따라 다르게 부른다. 그때는 따옴표에 싸인 이름을 찾는다.
       */
      const asExpr = src.includes(`'${name}'`) || src.includes(`"${name}"`)
      if (!ours.has(flat(name)) && !asExpr) {
        bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 [${name}] 열이 없다`)
      }
    }
  }
  eq(`원본 열 ${checked}개가 우리 표에도 있다 (못 만드는 ${NO_COLUMN.size}개는 이유를 적고 뺐다`
    + `, 아직 못 맞춘 화면 ${pending}개는 건너뜀)`,
    bad.join('\n') || '없음', '없음')
}

// ── 2-i) 원본 화면의 버튼 ↔ 우리 버튼 ─────────────────────────────────────
console.log('\n■ 원본 화면에 있는 버튼이 우리 화면에도 있나')

/*
 * <b>원본 화면 위에 달린 버튼이 우리에게도 있나.</b>
 *
 * <p>사본에서 <code>&lt;button&gt;</code> 글자를 화면별로 뽑아
 * <code>qa/fixtures/ecount-buttons.json</code>(92화면)에 적었다. 화면마다 똑같이 붙는
 * 껍데기(사이트맵·Option·도움말·Search(F3))와 기간 고르기 버튼은 뺀다.
 *
 * <p>여기서 걸린 것: 거래처특별단가그룹에 [Excel]이, 비용내역현황·작업지시서현황에
 * [인쇄]가, 근태조회에 [신규(F2)]가, 품목등록에 [사용중단/재사용]이 없었다.
 * 목록을 뽑아 놓고 <b>내보낼 자리가 없으면</b> 사람은 화면을 긁어 옮긴다.
 *
 * <p>[신규(F2)]는 EcListShell 이 <code>onNew</code>/<code>renderForm</code> 으로 달아 준다.
 */
{
  const BTN_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-buttons.json'), 'utf8'))
  /** 화면마다 똑같이 붙는 껍데기·기간 버튼 */
  const SHELL = new Set(['사이트맵', 'Option', '도움말', 'Search(F3)', '찾기(F3)', '다시 작성',
    '금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일', '최근30일(+1개월)',
    '이번기수', '직전기수', '설정', '웹자료올리기', '자동알림', '이력조회',
    // 기간 빠른선택은 EcPeriodPicks 가 화면마다 같은 규칙으로 그린다.
    // 어떤 묶음을 쓰는지는 기간 fixture 와 2-f 검사가 따로 본다.
    '금월', '금년', '전년', '최근3일+7일', '전월+금월', '말일', '금주', '차주', '차월'])
  /** 원본에 있지만 우리에게 없는 버튼 — 왜 없는지 적는다. */
  const NO_BUTTON = new Map([

    ['거래처리스트|SMS', '문자 발송을 붙이지 않았다'],
    ['근태조회|메신저', '사내 메신저가 없다'],
    ['결제내역조회|입금보고서작성', '입금보고서 양식이 없다'],
    ['결제내역조회|신규(F2)', '결제는 수금·지급 입력에서 만든다'],
    ['관리항목리스트|사용중단/재사용', '줄 고르기가 없다 — 다음에 붙인다'],
    ['창고등록리스트|사용중단/재사용', '위와 같음'],
    ['오더관리유형리스트|사용중단/재사용', '위와 같음'],
    ['구매일괄회계반영|매입전표 I', '회계전표 입력 화면으로 넘기지 않는다'],
    ['근태입력|저장/전표(F7)', '근태를 회계전표로 넘기지 않는다'],
    ['근태입력|리스트', '저장 후 조회 화면으로 자동으로 넘어간다'],
    ['설문조사조회|미리보기', '설문 미리보기 화면이 없다'],
    ['소요시간계산|작업지시서', '계산 결과에서 작업지시서를 만들지 않는다'],
    ['생산입고조회|생산입고I', '입력 화면을 [신규(F2)]로 연다'],
    ['생산입고조회|Email', '전표를 메일로 보내지 않는다'],
    ['거래명세서인쇄|Email', '위와 같음'],
    ['SW개발일정관리|공용메일설정', '사내 공용메일 설정 화면이 없다'],
    ['건설예정공정표|업무지원AI', '업무지원 AI 를 붙이지 않았다'],
    ['건설예정공정표|진행상태변경', '공정표는 줄마다 상태를 고친다'],
    ['출하지시서조회|진행상태변경', '출하지시서는 줄마다 상태를 고친다'],
    ['작업지시서효율현황|닫기', '화면을 닫는 버튼을 두지 않는다 — 메뉴로 옮긴다'],
    ['설문조사현황|전월+금월', '기간 빠른선택에 그 조합을 두지 않았다'],
    ['거래처관리대장 I|Email', '전표를 메일로 보내지 않는다'],
    ['거래처관리대장 I|사용중단포함', '조건 판의 체크박스로 둔다 — 버튼이 아니다'],
    ['거래처관리대장 I|적용(F8)', '조건을 바꾸면 바로 반영된다 — 따로 적용하지 않는다'],
    ['거래처관리대장 II|적용(F8)', '위와 같음'],
    ['거래처관리대장 II|검색(F8)', '거래처등록은 검색상자(Search(F3))로 찾는다'],
    ['거래처관리대장 I|닫기', '화면을 닫는 버튼을 두지 않는다 — 메뉴로 옮긴다'],
    ['거래처관리대장 I|전표입력', '전표는 판매·구매입력에서 만든다'],
    ['생산계획_MRP리스트|H', '생성 팝업의 시간 단위 토글 — 그 팝업을 안 만든다'],
    ['생산계획_MRP리스트|신규(F2)', '위와 같음'], ['생산계획_MRP리스트|저장(F8)', '위와 같음'],
    ['생산계획_MRP리스트|닫기', '위와 같음'], ['생산계획_MRP리스트|삭제', '위와 같음'],
    ['오더관리진행단계|신규(F2)', '우리 화면은 단계 마스터가 아니라 오더 진행 목록이다'],
    ['오더관리진행단계|사용중단/재사용', '위와 같음'],
    ['오더관리진행단계|선택상세보기', '위와 같음'],
    ['공지사항|업무지원AI', '업무지원 AI 를 붙이지 않았다'],
    ['공용품관리|미리보기', '인쇄 미리보기 화면이 없다'], ['일정관리|미리보기', '위와 같음'],
    ['공용품관리|라벨변경', '꼬리표(라벨)는 전자결재에만 있다'],
    ['일정관리|라벨변경', '위와 같음'], ['일정관리|라벨', '위와 같음'],
    ['내결재관리|My도장/서명', '결재 도장 이미지를 만들지 않는다'],
    ['내결재관리|보내기', '전표를 메일로 보내지 않는다'],
    ['설문조사조회|Email', '위와 같음'], ['설문조사조회|대화방', '사내 대화방이 없다'],
    ['작업내역조회|보내기', '위와 같음'], ['작업내역조회|바코드(품목)', '바코드를 찍지 않는다'],
    ['생산입고조회|바코드(품목)', '위와 같음'],
    ['원가생성_수정|인쇄', '원가생성은 실행 화면이라 찍을 표가 없다'],
    ['생산입고조회|진행상태변경', '생산입고에 진행상태가 없다'],
    ['생산입고조회|보내기', '위와 같음'], ['생산입고조회|전자결재', '생산 전표를 결재에 올리지 않는다'],

    ['출하조회|진행상태변경', '출하는 줄마다 상태를 고친다'],
    ['소요시간계산|주문', '수주에서 불러오지 않는다 — 작업지시에서 불러온다'],
    ['소요시간계산|바코드', '바코드를 찍지 않는다'],
    ['근태입력|근태일괄입력', '여러 사원의 근태를 한 번에 넣는 화면이 없다'],
    ['구매조회|발주', '발주는 발주서 화면에서 만든다'],
    ['작업지시서작업처리|작업내역입력', '작업내역은 그 화면에서 바로 넣는다'],
    ['품목등록 리스트|관계설정', '품목 사이 관계(대체품·세트) 개념이 없다'],

    ['품목등록 리스트|재고조정', '재고조정은 재고관리 화면에서 한다'],
  ])
  /*
   * 원본은 <b>조회 화면에서 전표를 열어 그 자리에서 고친다</b> — 그래서 조회에도
   * 저장·전표불러오기·현금수금 같은 입력 버튼이 달려 있다. 우리는 입력을 따로 둔다
   * (TradeEntry). 조회에서 전표를 누르면 그 화면으로 넘어간다.
   */
  /* 위 격자 화면들의 공통 툴바. 우리 폼에는 [등록] 하나뿐이다. */
  for (const screen of ['생산불출입력', '생산입고I-BOM기준소모', '생산입고II-소모품목 선택',
    '생산입고 III-소모품목 선택', '작업지시서입력', 'BOR(작업소요시간)']) {
    for (const b of ['정렬', 'My품목', '주문', '작업지시서', '전표불러오기', '재고불러오기',
      '바코드', '전표 바코드', '검증', '저장(F8)', '저장/전표(F7)', '리스트', '복사', '닫기']) {
      NO_BUTTON.set(screen + '|' + b, '원본 격자 화면의 공통 툴바 — 우리 폼에는 [등록] 하나뿐이다')
    }
  }

  for (const screen of ['판매조회', '구매조회']) {
    for (const b of ['정렬', 'My품목', '주문', '구매', '할인', '보류', '소요', '전표불러오기',
      '재고불러오기', '바코드', '전표 바코드', '검증', '이익계산', '거래별부가세계산',
      '저장(F8)', '저장/전표(F7)', '회계전표연결', '현금수금', '현금지급', '복사', '리스트',
      '회계반영', 'Email', '보내기', '바코드(품목)', '전자결재', '이전', '다음', '닫기']) {
      NO_BUTTON.set(screen + '|' + b, '원본은 조회에서 바로 고치지만 우리는 입력 화면을 따로 둔다')
    }
  }

  for (const [screen, btns] of [['생산불출조회', ['Email', '진행상태변경', '보내기', '바코드(품목)', '전자결재', '선택삭제',
    '정렬', 'My품목', '작업지시서', '전표불러오기', '재고불러오기', '바코드', '검증', '저장(F8)', '저장/전표(F7)', '닫기']],
  ['작업지시서조회', ['Email', '진행상태변경', '보내기', '바코드(품목)', '전자결재', '선택삭제']],
  ['작업내역입력', ['정렬', 'My품목', '연결전표', '바코드', '검증', '작업지시서', '저장(F8)', '저장/전표(F7)', '리스트']],
  ['작업내역조회', ['Email']]]) {
    for (const b of btns) NO_BUTTON.set(screen + '|' + b, '전표 입력 격자·전자결재·바코드를 이 화면에 붙이지 않았다')
  }

  const bad = []
  let checked = 0
  let pending = 0
  for (const [screen, btns] of Object.entries(cap)) {
    const rel = BTN_MAP.get(screen)
    if (!rel) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (PENDING.has(screen)) { pending++; continue }
    if (!pageSource(rel)) continue
    const src = pageSource(rel)   // 감싸기만 하는 화면은 감싸인 쪽까지 읽는다
    for (const b of btns) {
      if (SHELL.has(b) || NO_BUTTON.has(screen + '|' + b)) continue
      checked++
      const has = b === '신규(F2)' ? (/onNew=|renderForm=/.test(src) || src.includes(b)) : src.includes(b)
      if (!has) bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 [${b}] 버튼이 없다`)
    }
  }
  eq(`원본 버튼 ${checked}개가 우리 화면에도 있다 (안 만든 ${NO_BUTTON.size}개는 이유를 적고 뺐다`
    + `, 아직 못 맞춘 화면 ${pending}개는 건너뜀)`,
    bad.join('\n') || '없음', '없음')
}

// ── 2-j) 원본 조건·머리 항목 ↔ 우리 항목 ─────────────────────────────────
console.log('\n■ 원본 화면 머리의 조건이 우리 화면에도 있나')

/*
 * <b>원본 조건 판·입력 머리의 항목이 우리에게도 있나.</b>
 *
 * <p>사본에서 <code>&lt;li data-listid&gt;</code> 의 이름을 뽑아
 * <code>qa/fixtures/ecount-form-fields.json</code>(47화면)에 적었다.
 *
 * <p>여기서 걸린 것: 생산불출입력·작업내역입력의 <b>[프로젝트]</b>(없어서 그 자재와
 * 품이 프로젝트별 집계에서 빠졌다), 현황 여섯의 <b>[정렬/소계기준]</b>(소계 축이 하나로
 * 박혀 있었다), 일괄회계반영의 <b>[구매No.]</b>(우리는 [전표번호]라 불렀다).
 *
 * <p>패널이 그릴 수 있다는 것과 <b>그 화면이 실제로 넘긴다</b>는 것은 다르다.
 * 처음 대조할 때 EcStatusPanel 안의 글자까지 세는 바람에 [데이터 보기형식]·
 * [정렬/소계기준]이 있는 것처럼 보였다. 그래서 이 둘은 화면 파일이 값을 넘기는지로 본다.
 */
{
  const FORM_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-form-fields.json'), 'utf8'))
  const SHARED = ['EcStatusPanel', 'EcListShell', 'EcPeriodPicks', 'CodePickerField']
    .map((c) => join('frontend', 'src', 'components', `${c}.tsx`))
    .filter((f) => existsSync(f)).map((f) => readFileSync(f, 'utf8')).join('')

  /** 원본에 있지만 우리에게 없는 조건 — 왜 없는지 적는다. */
  const NO_FIELD = new Map([
    ['적용양식', '인쇄 양식을 고르게 하지 않는다 — 화면마다 양식이 하나다'],
    ['양식구분', '위와 같음'],
    ['기타', '원본은 자잘한 체크박스를 이 이름으로 묶는다. 우리는 조건 판에 그대로 편다'],
    ['내.외자구분', '국내/수입 구분을 전표에 두지 않는다'],
    ['관리항목', '구매 전표에 관리항목을 붙이지 않는다'],
    /*
     * 아래 둘은 화면 주석에 이유가 적혀 있던 것을 여기로 옮긴 것이다.
     * 주석에 적힌 이름만으로 검사가 통과하던 것을 막으면서(주석을 빼고 센다)
     * 이유가 갈 곳이 없어졌다 — 이유는 검사 옆에 적는 편이 낫다.
     */
    ['생산공정', '우리 원가(표준·실제·차이)에 공정별 값이 없다 — 공정 단위로 쌓지 않는다'],
    ['최초작성자', '전표에 만든 사람을 남기지만 조건으로 거르지는 않는다'],
    ['최종수정자', '위와 같음'],
    ['결재방표시', '전자결재 도장을 전표 인쇄에 찍는 기능이 없다'],
  ])
  /** 화면별로 안 만든 것 — 화면 사정이 있는 것만 여기에. */
  const NO_FIELD_ON = new Map([
    ['판매조회|출하창고', '원본은 조회에서 전표를 열어 고친다 — 우리는 입력 화면(TradeEntry)에 있다'],
    ['구매조회|입고창고', '위와 같음'],
    ['판매조회|통화', '위와 같음'], ['구매조회|통화', '위와 같음'],
    ['판매조회|프로젝트', '위와 같음'], ['구매조회|프로젝트', '위와 같음'],
    ['판매조회|거래유형', '위와 같음'], ['구매조회|거래유형', '위와 같음'],
    ['생산입고_소모현황 I|정렬/소계기준', '[구분]이 이미 그 축을 고른다(생산품목별·소모품목별·라인별)'],
    ['일별이익현황|정렬/소계기준', '위와 같음(라인별·품목별·거래처별…)'],
    ['실제원가현황|정렬/소계기준', '위와 같음(원가집계표·증가내역·감소내역)'],
    ['월별이익현황|정렬/소계기준', '위와 같음(품목별·거래처별…)'],
    ['차이분석|정렬/소계기준', '위와 같음(원가비교집계표·재료비단가차이·소모수량차이…)'],
    ['거래처관리대장 I|정렬/소계기준', '[집계구분]이 그 축을 고른다(거래처별·담당자별)'],
    ['거래처관리대장 II|채권채무구분', '거래처등록 화면이라 채권·채무를 가르지 않는다'],
    ['거래처관리대장 II|거래처그룹2', '거래처그룹이 하나다 — [거래처그룹1] 만 있다'],
    ['거래처관리대장 II|거래유형(영업)', '거래유형은 전표에 붙지 거래처에 붙지 않는다'],
    ['거래처관리대장 II|거래유형(구매)', '위와 같음'],
    ['거래처관리대장 II|거래처계층그룹', '거래처에 계층이 없다(평면 그룹 하나)'],
    ['휴가잔여일수현황|상태', '잔여일수 응답은 사원·부서·일수만 준다 — 줄에 상태가 없다'],
    ['월별이익현황|기준월', '우리는 한 해를 통째로 보고 월을 열로 편다 — 조건은 [연도]다'],
    ['생산입고현황|채무번호', '생산입고를 외상매입과 잇지 않는다'],
    ['작업지시서작업처리|작업품목', '작업(BOR) 기준 품목을 작업처리에 붙이지 않는다'],
    ['작업지시서입력|작업지시No.', '번호는 저장할 때 서버가 매긴다 — 입력 폼에서 고르지 않는다'],
    ['작업지시서효율현황|오더관리번호', '작업지시를 수주(오더)와 잇지 않는다'],
    ['작업지시서효율현황|거래처관리담당자', '작업지시에는 거래처가 납품처로만 붙는다'],
    ['작업지시서효율현황|규격', '효율 화면은 품목이 아니라 지시 단위로 센다'],
  ])

  const bad = []
  let checked = 0
  let pending = 0
  for (const [screen, fields] of Object.entries(cap)) {
    const rel = FORM_MAP.get(screen)
    if (!rel) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (PENDING.has(screen)) { pending++; continue }
    if (!pageSource(rel)) continue
    const own = pageSource(rel)   // 감싸기만 하는 화면은 감싸인 쪽까지 읽는다
    for (const f of fields) {
      if (NO_FIELD.has(f) || NO_FIELD_ON.has(`${screen}|${f}`)) continue
      checked++
      // 패널이 그려 주는 두 줄은 화면이 값을 넘기는지로 본다
      // 상태 이름만 보면 안 된다 — 만들어 놓고 안 그리는 화면을 못 잡는다.
      // 상태 이름만 보면, 만들어 놓고 화면에 안 그리는 것을 못 잡는다.
      const has = f === '정렬/소계기준' ? /subtotal=\{|label="정렬\/소계기준"|>정렬\/소계기준</.test(own)
        : f === '데이터 보기형식' ? /view=\{|데이터 보기형식/.test(own)
          : (own + SHARED).includes(f)
      if (!has) bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 [${f}] 조건이 없다`)
    }
  }
  eq(`원본 조건 ${checked}개가 우리 화면에도 있다`
    + ` (안 만든 ${NO_FIELD.size + NO_FIELD_ON.size}종은 이유를 적고 뺐다, 아직 못 맞춘 화면 ${pending}개는 건너뜀)`,
    bad.join('\n') || '없음', '없음')
}

// ── 1-k) 일수는 화면마다 같은 모양으로 찍히나 ─────────────────────────────
console.log('\n■ 근태·휴가 일수를 화면마다 같은 모양으로 찍나')

/*
 * <b>같은 일수가 화면마다 다른 모양으로 보이지 않나.</b>
 *
 * <p>원본은 소수 <b>셋째 자리까지 채워</b> 찍는다(사본 근태현황 [근태] 값이 1.250).
 * 우리는 화면마다 달랐다 — 근태조회·휴가사용실적은 두 자리(1.00), 근태현황은
 * 아예 안 채웠다(1). 반차 0.5 와 반반차 0.25 가 섞이는 자료라, 자리수를 안 맞추면
 * 세로로 늘어섰을 때 <b>소수점 자리가 어긋나</b> 크기를 눈으로 못 고른다.
 *
 * <p>서식은 <code>utils/dayCount.ts</code> 하나로 모았다. 근태·휴가 화면이
 * <code>toLocaleString</code> 을 직접 부르면 또 갈라지므로 그것을 잡는다.
 */
{
  const DAY_SCREENS = ['hr/LeaveListPage.tsx', 'hr/VacationUsePage.tsx',
    'hr/VacationRemainPage.tsx', 'hr/AttendanceKindStatusPage.tsx']
  const bad = []
  let checked = 0
  for (const rel of DAY_SCREENS) {
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (!existsSync(path)) { bad.push(`${rel} 없음`); continue }
    checked++
    const src = readFileSync(path, 'utf8')
    if (!/formatDays/.test(src)) bad.push(`${rel} — 일수 서식을 dayCount 로 안 쓴다`)
    // 자릿수를 화면에서 직접 정하면 또 갈라진다
    const own = src.match(/minimumFractionDigits/g)
    if (own) bad.push(`${rel} — 자릿수를 화면에서 직접 정한다(${own.length}곳)`)
  }
  eq(`일수를 쓰는 화면 ${checked}개가 같은 서식을 쓴다`, bad.join('\n') || '없음', '없음')
}

// ── 2-k) 원본 화면 이름 ↔ 우리 화면 제목 ─────────────────────────────────
console.log('\n■ 화면을 열었을 때 붙는 이름이 원본과 같나')

/*
 * <b>화면 제목이 원본과 같나.</b>
 *
 * <p>메뉴 이름은 이미 견주고 있었는데(2-e) <b>화면을 열었을 때 위에 뜨는 이름</b>은
 * 안 보고 있었다. 둘은 원본에서도 다르다 — 메뉴는 [거래처등록]인데 화면 제목은
 * [거래처리스트]다(품목등록 → '품목등록 리스트' 와 같은 관계).
 *
 * <p>여기서 걸린 것: 거래처리스트(우리 '거래처등록 리스트'), 오더관리유형리스트
 * (우리 '오더관리유형등록'), 작업지시서조회(우리 '작업지시 리스트'),
 * 생산불출조회(우리 '생산불출'), 거래처별채권·채무(우리 '채권현황').
 * 원본을 쓰던 사람이 <b>같은 화면을 다른 이름으로 만나면</b> 그게 그건지 알 수 없다.
 *
 * <p>한 화면이 원본 화면 둘을 겸하면(판매·구매, 채권·채무) 제목도 고른 구분을 따라
 * 바뀌어야 한다. 그래서 제목이 정해진 문자열이 아니라 식이면 <b>그 식 안에</b>
 * 원본 이름이 있는지 본다.
 */
{
  const TITLE_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  /** 우리 화면이 원본 화면 여럿을 겸하거나, 제목을 EcListShell 로 안 다는 곳. */
  const TITLE_SKIP = new Map([
    ['단가적용순서설정', 'EcListShell 을 안 쓰고 제목을 직접 그린다'],
    ['출하입력', '출하현황 한 화면이 입력(팝업)과 목록을 겸한다'],
    ['출하지시서입력', '출하지시서 한 화면이 입력과 목록을 겸한다'],
    ['출하지시서조회', '위와 같음'],
    ['출_퇴근기록부(ID)', '출퇴근·근태·일정을 한 화면에서 본다'],
    ['생산계획_MRP리스트', '우리 이름은 생산계획/MRP생성이다 — 만드는 화면이라서'],
    ['생산불출입력', '생산불출조회 한 화면이 입력(팝업)과 목록을 겸한다'],
    ['거래처관리대장 I', '한 화면이 I·II 를 [구분]으로 겸한다'],
    ['거래처관리대장 II', '위와 같음'],
    ['생산입고II-소모품목 선택', '한 화면이 II·III 을 [품질검사요청] 여부로 겸한다'],
    ['생산입고 III-소모품목 선택', '위와 같음'],
    ['회계미반영현황(판매)', '일괄회계반영 화면이 반영·미반영을 겸한다'],
    ['회계미반영현황 (구매)', '위와 같음'],
    ['기안서작성', '기안서통합관리에서 [신규]로 연다'],
    ['작업지시서입력', '작업지시서조회 한 화면이 입력(팝업)과 목록을 겸한다'],
  ])
  const norm = (s) => s.replace(/[\s_()\-·]/g, '').replace(/\//g, '')

  const bad = []
  let checked = 0
  let pending = 0
  for (const [screen, rel] of TITLE_MAP) {
    if (TITLE_SKIP.has(screen)) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (PENDING.has(screen)) { pending++; continue }
    if (!pageSource(rel)) continue
    const src = pageSource(rel)   // 감싸기만 하는 화면은 감싸인 쪽까지 읽는다
    /*
     * 제목은 세 모양이다: 정해진 글자 · 식(구분에 따라 바뀜) · 변수.
     * 변수면 그 변수를 정하는 줄까지 같이 본다 — 안 그러면 이름이 'title' 로만 보인다.
     */
    // 제목이 여러 줄에 걸치기도 한다(구분에 따라 갈리는 식). 뒤 200자까지 본다.
    // 한 파일에 title= 이 여럿이다(화면 제목 · 팝업 제목 · 툴팁). 모두 모아 견준다.
    const line = [...src.matchAll(/title=[\s\S]{0,120}/g)].map((m) => m[0]).join(' ')
      || src.match(/title=[\s\S]{0,200}/)?.[0]
    if (!line) {
      // EcListShell 을 안 쓰고 제목을 직접 그리는 화면(생산입고 I·업무일지)
      if (norm(src).includes(norm(`>${screen}<`))) { checked++; continue }
      bad.push(`${rel.split('/').pop()} — 제목을 못 찾았다`)
      continue
    }
    checked++
    let text = typeof line === 'string' ? line : line[0]
    // 설정표에서 오는 제목(title={cfg.title})은 그 표의 title: '…' 줄을 같이 본다
    if (/\.title/.test(text)) {
      for (const d of src.matchAll(/title:\s*'([^']{2,40})'/g)) text += ' ' + d[1]
    }
    const ident = text.match(/title=\{(\w+)\}/)
    // 같은 파일 안의 공용 화면에 이름을 넘기는 모양(title={title} … <X title="수금현황" />)
    if (ident) for (const d of src.matchAll(/title="([^"]{2,40})"/g)) text += ' ' + d[1]
    if (ident) {
      for (const d of src.matchAll(new RegExp('(?:const|let)\\s+' + ident[1] + '\\s*=[^\\n]{0,160}', 'g'))) {
        text += ' ' + d[0]
      }
    }
    // EcListShell 을 안 쓰고 제목을 직접 그리는 화면도 있다(업무일지)
    if (!norm(text).includes(norm(screen)) && norm(src).includes(norm(`>${screen}<`))) continue
    if (!norm(text).includes(norm(screen))) {
      bad.push(`${rel.split('/').pop()}  원본 [${screen}] · 우리 [${text.slice(0, 60)}]`)
    }
  }
  eq(`원본 화면 이름 ${checked}개가 우리 제목에도 있다`
    + ` (겸하는 ${TITLE_SKIP.size}개는 이유를 적고 뺐다, 아직 못 맞춘 화면 ${pending}개는 건너뜀)`,
    bad.join('\n') || '없음', '없음')
}

// ── 1-l) 원본에서 눌러 여는 열 ────────────────────────────────────────────
console.log('\n■ 원본이 눌러서 여는 칸을 우리도 눌러 열 수 있나')

/*
 * <b>원본은 목록의 코드·이름을 눌러 그 건을 연다.</b> 사본 tbody 칸에 <code>&lt;a&gt;</code>
 * 가 든 열을 뽑아 <code>qa/fixtures/ecount-link-columns.json</code>(14화면)에 적었다.
 *
 * <p>우리는 오른쪽 끝 [수정] 버튼을 찾아야 했다. 열이 열다섯 개쯤 되는 표에서
 * 그 버튼은 <b>가로로 스크롤해야 보이는</b> 자리에 있다. 그래서 창고·공정·관리항목은
 * 아예 수정이 없다는 것도 이 축을 재다가 알았다.
 *
 * <p>여는 방법까지 같을 필요는 없다 — 우리 화면은 팝업을 열거나(openEdit) 다른
 * 화면으로 넘긴다(Link). 그 칸이 <b>눌리는지</b>만 본다.
 */
{
  const LINK_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-link-columns.json'), 'utf8'))
  /** 원본은 누를 수 있지만 우리는 아닌 칸 — 이유를 적는다. */
  const NO_LINK = new Map([
    ['거래처리스트|이체정보', '이체정보는 거래처 팝업 안에서 본다 — 따로 여는 화면이 없다'],
    ['품목등록 리스트|파일관리', '파일은 품목 팝업의 [이미지] 칸에서 붙이고 뗀다'],
    ['공정등록|작업코드등록', '줄마다가 아니라 화면 위 버튼 하나로 연다'],
    ['거래처별채권|기타할인등차액', '잔액 API 가 그 내역을 분해해 주지 않는다'],
    ['거래처별채무|기타할인등차액', '위와 같음'],
    ['근태현황|전표일자', '근태 전표를 여는 화면이 따로 없다 — 근태조회에서 본다'],
    ['생산계획_MRP리스트|생성일자', '생성 팝업을 안 만든다'],
    ['회계미반영현황 (구매)|일자-No.', '전표는 구매조회에서 연다'],
    ['회계미반영현황(판매)|일자-No.', '전표는 판매조회에서 연다'],
    ['BOR(작업소요시간)|생산품목코드', '품목은 품목등록에서 연다 — BOR 은 작업 줄만 고친다'],
  ])
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)

  const bad = []
  let checked = 0
  for (const [screen, cols] of Object.entries(cap)) {
    const rel = LINK_MAP.get(screen)
    if (!rel) continue
    const src = pageSource(rel)
    if (!src) continue
    for (const name of cols) {
      if (NO_LINK.has(`${screen}|${name}`)) continue
      checked++
      /*
       * 그 열의 <td> 안에 누를 것이 있나. 열 이름으로 <th> 를 찾고, 본문에서 같은
       * 값을 그리는 칸에 onClick 이나 <Link> 가 있는지 본다. 화면마다 변수 이름이
       * 달라(p·it·r·w) 값 이름으로 찾는다: {p.code} · {r.name} 처럼.
       */
      const field = /코드$/.test(name) ? 'code' : /명$|이름$/.test(name) ? 'name' : null
      if (!field) { checked--; continue }
      const re = new RegExp(`<td[^>]*>[\\s\\S]{0,400}?\\{\\w+\.${field}\\}`, 'g')
      const cells = [...src.matchAll(re)].map((m) => m[0])
      const clickable = cells.some((c) => /onClick=|<Link\b/.test(c))
      if (cells.length > 0 && !clickable) {
        bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 [${name}] 은 눌러서 여는 칸이다`)
      }
    }
  }
  eq(`원본이 눌러 여는 칸 ${checked}개를 우리도 누를 수 있다`
    + ` (못 여는 ${NO_LINK.size}개는 이유를 적고 뺐다)`,
    bad.join('\n') || '없음', '없음')
  void esc
}

// ── 2-l) 원본 보기 목록(라디오) ↔ 우리 보기 ──────────────────────────────
console.log('\n■ 원본이 고르게 하는 보기가 우리 화면에도 있나')

/*
 * <b>원본이 고르게 하는 보기가 우리에게도 있나.</b> 원본은 드롭다운이 아니라 라디오로
 * 고르게 한다. 사본에서 라디오 그룹의 보기 목록을 뽑아
 * <code>qa/fixtures/ecount-radio-options.json</code>(13화면 19그룹)에 적었다.
 *
 * <p>보기 하나가 빠지면 <b>그 방식으로는 아예 볼 수가 없다</b> — [구분]에 '집계' 가
 * 없으면 품목별로 모아 보는 길이 없는 식이다. 기본값이 무엇인지는 2-g 가 따로 본다.
 */
{
  const RADIO_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-radio-options.json'), 'utf8'))
  /** 원본에 있지만 우리가 안 만든 보기 — 이유를 적는다. */
  const NO_OPTION = new Map([
    ['거래처관계기준', '거래처에 계층(대표거래처)이 없다 — 개별 코드로만 본다'],
    ['개별거래처기준', '위와 같음 — 우리는 늘 개별이라 고를 것이 없다'],
    ['직접입력', '생산계획/MRP 생성 팝업을 안 만든다'],
    ['수율차이', '공정별 투입·산출을 쌓지 않아 수율을 못 낸다'],
    ['노무비배부액', '배부 자료(공정별 노무비)가 없다'],
    ['경비배부액', '위와 같음'],
    ['사용자지정집계', '집계축을 사람이 정의하는 기능이 없다'],
    ['선입선출(판매)', '입고 레이어를 남기지 않아 선입선출로 못 센다'],
    ['입고단가(VAT포함)', '생산실적에 단가 칸이 없다'],
    ['입고단가', '위와 같음'],
    ['사용', '설문 머리말·대상은 등록 화면에서 정한다 — 조회 조건이 아니다'],
    ['사용안함', '위와 같음'],
    ['입고단가(품목) - VAT 제외',
      '우리 입고단가는 매입 전표의 공급가액과 품목 구매단가라 이미 VAT 별도다 — 같은 값이 된다'],
  ])

  const bad = []
  let checked = 0
  for (const [screen, groups] of Object.entries(cap)) {
    const rel = RADIO_MAP.get(screen)
    if (!rel) continue
    const src = pageSource(rel)
    if (!src) continue
    for (const opts of Object.values(groups)) {
      for (const raw of opts) {
        const opt = raw.replace(/^\*/, '')
        if (NO_OPTION.has(opt)) continue
        checked++
        // 따옴표에 싸인 보기 이름을 찾는다(pill·option·문자열 배열 어느 모양이든)
        if (!src.includes(`'${opt}'`) && !src.includes(`"${opt}"`) && !src.includes(`>${opt}<`)) {
          bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 보기 [${opt}] 가 없다`)
        }
      }
    }
  }
  eq(`원본 보기 ${checked}개가 우리 화면에도 있다 (안 만든 ${NO_OPTION.size}종은 이유를 적고 뺐다)`,
    bad.join('\n') || '없음', '없음')
}

// ── 2-m) 원본 화면 탭 ↔ 우리 탭 ──────────────────────────────────────────
console.log('\n■ 원본 화면의 탭이 우리 화면에도 있나')

/*
 * <b>원본은 상태를 탭으로 가른다.</b> 사본에서 <code>tab-text</code> 를 뽑아
 * <code>qa/fixtures/ecount-screen-tabs.json</code>(26화면)에 적었다.
 *
 * <p>탭이 없으면 그 상태만 보는 길이 없다. 출·퇴근기록부가 그랬다 — 원본은
 * <b>[사용자]가 기본</b>이라 내 기록만 나오는데, 우리는 늘 전체를 뿌려서 사람이 많은
 * 회사에서는 내 줄을 눈으로 찾아야 했다.
 *
 * <p>[기본]·[전체] 둘뿐인 것은 조건 판 자체의 탭이라(조건 묶음 저장) 안 본다.
 */
{
  const TAB_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-screen-tabs.json'), 'utf8'))
  /** 원본에 있지만 우리가 안 만든 탭 — 이유를 적는다. */
  const NO_TAB = new Map([
    ['거래처관리대장 II|전체', '조건 판 탭이다(기본/전체) — 거래처등록에는 그 개념이 없다'],
    ['거래처관리대장 II|리스트', '거래처등록 화면 자체가 그 리스트다'],
    ['결제내역조회|강제회계반영', '전표를 강제로 만든 것인지 구분해 두지 않는다 — 반영/미반영뿐이다'],
    ['근태조회|UserPay', '이름만으로 뜻을 못 잡았다 — 사본 값이 비어 있어 무엇을 거르는지 모른다'],
    ['생산불출조회|결재중', '생산 전표를 전자결재에 올리지 않는다'],
    ['생산불출조회|미확인', '생산 전표에 확인 상태가 없다(판매·구매에만 있다)'],
    ['생산불출조회|확인', '위와 같음'], ['생산불출조회|전체', '가를 것이 없어 탭을 두지 않는다'],
    ['생산입고조회|결재중', '위와 같음'], ['생산입고조회|미확인', '위와 같음'],
    ['생산입고조회|확인', '위와 같음'], ['생산입고조회|전체', '위와 같음'],
    ['작업지시서조회|결재중', '위와 같음'], ['작업지시서조회|미확인', '위와 같음'],
    ['작업지시서조회|확인', '위와 같음'],
    ['생산입고II-소모품목 선택|생산', '원본은 생산 격자와 소모 격자를 탭으로 가르지만 우리는 한 화면에 둔다'],
    ['생산입고II-소모품목 선택|소모', '위와 같음'],
    ['생산입고 III-소모품목 선택|생산', '위와 같음'],
    ['생산입고 III-소모품목 선택|소모', '위와 같음'],
  ])

  const bad = []
  let checked = 0
  for (const [screen, tabs] of Object.entries(cap)) {
    if (tabs.length === 2 && tabs[0] === '기본' && tabs[1] === '전체') continue
    const rel = TAB_MAP.get(screen)
    if (!rel) continue
    const src = pageSource(rel)
    if (!src) continue
    for (const t of tabs) {
      if (NO_TAB.has(`${screen}|${t}`)) continue
      checked++
      if (!src.includes(`'${t}'`) && !src.includes(`"${t}"`) && !src.includes(`>${t}<`)) {
        bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 탭 [${t}] 가 없다`)
      }
    }
  }
  eq(`원본 탭 ${checked}개가 우리 화면에도 있다 (안 만든 ${NO_TAB.size}개는 이유를 적고 뺐다)`,
    bad.join('\n') || '없음', '없음')
}

// ── 1-m) 자료가 없을 때 문구 ─────────────────────────────────────────────
console.log('\n■ 목록이 비었을 때 하는 말이 원본과 같나')

/*
 * <b>원본은 한 문구만 쓴다: '등록된 데이터가 없습니다.'</b> 사본 40곳이 전부 같다.
 *
 * <p>우리는 <b>116가지</b>로 갈려 있었다 — '데이터가 없습니다', '거래처가 없습니다',
 * '조건에 맞는 거래처가 없습니다', '집계할 내역이 없습니다' …. 같은 상태를 화면마다
 * 다른 말로 적으면 사람은 <b>다른 상태로 읽는다</b>. 특히 '조건에 맞는 것이 없다' 와
 * '아직 아무것도 없다' 를 가르는 것처럼 보이는데, 실제로 우리 화면은 그 둘을 가르지 않았다.
 *
 * <p>빈 <b>목록</b> 문구만 본다(colSpan 이 붙은 줄). '불러오는 중…' 같은 다른 상태나
 * 저장할 때 나오는 검증 메시지는 건드리지 않는다.
 */
{
  const EMPTY = '등록된 데이터가 없습니다.'
  const bad = []
  let checked = 0
  for (const f of walk(join('frontend', 'src', 'pages')).filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/colSpan=\{[^}]*\}[^<>]*>([^<]{0,40}없습니다\.?)</g)) {
      checked++
      const msg = m[1].trim()
      if (msg !== EMPTY) bad.push(`${f.split(sep).pop()}  '${msg}'`)
    }
  }
  eq(`빈 목록 문구 ${checked}곳이 원본과 같은 한 문구다`, bad.join('\n') || '없음', '없음')
}

// ── 1-n) 코드도움 칸의 안내 문구 ─────────────────────────────────────────
console.log('\n■ 코드도움 칸이 무엇을 고르는 자리인지 스스로 말하나')

/*
 * <b>원본은 코드도움 칸의 안내 문구를 그 항목 이름으로 둔다</b>
 * (사본 실측: <code>placeholder=프로젝트</code> · 거래처 · 창고 · 담당자 …).
 *
 * <p>우리는 111곳이 '전체' 였다. 조건 판에 칸이 예닐곱 개 늘어서면 <b>어느 칸이
 * 무엇인지</b>를 왼쪽 라벨에서만 읽어야 했고, 칸만 보면 모두 똑같이 '전체' 였다.
 * 안 고르면 전체라는 뜻은 [전체] 지우기 항목(emptyLabel)이 따로 말해 준다.
 *
 * <p>CodePickerField 가 안내 문구를 안 받으면 라벨을 그대로 쓴다. 화면에서 '전체' 로
 * 덮어쓰면 그 화면만 또 갈라지므로 그것을 잡는다.
 */
{
  const bad = []
  let checked = 0
  for (const f of walk(join('frontend', 'src', 'pages')).filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/<CodePickerField[\s\S]{0,400}?\/>/g)) {
      checked++
      const ph = m[0].match(/placeholder="([^"]*)"/)
      if (ph && (ph[1] === '전체' || ph[1] === '선택')) {
        bad.push(`${f.split(sep).pop()}  코드도움 안내 문구가 '${ph[1]}' 이다`)
      }
    }
  }
  eq(`코드도움 ${checked}곳이 항목 이름으로 안내한다`, bad.join('\n') || '없음', '없음')
}

console.log('\n' + '─'.repeat(50))
console.log(`통과 ${pass} · 실패 ${fail}`)
if (fail) process.exit(1)
console.log('전부 통과했습니다.')
