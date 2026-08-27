/**
 * 화면에서 <b>볼 수는 있는데 정할 수는 없는</b> 값을 찾는다.
 *
 * <p>같은 실수를 세 번 했다. 엔티티에 필드를 만들고 응답 DTO 에도 실었는데,
 * <b>등록·수정 요청 record 에만 빠뜨린</b> 것이다. 그러면 화면은 값을 보내는데
 * 서버가 조용히 버리고, 그 칸은 영원히 빈 채로 남는다. 아무도 에러를 못 본다.
 *
 *   - 거래처그룹  → 채권/채무현황의 그룹 소계가 늘 '(미지정)' 하나였다
 *   - 판매단가그룹 → 특별단가의 '그룹별' 이 걸릴 일이 없었다
 *   - 구매단가그룹 → 같은 이유
 *
 * <p>세 번 다 사람이 우연히 발견했다. 컴파일도 타입체크도 통과한다 —
 * record 에 없는 필드는 JSON 에서 그냥 무시되기 때문이다.
 *
 * <h3>재는 방법</h3>
 * 셋이 <b>모두</b> 맞을 때만 문제로 본다.
 *   1. 같은 stem 으로 {@code Create…Request} · {@code Update…Request} · {@code …Response}
 *      가 다 있다 (즉 사람이 등록·수정하는 마스터다. 조회 전용 DTO 는 건너뛴다)
 *   2. 그 stem 의 <b>엔티티에 저장되는 필드</b>다 ({@code @Column} 또는 {@code @JoinColumn})
 *      — 파생값·표시이름은 엔티티에 없으므로 여기서 걸러진다
 *   3. 두 요청 record 어디에도 없다
 *
 * 실행: node qa/dto-check.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'backend/src/main/java/com/erp'

/**
 * 저장되지만 <b>사람이 정하지 않는</b> 것들. 서버가 매기거나 다른 흐름이 바꾼다.
 *
 * <p>이유 없이 넣지 말 것 — 넣는 순간 그 이름은 어느 엔티티에서든 이 검사에서 빠진다.
 */
const SERVER_OWNED = new Map([
  ['id', '서버가 매긴다'],
  ['createdAt', 'BaseTimeEntity'],
  ['updatedAt', 'BaseTimeEntity'],
  ['createdBy', '로그인 사용자에서 채운다'],
  ['updatedBy', '로그인 사용자에서 채운다'],
  ['docNo', 'DocumentNoGenerator 가 매긴다'],
  ['orderNo', 'DocumentNoGenerator 가 매긴다'],
  ['quoteNo', 'DocumentNoGenerator 가 매긴다'],
  ['prodNo', 'DocumentNoGenerator 가 매긴다'],
  ['shipNo', 'DocumentNoGenerator 가 매긴다'],
  ['adjustNo', 'DocumentNoGenerator 가 매긴다'],
  ['invoiceNo', 'DocumentNoGenerator 가 매긴다'],
  ['postNo', '게시글번호는 max+1 로 매긴다'],
  ['status', '전용 엔드포인트(PATCH …/status)로 바꾼다'],
  ['confirmStatus', '전용 엔드포인트로 바꾼다'],
  ['confirmedAt', '확정할 때 서버가 찍는다'],
  ['accountingReflected', '회계반영에서 바꾼다'],
  ['producedQty', '생산실적이 쌓아 올린다'],
  ['shippedQty', '출하가 쌓아 올린다'],
  ['supplyAmount', '라인에서 계산한다'],
  ['vatAmount', '라인에서 계산한다'],
  ['totalAmount', '라인에서 계산한다'],
  ['totalQuantity', '라인에서 계산한다'],
  ['balanceAfter', '재고 반영 결과다'],
  ['writer', '게시글 작성자 — 로그인 사용자에서 채운다'],
  ['code', '프로젝트코드처럼 서버가 매기는 곳이 있다. 품목·거래처는 Create 에 있어 여기 걸리지 않는다'],
])

function javaFiles(dir, suffix) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...javaFiles(p, suffix))
    else if (e.endsWith(suffix)) out.push(p)
  }
  return out
}

