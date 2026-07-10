# 제조 ERP (Manufacturing ERP)

이카운트(ECOUNT)를 참고해 자체 구축하는 팀 단위 제조 ERP입니다. 한국어 UI이며, 이카운트 v5의 화면 레이아웃·격자 톤을 재현했습니다(상단 가로 메뉴 + 북마크바 + 모듈 좌측 사이드바 + 격자형 목록/입력).

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Spring Boot 3.5 · Java 17 · Spring Security · Spring Data JPA |
| 인증 | JWT (역할 기반 권한: ADMIN / MANAGER / STAFF) |
| DB | PostgreSQL 16 (Docker) |
| 프론트엔드 | React 19 · Vite · TypeScript · Tailwind CSS |
| UI | 이카운트 톤 디자인 토큰(`ec-input`/`ec-btn`/전역 `.ec-grid`, `index.css` :root 변수) |

## 구축 현황

- [x] **기반** — 로그인, 사용자·역할·권한, 이카운트식 공통 레이아웃(상단메뉴·북마크·앱바)
- [x] **재고관리** — 품목·창고·관리항목·단가적용순서·거래처특별단가그룹, 입출고(입고/출고/조정), 현재고(안전재고 경고), 기타이동
- [x] **판매/구매** — 거래처, 오더관리(수주), 판매·구매 입력(엑셀형 그리드, 부가세·재고 자동연동), 수금/지급(정산), 거래처별 채권/채무, 수출·쇼핑몰
- [x] **생산관리** — BOM, 작업지시, 생산실적(BOM 소요량 자재 자동출고 + 완제품 입고), 생산계획(MPS/MRP), 공정·자원·BOR, 생산불출·작업내역
- [x] **회계/원가** — 매입매출·부가세, 품목별 원가·이익(제조원가 BOM 기반), 손익(월별/일별), 계정과목, 비용, 표준·실제원가·차이분석
- [x] **재고 II / 품질** — 품질검사, 시리얼/로트, A/S 관리
- [x] **그룹웨어** — 전자결재(기안서 작성/순차 결재/통합관리), 업무일지, 출/퇴근(근태), WORK·게시판·ECDrive, 프로젝트·고객관리(CRM)
- [x] **Self-Customizing** — 회사정보·환경설정·보안·다운로드, 데이터센터(수집/내보내기)

> MyPage 대시보드는 위젯 커스터마이징(표시/순서 선택, localStorage 저장)을 지원합니다.
> 상단 이카운트 메뉴는 전 항목이 실제 페이지로 연결됩니다("준비 중" 0건).
> 일부 상세 조회/현황 화면은 대표 화면으로 커버되거나 데모 데이터로 표시됩니다.

## 문서

- [데이터 관계도 · 화면 흐름도](docs/데이터-관계도.md) — 엔티티 ERD, 업무 흐름(수주→출하→재고), 저장 후 동작, 스키마 변경 시 주의사항
- [QA 시드 · 시나리오 검증](qa/README.md) — `node qa/qa.mjs` 로 핵심 업무 흐름을 API 끝까지 검증(단언 30개)

## 실행 방법

### 1. 데이터베이스 (PostgreSQL)

```bash
docker compose up -d
```

### 2. 백엔드 (Spring Boot, 포트 8081)

```bash
cd backend
./mvnw spring-boot:run        # Windows: mvnw.cmd spring-boot:run
```

> 최초 기동 시 기본 역할(ADMIN/MANAGER/STAFF)과 관리자 계정이 자동 생성됩니다.
> **아이디: `admin` / 비밀번호: `admin1234`**

### 3. 프론트엔드 (Vite, 포트 5173)

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 **http://localhost:5173** 접속 → 위 계정으로 로그인.

## 포트

| 서비스 | 포트 |
|--------|------|
| 프론트엔드 (Vite) | 5173 |
| 백엔드 (Spring Boot) | 8081 |
| PostgreSQL | 5432 |

> 백엔드는 8080이 다른 프로그램에 점유되어 있어 **8081**을 사용합니다.
> `frontend/vite.config.ts`의 프록시가 `/api` 요청을 8081로 전달합니다.

## 주요 API (베이스 경로)

| 베이스 경로 | 설명 |
|------|------|
| `/api/auth` | 로그인(JWT 발급)·현재 사용자 |
| `/api/users` · `/api/roles` | 사용자·역할 관리(ADMIN) |
| `/api/meta` | 공통 코드(사용자·분류·거래처유형 등) |
| `/api/items` · `/api/warehouses` · `/api/management-items` | 품목·창고·관리항목 |
| `/api/stock` · `/api/stock-transfers` | 현재고·입출고 이력 / 기타이동 |
| `/api/partners` · `/api/price-order-settings` | 거래처(단가그룹 포함)·단가적용순서 |
| `/api/sales` · `/api/purchases` | 판매·구매 전표(재고+채권/채무 자동연동) |
| `/api/sales-orders` · `/api/settlements` | 수주 / 수금·지급(정산) |
| `/api/ledger` | 거래처별 채권/채무 현황 |
| `/api/boms` · `/api/work-orders` · `/api/productions` | BOM·작업지시·생산실적(백플러시) |
| `/api/production-plans` | 생산계획(MPS/MRP) |
| `/api/accounting` | 부가세·품목별원가/이익·손익·원가분석 |
| `/api/quality-inspections` · `/api/as-requests` | 품질검사·A/S |
| `/api/approvals` | 전자결재(상신·순차 승인/반려) |
| `/api/work-journals` · `/api/attendances` · `/api/projects` | 업무일지·근태(출퇴근)·프로젝트 |
| `/api/company` | 회사정보(Self-Customizing) |

## 프로젝트 구조

```
manufacturing-erp/
├─ docker-compose.yml      # PostgreSQL
├─ backend/                # Spring Boot
│  └─ src/main/java/com/erp/
│     ├─ config/           # 보안·JPA·초기데이터
│     ├─ controller/       # REST API (모듈별)
│     ├─ service/          # 업무 로직
│     ├─ repository/       # JPA 저장소
│     ├─ domain/           # 엔티티
│     ├─ dto/              # 요청/응답 객체
│     ├─ security/         # JWT·인증 필터
│     └─ common/           # 예외 처리
└─ frontend/               # React + Vite
   └─ src/
      ├─ api/              # axios 클라이언트·타입
      ├─ auth/             # 인증 컨텍스트
      ├─ components/       # EcountLayout·모듈 사이드바·EcListShell 등
      └─ pages/            # 모듈별 화면
         ├─ inventory/     # 재고
         ├─ trade/         # 판매/구매·정산
         ├─ production/    # 생산
         ├─ accounting/    # 회계/원가
         ├─ quality/       # 품질·A/S
         ├─ groupware/     # 그룹웨어
         └─ settings/      # Self-Customizing
```
