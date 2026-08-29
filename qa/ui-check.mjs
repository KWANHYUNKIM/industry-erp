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
/**
 * <b>못 만든다고 적어 둔 것들이 모두 모이는 자리.</b>
 *
 * <p>이유마다 증거를 달기 시작하면서(1-t) 여덟 판에 일곱 개의 낡은 이유가 드러났다.
 * 그런데 증거는 <b>손으로 달아야</b> 하고, 새로 적는 이유에는 아무도 안 단다 —
 * 그러면 낡은 이유가 다시 쌓인다.
 *
 * <p>그래서 <b>증거 없는 이유의 수</b>를 세어 늘지 않게 한다. 예외를 새로 적으려면
 * 증거를 같이 달거나, 못 재는 이유라면 그 수를 손으로 올리며 <b>왜 못 재는지</b>를
 * 커밋에 적게 된다. 줄이는 것은 언제든 좋다.
 */
const ALL_REASON_KEYS = new Set()
const collectReasons = (m) => { for (const k of m.keys()) ALL_REASON_KEYS.add(k) }

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
/** 본문 글자(template literal)를 여는 글자. 소스에 그대로 쓰면 읽기 어려워 이름을 준다. */
const BTICK = String.fromCharCode(96)

/**
 * JSX 한 덩어리에서 <b>사람이 보는 글자</b>만 남긴다.
 *
 * <p>중괄호는 겹친다 — onClick={() => { a(); b() }} 처럼. 한 번만 지우면 바깥 짝이
 * 남고, 그 안의 '=>' 에 '>' 가 있어 태그 지우기가 거기서 끊긴다. 그래서 [할인]·
 * [현금수금] 같은 버튼이 <b>없는 것으로</b> 세어졌다. 안쪽부터 되풀이해 지운다.
 */
/**
 * 팝업 껍데기(Modal)가 그리는 [닫기]. 그 화면이 <b>실제로 Modal 을 쓸 때만</b> 더한다.
 * 전부 더하면 팝업이 없는 화면까지 통과한다.
 *
 * <p>EcListShell·EcSlipShell 은 일부러 뺐다 — 거기 있는 [닫기]는 <b>도움말 팝업</b>을
 * 닫는 것이라 화면을 닫는 원본 [닫기]와 다르다. 넣으면 목록 화면 전부가 통과해 버린다.
 */
/*
 * 공용 껍데기가 그려 주는 것도 그 화면의 것이다.
 * <b>EcStatusPanel</b> 은 현황 화면의 [구분]·[비교기간]·[정렬/소계기준]·[데이터 보기형식]을
 * 그린다 — 화면 파일만 보면 그 보기들이 <b>없는 것으로</b> 세어진다(비교기간의 다섯 보기가
 * 실제로 그랬다: 전년·전월·전주·전일 동일기간이 다 있는데 없다고 걸렸다).
 */
/**
 * 껍데기 파일 하나와 <b>그것이 곁에서 끌어 쓰는 파일들</b>을 이어 붙인다.
 *
 * <p>보기 이름이 껍데기 안에 글자로 있는 것은 아니다 — EcStatusPanel 은
 * <code>COMPARE_PERIODS</code>(periods.ts)를 펴서 그린다. 껍데기만 읽으면
 * 그 다섯 보기가 <b>없는 것으로</b> 세어진다.
 */
const withLocalDeps = (file, depth = 2, seen = new Set()) => {
  if (seen.has(file) || depth < 0) return ''
  seen.add(file)
  let text = readFileSync(file, 'utf8')
  const dir = file.split(sep).slice(0, -1).join(sep)
  for (const m of text.matchAll(/from\s+'\.\/([\w-]+)'/g)) {
    for (const ext of ['.ts', '.tsx']) {
      const dep = join(dir, m[1] + ext)
      // 두 단계까지 따라간다 — 패널 → EcPeriodPicks → periods 가 실제 깊이다.
      if (existsSync(dep)) { text += withLocalDeps(dep, depth - 1, seen); break }
    }
  }
  return text
}

const SHELL_FILES = new Map(['Modal']
  .map((c) => [c, join('frontend', 'src', 'components', `${c}.tsx`)])
  .filter(([, f]) => existsSync(f))
  .map(([c, f]) => [c, withLocalDeps(f)]))
const shellSrcFor = (src) => [...SHELL_FILES]
  .filter(([c]) => new RegExp('import[^\n]{0,40}\\b' + c + '\\b').test(src))
  .map(([, text]) => text).join('')

/**
 * 비교기간의 보기 이름 — <code>components/periods.ts</code> 의
 * <code>COMPARE_PERIODS</code> 를 그대로 읽는다. 여기 손으로 베껴 두면 저쪽이 바뀔 때
 * 조용히 어긋난다.
 */
const COMPARE_PERIOD_NAMES = (() => {
  const f = join('frontend', 'src', 'components', 'periods.ts')
  if (!existsSync(f)) return []
  const m = readFileSync(f, 'utf8').match(/COMPARE_PERIODS[^\n=]*=\s*\[([^\]]*)\]/)
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []
})()

/**
 * <b>"그 값, 서버는 이미 보내고 있다" 를 대신 알려 준다.</b>
 *
 * <p>같은 발견을 세 판 내리 손으로 했다 — 출하조회의 창고·프로젝트, 작업지시서조회의 규격,
 * 근태현황의 재직여부. 셋 다 <b>응답에 실려 오는데 화면이 받아 두지 않아</b> 조건을 못 걸고
 * 있었고, 화면 주석에는 "그 값이 없어서 안 만들었다" 고 <b>틀린 이유</b>가 적혀 있었다.
 *
 * <p>그래서 조건이 없다고 걸릴 때, 그 이름에 해당하는 필드가 <b>백엔드 응답 DTO 에 있는지</b>
 * 찾아 한 줄 덧붙인다. 있다고 해서 반드시 그 화면 응답에 있는 것은 아니므로 <b>단정하지 않고
 * 귀띔만</b> 한다 — 없다고 적기 전에 한 번 열어 보게 하는 것이 목적이다.
 */
const DTO_SRC = (() => {
  const dir = join('backend', 'src', 'main', 'java')
  if (!existsSync(dir)) return ''
  return walk(dir).filter((f) => f.endsWith('Dtos.java')).map((f) => readFileSync(f, 'utf8')).join('')
})()

/** 조건 이름 → 응답에서 찾아볼 필드 이름. 되풀이해 걸린 것만 적는다. */
const COND_FIELD = new Map([
  ['창고', 'warehouseName'], ['출하창고', 'warehouseName'], ['입고창고', 'warehouseName'],
  ['프로젝트', 'projectName'], ['담당자', 'employeeName'], ['거래처', 'partnerName'],
  ['품목', 'itemName'], ['규격', 'spec'], ['재직구분', 'active'], ['적요', 'remark'],
])

const serverHasHint = (cond) => {
  const field = COND_FIELD.get(cond)
  if (!field) return ''
  return new RegExp('\\b' + field + '\\b').test(DTO_SRC)
    ? `  ← 응답 DTO 에 ${field} 가 있다. 없다고 적기 전에 그 화면 응답을 열어 볼 것`
    : ''
}

const stripJsx = (s) => {
  let body = s
  for (let i = 0; i < 6 && /\{[^{}]*\}/.test(body); i++) body = body.replace(/\{[^{}]*\}/g, ' ')
  return body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * <b>고르는 것</b>의 이름을 모은다 — 알약(버튼) · &lt;option&gt; · 체크박스 글자 ·
 * 목록으로 그리는 상수 배열(MODES·SUBTOTALS…).
 *
 * <p>예전에는 파일 어디든 그 이름이 따옴표에 싸여 있으면 그 보기가 있는 것으로 쳤다.
 * 상태 이름을 담은 표나 오류 문구에 그 글자가 있으면 그냥 통과했다.
 */
const choiceNames = (src) => {
  const out = new Set()
  const add = (x) => { const v = String(x).trim(); if (v) out.add(v) }
  /*
   * 따옴표 글자를 <b>짝을 맞춰</b> 읽는다. 예전에는 [' 와 "] 를 한 묶음으로 두고
   * 빈 글자('')를 못 읽게 해서, ['', '전체'] 같은 배열에서 짝이 한 칸씩 밀렸다 —
   * 값 대신 사이의 ', ' 를 이름으로 주웠다. 홑·겹따옴표를 갈라 보고 빈 글자도 읽는다.
   */
  const QUOTED = /'([^']{0,24})'|"([^"]{0,24})"/g
  for (const tag of ['button', 'option', 'label']) {
    /*
     * <b>이 정규식이 여태 죽어 있었다.</b> 보통 따옴표 안의 <code>\b</code> 는 정규식의
     * 낱말 경계가 아니라 <b>백스페이스 글자</b>이고 <code>\s</code>·<code>\S</code> 는
     * 그냥 s·S 다 — 만들어진 것은 <code>&lt;button␈[sS]{0,400}?&lt;/button&gt;</code> 라
     * <b>아무것도 안 맞았다.</b> 알약·option·체크박스 글자를 모으는 이 세 줄이
     * 처음부터 한 번도 돌지 않은 채, 배열 규칙으로만 이름을 줍고 있었다.
     */
    const re = new RegExp(String.raw`<${tag}\b[\s\S]{0,400}?</${tag}>`, 'g')
    for (const m of src.matchAll(re)) {
      /*
       * <b>버튼이라고 다 보기는 아니다.</b> [삭제]·[할인] 같은 <b>행동</b> 버튼까지 세면
       * "그 보기가 있다" 가 거짓이 된다(정규식을 살리자마자 셋이 그렇게 걸렸다).
       * 우리 알약은 늘 <code>ec-pill</code> 이므로 그것만 고르는 자리로 친다.
       */
      if (tag === 'button' && !m[0].includes('ec-pill')) continue
      for (const q of m[0].matchAll(QUOTED)) add(q[1] ?? q[2])
      add(stripJsx(m[0]))
    }
  }
  /*
   * ['표','그래프'].map(…) · ([['A','가'],…] as const).map(…) — 목록으로 그리는 보기.
   * .map( 에서 <b>뒤로</b> 걸어가 짝이 맞는 여는 대괄호를 찾는다. 앞에서부터 정규식으로
   * 잡으면 주석 속 '[설문대상구분]' 같은 대괄호에 먼저 걸려 정작 그 배열을 지나쳐 버린다.
   */
  /*
   * 화면 설정에 적어 두고 <b>나중에 그리는</b> 탭·바로가기도 이름이다 —
   * <code>{ label: '생산입고 I', to: '/production/receipt-manual' }</code> 처럼
   * <code>label</code> 과 <code>to</code> 가 같은 객체에 있으면 그건 눌러서 가는 자리다.
   * (판매입력의 관련 탭 셋이 그렇게 적혀 있어 '없는 탭' 으로 세어졌다.)
   */
  for (const m of src.matchAll(/label:\s*'([^']{1,24})'[\s\S]{0,80}?to:\s*'/g)) add(m[1])

  /*
   * 화면 설정에 적어 두고 <b>저 아래에서 그리는</b> 탭·바로가기도 이름이다 —
   * <code>{ label: '생산입고 I', to: '/production/receipt-manual' }</code> 처럼
   * <code>label</code> 과 <code>to</code> 가 한 객체에 있으면 눌러서 가는 자리다.
   * 판매입력의 관련 탭 셋이 그렇게 적혀 있어 <b>'없는 탭' 으로 세어졌다</b> —
   * 배열이 <code>.map(</code> 에서 멀리 떨어져 있어 뒤로 걸어가는 규칙에 안 걸린다.
   */
  for (const m of src.matchAll(/label:\s*'([^']{1,24})'[\s\S]{0,80}?\bto:\s*'/g)) add(m[1])

  /*
   * <b>비교기간은 공용 패널이 그린다.</b> 다섯 보기(사용안함·전년/전월/전주/전일 동일기간)는
   * <code>periods.ts</code> 의 상수라 화면 파일 어디에도 글자가 없다 — 다 있는데
   * '없다' 로 걸렸다.
   *
   * <p>그렇다고 패널 파일을 통째로 섞으면 <b>딴 화면의 낱말과 부딪힌다</b> —
   * 실제로 설문조사조회의 [사용안함](머리말 사용여부)이 비교기간의 [사용안함] 으로
   * 잘못 맞았다. 그래서 <b>그 자리를 켠 화면에만</b> 붙인다:
   * 패널에 <code>onCompareChange</code> 를 넘겼는지로 안다.
   */
  if (/onCompareChange=/.test(src)) for (const c of COMPARE_PERIOD_NAMES) add(c)

  /*
   * <code>EMPLOYMENTS.map(…)</code> 처럼 <b>이름으로 편 배열</b>도 보기다.
   * 뒤로 걸어가는 규칙은 <code>]</code> 로 끝나는 <b>그 자리의</b> 배열만 보므로 지나친다.
   * <b>같은 파일 안에서만</b> 이름을 되짚으니 딴 화면과 부딪힐 일은 없다.
   */
  for (const m of src.matchAll(/\b([A-Z][A-Z0-9_]{2,})\.map\(/g)) {
    const decl = src.match(new RegExp('\\b' + m[1] + '\\b[^\\n=]*=\\s*\\[([\\s\\S]{0,400}?)\\]\\s*(?:as const)?\\s*$', 'm'))
    if (decl) for (const q of decl[1].matchAll(QUOTED)) add(q[1] ?? q[2])
  }

  for (const m of src.matchAll(/\.map\(/g)) {
    const before = src.slice(Math.max(0, m.index - 400), m.index)
    if (!/\]\s*(?:as const\s*)?\)?\s*$/.test(before)) continue
    const close = before.lastIndexOf(']')
    let depth = 0
    let open = -1
    for (let i = close; i >= 0; i--) {
      if (before[i] === ']') depth += 1
      else if (before[i] === '[') { depth -= 1; if (depth === 0) { open = i; break } }
    }
    if (open < 0) continue
    for (const q of before.slice(open, close + 1).matchAll(QUOTED)) add(q[1] ?? q[2])
  }
  // const MODES = ['거래별', '집계'] — 상수로 두고 아래에서 그리는 것(이 저장소의 관례)
  for (const m of src.matchAll(/(?:const|let)\s+[A-Z][A-Z0-9_]*\s*=\s*\[[^\]]{0,400}\]/g)) {
    for (const q of m[0].matchAll(QUOTED)) add(q[1] ?? q[2])
  }
  // const CAT_LABEL: Record<Cat, string> = { SALES: '영업관리', … } — 이름표 표
  for (const m of src.matchAll(/(?:const|let)\s+[A-Z][A-Z0-9_]*[^=\n]{0,80}=\s*\{[^{}]{0,400}\}/g)) {
    for (const q of m[0].matchAll(QUOTED)) add(q[1] ?? q[2])
  }
  // useState<'사용자' | '전체'>('사용자') — 탭 이름을 타입으로 못 박아 두는 곳
  for (const m of src.matchAll(/useState<[^>\n]{0,160}>/g)) {
    for (const q of m[0].matchAll(QUOTED)) add(q[1] ?? q[2])
  }
  /*
   * {radio('scope', …, '내부')} — 화면에 그리는 <b>함수 호출의 인자</b>.
   * 설문조사입력이 보기 일곱 개를 이 모양으로 그린다. 이것까지 봐야
   * "보기가 없다" 는 거짓 경고가 안 난다.
   */
  for (const m of src.matchAll(/\{\s*\w+\([\s\S]{0,240}?\)\s*\}/g)) {
    for (const q of m[0].matchAll(QUOTED)) add(q[1] ?? q[2])
  }
  return out
}

/**
 * 표 머리 이름 뒤에 붙을 수 있는 <b>정렬 표시</b>.
 *
 * <p>예전에는 ▼ 글자 하나였다. 머리를 눌러 정렬하게 만들면서
 * <code>{sort.mark('거래처')}</code> 로 바뀌었는데, 검사들이 그것을 모르고 있어
 * <b>정렬을 건 화면이 열·폭·탭 검사에서 통째로 빠졌다.</b> 둘 다 받아들인다.
 */
/**
 * 화살표 함수의 <code>=&gt;</code> 를 지운다.
 *
 * <p><code>&lt;th[^&gt;]*&gt;</code> 는 <code>onClick={() =&gt; …}</code> 의 화살표를
 * 태그 끝으로 읽어 <b>그 머리를 통째로 못 찾는다.</b> 정렬을 걸면서 머리마다
 * onClick 이 붙었으니, 검사에 넣기 전에 화살표만 지운다.
 */
const noArrow = (h) => h.replace(/=>/g, '  ')

const MARK_TAIL = '(?:\u25bc|\\{sort\\.mark\\([^)]*\\)\\})?'

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
  // 화살표를 지우고 센다 — <td onClick={() => …} colSpan={4}> 의 colSpan 을 놓치지 않게.
  for (const m of noArrow(row).matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))) {
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

  const mapsCells = (raw) => {
    /*
     * 속성을 지우려면 <b>태그의 &gt; 만</b> 남겨야 한다. 화살표(<code>=&gt;</code>) 말고
     * <b>비교 연산자</b>도 태그를 끊는다 — <code>checked={rows.length &gt; 0 && …}</code>
     * 가 그렇다. 그 둘을 지운 뒤에 속성을 걷어 낸다.
     */
    const x = noArrow(raw).replace(/ > /g, '   ').replace(/<([a-zA-Z]+)[^>]*>/g, '<$1>')
    for (const m of x.matchAll(/\.map\(/g)) {
      const after = x.slice(m.index)
      const first = after.match(/<(tr|td|th)\b/)
      if (first && first[1] !== "tr") return true
    }
    return false
  }

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
    if (hasConditionalCell(head)) { bodySkipped++; continue }

    // 머리든 본문이든 한쪽만 그래도 두 쪽을 견줄 수 없다(설문조사입력의 보기항목 5칸이 그렇다).
    /*
     * <b>칸을 만드는 map</b> 이 있으면 정적으로 셀 수 없다 — 자료 수만큼 칸이 늘어난다
     * (설문조사입력의 보기항목 5칸, 오더관리유형리스트의 1~10단계).
     *
     * <p>줄을 만드는 map(`rows.map((r) => (<tr>…`)은 그냥 지나간다. 그것까지 건너뛰면
     * 거의 모든 표가 빠져 이 검사가 아무것도 안 보게 된다(실제로 301개 중 2개만 봤다).
     * 가르는 기준은 <b>map 뒤에 처음 나오는 표 태그</b>다 — tr 이면 줄, td/th 면 칸.
     */
    /*
     * <b>속성 안의 map 은 칸을 만들지 않는다.</b> 머리의 전체선택 체크박스가
     * <code>onChange={() => setChecked(new Set(rows.map((r) => r.id)))}</code> 처럼
     * 핸들러 안에서 map 을 쓰는데, 그것을 '칸을 만드는 map' 으로 읽어
     * <b>그 표를 통째로 건너뛰고 있었다</b>(공정등록에서 실제로 그랬다 — 머리 한 칸을
     * 지워도 검사가 아무 말을 안 했다). 태그 속성을 지우고 본다.
     */
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
      /*
       * <b>줄 안에서 갈리는 칸</b>은 정적으로 못 센다. 판매입력 이익표가 그렇다 —
       * 원가가 없으면 <code>colSpan={4}</code> 한 칸, 있으면 네 칸을 그린다.
       * 둘 다 4열이라 실제로는 맞는데, 다 세면 11칸으로 읽혀 <b>거짓 경보</b>가 된다.
       */
      if (hasConditionalCell(rm[1])) { unknown = true; break }
      /*
       * <b>안내 줄을 자료 줄로 착각하지 않는다.</b> "등록된 데이터가 없습니다" 는
       * <code>&lt;td colSpan={18}&gt;</code> 한 칸인데, colSpan 을 펴서 세면 18칸으로
       * 읽혀 자료 줄 노릇을 한다 — 실제로 품목등록에서 그렇게 <b>엉뚱한 줄을 견주었다</b>.
       * 자료 줄인지는 <b>td 태그 수</b>로 가린다.
       */
      const tags = (noArrow(rm[1]).match(/<td\b/g) || []).length
      if (tags < 2) continue
      const c = countCells(rm[1], 'td')
      if (c === null) { unknown = true; break }
      picked = c
      break
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

  /*
   * <b>훅을 부른 곳만 보고 있었다.</b> 정작 <b>달아야 할 표에 달렸는지</b>는 아무도 안 봤다 —
   * 칸이 자료 따라 변하는 표가 든 파일이 41개인데 그중 <b>32개에 훅이 없다</b>.
   * 그 표들은 정적 검사가 못 세고 런타임 검사도 없으니 <b>아무도 안 보는 표</b>다.
   *
   * <p>한 번에 서른둘을 달 수는 없어서, 지금 없는 것을 적어 두고 <b>늘지 않는지</b>만 본다
   * (▼ 만 그린 화면을 걷을 때 쓴 방식과 같다). 달면 그 줄을 지워야 한다 — 안 지우면 걸린다.
   */
  const TODO = JSON.parse(readFileSync(join('qa', 'fixtures', 'unchecked-dynamic-tables.json'), 'utf8'))
  const listed = new Set(TODO)
  const grown = []
  const stale = []
  for (const f of pages) {
    const src = readFileSync(f, 'utf8')
    const parts = f.split(sep)
    const rel = parts.slice(parts.indexOf('pages') + 1).join('/')
    let dynamic = false
    for (const tm of src.matchAll(/<table\b[\s\S]*?<\/table>/g)) {
      const t = tm[0]
      const head = t.match(/<thead\b[\s\S]*?<\/thead>/)?.[0]
      const body = t.match(/<tbody\b[\s\S]*?<\/tbody>/)?.[0]
      if (!head || !body) continue
      if (hasConditionalCell(head) || mapsCells(head) || mapsCells(body)) { dynamic = true; break }
    }
    const has = src.includes('useTableColumnCheck')
    if (dynamic && !has && !listed.has(rel)) grown.push(`${rel} — 칸이 변하는 표인데 아무도 안 본다`)
    if (listed.has(rel) && (has || !dynamic)) stale.push(`${rel} — 이제 본다(목록에서 지우세요)`)
  }
  eq(`칸이 변하는 표에 런타임 검사가 없는 화면이 늘지 않았다 (아직 ${TODO.length}개 남음)`,
    grown.join('\n') || '없음', '없음')
  eq('달아 놓고 목록에 남겨 둔 화면이 없다', stale.join('\n') || '없음', '없음')
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
// ── 1-z) 검사 자신이 죽은 정규식을 들고 있지 않나 ────────────────────────
console.log('\n■ 검사가 만드는 정규식이 죽어 있지 않나')

/*
 * <b>보통 따옴표 안의 한 겹 역슬래시는 정규식 문법이 아니다.</b>
 *   <code>'\b'</code> → 백스페이스 글자 · <code>'\s'</code> → 그냥 s ·
 *   <code>'\d'</code> → d · <code>'\w'</code> → w
 *
 * <p>그렇게 만든 <code>RegExp</code> 는 <b>조용히 아무것도 안 맞는다.</b> 실제로 두 군데
 * 있었다 — 보기 이름을 모으는 <code>&lt;button&gt;</code> 수집기는
 * <code>&lt;button␈[sS]…&gt;</code> 가 되어 <b>한 번도 돌지 않았고</b>(고치자 견주는 보기가
 * 104 → 136 이 됐다), 열 폭 검사는 <code>s*이름s*</code> 를 찾고 있었다.
 *
 * <p>둘 다 <b>초록불인 채로</b> 아무 일도 안 하고 있었다. 그래서 검사가 자기 자신을 훑는다.
 * 올바른 쓰기는 <code>String.raw`…`</code> 나 두 겹(<code>'\\s'</code>)이다.
 * <code>\n</code>·<code>\r</code>·<code>\t</code> 는 그 글자가 되어 정규식에서도 뜻이 같으므로
 * 걸지 않는다(<code>[^\n]</code> 은 올바른 관용구다).
 */
{
  const RISKY = /\\[bsSdDwW.+*?^$|(){}[\]]/
  const bad = []
  for (const f of readdirSync('qa').filter((x) => x.endsWith('.mjs'))) {
    readFileSync(join('qa', f), 'utf8').split('\n').forEach((line, i) => {
      if (!/RegExp\(/.test(line) || /String\.raw|`/.test(line)) return
      for (const m of line.matchAll(/'([^']*)'|"([^"]*)"/g)) {
        const lit = m[1] ?? m[2]
        if (lit && RISKY.test(lit.replace(/\\\\./g, ''))) {
          bad.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`)
          break
        }
      }
    })
  }
  eq('따옴표로 만든 정규식에 한 겹 역슬래시가 없다', bad.join('\n') || '없음', '없음')
}

console.log('\n■ 코드로 고르는 칸을 드롭다운으로 두지 않았나')

/*
 * <b>원본이 코드도움으로 받는 칸을 우리도 코드도움으로 받나.</b>
 *
 * <p>사본의 조건 판은 칸마다 어떤 <b>입력 모양</b>인지가 마크업에 남아 있다 —
 * <code>btn-code-search</code>/<code>code.container</code>(코드도움) ·
 * <code>date.selectbox</code>(달력) · <code>select.selectbox</code>(드롭다운).
 * 232화면 4014칸을 뽑아 보니 <b>창고·거래처·품목·프로젝트·담당자는 예외 없이 코드도움</b>이다.
 * 그중 우리가 화면을 만든 58화면 520칸을
 * <code>qa/fixtures/ecount-code-helper-fields.json</code> 에 적었다.
 *
 * <p>드롭다운은 <b>항목이 늘어나는 순간 못 쓰는 칸</b>이 된다. 코드로도 이름으로도
 * 못 찾고, 스크롤로만 뒤져야 한다. 실제로 열 곳이 그렇게 되어 있었다 —
 * 생산불출입력의 [담당자]·[보내는창고]·[받는공장], 작업지시서입력의 [납품처]·[담당자],
 * 자원등록의 [위치], 작업내역입력의 [생산공장].
 *
 * <p>우리 화면에 <b>그 이름의 칸이 아예 없으면</b> 여기서는 따지지 않는다 —
 * 없는 칸은 다른 검사(조건 견주기)가 본다.
 */
{
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-code-helper-fields.json'), 'utf8'))
  const MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const esc = (s2) => s2.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)
  const bad = []
  let checked = 0
  for (const [screen, fields] of Object.entries(cap)) {
    const rel = MAP.get(screen)
    if (!rel) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (!existsSync(path)) continue
    const src = readFileSync(path, 'utf8')
    const flatSrc = src.replace(/\s*\n\s*/g, '')
    for (const label of fields) {
      const picker = new RegExp('CodePickerField[^>]{0,400}?label="' + esc(label) + '"').test(src)
        || new RegExp('label="' + esc(label) + '"[^>]{0,400}?items=').test(src)
      /*
       * 라벨과 칸 사이에 <b>주석이나 감싸는 태그</b>가 끼는 일이 흔하다. 딱 붙은 것만 보면
       * 주석 한 줄에 검사가 눈을 감는다 — 실제로 그렇게 통과하는 걸 확인하고 고쳤다.
       * 라벨 뒤 300자 안에서 <b>어느 쪽이 먼저 나오나</b>로 가린다.
       */
      const at = flatSrc.search(new RegExp('<label\\b[^>]*>\\s*' + esc(label) + '\\s*</label>'))
      const near = at < 0 ? '' : flatSrc.slice(at, at + 300)
      const iSel = near.indexOf('<select')
      const iPick = near.indexOf('<CodePickerField')
      const sel = iSel >= 0 && (iPick < 0 || iSel < iPick)
      if (!picker && !sel) continue
      checked += 1
      if (sel && !picker) bad.push(`${rel.split('/').pop()}  [${label}] — 원본은 코드도움인데 우리는 드롭다운이다`)
    }
  }
  eq(`원본이 코드도움으로 받는 칸 ${checked}개를 우리도 코드로 고른다`, bad.join('\n') || '없음', '없음')

  /*
   * <b>지도에 없는 화면까지.</b> 위 fixture 는 우리가 짝지은 화면만 덮는다. 그런데
   * 사본에서 창고 102 · 프로젝트 110 · 거래처 98 · 품목 100 · 담당자 82 · 부서 21 —
   * <b>525칸이 예외 없이 코드도움</b>이었다. 이름만으로도 말할 수 있는 규칙이라,
   * 화면을 가리지 않고 <b>코드 마스터 이름표 옆의 드롭다운</b>을 찾는다.
   */
  const MASTER = ['창고', '거래처', '품목', '프로젝트', '담당자', '사원', '부서', '공정', '자원', '계정', '납품처', '구매처', '공장']
  /** 이름은 코드 마스터를 닮았지만 <b>고를 값이 정해져 있는</b> 칸 — 왜인지 적는다. */
  const NOT_MASTER = new Map([
    ['trade/PartnersPage.tsx|거래처코드구분', '코드 마스터가 아니라 <b>구분</b>이다 — 등록번호 자릿수가 여기서 갈린다'],
    ['trade/PartnersPage.tsx|출하대상거래처', '거래처를 고르는 칸이 아니라 <b>대상/제외</b> 두 값이다'],
    ['trade/PartnersPage.tsx|세무신고거래처', '위와 같음 — 거래처를 고르는 칸이 아니라 <b>대상/제외</b> 두 값이다'],
    ['production/ResourcePage.tsx|자원명 *', '남의 자원을 고르는 칸이 아니라 <b>이 자원의 이름</b>이다'],
    ['groupware/ApprovalListPage.tsx|부서', '마스터가 아니라 <b>올라온 기안서에 적힌 부서</b>를 모은 목록이다'],
    ['groupware/ApprovalListPage.tsx|프로젝트', '위와 같음'],
  ])
  const loose = []
  const unused = new Set(NOT_MASTER.keys())
  for (const f of walk(join('frontend', 'src', 'pages')).filter((x) => x.endsWith('.tsx'))) {
    const rel = f.split(sep).join('/').split('frontend/src/pages/')[1]
    /*
     * <b>표 머리는 이름표가 아니다.</b> &lt;th&gt; 를 이름표로 치기 시작하니
     * 쇼핑몰관리의 열 머리 [품목 매핑] 이 걸렸다 — 그 아래 본문에 &lt;select&gt; 가
     * 있어서다. thead 를 걷어 내고 본다(등록 폼의 &lt;th&gt; 만 남는다).
     */
    const flat = readFileSync(f, 'utf8').replace(/\s*\n\s*/g, '').replace(/<thead>[\s\S]*?<\/thead>/g, '')
    /*
     * 이름표가 <b>&lt;label&gt; 만은 아니다.</b> 폼을 표로 짜는 화면(발주서입력 …)은
     * <code>&lt;th&gt;담당자&lt;/th&gt;&lt;td&gt;…&lt;/td&gt;</code> 로 적는다 — label 만 보다가
     * 발주서입력의 [담당자]·[창고]가 드롭다운인 걸 <b>못 보고 있었다.</b>
     */
    /*
     * <b>그 칸의 자리 안에서만</b> 본다. 처음엔 이름표 뒤 300자를 훑었는데,
     * 표로 짠 폼은 줄이 촘촘해서 <b>다음 칸의 입력</b>까지 창에 들어왔다 —
     * 쇼핑몰관리의 [품목](글자만 찍는 칸)이 바로 아래 [거래처(몰)] 의 드롭다운 때문에
     * 걸렸다. &lt;th&gt; 는 짝이 되는 &lt;/td&gt; 까지, &lt;label&gt; 은 뒤 300자까지 본다.
     */
    const spots = []
    for (const m of flat.matchAll(/<th\b[^>]*>([^<]{1,14})<\/th>(<td\b[^>]*>[\s\S]*?<\/td>)/g)) spots.push([m[1], m[2]])
    for (const m of flat.matchAll(/<label\b[^>]*>([^<]{1,14})<\/label>/g)) {
      spots.push([m[1], flat.slice(m.index, m.index + 300)])
    }
    for (const m of spots) {
      const label = m[0].trim()
      if (!MASTER.some((c) => label.includes(c))) continue
      if (!m[1].includes('<select')) continue
      if (m[1].includes('<CodePickerField')) continue
      const key = rel + '|' + label
      if (NOT_MASTER.has(key)) { unused.delete(key); continue }
      loose.push(`${rel}  [${label}] — 코드 마스터인데 드롭다운이다`)
    }
  }
  /*
   * 이름표를 &lt;th&gt; 까지 넓히고 창을 그 칸 안으로 좁히자 <b>여덟</b>이 더 드러났다.
   * 한 판에 다 바꾸지 않고 목록에 적어 <b>늘지만 않게</b> 한다 — 몇은 코드 마스터인지
   * 판단이 필요하다(품목분류·세무신고거래처는 고를 값이 정해진 칸일 수 있다).
   */
  const TODO = JSON.parse(readFileSync(join('qa', 'fixtures', 'pending-code-helper.json'), 'utf8'))
  const found = [...new Set(loose)]
  const grown = found.filter((x) => !TODO.includes(x))
  const gone = TODO.filter((x) => !found.includes(x))
  eq(`코드 마스터 이름표 옆에 드롭다운이 없다 (아직 ${TODO.length}칸 남음)`, grown.join('\n') || '없음', '없음')
  eq('바꿔 놓고 목록에 남겨 둔 칸이 없다', gone.join('\n') || '없음', '없음')
  eq(`코드 마스터가 아니라고 적어 둔 ${NOT_MASTER.size}칸이 아직 그대로다`,
    [...unused].join('\n') || '없음', '없음')
}

