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
 *   1. 같은 stem 으로 {@code Create…Request} 와 {@code …Response} 가 있다
 *      (즉 사람이 만드는 것이다. 조회 전용 DTO 는 건너뛴다)
 *      <b>{@code Update…Request} 는 있으면 같이 본다.</b> 예전에는 그것까지 있어야만
 *      쟀는데, 우리 큰 전표들은 수정도 {@code Create…Request} 를 그대로 받는다
 *      (PUT /sales/{id} 가 CreateSalesRequest 를 받는다). 그 바람에 판매·구매·수주·발주·
 *      견적·출하·생산 같은 <b>가장 큰 것들이 통째로 검사 밖</b>에 있었다 — 재는 마스터가
 *      28개였고, 넓히니 55개다(2026-09-10).
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
  ['viewCount', '글을 펼 때 서버가 하나씩 올린다(POST …/read) — 사람이 정하면 그 숫자가 조회수가 아니게 된다'],
  ['status', '전용 엔드포인트(PATCH …/status)로 바꾼다'],
  ['completedAt', '진행상태를 완료로 바꿀 때 서버가 찍는다(PATCH …/status) — 되돌리면 지운다. 등록·수정에서 정하면 진행중인데 완료일시가 있는 줄이 생긴다'],
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
/**
 * <b>그 stem 에서만</b> 사람이 정하지 않는 것. 이름을 위 SERVER_OWNED 에 넣으면
 * <b>어느 엔티티에서든</b> 그 이름이 빠지므로(품목·거래처의 active 까지 안 재게 된다)
 * 한 화면에서만 서버가 채우는 값은 여기 적는다.
 */