/** 엔티티 이름 → 저장되는 필드 이름 집합. */
function entityFields() {
  const m = new Map()
  for (const f of javaFiles(ROOT, '.java')) {
    const src = readFileSync(f, 'utf8')
    if (!/@Entity\b/.test(src)) continue
    const cls = f.replace(/\\/g, '/').split('/').pop().replace('.java', '')
    const fields = new Set()
    // @Column / @JoinColumn 이 붙은 바로 다음 필드 선언의 이름
    const re = /@(?:Column|JoinColumn)[^\n]*\n(?:\s*@[^\n]*\n)*\s*(?:private|protected)\s+[\w.<>,\[\]\s]+?\s+(\w+)\s*[;=]/g
    let x
    while ((x = re.exec(src))) fields.add(x[1])
    m.set(cls, fields)
  }
  return m
}

/** record 이름 → 항목 이름 목록. */
function records(src) {
  const out = new Map()
  const re = /public record (\w+)\s*\(/g
  let m
  while ((m = re.exec(src))) {
    let depth = 1
    let i = re.lastIndex
    while (i < src.length && depth > 0) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') depth--
      i++
    }
    const clean = src.slice(re.lastIndex, i - 1)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      // 문자열을 먼저 지운다. 검증 메시지에 괄호가 들어 있으면
      // (예: "대상 화면(entityType)을 지정하세요.") 아래 애노테이션 제거가 어긋나
      // 그 record 의 항목을 통째로 잘못 읽는다 — 실제로 FieldDef 에서 그랬다.
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/@\w+(\([^)]*\))?/g, ' ')
    const names = []
    let d = 0
    let cur = ''
    for (const ch of clean) {
      if (ch === '<' || ch === '(') d++
      else if (ch === '>' || ch === ')') d--
      if (ch === ',' && d === 0) { names.push(cur); cur = '' } else cur += ch
    }
    names.push(cur)
    out.set(m[1], names
      .map((x) => x.trim().split(/\s+/).pop())
      .filter((x) => x && /^[a-z]\w*$/.test(x)))
  }
  return out
}

const entities = entityFields()

/**
 * DTO stem 으로 엔티티를 찾는다.
 *
 * <p>이름이 늘 같지는 않다 — Partner 의 엔티티는 <b>BusinessPartner</b> 다.
 * 그래서 stem 으로 끝나는 엔티티도 본다. 처음엔 정확히 같은 이름만 찾다가
 * 정작 이 검사를 만들게 한 그 버그(거래처 단가그룹)를 놓쳤다.
 *
 * <p>둘 이상이 걸리면 어느 쪽인지 알 수 없으므로 판단을 미룬다 —
 * 틀린 엔티티로 재면 없는 문제를 만들어 낸다.
 */
function resolveEntity(stem) {
  const exact = entities.get(stem)
  if (exact) return exact
  const ends = [...entities.keys()].filter((k) => k.endsWith(stem))
  return ends.length === 1 ? entities.get(ends[0]) : null
}
let problems = 0
let checked = 0

for (const file of javaFiles(ROOT, 'Dtos.java')) {
  const recs = records(readFileSync(file, 'utf8'))
  for (const [name, fields] of recs) {
    if (!name.endsWith('Response')) continue
    const stem = name.replace(/Response$/, '')
    const create = recs.get(`Create${stem}Request`)
    const update = recs.get(`Update${stem}Request`)
    // 등록·수정이 둘 다 있어야 '사람이 관리하는 마스터' 다. 조회 전용은 건너뛴다.
    if (!create || !update) continue
    const stored = resolveEntity(stem)
    if (!stored) continue

    checked++
    const settable = new Set([...create, ...update])
    const missing = fields.filter((f) =>
      stored.has(f) && !settable.has(f) && !SERVER_OWNED.has(f))
    if (missing.length > 0) {
      problems++
      console.log(`  ❌ ${stem} — 응답에 있고 엔티티에 저장되는데 등록·수정에서 정할 수 없다`)
      console.log(`     ${missing.join(', ')}   (${file.replace(/\\/g, '/').replace(ROOT + '/', '')})`)
    }
  }
}

console.log('─'.repeat(50))
console.log(`등록·수정하는 마스터 ${checked}개 검사 · 문제 ${problems}개`)
if (problems > 0) {
  console.log('\n볼 수는 있는데 정할 수 없는 값입니다. 요청 record 에 넣거나,')
  console.log('서버가 매기는 값이면 SERVER_OWNED 에 이유와 함께 넣으세요.')
  process.exitCode = 1
} else {
  console.log('전부 정할 수 있습니다.')
}