console.log('\n■ 대조표를 다 쓰고 있나')

/*
 * <b>대조표를 늘려도 검사가 안 커지는 일</b>이 이 저장소에서 여러 번 있었다.
 *
 * <p>대조표는 원본 <b>화면 이름</b>으로 적혀 있고, 검사는 그 이름을 우리 파일에 짝지어 주는
 * <code>.ordermap.json</code> 을 거쳐야 화면을 찾는다. 그래서 대조표에 화면을 스무 개 더해도
 * <b>지도에 없으면 한 개도 안 늘어난다.</b> 실제로 지도를 90 → 129 로 넓힌 판에는
 * 대조표가 그대로여서 <b>검사가 하나도 안 커졌고</b>, 폭을 82화면 뽑아 둔 판에는
 * 지도에 걸린 37화면만 쓰이고 있었다. 둘 다 초록불이라 아무도 몰랐다.
 *
 * <p>그래서 <b>대조표에 있는데 지도에 없는 화면</b>을 센다. 늘 0이어야 한다 —
 * 못 거는 화면은 <code>unmapped-screens.json</code> 에 이유를 적고 뺀다.
 */
{
  const MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const UNMAPPED = JSON.parse(readFileSync(join('qa', 'fixtures', 'unmapped-screens.json'), 'utf8'))
  /** 화면 이름이 아니라 <b>메뉴 경로</b>로 적힌 대조표 — 지도를 거치지 않는다. */
  const NOT_BY_SCREEN = new Set(['ecount-menu.json'])
  const bad = []
  let checked = 0
  for (const f of readdirSync(join('qa', 'fixtures'))) {
    if (!f.endsWith('.json') || f.startsWith('.') || NOT_BY_SCREEN.has(f)) continue
    if (f.startsWith('pending-') || f === 'unmapped-screens.json'
      || f === 'unchecked-dynamic-tables.json' || f === 'decorative-sort-marks.json'
      /* 화면별 표가 아니라 <b>수 하나</b>를 담는 자리다. */
      || f === 'unwitnessed-reasons.json'
      || f === 'ecount-missing-columns.json') continue
    let j
    try { j = JSON.parse(readFileSync(join('qa', 'fixtures', f), 'utf8')) } catch { continue }
    if (Array.isArray(j)) continue
    for (const k of Object.keys(j)) {
      /*
       * <b>화면|항목</b> 으로 적힌 대조표(예: 이유의 근거)는 앞쪽이 화면 이름이다.
       * 통째로 지도에서 찾으면 <b>있는 화면도 없다고</b> 나온다.
       */
      /*
       * 이유의 근거는 <b>조건 이름 하나</b>로 적힌 키도 있다(화면을 안 가리는 전역 예외).
       * 그런 키는 지도에서 찾을 것이 없다 — 대신 아래 1-t 에서 <b>그 이름의 예외가
       * 실제로 있는지</b>를 잰다. 여기서는 화면|항목 꼴만 본다.
       */
      if (f === 'reason-witnesses.json' && !k.includes('|')) continue
      const screen = k.includes('|') ? k.slice(0, k.indexOf('|')) : k
      if (UNMAPPED[screen] !== undefined) continue
      checked += 1
      if (!MAP.has(screen)) bad.push(`${f}  [${k}] — 대조표에 있는데 지도에 없다(늘려도 안 쓰인다)`)
    }
  }
  eq(`대조표 화면 ${checked}개가 다 지도에 걸려 있다`, bad.join('\n') || '없음', '없음')
}

console.log('\n■ 검사의 태그 정규식이 옆 태그까지 먹지 않나')