const OWNED_HERE = new Map([
  ['Item|expenseStdCost', '품목등록 [원가] 탭 경비표준원가 — 원본 창에서 잠긴 칸(0, 2026-10-20 C000029 실측). 원가 쪽이 채운다'],
  ['Item|laborStdCost', '품목등록 [원가] 탭 노무비표준원가 — expenseStdCost 와 같다'],
  ['Item|subcontractStdCost', '품목등록 [원가] 탭 외주비표준원가 — expenseStdCost 와 같다'],
  ['OrderNumber|completed', '오더관리진행단계(E040904) [전체단계완료] — 확인 \'선택한 오더관리번호를 종결 하겠습니까?\' 뒤 POST …/complete(CompleteOrderNumbersRequest)가 완료로 바꾼다. 등록 · 수정 창에는 칸이 없다'],
  ['ProjectPlan|planRevenue', '프로젝트계획(E040636) 항목 01 판매 계획 줄 [금액] 의 합 — 계획 입력 창(POST · PUT /project-plans/…/lines)이 바꾸고 서버가 다시 적는다(원본 등록 창 판에는 금액 칸이 없다, 2026-10-14 실측)'],
  ['ProjectPlan|planPurchase', '항목 02 구매 계획 줄 [금액] 의 합 — planRevenue 와 같다'],
  ['ProjectPlan|planLabor', '항목 03 노무비 계획 줄 [금액] 의 합 — planRevenue 와 같다'],
  ['ProjectPlan|planExpense', '항목 04 경비 계획 줄 [금액] 의 합 — planRevenue 와 같다'],
  ['Expense|settledJournalId', '전표별회계반영(비용) E060814 [가지급금정산서작성] → POST /expenses/settle 이 만든 가지급금정산서 회계전표 — 비용내역 등록 · 수정 창에는 칸이 없다(2026-10-20 실측, plans/회계2/비용관리.md 4장)'],
  ['Expense|slipDocNo', '비용내역입력 전표 한 장의 번호 — POST /expenses/slip 이 매기고 줄마다 같은 값을 적는다(원본 \'2026/10/20 -2\', 2026-10-20 실측)'],
  ['Expense|lineNo', '전표 안 줄 차례 — POST · PUT /expenses/slip 의 lines 순서로 서버가 적는다'],
  ['Expense|allocAmount', '비용내역입력 줄 [배부액] — 전표 한 장 요청(SlipRequest.lines)에서 정한다. 옛 한 줄 등록(CreateExpenseRequest)에는 칸이 없다'],
  ['Expense|amount1', '줄 [금액1] — allocAmount 와 같다(SlipLine)'],
  ['Expense|amount2', '줄 [금액2] — allocAmount 와 같다(SlipLine)'],
  ['Expense|memo1', '줄 [적요1] — allocAmount 와 같다(SlipLine)'],
  ['Expense|memo2', '줄 [적요2] — allocAmount 와 같다(SlipLine)'],
  ['Expense|memo3', '줄 [적요3] — allocAmount 와 같다(SlipLine)'],
  ['Expense|bankAccountId', '머리 [출금계좌] — 전표 한 장 요청(SlipRequest)에서 정한다'],
  ['Lot|useYn', '시리얼/로트No.등록 목록 · 수정 창 [사용중단/재사용] 전용 자리(POST /lots/use)에서 정한다 — 원본 생성 · 수정 창에는 사용구분 칸이 없다(2026-10-13 실측, plans/재고2/E040617.md)'],
  ['Bill|salesCreated', '청구예정자료의 판매생성여부 — 회계/판매일괄반영(원본 E060906)이 켠다. 청구자료생성 · 수정 창에는 그 칸이 없다(2026-10-13 실측)'],
  ['Bill|accountingReflected', '청구예정자료의 회계반영여부 — 회계/판매일괄반영(원본 E060906)이 켠다. 청구자료생성 · 수정 창에는 그 칸이 없다'],
  ['ScheduleEvent|repeatGroup', '반복설정으로 펼쳐 넣을 때 서버가 묶음 값을 매긴다 — 등록 요청의 repeat 에서 나온다(원본 E070201 반복설정 창)'],
  ['ScheduleEvent|repeatRule', '등록 요청 repeat.summary(원본 요약보기 글)를 서버가 펼친 줄마다 찍는다 — 우리는 고칠 때 반복을 다시 펼치지 않는다'],
  ['SupplyUsage|repeatGroup', '공용품관리 반복설정으로 펼쳐 넣을 때 서버가 묶음 값을 매긴다 — 등록 요청의 repeat 에서 나온다(원본 E070204 반복설정 창, 2026-10-13 실측)'],
  ['SupplyUsage|repeatRule', '등록 요청 repeat.summary(원본 요약보기 글)를 서버가 펼친 줄마다 찍는다 — 고칠 때 반복을 다시 펼치지 않는다(원본 수정 창도 글만 보인다)'],
  ['Check|directEntry', '수령(발행)수표조회 [신규] 수표내역입력(POST /checks/direct)에서 들어온 수표에 서버가 켠다 — 수표관리 등록 창에는 그 칸이 없다(원본 거래유형 수표만증가 · 2026-10-13 실측)'],
  ['Check|directInNo', '수표내역입력 전표 번호 — 서버가 (수표 종류, 날짜) 마다 check_entry_counters 로 매긴다(원본 [일자] \'2026/10/13 -5\', 지운 번호 재사용 없음 · 2026-10-13 실측)'],
  ['Check|directOutNo', '수표내역입력 감소 전표 번호 — directInNo 와 같은 번호 줄에서 서버가 매긴다'],
  ['Check|settleJournalId', '손을 떠날 때 회계전표 id — 입금보고서 · 지출결의서 · 입금 · 부도 분개를 만들 때 서버가 넣는다(수표조회 감소 줄 [회계전표일자-No.] 링크용)'],
  ['Check|departmentId', '수표내역입력 줄(DirectLine · DirectEditLine, POST · PUT /checks/direct)에서 정한다 — 수표관리 등록(CreateCheckRequest)에는 원본도 부서 칸이 없다(2026-10-14 실측)'],
  ['CostPeriod|generated', '원가생성/수정 원가계산 [생성](POST /cost-periods/{id}/generate)이 켠다 — 원본 기본등록 창에는 그 칸이 없다(2026-10-12 실측)'],
  ['WorkPost|labels', '공지사항 하단 [라벨변경] 판의 전용 자리(PATCH …/{id}/labels)에서 정한다 — 원본 E200080 글쓰기 창에는 라벨 칸이 없다'],
  ['Department|orgExcluded', '조직도등록 Fn › 미포함 · 하위부서추가 전용 자리(PUT …/{id}/org)에서 정한다 — 부서 등록 · 수정 창에는 원본도 그 칸이 없다'],
  ['Department|headEmployeeId', '조직도등록 [부서장지정](PUT …/{id}/head) · [부서장설정](PUT …/heads) 전용 자리에서 정한다 — 부서 등록 · 수정 창에는 원본도 부서장 칸이 없다'],
  ['Asset|assetNo', 'DocumentNoGenerator 가 매긴다'],
  ['Assignment|slipDate', '인사발령입력 전표 머리(AssignmentSlipRequest)에서 정한다 — 단건 CreateAssignmentRequest 에는 없다'],
  ['Assignment|slipNo', '전표 번호 — 그 일자 안에서 서버가 매긴다'],
  ['Assignment|prevDepartment', '발령 전 부서 — 저장할 때 사원의 지금 부서를 서버가 찍는다'],
  ['Assignment|prevJobTitle', '발령 전 직위 — 저장할 때 사원의 지금 직위를 서버가 찍는다'],
  ['Assignment|hireKind', '인사발령입력 줄(AssignmentSlipLine)에서 정한다 — 단건 CreateAssignmentRequest 에는 없다'],
  ['Asset|accumulatedDepreciation', '감가상각을 돌릴 때마다 서버가 쌓는다'],
  ['Asset|disposalAmount', '처분 처리에서 찍는다 — 등록할 때 정하면 안 판 자산에 처분액이 생긴다'],
  ['Asset|disposalType', '고정자산감소(POST /fixed-assets/{id}/dispose)에서 정한다 — 원본 E010612 ◉매각 ○폐기'],
  ['Asset|disposalVat', '고정자산감소에서 정한다(매각액의 10% 자동) — 등록할 때 정하면 안 판 자산에 부가세가 생긴다'],
  ['CollectData|channel', '원본 수집대상은 Email 하나뿐이다 — 고를 것이 없어 서버가 EMAIL 로 둔다'],
  ['CollectData|builtIn', '문서마다 처음부터 있는 기본 줄(마이그레이션이 심는다) — 사람이 만들 수 없다'],
  ['Bookmark|sortOrder', '새 북마크는 맨 뒤(max+1)로 서버가 매긴다. 차례 바꾸기는 통째로 다시 보내는 자리가 따로 있다'],
  ['FieldWork|rejectReason', '반려할 때 찍는다(POST /{id}/reject)'],
  ['Payslip|allowanceTotal', '수당 줄에서 더한다'],
  ['Payslip|deductionTotal', '공제 줄에서 더한다'],
  ['Payslip|netPay', '수당합 − 공제합이다'],
  ['Lot|stockQty', '입출고가 쌓아 올린다'],
  ['Lot|held', '보류는 전용 자리에서 바꾼다'],
  ['MaterialIssue|issueNo', 'DocumentNoGenerator 가 매긴다'],
  ['WorkOrder|lineNo', '전표 안 줄 차례 — 서버가 보낸 줄 순서대로 매긴다'],
  ['WorkOrder|project', 'POST·PUT /work-orders/slips 의 SaveWorkOrderSlipRequest.projectId 가 정한다(CreateWorkOrderRequest 는 품목 하나짜리 옛 자리)'],
  ['Production|workResultNo', 'SaveProductionSlipRequest.workResultNo 가 정한다 — 작업내역입력 [연결전표] → [신규] 로 연 생산입고'],
  ['Production|lotNo', 'SaveProductionSlipRequest.lines[].lotNo 가 정한다(옛 CreateProductionRequest 는 작업지시 하나짜리 자리)'],
  ['Production|lineNo', '전표 안 줄 차례 — 서버가 보낸 줄 순서대로 매긴다'],
  ['Production|entryType', 'POST·PUT /productions/slips 의 SaveProductionSlipRequest 가 정한다(CreateProductionRequest 는 작업지시 하나짜리 옛 자리라 소모 유무로 I·II 를 서버가 정한다)'],
  ['Production|subcontractUnitPrice', 'SaveProductionSlipRequest.lines[] 가 정한다 — 옛 CreateProductionRequest 는 외주처 품목단가로 서버가 깐다'],
  ['Production|subcontractAmount', 'SaveProductionSlipRequest.lines[] 가 정한다(안 주면 단가 × 수량)'],
  ['Production|subcontractVat', 'SaveProductionSlipRequest.lines[] 가 정한다(안 주면 합계의 10%, 원 미만 버림)'],
  ['WorkResult|resultNo', 'DocumentNoGenerator 가 매긴다'],
  ['Inspection|inspectionNo', 'DocumentNoGenerator 가 매긴다'],
  ['Company|schemaName', '회사코드로 서버가 짓는다(co_0002 …)'],
  ['Company|active', '회사를 내리는 자리를 아직 안 만들었다 — 만들 때 여기서 빼면 검사가 다시 잰다'],
  ['PurchaseOrder|convertedPurchaseId', '구매로 넘길 때 서버가 잇는다'],
  ['PurchaseOrder|requestProgress', '발주요청조회 [진행상태변경] 이 따로 정한다(PATCH /request-progress) — 입력 창에는 없다'],
  ['Quotation|convertedOrderId', '수주로 넘길 때 서버가 잇는다'],
  ['SalesPlan|planNo', 'DocumentNoGenerator 가 매긴다'],
  ['SalesPlan|planDate', '[예상매출일자]에서 서버가 정한다 — 안 정하면 계획연월의 첫날이다'],
  ['SalesPlan|lineNo', '전표 안 줄 차례 — 저장할 때 서버가 1부터 매긴다(여러 줄 전표, 2026-10-04)'],
  ['SpecialPrice|active', '전용 엔드포인트(PATCH /{id}/active)로 바꾼다'],
])

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
    /* 수정 전용 record 가 없어도 본다 — 큰 전표들은 수정도 Create…Request 를 그대로 받는다. */
    if (!create) continue
    const stored = resolveEntity(stem)
    if (!stored) continue

    checked++
    /*
     * 연관을 정하는 요청 칸은 <b>id 로 온다</b> — departmentId · partnerGroupId · itemGroupId.
     * 응답이 그 연관을 이름으로 풀어 주는(department · partnerGroupName) 것은 정할 수 없는
     * 값이 아니다. id 를 정할 수 있으면 그 연관은 정해진다.
     *
     * 이걸 안 보면 응답 이름을 전부 '…Name' 으로 바꾸는 수밖에 없는데, 그건 검사에
     * 맞추려고 API 를 바꾸는 것이라 앞뒤가 뒤집힌다.
     */
    const settable = new Set([...create, ...(update ?? [])])
    for (const f of [...settable]) {
      if (f.endsWith('Id')) settable.add(f.slice(0, -2))
    }
    const missing = fields.filter((f) =>
      stored.has(f) && !settable.has(f) && !SERVER_OWNED.has(f) && !OWNED_HERE.has(`${stem}|${f}`))
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
