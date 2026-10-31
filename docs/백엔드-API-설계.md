# 백엔드 MVC · API 설계 점검 (요즘 방식과 견주기)

2026-10-31 작성 · **분석 문서**(코드는 고치지 않았다). 기준: `backend/src/main/java/com/erp` (Spring Boot 3.5.6 · Java 17).
패키지 구조(기능 폴더 · accounting 쪼개기 · Modulith)는 [구조-정리-계획.md 5장](구조-정리-계획.md#5-백엔드-목표-구조)에 있으니 여기서는 다루지 않는다.

> 서버(8081)가 꺼져 있어 응답 실측은 못 했다(재기동 안 함). 아래 숫자는 전부 소스를 grep · 작은 스크립트로 잰 값이다.

---

## 1. 지금 상태 실측

### 1.1 규모

| 항목 | 수 |
|---|---|
| `@RestController` | **182** |
| `*Service` · `*Repository` · `@Entity` | 190 · 246 · 281 |
| 매핑 GET · POST · PUT · PATCH · DELETE | 453 · 389 · 194 · 38 · 178 (합 1,252) |
| DTO record (`*Dtos.java` 안) | 971 |
| 시험 코드 `src/test` | **6 파일** (`BackendApplicationTests` 컨텍스트 기동 정도). 대신 저장소 밖 `qa/qa.mjs`(12,600줄 API 시험) · `qa/*.mjs` 검사들 |

### 1.2 계층 규칙(CLAUDE.md 3 · 4 · 6) 준수

| 규칙 | 실측 | 예시 |
|---|---|---|
| 컨트롤러가 리포지토리 주입 금지 | **3곳 위반** | `config/MetaController.java:28` (`UserRepository.findAll`), `auth/role/PermissionController.java:22`, `auth/auth/AuthController.java:22` |
| 컨트롤러가 엔티티 반환 금지 | **0곳** (public 메서드 반환형에 `@Entity` 이름이 들어간 것 없음) | 전부 `XxxResponse.from(entity)` |
| `@Transactional` 은 service 에만 | 컨트롤러 · 리포지토리 **0곳**. 서비스 밖은 시드 `config/*Initializer` 8 · `tenant/TenantSeeder` · `trade/purchaseorder/PurchaseOrderProgress` 1 | 1,508개 중 `readOnly = true` 602 |
| 서비스가 **다른 모듈** 리포지토리 주입(4.4) | **54건 · 33 서비스** (서비스의 리포지토리 주입 472건 중 11%). common · security 쪽 4건 빼면 모듈 간 50건 | 많은 순: accounting→trade 20, groupware→auth 10, groupware→trade 5. 리포지토리별: `UserRepository` 13, `BusinessPartnerRepository` 10, `PurchaseRepository` 6, `SalesRepository` 5 |
| 모든 연관 LAZY · N+1 대책 | `default_batch_fetch_size: 100` 이 켜져 있어 N+1 이 "N/100+1" 로 눌린다. 목록은 `findAllWithRefs` 류 fetch join | `trade/purchase/PurchaseRepository.java:14` |

> CLAUDE.md 4.4 의 "28군데 · 102건 중 27%" 는 옛 숫자다. 지금은 **54건 / 472건**(분모 · 분자 둘 다 늘었다). 같은 계층 안 리포지토리를 import 없이 쓰는 것은 같은 기능 폴더라 셈에서 빠진다.

### 1.3 "전부 올려서 자바에서 거르기" — FIFO OOM(bf71e7e7) 과 같은 꼴

| 위치 | 하는 일 | 위험 |
|---|---|---|
| `accounting/cost/CostService.java:325, 348` | `purchaseRepository.findAllWithRefs()` 로 **모든 기간의 구매 전표**를 올리고 `purchaseDate.toString().startsWith(period)` 로 한 달만 남긴다. 줄(`getLines()`)은 fetch 안 돼 배치 지연로딩 | 구매가 쌓일수록 원가 계산 한 번이 전 기간을 읽는다 — **다음 OOM 후보 1순위** |
| `trade/sales/SalesService.java:148` · `trade/purchase/PurchaseService.java:123` | 기간이 없으면 `findAllWithRefs()` 전부 → `limit` 은 자바 `stream.limit` | 목록 API 가 기간 없이 불리면 전 기간을 내려보낸다(주석에 "대시보드가 3.6MB" 기록) |
| `Repository.findAll()` 다음 `.filter(` (15곳) | `WithholdingService:126` · `ExpenseEvidenceService:99` · `CostPeriodService:336` · `AccountingReflectionService:124` · `PaySettingService:355,363` · `PayFormulaService:106,113` · `FieldWorkService:173` … | 대부분 작은 마스터(계정 · 설정)라 당장은 괜찮다. `CostPeriodService` · `AccountingReflectionService` 는 대상 표를 확인할 것 |
| 집계 쿼리 `SalesLineRepository.aggregateByItem()` · `PurchaseLineRepository.aggregateBoughtAll()` | 기간 없이 전체 줄 집계 | DB 에서 GROUP BY 라 메모리는 괜찮지만 줄 수에 비례해 느려진다 |

`StockTransactionRepository` 는 bf71e7e7 로 `Stream<Object[]> streamFifoMoves` + fetch size 로 바뀌어 지금 위험 목록에서 빠졌다.

**2026-10-31 CostService 고침(위 표 첫 줄).** 총평균 단가는 그 달 구매 줄 `[품목id, 단가, 수량]` 만(`PurchaseRepository.findCostLineRowsBetween`),
최종매입가는 전 기간이 필요해 줄마다 `[품목id, 단가, 일자]` 세 칸만(`findCostPriceRowsLatestFirst`, 차례는 예전 걸음 그대로) 받는다.
같은 꼴이 서비스 안에 넷 더 있었다 — 실제노무비가 **품목마다** 전 기간 생산을 다시 올리던 것(`findCostLaborRowsBetween` 로 한 번),
`calcActual` · `consumedByProduct` · `producedQty` 가 `productionRepository.findAll()` 뒤 앞 7자로 거르던 것(`findByProductionDateBetweenOrderById`).
회사 0001 에서 원가 API 34개 응답(원가생성 총평균 · 최종매입 × 3달, 실제원가, 원가계산기간 표준 · 생성 · 원가계산내역 · 재계산 · 수량/금액비교 · 이력)을
고치기 전후 `cmp` 로 전부 같음. 따로 띄운 JVM 에서 같은 시나리오 한 바퀴 할당 약 815MB → 152MB, 원가생성 한 번 약 1초 → 0.1초.

**다음 후보 (사용자 결정 필요 — 화면 동작이 바뀔 수 있음):**

| 위치 | 지금 | 바꾸면 | 정할 것 |
|---|---|---|---|
| `trade/sales/SalesService.java:148` `findAll` | 기간(`from`/`to`)이 없으면 `findAllWithRefs()` 로 **전 기간 판매 전표 전부** → `limit` 은 자바 `stream.limit` | 기간 없으면 기본 기간 · 상한 · 400 중 하나 | 기간 없이 부르는 화면(대시보드 · 불러오기 창 · 코드도움)을 grep 해 기간을 넘기게 한 뒤에. 5장 1번(목록 기본 기간) 결정과 같이 |
| `trade/purchase/PurchaseService.java:123` `findAll` | 같은 꼴(구매) | 같음 | 같음 |

### 1.4 API 모양

| 항목 | 지금 | 예시 |
|---|---|---|
| URL 접두 · 버전 | 전부 `/api/<자원>` · **버전 없음**(`/api/v…` 는 `vat-…` 뿐) | `@RequestMapping("/api/sales")` |
| 복수 명사 | 대체로 복수(`/api/sales-orders`). 단수 · 묶음 접두 섞임: `/api/stock` · `/api/ledger` · `/api/hr/…`(12 컨트롤러) · `/api/accounting` · `/api/me` | |
| 동사 URL | 업무 동작은 `POST /{id}/confirm`(7) · `/{id}/cancel` · `/approve` · `/reflect` — **이건 괜찮은 관례**(상태 전이). 문제는 **`POST /delete` 19곳**(본문에 id 목록 → 일괄삭제) | `accounting/balanceadjust/BalanceAdjustController.java:62` |
| 응답 꼴 | 감싸지 않은 DTO 그대로(`List<XxxResponse>` 372 · `ResponseEntity<…>` 267). `Map<String,…>` 반환 13(`{"code": …}` 다음 번호류) | `accounting/expensegroup/ExpenseGroupController.java:25` |
| 오류 꼴 | `common/GlobalExceptionHandler.java:27` 자체 record `{status, message, timestamp}` + 권한 거부는 `permission` 필드 추가. **RFC 9457 `ProblemDetail` 안 씀.** 대신 400/404/405/406/415/413 을 하나하나 손으로 바로잡아 둠(주석에 "500 으로 새던 것" 이력) | 프론트 `api/client.ts:77` 가 `data.message` 만 읽는다 |
| 입력 검증 | `@RequestBody` 556 중 `@Valid` **468 (84%)**. 빠진 88 예: `ExpenseController.java:59`, `BalanceAdjustController.java:38,43,63`, `ContractItemController.java:37`. `@Validated`(쿼리 · 경로 변수 검증) **0**. 문구는 `ValidationMessages.properties` 한국어 | |
| 페이징 | `Pageable` 쓰는 파일 13, **`Page<>` 를 돌려주는 컨트롤러 1개**(`inventory/stock/StockController.java:75` 수불). 나머지 목록은 전부 반환(기간 · `limit` 쿼리로 자름) | |
| API 문서 | **springdoc 없음**(pom 의존성: web · jpa · security · validation · flyway · jjwt · lombok 뿐) | |
| 프론트 타입 | `frontend/src/types/api.ts` **3,805줄 · 276 타입 손으로**, 화면 파일 안 `interface/type` 995개(274 파일). 백엔드 record 971 과 손으로 맞춘다. 어긋남은 `qa/dto-check.mjs` 로 일부만 잡음 | |
| DTO 매핑 | 손으로 `static from(entity)` 232곳. MapStruct · ModelMapper 없음 | |
| 날짜 · 금액 | DTO 금액은 `BigDecimal`(1,479) — `double/Double` 6. 날짜는 `LocalDate` · `LocalDateTime` 를 Boot 기본 Jackson 이 ISO 문자열로. 시간대 표기 없는 `LocalDateTime`(오류 `timestamp` 포함) | BigDecimal 은 JSON **숫자**로 나가 JS `number`(배정밀도)가 받는다 — 15자리 넘으면 끝자리가 깎인다(원 단위 ERP 에선 거의 안 걸림) |
| 멱등 · 중복 제출 | `Idempotency-Key` · 요청 id 없음 | 전표 저장 버튼 두 번 → 전표 두 장 가능 |
| 관측 | Actuator · Micrometer · traceId(MDC) · 구조화 로그 **없음**. `logging.level` 한 줄 | |

---

## 2. 잘 된 것 / 문제

### 잘 된 것 (지키면 되는 것)

1. **컨트롤러 → 엔티티 반환 0 · 트랜잭션은 서비스에만** — 계층 규칙의 핵심 두 개가 지켜지고 있다. `open-in-view: false` 와 함께 지연로딩 사고를 구조로 막는다.
2. **DTO 를 기능별 `dto/XxxDtos.java` record 로** — Java record 는 요즘 Spring 권장 꼴 그대로다. 손 매핑도 이 규모(1인)에선 MapStruct 보다 읽기 쉽다.
3. **금액 `BigDecimal` · 날짜 `LocalDate`** — ERP 에 맞다.
4. **스키마 드리프트 감지**(Flyway + `validate` + `qa/schema-check.mjs`) 와 `qa/dto-check.mjs` · `arch-check.mjs` 래칫 — 표준 도구는 아니지만 같은 목적을 이미 달성.
5. **오류 상태코드를 하나씩 바로잡아 둔 것** — 400 이 500 으로 새는 흔한 사고를 막아 놨다. ProblemDetail 로 옮길 때 이 매핑을 그대로 살리면 된다.
6. **상태 전이를 `POST /{id}/confirm` 같은 하위 동작으로** — Google AIP 의 custom method 와 같은 생각이다. 억지로 `PATCH {status}` 로 바꿀 필요 없다.

### 문제 (중요한 순)

| # | 문제 | 왜 아픈가 |
|---|---|---|
| P1 | **목록이 전부 반환 · 전 기간을 올려서 자바에서 거르기**(1.3) | 오늘 OOM 이 바로 이것. 데이터 이관이 진행될수록 회사 0001 처럼 수십만 줄이 된다. 공유 백엔드 하나가 죽으면 모든 작업자가 선다 |
| P2 | **API 계약이 코드 밖에 없다** — springdoc 없음 + 프론트 타입 3,805줄 + 화면 안 995개 손 동기화 | 필드 하나 바꾸면 사람이 양쪽을 맞춘다. `dto-check` 가 생긴 이유(거래처그룹 · 단가그룹 세 번)가 이것. 생성된 타입이면 컴파일이 잡는다 |
| P3 | **오류 꼴이 표준이 아님 · 필드 오류가 한 문자열** | 프론트가 "어느 칸이 틀렸는지"를 못 집는다(칸 빨간 테두리 불가). `message` 를 이어 붙인 한 줄뿐 |
| P4 | **관측 0** — 요청 id · 느린 쿼리 · 힙 지표 없음 | OOM 을 사람이 "느리다"로 알아챘다. Actuator 메트릭만 있었어도 힙 · 응답시간 그래프로 먼저 보였다 |
| P5 | **검증 빈 곳 16% · 경로/쿼리 검증 0** | 빈 `@RequestBody` 가 서비스까지 들어가 NPE → 500. 예: 일괄삭제 `List<Long>` 이 비거나 null |
| P6 | 중복 제출 방지 없음 | 저장 두 번 = 전표 두 장 · 재고 두 번 출고. ERP 에선 실제 사고 |
| P7 | URL 소소한 불일치(`POST /delete` 19 · 단수 `/stock`) · 다른 모듈 리포지토리 주입 54 · 컨트롤러 리포지토리 3 | 고치면 좋지만 급하지 않다. 4.4 방식(만질 때 고친다) 유지 |

---

## 3. 권장 방향 — 요즘 방식과 우리 형편

전제: **1인 개발 · 프론트 하나뿐(외부 공개 API 아님) · 목표는 Ecount 화면과 동일 · 주간 토큰 20~30%.** 그래서 "큰 회사가 하는 것" 중 *화면 하나 고칠 때 사고를 줄이는 것*만 가져온다.

| 주제 | 요즘 방식 (출처) | 우리 권장 |
|---|---|---|
| 오류 형식 | RFC 9457 Problem Details. Spring 6 은 `ProblemDetail` 클래스와 `ResponseEntityExceptionHandler`, Boot 는 `spring.mvc.problemdetails.enabled` 로 기본 예외를 이 꼴로 낸다 ([Spring MVC Error Responses](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html)). 단 Boot 의 `/error`(BasicErrorController) 는 아직 옛 꼴이라는 이슈가 있다 ([spring-boot#48392](https://github.com/spring-projects/spring-boot/issues/48392)) | **한다(1순위).** 지금 핸들러가 `ProblemDetail` 을 돌려주게 바꾸고 `message` 는 확장 필드로 **같이 남긴다**(프론트 무변경). 필드 오류는 `errors: [{field, message}]` 로 더한다 |
| API 문서 · 계약 | 코드 우선: springdoc 이 실행 중에 컨트롤러를 읽어 `/v3/api-docs` 를 만든다(Boot 3 은 v2 starter `springdoc-openapi-starter-webmvc-ui`) ([springdoc](https://github.com/springdoc/springdoc-openapi)). 테스트 기반: 우아한형제들 정산팀은 위키 문서가 코드와 어긋나 **Spring REST Docs** 로 옮겼다 ([우아한기술블로그 — Spring Rest Docs 적용](https://techblog.woowahan.com/2597/)). 계약 우선(OpenAPI yaml 을 먼저 쓰고 서버 · 클라 생성)은 여러 팀 · 외부 공개 API 에 맞다 | **springdoc(코드 우선) 한다.** 문서보다 *타입 생성의 원천*으로 쓴다. REST Docs 는 시험을 1,252 개 써야 해서 **지금은 안 함.** 계약 우선도 **안 함**(1인 · 프론트 하나 · Ecount 따라 자주 바뀜) |
| 프론트 타입 | `openapi-typescript` 가 스펙에서 TS 타입만 만든다, `openapi-fetch` 는 그 타입으로 fetch 클라이언트 ([openapi-ts](https://github.com/openapi-ts/openapi-typescript)). `orval` 은 경로마다 React Query 훅까지 만든다 ([orval React Query](https://orval.dev/docs/guides/react-query)) | **openapi-typescript (타입만) 한다.** 지금 axios `api/client.ts`(권한 거부 · 401 처리)를 그대로 두고 타입만 생성본으로 갈아끼운다. orval 은 클라이언트 · 훅을 통째로 바꿔야 해 **지금은 안 함** |
| 페이징 | 오프셋(`Pageable`/`Page`)과 키셋 스크롤(`Window<T>` · `ScrollPosition.keyset()` — 마지막 줄의 키 다음부터 읽어 깊은 쪽도 빠르다) ([Spring Data Scrolling](https://docs.spring.io/spring-data/commons/reference/repositories/scrolling.html)) | **기간 필수 + 상한**이 먼저. Ecount 목록은 기간 조건 · 쪽번호(`.ec-paging`) 화면이라 **오프셋 `Pageable` 이 원본과 맞다.** 커서 페이징은 무한 스크롤이 없어 **지금은 안 함**(수불 · 원장처럼 수십만 줄 내려받기는 bf71e7e7 처럼 서버 안에서 흘려받기) |
| 입력 검증 | Bean Validation `@Valid` + 쿼리 · 경로는 `@Validated` · 메서드 검증 (Spring 6.1 은 컨트롤러 메서드 검증 내장, 같은 [Error Responses](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html) 문서) | **빈 곳 88 을 채운다** · 래칫으로 새 `@RequestBody` 에 `@Valid` 강제 |
| 멱등키 | IETF `Idempotency-Key` 헤더 초안 — 같은 키 다른 본문 422, 처리 중 재시도 409 ([draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header), 아직 RFC 아님). 토스페이먼츠도 헤더 방식으로 결제 중복을 막는다 ([토스페이먼츠 — 멱등성](https://www.tosspayments.com/blog/articles/dev-1)) | **전표 저장(판매 · 구매 · 전표 · 출하 등) 몇 곳만.** 표 하나(`idempotency_keys`) + 필터 하나. 전체 적용은 **안 함**. 그 전에 프론트 저장 버튼 중복 클릭 잠금이 더 싸다 |
| API 버전 | Spring Framework 7 / Boot 4 에 `version` 속성 · `spring.mvc.apiversion.*` 내장 ([Spring 블로그 — API Versioning](https://spring.io/blog/2025/09/16/api-versioning-in-spring/)) | **지금은 안 함.** 클라이언트가 같이 배포되는 우리 프론트 하나뿐이라 버전이 갈릴 일이 없다. 외부 연동(쇼핑몰 · 은행)용 API 를 따로 열 때 그것만 `/api/ext/v1` |
| 관측 | Actuator + Micrometer, Micrometer Tracing 을 넣으면 traceId/spanId 가 로그 MDC 에 기본으로 붙는다 ([Boot Tracing](https://docs.spring.io/spring-boot/3.5/reference/actuator/tracing.html)). Boot 3.4+ 는 `logging.structured.format.console=ecs|logstash` 로 JSON 로그 ([Spring 블로그 — Structured Logging](https://spring.io/blog/2024/08/23/structured-logging-in-spring-boot-3-4)) | **Actuator(health · metrics) + 요청 id 한다.** 분산 추적 · 수집기(Zipkin · Grafana)는 서버 하나라 **지금은 안 함**. JSON 로그는 사람이 터미널로 읽는 지금은 오히려 불편 → 운영 배포 때 |
| 시험 | 슬라이스 `@WebMvcTest`, 실제 PostgreSQL 로 `@SpringBootTest` + Testcontainers `@ServiceConnection` ([Boot Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html)) | `qa/qa.mjs`(실서버 API 시험 12,600줄)가 이미 통합시험 몫을 한다. **멀티테넌트 스키마 이관만** Testcontainers 시험 하나(새 회사 만들기 → 테넌트 V* 적용 → validate). `@WebMvcTest` 전면 도입은 **안 함** |
| DTO 매핑 | MapStruct 가 흔하지만 필수 아님 | **지금 손 `from()` 유지** |
| 응답 감싸기 | `{success, data, error}` 봉투는 국내에서 흔하지만 HTTP 상태 · ProblemDetail 과 겹친다 | **안 감싼다**(지금 그대로). 페이지 응답만 `{content, page, size, total}` 꼴 하나 |
| 모듈 경계 | Spring Modulith | [구조-정리-계획.md 5장](구조-정리-계획.md#5-백엔드-목표-구조) 그대로 |

---

## 4. 도입 순서 (작은 것부터)

각 단계는 **한 커밋 · 한 사람 · 반나절 이내**로 끊는다. 다른 코더가 Fixing 중이면 `GlobalExceptionHandler` · `pom.xml` · `api/client.ts` 처럼 공용 파일을 만지는 단계는 쉬는 때에 한다. 서버 재기동은 `backend-restart-lock`(메모리 규칙)으로 잠그고 한다.

| 단계 | 할 일 | 위험 | 확인 |
|---|---|---|---|
| **0. 전 기간 올리기 막기 (P1)** | `CostService.weightedAvgUnitCosts`(:325, :348) 를 `findWithRefsAndLinesByPeriod(월초, 월말)` 같은 기간 쿼리로. `SalesService/PurchaseService.findAll` 은 기간 없으면 **기본 기간(이번 달)** 또는 상한(예 5,000줄) + 넘으면 400 | 기간 없이 부르던 화면(대시보드 · 불러오기 창)이 줄어든 결과를 받는다 → 그 화면 목록을 grep 해 기간을 넘기게 | `qa/qa.mjs` 원가 · 판매 · 구매 · `screen-check sales` · 회사 0001(38만 줄) 에서 원가 계산 응답 시간 · 힙 |
| **1. ProblemDetail (P3)** — 고침(0e92b187) | `spring.mvc.problemdetails.enabled: true` + `GlobalExceptionHandler` 가 `ProblemDetail` 반환(지금 상태코드 매핑 그대로). 확장 필드 `message`(지금 문구) · `permission`(권한 거부) · `errors[]`(필드 오류) 유지 | 프론트 `client.ts:77` 는 `data.message` 를 읽으니 **message 를 남기면 무변경**. Content-Type 이 `application/problem+json` 으로 바뀜 → axios 는 그대로 JSON 파싱 | `qa/qa.mjs` 오류 케이스(400 · 403 · 404) · 판매입력에서 필수칸 빼고 저장 → 안내 문구 같음 |
| **2. springdoc + 타입 생성 (P2)** — 고침(6d5b627e, 스크립트까지) | `springdoc-openapi-starter-webmvc-ui`(v2) · Security 에 `/v3/api-docs/**` 허용(로컬만, 운영은 끔). `frontend` 에 `openapi-typescript` 로 `src/types/generated.ts` 생성 스크립트 · `npm run gen:api` | 첫 생성본은 **기존 `types/api.ts` 와 이름이 다르다** → 한 번에 갈아끼우지 말고, 화면을 고칠 일이 생길 때 그 화면부터 생성 타입으로(CLAUDE.md 4.4 와 같은 방식). `Map<String,…>` 13곳 · 제네릭 `ResponseEntity<?>` 는 스펙이 흐려진다 | 생성본 커밋 후 `npm run typecheck` · `dto-check` 와 결과 비교. CI 대신 `precommit.sh` 에 "스펙 다시 뽑아서 diff 없음" 단계(서버가 떠 있을 때만) |
| **3. 검증 채우기 (P5)** — 일부 고침(2a148c9d) | `@Valid` 빠진 `@RequestBody` 88곳 · 일괄 id 목록에 `@NotEmpty` · 컨트롤러에 쿼리 검증. `qa/arch-check.mjs` 또는 새 래칫에 "`@RequestBody` 앞 `@Valid` 없음" 수 기준 | 지금까지 통과하던 이상한 요청(빈 배열 등)이 400 이 된다 → 프론트가 빈 선택으로 부르던 곳이 드러남(좋은 일) | `qa/qa.mjs` 전체 · `qa/flows/*.json` |
| **4. 페이징 표준 (P1 마무리)** | 목록 API 규칙: `from`·`to` 필수(또는 기본값) + `page`·`size`(기본 size 상한). 응답은 Spring `PagedModel` 꼴 `{content, page:{number,size,totalElements}}` 하나로. **Ecount 쪽번호 화면부터**(판매조회 · 구매조회 · 전표조회) | 프론트 목록 훅이 배열 대신 객체를 받는다 → 화면별로 옮기며 `EcListShell` 쪽번호에 연결. fetch join + `Pageable` 은 HHH000104(메모리 자르기)라 **id 만 먼저 페이징 → 그 id 로 fetch join** 두 번 쿼리 | `screen-check` · 쪽번호 넘김 흐름 하나 `qa/flows` 에 |
| **5. 관측 최소 (P4)** — 고침(0560df8c, health · info 만) | `spring-boot-starter-actuator` (health · metrics · `jvm.memory.used` · `http.server.requests`), 노출은 로컬만. 요청마다 `X-Request-Id` 필터 → MDC → 로그 패턴 · ProblemDetail `instance`/확장필드에 실어 화면 오류창에서 보이게. 느린 쿼리는 Hibernate `log_queries_slower_than_ms` | 액추에이터 엔드포인트가 인증 없이 열리면 안 된다(Security 에서 `health` 만 허용) | `curl /actuator/health` · 힙이 오르는지 `/actuator/metrics/jvm.memory.used` 로 FIFO 같은 화면 열며 보기 |
| **6. 중복 제출 (P6)** — ① 고침(50231dd9) | ① 프론트 저장 버튼 처리 중 잠금(공용 `EcSlip*` 저장 한 곳) ② 그래도 필요하면 판매 · 구매 · 전표 저장만 `Idempotency-Key` 헤더 + 표 하나(본사 · 테넌트 마이그레이션 둘 다 — CLAUDE.md 7.4) | ②는 테넌트 마이그레이션 · 키 만료 청소가 따라온다 → ①만으로 충분한지 먼저 본다 | 저장 버튼 두 번 빠르게 누르는 흐름 하나 `qa/flows` |
| **7. 정리 (P7, 만질 때마다)** | `POST /delete` → `DELETE /api/x?ids=…` 또는 `POST /api/x:batchDelete` 중 하나로 이름 통일 · 컨트롤러 리포지토리 3곳을 서비스로 · 모듈 간 리포지토리 54건 줄이기 · CLAUDE.md 4.4 숫자 갱신 | URL 을 바꾸면 프론트 호출부도 → 생성 타입(2단계) 이후가 안전 | `arch-check` 래칫 |

### 4.1 고침 기록 (2026-10-31)

| 단계 | 커밋 | 한 것 | 남은 것 |
|---|---|---|---|
| 1 ProblemDetail | 0e92b187 · 0560df8c | `GlobalExceptionHandler` 가 전부 `ProblemDetail`(`application/problem+json`) — `type · title · status · detail · instance` + 확장 `message`(= detail, 5장 2번 기본값대로 유지) · `timestamp` · `permission` · `errors[{field, message}]`(본문 검증) · `requestId`. 상태코드 매핑은 그대로. **500 은 예외 문구를 응답에 안 싣고** `log.error` 로 스택을 남긴다(응답은 "서버 오류가 발생했습니다. (요청 번호 …)"). `spring.mvc.problemdetails.enabled` 는 **켜지 않았다** — Boot 의 `ProblemDetailsExceptionHandler` 가 우리 핸들러와 겹쳐 영어 기본 문구가 나갈 수 있다(우리 핸들러가 이미 모든 예외를 받는다) | 보안 필터가 직접 쓰는 401(`security/JwtAuthenticationEntryPoint`) · 403 본문은 옛 꼴 `{status, message, timestamp}` 그대로 — 보안 코더 파일이라 안 건드림. 프론트 칸 빨간 테두리를 `errors[]` 로 잇는 것은 화면을 고칠 때 |
| 3 검증 | 2a148c9d | DTO 본문 49곳에 `@Valid` — 제약 있는 16곳(글자 길이 `@Size` = DB 칸 길이라 400 이 그대로 400 · 비용 통제확인은 저장과 같은 본문 · AS 수정 줄 · 보안정책 0 이상)은 이제 검증, 제약 없는 33곳은 무동작(앞으로 제약을 달면 바로 먹는다) | `List`/`Map` 본문 35곳(일괄 id 목록 등)은 그대로 — `@NotEmpty` 를 달면 빈 선택으로 부르던 곳이 400 이 되어 **동작이 바뀐다**. 쿼리 · 경로 `@Validated` · "`@RequestBody` 앞 `@Valid`" 래칫도 아직 |
| 5 관측 | 0560df8c | Actuator — 웹 노출 `health · info` 만(`show-details: never`, 나머지는 닫힘 · SecurityConfig 는 두 경로 허용 한 줄). `common/RequestIdFilter`(가장 먼저 도는 필터): `X-Request-Id` 를 받거나(영숫자 · `._-` 64자까지만, 로그 위조 막기) 만들어 MDC `requestId` · 응답 머리. 로그 패턴 `logging.pattern.level: "%5p [%X{requestId:-}]"` | metrics(힙 · 응답시간) 노출 · 느린 쿼리 로그 |
| 6 중복 제출 ① | 50231dd9 | `EcSlipShell` 한 곳: [저장] 을 받으면 그 뒤 요청이 다 끝날 때까지 다음 저장을 버린다(`utils/saveLock` · `api/client` 도는 요청 수). 저장 단추 · ▴'저장…' 항목 · F7 · F8 · form 제출(칸에서 Enter) 전부. 잠긴 동안 저장 단추 흐림. `qa/flows/double-save-guard.json` 통과 | ② 서버 `Idempotency-Key` 는 5장 5번 결정 전이라 안 함. `EcSlipShell` 을 안 쓰는 저장 창(모달 입력 등)은 화면별 `useSubmitting` 그대로 |
| 2 springdoc | 6d5b627e | `springdoc-openapi-starter-webmvc-api` 2.8.13(화면 없이 JSON). `/v3/api-docs` 는 **dev 프로필에서만** 연다(application.yml 아래 `on-profile: dev` 문서, 5장 3번 기본값). 열려도 로그인한 요청만(SecurityConfig 손 안 댐). `frontend` `npm run gen:api`(`scripts/gen-api.mjs` — 로그인 → 스펙 → `openapi-typescript@7.13.0` → `src/types/generated.ts`). 시험 생성: 스펙 811KB → 54,876줄 | `types/api.ts` 이관(5장 4번) · 생성본 커밋 · precommit 의 "스펙 diff 없음" 단계 |

**지금은 안 함**: API 버전(`/v1`) · 계약 우선(yaml 먼저) · orval/React Query 전환 · 커서 페이징 · 응답 봉투 · MapStruct · 분산 추적 수집기 · REST Docs · `@WebMvcTest` 전면 · 멀티모듈.

---

## 5. 정할 것

1. **목록 기본 기간** — 기간 없이 부르면 (a) 이번 달로 본다 (b) 400 을 낸다 (c) 상한 줄 수까지만. Ecount 원본은 화면마다 기본 기간이 있으니 **(a)** 추천, 단 화면별 기본값을 프론트가 이미 보내는지 먼저 확인.
2. **ProblemDetail 로 바꿀 때 `message` 를 영구히 둘지** (지금은 기본값대로 둠 — 0e92b187) — 추천: 둔다(프론트는 `api/client.ts` 한 곳에서 `data.message` 를 읽어 화면들에 넘긴다 — 무변경). `detail` 과 같은 값.
3. **springdoc 을 운영에서 켤지** (지금은 기본값대로 dev 만 — 6d5b627e) — 추천: 로컬 · 개발 프로파일만.
4. **생성 타입으로 옮기는 방식** — 한 번에(하루 묶어 `types/api.ts` 교체) vs 화면 고칠 때마다. 추천: 화면 고칠 때마다(지금 Fixing 과 충돌 안 함).
5. **멱등키까지 갈지** (버튼 잠금은 함 — 50231dd9) — 프론트 버튼 잠금만 하고 지켜볼지.
6. CLAUDE.md 에 "목록 API 는 기간 · 상한 필수", "`@RequestBody` 는 `@Valid`", "오류는 ProblemDetail" 세 줄을 규칙으로 넣을지.