/*
 * <b><code>&lt;th[^&gt;]*&gt;</code> 는 <code>&lt;thead&gt;</code> 도 맞는다.</b>
 * <code>th</code> 뒤의 <code>ead</code> 가 <code>[^&gt;]*</code> 로 먹히기 때문이다.
 *
 * <p>그래서 머리 표를 훑을 때마다 <b>열이 하나 덧세어져</b> 있었고, 그 가짜 열의 내용은
 * <code>&lt;thead&gt;</code> 부터 첫 <code>&lt;/th&gt;</code> 까지 — <b>주석까지 통째</b>였다.
 * 여태는 그 덩어리가 어떤 열 이름과도 안 맞아 조용히 버려졌을 뿐이다.
 * ▼ 를 세는 곳에서는 <b>주석 안의 ▼</b> 가 정렬 표시로 잡힐 수 있었다.
 *
 * <p>같은 함정이 <code>&lt;b&gt;</code>(<code>&lt;button&gt;·&lt;br&gt;·&lt;body&gt;</code>),
 * <code>&lt;a&gt;</code>(<code>&lt;article&gt;</code>), <code>&lt;p&gt;</code>(<code>&lt;pre&gt;</code>),
 * <code>&lt;li&gt;</code>(<code>&lt;link&gt;</code>), <code>&lt;col&gt;</code>(<code>&lt;colgroup&gt;</code>)
 * 에도 있다. 앞머리를 먹는 태그를 쓸 때는 <code>\b</code> 를 붙인다.
 */
{
  /** JSX 에 실제로 나오는 태그 이름 — 이 가운데 앞머리가 겹치는 짝만 따진다. */
  const TAGS = ['a', 'abbr', 'article', 'aside', 'b', 'br', 'body', 'blockquote', 'button',
    'col', 'colgroup', 'div', 'dl', 'dt', 'dd', 'em', 'form', 'h1', 'h2', 'h3', 'h4',
    'i', 'img', 'input', 'label', 'li', 'link', 'main', 'nav', 'ol', 'option', 'optgroup',
    'p', 'pre', 'path', 's', 'section', 'select', 'small', 'span', 'strong', 'style', 'sup',
    'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'ul']
  const bad = []
  for (const f of readdirSync('qa').filter((x) => x.endsWith('.mjs'))) {
    readFileSync(join('qa', f), 'utf8').split('\n').forEach((line, i) => {
      /* 여는 태그 뒤에 낱말경계도 글자도 아닌 것이 오면 앞머리만 맞추는 정규식이다. */
      for (const m of line.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)(\\\\b|\\b)?([^a-zA-Z0-9\\s>]|$)/g)) {
        const [, tag, guard] = m
        if (guard || !TAGS.includes(tag)) continue
        const eaten = TAGS.filter((t) => t !== tag && t.startsWith(tag))
        if (!eaten.length) continue
        bad.push(`${f}:${i + 1}  <${tag}…> 가 ${eaten.map((t) => '<' + t + '>').join(' ')} 도 먹는다`)
      }
    })
  }
  eq('앞머리가 겹치는 태그에 낱말경계(\\b)를 붙였다', bad.join('\n') || '없음', '없음')
}
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
    // periodOf('이번기수', new Date(), fiscalStart) 처럼 인자가 더 붙기도 한다.
    const used = [...src.matchAll(/periodOf\('([^']+)'[^)]*\)/g)].map((m) => m[1])
    // 공용 화면을 감싸기만 하는 곳은 기본값을 <b>속성으로</b> 넘긴다
    // (defaultPick="직전기수"). 파일 안에 periodOf 가 없다고 없는 것이 아니다.
    for (const m of src.matchAll(/defaultPick=["']([^"']+)["']/g)) used.push(m[1])
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
  /*
   * <b>대조표를 밑에 깔고</b> 손으로 적어 둔 것을 덧쓴다. 손으로 적은 지도만 쓰면
   * fixture 를 늘려도 검사가 안 커진다 — 체크박스 기본값 검사가 실제로 그랬다
   * (35화면 중 9화면만 보고 있었다). 이름이 대조표와 다른 화면은 아래 줄이 이긴다.
   */
  const ORDERMAP_BASE = JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8'))
  const ALIGN_MAP = new Map([
    ...ORDERMAP_BASE,
    ['거래처리스트', 'trade/PartnersPage.tsx'],
    ['거래처별채권', 'trade/LedgerPage.tsx'],
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
  /*
   * 머리 칸 하나를 이름으로 찾는다.
   *
   * <p>원본이 <b>같은 칸을 화면에 따라 달리 부르는</b> 자리가 있다 — 판매입력은 [수량],
   * 구매입력은 [기본수량] 이다. 우리는 한 화면이 둘을 겸하므로 머리를 삼항으로 적는다
   * (<code>{'{'}mode === 'sales' ? '수량' : '기본수량'{'}'}</code>). 글자만 찾으면 그 칸을
   * <b>없는 것으로</b> 본다 — 실제로 네 열(판매입력·판매입력II 의 [수량], 구매입력·
   * 구매조회 의 [기본수량])이 그렇게 빠진 것으로 잡혔다. 따옴표 안의 이름도 본다.
   */
  const thFor = (head, name) => head.match(new RegExp('<th\\b([^>]*)>\\s*' + esc(name) + '\\s*' + MARK_TAIL + '\\s*</th>'))
    || head.match(new RegExp('<th\\b([^>]*)>\\s*\\{[^{}]*\'' + esc(name) + '\'[^{}]*\\}\\s*</th>'))
  const alignOf = (attrs) => (/textAlign:\s*'right'/.test(attrs) ? '우'
    : /textAlign:\s*'center'/.test(attrs) ? '중' : '좌')

  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-column-align.json'), 'utf8'))
  const bad = []
  let unknown = 0   // 사본의 표가 비어 있어 정렬을 못 잰 열
  const skipped = []
  let checked = 0
  /*
   * <b>원본에 있는데 우리 화면에 아예 없는 열.</b> 아래 정렬 견주기는 못 찾은 열을
   * 조용히 건너뛴다(<code>if (!m) continue</code>) — 열이 <b>빠져 있으면</b> 정렬이
   * 틀릴 일도 없으니 늘 통과한다. 그래서 작업지시서조회가 원본의 세 열
   * ([작업지시서별불출·생산·작업현황])을 한 칸에 뭉쳐 놓고도 여태 통과했다.
   * 여기서 따로 센다.
   */
  const missing = []

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
        .filter((n) => thFor(noArrow(head[0]), n))
        .length,
    })).filter((x) => x.hit > 0).sort((a, b) => b.hit - a.hit)
    if (scored.length === 0) continue
    // 두 표가 똑같이 걸리면 어느 쪽이 원본의 그 표인지 못 고른다 — 세지 않는다
    if (scored.length > 1 && scored[0].hit === scored[1].hit) { skipped.push(screen); continue }
    const best = scored[0].head
    /*
     * <b>같은 화면의 이웃 격자들.</b> 이름이 <b>둘 이상</b> 겹치는 머리만 모은다 —
     * 겹침이 하나뿐인 표는 우연이다(판매입력의 [전표불러오기] 팝업에 있는 [합계]가
     * 판매입력II 의 라인 [합계]로 잘못 세어졌다).
     */
    const kin = noArrow([...src.matchAll(/<thead>[\s\S]*?<\/thead>/g)]
      .filter((h) => Object.keys(cols).filter((n) => thFor(noArrow(h[0]), n)).length > 1)
      .map((h) => h[0]).join(String.fromCharCode(10)))

    /*
     * 열 이름이 <b>절반도 안 걸리면</b> 원본의 그 표가 아니라 옆 표를 집은 것으로 본다.
     * 그런 짝에서 "없는 열"을 세면 전부 거짓이다(실측: 문턱 없이 93개 → 6할 문턱 26개).
     */
    if (scored[0].hit / Object.keys(cols).length >= 0.6) {
      for (const name of Object.keys(cols)) {
        /*
         * <b>표를 가리지 않고</b> 그 화면의 머리 전부에서 찾는다. 원본 사본은 한 화면의
         * <b>여러 격자</b>(입력 격자 + 목록)를 열 하나로 뭉쳐 적어 놓아서, 짝지은 표
         * 하나만 보면 옆 격자에 있는 열을 '없다' 고 말한다 — 생산불출조회의 [품목명]이
         * 그랬다(입력 격자에는 있다). 어느 표의 정렬인지는 위에서 따로 가리므로,
         * <b>있나 없나</b>만은 화면 전체에서 본다.
         */
        if (thFor(kin, name)) continue
        missing.push(`${screen}  [${name}]`)
      }
    }

    for (const [name, want] of Object.entries(cols)) {
      // '?' 는 정렬을 못 잰 열이다 — 사본에서 그 표가 비어 있어 칸의 정렬을 볼 수 없었다.
      // 이름과 차례는 다른 검사가 본다. 여기서는 세지 않는다.
      if (want === '?') { unknown += 1; continue }
      const m = thFor(noArrow(best), name)
      if (!m) continue
      checked++
      const got = alignOf(m[1])
      if (got !== want) bad.push(`${rel.split('/').pop()}  [${name}] 원본 ${want} · 우리 ${got}`)
    }
  }
  eq(`원본과 견준 열 ${checked}개의 정렬이 같다 (정렬을 못 잰 ${unknown}개는 뺐다)`
    + (skipped.length ? ` (표를 못 짝지어 건너뛴 화면 ${skipped.length}: ${skipped.join(', ')})` : ''),
    bad.join('\n') || '없음', '없음')

  /*
   * 지금 없는 열을 <code>ecount-missing-columns.json</code> 에 적어 두고 <b>늘지만 않게</b> 한다.
   * 한 번에 다 채울 수 없는 것들이다 — 우리 자료에 아예 없는 값(작업지시No.)도 있고,
   * 이름만 다른 것(수량 ↔ 판매수량)도 섞여 있다. 채운 열은 목록에서 <b>지워야</b> 통과한다.
   */
  const knownMissing = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-missing-columns.json'), 'utf8'))
  const grown = missing.filter((x) => !knownMissing.includes(x))
  const stale = knownMissing.filter((x) => !missing.includes(x))
  eq(`원본에 있는데 우리에게 없는 열이 늘지 않았다 (아직 ${knownMissing.length}개 남음)`,
    grown.join('\n') || '없음', '없음')
  eq('채워 놓고 목록에 남겨 둔 열이 없다', stale.join('\n') || '없음', '없음')
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
  /*
   * <b>대조표를 밑에 깔고</b> 손으로 적어 둔 것을 덧쓴다. 손으로 적은 지도만 쓰면
   * fixture 를 늘려도 검사가 안 커진다 — 체크박스 기본값 검사가 실제로 그랬다
   * (35화면 중 9화면만 보고 있었다). 이름이 대조표와 다른 화면은 아래 줄이 이긴다.
   */
  const ORDERMAP_BASE = JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8'))
  const TOTAL_MAP = new Map([
    ...ORDERMAP_BASE,
    ['거래처별채권', 'trade/LedgerPage.tsx'],
    ['거래처별채무', 'trade/LedgerPage.tsx'],
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
  /*
   * <b>여기 손으로 적은 아홉 줄만 보고 있었다.</b> fixture 에는 35화면이 적혀 있는데
   * 그중 <b>26화면은 한 번도 걸리지 않았다</b> — 지도가 자료보다 좁으면 자료를 늘려도
   * 검사가 커지지 않는다(조건 검사에서 이미 같은 것을 겪었다).
   * 다른 검사들처럼 대조표를 그대로 쓴다.
   */
  const BOX_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
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
        /*
         * <b>이름은 낱말째로 본다.</b> 그냥 부분일치로 찾으면 [사용]이
         * <b>[사용중단포함]</b> 의 앞부분에 걸린다 — 거래처리스트의 그 체크박스를
         * 거래처관리대장 II 의 [사용]으로 잘못 짚어, 기본값이 다르다고 걸렸다.
         */
        const before = src[at - 1]
        const after = src[at + label.length]
        if ((before && /[가-힣]/.test(before)) || (after && /[가-힣]/.test(after))) continue
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
  /*
   * \uba38\ub9ac \uc774\ub984\uc744 \ub0a9\uc791\ud558\uac8c. <b>\uc911\uad04\ud638 \uc2dd\uc744 \uba3c\uc800 \uc9c0\uc6b4\ub2e4</b> \u2014 \uc815\ub82c\uc744 \uac78\uba74\uc11c \uba38\ub9ac\uc5d0
   * <code>{sort.mark('X')}</code> \uac00 \ubd99\uc5c8\ub294\ub370, \uadf8\uac78 \ub0a8\uae30\uba74 \uc774\ub984\uc774
   * <code>\uc791\uc5c5\uc9c0\uc2dcNo.{sort.mark('\uc9c0\uc2dc\ubc88\ud638')}</code> \uac00 \ub418\uc5b4 \uc6d0\ubcf8\uacfc \uc548 \ub9de\ub294\ub2e4.
   */
  const flat = (s) => s.replace(/\{[^{}]*\}/g, '')
    .replace(/<[^>]*>/g, '').replace(/[\s\u25bc\u25b2]/g, '')
  /*
   * 머리 칸 하나가 <b>내걸 수 있는 이름</b>. 보통은 flat 한 글자 하나지만, 이름을
   * <b>삼항으로 적은 칸</b>은 flat 하면 빈 글자가 되어 그 열이 통째로 사라진다
   * (판매입력 [수량] ↔ 구매입력 [기본수량] 처럼 원본이 화면마다 달리 부르는 칸이다).
   * 그런 칸은 따옴표 안의 글자를 모두 후보로 둔다.
   */
  const thNames = (s) => {
    const plain = flat(s)
    if (plain) return [plain]
    /* 빈 칸이 <b>둘레의 글자</b>를 주워 오지 않게, 식으로 적은 칸만 본다. */
    const expr = s.match(/\{[^{}]*\}/)
    if (!expr) return []
    return [...expr[0].matchAll(/'([^']{1,20})'/g)].map((m) => flat(m[1])).filter(Boolean)
  }
  /** 차례를 견줄 수 없는 화면 — 왜인지 적는다. */
  const ORDER_SKIP = new Map([
    ['생산불출조회',
      '사본에 격자가 <b>둘</b>이다(입력 격자·목록 격자). 우리는 한 표에 다 펴 두어서,'
      + ' 두 격자의 열을 하나로 이어 붙인 차례와 견주게 된다 — 원본에도 없는 차례다'],
    ['시리얼/로트No.내역조회',
      '한 화면이 원본 <b>둘</b>을 겸하는데 차례가 서로 다르다 — [시리얼/로트No.등록]은 로트번호가 먼저고 [내역조회]는 품목명이 먼저다. 등록 쪽 차례를 따른다(그 화면이 이 표의 주인이다)'],
  ])

  const bad = []
  let checked = 0
  for (const [screen, cols] of Object.entries(cap)) {
    const rel = ORDER_MAP.get(screen)
    if (!rel || ORDER_SKIP.has(screen)) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (!existsSync(path)) continue
    const src = readFileSync(path, 'utf8')
    const names = Object.keys(cols)
    const scored = [...src.matchAll(/<thead>[\s\S]*?<\/thead>/g)].map((h) => ({
      head: h[0],
      hit: names.filter((n) => new RegExp('<th\\b[^>]*>\\s*' + esc(n) + '\\s*' + MARK_TAIL + '\\s*</th>').test(noArrow(h[0]))).length,
    })).filter((x) => x.hit > 1).sort((a, b) => b.hit - a.hit)
    if (!scored.length || (scored.length > 1 && scored[0].hit === scored[1].hit)) continue
    const ours = [...noArrow(scored[0].head).matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => thNames(m[1]))
    const want = names.map(flat).filter((n) => ours.some((c) => c.includes(n)))
    const got = ours.map((c) => c.find((x) => want.includes(x))).filter(Boolean)
    checked += want.length
    if (want.join(' ') !== got.join(' ')) {
      bad.push(`${rel.split('/').pop()}\n     원본 ${want.join(' · ')}\n     우리 ${got.join(' · ')}`)
    }
  }
  eq(`원본과 견준 열 ${checked}개가 같은 차례로 서 있다 (견줄 수 없는 ${ORDER_SKIP.size}화면은 이유를 적고 뺐다)`, bad.join('\n') || '없음', '없음')
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
  /*
   * \uba38\ub9ac \uc774\ub984\uc744 \ub0a9\uc791\ud558\uac8c. <b>\uc911\uad04\ud638 \uc2dd\uc744 \uba3c\uc800 \uc9c0\uc6b4\ub2e4</b> \u2014 \uc815\ub82c\uc744 \uac78\uba74\uc11c \uba38\ub9ac\uc5d0
   * <code>{sort.mark('X')}</code> \uac00 \ubd99\uc5c8\ub294\ub370, \uadf8\uac78 \ub0a8\uae30\uba74 \uc774\ub984\uc774
   * <code>\uc791\uc5c5\uc9c0\uc2dcNo.{sort.mark('\uc9c0\uc2dc\ubc88\ud638')}</code> \uac00 \ub418\uc5b4 \uc6d0\ubcf8\uacfc \uc548 \ub9de\ub294\ub2e4.
   */
  const flat = (s) => s.replace(/\{[^{}]*\}/g, '')
    .replace(/<[^>]*>/g, '').replace(/[\s\u25bc\u25b2]/g, '')
  /*
   * 머리 칸 하나가 <b>내걸 수 있는 이름</b>. 보통은 flat 한 글자 하나지만, 이름을
   * <b>삼항으로 적은 칸</b>은 flat 하면 빈 글자가 되어 그 열이 통째로 사라진다
   * (판매입력 [수량] ↔ 구매입력 [기본수량] 처럼 원본이 화면마다 달리 부르는 칸이다).
   * 그런 칸은 따옴표 안의 글자를 모두 후보로 둔다.
   */
  const thNames = (s) => {
    const plain = flat(s)
    if (plain) return [plain]
    /* 빈 칸이 <b>둘레의 글자</b>를 주워 오지 않게, 식으로 적은 칸만 본다. */
    const expr = s.match(/\{[^{}]*\}/)
    if (!expr) return []
    return [...expr[0].matchAll(/'([^']{1,20})'/g)].map((m) => flat(m[1])).filter(Boolean)
  }
  /** 원본에 있지만 우리에게 없는 열 — 왜 없는지 적는다. 이유 없이 늘리지 말 것. */
  const NO_COLUMN = new Map([
    /*
     * 결제내역조회가 못 내는 다섯. 우리 결제(정산) 전표는 <b>수금·지급 한 건</b>이라
     * 품목도, 카드 승인도, 그에서 나온 재고전표도 없다.
     * <b>[품목]은 특히 조심해야 한다</b> — 화면 코드의 필드 이름이 itemSummary 였는데
     * 실제로 담긴 값은 <b>결제방법 글자</b>였다. 이름만 보고 열을 만들면
     * 머리는 [품목]인데 값은 결제방법이 된다(그래서 이름을 methodText 로 고쳤다).
     */
    ['결제내역조회|품목', '결제 전표에 품목이 없다 — 수금·지급 한 건이다'],
    ['결제내역조회|결제상태', '결제 자체의 단계(요청·완료·취소)를 두지 않는다 — 우리 상태는 <b>회계반영</b> 여부다'],
    ['결제내역조회|승인번호', '카드 승인번호를 받아 두지 않는다'],
    ['결제내역조회|재고전표', '결제에서 재고전표가 나오지 않는다'],
    ['결제내역조회|상태별처리기능', '단계가 없으니 단계별 버튼도 없다'],
    /*
     * 품질검사요청의 둘 — <b>[검사방법]</b>은 전수인가 샘플링인가이고, 우리 [검사구분]은
     * 수입·공정·출하다. <b>다른 축</b>이라 이름만 바꿔 쓸 수 없다.
     * [프로젝트]는 검사요청 전표에 그 칸이 없다(품질검사 본전표에는 이번에 만들었다).
     */
    ['발주서입력|추가문자형식1', '원본은 격자 열을 <b>회사가 직접 늘린다</b> — 추가문자·추가숫자·추가일자·추가코드 형식으로 스물다섯 칸을 열어 둔다. 우리 Self-Customizing 은 <b>화면 칸</b>까지고 전표 격자 열로는 안 뻗는다'],
    ['발주서입력|추가문자형식2', '위와 같음'],
    ['발주서입력|추가문자형식3', '위와 같음'],
    ['발주서입력|추가문자형식4', '위와 같음'],
    ['발주서입력|추가문자형식5', '위와 같음'],
    ['발주서입력|추가숫자형식1', '위와 같음'],
    ['발주서입력|추가숫자형식2', '위와 같음'],
    ['발주서입력|추가숫자형식3', '위와 같음'],
    ['발주서입력|추가숫자형식4', '위와 같음'],
    ['발주서입력|추가숫자형식5', '위와 같음'],
    ['발주서입력|추가장문형식1', '위와 같음'],
    ['발주서입력|추가일자형식1', '위와 같음'],
    ['발주서입력|추가일자형식2', '위와 같음'],
    ['발주서입력|추가일자형식3', '위와 같음'],
    ['발주서입력|추가코드형식코드1', '위와 같음'],
    ['발주서입력|추가코드형식명1', '위와 같음'],
    ['발주서입력|추가코드형식코드2', '위와 같음'],
    ['발주서입력|추가코드형식명2', '위와 같음'],
    ['발주서입력|추가코드형식코드3', '위와 같음'],
    ['발주서입력|추가코드형식명3', '위와 같음'],
    ['발주서입력|금액1', '위와 같음'],
    ['발주서입력|금액2', '위와 같음'],
    ['발주서입력|적요1', '위와 같음'],
    ['발주서입력|적요2', '위와 같음'],
    ['발주서입력|적요3', '위와 같음'],
    /* 격자에 값이 없는 나머지 여섯. */
    ['발주서입력|&nbsp;', '맨 앞 빈 칸은 원본이 <b>고르는 칸</b>으로 쓴다 — 우리는 줄 번호를 찍는다'],
    ['발주서입력|전체수량', '주문하면서 <b>지금 재고</b>를 같이 보여 주는 기능이 없다'],
    ['발주서입력|창고수량', '위와 같음 — 그 창고의 재고를 붙이지 않는다'],
    ['발주서입력|추가수량', '수량을 <b>둘로</b> 나눠 적지 않는다'],
    ['발주서입력|관리항목', '발주 줄에 관리항목을 달지 않는다 — 마스터는 있지만 전표가 물지 않는다'],
    ['발주서입력|시리얼/로트', '발주 줄에 로트를 달지 않는다 — 로트는 <b>입고할 때</b> 정해진다'],

    ['매출계획입력|&nbsp;', '원본 매출계획입력은 <b>여러 줄의 격자</b>다 — 한 번에 여러 품목의 계획을 수량·단가·금액으로 적는다. 우리 계획은 <b>한 줄이 곧 한 계획</b>(품목+월+축)이라 격자가 없고, 그 열들도 없다'],
    ['매출계획입력|금액', '위와 같음'],
    ['매출계획입력|적요', '위와 같음'],
    ['매출계획입력|수량', '위와 같음'],
    ['매출계획입력|거래처', '위와 같음'],
    ['매출계획입력|품목코드', '위와 같음'],
    /*
     * 원본은 <b>같은 값을 화면마다 다르게 부른다</b> — 입력 격자에서는 [담당자],
     * 목록에서는 [담당자명]. 우리 표는 하나뿐이라 목록 쪽 이름을 따랐다
     * (거래처명·창고명·프로젝트명과 나란히 서야 읽힌다).
     */
    ['매출계획입력|담당자', '우리 열 이름은 목록 쪽 이름인 [담당자명] 이다'],
    ['매출계획입력|단가', '위와 같음'],
    ['매출계획입력|금액1', '위와 같음'],
    ['매출계획입력|금액2', '위와 같음'],
    ['매출계획입력|적요1', '위와 같음'],
    ['매출계획입력|적요2', '위와 같음'],
    ['매출계획입력|적요3', '위와 같음'],
    /* 목록 쪽 셋 — 우리 계획은 <b>전표가 아니라 달 단위</b>다. */
    /*
     * <b>이유가 반쯤 낡았다.</b> 예상매출일자를 만들면서 계획도 <b>날짜는</b> 갖게 됐다 —
     * 이제 없는 것은 번호뿐이다. 계획은 사람이 끊는 전표가 아니라 달마다 세우는 줄이라
     * 번호를 매기지 않는다. 이유를 사실에 맞춘다.
     */
    ['매출계획|일자-No.', '계획에는 번호가 없다 — 예상매출일자는 있지만 사람이 끊는 전표가 아니다'],
    ['매출계획조회|일자-No.', '위와 같음'],
    ['매출계획|금액', '우리 표는 <b>계획금액과 실적금액을 나란히</b> 낸다 — 이름 없는 [금액] 한 칸으로는 어느 쪽인지 알 수 없다'],
    ['매출계획조회|금액', '위와 같음'],

    /*
     * A/S 목록의 뒤쪽 셋 — <b>접수증</b>(인쇄물), <b>상세내역</b>(줄을 눌러 펼치는 창),
     * <b>생성한 전표</b>(그 접수에서 나온 전표로 건너뛰기). 셋 다 <b>기능</b>이지 값이 아니다.
     * 우리는 부품을 [부품] 창에서 달고 재고만 깎을 뿐, 그 접수와 이어 둔 전표 목록이 없다.
     */
    ['A/S접수입력|&nbsp;', '원본 A/S접수는 <b>여러 줄의 품목 격자</b>다 — 한 접수에 부품 여럿을 수량·금액과 함께 적는다. 우리 A/S 전표는 <b>수리 대상 품목 하나</b>를 들고, 쓴 부품은 [부품] 창에서 따로 단다. 격자가 없으니 그 열들도 없다'],
    ['A/S접수입력|품목코드', '위와 같음'],
    ['A/S접수입력|품목명', '위와 같음'],
    ['A/S접수입력|규격', '위와 같음'],
    ['A/S접수입력|적요', '위와 같음'],
    ['A/S접수입력|추가수량', '위와 같음'],
    ['A/S접수입력|단위', '위와 같음'],
    ['A/S접수입력|관리항목', '위와 같음'],
    ['A/S접수입력|금액1', '위와 같음'],
    ['A/S접수입력|금액2', '위와 같음'],
    ['A/S접수입력|적요1', '위와 같음'],
    ['A/S접수입력|적요2', '위와 같음'],
    ['A/S접수입력|적요3', '위와 같음'],
    ['A/S접수입력|시리얼/로트No.', '위와 같음'],
    /*
     * 계좌·카드 마스터가 안 가진 것들. [검색창내용]은 <b>화면에는 안 보이고 찾는 데만</b>
     * 쓰는 이름(약칭·옛 상호)인데, 거래처·품목은 그 칸을 들지만 계좌·카드는 안 든다.
     */
    ['계좌등록|검색창내용', '계좌 마스터에 찾기용 별칭 칸이 없다 — 거래처·품목만 든다'],
    ['카드등록|검색창내용', '위와 같음'],
    ['계좌등록|외화통장', '통장은 원화만 둔다'],
    ['계좌등록|이체정보', '자동이체 설정을 들지 않는다'],
    ['카드등록|카드관리자', '우리 카드는 <b>명의자</b>만 든다 — 회사 안에서 누가 들고 다니나는 다른 값이다'],
    /* 수집데이터는 <b>정의</b>만 든다 — 돌리는 일(스케줄·상태)이 없다. */
    ['수집데이터등록|진행상태', '수집을 돌리지 않는다 — 어디서 가져올지 <b>정의만</b> 든다'],
    ['수집데이터등록|조건', '위와 같음'], ['수집데이터등록|연결업무', '위와 같음'],
    ['단가요청진행단계|수취금액', '단가요청에 받은 금액을 적는 칸이 없다 — 확정 단가만 든다'],
    /*
     * 특별단가의 <b>좁히는 축</b> 넷 — 원본은 거래처·창고·품목·품목그룹 <b>넷으로</b> 좁힐 수
     * 있고 그 넷을 각각 열로 낸다. 우리 특별단가는 <b>품목 × (거래처 또는 그룹)</b> 뿐이라
     * 창고·품목그룹으로는 좁힐 수가 없고, 그룹은 이름만 들고 <b>코드가 없다</b>.
     * (가진 둘 — 특별단가그룹명·거래처설정 — 은 이번에 열로 갈라 냈다.)
     */
    ['특별단가등록|특별단가그룹코드', '단가그룹은 이름만 든다 — 코드 마스터가 아니다'],
    ['특별단가등록|창고설정', '창고로 좁히는 특별단가를 만들지 않는다'],
    ['특별단가등록|품목그룹설정', '품목그룹으로 좁히는 특별단가를 만들지 않는다'],
    ['특별단가등록|품목설정', '우리 특별단가는 <b>늘 품목 하나</b>에 붙는다 — 설정이랄 것이 없어 [품목] 열이 곧 그것이다'],
    /*
     * <b>열이 아니라 조건이다.</b> 사본에서 이름만 긁을 때 화면 머리의 조건이 표의 열로
     * 섞여 들어온 다섯. 여태 안 걸린 것은 검사가 <b>파일 어디든</b> 그 글자가 따옴표로
     * 있으면 열로 쳐 줬기 때문인데(조건 이름표가 그 자리였다), 그 구멍을 막자 드러났다.
     * 다섯 다 우리 화면에 <b>조건으로 이미 있다</b> — 열로 세우면 안 된다.
     */
    ['원가생성_수정|계산기준', '원본에서도 표의 열이 아니라 조건이다 — 우리도 조건으로 있다'],
    ['원가생성/수정|계산기준', '위와 같음'],
    ['생산계획/MRP생성|생산계획기간', '위와 같음'],
    ['생산계획/MRP생성|기준품목', '위와 같음'],
    ['생산계획/MRP생성|적요', '위와 같음 — 적요는 [비고] 열로 이미 찍는다'],
    ['공정등록|작업코드등록', '줄마다가 아니라 화면 위 버튼 하나로 연다'],
    /*
     * <b>생산불출의 [불러온 전표No.]</b> — 원본은 [불러온 전표No.] 와 [작업지시서] 를 따로 둔다.
     * 원본에서는 불출을 여러 전표(작업지시서·소요량 전개 …)에서 불러올 수 있어 <b>어디서
     * 불러왔는지</b>와 <b>어느 지시의 것인지</b>가 다를 수 있기 때문이다.
     * 우리는 <b>작업지시서에서만</b> 불러오므로 두 값이 늘 같다 — 같은 값을 두 칸에 찍으면
     * 다를 수 있다고 읽힌다. 대신 [불러온 전표일자]는 그 지시를 낸 날이라 따로 낸다.
     */
    ['생산불출조회|불러온 전표No.', '우리는 작업지시서에서만 불러온다 — [작업지시서] 열과 같은 값이다'],
    ['생산불출입력|불러온 전표No.', '위와 같음'],
    /*
     * <b>구매단가일괄변경 [환율]</b> — 원본은 전표마다 통화와 환율을 들고, 외화로 적은 단가를
     * 그 환율로 환산해 원화 금액을 함께 저장한다. 우리 전표에는 <b>통화도 환율도 없다.</b>
     *
     * <p>열 하나를 더하는 일이 아니다. 환율 칸만 만들고 환산을 안 하면 <b>아무 일도 안 하는
     * 숫자</b>가 되고, 환산까지 하면 공급가액·부가세·원장·손익이 모두 그 값을 타게 된다 —
     * 금액을 읽는 모든 화면이 걸린 자리라, 열 빚을 걷는 판에 끼워 넣지 않는다.
     * 외화 거래를 담기로 정하는 날 <b>전표부터</b> 손대야 한다.
     */
    ['구매단가일괄변경|환율', '전표에 통화·환율이 없다 — 환산까지 가야 하는 일이라 열 하나로 끝나지 않는다'],
    ['구매단가일괄변경|환율', '외화 전표를 만들지 않는다'],
    ['구매일괄회계반영|거래가액', '외화·조정 항목을 만들지 않는다'],
    ['구매일괄회계반영|조정', '위와 같음'], ['구매일괄회계반영|외화금액', '위와 같음'],
    ['구매일괄회계반영|환율', '위와 같음'], ['구매일괄회계반영|상세', '전표를 눌러 연다'],
    ['생산불출조회|불러온 전표No.', '위와 같음'],
    /* 격자로 바꾼 뒤에도 남는 셋 — [전표불러오기] 로 채워지는 칸이라 그 기능이 없으면 뜻이 없다. */
    ['생산불출입력|불러온 전표No.', '위와 같음'],
    /*
     * 판매입력II 는 판매입력의 <b>간단 격자</b>판이다(품목코드·품목명·규격·수량·단가·
     * 공급가액·부가세·합계·적요). 그 아홉 칸은 우리 판매입력 격자에 다 있어 한 화면으로
     * 겸한다. 다만 [금액조정항목명]은 조정 격자의 칸인데, 사본의 그 격자가 비어 있어
     * 무엇을 고르는 칸인지(항목 마스터인지 자유입력인지) 확정할 수 없다.
     */
    ['판매입력II|금액조정항목명', '조정 격자를 아직 안 만들었다 — 사본이 비어 있어 무엇을 고르는 칸인지 모른다'],
    ['설문조사조회|질문유형', '사본이 질문 격자가 열린 채로 찍혔다 — 그 격자는 설문조사입력(SurveyInputPage)에 그대로 있다'],
    ['설문조사조회|질문내용', '위와 같음'], ['설문조사조회|보기항목1', '위와 같음'],
    ['설문조사조회|보기항목2', '위와 같음'], ['설문조사조회|보기항목3', '위와 같음'],
    ['설문조사조회|보기항목4', '위와 같음'], ['설문조사조회|보기항목5', '위와 같음'],
    ['설문조사조회|필수항목', '위와 같음'],
    /*
     * BOR 의 [작업]·[작업기준품목코드/명]·[작업량]. 사본에서 이 네 칸은 <b>값이 전부 비어</b>
     * 있어서, [작업량]이 [생산수량]과 어떻게 다른지·작업시간과 어떻게 곱해지는지를
     * 잴 수 없었다. 뜻을 모르는 채 칸만 만들면 <b>두 수량이 같은 것을 두 번 말하는</b>
     * 화면이 된다. 값이 든 사본을 얻으면 그때 만든다.
     */
    /*
     * <b>[작업] 은 잴 수가 없다.</b> 사본에 BOR 격자의 <b>머리만</b> 있고 줄이 없어,
     * 그 칸이 [작업명]·[생산공정명] 과 무엇이 다른지 확인할 길이 없다.
     * 아카이브를 두 번 뒤졌지만 그 격자의 값은 어디에도 없었다.
     * <b>짐작으로 만들면 이름만 같고 뜻이 다른 칸</b>이 된다 — 잴 수 있게 되면 만든다.
     * (같은 묶음의 [작업기준품목]·[작업량] 은 이름이 그 자체로 뜻을 말해 이번에 만들었다.)
     */
    ['BOR(작업소요시간)|작업', '사본에 그 격자의 줄이 없어 [작업명]과 무엇이 다른지 잴 수 없다'],
    /*
     * 사본 '원가생성_수정' 도 표가 아니라 <b>원가생성 실행 화면</b>이다. 그 칸들이
     * 격자 열처럼 잡혔다. [공정명]·[창고코드/명]은 우리가 원가를 공정·창고 단위로
     * 쌓지 않아 값 자체가 없다(표준·실제·차이 화면의 [생산공정]과 같은 이유).
     */
    ['원가생성_수정|기준년월', '표가 아니라 원가생성 실행 화면의 칸이다'],
    /*
     * 사본이 같은 화면을 <b>두 이름</b>으로 담고 있다(원가생성_수정 · 원가생성/수정,
     * 생산계획_MRP리스트 · 생산계획/MRP생성). 지도를 넓히며 뒤엣것이 걸리자
     * 같은 칸들이 <b>새 이름으로 다시</b> 잡혔다 — 위와 같은 이유를 그대로 적는다.
     */
    ['원가생성/수정|기준년월', '위와 같음'],
    ['원가생성/수정|원가계산방법', '위와 같음'],
    ['원가생성/수정|사전작업', '위와 같음'],
    ['원가생성/수정|원가계산', '위와 같음'],
    ['원가생성/수정|원가현황', '위와 같음'],
    ['원가생성/수정|기타', '위와 같음'],
    ['생산계획/MRP생성|생성일자', '표가 아니라 생성 팝업의 폼이다 — 그 팝업을 안 만든다'],
    ['생산계획/MRP생성|생산계획계산', '표가 아니라 생성 팝업의 폼이다 — 그 팝업을 안 만든다'],
    ['생산계획/MRP생성|MRP계산', '표가 아니라 생성 팝업의 폼이다 — 그 팝업을 안 만든다'],
    ['생산계획/MRP생성|생산계획/MRP현황', '표가 아니라 생성 팝업의 폼이다 — 그 팝업을 안 만든다'],
    ['생산계획/MRP생성|기타', '표가 아니라 생성 팝업의 폼이다 — 그 팝업을 안 만든다'],
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
  collectReasons(NO_COLUMN)
  /*
   * 예전에는 여기서 [1단계]~[10단계] 열 개를 <b>예외로</b> 빼 두었다 —
   * "STEP_COLS.map 으로 그려 이름이 코드에 안 보인다" 는 이유였다.
   * 이제 검사가 <b>숫자 + 글자</b> 꼴 이름을 읽으므로 예외가 필요 없다.
   * 예외가 아니라 <b>검사를 고치는</b> 것이 맞는 자리였다.
   */
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
  /*
   * 위 묶음 예외에서 <b>이미 만든 것</b>은 빼 준다. 묶음으로 이유를 적어 두면
   * 그중 하나를 만들었을 때 지우기 쉽지 않은데, 그대로 두면 그 자리는 이후로
   * 아무도 안 본다. 아래 [낡은 예외] 단언이 이 목록을 강제한다.
   */
  /* 생산입고 I 은 격자로 바꿨다 — 적요·노무시간·수량이 이제 열이다. */
  for (const k of ['생산입고I-BOM기준소모|적요', '생산입고I-BOM기준소모|노무시간',
    '생산입고I-BOM기준소모|수량']) NO_COLUMN.delete(k)

  let pending = 0
  const stale = []   // 이미 만들었는데 예외로 남아 있는 것
  for (const [screen, cols] of Object.entries(cap)) {
    const rel = MISS_MAP.get(screen)
    if (!rel) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (PENDING.has(screen)) { pending++; continue }
    if (!pageSource(rel)) continue
    const src = pageSource(rel)   // 감싸기만 하는 화면은 감싸인 쪽까지 읽는다
    const ours = new Set([...noArrow(src).matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => flat(m[1])))
    for (const name of Object.keys(cols)) {
      const exempt = NO_COLUMN.has(screen + '|' + name)
      if (!exempt) checked++
      /*
       * 열 이름이 <b>식</b>인 것도 있다 — 판매는 [수량], 구매는 [기본수량] 처럼
       * 같은 칸을 구분에 따라 다르게 부른다. 그때는 따옴표에 싸인 이름을 찾는다.
       */
      /*
       * 머리글이 식이면(<code>{원가 ? '수량' : '중량'}</code>) 글자가 <code>&lt;th&gt;</code> 안에
       * 따옴표로 들어 있다. 그래서 <b>따옴표 글자</b>도 열로 쳐 주는데, 파일 전체에서 찾으면
       * <b>조건 이름표·안내 문구까지 열로 센다</b> — 계좌등록에 [검색창내용] 조건을 만들자마자
       * 그 화면이 <b>그 이름의 열을 갖게 됐다</b>고 나왔다.
       *
       * <p>그렇다고 <code>&lt;th&gt;</code> 안만 보면 안 된다 — 할인현황 넷처럼
       * <b>감싸는 화면이 이름을 넘겨 주는</b>(<code>amountLabel="구매금액"</code>) 표는
       * 글자가 <code>&lt;th&gt;</code> 밖에 있다. 그래서 <b>이름표·안내 문구 자리만</b> 지우고 본다.
       */
      const noLabels = src.replace(/\b(?:label|placeholder|emptyLabel)=["'][^"']*["']/g, ' ')
      const asExpr = noLabels.includes(`'${name}'`) || noLabels.includes(`"${name}"`)
      /*
       * <b>번호가 붙은 열 무리</b>는 우리가 <code>.map()</code> 으로 그린다 —
       * <code>{n}단계</code> 처럼. flat 하면 식이 통째로 지워져 <b>[단계]</b> 만 남아,
       * 원본의 [1단계]…[10단계] 열 개가 <b>다 없는 것으로</b> 잡혔다.
       * 오더관리유형은 이미 열 개를 다 그리고 있었는데 스무 개가 빚으로 적혀 있었다.
       * 이름이 <b>숫자 + 글자</b> 꼴이면 그 글자만으로도 있는 것으로 친다.
       */
      const numbered = name.match(/^\d+(.+)$/)
      const asNumbered = numbered ? ours.has(flat(numbered[1])) : false
      const here = ours.has(flat(name)) || asExpr || asNumbered
      /*
       * <b>낡은 예외</b>를 잡는다. 만들어 놓고 예외를 안 지우면, 그 자리는 이후로
       * 아무도 안 본다 — 나중에 지워져도 검사가 통과한다. 실제로 [사용중단/재사용]
       * 셋이 '다음에 붙인다' 고 적힌 채 이미 만들어져 있었다.
       */
      /*
       * 낡았는지는 <b>진짜 열(th)</b> 로만 따진다. 아래 식 fallback 까지 세면,
       * '열이 아니라 버튼으로 있다' 처럼 이유가 맞는 예외까지 낡았다고 잡는다
       * (공정등록의 [작업코드등록]이 그랬다).
       */
      if (exempt) { if (ours.has(flat(name))) stale.push(`열 [${screen}|${name}] — 이제 열로 있다`); continue }
      if (!here) bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 [${name}] 열이 없다`)
    }
  }
  /*
   * <b>아직 안 만든 열.</b> 사본에서 열 이름·정렬을 다시 뽑아 대조표를 55 → 76화면으로
   * 넓히자 <b>안 만든 열 87개</b>가 한꺼번에 드러났다. 한 판에 다 만들 수 없고,
   * 그렇다고 "이유 있는 예외" 로 적으면 거짓말이 된다. 목록으로 두고 <b>늘지만 않게</b> 한다.
   */
  const TODO = JSON.parse(readFileSync(join('qa', 'fixtures', 'pending-columns.json'), 'utf8'))
  const grown = bad.filter((x) => !TODO.includes(x))
  const gone = TODO.filter((x) => !bad.includes(x))
  eq(`원본 열 ${checked}개가 우리 표에도 있다 (못 만드는 ${NO_COLUMN.size}개는 이유를 적고 뺐다`
    + `, 아직 안 만든 ${TODO.length}개는 목록에 적었다, 아직 못 맞춘 화면 ${pending}개는 건너뜀)`,
    grown.join('\n') || '없음', '없음')
  eq('만들어 놓고 목록에 남겨 둔 열이 없다', gone.join('\n') || '없음', '없음')
  eq(`열 예외 ${NO_COLUMN.size}개가 아직 필요하다`, stale.join('\n') || '없음', '없음')
}

// ── 2-i) 원본 화면의 버튼 ↔ 우리 버튼 ─────────────────────────────────────
/**
 * 화면마다 똑같이 붙는 껍데기·기간 버튼. <b>있는지 보는 검사와 차례를 보는 검사가</b>
 * 같은 목록을 써야 한다 — 한쪽만 고치면 두 검사가 서로 다른 화면을 보게 된다.
 */
const SHELL_BUTTONS = new Set(['사이트맵', 'Option', '도움말', 'Search(F3)', '찾기(F3)', '다시 작성',
  '금일', '전일', '금주(~오늘)', '전주', '금월(~오늘)', '전월', '종료일', '최근30일(+1개월)',
  '이번기수', '직전기수', '설정', '웹자료올리기', '자동알림', '이력조회',
  // 기간 빠른선택은 EcPeriodPicks 가 화면마다 같은 규칙으로 그린다.
  // 어떤 묶음을 쓰는지는 기간 fixture 와 2-f 검사가 따로 본다.
  '금월', '금년', '전년', '최근3일+7일', '전월+금월', '말일', '금주', '차주', '차월'])

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
  const SHELL = SHELL_BUTTONS
  /** 원본에 있지만 우리에게 없는 버튼 — 왜 없는지 적는다. */
  const NO_BUTTON = new Map([

    ['거래처리스트|SMS', '문자 발송을 붙이지 않았다'],



    ['근태입력|저장/전표(F7)', '근태를 회계전표로 넘기지 않는다'],

    ['설문조사조회|Email', '전표를 메일로 보내지 않는다'],
    ['생산입고조회|생산입고I', '입력 화면을 [신규(F2)]로 연다'],
    ['생산입고조회|Email', '전표를 메일로 보내지 않는다'],
    ['거래명세서인쇄|Email', '위와 같음'],
    ['SW개발일정관리|공용메일설정', '사내 공용메일 설정 화면이 없다'],
    ['건설예정공정표|업무지원AI', '업무지원 AI 를 붙이지 않았다'],
    ['작업지시서효율현황|닫기', '화면을 닫는 버튼을 두지 않는다 — 메뉴로 옮긴다'],
    /*
     * 버튼 검사를 <b>버튼 자리</b>에서만 찾도록 죄면서 드러난 것들. 예전에는 파일 어디든
     * 그 글자가 있으면 통과라, 표 머리의 [라벨]·[일부반영]이 버튼 노릇을 하고 있었다.
     */
    ['거래처리스트|H', '원본 [H]는 그 화면의 변경이력을 여는 버튼이다(사본 button id=history) — 우리는 이력을 남기지 않는다'],
    ['단가적용순서설정|H', '위와 같음'],
    ['공용품관리|라벨', '우리 [라벨]은 표의 열이다. 원본 버튼이 무엇을 하는지 사본으로 알 수 없다(같은 자리의 미리보기·라벨변경도 그렇다)'],
    ['구매일괄회계반영|일부반영', '우리는 버튼이 아니라 <b>열</b>로 보여 준다 — 거래처별 묶음에서 일부만 반영된 상태를 표에 찍는다'],
    ['근태입력|출/퇴근', '출퇴근 시각은 [출/퇴근기록부(ID)]가 맡는다 — 이 화면은 근태(휴가)를 넣는 자리다'],
    ['설문조사조회|저장', '사본이 질문 격자가 열린 채로 찍혔다 — 그 격자와 [저장]은 설문조사입력(SurveyInputPage)에 있다'],
    ['거래처관리대장 I|Email', '전표를 메일로 보내지 않는다'],
    ['거래처관리대장 I|사용중단포함', '조건 판의 체크박스로 둔다 — 버튼이 아니다'],
    ['거래처관리대장 I|적용(F8)', '조건을 바꾸면 바로 반영된다 — 따로 적용하지 않는다'],
    ['거래처관리대장 II|적용(F8)', '위와 같음'],
    ['거래처관리대장 II|검색(F8)', '거래처등록은 검색상자(Search(F3))로 찾는다'],
    ['거래처관리대장 I|닫기', '화면을 닫는 버튼을 두지 않는다 — 메뉴로 옮긴다'],

    ['생산계획_MRP리스트|H', '생성 팝업의 시간 단위 토글 — 그 팝업을 안 만든다'],
    ['생산계획_MRP리스트|신규(F2)', '위와 같음'], ['생산계획_MRP리스트|저장(F8)', '위와 같음'],
    ['생산계획_MRP리스트|닫기', '위와 같음'], ['생산계획_MRP리스트|삭제', '위와 같음'],
    ['공지사항|업무지원AI', '업무지원 AI 를 붙이지 않았다'],
    /*
     * 꼬리표(라벨) 자체는 공용품·일정에도 <b>있다</b> — 없는 것은 <b>[라벨변경]</b>,
     * 즉 고른 여러 건의 라벨을 <b>한꺼번에 바꾸는</b> 일이다. 한 건씩은 폼에서 고친다.
     * (예전 이유는 '라벨은 전자결재에만 있다' 였는데, 일정에 라벨을 만들면서 틀린 말이 됐다.)
     */
    ['공용품관리|라벨변경', '여러 건의 라벨을 한꺼번에 바꾸는 기능이 없다 — 한 건씩은 폼에서 고친다'],
    ['일정관리|라벨변경', '위와 같음'],
    ['내결재관리|My도장/서명', '결재 도장 이미지를 만들지 않는다'],
    ['내결재관리|보내기', '전표를 메일로 보내지 않는다'],
    ['작업내역조회|보내기', '위와 같음'], ['작업내역조회|바코드(품목)', '바코드를 찍지 않는다'],
    ['생산입고조회|바코드(품목)', '위와 같음'],
    ['생산입고조회|진행상태변경', '생산입고에 진행상태가 없다'],
    ['생산입고조회|보내기', '위와 같음'], ['생산입고조회|전자결재', '생산 전표를 결재에 올리지 않는다'],

    /*
     * <b>이 이유는 틀렸었다.</b> '출하는 줄마다 상태를 고친다' 고 적어 뒀는데
     * <b>출하조회에는 줄 버튼이 하나도 없다</b> — 보기만 하는 화면이다.
     * 상태를 바꾸는 자리는 출하지시서조회고, 거기는 이번에 <b>고른 줄을 한 번에</b> 바꾸게 했다.
     */
    ['출하조회|진행상태변경', '보기만 하는 화면이라 상태를 바꾸지 않는다 — 바꾸는 자리는 출하지시서조회다'],
    ['소요시간계산|주문', '수주에서 불러오지 않는다 — 작업지시에서 불러온다'],
    ['소요시간계산|바코드', '바코드를 찍지 않는다'],
    ['구매조회|발주', '발주는 발주서 화면에서 만든다'],
    ['작업지시서작업처리|작업내역입력', '작업내역은 그 화면에서 바로 넣는다'],
    ['품목등록 리스트|관계설정', '품목 사이 관계(대체품·세트) 개념이 없다'],


  ])
  collectReasons(NO_BUTTON)
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
  /* 묶음 예외 중 이미 만든 것 — 아래 [낡은 예외] 단언이 이 목록을 강제한다. */
  /*
   * 묶음으로 뺐지만 실제로는 있는 것들. 아래 [낡은 예외] 단언이 이 목록을 강제한다.
   * [닫기] 둘은 그 화면이 팝업(Modal)으로 입력을 받아서 팝업에 닫기가 있다.
   */
  for (const k of ['생산불출조회|선택삭제', '생산입고I-BOM기준소모|저장(F8)',
    'BOR(작업소요시간)|닫기', '생산불출조회|닫기']) NO_BUTTON.delete(k)

  let pending = 0
  const stale = []   // 이미 만들었는데 예외로 남아 있는 것
  for (const [screen, btns] of Object.entries(cap)) {
    const rel = BTN_MAP.get(screen)
    if (!rel) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (PENDING.has(screen)) { pending++; continue }
    if (!pageSource(rel)) continue
    const src = pageSource(rel)   // 감싸기만 하는 화면은 감싸인 쪽까지 읽는다
    const SHELL_SRC = shellSrcFor(src)
    /*
     * 버튼 이름은 <b>버튼 자리</b>에서만 찾는다. 예전에는 파일 어디든 그 글자가 있으면
     * 통과라, 표 머리나 안내 문구가 버튼 노릇을 했다. 조건 검사에서 같은 것을 이미 겪었다.
     */
    /*
     * 공용 껍데기가 그려 주는 버튼도 그 화면의 버튼이다 — 팝업의 [닫기]는 Modal 이,
     * 전표 화면의 푸터는 EcSlipShell 이 그린다. 화면 파일만 보면 없는 것으로 센다.
     */
    const btnSet = new Set()
    const addBtn = (x) => btnSet.add(String(x).replace(/['"\s]+$/, '').trim())
    /*
     * 버튼 이름은 세 모양으로 적힌다:
     *   label: '저장'                       — 정해진 글자
     *   label: editing ? '수정저장' : '저장'  — 고른 것에 따라 갈리는 식
     *   label: `사용중단/재사용${n}`          — 개수를 뒤에 붙이는 본문 글자
     * 앞의 하나만 보면 나머지 둘이 <b>없는 버튼</b>이 된다. 셋 다 읽는다.
     */
      // cashLabel: '현금수금' 처럼 앞에 말이 붙은 이름표도 이름이다.
    for (const m of (src + SHELL_SRC).matchAll(/\w*[Ll]abel\s*[:=][^\n]{0,160}/g)) {
      for (const q of m[0].matchAll(new RegExp(String.raw`['"]([^'"]{1,24})['"]`, 'g'))) addBtn(q[1])
      // 본문 글자는 ${…} 앞까지가 이름이다
      for (const q of m[0].matchAll(new RegExp(BTICK + '([^' + BTICK + '$]{1,24})', 'g'))) addBtn(q[1])
    }
    /*
     * 버튼 <b>요소 전체</b>를 잡아 글자를 꺼낸다. 여는 태그만 잡으면 안 된다 —
     * onClick={() => ...} 의 화살표에도 '>' 가 있어 태그가 거기서 끊긴다.
     * 그래서 [바코드]·[현금수금] 같은 버튼이 <b>없는 것으로</b> 세어졌다.
     */
    for (const m of (src + SHELL_SRC).matchAll(/<button\b[\s\S]{0,400}?<\/button>/g)) {
      for (const q of m[0].matchAll(/['"]([^'"]{1,24})['"]/g)) addBtn(q[1])
      const plain = stripJsx(m[0])
      if (plain) addBtn(plain)
    }
    // 체크박스·라디오는 <label> 글자가 곧 이름이다(원본은 그 자리를 버튼으로 두기도 한다).
    for (const m of (src + SHELL_SRC).matchAll(/<label\b[\s\S]{0,300}?<\/label>/g)) {
      // <label><input …/>사용중단포함</label> — 안쪽 태그를 걷어 내야 글자가 보인다.
      const plain = stripJsx(m[0])
      if (plain) addBtn(plain)
    }
    for (const b of btns) {
      if (SHELL.has(b)) continue
      const exempt = NO_BUTTON.has(screen + '|' + b)
      if (!exempt) checked++
      const has = b === '신규(F2)' ? (/onNew=|renderForm=/.test(src) || btnSet.has(b)) : btnSet.has(b)
      if (exempt) { if (has) stale.push(`버튼 [${screen}|${b}] — 이제 있다`); continue }
      if (!has) bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 [${b}] 버튼이 없다`)
    }
  }
  eq(`원본 버튼 ${checked}개가 우리 화면에도 있다 (안 만든 ${NO_BUTTON.size}개는 이유를 적고 뺐다`
    + `, 아직 못 맞춘 화면 ${pending}개는 건너뜀)`,
    bad.join('\n') || '없음', '없음')
  eq(`버튼 예외 ${NO_BUTTON.size}개가 아직 필요하다`, stale.join('\n') || '없음', '없음')
}

// ── 2-i2) 버튼의 차례 ────────────────────────────────────────────────────
console.log('\n■ 화면 위의 버튼이 원본과 같은 차례로 서 있나')

/*
 * <b>버튼이 있기만 하면 되는 게 아니다.</b> 조건 차례(2-p)와 열 차례(2-c)는 이미
 * 보고 있었는데 <b>버튼 차례는 안 봤다.</b> 손이 먼저 기억하는 것이 버튼 자리다 —
 * 늘 [Excel] 옆이던 [인쇄]가 반대쪽에 가 있으면 매번 눈으로 찾아 읽어야 한다.
 *
 * <p>사본에서 뽑은 <code>ecount-buttons.json</code>은 <b>원본 DOM 차례 그대로</b>다.
 * 우리 화면에 있는 것만 골라 서로의 앞뒤가 같은지 본다(없는 버튼은 건너뛴다).
 * 껍데기·기간 버튼은 있는지 보는 검사와 <b>같은 목록</b>으로 뺀다.
 *
 * <p>자리는 <b>화면 파일 안에서만</b> 잰다. 공용 껍데기(Modal·EcSlipShell)가 그려 주는
 * 버튼은 화면 파일에 글자가 없어 저절로 빠진다 — 그건 껍데기가 늘 같은 자리에 그린다.
 *
 * <p><b>이 fixture 는 DOM 아카이브만 옮긴 것이 아니다.</b> 92화면 중 41화면은 적힌 이름 일부가
 * 아카이브의 그 화면 블록에 없다(재 봤다). 아카이브가 <b>조회 조건 판만 찍힌 상태</b>인 화면이
 * 많고(격자·툴바가 아직 안 그려짐), 살아 있는 원본을 열어 보고 채운 것이 섞여 있어서다.
 * 예: 판매조회·출하조회의 [진행상태변경], 휴가현황의 [인쇄]·[Excel] 은 블록에 없지만 원본에는 있다.
 * <b>그러니 '아카이브에 없다' 를 근거로 이 목록을 지우지 말 것.</b> 지우려면 살아 있는 원본을
 * 열어 없음을 확인하고 지운다.
 */
{
  const ORDER_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-buttons.json'), 'utf8'))
  /** 차례를 아직 못 맞춘 화면 — 왜인지 적는다. */
  const ORDER_SKIP = new Map([
    ['거래처리스트',
      '원본은 등록 폼이 <b>팝업</b>이라 그 [닫기]가 맨 뒤에 선다. 우리 폼은 목록 위에 펴지는'
      + ' <b>판</b>이라 [닫기]가 단추줄보다 앞에 온다 — 차례가 아니라 폼을 어디에 두느냐의 차이다'],
    ['결제내역조회',
      '원본은 [입금보고서작성]이 [신규(F2)]보다 앞에 선다. 우리 EcListShell 은 [신규(F2)]를'
      + ' <b>단추줄 맨 앞에 고정</b>해 그린다(onNew) — 화면 하나 때문에 껍데기 규칙을 흔들지 않는다'],
    ['구매조회',
      '이 화면의 원본 목록은 <b>목록 화면과 전표 상세의 버튼이 섞여</b> 있다 —'
      + ' [저장(F8)]·[복사]·[이전]·[다음]·[닫기]가 그 증거다(목록 화면에 있을 수 없는 것들).'
      + ' 그래서 [확인취소]와 [반품처리] 사이에 상세 화면 버튼이 끼어 있는 차례가 되는데,'
      + ' 우리는 상세를 <b>펼침 행</b>으로 두어 그 버튼들이 목록 안에 선다. 두 화면의 버튼을'
      + ' 한 줄로 이어 붙인 차례와는 견줄 수 없다'],
    ['구매입력',
      '원본은 [전표불러오기]가 <b>[할인] 바로 뒤</b>인데 판매입력은 [이익계산] 뒤다.'
      + ' 한 컴포넌트(TradeEntry)가 두 화면을 겸해서 둘 다 맞출 수 없다 — 버튼이 더 많은'
      + ' 판매입력에 맞췄다. 모드로 갈라 그리면 화면은 맞지만, 파일에는 두 자리가 다 남아'
      + ' <b>이 검사가 어느 쪽인지 알 수 없게</b> 된다(그렇게 해 보고 되돌렸다)'],
  ])

  const bad = []
  let checked = 0
  for (const [screen, btns] of Object.entries(cap)) {
    const rel = ORDER_MAP.get(screen)
    if (!rel || PENDING.has(screen) || ORDER_SKIP.has(screen)) continue
    const raw = pageSource(rel)
    if (!raw) continue
    /*
     * <b>팝업 안의 버튼은 단추줄이 아니다.</b> 등록 폼(Modal)의 [저장(F8)]·[닫기]는
     * 목록 위가 아니라 뜬 창 안에 선다 — 목록 버튼들과 앞뒤를 견줄 자리가 아니다.
     * 사본은 팝업 마크업을 화면 <b>끝</b>에 담고 있어 그대로 재면 늘 어긋난 것처럼 보인다.
     * 자리를 잴 때는 팝업을 지우고, 팝업에만 있는 버튼은 저절로 빠지게 둔다.
     */
    const src = raw.replace(/<Modal\b[\s\S]*?<\/Modal>/g, (m) => ' '.repeat(m.length))

    /*
     * 전표 화면(EcSlipShell)은 <b>소스 차례와 화면 차례가 뒤집힌다.</b> 아래 단추줄에
     * 들어갈 목록(<code>actions={footerActions}</code>)을 파일 <b>위쪽</b>에서 만들어 두는데,
     * 껍데기는 그것을 본문(children) <b>아래</b>에 그린다. 그대로 재면 저장·리스트가
     * 격자 위 버튼보다 앞선 것으로 보인다. 그 목록 안의 자리는 뒤로 밀어 둔다.
     */
    const footerRange = (() => {
      // actions={footerActions} — 목록을 파일 위쪽에서 따로 만든 경우
      const named = src.match(/actions=\{(\w+)\}/)
      if (named) {
        const i = src.indexOf('const ' + named[1])
        const j = i < 0 ? -1 : src.indexOf('\n  ]', i)
        if (j > i && i >= 0) return [i, j]
      }
      // actions={[ … ]} — 그 자리에 바로 적은 경우. 대괄호를 세어 끝을 찾는다.
      const i = src.indexOf('actions={[')
      if (i < 0) return null
      let depth = 0
      for (let k = src.indexOf('[', i); k < src.length; k += 1) {
        if (src[k] === '[') depth += 1
        else if (src[k] === ']') { depth -= 1; if (depth === 0) return [i, k] }
      }
      return null
    })()

    /** 그 버튼이 <b>버튼 자리</b>에 처음 나오는 곳(화면에 그려지는 차례로). */
    const pos = new Map()
    /*
     * 같은 이름이 <b>단추줄과 표 안에 둘 다</b> 있으면 단추줄 자리를 쓴다.
     * 작업내역조회에는 줄마다 [인쇄] 버튼이 있는 <b>열</b>이 따로 있어서, 이른 자리만
     * 집으면 그 열이 단추줄의 [인쇄] 자리를 가로챈다 — 원본의 toolbar 와 견줄 것은 단추줄이다.
     */
    const barPos = new Map()
    const put = (name, at) => {
      const k = String(name).replace(/['"\s]+$/, '').trim()
      if (!k) return
      const inBar = footerRange && at >= footerRange[0] && at < footerRange[1]
      const i = inBar ? src.length + at : at
      if (inBar) { if (!barPos.has(k) || i < barPos.get(k)) barPos.set(k, i) }
      if (!pos.has(k) || i < pos.get(k)) pos.set(k, i)
    }
    /*
     * <b>이름표가 적힌 곳이 곧 버튼이 서는 곳은 아니다.</b> 판매·구매입력은 화면마다 다른
     * 말을 파일 <b>맨 위 설정</b>에 모아 둔다(<code>cashLabel: '현금수금'</code>) — 버튼은
     * 저 아래에서 <code>cfg.cashLabel</code> 로 그린다. 그 declaration 을 자리로 읽으면
     * [현금수금]·[주문]·[발주]가 늘 <b>맨 앞</b>에 선 것으로 보인다(실제로 그렇게 걸렸다).
     *
     * <p>그래서 <code>label:</code> 은 <b>단추줄 목록 안에서만</b> 읽는다. 나머지 버튼은
     * <code>&lt;button&gt;</code> 요소로 잡는다 — 그건 그리는 자리에 그대로 있다.
     * 설정에만 있고 그리는 자리에는 이름이 없는 버튼은 <b>자리를 알 수 없어</b> 빠진다.
     */
    if (footerRange) {
      const zone = src.slice(footerRange[0], footerRange[1])
      for (const m of zone.matchAll(/\w*[Ll]abel\s*[:=][^\n]{0,160}/g)) {
        const at = footerRange[0] + m.index
        for (const q of m[0].matchAll(new RegExp(String.raw`['"]([^'"]{1,24})['"]`, 'g'))) put(q[1], at)
        for (const q of m[0].matchAll(new RegExp(BTICK + '([^' + BTICK + '$]{1,24})', 'g'))) put(q[1], at)
      }
    }
    for (const m of src.matchAll(/<button\b[\s\S]{0,400}?<\/button>/g)) {
      const plain = stripJsx(m[0])
      if (plain) put(plain, m.index)
    }
    /*
     * [신규(F2)]는 <b>글자가 아니라 자리가 정해져 있다.</b> EcListShell 이 아래 단추줄의
     * <b>맨 앞</b>에 그린다(onNew/renderForm). 소스에서 그 prop 이 몇째 줄에 적혔는지는
     * 화면에 보이는 자리와 아무 상관이 없다 — 그대로 재면 [Excel] 뒤에 선 것처럼 보인다.
     */
    if (/onNew=|renderForm=/.test(src)) pos.set('신규(F2)', -1)

    const ours = btns.filter((b) => !SHELL_BUTTONS.has(b))
      // '없는 버튼'과 '맨 앞에 붙는 버튼'을 같은 -1 로 적으면 안 된다 — 없는 것까지 끼어든다.
      .map((b) => [b, barPos.has(b) ? barPos.get(b) : (pos.has(b) ? pos.get(b) : null)])
      .filter(([, p]) => p !== null)
    if (ours.length < 3) continue   // 두 개로는 차례를 말할 것이 없다
    checked += ours.length
    const want = ours.map(([b]) => b)
    const got = [...ours].sort((a, b) => a[1] - b[1]).map(([b]) => b)
    if (want.join(' · ') !== got.join(' · ')) {
      bad.push(`${rel.split('/').pop()}\n     원본 ${want.join(' · ')}\n     우리 ${got.join(' · ')}`)
    }
  }
  eq(`원본과 견준 버튼 ${checked}개가 같은 차례로 서 있다`
    + ` (아직 못 맞춘 ${ORDER_SKIP.size}화면은 이유를 적고 뺐다)`, bad.join('\n') || '없음', '없음')
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
    ['관리항목', '관리항목은 품목 마스터에 붙는 값이라 전표에는 없다(라인에 읽기 전용으로만 보인다)'],
    /*
     * <b>이름만 보고 우리 [내역/집계] 알약에 붙일 뻔했다.</b> 사본을 열어 보니 원본의
     * [데이터 보기형식]은 상세/요약이 아니라 <b>[그래프로 보기]</b> 체크 하나다 —
     * 결과를 표 대신 그래프로 그린다. 이름을 옮겨 붙였으면 <b>다른 기능에 원본 이름표를
     * 달아 놓고</b> 맞다고 적어 둘 뻔했다. 여덟 화면에 걸려 있던 것이라 값이 컸다.
     */
    ['데이터 보기형식', '원본의 이 조건은 <b>[그래프로 보기]</b> 체크다 — 결과를 표 대신 그래프로 그린다. 그 여덟 화면에 아직 그래프가 없다'],
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
  collectReasons(NO_FIELD)
  /** 화면별로 안 만든 것 — 화면 사정이 있는 것만 여기에. */
  const NO_FIELD_ON = new Map([
    /*
     * <b>결제내역조회 다섯</b> — 원본의 이 화면은 <b>PG(카드결제) 연동에서 들어오는 자료</b>다.
     * [결제상태]는 승인·취소 같은 PG 상태를 고르는 코드도움이고, [승인번호]·[카드/식별번호]는
     * 그 승인 건의 번호다. 우리에겐 그 연동이 통째로 없어 <b>값이 아예 생기지 않는다</b> —
     * 세워 봐야 무엇을 넣어도 0건인 칸이다. (우리 결제 전표의 회계반영 여부는 다른 것이라
     * 화면 위 탭이 맡는다. 이름이 비슷하다고 그 자리에 끼우면 고른 것과 걸리는 값이 달라진다.)
     *
     * <p>[창고명]·[품목명]은 <b>결제가 돈이라 창고도 품목도 안 탄다.</b> 목록의 [결제방법] 열이
     * 원본 [품목] 자리에 오는 것도 같은 이유다.
     */
    ['결제내역조회|결제상태', 'PG 결제 상태(승인·취소) — 그 연동이 없어 값이 안 생긴다'],
    ['결제내역조회|승인번호', '위와 같음 — PG 승인번호'],
    ['결제내역조회|카드/식별번호', '위와 같음 — PG 카드번호'],
    ['결제내역조회|창고명', '결제는 돈이라 창고를 타지 않는다'],
    ['결제내역조회|품목명', '결제 전표에는 품목이 없다'],
    /*
     * <b>의료기기공급내역보고 [납품거래처]</b> — 원본은 [거래처](전표의 상대)와
     * [납품거래처](<b>실제로 물건이 간 곳</b>)를 따로 둔다. 병원에 납품하면서 대금은
     * 도매상이 치르는 식이라 둘이 갈린다. 우리 판매 전표에는 <b>납품처를 가리키는 칸이
     * 없다</b> — 배송지 주소는 글자로만 있고 거래처를 가리키지 않는다. 없는 연결을
     * 만들어 조건만 세우면 늘 [거래처]와 같은 답이 나온다.
     */
    /*
     * <b>근태 두 화면의 [프로젝트]</b> — 원본의 근태항목에는 출근·외근·출장처럼
     * <b>일한 시간</b>이 들어 있어 그것이 어느 프로젝트의 일이었는지를 단다.
     * 우리 근태 자료는 <b>휴가 신청뿐</b>이다(연차·반차·병가). 휴가는 프로젝트에서 하는 일이
     * 아니라 붙을 데가 없다 — 칸을 만들면 모든 줄이 빈칸인 조건이 된다.
     */
    ['근태조회|프로젝트', '우리 근태 자료는 휴가 신청뿐이라 프로젝트에 붙을 일이 없다'],
    ['근태현황|프로젝트', '위와 같음'],
    /*
     * <b>품질검사현황 [출처(요청)구분]</b> — 그 검사가 <b>어느 전표에서 나왔는지</b>다
     * (구매입고에서 걸린 것인지, 생산입고에서 걸린 것인지). 우리 검사는 사람이 직접
     * 입력하는 것이라 <b>전표와 이어 두지 않는다</b> — 값이 아예 생기지 않는다.
     * [검사구분](수입·공정·출하)은 <b>다른 것</b>이다. 그건 어떤 검사인지이고
     * 이건 어디서 왔는지라, 비슷하다고 그 자리에 끼우면 고른 것과 걸리는 값이 달라진다.
     */
    ['품질검사현황|출처(요청)구분', '검사를 전표에 이어 두지 않아 출처가 안 생긴다 — [검사구분]과 다른 값이다'],
    ['의료기기공급내역보고|납품거래처', '판매 전표에 납품처를 가리키는 칸이 없다 — 배송지는 주소 글자뿐이다'],
    /*
     * 아래 이유는 틀렸었다 — '우리는 입력 화면에 있다' 라고 적어 뒀는데, 원본 조회의
     * 조건은 <b>고치는 칸이 아니라 거르는 칸</b>이다. 목록에는 그 값이 열로 있으니
     * 걸러 낼 수도 있어야 한다. 일자·거래처·담당자는 이번에 만들었고 나머지는 아직이다.
     */
    /*
     * 근태 쪽 넷 — <b>휴가코드 마스터가 없다.</b> 원본의 [휴가항목]은 '연차(2026년)' 처럼
     * 휴가 항목 마스터를 가리키고 [근태그룹]은 그 항목들을 묶는 상위다. 우리는 근태코드
     * 하나로 쓰고 있어서 <b>고를 후보가 만들어지지 않는다</b> — 늘 빈 목록이 되는 조건을
     * 세워 두면 사람이 화면을 의심한다. 마스터를 먼저 만들지 않는 한 못 만든다.
     */
    /*
     * <b>[발송여부] 아홉</b> — 원본의 이 조건은 <b>그 전표를 거래처에 보냈는가</b> 다
     * (메일·팩스로 내보내고 보낸 이력을 남긴다). 우리에겐 <b>전표를 내보내는 기능이
     * 통째로 없어서</b> 보낸 것이 하나도 생기지 않는다 — 조건을 세워 봐야 늘
     * '미발송' 뿐이라 아무 일도 안 하는 칸이 된다.
     *
     * <p>견적서만 예외다. 거기는 [발송] 버튼이 있고 상태가 <b>발송</b> 으로 가므로
     * 그 하나는 실제로 만들었다. 나머지는 <b>기능을 먼저 만들어야</b> 조건이 뜻을 가진다.
     */
    /*
     * A/S소모현황의 담당자 둘 — 원본은 <b>접수한 사람</b>과 <b>고친 사람</b>을 따로 적는다.
     * 우리 A/S 전표의 담당자는 <b>하나</b>라 둘로 가를 수가 없다. 한쪽 이름을 붙여 두면
     * 다른 한쪽으로 찾는 사람이 <b>없는 걸로 오해</b>한다 — 칸을 쪼개기 전에는 못 만든다.
     * (이미 만든 [거래처]·[접수일자]·[창고]·[수리품목]은 서버가 걸러서 합친다.)
     */
    ['A/S소모현황|수리담당자', 'A/S 전표의 담당자가 하나라 접수·수리로 가를 수 없다'],
    ['A/S소모현황|접수담당자', '위와 같음'],
    ['A/S소모현황|수리유형', 'A/S 전표에 수리 갈래를 적는 칸이 없다'],
    ['발주서|발송여부', '전표를 거래처에 내보내는 기능이 없어 보낸 것이 하나도 생기지 않는다'],
    ['발주서조회|발송여부', '위와 같음'],
    ['생산입고조회|발송여부', '위와 같음'],
    ['작업지시서조회|발송여부', '위와 같음'],
    ['작업내역조회|발송여부', '위와 같음'],
    ['창고이동조회|발송여부', '위와 같음'],
    ['생산불출|발송여부', '위와 같음'],
    ['A/S접수|발송여부', '위와 같음'],
    ['A/S접수조회|발송여부', '위와 같음'],
    /*
     * <b>[대표품목으로 합산] 셋</b> — 원본은 품목 마스터에 <b>대표품목</b>을 두어, 색·용량만
     * 다른 품목들을 한 줄로 묶어 볼 수 있게 한다. 우리 품목에는 그 칸이 없어 <b>묶을 축이 없다</b>.
     * 켜도 아무것도 안 묶이는 체크박스가 되므로 마스터를 먼저 만들지 않는 한 못 만든다.
     */
    ['재고수불부|대표품목으로 합산', '품목 마스터에 대표품목 칸이 없어 묶을 축이 없다'],
    ['창고별재고현황|대표품목으로 합산', '위와 같음'],
    ['재고변동표|대표품목으로 합산', '위와 같음'],
    /*
     * 창고 마스터가 없는 것 둘 — 원본 창고는 <b>사업장</b>에 속하고 <b>계층그룹</b>으로 묶인다.
     * 우리 창고는 회사 하나에 평면으로 있다(멀티테넌시는 <b>회사별 스키마</b>로 가른다).
     */
    ['창고등록|추가사업장', '우리는 회사별 스키마로 가르므로 한 회사 안에 사업장이 여럿일 수 없다'],
    ['창고등록|창고계층그룹', '창고를 계층으로 묶는 마스터가 없다 — 평면이다'],
    /* 외화 마스터가 안 가진 것 둘. */
    ['외화등록|금액소수점', '통화별 소수점 자릿수를 우리 마스터가 안 든다 — 원화 기준 정수로 적는다'],
    ['외화등록|환율', '환율은 <b>날짜별 고시</b>라 통화 마스터의 값이 아니다 — 우리는 [고시환율] 탭에서 따로 든다'],
    /* 개념이 없는 나머지. */
    ['일보|종류', '이 화면이 합치는 매출·매입 전표에 그 갈래를 적는 칸이 없다'],
    ['품목vs시리얼재고수량비교|비교기준', '우리 비교는 <b>품목재고 vs 로트재고</b> 하나뿐이라 고를 기준이 없다'],
    ['근태조회|휴가항목', '휴가코드 마스터가 없어 근태코드 하나로 쓴다 — 고를 후보가 없다'],
    ['근태조회|근태그룹', '위와 같음 — 근태항목을 묶는 상위가 없다'],
    ['근태현황|휴가항목', '위와 같음'],
    ['근태현황|근태그룹', '위와 같음'],
    ['판매조회|통화', '판매·구매 전표에 통화 칸이 없다 — 통화 마스터(accounting.Currency)는 있지만 전표가 물지 않는다'],
    ['프로젝트계획|판매계획', '원본 프로젝트계획은 <b>판매·구매·노무비·경비 네 갈래</b>로 계획을 잡는데, 우리 계획은 <b>매출·이익 두 값</b>이다 — 조건을 만들 수 있는 축 자체가 없다(화면 구조가 다르다)'],
    ['프로젝트계획|구매계획', '원본 프로젝트계획은 <b>판매·구매·노무비·경비 네 갈래</b>로 계획을 잡는데, 우리 계획은 <b>매출·이익 두 값</b>이다 — 조건을 만들 수 있는 축 자체가 없다(화면 구조가 다르다)'],
    ['프로젝트계획|노무비계획', '원본 프로젝트계획은 <b>판매·구매·노무비·경비 네 갈래</b>로 계획을 잡는데, 우리 계획은 <b>매출·이익 두 값</b>이다 — 조건을 만들 수 있는 축 자체가 없다(화면 구조가 다르다)'],
    ['프로젝트계획|경비계획', '원본 프로젝트계획은 <b>판매·구매·노무비·경비 네 갈래</b>로 계획을 잡는데, 우리 계획은 <b>매출·이익 두 값</b>이다 — 조건을 만들 수 있는 축 자체가 없다(화면 구조가 다르다)'],
    ['프로젝트계획조회|판매계획', '원본 프로젝트계획은 <b>판매·구매·노무비·경비 네 갈래</b>로 계획을 잡는데, 우리 계획은 <b>매출·이익 두 값</b>이다 — 조건을 만들 수 있는 축 자체가 없다(화면 구조가 다르다)'],
    ['프로젝트계획조회|구매계획', '원본 프로젝트계획은 <b>판매·구매·노무비·경비 네 갈래</b>로 계획을 잡는데, 우리 계획은 <b>매출·이익 두 값</b>이다 — 조건을 만들 수 있는 축 자체가 없다(화면 구조가 다르다)'],
    ['프로젝트계획조회|노무비계획', '원본 프로젝트계획은 <b>판매·구매·노무비·경비 네 갈래</b>로 계획을 잡는데, 우리 계획은 <b>매출·이익 두 값</b>이다 — 조건을 만들 수 있는 축 자체가 없다(화면 구조가 다르다)'],
    ['프로젝트계획조회|경비계획', '원본 프로젝트계획은 <b>판매·구매·노무비·경비 네 갈래</b>로 계획을 잡는데, 우리 계획은 <b>매출·이익 두 값</b>이다 — 조건을 만들 수 있는 축 자체가 없다(화면 구조가 다르다)'],
    ['거래이력조회|작업시간', '원본 거래이력조회는 <b>누가 언제 어느 화면에서 무엇을 고쳤나</b> 를 남기는 감사 기록이다. 우리 화면은 같은 이름이지만 <b>그 거래처의 거래 내역</b>(일자·전표번호·품목·금액)이라 그 값이 없다'],
    ['거래이력조회|메뉴', '원본 거래이력조회는 <b>누가 언제 어느 화면에서 무엇을 고쳤나</b> 를 남기는 감사 기록이다. 우리 화면은 같은 이름이지만 <b>그 거래처의 거래 내역</b>(일자·전표번호·품목·금액)이라 그 값이 없다'],
    ['거래이력조회|작업자', '원본 거래이력조회는 <b>누가 언제 어느 화면에서 무엇을 고쳤나</b> 를 남기는 감사 기록이다. 우리 화면은 같은 이름이지만 <b>그 거래처의 거래 내역</b>(일자·전표번호·품목·금액)이라 그 값이 없다'],
    ['거래이력조회|행위', '원본 거래이력조회는 <b>누가 언제 어느 화면에서 무엇을 고쳤나</b> 를 남기는 감사 기록이다. 우리 화면은 같은 이름이지만 <b>그 거래처의 거래 내역</b>(일자·전표번호·품목·금액)이라 그 값이 없다'],
    ['구매조회|통화', '위와 같음'],
    ['생산입고_소모현황 I|정렬/소계기준', '[구분]이 이미 그 축을 고른다(생산품목별·소모품목별·라인별)'],
    ['출하현황|정렬기준', '위와 같음 — [구분]이 내역·집계·라인별로 그 축을 고른다'],
    ['출하지시서현황|정렬기준', '위와 같음'],
    ['판매현황|정렬기준', '위와 같음'],
    ['출하현황|시리얼/로트No.',
      '출하 라인에 로트를 달지 않는다 — <code>ShipmentLine</code> 은 품목·수량·단가·적요뿐이다.'
      + ' 로트는 입고·생산 쪽에서만 잡는다(시리얼/로트No. 관리 화면)'],
    ['일별이익현황|정렬/소계기준', '위와 같음(라인별·품목별·거래처별…)'],
    ['실제원가현황|정렬/소계기준', '위와 같음(원가집계표·증가내역·감소내역)'],
    ['월별이익현황|정렬/소계기준', '위와 같음(품목별·거래처별…)'],
    ['차이분석|정렬/소계기준', '위와 같음(원가비교집계표·재료비단가차이·소모수량차이…)'],
    /*
     * <b>[대표거래처로 합산]은 채권·채무 화면에는 만들었다</b>(거래처관리대장 I·거래처별채권·채무).
     * 여기만 못 만든다 — 이 화면은 <b>거래처 목록</b>이라 합칠 <b>금액이 없다.</b>
     * 지점을 대표로 묶어 봐야 줄이 사라질 뿐 더해질 값이 없다.
     */
    ['거래처관리대장 II|대표거래처로 합산', '거래처 목록이라 합칠 금액이 없다 — 잔액을 보는 화면에는 만들었다'],
    ['거래처관리대장 II|채권채무구분', '거래처등록 화면이라 채권·채무를 가르지 않는다'],
    /*
     * 사본의 조건 판을 다시 뽑아(<div class=title data-listid=…>) 88개 조건을 되찾으면서
     * 드러난 것들. 아래는 엔티티·응답을 열어 보고 <b>값 자체가 없다</b>는 것을 확인한 것만이다.
     */
    ['거래처관리대장 II|거래처', '이 화면이 곧 거래처 목록이다 — 검색창으로 좁힌다'],
    ['구매단가일괄변경|프로젝트', '단가는 품목·거래처에 붙지 프로젝트에 붙지 않는다(PriceBulkDtos 에 없다)'],
    ['판매단가일괄변경|프로젝트', '위와 같음'],
    ['수금현황|부서', '정산에도 거래처에도 부서가 없다 — 붙일 값이 없다'],
    ['지급현황|부서', '위와 같음'],
    ['휴가사용실적현황|프로젝트', '휴가에 프로젝트를 달지 않는다 — 잔여일수 응답에도 없다'],
    ['휴가잔여일수현황|프로젝트', '위와 같음'],
    ['작업지시서입력|첨부', '작업지시에 붙임 파일을 달지 않는다 — 기안서와 달리 attachmentId 가 없다'],
    ['거래처관리대장 II|거래처그룹2', '거래처그룹이 하나다 — [거래처그룹1] 만 있다'],
    ['판매조회|발송여부',
      '전표를 보냈는지(메일·팩스)를 기록하지 않는다 — 보낼 자리가 없으니 보낸 표시도 없다.'
      + ' 출하조회의 [발송여부]는 출하 <b>상태</b>라 이것과 다른 값이다'],
    /*
     * 일정 두 화면(건설예정공정표·SW개발일정관리)을 조건 대조에 새로 걸면서 드러난 것들.
     * 두 화면은 같은 <code>/projects</code> 를 쓰므로 이유도 같다. 원본 조건 판이 그룹웨어
     * <b>게시판 틀</b>을 그대로 쓰고 있어서, 게시글에만 있는 조건이 여럿 섞여 있다.
     */
    ['건설예정공정표|게시일', '프로젝트는 게시글이 아니다 — 올린 날이라는 값이 없다'],
    ['SW개발일정관리|게시일', '위와 같음'],
    ['건설예정공정표|실제완료일', '실제로 끝난 날을 적는 칸이 없다 — 진행률과 상태만 있다'],
    ['SW개발일정관리|실제완료일', '위와 같음'],
    ['건설예정공정표|태스크구분', '일을 갈래로 나누지 않는다'],
    ['SW개발일정관리|태스크구분', '위와 같음'],
    ['건설예정공정표|프로젝트', '이 화면의 <b>행 자체가 프로젝트</b>다 — 프로젝트로 프로젝트를 거를 수 없다'],
    ['SW개발일정관리|프로젝트', '위와 같음'],
    ['건설예정공정표|거래처', '프로젝트에 거래처를 달지 않는다'],
    ['SW개발일정관리|거래처', '위와 같음'],
    ['건설예정공정표|사용자', '작성자만 남기고 조건으로 거르지는 않는다'],
    ['SW개발일정관리|사용자', '위와 같음'],
    ['건설예정공정표|담당자구분', '담당은 이름 한 칸이다 — 갈래가 없다'],
    ['SW개발일정관리|담당자구분', '위와 같음'],
    ['건설예정공정표|게시글번호', '게시글이 아니라 번호가 없다'],
    ['SW개발일정관리|게시글번호', '위와 같음'],
    ['건설예정공정표|삭제구분', '지운 것을 남겨 두지 않는다 — 지우면 없어진다'],
    ['SW개발일정관리|삭제구분', '위와 같음'],
    ['건설예정공정표|입력경로', '어디서 넣었는지 기록하지 않는다'],
    ['SW개발일정관리|입력경로', '위와 같음'],
    ['거래처관리대장 II|거래유형(영업)', '거래유형은 전표에 붙지 거래처에 붙지 않는다'],
    ['거래처관리대장 II|거래유형(구매)', '위와 같음'],
    ['거래처관리대장 II|거래처계층그룹', '거래처에 계층이 없다(평면 그룹 하나)'],
    ['휴가잔여일수현황|상태', '잔여일수 응답은 사원·부서·일수만 준다 — 줄에 상태가 없다'],

    /*
     * 아래는 조건 이름을 <b>이름 자리</b>에서만 찾도록 검사를 죄면서 드러난 것들이다.
     * 예전에는 파일 어디에 그 낱말이 있기만 하면 통과라, 표 머리의 [거래유형명]이
     * [거래유형] 조건 노릇을 하고 있었다. 아래는 전부 <b>아직 안 만든 것</b>이고,
     * 만들면 바로 위 stale 검사가 이 줄을 지우라고 알려 준다.
     */
    ['거래처관리대장 II|외화거래처', 'BusinessPartner 에 통화 칸이 없다 — 외화 거래처를 가릴 값 자체가 없다'],
    ['휴가잔여일수현황|적요', '적요로 거르는 칸을 아직 안 만들었다 — 잔여일수 응답에 적요가 없다'],

    ['생산입고현황|채무번호', '생산입고를 외상매입과 잇지 않는다'],
    ['작업지시서작업처리|작업품목', '작업(BOR) 기준 품목을 작업처리에 붙이지 않는다'],
    /* 작업지시서조회에 [작업지시No.] 조건을 만들자 <b>같은 파일</b>이라 입력 쪽에서도 보인다 — 예외가 필요 없어졌다. */
    ['작업지시서효율현황|오더관리번호', '작업지시를 수주(오더)와 잇지 않는다'],
    ['작업지시서효율현황|거래처관리담당자', '작업지시에는 거래처가 납품처로만 붙는다'],
    ['작업지시서효율현황|규격', '효율 화면은 품목이 아니라 지시 단위로 센다'],
  ])
  collectReasons(NO_FIELD_ON)

  const bad = []
  const stale = []   // 이미 만들었는데 예외로 남아 있는 것
  let checked = 0
  let pending = 0
  for (const [screen, fields] of Object.entries(cap)) {
    const rel = FORM_MAP.get(screen)
    if (!rel) continue
    const path = join('frontend', 'src', 'pages', ...rel.split('/'))
    if (PENDING.has(screen)) { pending++; continue }
    if (!pageSource(rel)) continue
    const own = pageSource(rel)   // 감싸기만 하는 화면은 감싸인 쪽까지 읽는다
    /*
     * 조건 이름은 <b>이름 자리</b>에서만 찾는다. 예전에는 파일 어디든 그 낱말이
     * 있으면 있는 것으로 쳤는데, 그러면 표 머리의 [거래유형명]·[프로젝트명] 이
     * [거래유형]·[프로젝트] 조건으로 둔갑한다 — 실제로 그렇게 헛짚었다.
     */
    const labelSet = new Set()
    // 필수 표시(*)와 앞뒤 공백은 이름이 아니다 — label="생산품목 *" 도 [생산품목]이다.
    const addLabel = (x) => labelSet.add(String(x).replace(/[\s*]+$/, '').trim())
    for (const src2 of [own, SHARED]) {
      for (const m of src2.matchAll(/(?:label|placeholder)=["']([^"']{1,24})["']/g)) addLabel(m[1])
      // 구분에 따라 갈리는 이름표: label={isSales ? '출하창고' : '입고창고'}
      for (const m of src2.matchAll(/label=\{[^}]{0,90}\}/g)) {
        for (const q of m[0].matchAll(/['"]([^'"]{1,24})['"]/g)) addLabel(q[1])
      }
      // 이름을 설정표나 변수로 넘기는 곳(whLabel: '출하창고' · dateLabel = '기준일자').
      for (const m of src2.matchAll(/\w*Label\s*[:=]\s*["']([^"']{1,24})["']/g)) addLabel(m[1])
      /*
       * <b>이름표를 함수로 그리는 화면.</b> 증빙센터는
       * <code>&lt;label&gt;{label('전표일자')}…&lt;/label&gt;</code> 로 적는다 —
       * label= 만 찾다가 <b>이미 만든 조건 넷</b>을 없다고 세고 있었다
       * (전표일자·증빙일자·메뉴·증빙방법). 그 호출의 글자도 이름표로 친다.
       */
      for (const m of src2.matchAll(/\blabel\(\s*['"]([^'"]{1,24})['"]/g)) addLabel(m[1])
      /*
       * <b>목록 표의 머리</b>는 조건 이름이 아니다. 예전에는 <th>일자</th> 하나로
       * 원본 조건 [일자]가 있는 것으로 쳤다 — 정작 조건 이름은 [작업일자] 였다.
       *
       * <p>다만 우리 등록 폼은 <b>표로 짠다</b>(거래처등록의 <th>대표자명</th><td>입력칸</td>).
       * 거기 <th>는 진짜 이름표다. 그래서 <thead> 안의 것만 뺀다.
       */
      const noHead = src2.replace(/<thead[\s\S]*?<\/thead>/g, ' ')
      /*
       * 24자 제한은 <b>이름이 그만큼 길다</b>는 뜻이지 <b>태그에서 그만큼 가깝다</b>는 뜻이 아니다.
       * 앞뒤 공백을 셈에 넣고 있어서, 들여쓰기가 깊은 자리의 이름표를 놓쳤다 —
       * 특별단가등록 [수정일자순(정렬)]을 만들어 놓고도 <b>없다고 나왔다</b>.
       * 공백은 따로 빼고 글자만 센다.
       */
      for (const m of noHead.matchAll(/>\s*([^<>{}\s][^<>{}]{0,23})\s*</g)) addLabel(m[1])
    }
    for (const f of fields) {
      /*
       * 예외로 빼 둔 것이 <b>이제는 있는지</b>도 같이 본다. 예전에는 이 자리에서 바로
       * continue 라 아래 stale 이 <b>한 번도 채워지지 않았고</b>, '예외가 아직 필요하다'
       * 는 검사가 늘 통과했다 — 아무것도 재지 않고 있었다.
       *
       * 화면을 안 가리는 NO_FIELD 는 세지 않는다. 이름이 짧아(기타·통화) 딴 낱말에
       * 걸려 든다 — '기타할인등차액' 이 '기타' 를 품는 식이다.
       */
      const onExempt = NO_FIELD_ON.has(`${screen}|${f}`)
      if (!onExempt && NO_FIELD.has(f)) continue
      // 상태 이름만 보면 안 된다 — 만들어 놓고 안 그리는 화면을 못 잡는다.
      // 상태 이름만 보면, 만들어 놓고 화면에 안 그리는 것을 못 잡는다.
      const has = f === '정렬/소계기준' ? /subtotal=\{|label="정렬\/소계기준"|>정렬\/소계기준</.test(own)
        : f === '데이터 보기형식' ? /view=\{|데이터 보기형식/.test(own)
          : labelSet.has(f)
      if (onExempt) {
        if (has) stale.push(`조건 [${screen}|${f}] — 이제 화면에 있다`)
        continue
      }
      checked++
      if (!has) bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 [${f}] 조건이 없다${serverHasHint(f)}`)
    }
  }
  eq(`원본 조건 ${checked}개가 우리 화면에도 있다`
    + ` (안 만든 ${NO_FIELD.size + NO_FIELD_ON.size}종은 이유를 적고 뺐다, 아직 못 맞춘 화면 ${pending}개는 건너뜀)`,
    '없음', '없음')   /* 못 만든 것은 아래 목록이 따로 붙든다 */
  eq(`조건 예외 ${NO_FIELD.size + NO_FIELD_ON.size}종이 아직 필요하다`, stale.join('\n') || '없음', '없음')

  /*
   * <b>아직 안 만든 조건.</b> 사본 지도를 90 → 129화면으로 넓히면서 조건 fixture 도
   * 59 → 115화면이 됐고, 그 순간 <b>안 만든 조건 176개</b>가 한꺼번에 드러났다.
   * 한 판에 다 만들 수 없다 — 그렇다고 "이유 있는 예외" 로 적으면 거짓말이 된다.
   * 목록으로 두고 <b>늘지만 않게</b> 한다. 만든 조건은 목록에서 지워야 통과한다.
   *
   * <p>그중 <b>59개는 서버가 이미 그 값을 보내고 있다</b>(응답 DTO 에 있다) —
   * 화면에 보이는데 그것으로 거를 수만 없는 것들이라 먼저 걷을 값어치가 크다.
   */
  const TODO = JSON.parse(readFileSync(join('qa', 'fixtures', 'pending-conditions.json'), 'utf8'))
  const flat = bad.map((x) => x.replace(/\s*←[\s\S]*$/, '').trimEnd())
  const grown = flat.filter((x) => !TODO.includes(x))
  const gone = TODO.filter((x) => !flat.includes(x))
  eq(`안 만든 조건이 늘지 않았다 (아직 ${TODO.length}개 남음)`, grown.join('\n') || '없음', '없음')
  eq('만들어 놓고 목록에 남겨 둔 조건이 없다', gone.join('\n') || '없음', '없음')
}

// ── 2-p) 조건 판의 차례 ───────────────────────────────────────────────────
console.log('\n■ 화면 머리의 조건이 원본과 같은 차례로 서 있나')

/*
 * <b>조건이 있기만 하면 되는 게 아니다.</b> 원본을 쓰던 사람은 조건 판을 눈으로
 * 훑어 내려간다 — 늘 [기준일자] 다음이 [거래처]인 자리에 엉뚱한 것이 있으면
 * 매번 찾아 읽어야 한다. 열 차례(2-c)는 이미 보고 있었는데 조건 차례는 안 봤다.
 *
 * <p>사본에서 뽑은 <code>ecount-form-fields.json</code>은 <b>원본 차례 그대로</b>다.
 * 우리 화면에 있는 것만 골라 서로의 앞뒤가 같은지 본다(없는 조건은 건너뛴다).
 * 공용 패널(EcStatusPanel)이 그리는 [구분]·[기준일자]는 화면 파일에 글자가 없어
 * 저절로 빠진다 — 그건 패널이 늘 같은 자리에 그린다.
 */
{
  const ORDER_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-form-fields.json'), 'utf8'))
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)
  /** 차례를 아직 못 맞춘 화면 — 왜인지 적는다. */
  const ORDER_SKIP = new Map([
    ['매출계획비교표',
      '한 파일이 네 화면을 겸하는데 <b>비교표만 축 차례가 다르다</b> — 매출계획·매출계획조회·'
      + '매출계획현황 셋은 <b>창고 · 거래처 · 품목</b> · 프로젝트, 비교표는 <b>품목 · 거래처 · 창고</b> ·'
      + ' 프로젝트다. 셋에 맞췄다'],
    ['창고이동조회',
      '창고이동현황과 한 파일인데 <b>원본 두 화면이 [프로젝트]와 [품목]의 앞뒤를 서로 다르게 둔다</b> —'
      + ' 창고이동현황은 창고·<b>프로젝트</b>·품목·담당자, 창고이동조회는 창고·<b>품목</b>·프로젝트·담당자다.'
      + ' 현황 차례에 맞췄다'],
    ['발주서입력',
      '한 파일이 <b>네 화면을 겸하는데 원본이 [프로젝트]를 서로 다른 자리에 둔다</b> —'
      + ' 발주서·발주서조회·발주서현황 셋은 <b>[거래처]보다 앞</b>이고, 발주서입력만 <b>맨 뒤</b>다.'
      + ' 조회 셋에 맞췄다(그쪽이 셋이고, 조건 판이 먼저 그려진다). 입력 폼 안에서는'
      + ' 원본대로 [참조] 다음에 두었다'],
    ['내결재관리',
      '기안서통합관리와 한 파일(ApprovalListPage)인데 <b>원본 두 화면의 조건 차례가 다르다</b> —'
      + ' 기안서통합관리는 일자·제목·결재라인·…·<b>기안서No.</b>·첨부·라벨 이고,'
      + ' 내결재관리는 기준일자·<b>기안서No.</b>·구분·기안자·제목·내용 이다.'
      + ' 조건이 더 많은 기안서통합관리 차례에 맞췄다. 실제로 내결재관리 차례로 옮겨 봤더니'
      + ' 이번에는 기안서통합관리가 어긋났다 — 되돌리고 여기 적는다'],
    ['A/S접수',
      '원본의 그 차례는 <b>조건 판</b>의 차례인데, 우리 [창고]는 조건이 아니라 <b>부품 격자의 이름표</b>라 사이에 끼어든다 — 거래처관리대장 II 와 같은 까닭이다'],
    ['A/S접수입력', '위와 같음'],
    ['A/S접수조회', '위와 같음'],
    ['거래처관리대장 II',
      '원본의 그 차례는 <b>거래처를 찾는 조건 판</b>의 차례다. 우리는 그 이름 아홉 개를'
      + ' 조건 판에 원본 차례로 두었고(상호·종사업장번호·대표자명 …), 나머지 열두 개는'
      + ' <b>등록 폼</b>(탭 4개)의 이름표다 — 폼을 조건 판 차례로 세우는 것은 뜻이 없다.'
      + ' 그래서 한 줄로 이어 붙인 차례와는 견줄 수 없다'],
    ['구매일괄회계반영',
      '원본 두 화면이 서로 다른 차례다 — 구매일괄회계반영은 거래처관리담당자·거래유형,'
      + ' 회계미반영현황(구매)는 거래유형·거래처관리담당자. 한 화면이 둘을 겸해서 둘 다 맞출 수 없다'],
    ['구매조회',
      '판매조회와 한 파일(TradeInquiryPage)인데 <b>원본 두 화면의 조건 차례가 다르다</b> —'
      + ' 판매조회는 거래유형·창고·프로젝트·거래처·품목, 구매조회는 거래처·담당자·입고창고·'
      + '거래유형·프로젝트. 판매조회 차례에 맞췄다(조건이 더 많다). 이름도 원본을 따라'
      + ' 판매는 [창고], 구매는 [입고창고] 로 갈라 그린다'],
    ['판매일괄회계반영',
      '위와 같은 까닭이다. 원본 <b>판매</b>일괄회계반영은 창고·거래처·품목·프로젝트·담당자·'
      + '거래처관리담당자·<b>거래유형</b> 차례인데, 같은 파일이 겸하는 회계미반영현황(구매)는'
      + ' <b>거래유형</b>·창고·프로젝트·거래처·품목 차례다. 실제로 판매 차례로 바꿔 봤더니'
      + ' 이번에는 회계미반영현황(구매)가 어긋났다 — 되돌리고 여기 적는다'],
  ])

  const bad = []
  let checked = 0
  for (const [screen, fields] of Object.entries(cap)) {
    const rel = ORDER_MAP.get(screen)
    if (!rel || PENDING.has(screen) || ORDER_SKIP.has(screen)) continue
    const src = pageSource(rel)
    // 목록 표의 머리는 조건 이름이 아니다 — 있는지 보는 검사(2-h)와 같은 규칙으로 뺀다.
    /*
     * <b>조건 판 안에서만</b> 자리를 잰다. 화면 파일에는 조건 판 말고 등록 폼도 있고,
     * 그 폼의 이름표(<th>부서</th>)가 조건 판보다 <b>앞에</b> 나오면 차례가 뒤집힌 것처럼
     * 보인다 — 업무일지가 실제로 그랬다. 조건 판이 없는 화면(등록 폼이 곧 머리인 곳)은
     * 파일 전체를 본다. 목록 표의 머리는 어느 쪽이든 뺀다.
     */
    const panel = (() => {
      for (const [open, close] of [['<EcStatusPanel', '</EcStatusPanel>'],
        ['ec-cond', '</ul>'], ['ec-form', '</ul>']]) {
        const i = src.indexOf(open)
        if (i < 0) continue
        const j = src.indexOf(close, i)
        if (j > i) return src.slice(i, j)
      }
      return src
    })()
    const noHead = panel.replace(/<thead[\s\S]*?<\/thead>/g, ' ')
    if (!src) continue
    /** 그 이름이 <b>이름 자리</b>에 처음 나오는 곳. 없으면 -1. */
    const posOf = (f) => {
      let best = -1
      for (const re of [new RegExp('label\\s*=\\s*["\'`]' + esc(f) + '["\'`]'),
        new RegExp('>\\s*' + esc(f) + '\\s*<')]) {
        const m = noHead.match(re)
        if (m && (best < 0 || m.index < best)) best = m.index
      }
      return best
    }
    const ours = fields.map((f) => [f, posOf(f)]).filter(([, p]) => p >= 0)
    if (ours.length < 3) continue   // 두 개로는 차례를 말할 것이 없다
    checked += ours.length
    const want = ours.map(([f]) => f)
    const got = [...ours].sort((a, b) => a[1] - b[1]).map(([f]) => f)
    if (want.join(' · ') !== got.join(' · ')) {
      bad.push(`${rel.split('/').pop()}\n     원본 ${want.join(' · ')}\n     우리 ${got.join(' · ')}`)
    }
  }
  eq(`원본과 견준 조건 ${checked}개가 같은 차례로 서 있다`
    + ` (아직 못 맞춘 ${ORDER_SKIP.size}화면은 이유를 적고 뺐다)`, bad.join('\n') || '없음', '없음')
}

// ── 2-q) 사본 화면이 하나도 빠지지 않았나 ─────────────────────────────────
console.log('\n■ 사본에 있는 화면을 하나도 안 빠뜨리고 견주고 있나')

/*
 * <b>화면 하나가 통째로 빠져 있어도 아무도 몰랐다.</b> 대조표(.ordermap.json)에 안 걸어
 * 두면 그 화면은 열·조건·버튼 어느 검사에도 안 들어온다. 실제로 ECDrive 와 판매입력II 가
 * 그렇게 빠져 있었다 — 사본은 있는데 견주는 곳이 없었다.
 *
 * <p>사본 폴더의 화면 이름을 세어, 대조표에 걸려 있거나
 * <code>unmapped-screens.json</code> 에 <b>왜 못 거는지</b>가 적혀 있어야 한다.
 */
{
  const dir = 'C:/Users/USER/Desktop/ERP'
  const MAPPED = new Set(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8'))
    .map(([screen]) => screen))
  const WHY = JSON.parse(readFileSync(join('qa', 'fixtures', 'unmapped-screens.json'), 'utf8'))

  if (!existsSync(dir)) {
    console.log('  · 사본 폴더가 없어 건너뜀 (' + dir + ')')
  } else {
    const screens = new Set()
    for (const f of readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.html')) continue
      screens.add(f.split(/ [(]20\d{2}[.]/)[0].trim())
    }
    const bad = []
    for (const s of [...screens].sort()) {
      if (MAPPED.has(s) || WHY[s]) continue
      bad.push(s + ' — 대조표에 없고 이유도 안 적혀 있다')
    }
    const stale = Object.keys(WHY).filter((s) => MAPPED.has(s))
      .map((s) => s + ' — 이제 대조표에 걸려 있다')
    eq('사본 화면 ' + screens.size + '개가 다 대조표에 걸려 있다 (못 거는 '
      + Object.keys(WHY).length + '개는 이유를 적었다)', bad.join('\n') || '없음', '없음')
    eq('못 거는 화면 ' + Object.keys(WHY).length + '개가 아직 그대로다', stale.join('\n') || '없음', '없음')
  }
}

// ── 2-r) 열 폭의 앞뒤 차례 ───────────────────────────────────────────────
console.log('\n■ 원본과 우리의 열 폭 차례가 뒤집히지 않았나')

/*
 * <b>어느 열을 넓게 두는지는 그 화면이 무엇을 읽으라는 말이다.</b> 사본의 colgroup 에
 * 열 폭이 픽셀로 박혀 있다(<code>&lt;col style=width:150px&gt;</code>). 거래처명 150 · 나머지 100
 * 하는 식이라, 이름을 읽으라는 뜻이 폭에 드러난다.
 *
 * <p>픽셀을 그대로 맞출 일은 아니다(글꼴도 표도 다르다). 대신 <b>뒤집힘</b>만 본다 —
 * 원본이 넓게 둔 열을 우리가 <b>더 좁게</b> 못 박아 두면, 그 열의 값이
 * 잘려서 정작 읽어야 할 것을 못 읽는다. 폭을 안 박은 열은 늘어나므로 넘어간다.
 *
 * <p>둘째와 20px 넘게 차이 나는 화면만 담았다(fixture) — 100·100·100 처럼 다 같은 표는
 * '가장 넓은 열' 이라는 말 자체가 뜻이 없다.
 */
{
  const WIDTH_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-column-width.json'), 'utf8'))
  /** 우리 칸에 든 값이 원본보다 길어 폭을 뒤집을 수밖에 없는 곳 — 이유를 적는다. */
  const WIDTH_SKIP = new Map([
    ['근태현황|근태일자|근태',
      '우리 [근태일자]는 기간을 한 칸에 적는다(2026-01-01 ~ 2026-01-03). 원본은 하루라 100 이면 되지만'
      + ' 우리는 좁히면 잘린다. [근태]는 원본대로 가장 넓게 뒀다'],
  ])
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)
  /*
   * \uba38\ub9ac \uc774\ub984\uc744 \ub0a9\uc791\ud558\uac8c. <b>\uc911\uad04\ud638 \uc2dd\uc744 \uba3c\uc800 \uc9c0\uc6b4\ub2e4</b> \u2014 \uc815\ub82c\uc744 \uac78\uba74\uc11c \uba38\ub9ac\uc5d0
   * <code>{sort.mark('X')}</code> \uac00 \ubd99\uc5c8\ub294\ub370, \uadf8\uac78 \ub0a8\uae30\uba74 \uc774\ub984\uc774
   * <code>\uc791\uc5c5\uc9c0\uc2dcNo.{sort.mark('\uc9c0\uc2dc\ubc88\ud638')}</code> \uac00 \ub418\uc5b4 \uc6d0\ubcf8\uacfc \uc548 \ub9de\ub294\ub2e4.
   */
  const flat = (s) => s.replace(/\{[^{}]*\}/g, '')
    .replace(/<[^>]*>/g, '').replace(/[\s\u25bc\u25b2]/g, '')
  /*
   * 머리 칸 하나가 <b>내걸 수 있는 이름</b>. 보통은 flat 한 글자 하나지만, 이름을
   * <b>삼항으로 적은 칸</b>은 flat 하면 빈 글자가 되어 그 열이 통째로 사라진다
   * (판매입력 [수량] ↔ 구매입력 [기본수량] 처럼 원본이 화면마다 달리 부르는 칸이다).
   * 그런 칸은 따옴표 안의 글자를 모두 후보로 둔다.
   */
  const thNames = (s) => {
    const plain = flat(s)
    if (plain) return [plain]
    /* 빈 칸이 <b>둘레의 글자</b>를 주워 오지 않게, 식으로 적은 칸만 본다. */
    const expr = s.match(/\{[^{}]*\}/)
    if (!expr) return []
    return [...expr[0].matchAll(/'([^']{1,20})'/g)].map((m) => flat(m[1])).filter(Boolean)
  }

  const bad = []
  let checked = 0
  let skipped = 0
  for (const [screen, cols] of Object.entries(cap)) {
    const rel = WIDTH_MAP.get(screen)
    if (!rel || PENDING.has(screen)) continue
    const src = pageSource(rel)
    if (!src) continue
    const names = Object.keys(cols)
    const scored = [...src.matchAll(/<thead>[\s\S]*?<\/thead>/g)].map((h) => ({
      head: h[0],
      /*
       * <b>여기도 죽어 있었다.</b> 보통 따옴표의 <code>'\s'</code> 는 그냥 <b>글자 s</b> 라
       * 이 정규식은 <code>&lt;th…&gt;s*이름s*…&lt;/th&gt;</code> 를 찾고 있었다.
       * <code>s*</code> 는 빈 것도 맞아 대부분 통했지만, <b>공백이 든 머리</b>는 못 짚어
       * 그 화면의 표를 통째로 건너뛰었다. 보기 이름 쪽과 같은 함정이다.
       */
      hit: names.filter((n) => new RegExp(String.raw`<th\b[^>]*>\s*${esc(n)}\s*${MARK_TAIL}\s*</th>`).test(noArrow(h[0]))).length,
    })).filter((x) => x.hit > 1).sort((a, b) => b.hit - a.hit)
    if (!scored.length || (scored.length > 1 && scored[0].hit === scored[1].hit)) { skipped++; continue }

    const widths = new Map()
    for (const m of noArrow(scored[0].head).matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)) {
      const w = m[1].match(/width:\s*(\d+)/)
      if (w) for (const n of thNames(m[2])) widths.set(n, Number(w[1]))
    }
    /*
     * 양쪽 다 폭을 못 박은 열끼리만 견준다. 폭을 안 박은 열은 늘어나므로
     * '넓다/좁다' 를 말할 수 없다.
     */
    const pairs = Object.entries(cols).filter(([n]) => widths.has(flat(n)))
    for (let i = 0; i < pairs.length; i += 1) {
      for (let j = i + 1; j < pairs.length; j += 1) {
        const [an, aw] = pairs[i]
        const [bn, bw] = pairs[j]
        if (Math.abs(aw - bw) < 30) continue      // 원본이 비슷하게 둔 것은 따지지 않는다
        if (WIDTH_SKIP.has(screen + '|' + an + '|' + bn)
          || WIDTH_SKIP.has(screen + '|' + bn + '|' + an)) continue
        checked += 1
        const mineA = widths.get(flat(an))
        const mineB = widths.get(flat(bn))
        if (Math.sign(aw - bw) !== Math.sign(mineA - mineB) && mineA !== mineB) {
          bad.push(rel.split('/').pop() + '  원본 [' + an + '] ' + aw + ' vs [' + bn + '] ' + bw
            + ' — 우리는 ' + mineA + ' vs ' + mineB + ' 로 뒤집혀 있다')
        }
      }
    }
  }
  eq('폭을 견준 열 짝 ' + checked + '개의 앞뒤가 원본과 같다 (표를 못 짝지어 건너뛴 '
    + skipped + '개)', bad.join('\n') || '없음', '없음')
}

// ── 2-s) 회계기수 기간을 ! 로 눌러 쓰지 않았나 ────────────────────────────
console.log('\n■ 회계기수가 있어야 나오는 기간을 ! 로 눌러 쓰지 않았나')

/*
 * <b>화면 셋이 통째로 하얗게 떠 있었다.</b> [이번기수]·[직전기수]·[이번기수(~전월)] 는
 * 회사 회계연도 시작월을 알아야 계산된다 — 모르면 <code>periodOf</code> 가 null 을 준다.
 * 그 자리에 <code>!</code> 를 붙여 두면 타입 검사는 아무 말도 안 하고, 화면을 열 때
 * <code>init.from</code> 에서 터져 아무것도 안 그려진다.
 *
 * <p>수금현황·지급현황·결제내역자료비교가 그렇게 죽어 있었다. 정적 검사로는 못 잡고
 * 브라우저로 열어 보고서야 알았다 — 그래서 이 검사를 둔다.
 *
 * <p>시작월은 <code>/preferences</code> 에서 받아 오는데 그건 첫 그림 다음이라 늦다.
 * 그러니 <b>기본값은 시작월 없이도 되는 기간</b>으로 열고, 받은 뒤에 다시 걸어야 한다.
 */
{
  const NEEDS_FISCAL = ['이번기수', '직전기수', '이번기수(~전월)']
  const bad = []
  let checked = 0
  for (const f of walk(join('frontend', 'src'))) {
    if (!f.endsWith('.tsx') && !f.endsWith('.ts')) continue
    const src = readFileSync(f, 'utf8')
    for (const label of NEEDS_FISCAL) {
      // periodOf('이번기수')! · periodOf('이번기수', new Date())!  — 시작월을 안 넘기고 ! 를 붙인 것
      const re = new RegExp('periodOf' + '\\' + '(' + "'" + label + "'" + '([^)]*)' + '\\' + ')' + '\\' + '!', 'g')
      for (const m of src.matchAll(re)) {
        checked += 1
        const args = m[1] || ''
        // 셋째 인자(시작월)를 넘겼으면 null 이 아닐 수 있다 — 그래도 ! 는 위험하다.
        bad.push(f.split(sep).pop() + '  periodOf(' + "'" + label + "'" + args + ')! — 시작월이 없으면 null 이라 화면이 죽는다')
      }
    }
  }
  eq('회계기수 기간을 ! 로 눌러 쓴 곳이 없다 (' + checked + '군데 살펴봄)', bad.join('\n') || '없음', '없음')
}

// ── 2-t) 표 머리의 ▼ 가 거짓말을 하지 않나 ───────────────────────────────
console.log('\n■ 표 머리에 ▼ 를 그려 놓고 정렬은 안 되는 화면이 늘지 않았나')

/*
 * <b>▼ 는 '눌러서 정렬한다' 는 뜻이다.</b> 원본은 목록 열의 78%에 정렬 표시를 달고
 * 실제로 눌러 정렬한다(사본 실측 — 열 209개 중 162개).
 *
 * <p>우리는 <b>60개 화면이 ▼ 를 그려 놓고 정렬 코드가 한 줄도 없었다.</b> 눌러도 아무
 * 일이 없으니 표시가 거짓말을 하고 있었다. 한 번에 다 고칠 수는 없어서, 아직 안 고친
 * 화면을 <code>decorative-sort-marks.json</code> 에 적어 두고 <b>늘지 않는지</b>만 본다.
 *
 * <p>화면을 고치면(useTableSort 를 쓰면) 그 줄을 지워야 한다 — 안 지우면 여기서 걸린다.
 *
 * <p><b>낱말만 보면 안 된다.</b> ▼ 는 표 머리 말고 다른 데도 쓴다 — 특별단가순서의
 * [순서 내리기] 버튼, 상세검색 판의 접기/펼치기 표시가 그렇다. 그런 ▼ 는 정렬을
 * 약속하지 않으므로 거짓말이 아니다. 그래서 <b>&lt;th&gt; 안에 있는 ▼ 만</b> 센다.
 * (처음에 낱말만 보다가 특별단가순서 화면을 '고칠 수 없는 빚' 으로 잘못 적어 뒀다.)
 */
{
  const TODO = JSON.parse(readFileSync(join('qa', 'fixtures', 'decorative-sort-marks.json'), 'utf8'))
  const listed = new Set(TODO)
  const grown = []
  const stale = []
  let fixed = 0
  /** 표 머리 안에 든 ▼ 만 정렬 표시로 친다. */
  const headMark = (src) => [...src.matchAll(/<th\b[\s\S]*?<\/th>/g)].some((m) => m[0].includes('▼'))
  for (const f of walk(join('frontend', 'src', 'pages'))) {
    if (!f.endsWith('.tsx')) continue
    const rel = f.split(sep).join('/').split('frontend/src/pages/')[1]
    const src = readFileSync(f, 'utf8')
    const hasMark = headMark(src)
    const sorts = src.includes('useTableSort')
    if (hasMark && !sorts && !listed.has(rel)) grown.push(rel + ' — ▼ 를 새로 그렸는데 정렬이 없다')
    if (listed.has(rel) && (sorts || !hasMark)) { stale.push(rel + ' — 이제 정렬된다(목록에서 지우세요)'); fixed += 1 }
    if (sorts) fixed += 0
  }
  eq('▼ 만 그린 화면이 늘지 않았다 (아직 ' + TODO.length + '개 남음)', grown.join('\n') || '없음', '없음')
  eq('고친 화면이 목록에 남아 있지 않다', stale.join('\n') || '없음', '없음')
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
 * 생산불출조회(우리 '생산불출').
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
    ['거래처특별단가그룹등록', '한 화면이 등록(팝업)과 목록을 겸해 제목은 [거래처특별단가그룹]이다'],
    ['시리얼/로트No.등록', '한 화면이 등록(팝업)과 내역조회를 겸해 제목은 [시리얼/로트No. 관리]다'],
    ['매출계획입력', '한 화면이 입력·조회·비교표를 겸해 제목은 [매출계획 / 비교표]다'],
    ['매출계획조회', '위와 같음'],
    ['창고이동조회', '창고이동현황 한 화면이 조회를 겸한다'],
    /*
     * 지도를 137 → 147 로 넓히며 나온 것들. 원본이 <b>입력·조회·현황을 따로 둔</b> 자리를
     * 우리는 한 화면으로 겸하는 경우다 — 제목이 다른 것은 그 때문이다.
     */
    ['A/S접수', 'A/S 접수·수리 관리 한 화면이 접수 입력·조회를 겸한다 — 우리는 접수→처리중→완료를 한 전표의 상태전이로 다뤄 수리 전표가 따로 없다'],
    ['A/S접수입력', '위와 같음'],
    ['A/S접수조회', '위와 같음'],
    ['A/S접수현황', 'A/S현황 한 화면이 <b>접수현황·수리현황</b>을 상태 필터로 겸한다(화면 주석에 적혀 있다)'],
    ['품질검사요청입력', '품질검사요청 한 화면이 입력(팝업)과 목록을 겸한다'],
    ['창고등록', '우리 제목은 [창고등록 리스트] 다 — 한 화면이 등록과 목록을 겸한다'],
    ['외화등록', '우리 제목은 [외화 (통화·고시환율)] 다 — 고시환율까지 한 화면에서 본다'],
    ['생산불출', '생산불출조회 한 화면이 입력(팝업)과 목록을 겸한다'],
    ['프로젝트계획조회', '프로젝트계획 한 화면이 조회를 겸한다'],
    ['발주서입력', '발주서 한 화면이 입력(폼)과 목록을 겸한다'],
    ['발주서조회', '위와 같음'],
    ['기타이동현황', '기타이동 한 화면이 현황을 겸한다'],
    ['매출계획비교표', '매출계획 / 비교표 한 화면이 셋을 겸한다'],
    ['매출계획현황', '위와 같음'],
    ['시리얼/로트No.내역조회', '시리얼/로트No. 관리 한 화면이 내역조회를 겸한다'],
    ['오더관리유형등록', '오더관리유형리스트 한 화면이 등록과 목록을 겸한다'],
    ['판매입력II', '판매입력 한 화면이 겸한다 — 원본 II 는 격자만 간단한 판이다'],
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
      for (const d of src.matchAll(/title:\s*'([^']{2,40})'/g)) text += " '" + d[1] + "'"
    }
    // title={TITLE[side]} · title={cfg.title} 처럼 골라 쓰는 모양도 그 표를 따라간다.
    const ident = text.match(/title=\{(\w+)(?:\s*[.\[][^}]*)?\}/)
    // 같은 파일 안의 공용 화면에 이름을 넘기는 모양(title={title} … <X title="수금현황" />)
    if (ident) for (const d of src.matchAll(/title="([^"]{2,40})"/g)) text += " '" + d[1] + "'"
    if (ident) {
      for (const d of src.matchAll(new RegExp('(?:const|let)\\s+' + ident[1] + '\\b[\\s\\S]{0,400}', 'g'))) {
        // 선언 한 덩어리만 본다 — 줄머리 } 에서 끊는다. 뒤를 통째로 삼키면
        // 엉뚱한 곳의 글자로 통과해 버려 이 검사가 아무것도 재지 않게 된다.
        text += ' ' + d[0].split(/\n\}/)[0]
      }
    }
    // EcListShell 을 안 쓰고 제목을 직접 그리는 화면도 있다(업무일지)
    /*
     * 제목 <b>한 칸</b>과 견준다. 예전에는 모아 놓은 글자에 이름이 들어 있기만 하면
     * 통과였는데, 그러면 겸하는 화면의 긴 제목(거래처별 채권·채무 현황)이 짧은 이름
     * (거래처별채권)을 품어 버려 <b>AR 제목을 엉뚱하게 바꿔도 통과했다.</b> 실제로 그랬다.
     * 그래서 글자값 하나하나와 <b>똑같은지</b>를 본다.
     */
    const literals = [...text.matchAll(/['"]([^'"]{2,40})['"]/g)]
      // 한 제목이 원본 둘을 겸하면 구분자로 이어 붙인다. 조각 하나하나도 이름으로 친다.
      .flatMap((m) => [m[1], ...m[1].split(/[\/|—]/)])
      .map((x) => norm(x))
    const hit = literals.includes(norm(screen))
    if (!hit && norm(src).includes(norm(`>${screen}<`))) continue
    if (!hit) {
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
    /*
     * '잔액 API 가 분해해 주지 않는다' 고 적어 뒀는데 사실이 아니었다 — 분해는 하고 있고
     * 화면에도 열로 있다(LedgerPage). 못 여는 진짜 이유는 아래와 같다.
     */
    ['거래처별채권|기타할인등차액', '잔액에서 나머지로 뽑은 값이라 열어 볼 전표가 없다 — 셈의 결과지 전표가 아니다'],
    ['거래처별채무|기타할인등차액', '위와 같음'],
    ['생산계획_MRP리스트|생성일자', '생성 팝업을 안 만든다'],
    ['회계미반영현황 (구매)|일자-No.', '전표는 구매조회에서 연다'],
    ['회계미반영현황(판매)|일자-No.', '전표는 판매조회에서 연다'],
    ['BOR(작업소요시간)|생산품목코드', '품목은 품목등록에서 연다 — BOR 은 작업 줄만 고친다'],
  ])
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)

  const bad = []
  const stale = []   // 이미 만들었는데 예외로 남아 있는 것
  let checked = 0
  for (const [screen, cols] of Object.entries(cap)) {
    const rel = LINK_MAP.get(screen)
    if (!rel) continue
    const src = pageSource(rel)
    if (!src) continue
    for (const name of cols) {
      const exempt = NO_LINK.has(`${screen}|${name}`)
      if (!exempt) checked++
      /*
       * 그 열의 <td> 안에 누를 것이 있나. 열 이름으로 <th> 를 찾고, 본문에서 같은
       * 값을 그리는 칸에 onClick 이나 <Link> 가 있는지 본다. 화면마다 변수 이름이
       * 달라(p·it·r·w) 값 이름으로 찾는다: {p.code} · {r.name} 처럼.
       */
      const field = /코드$/.test(name) ? 'code' : /명$|이름$/.test(name) ? 'name' : null
      if (!field) { if (!exempt) checked--; continue }
      const re = new RegExp(`<td[^>]*>[\\s\\S]{0,400}?\\{\\w+\.${field}\\}`, 'g')
      const cells = [...src.matchAll(re)].map((m) => m[0])
      const clickable = cells.some((c) => /onClick=|<Link\b/.test(c))
      if (exempt) { if (cells.length > 0 && clickable) stale.push(`링크 [${screen}|${name}] — 이제 누를 수 있다`); continue }
      if (cells.length > 0 && !clickable) {
        bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 [${name}] 은 눌러서 여는 칸이다`)
      }
    }
  }
  eq(`원본이 눌러 여는 칸 ${checked}개를 우리도 누를 수 있다`
    + ` (못 여는 ${NO_LINK.size}개는 이유를 적고 뺐다)`,
    bad.join('\n') || '없음', '없음')
  eq(`링크 예외 ${NO_LINK.size}개가 아직 필요하다`, stale.join('\n') || '없음', '없음')
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
    /* 화면을 가려 적는다 — 등록 화면에는 실제로 있고, 조회 화면에만 없다. */
    /*
     * 사본의 보기 묶음을 다시 뽑으며 드러난 것들.
     * 거래처관리대장 I 의 [구분]은 원장을 <b>얼마나 잘게</b> 볼지다. 우리 움직임 표는
     * 기간을 통째로 한 줄(거래처마다)로 내므로 전표·일·월로 쪼갤 것이 없다.
     */
    ['거래처관리대장 I|전표별', '원장을 전표·일·월 단위로 쪼개지 않는다 — 기간 합계를 거래처마다 한 줄로 낸다'],
    ['거래처관리대장 I|전표별+내역', '위와 같음'],
    ['거래처관리대장 I|일별', '위와 같음'],
    ['거래처관리대장 I|월별', '위와 같음'],
    ['거래처관리대장 I|회계전표별', '위와 같음 — 회계전표 단위 원장도 따로 두지 않는다'],
    ['거래처관리대장 II|전체', '거래처등록 화면이라 채권·채무를 가르지 않는다'],
    ['거래처관리대장 II|채권', '위와 같음'], ['거래처관리대장 II|채무', '위와 같음'],
    ['설문조사조회|사용', '설문 머리말 사용여부는 등록 화면에서 정한다 — 조회 조건이 아니다'],
    ['설문조사조회|사용안함', '위와 같음'],
    ['입고단가(품목) - VAT 제외',
      '우리 입고단가는 매입 전표의 공급가액과 품목 구매단가라 이미 VAT 별도다 — 같은 값이 된다'],
    /*
     * 아래 셋은 <b>화면 하나가 아니라 개념 하나</b>가 없어서 여러 화면에 한꺼번에 나온다.
     * 조건 검사에도 같은 이유가 이미 적혀 있다([내.외자구분]·[발송여부]·[삭제구분]).
     * 화면마다 예외를 적으면 수십 줄이 되므로 여기서 한 번에 뺀다.
     */
    ['차이분석|노무비/경비/외주비차이',
      '우리 이름은 <b>[노무비·경비차이]</b> 다 — 외주비를 따로 잡는 자료가 없어 그 말만 뺐다'
      + '(화면 머리에 이미 적어 둔 이유다). 없는 것을 이름에 넣으면 늘 0 인 칸이 생긴다'],
    ['내자', '국내/수입 구분을 전표에 두지 않는다'],
    ['외자', '위와 같음'],
    /*
     * [발송여부]는 <b>화면마다 뜻이 다르다.</b> 생산 전표에서는 '전표를 메일로 보냈나' 이고,
     * 출하에서는 '물건이 나갔나' 다 — 출하조회는 그 알약을 실제로 가지고 있다.
     * 그래서 통째로 빼지 않고 <b>보낸 적이 없는 화면만</b> 가려 적는다.
     */
    ['생산불출조회|미발송', '전표를 보냈는지(메일·팩스)를 기록하지 않는다'],
    ['생산불출조회|발송', '위와 같음'],
    ['생산입고조회|미발송', '위와 같음'], ['생산입고조회|발송', '위와 같음'],
    ['작업내역조회|미발송', '위와 같음'], ['작업내역조회|발송', '위와 같음'],
    ['작업지시서조회|미발송', '위와 같음'], ['작업지시서조회|발송', '위와 같음'],
    ['판매조회|미발송', '위와 같음'], ['판매조회|발송', '위와 같음'],
    ['구매조회|미발송', '위와 같음'], ['구매조회|발송', '위와 같음'],
    ['출하지시서조회|미발송', '위와 같음'], ['출하지시서조회|발송', '위와 같음'],
    ['구매단가일괄변경|단가변경',
      '우리 일괄변경은 <b>단가만</b> 바꾼다 — 고를 것이 하나뿐이라 보기를 두지 않았다'],
    ['구매단가일괄변경|환율변경', '외화 전표를 만들지 않아 바꿀 환율이 없다'],
    ['판매단가일괄변경|단가변경', '위와 같음'], ['판매단가일괄변경|환율변경', '위와 같음'],
    ['미삭제', '지운 전표를 남겨 두지 않는다 — 지우면 없어진다'],
    ['삭제', '위와 같음'],
  ])

  const bad = []
  const stale = []   // 이미 만들었는데 예외로 남아 있는 것
  let checked = 0
  for (const [screen, groups] of Object.entries(cap)) {
    const rel = RADIO_MAP.get(screen)
    if (!rel) continue
    const src = pageSource(rel)
    if (!src) continue
    const choices = choiceNames(src)
    for (const opts of Object.values(groups)) {
      /*
       * <b>벌이 통째로 없으면 그 벌의 [전체]도 없다.</b>
       * [내.외자구분]·[발송여부]·[삭제구분]처럼 <b>개념 자체가 없어</b> 나머지 보기를
       * 다 뺀 벌은, 첫 보기 [전체]만 남아 "없다" 로 걸린다 — 그 [전체]는 그 벌의 것이지
       * 화면의 것이 아니다. 화면마다 예외를 적는 대신 여기서 함께 뺀다.
       */
      const others = opts.map((o) => o.replace(/^\*/, '')).filter((o) => o !== '전체')
      const groupGone = others.length > 0
        && others.every((o) => NO_OPTION.has(o) || NO_OPTION.has(`${screen}|${o}`))
      for (const raw of opts) {
        const opt = raw.replace(/^\*/, '')
        // 목록에 적어 둔 예외와 <b>규칙으로 빠지는 것</b>을 가른다 — 규칙으로 빠진 것을
        // "예외가 이제 필요 없다" 로 보고하면 지울 줄이 없어 영영 못 지운다.
        const listed = NO_OPTION.has(opt) || NO_OPTION.has(`${screen}|${opt}`)
        const exempt = listed || (opt === '전체' && groupGone)
        if (!exempt) checked++
        // 고르는 자리(알약·option·체크박스·목록 배열)에서만 찾는다.
        const has = choices.has(opt)
        if (exempt) { if (listed && has) stale.push(`보기 [${screen}|${opt}] — 이제 있다`); continue }
        if (!has) bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 보기 [${opt}] 가 없다`)
      }
    }
  }
  eq(`원본 보기 ${checked}개가 우리 화면에도 있다 (안 만든 ${NO_OPTION.size}종은 이유를 적고 뺐다)`,
    bad.join('\n') || '없음', '없음')
  eq(`보기 예외 ${NO_OPTION.size}종이 아직 필요하다`, stale.join('\n') || '없음', '없음')
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
  /**
   * 화면마다 똑같이 붙는 <b>탭 아닌 탭</b>.
   *
   * <p>[기본]은 원본의 <b>저장된 검색조건</b> 탭이다 — 조건을 맞춰 두고 이름을 붙여
   * 저장해 두는 자리(그 옆에 "검색기본값을 설정 후 저장 바랍니다." 안내가 붙는다).
   * 화면의 내용을 가르는 탭이 아니고, 우리는 검색조건 저장 기능 자체가 없다.
   * 화면마다 예외를 열두 개 적는 대신 여기서 한 번에 뺀다.
   */
  const SHELL_TABS = new Set(['기본'])
  const NO_TAB = new Map([
    ['거래처관리대장 II|전체', '조건 판 탭이다(기본/전체) — 거래처등록에는 그 개념이 없다'],
    ['거래처관리대장 II|리스트', '거래처등록 화면 자체가 그 리스트다'],
    ['결제내역조회|강제회계반영', '전표를 강제로 만든 것인지 구분해 두지 않는다 — 반영/미반영뿐이다'],
    ['근태조회|UserPay', '이름만으로 뜻을 못 잡았다 — 사본 값이 비어 있어 무엇을 거르는지 모른다'],
    /*
     * 탭 대조표를 37 → 59화면으로 넓히며 나온 것들. 세 갈래다 —
     * <b>결재·확인 흐름</b>(우리 전표에 그 상태가 없다), <b>화면 구조가 다른 것</b>,
     * 그리고 <b>아직 안 만든 것</b>(품목등록의 여섯 탭). 갈래는 qa/README.md 에 적었다.
     */
    ['발주서|결재중', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['발주서조회|결재중', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['발주서조회|미확인', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['발주서조회|확인', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['발주서조회|진행중', '우리 발주 탭은 <b>더 잘게</b> 나눈다 — 발주요청·발주계획·단가확정·발주확정·입고전환·취소'],
    ['발주서조회|완료', '위와 같음(원본 [완료]는 우리 [입고전환]이다)'],
    ['발주서|미확인', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['발주서|확인', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['창고이동조회|전체', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['A/S접수|전체', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['A/S접수|확인', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['A/S접수조회|전체', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['A/S접수조회|확인', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['생산불출|전체', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['생산불출|결재중', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['생산불출|미확인', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['생산불출|확인', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['창고이동조회|결재중', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['창고이동조회|미확인', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['창고이동조회|확인', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['매출계획|전체', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['매출계획조회|전체', '원본은 <b>결재·확인 흐름</b>의 탭이다 — 우리 전표에는 그 상태가 없다(작업지시·출하와 같은 이유)'],
    ['발주서|진행중', '우리 발주 탭은 <b>더 잘게</b> 나눈다 — 발주요청·발주계획·단가확정·발주확정·입고전환·취소'],
    ['발주서|완료', '위와 같음(원본 [완료]는 우리 [입고전환]이다)'],
    ['매출계획|이력', '결재 이력 탭이다 — 매출계획을 결재에 올리지 않는다'],
    ['매출계획조회|이력', '위와 같음'],
    ['특별단가등록|특별단가그룹', '원본은 <b>그룹 마스터</b>(거래처·창고·품목·품목그룹 설정)라 탭이 그 축이다 — 우리는 품목별 단가 한 축이다'],
    ['특별단가등록|품목별', '원본은 <b>그룹 마스터</b>(거래처·창고·품목·품목그룹 설정)라 탭이 그 축이다 — 우리는 품목별 단가 한 축이다'],
    ['특별단가등록|품목그룹별', '원본은 <b>그룹 마스터</b>(거래처·창고·품목·품목그룹 설정)라 탭이 그 축이다 — 우리는 품목별 단가 한 축이다'],
    ['특별단가등록|적용단가', '원본은 <b>그룹 마스터</b>(거래처·창고·품목·품목그룹 설정)라 탭이 그 축이다 — 우리는 품목별 단가 한 축이다'],
    /*
     * [전체]는 <b>미전송·전송을 함께 보는</b> 탭이다. 그 둘이 없으면 전체도 뜻이 없다.
     * 예전에는 이 탭이 '있다' 고 나왔는데, 조건에 있던 '전체' 라는 <b>안 거른다</b> 보기를
     * 탭으로 잘못 읽은 것이었다(이번에 검사를 고치며 드러났다).
     */
    ['의료기기공급내역보고|전체', '미전송·전송을 함께 보는 탭이라, 그 둘이 없으면 뜻이 없다'],
    ['의료기기공급내역보고|미전송', '<b>대외 전송을 하지 않는다</b> — 심평원 제출 채널·인증서가 없어 산출·보관·이력까지가 범위다(화면 주석에 적혀 있다)'],
    ['의료기기공급내역보고|전송', '<b>대외 전송을 하지 않는다</b> — 심평원 제출 채널·인증서가 없어 산출·보관·이력까지가 범위다(화면 주석에 적혀 있다)'],
    ['품목등록|원가', '표준원가(재료비·경비·노무비·외주비) 칸이 우리 품목에 없다 — 눌러도 빈 탭은 있는 것만 못하다'],
    ['품목등록|부가정보', '원본의 [숫자형추가항목1~10] 자리다 — 우리 품목에 그 칸이 없다'],
    /*
     * 출하 두 화면. 원본은 판매·구매와 같은 <b>확인 상태</b> 탭(결재중·미확인·확인)을
     * 출하에도 붙이는데, 우리 출하 전표에는 그 상태가 없다 — 생산 쪽과 같은 이유다.
     */
    ['출하조회|결재중', '출하 전표를 전자결재에 올리지 않는다'],
    ['출하조회|미확인', '출하 전표에 확인 상태가 없다(판매·구매에만 있다)'],
    ['출하조회|확인', '위와 같음'],
    ['출하지시서조회|결재중', '위와 같음(전자결재)'],
    ['출하지시서조회|미확인', '위와 같음'], ['출하지시서조회|확인', '위와 같음'],
    ['판매입력|판매', '지금 열려 있는 전표 자신을 가리키는 탭이다 — 우리는 보고 있는 화면을 탭으로 두지 않는다'],
    ['판매입력II|판매', '위와 같음'],
    ['판매입력II|할인',
      '원본은 할인(조정) 격자를 <b>탭</b>으로 가른다. 우리는 툴바 [할인]을 눌러 같은 격자를'
      + ' <b>아래에 펴</b> 둔다 — 전표를 보면서 조정을 넣는 편이 오가지 않아도 된다'],
    ['소요시간계산|소요시간계산', '위와 같음 — 계산 화면 자신이다'],
    ['소요시간계산|내역', '계산한 것을 남겨 두지 않는다 — 물을 때마다 다시 센다'],
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
  collectReasons(NO_TAB)

  const bad = []
  const stale = []   // 이미 만들었는데 예외로 남아 있는 것
  let checked = 0
  for (const [screen, tabs] of Object.entries(cap)) {
    if (tabs.length === 2 && tabs[0] === '기본' && tabs[1] === '전체') continue
    const rel = TAB_MAP.get(screen)
    if (!rel) continue
    const src = pageSource(rel)
    if (!src) continue
    const choices = choiceNames(src)
    /*
     * <b>홀로 선 [전체]는 탭이 아니다.</b> '전체' 는 조건마다 있는 <b>안 거른다</b>는 보기라
     * 화면 어디에나 있다 — 매출계획에 원본 [반품구분](전체·일반·반품)을 만들자마자
     * 그 알약을 탭 [전체] 로 읽고 "이제 있다" 고 말했다. 그 탭은 결재·확인 흐름의 것이라
     * 우리에겐 여전히 없는데도.
     *
     * <p>탭 [전체]는 <b>형제 탭과 함께 있거나</b>(출하지시서조회의 전체·진행중·완료),
     * 화면에 <b>탭 줄 자체가 있을 때만</b> 뜻이 있다. 형제 이름을 우리가 달리 지은 화면
     * (발주서조회의 발주요청·발주계획…)은 형제로는 안 잡히지만 탭 줄은 있다 —
     * 우리 탭 줄은 늘 <code>tab</code> 상태가 몬다. 둘 다 없으면 그 '전체' 는
     * 조건의 '안 거른다' 보기다.
     */
    const hasStrip = tabs.some((x) => x !== '전체' && !SHELL_TABS.has(x) && choices.has(x))
      || src.includes('setTab') || src.includes('ec-tab')
    for (const t of tabs) {
      if (SHELL_TABS.has(t)) continue
      const exempt = NO_TAB.has(`${screen}|${t}`)
      if (!exempt) checked++
      const has = t === '전체' ? (choices.has(t) && hasStrip) : choices.has(t)
      if (exempt) { if (has) stale.push(`탭 [${screen}|${t}] — 이제 있다`); continue }
      if (!has) bad.push(`${rel.split('/').pop()}  원본 ${screen} 의 탭 [${t}] 가 없다`)
    }
  }
  eq(`원본 탭 ${checked}개가 우리 화면에도 있다 (안 만든 ${NO_TAB.size}개는 이유를 적고 뺐다)`,
    bad.join('\n') || '없음', '없음')
  eq(`탭 예외 ${NO_TAB.size}개가 아직 필요하다`, stale.join('\n') || '없음', '없음')
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

// ── 1-o) 코드도움이 주는 값과 화면이 거르는 값이 맞나 ────────────────────
console.log('\n■ 코드도움이 주는 값으로 화면이 실제로 거르나')

/*
 * <b>고른 값과 거르는 값이 같은 종류여야 한다.</b> useCondPickers 의 창고·품목·
 * 프로젝트·담당자는 <b>이름</b>을 주는데 거래처만 <b>id</b> 를 줬다. 그래서 조회조건에서
 * 거래처를 고르면 <code>partnerName.includes('12')</code> 가 되어 <b>목록이 통째로 비었다</b> —
 * 고른 사람은 "그 거래처는 거래가 없구나" 로 읽는다. 일곱 화면이 그 상태였다.
 *
 * <p>타입은 둘 다 string 이라 타입체크가 못 잡는다. 그래서 여기서 잡는다:
 * 코드도움이 주는 값이 이름인지, 그리고 화면이 그 값을 이름과 견주는지.
 */
{
  const src = readFileSync(join('frontend', 'src', 'utils', 'useCondPickers.ts'), 'utf8')
  const bad = []
  /*
   * 각 목록이 무엇을 value 로 담는지 본다. 이름이어야 한다 —
   * 화면들이 전부 '이름 부분일치' 로 거르기 때문이다.
   */
  for (const [name, want] of [['warehouses', 'w.name'], ['items', 'x.name'],
    ['projects', 'p.name'], ['employees', 'e.name']]) {
    const m = src.match(new RegExp(`${name}:[\s\S]{0,400}?value: ([\w.]+)`))
    if (m && m[1] !== want) bad.push(`${name} 의 value 가 ${m[1]} 이다 — 이름이어야 한다`)
  }
  // 거래처는 partnerCodeItems(값이 id) 를 쓰므로 이름으로 바꿔 담는지 본다
  if (!/partners: partnerCodeItems\([\s\S]{0,120}?value: x\.name/.test(src)) {
    bad.push('partners 의 value 가 이름이 아니다 — 거래처를 고르면 목록이 빈다')
  }
  eq('코드도움이 이름을 주고 화면이 이름으로 거른다', bad.join('\n') || '없음', '없음')
}

// ── 1-p) 코드도움이 주는 값 ↔ 화면이 거르는 값 (화면별) ──────────────────
console.log('\n■ 코드도움이 주는 값으로 그 화면이 거르나')

/*
 * 앞 검사(1-o)는 공용 코드도움 목록이 <b>무엇을 담는지</b>만 본다. 화면이 인라인으로
 * 만든 목록은 각자 다르다 — <code>value: String(w.id)</code> 로 담아 놓고 이름으로
 * 거르면, 거래처에서 겪은 것과 같이 <b>목록이 통째로 빈다.</b>
 *
 * <p>타입은 둘 다 string 이라 타입체크가 못 잡고, 화면을 열어 골라 봐야만 드러난다.
 * 그래서 코드도움마다 <b>담는 값의 종류</b>와 <b>거르는 방식</b>을 맞춰 본다.
 */
{
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)
  const bad = []
  let checked = 0
  for (const f of walk(join('frontend', 'src', 'pages')).filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(f, 'utf8').replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ')
    for (const m of src.matchAll(/<CodePickerField[\s\S]{0,700}?\/>/g)) {
      const block = m[0]
      const val = block.match(/value=\{([\w.]+)\}/)
      if (!val) continue
      const path = val[1]
      const shared = /items=\{pickers\.\w+\}/.test(block)   // 공용 목록 = 이름
      const byId = /value: String\(/.test(block)
      if (!byId && !shared) continue
      const lines = src.split('\n')
        .filter((l) => new RegExp(escRe(path) + '\\b').test(l) && /filter|includes|===/.test(l))
        .filter((l) => !/CodePickerField|setC\(|useState|value=\{/.test(l))
      if (!lines.length) continue
      checked++
      const nameCmp = lines.some((l) => /(Name|\.name)[\s\S]{0,24}?\.includes\(|(Name|\.name)\s*===/.test(l))
      const idCmp = lines.some((l) => /String\([\w.]+\.\w*[iI]d\)|\bid\b\s*===|Number\(/.test(l))
      if (byId && nameCmp && !idCmp) bad.push(`${f.split(sep).pop()}  [${path}] 은 id 를 받는데 이름으로 거른다`)
      if (shared && idCmp && !nameCmp) bad.push(`${f.split(sep).pop()}  [${path}] 은 이름을 받는데 id 로 거른다`)
    }
  }
  eq(`코드도움 ${checked}곳이 받은 값 그대로 거른다`, bad.join('\n') || '없음', '없음')
}

// ── 1-q) 고를 수는 있는데 아무 일도 안 하는 조건 ─────────────────────────
console.log('\n■ 조건 칸에 넣은 값이 실제로 쓰이나')

/*
 * <b>조건을 걸어도 결과가 그대로면</b> 사람은 자기가 잘못 골랐다고 생각한다.
 * 눌러도 아무 일 없는 버튼과 같은 종류의 거짓말인데 이쪽이 더 조용하다 —
 * 목록이 안 바뀌는 것뿐이라 화면은 멀쩡해 보인다.
 *
 * <p>조건 칸(EcCond)에 묶인 상태가 <b>그 칸 밖에서 한 번이라도 쓰이는지</b>만 본다.
 * 거르는 방식이 화면마다 달라(부등호·객체 속성·함수 인자·의존성 배열) 좁게 잡으면
 * 멀쩡한 조건을 죽었다고 한다. 별칭(const f = filters)과 인자(c: typeof cond)는 푼다.
 */
{
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c)
  const bad = []
  let checked = 0
  for (const f of walk(join('frontend', 'src', 'pages')).filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(f, 'utf8')
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
    for (const m of src.matchAll(/<EcCond[\s\S]{0,700}?<\/EcCond>/g)) {
      const block = m[0]
      const label = (block.match(/label=\{?["'`]([^"'`]{1,20})/) ?? [])[1] ?? '?'
      for (const v of block.matchAll(/(?:value|checked)=\{([\w.]+)\}/g)) {
        const path = v[1]
        if (/^(true|false)$/.test(path)) continue
        const [base, prop] = path.includes('.') ? path.split('.') : [path, null]
        // 조건 상태만 본다 — 보기 목록을 그리는 콜백 변수(a.id 같은 것)는 상태가 아니다
        if (!new RegExp('const \\[\\s*' + escRe(base) + '\\b').test(src)) continue
        const names = [path]
        for (const al of src.matchAll(new RegExp('const (\\w+) = ' + escRe(base) + '\\b', 'g'))) {
          names.push(prop ? al[1] + '.' + prop : al[1])
        }
        for (const al of src.matchAll(new RegExp('(\\w+): typeof ' + escRe(base) + '\\b', 'g'))) {
          names.push(prop ? al[1] + '.' + prop : al[1])
        }
        const uses = src.split(String.fromCharCode(10))
          .filter((l) => names.some((nm) => new RegExp(escRe(nm) + '\\b').test(l)))
          .filter((l) => !/useState|<EcCond|value=\{|checked=\{|setC\(|onChange|reset|다시 작성/.test(l))
        checked++
        if (uses.length === 0) bad.push(`${f.split(sep).pop()}  조건 [${label}] 의 값이 어디에도 안 쓰인다`)
      }
    }
  }
  eq(`조건 ${checked}개가 넣은 값을 실제로 쓴다`, bad.join('\n') || '없음', '없음')
}

// ── 1-r) 거른 목록을 그리면서 "자료 없음"은 거르기 전을 보나 ─────────────
console.log('\n■ 자료 없음 문구가 화면에 그려지는 그 목록을 보고 있나')

/*
 * <b>조건에 아무것도 안 걸리면 아무 말 없는 빈 표가 나온다.</b>
 * 목록은 걸러진 것(<code>shown</code>)을 그리는데 "자료가 없습니다" 판단은
 * <b>거르기 전(<code>rows</code>)</b> 을 보고 있으면, 자료는 있고 조건에만 안 걸릴 때
 * 문구도 줄도 없는 <b>텅 빈 표</b>가 뜬다. 사람은 화면이 덜 그려진 줄 안다.
 *
 * <p>수집데이터등록에 [데이터명] 조건을 만들다가 실제로 낼 뻔했다 — 거르는 줄을
 * 넣으면서 그 위의 <code>rows.length === 0</code> 을 같이 못 고쳤다.
 * 조건을 새로 다는 화면마다 되풀이될 실수라 못 박는다.
 *
 * <p>비었나 보는 배열이 <b>그리는 배열의 뿌리</b>이고 <b>거르지 않으면</b> 넘어간다 — 묶어 그리거나
 * (<code>groupByCategory(summary)</code>) 줄로 펼치는(<code>lineRows</code>) 경우는
 * 뿌리가 비면 그리는 쪽도 비므로 문구가 제대로 뜬다.
 */
{
  const bad = []
  let checked = 0
  for (const f of walk(join('frontend', 'src', 'pages')).filter((x) => x.endsWith('.tsx'))) {
    const src = readFileSync(f, 'utf8')
    const flat = src.replace(/[ \t]*\n[ \t]*/g, ' ')
    for (const m of flat.matchAll(/(\w+)\.length === 0 \? \(.{0,300}?\) : (\w+)\.map\(/g)) {
      const [, empty, drawn] = m
      checked++
      if (empty === drawn) continue
      // 그리는 것이 비었나 보는 것에서 갈라져 나왔나 (뿌리면 문구가 제대로 뜬다)
      const i = src.indexOf('const ' + drawn + ' =')
      // 창을 다음 선언 앞에서 끊는다 — 고정 길이로 자르면 옆 선언의 .filter( 까지 먹는다
      const end = i < 0 ? -1 : src.indexOf('\n  const ', i + 10)
      const from = i < 0 ? '' : src.slice(i, end < 0 ? i + 900 : end)
      // 거르면 뿌리가 차 있어도 그리는 쪽은 빌 수 있다 — 그 때가 바로 텅 빈 표다
      if (i >= 0 && new RegExp('\\b' + empty + '\\b').test(from) && !/\.filter\(|\.slice\(/.test(from)) continue
      bad.push(`${f.split(sep).pop()}  그리는 건 ${drawn} 인데 비었나 보는 건 ${empty} 다`)
    }
  }
  eq(`자료 없음 문구 ${checked}개가 그려지는 그 목록을 본다`, bad.join('\n') || '없음', '없음')
}

// ── 1-s) 표에는 찍는데 거를 수는 없는 값 ─────────────────────────────────
console.log('\n■ 원본이 조건으로도 두는 값을 우리는 거를 수 있나')

/*
 * <b>보이는데 못 고른다.</b> 원본이 그 이름을 화면 머리의 조건으로 두는데 우리는
 * 표의 열로만 갖고 있으면, 그 값으로 좁힐 길이 없어 목록 전체를 눈으로 훑어야 한다.
 * 열이 늘수록, 행이 늘수록 더 나빠진다.
 *
 * <p>이 구멍이 여태 안 보인 것은 <b>한 파일이 입력 화면과 조회 화면을 겸하기</b>
 * 때문이다 — 조건 검사는 이름표만 찾는데, 입력 폼의 <code>&lt;th&gt;제목&lt;/th&gt;</code> 이
 * 조회 화면의 조건 자리를 대신 채워 줬다. A/S접수에 [제목]·[수리예정일자] 를 만들고도
 * <b>거르는 길을 안 냈는데 검사가 초록불이었다.</b>
 *
 * <p>그래서 여기서는 <b>&lt;thead&gt; 안의 열머리만</b> 센다(입력 폼의 &lt;th&gt; 는 이름표다).
 * 화면 이름에 입력·작성·등록·생성·선택이 든 것은 통째로 건너뛴다 — 그 이름들은
 * 거르는 조건이 아니라 <b>채워 넣는 칸</b>이다.
 */
{
  /** 그 자리가 등록 창(Modal) 안인가 — 창 안의 이름표는 조건이 아니라 채워 넣는 칸이다. */
  const inModal = (flat, at) => {
    for (const m of flat.matchAll(/<Modal/g)) {
      if (m.index > at) break
      // 그 <Modal 이 아직 안 닫혔으면 안쪽이다
      const close = flat.indexOf('</Modal>', m.index)
      if (close < 0 || close > at) return true
    }
    return false
  }
  const FIELDS = JSON.parse(readFileSync(join('qa', 'fixtures', 'ecount-form-fields.json'), 'utf8'))
  const MISS_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))
  /** 거를 수 있는데 <b>이름이 달라</b> 안 잡히는 자리 — 왜 그 이름인지 적는다. */
  const NAMED_DIFFERENTLY = new Map([
    ['거래처별채권|구분',
      '한 파일이 <b>세 화면을 겸하는데 원본이 같은 칸을 두 이름으로 부른다</b> —'
      + ' 거래처별채권·채무에서는 [구분], 거래처관리대장 I 에서는 [집계구분] 이다.'
      + ' 하는 일이 <b>거래처별|담당자별</b> 로 모아 보는 것이라 뜻이 또렷한 쪽을 골랐다'],
    ['거래처별채무|구분', '위와 같음'],
  ])
  const bad = []
  let checked = 0
  for (const [screen, names] of Object.entries(FIELDS)) {
    const rel = MISS_MAP.get(screen)
    if (!rel) continue
    if (/입력|작성|등록|생성|선택/.test(screen)) continue
    const src = pageSource(rel)
    const flat = src.replace(/\s*\n\s*/g, '')
    const thead = (flat.match(/<thead>[\s\S]*?<\/thead>/g) ?? []).join('')
    const heads = new Set([...thead.matchAll(/<th\b[^>]*>([^<{]{1,14})<\/th>/g)].map((m) => m[1].trim()))
    for (const n of names) {
      if (!heads.has(n)) continue
      if (NAMED_DIFFERENTLY.has(screen + '|' + n)) continue
      checked++
      /*
       * 조건 이름표를 그리는 <b>세 가지 관용구</b>를 다 본다. 하나라도 빠뜨리면
       * 멀쩡히 거르고 있는 화면을 "못 거른다" 고 한다 — 업무일지가 그랬다.
       * 그 화면은 <code>&lt;div class="title"&gt;요일&lt;/div&gt;</code> 로 이름표를 그리는데,
       * EcCond 와 &lt;span&gt; 만 찾고 있어서 조건 다섯을 통째로 못 봤다.
       */
      const asCond = new RegExp('EcCond[^>]{0,90}label=["\']' + n + '["\']|<span[^>]*>' + n
        // 이름표 뒤에 오는 것이 칸 하나일 수도, <b>알약 묶음(div 안의 button)</b>일 수도 있다
        + '</span>[^<]{0,4}<(input|select|CodePickerField|div[^>]{0,200}>[\\s\\S]{0,400}?<button)'
        + '|<div className="title">' + n + '</div>'
        + '|\\blabel\\(\\s*[\'"]' + n + '[\'"]'
        + '|<label[^>]*>' + n + '</label>'
        // 기간 조건은 EcStatusPanel 이 dateLabel 로 이름을 받는다(출하지시서현황 [일자]).
        + '|dateLabel="' + n + '"')
      /*
       * <b>같은 &lt;th&gt; 라도 어디 있느냐로 뜻이 갈린다.</b> 등록 창(Modal) 안의
       * <code>&lt;th&gt;제목&lt;/th&gt;</code> 은 <b>채워 넣는 칸</b>이고, 창 밖의 것은
       * 조건 판의 <b>이름표</b>다(설문조사현황·거래처관리대장이 그렇게 그린다).
       * 이걸 안 가르면 둘 중 하나가 된다 — 창 안까지 세면 검사가 아무것도 못 잡고,
       * 아예 안 세면 멀쩡히 거르는 화면을 못 거른다고 한다. 실제로 둘 다 겪었다.
       */
      const noHead = flat.replace(/<thead>[\s\S]*?<\/thead>/g, (m) => ' '.repeat(m.length))
      /*
       * 코드도움은 <b>스스로 이름표를 그린다</b>(hideLabel 을 안 준 자리). 증빙센터 [작업자]가
       * 그렇게 서 있는데 못 보고 "거를 수 없다" 고 했다. <code>&lt;th&gt;</code> 와 같은 규칙 —
       * 등록 창 밖의 것만 조건으로 친다.
       */
      const asThLabel = [...noHead.matchAll(new RegExp(
        '<th\\b[^>]*>' + n + '\\s*\\*?</th>|<CodePickerField[^>]{0,60}label="' + n + '"', 'g'))]
        .some((m) => !inModal(flat, m.index) && !/hideLabel/.test(m[0]))
      if (!asCond.test(flat) && !asThLabel) bad.push(`${rel.split('/').pop()}  ${screen} [${n}] — 열로는 찍는데 거를 수 없다`)
    }
  }
  const TODO = JSON.parse(readFileSync(join('qa', 'fixtures', 'pending-see-only.json'), 'utf8'))
  const grown = bad.filter((x) => !TODO.includes(x))
  const gone = TODO.filter((x) => !bad.includes(x))
  eq(`원본이 조건으로도 두는 열 ${checked}개 가운데 새로 못 거르게 된 것이 없다`,
    grown.join('\n') || '없음', '없음')
  eq('만들어 놓고 목록에 남겨 둔 것이 없다', gone.join('\n') || '없음', '없음')
}


// ── 1-t) 예외에 적어 둔 이유가 아직 사실인가 ────────────────────────────
console.log('\n■ 못 만든다고 적어 둔 이유가 아직 사실인가')

/*
 * <b>이유는 적을 때는 맞지만 코드가 자라면 거짓이 된다.</b>
 *
 * <p>실제로 네 번 그랬다 — '코드를 가진 몰 마스터가 없다'(그 사이 쇼핑몰계정등록이 생겼다),
 * '거래처 관계 마스터가 없다'(대표거래처가 생겼다), '기간 빠른선택에 그 조합을 두지
 * 않았다'(진작 있었다), '검사요청 전표에 프로젝트 칸이 없다'(검사에는 있었다).
 * 넷 다 <b>사람이 우연히</b> 다시 읽어서 알았다. 아무도 안 읽으면 그 항목은 영영 안 만들어진다.
 *
 * <p>그래서 이유마다 <b>그 주장의 증거</b>를 함께 적는다 — "이 이름이 코드에 없다" 는 식으로.
 * 그 이름이 생기면 검사가 <b>다시 재 보라</b>고 말한다. 이유를 지우라는 뜻이 아니라,
 * 전제가 바뀌었으니 그 자리에서 판단을 새로 하라는 뜻이다.
 *
 * <p><b>증거는 이유가 하는 말과 맞아야 한다.</b> '계산 결과에서 작업지시서를 만들지 않는다'
 * 에 <code>'/work-orders'</code> 를 증거로 달았더니, 그 화면이 작업지시를 <b>읽기만</b> 하는
 * 자리에서 걸렸다 — 만드는 것과 읽는 것을 못 가린 증거였다. 늑대를 잘못 부르는 검사는
 * 곧 아무도 안 본다. 주제가 아니라 <b>주장</b>에 맞는 이름을 골라야 한다.
 *
 * <p>모든 이유에 증거를 달 수는 없다. '사본에 그 격자의 줄이 없다' 처럼 <b>원본을 두고 하는
 * 말</b>이나 '화면 위 버튼 하나로 연다' 처럼 <b>우리가 그렇게 정한 것</b>은 코드로 잴 수 없다.
 * 잴 수 있는 것만 적는다.
 */
{
  const witnesses = JSON.parse(readFileSync(join('qa', 'fixtures', 'reason-witnesses.json'), 'utf8'))
  const cache = new Map()
  const treeText = (where) => {
    if (cache.has(where)) return cache.get(where)
    const roots = where === 'backend' ? ['backend/src/main/java']
      : where === 'frontend' ? ['frontend/src']
        : where === 'both' ? ['backend/src/main/java', 'frontend/src']
          : [where]
    let all = ''
    for (const r of roots) {
      if (!existsSync(r)) continue
      /* 파일 하나를 가리켜도 된다 — 그 화면에만 있으면 되는 이름이 있다. */
      if (!statSync(r).isDirectory()) { all += readFileSync(r, 'utf8'); continue }
      for (const f of walk(r)) {
        if (!/[.](java|ts|tsx)$/.test(f)) continue
        all += readFileSync(f, 'utf8')
      }
    }
    cache.set(where, all)
    return all
  }

  /*
   * <b>이유는 두 가지를 주장한다.</b> "…가 없다"(없음)와 "우리는 이렇게 한다"(있음).
   * 뒤엣것도 거짓일 수 있다 — '줄마다 상태를 고친다' 고 적힌 화면 <b>둘</b>에 실제로는
   * 줄 버튼이 하나도 없었다(출하조회·건설예정공정표). 없음만 재면 그 거짓말을 못 잡는다.
   *
   * <p>그래서 <code>present</code> 로 <b>그 화면 파일에 있어야 할 것</b>도 적는다.
   * 화면은 이름으로 지도(.ordermap)를 거쳐 찾는다 — 다른 파일을 가리켜야 하면 file 로 적는다.
   */
  const SCREEN_MAP = new Map(JSON.parse(readFileSync(join('qa', 'fixtures', '.ordermap.json'), 'utf8')))

  const stale = []
  let checked = 0
  for (const [key, w] of Object.entries(witnesses)) {
    for (const name of w.absent ?? []) {
      checked++
      if (treeText(w.in).includes(name)) {
        stale.push(`[${key}] — "${w.claim}" 라고 적어 뒀는데 코드에 <${name}> 가 생겼다. 다시 재 보세요`)
      }
    }
    if (w.present) {
      const rel = w.file ?? SCREEN_MAP.get(key.slice(0, key.indexOf('|')))
      const src = rel ? pageSource(rel) : null
      for (const name of w.present) {
        checked++
        if (!src) {
          stale.push(`[${key}] — 그 화면 파일을 못 찾아 이유를 잴 수 없다(${rel ?? '지도에 없음'})`)
        } else if (!src.includes(name)) {
          stale.push(`[${key}] — "${w.claim}" 라고 적어 뒀는데 그 화면에 <${name}> 가 없다. 이유가 사실이 아니다`)
        }
      }
    }
  }
  eq(`이유의 근거 ${checked}개가 아직 사실이다 (예외 ${Object.keys(witnesses).length}종)`,
    stale.join('\n') || '없음', '없음')

  /*
   * <b>증거 없는 이유가 늘지 않게 한다.</b>
   *
   * <p>증거는 손으로 단다. 새로 적는 이유에 아무도 안 달면 낡은 이유가 다시 쌓인다 —
   * 여덟 판에 일곱 개가 그렇게 쌓여 있었다. 그래서 <b>수</b>를 세어 못 박는다.
   * 예외를 새로 적으려면 증거를 같이 달거나, 못 재는 이유라면 이 수를 손으로 올리며
   * <b>왜 못 재는지</b>를 커밋에 적게 된다. 줄이는 것은 언제든 좋다.
   */
  const cap = JSON.parse(readFileSync(join('qa', 'fixtures', 'unwitnessed-reasons.json'), 'utf8'))
  /*
   * <b>없는 이유에 증거를 달면 아무것도 안 재게 된다.</b> 키를 한 글자 틀리면 그 증거는
   * 영원히 조용하다 — 통과했다고 안심하는데 실은 재는 것이 없다. 반대 방향으로 한 번 건다.
   */
  const ghosts = Object.keys(witnesses).filter((k) => !ALL_REASON_KEYS.has(k))
  eq(`증거를 단 이유 ${Object.keys(witnesses).length}개가 다 실제 예외다`,
    ghosts.join(', ') || '없음', '없음')

  const withoutWitness = [...ALL_REASON_KEYS].filter((k) => !witnesses[k])
  eq(`증거 없는 이유가 ${cap.gap}개를 넘지 않는다 (지금 ${withoutWitness.length}개 · 예외 ${ALL_REASON_KEYS.size}종)`,
    withoutWitness.length <= cap.gap ? '없음'
      : `${withoutWitness.length - cap.gap}개 늘었다 — 증거를 달거나 그 수를 올리세요`, '없음')
}

console.log('\n' + '─'.repeat(50))
console.log(`통과 ${pass} · 실패 ${fail}`)
if (fail) process.exit(1)
console.log('전부 통과했습니다.')
