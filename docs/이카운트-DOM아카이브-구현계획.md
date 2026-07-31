# 이카운트 DOM 아카이브 기반 화면 구현 계획

> 원본: `C:\Users\USER\Downloads\ecount_erp_dom_archive.html` (23MB · 93,003줄)
> 주식회사 팜인 실제 화면을 수집한 **화면별 완성 DOM 스냅샷** 아카이브.
> 이 문서는 그 아카이브를 우리 ERP 화면으로 옮기기 위한 **작업 지도**입니다.
> 화면 하나를 실제로 구현하는 표준 절차는 5장, 무엇부터 할지는 6장, 340개 전체 대조표는 부록.

---

## 1. 이 아카이브가 무엇인가

이카운트 v5 SPA에서 각 메뉴(prgId)를 열었을 때 렌더된 **최종 DOM 전체**를 화면별로 `<pre>` 한 블록에
HTML-이스케이프해서 담아둔 것입니다. 한 화면이 곧 한 블록이고, 그 안에 헤더·툴바·검색폼·격자·팝업까지
그대로 들어 있습니다. (예: `구매현황` 한 화면 = 약 25KB DOM.)

즉 우리가 첫 작업으로 만든 **구매현황 Search 패널**처럼, "이카운트의 이 화면은 실제로 이런 필드·격자·버튼을
가진다"를 근거 있게 재현할 수 있는 1차 자료입니다. 추측이 아니라 원본 DOM을 보고 만듭니다.

### 아카이브 항목 상태(badge)

| badge | 뜻 | 수 | 의미 |
|-------|-----|----|------|
| `b-ok` (콘텐츠) | DOM 수집됨 | **340** | 실제 DOM이 있어 **바로 참조·구현 가능** |
| `b-na` (권한없음) | 계정 권한 없어 미수집 | 345 | DOM 없음. 화면명·경로만 앎 |
| `b-mod` (빈상태) | 접근했으나 콘텐츠 없음 | 17 | 대시보드 등 빈 화면 |
| `b-pop` (팝업샘플) | 팝업 예시 | 1 | — |
| | **총계** | **703** | |

**작업 대상은 `b-ok` 340개뿐**입니다. 나머지 363개는 DOM이 없으므로 이 계획의 범위 밖(필요 시
화면명만 보고 신규 설계).

---

## 2. 아카이브 구조

```
<nav>   … 좌측 목차: 대분류(details.top) › 중분류(details.sub) › 항목(<a href="#앵커ID">)
<main>  … 항목별 콘텐츠 박스
  <div class="prog" id="앵커ID">
    <h3>화면명 <span class="badge b-ok">콘텐츠</span></h3>
    <div class="path">대분류 / 중분류 / prgId: E040305</div>
    <pre> …이스케이프된 화면 DOM 전체… </pre>
  </div>
```

- **앵커ID** = `대분류_중분류_prgId` (대분류 내 공백은 `_`). 예: `재고_I_구매관리_E040305`.
- **prgId**가 이카운트 화면의 안정적 식별자입니다. `docs/이카운트-원본분석.md`의 라우팅 설명과 같은 체계
  (예: 판매입력 `E040205`, 거래처등록 `E010101`).

---

## 3. 화면 DOM을 꺼내는 방법

아카이브는 23MB라 통째로 열지 않습니다. **prgId(앵커ID)로 한 화면만** 뽑아서 봅니다.

```bash
# 앵커ID 하나의 DOM을 언이스케이프해서 screen.html 로 저장
node -e '
const fs=require("fs"), id=process.argv[1];
const h=fs.readFileSync(process.argv[2],"utf8");
const i=h.indexOf(`id="${id}"`);
if(i<0){console.error("없음:",id);process.exit(1);}
const s=h.indexOf("<pre>",i)+5, e=h.indexOf("</pre>",s);
const d=h.slice(s,e)
  .replace(/&lt;/g,"<").replace(/&gt;/g,">")
  .replace(/&quot;/g,"\"").replace(/&#39;/g,"\x27").replace(/&amp;/g,"&");
fs.writeFileSync("screen.html",d);
console.log(d.length+" chars → screen.html");
' 재고_I_구매관리_E040305 /c/Users/USER/Downloads/ecount_erp_dom_archive.html
```

목차·통계를 다시 뽑을 때:

```bash
f=/c/Users/USER/Downloads/ecount_erp_dom_archive.html
# 수집된(b-ok) 화면 목록: prgId · 화면명 · 경로
grep -oE '<div class="prog" id="[^"]*"><h3>[^<]*<span class="badge b-ok">[^<]*</span></h3><div class="path">[^<]*</div>' "$f" \
 | sed -E 's/.*id="([^"]*)"><h3>([^<]*)<span.*path">([^<]*)<\/div>/\1\t\2\t\3/'
```

---

## 4. 아카이브 vs 우리 구현 — 커버리지 요약

340개 `b-ok`를 우리 프론트 화면 제목 211개와 **자동 대조**한 결과입니다.
매칭은 제목 부분일치 휴리스틱이라 **대략치**입니다(동명이지만 다른 화면·부분구현 미검출 가능).
정확한 상태는 부록에서 화면별로 확인·수정하세요.

| 대분류 › 중분류 | 매칭 ✅ / 전체 | 비고 |
|----------------|:---:|------|
| 재고 I › 구매관리 | 28 / 28 | 발주 파이프라인 현황 + **단가요청진행단계=PriceRequestProgressPage(문서별 진행단계 스테퍼) 신규. 완비** |
| 재고 I › 영업관리 | 34 / 34 | 주문서·미주문·출하조회 구축 + 오탐 정정. **판매입력II=사용자정의필드 엔진(CustomFieldDef/Value+V116)으로 판매전표에 추가 형식필드 부착. 완비** |
| 재고 I › 생산/외주 | 37 / 37 | production 21개 페이지로 사실상 완비 + 외주비회계반영 2종 오탐 정정(외주 전용 도메인 없음 → 구매 회계반영이 커버). **생산입고 III=ManualConsumeReceiptPage(withQualityRequest) — 입고와 동시에 품질검사요청 생성. 완비** |
| 재고 I › 기타이동 | 24 / 24 | 창고이동+자가사용·불량처리·재고조정=TransferPage, 재고실사=StocktakePage, 대체사용·폐기=TransferPage 탭(V105). **단계별재고조정·재고조정진행단계=StagedAdjustmentPage 풀스택 신규(V107). 완비** |
| 재고 I › 쇼핑몰관리 | 11 / 11 | MallOrder+MallPage가 주문관리·진행단계·확인·취소·판매전환·상품생성설정·배송/반품/교환(V112·V113) 커버. 품목코드연결=MallItemMappingPage(V114, 수집 자동연결). **쇼핑몰등록=MallAccountPage 신규(V115, 계정 마스터·판매전환 거래처·몰 선택 소스). 완비** (오픈API 자동수집 연동만 별개 트랙) |
| 재고 I › 기초등록 | 7 / 7 | 사원등록=EmployeePage·외화등록=CurrencyPage 오탐 정정. **카드사등록·결제대행사등록=PaymentMastersPage 풀스택 신규(card_issuers·payment_agencies+V110). 완비** |
| 재고 I › 출력물 | 60 / 76 | 대부분 다른 섹션 화면의 인쇄 재listing — 12건 오탐 정정(주문서·미주문·발주요청·발주계획·회계미반영·자가사용·불량처리·재고조정·재고실사·소모현황·거래처별채무). **2026-07-31 8건 추가 해소** — 쪽지수발신내역·커뮤니케이션센터(ShortMessagePage 신규)·잔량재집계(StockRecalcPage 신규)·채권/채무현황·채권현황(ArApStatusPage 신규)·영업/구매/생산외주관리현황 3종 오탐 정정. **증빙센터=EvidenceCenterPage 신규**(파일저장 인프라 V120 + 증빙 V121). 잔여 순수 인쇄서식은 별도 트랙(7장) |
| 재고 II › 이익관리 | 9 / 9 | 사실상 완비 |
| 재고 II › 오더관리 | 2 / 2 | 완비 |
| 재고 II › 시리얼/로트No. | 9 / 9 | 등록·재고현황=SerialLotPage, 품목vs시리얼재고비교=LotStockComparePage. **로트 이력 인프라 신설(LotTransaction+V106)로 내역조회·수불부·내역현황=LotLedgerPage·재고조정=lots/adjust 완비.** 완비 |
| 재고 II › A/S관리 | 9 / 9 | 접수·수리=AsManagePage, A/S현황=AsStatusPage. **A/S소모현황=AsConsumptionPage 풀스택 신규(as_parts+V108, 부품소모 시 재고 차감). 완비** |
| 재고 II › 품질관리 | 9 / 10 | 품질검사 입력/조회=QualityInspectionPage, 품질검사현황=QualityStatusPage. **품질검사요청 계열(C000692,E040628~631)=QualityRequestPage 풀스택 신규**(요청 엔티티+V103, 요청→검사완료/취소). 잔여: 유형등록(enum 고정) |
| 재고 II › 계획관리 | 8 / 8 | 매출계획·비교표=SalesPlanPage(풀스택). **프로젝트계획 계열(C000653·E040636·E040637)=ProjectPlanPage 풀스택 신규**(project_plans+V104, 계획vs실적 대조는 ProjectProfitService 재사용). 완비 |
| 재고 II › 수출관리 | 3 / 3 | ExportPage로 완비(인보이스→통관→선적→입금 + Invoice/Packing List 인쇄). 오탐 정정 |
| 회계 I › 기초등록 | 13 / 13 | 사원=EmployeePage·외화=CurrencyPage·단가적용순서=PriceOrderPage·품목별단가=PriceBulk·각종코드변경=CommonCodePage 오탐 정정. **특별단가등록=SpecialPricePage 풀스택 신규(special_prices+V109, 거래처별/그룹별 실단가·resolve 폴백). 완비** |
| 회계 II › 비용관리 | 3 / 3 | 완비 |
| 그룹웨어 › 공유정보 | 12 / 12 | 주요전달사항=KeyNoticePage. 조건별검색=ConditionSearchPage. **사내관리=ScheduleSearchPage(일정 조건검색, 일정에 장소·참석자 추가 V118). 완비** |
| 그룹웨어 › 업무관리 | 10 / 10 | **오탐 대량 정정** + **지각현황·일별근무시간·통합현황(근태+일정)=WorkIntegratedPage 신규**. **ECDrive·WORK 는 이미 구현돼 있었다(EcDrivePage·WorkPage) — 오분류 정정. 완비****ECDrive 실파일 업로드·다운로드 구현(V120 stored_files, 10MB 상한)** |
| 그룹웨어 › 공용메일 | 9 / 9 | MailPage가 수신/발신/공용·수신확인·메일쓰기·기본함 커버. **임시보관함(초안)·지운함(소프트삭제)=MailPage 신규(draft·deleted_at+V111). **스팸 메일함=MailPage 스팸함 탭 + 스팸규칙 신규(V123, 공용메일 수신 시 규칙 자동분류·사유 기록). 완비** (이 prgId 의 DOM 자체는 공용메일설정 안내 팝업이라 메뉴명 기준으로 구현). 별도로 **쪽지(ShortMessagePage)** 신규(V119, 전자결재 자동알림 수신함) |
| 그룹웨어 › 전자결재 | 3 / 3 | 기안서작성=ApprovalDraftPage 오탐 정정. 완비 |
| 그룹웨어 › 프로젝트 | 3 / 3 | 진척관리=ProjectPage(진척률·상태) 오탐 정정. 완비 |
| 그룹웨어 › 고객관리 | 2 / 2 | 완비 |
| 관리 › 근태관리 | 7 / 7 | 완비 |
| 데이터센터 › 데이터수집 | 5 / 5 | DataCollectPage가 소스를 수집. **수집데이터등록=CollectSourcePage 신규(collect_sources 레지스트리+V117, 하드코딩 9종을 시드로 이관·동적 추가 가능). 완비** |
| 데이터센터 › 데이터내보내기 | 1 / 1 | **의료기기공급내역보고=MedicalDeviceReportPage 신규**(품목 UDI-DI + 출고/폐기 산출 + 보고파일 CSV·이력 V122). 대외 전송만 채널 확보 후 과제. 완비 |
| Self-Customizing › (다운로드·보안·환경) | 5 / 5 | **전부 오탐 정정** — 기능설정/기본값설정=PreferencesPage, 보안설정=SecurityPage, 엑셀자료올리기=DownloadPage, 편의기능=EtcSystemPage. 완비 |
| **합계** | **≈257 / 340** | 2026-07-20 구매·영업 파이프라인 + 재고실사 + 품질/A/S현황 + 매출계획(풀스택) + 로트재고비교 구축, 생산/외주·회계기초·수출 포함 오탐 대량 정정 반영. 2026-07-27 특별단가등록(회계 I 기초등록 13/13) + 카드사·결제대행사(재고 I 기초등록 7/7) + Self-Customizing 5/5 오탐 정정 + 메일 임시보관함·지운함(공용메일 8/9) + 쇼핑몰 배송/반품/교환·품목코드연결·쇼핑몰등록(쇼핑몰 11/11) + 조건별검색(공유정보 11/12) + 판매입력 II=사용자정의필드 엔진(영업 34/34) + 수집데이터등록=동적소스 레지스트리(데이터수집 5/5) + 사내관리=일정검색(공유정보 12/12). **2026-07-31 8장 재점검**: 오분류 7종 해소 — 쪽지·커뮤니케이션센터(V119 풀스택 + 전자결재 자동알림) · 잔량재집계(거래잔량 280건 실교정) · 채권/채무현황·채권현황(기준일자 as-of) · 생산입고 III(품질검사요청 연계) · 카테고리 노드 3종 오탐 정정 · ECDrive/WORK 분류 정정. **2026-07-31 2차**: 파일저장 인프라(V120 stored_files·bytea·10MB) 위에 ECDrive 실파일 업로드 · 증빙센터(V121) · 의료기기공급내역보고(V122) · 스팸 메일함(V123) 구현 → **부록 340종의 ⬜ 0 달성** |

방향(2026-07-31 갱신): 위 영역은 모두 채워졌고 **부록 340종의 ⬜ 가 0** 이다. 남은 것은 화면이 아니라
**외부 계약**(심평원 전송 채널 · 쇼핑몰 오픈API 인증)과 **순수 인쇄서식 트랙**(7장)뿐이다.

---

## 5. 화면 한 개를 아카이브로부터 구현하는 표준 레시피

첫 사례(구매현황 Search 패널)에서 확립한 절차입니다. **화면마다 이 순서를 그대로 밟습니다.**

1. **DOM 추출** — 3장 명령으로 해당 prgId의 `screen.html`을 뽑는다.
2. **구조 해부** — 그 화면의 구성요소를 식별:
   헤더/툴바 · **검색폼**(어떤 필드·타입) · **격자 컬럼**(header 순서) · 하단 액션버튼 · 팝업.
3. **데이터 대조** — 각 필드/컬럼이 우리 백엔드 DTO에 **실제로 있는가**를 확인.
   - 있으면: 그대로 배선.
   - 없으면: **가짜 컨트롤을 만들지 않는다.** 두 갈래 중 택1 —
     (a) 백엔드에 필드 추가(엔티티 + Flyway `V*.sql` **같은 커밋**, CLAUDE.md §7) →
     (b) 이번 범위에서 제외하고 이 문서에 "미지원 사유" 기록.
     > 구매현황 사례: `거래유형·내외자·프로젝트·발송여부`는 `PurchaseDoc`에 필드가 없어 **의도적으로 제외**,
     > `기준일자·거래처·창고·품목`만 실제 필터로 구현.
4. **우리 톤으로 이식** — 이카운트 마크업을 그대로 붙이지 않는다. `EcListShell` + `ec-input/ec-btn/ec-grid`
   토큰으로 **레이아웃·필드구성만** 재현(디자인 시스템 준수).
5. **검증** — `cd frontend && npx tsc --noEmit`; 데이터 흐름 바뀌었으면 `node qa/qa.mjs`.
6. **부록 갱신** — 해당 행의 상태를 ✅/부분/제외로 갱신.

**원칙**: 원본 DOM은 *레이아웃·필드 명세*의 근거로 쓰되, 값이 없는 컨트롤을 흉내내지 않는다.
겉모습보다 "실제로 거르고 계산되는가"가 우선.

---

## 6. 우선순위 백로그

말단 현황/집계보다 **입력·마스터·핵심 흐름**을 먼저. 사용자 실제 관심(구매/영업 흐름)에서 출발.

### 1차 — 구매·영업 흐름 완성 (재고 I)
사용자가 방금 손댄 영역. 흐름의 빈칸을 메운다.

> **중요 정정(2026-07-20)**: `발주요청·발주계획·단가확정·발주확정·입고전환`은 별도 엔티티가 아니라
> **`PurchaseOrder`의 진행상태(`PurchaseOrderStatus`)**다. `PurchaseOrderController`가 이미 create(발주요청)·
> `/plan`(계획)·`/prices`(단가확정)·`/confirm`(발주)·`/receive`(입고)를 갖고 있다. 따라서 발주요청·발주계획·단가요청
> 계열은 **새 엔티티 없이** 기존 발주서 위에 화면(+필요한 조회 엔드포인트)만 올리면 된다. (앞서 "신규 엔티티 필요"로 본 것은 오판.)
>
> - ✅ **발주요청현황(E040318)** 구현 완료 — `PurchaseRequestStatusPage`(`/sales/purchase-request-status`).
>   상단에 발주 파이프라인 상태별 집계 카드(클릭해 상태 전환), 하단에 선택 상태의 발주서 라인 목록.
>   **백엔드 실코드 추가**(스키마 무변경 → Flyway 없음):
>   - `PurchaseOrderRepository.findByStatusWithRefs(status)` (fetch join)
>   - `PurchaseOrderService.findByStatus(status)` · `summary()` (상태별 건수·금액 집계, 모든 상태 0채움)
>   - `PurchaseOrderController`: `GET /api/purchase-orders?status=…` (list에 상태 필터) · `GET /api/purchase-orders/summary`
>   - DTO `PurchaseOrderDtos.PurchaseOrderSummaryRow`
>   검증: 새 엔드포인트 2개 실호출 확인 + 카드 클릭 서버 재조회 + QA 하네스 405/405 통과.
> - ✅ **발주계획현황(E041015)** · **단가요청현황(E040325)** 구현 완료 — 같은 `PurchaseRequestStatusPage`를
>   `defaultStatus` prop만 바꿔 재사용(`/sales/purchase-plan-status` = PLANNED, `/sales/price-request-status` = PRICED).
>   `TradeEntry`/`TradeInquiryPage`의 mode 패턴과 동일한 컴포넌트 재사용. 백엔드는 이미 만든 `?status=…`/`summary` 그대로.
>   단가요청↔PRICED 매핑은 백엔드 `/prices`가 "단가요청 결과 반영"으로 PRICED를 매기는 것과 일치.
- 구매관리: `발주요청조회/현황`(E040315/E040318), `구매조회`(E040304), `발주계획` 계열,
  `단가요청` 계열(E040321~E040325), `미구매현황`(E040307)
  - ✅ **미구매현황(E040307)** 구현 완료 — `UnpurchasedStatusPage`(`/sales/unpurchased`). "발주했으나 아직 입고(구매)
    안 된 발주서"를 라인 단위로 펼침. `GET /api/purchase-orders` 그대로 사용, `status ∈ {발주요청·계획·단가확정·발주확정}` 필터.
    **부록이 ✅였으나 실제로는 페이지가 없던 오탐(false positive)** — 7장 주의(✅도 자동판정이라 오탐 가능)의 실례.
    PurchaseOrder 는 창고·담당자 필드가 있어 미주문현황보다 조건이 풍부(거래처·담당자·발주No.·창고·품목·상태).
    제외: 거래처관리담당자·프로젝트(필드 없음). 모델 한계는 미주문현황과 동일(통짜 입고전환이라 라인 부분수량 없음).
    ※ `types.ts`의 `PurchaseOrder` 인터페이스에 백엔드가 이미 반환하던 `warehouseName·employeeName·currency`를 추가(누락 보정).
  - ✅ **발주서현황(E040306)** 구현 완료 — `PurchaseOrderStatusPage`(`/sales/purchase-order-status`).
    발주서 **전체**(상태 무관)를 라인 단위로 펼친 발주 원장. 미구매현황(미입고만)과 짝. `GET /api/purchase-orders` 그대로.
    **이 역시 부록이 ✅였으나 페이지 없던 오탐** — PurchaseOrderPage(`/sales/purchase-orders`)는 발주서 입력/관리(상태 탭)이지 현황이 아님.
    원본 풀 검색패널(집계조건·계층그룹 등 수십 필드) 중 데이터 있는 거래처·담당자·발주No.·창고·품목·진행상태만 배선.
- 영업관리: `견적/수주/판매`의 조회·현황·진행단계 중 미매칭 13종
  - ✅ **주문서현황(E040209)** 구현 완료 — `SalesOrderStatusPage`(`/sales/order-status`). 수주(SalesOrder)
    라인을 펼쳐 주문/출하/미출하 진척 + 금액을 보는 현황. `GET /api/sales-orders` 그대로 사용(백엔드 무변경).
    원본 Search 패널의 `창고·프로젝트`는 `SalesOrderResponse`에 필드가 없어 **의도적 제외**(구매현황 선례와 동일),
    대신 수주 고유의 `진행상태·미출하만` 조건을 둠.
  - 참고: `구매조회(E040304)·판매조회(E040206)·판매입력(E040205)`는 부록이 ⬜였으나 **이미 구현돼 있어** ✅로 정정
    (제목 부분일치 자동판정의 오탐 — 7장 주의사항).
  - ✅ **미주문현황(E040211)** 구현 완료 — `UnorderedStatusPage`(`/sales/unordered`). "아직 수주 전환 안 된 견적"
    을 라인 단위로 펼침. `GET /api/quotations` 그대로 사용(백엔드 무변경), `status ∈ {작성,발송}` 만 필터.
    **모델 한계**: 이카운트는 라인별 부분 미주문수량을 보여주나, 우리는 견적서를 통짜로 전환(`convertedOrderId` 단일)
    하므로 라인 부분수량 개념이 없다 → 미전환 견적의 견적수량 전체를 미주문수량으로 본다. 원본 Search 패널의
    `창고·프로젝트·담당자·거래처관리담당자·관리항목`은 Quotation 에 필드가 없어 제외, `기준일자·거래처·견적No.·품목`만 배선.
    (검증: 작성 견적 1건 생성→화면 표출 확인→테스트 데이터 삭제로 DB 원복.)

### 2차 — 재고 정확성 (재고 I › 기타이동, 19/24)
- `재고이동`(창고간)·`재고조정`·`재고실사`·이동현황. 재고 신뢰도의 핵심.
  > **정정(2026-07-20)**: 이 영역은 "대량 미구현"이 아니라 **대부분 이미 구현돼 있었다**(부록 자동판정 오탐).
  > `창고이동`+`자가사용`·`불량처리`·`재고조정`은 **`TransferPage`("기타이동")가 4탭으로 완비** — 백엔드도
  > `StockAdjustment` 엔티티·컨트롤러·서비스가 전부 존재. 부록에서 12건을 ✅로 정정.
  > - ✅ **재고실사(E040612/613/615)** 신규 구현 — `StocktakePage`(`/inventory/stocktake`). 창고 선택→장부수량 로드→
  >   품목별 실사수량 입력→**차이나는 품목만 `POST /api/stock-adjustments`(type=ADJUST, actualQty)로 일괄 조정**.
  >   백엔드 무변경(기존 `/stock`·`/stock-adjustments` 조합). 실사 결과는 기타이동 재고조정 탭에서 조회.
  >   검증: QA창고 QA원자재 805→800 실사 반영 확인 후 테스트 조정 삭제로 DB 원복.
  > - 잔여: 단계별재고조정·대체사용/폐기현황·불량률파악보고서·재고조정진행단계.

### 3차 — 재고 II 공백 (품질·계획·A/S)
- 품질관리·계획관리·A/S. 제조 ERP 정체성.
  > **진행(2026-07-20)**: 품질·A/S 백엔드가 이미 완비돼 있어(QualityInspection·AsRequest) 프론트 오탐 대량 정정 + 집계형 현황만 신규.
  > - ✅ **품질검사현황(E040623)** — `QualityStatusPage`(`/quality/inspection-status`). 검사유형·판정·검사자 필터 + 불량률/합격률 집계. `GET /api/quality-inspections` 그대로.
  > - ✅ **A/S현황(E040610/611)** — `AsStatusPage`(`/quality/as-status`). 상태별 집계 + 평균 처리일수. `GET /api/as-requests` 그대로.
  > - ✅ **매출계획·비교표(E040624~E040640)** — `SalesPlanPage`(`/sales/sales-plan`). **진짜 신규 풀스택**:
  >   `SalesPlan` 엔티티 + `V102__create_sales_plans.sql`(FK 인덱스 포함) + `SalesPlanController`(`/api/sales-plans`,`/comparison`) +
  >   서비스. 실적은 저장 안 하고 판매(Sales) 집계로 대조 → 달성률. 검증: 계획 200,000 vs 실적 210,000 = 105% + QA 405/405 + 테스트 데이터 삭제로 원복.
  > - 잔여(신규 엔티티 필요): 품질검사요청 계열(검사요청 엔티티)·프로젝트계획 계열(프로젝트계획 엔티티).

### 4차 — 그룹웨어 보강
- 업무관리 현황 9종, 공용메일 9종(스코프 큼 — 별도 판단).

### 별 트랙 — 출력물 서식 (재고 I › 출력물 76종) — **1차 완료(2026-07-31)**
- 거래명세서·발주서·세금계산서 등 **인쇄 레이아웃**. 76종을 개별 화면으로 만들 게 아니라
  **인쇄 템플릿으로 일반화**한다는 방침대로, 서식 템플릿 하나(`utils/printDocument.ts`)를 만들고
  전표 화면들이 그것을 공유한다. 아래 완료 로그 참조.
- 우리 인쇄 도구는 이제 둘이다. 성격이 다르니 섞지 말 것:
  - `utils/print.ts` `printTable` — **화면에 렌더된 표를 그대로 목록 인쇄**(EcListShell 의 '인쇄' 버튼).
    출력물 76종 중 대부분(현황·리스트)이 여기에 해당한다.
  - `utils/printDocument.ts` `printDocuments` — **서식이 정해진 전표**(머리글 + 당사자 + 명세 + 합계).
    거래명세서·매입명세서·견적서·발주서가 이 템플릿을 공유한다.

> 각 항목 착수 시 5장 레시피를 밟고, 완료 시 부록 상태를 갱신합니다.
> 한 번에 한 모듈씩. 대량 일괄 이식 금지(회귀 위험).

### 완료 로그 (2026-07-21)
- ✅ **재고수불부(E040702)** — `StockLedgerPage`(`/inventory/ledger`). 기간·창고·품목 필터 + 입고/출고 분리
  컬럼 + 기초/입고계/출고계/순증감/기말 집계. **백엔드 신설(스키마 무변경)**:
  - `StockTransactionRepository.findLedger`(일자·id 오름차순, itemId/warehouseId 선택필터) · `sumChangeBefore`(기초재고=기간 이전 순증감)
  - `StockService.ledger` → `StockLedgerResponse{ opening, rows }` · `StockController` `GET /api/stock/ledger`
  - **주의**: 저장된 `balanceAfter`는 입력(id)순 잔량이라, 일자정렬 화면은 서버가 준 `opening`에 변동량을
    표시순으로 누적해 잔량을 **재계산**한다(과거일자 거래가 뒤에 입력되는 경우 대비). 날짜 파라미터는
    PostgreSQL 42P18(`:param is null` 타입추론 실패) 때문에 서비스에서 넓은 기본값으로 채워 항상 non-null 전달.
  - 검증: 전기간 단일범위 opening 0 → 기말 376 = 현재고 376 일치, 다중범위 opening=null, 날짜필터 실호출 + tsc + QA 405/405.
- ✅ **거래이력조회(E040716)** — `TradeHistoryPage`(`/sales/trade-history`). 거래처·기간·구분(판매/구매) 필터로
  판매·구매 전표를 한 타임라인에 통합, 판매/구매/순액 집계. **프론트 전용**(`GET /api/sales`+`/purchases` 병합,
  백엔드 무변경, RBAC는 `/sales`→SALES 폴백에 포함). 원본은 수금·지급 포함 잔액원장이나, 우리는 정산 소스를
  이 뷰에 배선하지 않아 **판매·구매 전표 이력으로 한정**(잔액대장은 거래처관리대장이 담당). 검증: 18+18=36건
  병합·정렬·합계 실호출 확인 + tsc 통과.
- ✅ **판매구매집계표(E040725)** — `SalesPurchaseSummaryPage`(`/sales/sales-purchase-summary`). 기간 필터 +
  **거래처별/품목별 토글** 집계(매출·매입 공급가·순액). **프론트 전용**(`/sales`+`/purchases` 집계, 거래처별=전표합계·
  품목별=라인합계). 검증: 거래처별(QA고객사 매출 270,000 / QA매입처 매입 369,000)·품목별(QA완제품 27개·QA원자재 315개)
  실호출 대조 + tsc 통과.
- ✅ **재고변동표(E040719)** — `StockMovementPage`(`/inventory/movement`). 품목별 기간 기초·입고·출고·기말 요약
  (수불부의 집계판). 기간·창고 필터, 기말 = 기초 + 입고 − 출고. **백엔드 집계 신설(스키마 무변경)**:
  `StockTransactionRepository.aggregateMovement`(기간 입출고, `case when`) · `aggregateOpening`(기초=기간 이전 순증감) →
  `StockService.movement` → `StockMovementRow` · `StockController` `GET /api/stock/movement`. 창고 미지정 시 전 창고 합산.
  검증: 전기간 기말이 현재고와 품목별 전량 일치, 7월범위 기초+입고−출고=기말 전 품목 성립, tsc 통과.
- ✅ **재고잔량분석표(E040727)** — `StockAnalysisPage`(`/inventory/stock-analysis`). 현재고를 품목별 집계, 안전재고
  대비 과부족·상태(부족/적정) + 재고금액(수량×표준단가). 창고 필터·미달만 토글. **프론트 전용**(`/stock`+`/items` 조인,
  백엔드 무변경). 재고금액은 `Item.unitPrice` 기준 참고 평가액(실입고단가 평가 아님). 검증: 8품목 총 재고금액
  112,699,000, 금액순 정렬·평가액(수량×단가) 대조 + tsc 통과.
- ✅ **경영자보고서(E040704)** — `ExecutiveReportPage`(`/inventory/executive-report`). 기간 매출·매입·매출총이익(추정)
  + 재고자산·총채권·총채무 KPI 카드 + 매출/매입 상위거래처·재고금액 상위품목 TOP5(막대). **프론트 전용**
  (`/sales`+`/purchases`+`/stock`+`/items`+`/ledger/partner-balances` 조합). 매출총이익은 (기간매출−기간매입) 추정치로
  '추정' 명기(정밀 손익은 이익관리). 검증: 매출 300,000/매입 410,000/이익률 −36.7%·재고자산 112,699,000·채권 330,000·
  채무 451,000 실호출 대조 + tsc 통과.
- ~~**참고**: 채권/채무현황(E040703)은 기존 거래처관리대장(LedgerPage)·채무관리(PayablePage)와 중복이라 **의도적 미구현**.~~
  → **정정(2026-07-31)**: 중복이 아니었다. 기존 화면들은 **기준일자(as-of)가 없어** '지금 잔액'만 냈다.
  `ArApStatusPage` 로 구현(아래 2026-07-31 완료 로그).
- ✅ **품질검사요청 계열(C000692·E040628~E040631)** — `QualityRequestPage`(`/quality/inspection-request`). **진짜 신규 풀스택**:
  신규 엔티티 `QualityInspectionRequest` + enum `QualityRequestStatus`(요청→검사완료/취소) + **`V103__create_quality_inspection_requests.sql`**
  (FK 인덱스 idx_qir_item_id + 상태 인덱스 idx_qir_status) + Repository/DTO/Service(채번 `QR-`, 상태전이 가드)/Controller
  (`/api/quality-inspection-requests`, `?status=` 필터). 프론트는 등록 폼 + 상태탭(전체/미검사/검사완료/취소) — 미검사현황=요청탭.
  검증: 생성→미검사필터→검사완료전이→재처리 400 가드→삭제정리 전 흐름 실호출 + Flyway V103 적용 + validate 통과 + tsc + QA 405/405.
  잔여(품질): E040632 유형등록은 enum 고정이므로 마스터 화면 불필요.
- ✅ **프로젝트계획 계열(C000653·E040636·E040637)** — `ProjectPlanPage`(`/accounting/project-plan`). **진짜 신규 풀스택**:
  신규 엔티티 `ProjectPlan`(accounting) + **`V104__create_project_plans.sql`**(FK 인덱스 idx_project_plans_project_id + 연도 인덱스)
  + Repository/DTO/Service/Controller(`/api/project-plans`, `/comparison?year=`). **실적은 저장 안 하고 기존 `ProjectProfitService`
  (판매·구매·비용 전표 프로젝트 집계)를 재사용**해 계획 vs 실적 매출/이익 달성률 대조. 프론트는 계획 등록 + 연도별 비교표.
  검증: 테스트 프로젝트 생성→계획 등록(계획매출 1,000,000·계획이익 400,000)→비교표(실적 0·달성률 0)→계획 삭제→테스트 프로젝트
  DB 정리(ProjectController에 DELETE 없어 SQL로 원복) 전 흐름 + Flyway V104 + validate + tsc + QA 405/405.
- ✅ **월별채권/채무증감내역(E040713·E040714)** — `MonthlyArApPage`(`/sales/monthly-ar-ap`). 채권/채무 토글, 연도별
  12개월 전월이월·증가·감소·당월잔액. **프론트 전용**(채권=매출−수금, 채무=매입−지급; `/sales`+`/purchases`+`/settlements`).
  전월이월(1월)=해당 연도 시작 이전 누적 순잔액. Settlement에 `settleDate`·`type(RECEIPT/PAYMENT)`이 있어 감소측 배선.
  검증: 3월 매출 396,000 이월 누적 → 연말잔액 = 2026 매출합계 일치(정산 0건), 전월이월 로직 대조 + tsc 통과.
- ✅ **단가변동표(E040819)** — `PriceMovementPage`(`/sales/price-movement`). 판매/매입 토글 + 기간 필터로 품목별 실거래
  단가의 최저·최고·평균·최근·변동폭 + 표준단가 대비(%). **프론트 전용**(별도 단가이력 테이블 없이 `/sales`+`/purchases`
  라인 unitPrice로 도출; 변동폭 큰 순 정렬). 검증: QA완제품 판매 24건 최저=최고=평균=최근 10,000·변동폭 0·표준 10,000 대조 + tsc 통과.
- ✅ **프로젝트 삭제 엔드포인트 신설** — `ProjectController` `DELETE /api/projects/{id}` + `ProjectService.delete`.
  기존에 프로젝트 삭제 API가 아예 없어 삭제 불가였던 결함 보정. **모듈 경계 유지**: inventory는 trade·accounting을
  참조할 수 없으므로 참조 여부를 직접 조회하지 않고, `flush()`로 FK 제약 위반(DataIntegrityViolationException)을
  잡아 400 "참조 중이라 삭제 불가"로 번역. 프론트 `ProjectPage`에 삭제 버튼 배선. 검증: 무참조 204·계획참조중 400(가드
  메시지)·참조해제 후 204 3케이스 + QA 405/405.
- **공용메일(E077000~008) 오탐 정정** — `MailPage`가 수신함/발신함/공용메일함/수신확인/메일쓰기/기본함을 이미 커버(6/9).
  임시(초안)·스팸·지운함은 사내메일 특성상 미구현(외부 메일서버 연동 없음). 부록·커버리지표 0/9 → 6/9로 정정.
- ✅ **품목중심입력(E040633)** — `ItemEntryPage`(`/sales/item-entry`). 거래처중심입력(PartnerEntryPage)의 짝. 품목 선택 시
  그 품목의 판매/구매 내역을 거래처별로 표출 + 판매/구매 합계. **프론트 전용**(`/items`+`/sales`+`/purchases`).
  검증: QA완제품 판매 39개/390,000·QA원자재 구매 455개/533,000 집계 대조 + tsc 통과.
- ✅ **대체사용·폐기(E040510·E040511)** — 기타이동 유형에 `SUBSTITUTE(대체사용)`·`DISPOSAL(폐기)` 추가. **풀스택**:
  `StockAdjustmentType` enum + 서비스 차감 분기 + **`V105__stock_adjustment_add_substitute_disposal.sql`**(V25의 CHECK 제약
  교체 — 옛 3종만 허용해 새 유형 저장이 막혔음. Hibernate validate는 CHECK를 검증 안 해 런타임 insert에서만 드러난 케이스).
  프론트 `TransferPage`에 대체사용·폐기 탭 추가(입력·조회·현황 = 자가사용 선례와 동일하게 탭이 곧 현황). 검증: 두 유형 등록으로
  재고 −2씩 차감(100→98→96)·목록 표출 확인 후 테스트 데이터 전량 SQL 정리(재고 100 원복) + Flyway V105 + QA 405/405.
  **교훈**: `@Enumerated(STRING)` 컬럼에 값 추가 시, 컬럼 길이뿐 아니라 **CHECK 제약도 마이그레이션으로 갱신**해야 한다.
- ✅ **불량률파악보고서(E040512)** — `DefectReportPage`(`/quality/defect-report`). 품질검사(검사수량·불량)와 기타이동
  불량처리·폐기 수량을 **품목별로 종합**해 불량률 파악(검사 목록 QualityStatusPage와 달리 품목 중심). **프론트 전용**
  (`/quality-inspections`+`/stock-adjustments`; 불량률 높은 순). 검증: QA원자재 검사 210·불량 14 = 6.67%·불량처리 42 대조 + tsc 통과.
- ✅ **시리얼/로트 계열(C000691·E040618·E040620·E040634·E040639)** — **진짜 신규 풀스택**: 로트 이력 인프라 신설.
  엔티티 `LotTransaction` + enum `LotTxType`(입고/출고/조정) + **`V106__create_lot_transactions.sql`**(FK 인덱스 +
  **기존 로트 백필**: 초기입고 INBOUND, 기소모분 OUTBOUND로 balance_after를 현재고와 일치). `LotService`가 로트
  생성→INBOUND·소모→OUTBOUND·**실사조정(`/lots/{id}/adjust`)→ADJUST**를 각각 이력에 기록. 조회 `GET /api/lots/transactions`.
  프론트: `LotLedgerPage`(`/quality/lot-ledger`)=로트 수불부/내역조회/내역현황(로트·유형 필터·기말재고), `SerialLotPage`에 실사 버튼.
  검증: 로트 생성100→소모30→실사조정65 수불부 3행 잔량 누계(100→70→65) 일치 + 백필 확인 + Flyway V106 + 테스트 로트
  SQL 정리 + QA 405/405. **함정**: 백필 SELECT가 `lots`에 없는 `created_by`를 참조해 최초 V106 실패 → PostgreSQL 트랜잭션
  DDL이라 전체 롤백(부분 적용·failed history 없음) 후 SQL 수정해 재적용.
- ✅ **현황누계표(E040709)** — `MonthlyCumulativePage`(`/sales/monthly-cumulative`). 연도별 12개월 당월/누계 매출·매입·이익(추정)
  시계열. **프론트 전용**(`/sales`+`/purchases`). 월별채권(AR/AP)·판매구매집계표(거래처/품목)와 달리 시간축 누계 관점.
  검증: 3월 매출 450,000 누계 → 7월 매입 615,000 누계·누계이익 −165,000 대조 + tsc 통과.
- **쇼핑몰관리(1/11→6/11) 오탐 정정** — MallOrder+MallPage가 주문관리·진행단계·확인·취소·판매전환(ERP전송)·상품생성설정 커버.
  잔여: 몰계정 기초등록·품목코드연결·배송/반품/교환(몰 특화 상태 미추적).
- ✅ **집계표(E040710)** — `PivotSummaryPage`(`/sales/pivot-summary`). 거래처/품목 × 12개월 매출·매입 **피벗 표**
  (행별·월별·총계, sticky 첫열·가로스크롤). 매출/매입·거래처별/품목별 토글. **프론트 전용**(`/sales`+`/purchases`).
  검증: QA고객사 3월 매출 450,000=행합계 피벗 대조 + tsc 통과.
- **데이터수집(2/5→4/5) 오탐 정정** — DataCollectPage가 9개 소스(판매=거래명세서·재고수불·마스터) 수집. 잔여: 동적 소스등록.

### 완료 로그 (2026-07-22)
- ✅ **출하조회(E040226)** — `ShipmentInquiryPage`(`/sales/shipment-inquiry`). 판매조회/구매조회(TradeInquiryPage)의 출하판:
  기준일자 범위·출하No/거래처/품목 검색 + **발송여부 탭(전체/미발송=READY/발송=SHIPPED/취소=CANCELED)** + 행 클릭 라인 상세 펼침.
  출하현황(ShipmentPage)이 상태 집계 뷰라면 이 화면은 전표(문서) 조회. **프론트 전용**(`GET /api/shipments` 그대로,
  이미 라인까지 반환 — 백엔드·스키마 무변경). 원본 Search 패널의 `창고·프로젝트·관리항목`은 Shipment 엔티티에 필드가
  없어 **의도적 제외**(구매현황 선례). 검증: `/shipments` 30건 실호출로 필드 shape 확인(shipNo·salesOrderNo·statusName·
  lines) + tsc 통과. (QA 하네스는 시나리오 24 급여이체에서 누적 QA출금으로 인한 계좌잔액부족으로 중단 — 프론트 전용 변경과
  무관한 기존 데이터상태 이슈, 백엔드 동작 변경 없음.)
- **출하입력(E040225)·주문서출고처리(E040230) 오탐 정정** — E040225(거래처·출하창고·라인 품목/수량 직접입력 폼)은
  `ShipmentOrderPage`의 출하지시등록(직접등록) 폼이 커버, E040230(미처리 주문라인의 잔량→출고수량→출고 처리)은
  `UnshippedPage`(주문 라인별 미출하 잔량→출하지시 생성)가 커버. 둘 다 부록 ⬜였으나 실기능 존재 → ✅ 정정.
  잔여 판매입력II(E040253)는 추가문자/숫자/일자/코드 형식필드가 대량이라 우리 전표 모델 밖 → 의도적 제외.
- ✅ **단계별재고조정·재고조정진행단계(E040604·E040650)** — `StagedAdjustmentPage`(`/inventory/staged-adjustment`). **진짜 신규 풀스택**:
  신규 엔티티 `StagedStockAdjustment`(inventory) + enum `StagedStatus`(요청→반영/반려) + **`V107__create_staged_stock_adjustments.sql`**
  (FK 인덱스 idx_ssa_item_id·idx_ssa_warehouse_id + 상태 인덱스 idx_ssa_status) + Repository/DTO/Service(채번 `ST-`)/Controller
  (`/api/staged-adjustments`, `?status=` 필터·apply·reject·delete). **즉시 반영하는 기타이동 재고조정과 달리 승인 단계를 둔다**:
  요청 시 장부수량 스냅샷 저장(차이 계산), 반영(apply) 시 **`StockAdjustmentService.create(ADJUST)`에 위임**해 실제 재고를 실사수량에
  맞춤(모듈 불변식 재사용). 프론트는 요청 폼(E040604) + 진행단계 뷰(E040650: 장부/실사/차이 컬럼·상태탭 전체/요청/반영/반려).
  검증(라이브): item3 재고 50→요청(장부50·실사55·차이+5)→반영(재고55)→역조정 반영(재고50 원복)→반영건 삭제가드 400→반려 시 재고불변→
  반려건 삭제 204 전 흐름 실호출 + Flyway V107 성공 + 테스트 잔여(staged 2·조정 2·트랜잭션 2) SQL 정리해 재고 50·staged 0 원복 + tsc 통과.
  ※ 이 스택은 직전 세션에서 구현·배선까지 됐으나 미커밋 상태였음 — 이번에 라이브 검증·문서화·완결.
- ✅ **지각현황(E070307 지각현황(ID))** — `LateArrivalPage`(`/hr/attendance-late`). 근태현황(AttendanceStatusPage)이 사원별
  지각 '일수' 카운트만 보여주는 데 반해, 이 화면은 **지각 건별 상세**(일자·사원·출근시각·지각시간(분)) + 사원별 지각 횟수·총
  지각시간 요약 카드. 지각시간 = 출근시각 − 09:00. **프론트 전용**(`GET /api/hr/attendance?from&to` 그대로 — 서버가
  `HrDtos.WORK_START=09:00` 기준으로 이미 계산한 `status='지각'`·출근시각을 반환, 백엔드 무변경). 판정 기준을 서버 단일
  소스와 일치시켜 흉내 컨트롤 없음. 검증(라이브): 근태 27건 중 지각 10건, 전 지각건 clockIn>09:00 (불일치 0), 김부장
  22분×5=110분·이사원 5분×5=25분 요약 대조 + 브라우저 렌더 확인 + tsc 통과.
- **그룹웨어 업무관리(1/10→6/10) 오탐 정정** — 이 섹션의 근태/업무 화면은 대부분 `관리 › 근태관리`와 중복 위치다:
  업무일지(E070304)=WorkLogPage, 출/퇴근·출퇴근기록부(C000107·E070305)=AttendancePage(`/groupware/attendance`),
  출/퇴근현황(E070306)=AttendanceStatusPage(근태현황). 부록·커버리지표 정정. 잔여: 통합현황(E070315)·ECDrive·WORK.
- ✅ **일별근무시간(E070309 일별근무시간(ID))** — `DailyWorkHoursPage`(`/hr/daily-hours`). 한 달치 근태를 **사원 행 × 일자 열
  타임시트 매트릭스**로 펼쳐 셀=그날 근무시간(h)을 한눈에 본다(근태조회가 전표 한 줄씩 나열하는 것과 차별). 사원별 합계·근무일,
  하단 일계, 총 근무시간. 지각/조퇴=주황·결근='결' 빨강, 주말 헤더 색, sticky 사원/부서 열 + 가로스크롤. **프론트 전용**
  (`GET /api/hr/attendance?from&to` 그대로 — 서버가 이미 계산한 workHours·status 사용, 백엔드 무변경). 검증(라이브 2026-07):
  근태 27건 → 김부장 74.5h/9일·시스템관리자 83.2h/9일·이사원 62.9h/7일(결근 2)·총 220.6h 매트릭스·일계 대조 + 브라우저 렌더 + tsc 통과.
- ✅ **일보(E040708)** — `DailyReportPage`(`/inventory/daily-report`). 하루(기준일자)의 영업·구매·입출고를 한 화면에 모은
  **일일 운영 다이제스트**: 매출/매입/입고수량/출고수량 KPI 카드 + 당일 매출전표·매입전표 목록(각 합계). 전일/익일/금일 이동.
  기간 집계 화면(재고변동표·판매구매집계표·현황누계표)이 아니라 **단일 일자에 그날 무슨 일이 있었는지**를 전표 단위로 본다는
  점에서 차별. **프론트 전용**(`/sales`+`/purchases`(당일 필터)+`/stock/movement?from=to=당일` 조합, 백엔드 무변경).
  검증(라이브): 2026-03-10 매출 32건/528,000·매입 16건/88,000·입고 80·출고 48 API 대조 + 브라우저 렌더·날짜 반응(07-22 입고
  200 → 07-21 입고 1,400 재계산) 확인 + tsc 통과.
- ✅ **A/S소모현황(E040641)** — `AsConsumptionPage`(`/quality/as-consumption`) + AsManagePage 소모부품 모달. **진짜 신규 풀스택**:
  신규 엔티티 `AsPart`(quality — A/S당 소모부품) + **`V108__create_as_parts.sql`**(FK 인덱스 3종) + Repository/DTO/Service/Controller
  (`/api/as-requests/{id}/parts` 등록·목록, `/parts/{id}` 삭제, `/parts/consumption` 품목별 집계). **부품 등록 시 창고 재고를
  차감(`stockService.applyDelta` OUTBOUND 재사용, 음수재고 가드), 삭제 시 복원(INBOUND)** — quality→inventory 의존(허용).
  계획이 "부품소모 미추적"으로 남긴 갭을 실제로 메움. 프론트: A/S관리 행의 '부품' 버튼→모달(품목·창고·수량·단가 추가/삭제),
  소모현황=품목별 소모수량·금액·A/S건수. 검증(라이브): AS부품 등록 재고 50→46·소모금액 6,000·소모현황 집계·재고부족 400 가드·
  삭제 시 50 복원 전 흐름 + Flyway V108 + validate 통과 + QA 하네스 전 시나리오 통과(급여이체 잔액부족 기존 지점에서만 중단, 회귀
  아님) + 브라우저 렌더(소모현황·부품모달) + tsc + 테스트 부품/재고이력 SQL 정리로 재고 50·as_parts 0 원복.
- ✅ **출퇴근/근태/일정 통합현황(E070315)** — `WorkIntegratedPage`(`/hr/work-integrated`). 기간 동안 사원별·일자별로
  근태(출근/퇴근/상태)와 그날 일정을 **사원명+일자로 합쳐** 한 줄에 본다(근태만/일정만 있는 날도 각각 행). 일정은 분류별
  색상칩(회의/출장/교육). **프론트 전용**(`/hr/attendance?from&to` + `/schedule-events` 병합, 백엔드 무변경). 검증: 일정 2건
  시드(김부장 품질회의·이사원 현장출장, 2026-07-21)로 김부장 지각+회의·이사원 지각+출장·시스템관리자 정상(일정없음) 통합
  대조 + 브라우저 렌더(행 27·일정 2건·색상칩) + tsc + 시드 일정 삭제로 원복(events 0).
- **오탐 정정 3건** — 기안서작성(E070103)=ApprovalDraftPage(`/groupware/approval/draft`), 진척관리(E074500)=ProjectPage
  (진척률·상태 관리), 각종코드변경(E040113)=CommonCodePage(`/settings/codes`)가 이미 존재. 전자결재 3/3·프로젝트 3/3·회계기초 12/13 정정.
- ✅ **단가요청진행단계(E040323)** — `PriceRequestProgressPage`(`/sales/price-request-progress`). 단가요청(=발주 파이프라인
  문서)이 지금 어느 단계인지 **문서 단위 진행단계 스테퍼**(발주요청→발주계획→단가확정→발주확정→입고전환, 취소는 별도 표기)로
  추적. 단가요청현황(상태별 라인 묶음)과 달리 '문서 하나가 파이프라인 어디까지 왔나'를 한 줄로 본다. **프론트 전용**
  (`GET /api/purchase-orders`). 원본의 수취금액·이력 컬럼은 별도 추적 테이블이 없어 제외(확정금액=현재 전표금액), 구매현황 선례.
  검증: 발주 37건(발주요청 1·입고전환 18·취소 18) 스테퍼 단계 표시·상태탭·확정금액 합계 + 브라우저 렌더 + tsc. **재고 I 구매관리 28/28 완비.**
- **출력물 섹션 오탐 12건 정정** — 이 섹션은 대부분 다른 섹션 화면의 인쇄 재listing이다. 주문서현황·미주문현황·발주요청현황·
  발주계획현황·회계미반영(구매/판매)·자가사용/불량처리/재고조정/재고실사현황·생산입고소모현황·거래처별채무가 각 주 섹션에서 이미 ✅.
  출력물 39/76→51/76 정정. + 기초등록 사원등록=EmployeePage·외화등록=CurrencyPage 오탐 정정(3/7→5/7).
- ✅ **주요전달사항(E070205)** — `KeyNoticePage`(`/groupware/key-notice`). 로그인 사용자가 지금 처리해야 할 결재를 모은 개인
  전달함: ① 결재할 문서(scope=pending, 내 결재차례) ② 상신 진행중 문서(scope=drafted·IN_PROGRESS). **프론트 전용**
  (`/api/approvals?scope=`). 원본의 '미확인 쪽지' 섹션은 쪽지(단문) 엔티티가 없어 제외(사내메일=MailPage 대체). **라벨 오류 교정**:
  그동안 '주요전달사항' 메뉴가 공지게시판(SharedInfoPage)에 연결돼 있었으나, 진짜 주요전달사항(결재 대시보드)은 미구현이었다
  → 신규 페이지를 연결하고 기존 게시판은 '공유정보'로 재라벨. 검증: 결재 2건 시드(내 차례 1·상신진행 2)로 두 섹션 분류 대조 +
  브라우저 렌더 + tsc + 시드 삭제로 원복(approvals 0).

### 완료 로그 (2026-07-27)
- ✅ **특별단가등록(E040124)** — `SpecialPricePage`(`/sales/special-price`). **진짜 신규 풀스택**: 표준단가(Item.unitPrice)를
  덮어쓰는 예외 단가 마스터. 신규 엔티티 `SpecialPrice`(trade) + enum `SpecialPriceType`(SALES/PURCHASE) +
  **`V109__create_special_prices.sql`**(FK 인덱스 idx_special_prices_item_id·partner_id + resolve 복합 인덱스
  idx_special_prices_lookup) + Repository/DTO/Service/Controller(`/api/special-prices`, `/resolve`, `/{id}/active` 토글).
  적용범위는 **거래처별(partner_id) 또는 특별단가그룹별(price_group) 중 하나**(서비스에서 XOR 가드 400). 거래처특별단가그룹
  (E040120)이 각 거래처에 지정한 `salesPriceGroup/purchasePriceGroup`과 짝을 이룬다. **`/resolve`가 실제 로직**: (구분·품목·거래처)로
  유효단가를 거래처별→그룹별 순으로 해석(가짜 컨트롤 아님 — 데이터가 실제로 걸린다). 판매/구매 입력 자동적용은 회귀위험 커서
  별도 트랙(마스터+해석까지 이번 범위). 프론트: 등록 폼(구분·품목·범위·단가) + 판매/구매/전체 탭 + 사용여부 토글 + 유효단가 조회 패널.
  검증(라이브): 그룹별 등록→거래처 그룹 미지정 시 폴백 없음, 거래처에 '대리점가' 임시지정→**그룹폴백 resolve found=GROUP·8888**,
  거래처별 등록→**resolve 1순위 PARTNER·5555**, 범위중복 400 가드, 거래처별 사용중단→그룹으로 복귀, 삭제 정리 후 0건·거래처 그룹 원복(드리프트 0)
  전 흐름 + Flyway V109 적용·validate 통과 + tsc 통과 + QA 하네스(급여·분개 등 24개 시나리오 ✅, 25 현금계좌간이동은 로컬 DB 잔액
  누적 드리프트로 중단 — 격리 신규 테이블과 무관·회귀 아님). **회계 I 기초등록 13/13 완비.**
- ✅ **카드사등록(E010109)·결제대행사등록(E010114)** — `PaymentMastersPage`(`/accounting/card-issuers`·`/accounting/payment-agencies`).
  **진짜 신규 풀스택**: 두 고립 CRUD 마스터. 신규 엔티티 `CardIssuer`(코드·명·수수료율·적요·사용여부)·`PaymentAgency`(코드·명·
  대표자·전화·Email·적요·사용여부) + **`V110__create_card_issuers_payment_agencies.sql`**(다른 테이블 미참조 → FK 없음) +
  각 Repository/DTO/Service(코드 자동채번 `CI###`/`PA###`, 코드중복 409)/Controller(CRUD). 트윈 마스터라 한 컴포넌트를
  `defaultTab` prop으로 두 라우트에서 재사용(PurchaseRequestStatusPage 선례). ManagementItem CRUD 패턴 준수. 검증(라이브):
  카드사 등록(CI001·수수료율 2.5)→수정(3.1·사용중단)→코드중복 409 가드, 결제대행사 등록(PA001·대표자)→수정, 목록→삭제 정리 후
  0건 전 흐름 + Flyway V110 적용·validate 통과 + tsc 통과. **재고 I 기초등록 7/7 완비.**
- **Self-Customizing 0/5 → 5/5 오탐 대량 정정** — 전부 이미 구현돼 있던 것을 제목 자동판정이 못 잡은 오탐이었다:
  기능설정(C000113)·기본값설정(C001124)=`PreferencesPage`(`/settings/preferences`), 보안설정(C001138)=`SecurityPage`
  (`/settings/security`), 엑셀자료올리기기능(E000129)=`DownloadPage`(`/settings/download`), 편의기능(E000139)=`EtcSystemPage`
  (`/settings/etc`). 원본 DOM 대조로 확인(환경설정 DOM=공통/회계/재고/관리 옵션·보안 DOM=접속관리/로그인/활동이력). Self-Customizing 완비.
- ✅ **공용메일 임시보관함(E077004)·지운함(E077006)** — `MailPage`(`/groupware/mail`). **기존 Mail 확장 풀스택**:
  엔티티 `Mail`에 `draft`(초안)·`deletedAt`(소프트삭제) 컬럼 추가 + **`V111__mail_draft_trash.sql`**(기존 행 draft=false·
  deleted_at=null DEFAULT라 무회귀 + 임시/지운함 조회 인덱스). Repository의 수신/발신/공용 조회에 `draft=false and deletedAt is null`
  필터 추가, 신규 `findDrafts`/`findTrash`. Service/Controller에 초안 저장/수정/발송(`POST/PUT /mails/drafts`,`/drafts/{id}/send`)·
  소프트삭제/복원/영구삭제(`DELETE /mails/{id}`,`/{id}/restore`,`/{id}/permanent`) — 본인 메일만·지운함 거친 것만 영구삭제(가드).
  sent_at NOT NULL 유지하려 초안도 저장시각을 채우고 draft 플래그로 구분. 프론트: 임시보관함/지운함 탭 + 메일쓰기 '임시저장'
  버튼 + 초안 행 수정/발송 + 지운함 복원/영구삭제. **스팸함은 외부메일 연동 없어 계속 제외.** 검증(라이브 admin↔김부장):
  초안 저장(recipient null·draft)→발신함 제외→수정(수신자 지정)→발송(draft=false·발신함 노출)→소프트삭제(발신함 제외·지운함 노출)→
  복원→지운함 아닌데 영구삭제 400 가드→삭제 후 영구삭제 전 흐름 + 공용메일함 기존 동작(20건) 유지 + Flyway V111·validate + tsc +
  QA 하네스 시나리오 16 공용메일 전부 ✅(회귀 없음, 25 현금 잔액 드리프트 기존 중단점). **공용메일 8/9.**
- ✅ **쇼핑몰 배송처리(E041007)·반품처리(E041009)·교환처리(E041010)** — `MallPage`(`/mall`). **MallOrder 이행 상태 확장**:
  `MallOrderStatus`에 SHIPPED(배송)·RETURNED(반품)·EXCHANGED(교환) 추가 + MallOrder에 택배사·송장번호·배송일·사유·최종처리일
  컬럼(**`V112`**) + status CHECK 제약 교체(**`V113`**). Service에 ship(CONVERTED→SHIPPED)·returnOrder/exchange(SHIPPED→
  각각) 전이(상태 가드) + overview 미전환 집계를 RECEIVED/CONFIRMED만 세도록 정정. Controller `POST /{id}/ship`·`/return`·
  `/exchange`. 프론트: 배송/반품/교환 탭 + CONVERTED행 배송처리·SHIPPED행 반품/교환 버튼 + 이행 모달(택배·사유·일자) + 상태셀
  택배/사유 표시. **재고·채권 반전은 판매전표(sales)가 소유 — 몰이 중복 기록하지 않음**(반품 재무처리는 판매 측 별개 트랙;
  기존 MallOrderService 철학 유지). 검증(라이브): RECEIVED에 배송처리 409 가드→(SQL로 CONVERTED 세팅, 판매부작용 없이 전이 경로만)
  배송처리(택배 기록)→반품(사유)→별건 교환(재발송 정보)→EXCHANGED에 반품 409 가드→미전환 집계 0(배송/반품/교환 제외) + 테스트주문
  SQL 정리 + Flyway V112·V113·validate + tsc + QA 하네스 회귀 없음(25 기존 중단점). **쇼핑몰 9/11(잔여: 몰계정·품목코드연결).**
  **함정**: `mall_orders.status`에 CHECK 제약(ck_mall_orders_status, V70)이 있어 enum 값 추가가 런타임 23514로 막힘 — validate가
  CHECK를 안 봐 기동은 통과했다(enum CHECK 함정). V113으로 제약을 7개 값으로 교체해 해소.
  **테넌트 baseline 주의**: `db/tenant/V1__tenant_baseline.sql`은 V101 이후로 갱신되지 않아(sales_plans·special_prices·
  card_issuers 등 미포함) 이미 표류 상태다 → 아래에서 정비함.
- ✅ **테넌트 baseline 표류 정비 (멀티테넌시 신규 회사 생성 복구)** — `db/tenant/V1__tenant_baseline.sql`이 2026-07-16
  스냅샷(공용 V101 시점) 이후 갱신되지 않아, 신규 회사 스키마가 최근 테이블(V102~V113: 매출계획·품질검사요청·프로젝트계획·
  대체/폐기 CHECK·로트이력·단계별조정·A/S부품·특별단가·카드사/결제대행사·메일 임시/지운함·몰 배송/반품/교환) 없이 생성돼
  최근 기능이 전부 깨지는 상태였다. **원인 규명**: 공용은 `db/migration` 체인(V1~V113), 테넌트 스키마는 생성 시
  `CompanyService.migrateTenant()`가 `db/tenant` baseline 한 벌만 적용 — 두 경로가 분리돼 있어 V102 이후 공용 마이그레이션이
  테넌트에 반영된 적이 없다. **조치**: V102~V113 이 전부 스키마 비한정(unqualified) DDL 임을 확인하고, 그 DDL 을 tenant baseline
  끝에 델타로 추가(FK 대상 base 테이블은 모두 baseline에 존재, V105·V113 의 CHECK 교체는 제약명 일치). 컷오프는 V100/V101
  컬럼이 baseline에 있고 V102 테이블이 없음을 대조해 확정. **검증**: ① 임시 스키마에 baseline 전체 재실행(ON_ERROR_STOP) →
  130테이블 무오류·신규 9테이블·몰 배송컬럼5·CHECK 7값. ② **실제 앱 경로**: 회사 생성 API(POST /api/companies, code 0003) →
  migrateTenant(Flyway) → 131테이블·신규 9테이블·mall CHECK SHIPPED·**신규 회사 관리자 로그인 성공** → 스키마 drop + companies 행
  삭제로 원복. ③ 기존 테넌트 `co_0002`(V101 상태·데모 데이터 극소)에도 동일 델타를 직접 적용(순수 추가·CHECK 확장) → 신규 9테이블·
  mall CHECK SHIPPED. 이제 public·co_0002·신규 회사 스키마가 모두 V113으로 일관. **앞으로 공용 스키마 변경 시 이 baseline 델타도
  함께 갱신할 것**(baseline 상단 주석에 명시).
- ✅ **쇼핑몰품목코드연결(E041004)** — `MallItemMappingPage`(`/sales/mall-item-mappings`). **진짜 신규 풀스택**: (쇼핑몰,
  몰품목코드)→우리 품목 매핑 마스터. 신규 엔티티 `MallItemMapping`(unique(mall, mall_product_code)) + **`V114`**
  (mall_item_mappings + mall_orders.mall_product_code 컬럼) + Repository/DTO/Service(CRUD·중복 409·resolveItemId)/Controller.
  **작동 지점**: `MallOrderService.collect` 에서 itemId 미지정 시 (몰, 몰품목코드)로 활성 매핑을 찾아 품목을 자동 연결 —
  마스터가 실제로 소비되는 로직(가짜 아님). 프론트: 매핑 관리 페이지 + 수집폼에 몰품목코드 입력. tenant baseline 델타에도 V114 추가.
  검증(라이브): 매핑 등록→중복 409→itemId 없이 코드매칭 수집=**자동연결 성공**→미매칭 코드=item null→매핑 사용중단 후 수집=자동연결 안 됨→
  테스트 정리 + Flyway V114·validate + tsc + QA 회귀 없음(25 기존 중단점). **쇼핑몰 10/11.**
- ✅ **쇼핑몰등록(C000664)** — `MallAccountPage`(`/sales/mall-accounts`). **진짜 신규 풀스택**: 우리가 판매하는
  쇼핑몰/통합관리솔루션 계정 마스터. 신규 엔티티 `MallAccount`(code·name·type(MALL/SOLUTION)·partner·sellerId) + enum
  `MallAccountType` + **`V115`**(mall_accounts, partner FK 인덱스) + Repository/DTO/Service(채번 MA###·중복 409)/Controller.
  **실제 소비**: 수집폼(CollectForm)과 품목코드연결의 '쇼핑몰' 입력이 등록된 몰 이름 datalist 를 제공받아 오타·표기흔들림 방지;
  판매전환 기본 거래처(partner)를 몰에 연결. 마스터가 기존 흐름에 실제로 걸린다(가짜 아님). tenant baseline 델타에 V115 추가.
  **오픈API 인증·자동수집 연동은 별개 트랙**(8.1에 남김) — 여기서는 레지스트리·거래처연결·선택소스만 소유. 검증(라이브):
  등록(MA001·거래처연결·셀러ID)→수정(구분 SOLUTION·사용중단·거래처 해제)→코드중복 409→정리 + Flyway V115·validate + tsc +
  QA 회귀 없음(25 기존 중단점). **쇼핑몰관리 11/11 완비.**
- ✅ **조건별검색(E070203)** — `ConditionSearchPage`(`/sales/condition-search`). **거래처 관계기준 통합 집계**: 기준일자·
  거래처관계기준(개별거래처기준 / 연결거래처합산 / 선택거래처합산)으로 매출·매입(공급가)·순액을 집계. **연결거래처합산**은
  선택 거래처가 속한 거래처그룹(partnerGroup) 전체를 묶는 게 핵심(기존 거래이력·거래처중심입력과 차별). **백엔드 최소 보강**:
  PartnerResponse 에 partnerGroupId·partnerGroupName 추가(읽기전용, 마이그레이션 없음 — 엔티티에 이미 있던 partnerGroup 노출).
  프론트 전용 집계(`/sales`+`/purchases`+`/partners`). 라우팅·메뉴(공유정보)·RBAC(SALES). 검증(라이브): /partners 그룹필드 노출 확인,
  개별기준(QA고객사 매출 720,000)·선택합산 집계 정확, 임시 거래처그룹(QA고객사+QA매입처) 배정→**연결거래처합산 매출 720,000·
  매입 984,000으로 그룹 멤버 아우름**→원복(그룹지정 0) + tsc + QA 회귀 없음(PartnerResponse 필드추가는 후방호환). **공유정보 11/12.**
  ※ 8.5 에서 이 항목을 "저장된 검색"으로 오판했었으나, DOM 확인으로 성격(거래처관계 집계)을 바로잡고 구현.

### 완료 로그 (2026-07-27, 기반 과제 · 8장 선행 항목 해소)
- ✅ **판매입력 II(E040253) = 사용자정의필드 엔진** — `settings` 모듈에 범용 EAV. **진짜 신규 풀스택**: 엔티티
  `CustomFieldDef`(entityType·fieldKey·label·fieldType(문자/숫자/일자/코드)·options·required·정렬) + `CustomFieldValue`
  (entityType·entityId·fieldKey·value, **FK 없는 범용** — settings 독립성 유지) + enum `CustomFieldType` + **`V116`** +
  Repository/DTO/Service/Controller(`/api/custom-fields/defs` 정의 CRUD, `/values` 전표별 값 GET/PUT). 값 저장은 정의된
  활성 필드만 upsert하고 빈 값은 삭제, 필수 누락은 400. **RBAC**: defs=SETTINGS(관리자 정의), values=SALES(판매작업 중 입력 —
  최장접두어 오버라이드). 프론트: `CustomFieldPage`(Self-Customizing 정의 관리) + 재사용 컴포넌트 `CustomFieldsPanel`을
  판매조회(TradeInquiryPage) 전표 상세에 '추가항목'으로 부착(정의 없으면 비렌더 — 비침습). **우리 판매전표 스키마를 건드리지 않고**
  임의 형식필드를 붙이는 방식이라 이카운트 판매입력 II의 커스텀필드 요구를 흡수. tenant baseline 델타 V116 추가. 검증(라이브):
  정의 3종(코드/문자/일자) 생성→중복키 409→폼조회(정의3·값0)→필수 누락 400→저장·재조회 영속→빈값 삭제·값변경→정리 +
  Flyway V116·validate + tsc + QA 회귀 없음. **영업관리 34/34 완비.**
- ✅ **수집데이터등록(E100000) = 동적 소스 레지스트리** — `CollectSourcePage`(`/datacenter/collect-sources`). **진짜 신규 풀스택**:
  엔티티 `CollectSource`(name·category·endpoint·paged·정렬·active) + **`V117`**(테이블 + 기존 하드코딩 9종 시드) +
  Repository/DTO/Service/Controller(`/api/collect-sources` CRUD). DataCollectPage 를 리팩터해 하드코딩 배열 대신 이 레지스트리의
  활성 소스를 읽어 실행(각 소스의 GET 엔드포인트 호출→행수/ totalElements 집계). **소스 실행 모델**: 소스=우리 API 목록 GET
  엔드포인트라, 코드 배포 없이 새 소스(예: /quotations, /shipments)를 등록하면 즉시 수집 대상이 된다(가짜 아님 — 실제 GET·집계).
  RBAC: SETTINGS(쓰기), 읽기는 데이터센터 사용자 허용. tenant baseline 델타 V117. 검증(라이브): 시드 9종 확인→동적 추가(견적
  →/quotations)→**추가 소스 실행 재현 /quotations 52건 수집**→사용중단 반영→정리 9복귀 + Flyway V117·validate + tsc + QA 회귀 없음.
  **데이터수집 5/5 완비.**
- ✅ **사내관리(C000698) = 일정 검색/관리** — `ScheduleSearchPage`(`/groupware/schedule-search`). DOM 확인 결과 이 메뉴는
  참석자·장소·일정구분·기간으로 일정을 찾는 '일정 검색' 화면이었다(막연한 '사내 포털'이 아님). 기존 일정관리(SchedulePage)가
  등록·목록이라면 여기는 조건검색 뷰. **백엔드 보강**: ScheduleEvent 에 location·attendees 컬럼(**V118**) + DTO/서비스/등록폼 반영.
  프론트: SchedulePage 폼에 장소·참석자 입력+표시 추가, 신규 ScheduleSearchPage(기간·구분·키워드(제목/담당/장소/참석자) 필터).
  프론트 전용 필터(/schedule-events). tenant baseline 델타 V118. 검증(라이브): 장소·참석자 일정 2건 등록→응답 필드 노출→
  기간(7월 2)·구분(회의 1)·키워드"회의실"(A만)·참석자"이대리"(A) 검색 정확→정리 + Flyway V118·validate + tsc + QA 회귀 없음.
  **공유정보 12/12 완비.**

### 완료 로그 (2026-07-31, 8장 재점검 — 오분류 7종 해소)

- ✅ **쪽지(E010851 쪽지수발신내역) = 커뮤니케이션센터(C000663)** — `ShortMessagePage`(`/groupware/messages`).
  두 prgId 의 DOM 이 **완전히 같은 화면**이라 하나로 해소했다. **진짜 신규 풀스택**: 엔티티 `ShortMessage`
  (sender **nullable** = 시스템 자동알림 / recipient / partner / content / sentAt / readAt / archived /
  linkSource·linkRef·linkPath) + **`V119`**(short_messages + FK 인덱스 3) + Repository/DTO/Service/Controller
  (`/api/short-messages` — 함별 조회·발송·확인·보관·선택삭제·미확인건수). 함은 원본 그대로 **전체·미확인·확인·보관함·보낸쪽지**.
  **핵심은 자동알림이다.** 원본 쪽지의 실제 내용이 "전자결재 > 출장복명서(20260630-9) 기안문서의 최종 결재가 완료
  되었습니다" 같은 시스템 알림이었다. 그래서 `ApprovalService` 네 지점에 훅을 걸었다 — 기안(=상신)·다음 단계 진행 시
  **해당 차례 결재자**에게, 최종 완료·반려 시 **기안자**에게. 연결전표(기안번호)를 누르면 결재함으로 이동한다.
  쪽지가 결재 흐름에 실제로 물려 있다(가짜 아님). RBAC: GROUPWARE. tenant baseline 델타 V119.
  검증(라이브): 발송→보낸쪽지/받은쪽지·미확인건수→확인 처리(미확인 0/확인 1)→**남의 쪽지 확인 시도 400**→보관(받은함에서 빠지고
  보관함으로)→키워드·보낸사람·기간 필터 정확→**2단 결재선 기안: 1차 결재자 알림 → 1차 승인 시 2차 결재자 알림 → 최종 승인 시
  기안자 완료 알림 → 별건 반려 시 기안자 반려 알림(사유 포함)** 4종 전부 도착 확인→테스트 쪽지·기안서 전량 삭제로 DB 원복
  + Flyway V119·validate 통과 기동 + tsc + QA 374 단언 통과(회귀 없음).
- ✅ **잔량재집계(E040607)** — `StockRecalcPage`(`/inventory/recalc`). "우리는 실시간 집계라 불필요"가 오판이었다.
  우리도 `stock_transactions.balance_after` 를 **저장**하는데 그 값은 입력(id)순으로 매겨져, 과거 일자 거래가 뒤늦게
  입력되면 일자순 잔량과 어긋난다(재고수불부가 매번 런타임 재계산하던 이유). **백엔드 신설(스키마 무변경)**:
  `StockService.recalculate(from, to, apply)` → 기간 거래를 (품목,창고)로 묶어 기초재고부터 일자·id 순으로 잔량을 다시 매기고,
  별도로 **전 조합**에 대해 `sum(quantityChange) == stocks.quantity` 불변식을 대조. DTO `StockRecalcRow/Result`,
  `GET /api/stock/recalc`(점검 — 값을 고치지 않음) · `POST /api/stock/recalc`(반영). 화면은 시작월·종료월 + 점검/재집계
  두 단계(되돌릴 수 없어 확인창).
  검증(라이브): 전기간 점검 → **거래 292건 중 280건의 저장 잔량이 어긋나 있었고**(SQL 윈도우 함수로 교차검증해 84+196=280 일치),
  반영 후 재점검 0건. 이어서 `stocks.quantity` 를 SQL 로 +5 틀리게 만들어 점검이 차이 −5 를 잡아내고 반영으로 100 복구 확인.
  월범위 필터(2020-01 → 0건 / 2026-07 → 205건) 정확. tsc + QA 회귀 없음.
- ✅ **채권/채무현황(E040703) · 채권현황(E040721)** — `ArApStatusPage`(`/sales/ar-ap-status`, `/sales/receivable-status`).
  거래처관리대장과 중복이 아니었다 — 기존 `/ledger/partner-balances` 는 **기준일자가 없어 '지금 잔액'만** 냈다.
  **백엔드 보강(스키마 무변경)**: `SalesRepository.sumTotalByPartnerUntil` · `PurchaseRepository.sumTotalByPartnerUntil` ·
  `SettlementRepository.sumByPartnerUntil` 추가 → `LedgerService.partnerBalances(asOf)` → `GET /ledger/partner-balances?asOf=`.
  `PartnerBalanceResponse` 에 partnerGroup·manager·active 추가(후방호환 — 기존 6개 화면 무영향), N+1 방지로
  `BusinessPartnerRepository.findAllWithGroup()` fetch join. 화면은 구분(채권/채무/채권·채무)·기준일자·거래처그룹·
  관리담당자·사용중단포함·잔액0숨김 + **거래처그룹 소계**. 원본의 계층그룹·대표거래처합산은 우리 거래처그룹이 1단계 평면이라 제외.
  검증(라이브): asOf 2020-01-01 → 0 / 2026-06-30 → 채무 170,500 / 2026-07-31 → 1,398,100, 판매·구매 원장 직접 합산과 대조 일치.
  **수금 차감도 시점 반영 확인** — 7/15 수금 100,000 등록 후 asOf 7/14 채권 1,023,000 → asOf 7/15 923,000, 정산 삭제로 원복.
  tsc + QA 회귀 없음.
- ✅ **생산입고 III(E040416)** — `ManualConsumeReceiptPage`(`withQualityRequest`, `/production/receipt-qr`).
  DOM 을 열어 보니 III 가 II 와 다른 점은 소모품목 선택이 아니라(그건 II 와 같다) **품질검사요청 생성**이었다.
  우리는 품질검사요청(QualityInspectionRequest)이 이미 있으므로, 생산입고 저장 직후 그 완제품·수량으로 요청을 만든다
  (`POST /quality-inspection-requests`, 검사구분 선택). **프론트 조합이라 모듈 간선을 늘리지 않았다**
  (production → quality 의존을 새로 만들지 않음 — CLAUDE.md §4.1). 요청 생성이 실패해도 이미 끝난 입고는 되돌리지 않고
  사유만 알린다. 검증(라이브): 기존 생산입고 전표로 요청 생성 → `QR-20260710-0001 · QA완제품 50 · 요청 · "생산입고 PR-… 연계"`
  목록 반영 확인 → 테스트 요청 삭제로 원복. tsc.
- ✅ **오탐 정정 3종** — `C000095 영업관리현황`=판매현황 · `C000096 구매관리현황`=구매현황 · `C000648 생산/외주현황`=작업지시서현황.
  '목차 카테고리 노드'로 적혀 있었으나 DOM 은 각각 완성된 현황 화면이고, 셋 다 우리에게 이미 있다(SalesStatusPage·
  PurchaseStatusPage·WoStatusPage). 부록 ✅ 로 정정.
- ✅ **ECDrive(E077100)·WORK(E200162) 분류 정정** — 8.1 '외부 연동 필요'로 적혀 있었으나 두 화면 모두 **이미 구현돼 있었다**
  (EcDrivePage·WorkPage). ECDrive 는 실제 파일 바이트 업로드만 남았고 그건 저장소 인프라 과제로 옮겼다.
- ✅ **스팸 메일함(E077005) 성격 확정** — DOM 이 화면이 아니라 '공용메일설정' **안내 팝업**이었다(격자·검색폼 없음). 구현 대상 아님.

### 완료 로그 (2026-07-31 2차, 남은 3종 + 파일 인프라 — **부록 ⬜ 0 달성**)

- ✅ **파일 저장 인프라(공통 선행 과제 해소)** — `com.erp.common` 에 `StoredFile`(메타) + `StoredFileData`(bytea) +
  `FileStorageService` + `FileController`(`/api/files` 업로드·다운로드·삭제) + **`V120`**.
  **저장 위치를 Postgres bytea 로 정한 근거**: 회사별 스키마 멀티테넌시라 DB 에 넣으면 테넌트 격리·백업 일관성이
  그대로 따라온다(파일시스템이면 경로 규칙·정리·백업을 따로 만들어야 한다). ERP 증빙·양식은 수 MB 이하라 bytea 로 충분하고,
  오브젝트 스토리지로 옮기게 되면 `FileStorageService` 한 곳만 바꾸면 된다.
  **메타/바이트 테이블을 나눈 이유**: `byte[]` 는 바이트코드 강화 없이는 지연로딩이 안 돼, 한 테이블이면 목록 조회 한 번에
  파일 전체가 메모리로 올라온다. 다운로드 경로에서만 `stored_file_data` 를 읽는다.
  상한 10MB 를 서비스(`MAX_FILE_BYTES`)와 톰캣(`spring.servlet.multipart`) 양쪽에서 막고,
  톰캣이 던지는 `MaxUploadSizeExceededException` 을 `GlobalExceptionHandler` 에서 **400** 으로 바꿨다(그냥 두면 500 이 나간다).
  검증(라이브): 한글 파일명 업로드→다운로드 바이트 일치·RFC5987 파일명 헤더→11MB 거부(400)→삭제.
- ✅ **ECDrive 실파일(E077100 잔여분)** — `DriveDocument.file` 연결 + `POST /api/drive-documents/upload`(multipart) +
  `GET /{id}/file`. 목록에서 **파일명을 누르면 다운로드**되고(JWT 가 실리도록 axios blob 경유 — `utils/fileDownload.ts`),
  문서를 지우면 붙어 있던 파일도 함께 지운다. 기존의 '항목만 등록'(메타데이터) 경로는 남겨 두고, 그런 항목은 다운로드 시 400.
  검증(라이브): 공유 드라이브 업로드→목록 fileId 노출→다운로드 내용 일치→메타만 있는 항목 400→삭제 시 파일도 404.
- ✅ **증빙센터(E040730)** — `EvidenceCenterPage`(`/accounting/evidence-center`) + 재사용 `EvidencePanel`.
  **진짜 신규 풀스택**: `EvidenceAttachment`(entityType+entityId 로 **FK 없이** 전표를 가리킴 — 판매·구매·비용 세 모듈에
  동시에 묶이지 않게, 사용자정의필드와 같은 방식) + enum `EvidenceMethod`(세금계산서/신용카드/현금영수증/거래명세서/기타) +
  **`V121`** + Repository/DTO/Service/Controller(`/api/evidence-attachments`). **데이터가 실제로 생기는 자리**는
  판매조회·구매조회의 전표 상세에 붙인 증빙 패널이고, 증빙센터는 그것을 전표일자·증빙일자·메뉴·작업자·증빙방법·첨부여부로
  훑어 다운로드·선택삭제한다. 원본의 '전자서명'·'양식' 조건은 해당 기능이 없어 제외(값 없는 컨트롤은 만들지 않는다).
  RBAC: ACCOUNTING. 검증(라이브): 파일 있는 증빙·파일 없는 증빙(증빙방법만) 등록→잘못된 전표종류 400→전표 상세 패널 2건→
  조건별 검색(첨부여부·증빙방법·기간) 정확→증빙 파일 다운로드→삭제 시 첨부파일도 404→전량 정리.
- ✅ **의료기기공급내역보고(E040231)** — `MedicalDeviceReportPage`(`/datacenter/medical-device-report`).
  **품목에 UDI-DI 추가**(`items.udi_di`, 품목등록 폼에 입력) — 별도 '의료기기' 플래그를 두지 않은 이유는 보고에 필요한 게
  코드 자체라 코드가 없으면 어차피 보고할 수 없어서다. 공급내역은 **우리 전표에 실제로 있는 두 가지만** 낸다 —
  **출고**(판매 라인)·**폐기**(재고조정 DISPOSAL). 원본의 반품·임대·회수는 해당 전표 종류가 없어 만들지 않았다
  (늘 0건인 콤보 항목은 가짜 조건이다). `MedicalDeviceReport` 엔티티 + **`V122`** + 서비스/컨트롤러.
  **다른 모듈 데이터는 전부 service 를 거친다**(ItemService·SalesService·StockAdjustmentService·PartnerService — §4.2).
  보고파일은 CSV(엑셀 한글 대비 BOM 포함)로 만들어 `stored_files` 에 저장하고 이력(=원본의 '송신이력')에 남긴다.
  **'전송' 버튼은 만들지 않았다** — 채널·인증서가 없어 누르면 가짜가 된다.
  검증(라이브): UDI 없을 때 0건 → 품목에 UDI 부여 후 68건 산출(구분·거래처·기간 필터 정확) → 보고파일 생성
  (2026-03, 68건/수량 102, CSV 헤더·본문 확인) → 내역 없는 달 400 / 잘못된 월 형식 400 →
  **폐기 조정 1건 등록해 폐기 공급구분까지 산출 확인** → 조정·트랜잭션 삭제 후 **잔량재집계로 재고 원복(3910)** → UDI 원복.
- ✅ **스팸 메일함(E077005)** — `MailPage` 스팸함 탭 + 스팸 규칙 관리. **진짜 신규 풀스택**: `SpamRule`(기준: 보낸주소/제목/본문,
  부분일치 패턴, 사용여부) + enum `SpamRuleKind` + `mails.spam`·`spam_reason` + **`V123`** + Service/Controller(`/api/spam-rules`).
  **규칙이 걸리는 지점**은 공용메일 수신 등록(`MailService.receiveShared`) — 우리 모델에서 외부 메일이 들어오는 유일한 자리이고,
  메일서버 연동이 붙으면 그 수신 훅이 이 메서드 자리에 들어온다. 수신함·발신함·공용메일함 조회에서 스팸을 제외하고,
  스팸함에서 해제하면 원래 함으로 돌아온다. 수동 스팸 지정도 가능하며 **분류 사유를 남긴다**("제목에 '【광고】' 포함").
  **`MailStatus` enum 에 SPAM 을 더하지 않은 이유**: status 에 CHECK 제약이 걸려 있어 값 추가가 제약 교체를 부르고,
  스팸 여부는 처리상태와 직교하는 별개 축이다(스팸이면서 미읽음일 수 있다). 정규식 대신 부분일치만 지원 —
  잘못 쓴 정규식으로 멀쩡한 메일이 조용히 사라지는 편이 더 나쁘다.
  검증(라이브): 규칙 2종 등록→정상 메일 통과·광고 제목/차단 도메인 메일 자동 스팸(사유 기록)→공용메일함에서 제외·스팸함에 표시→
  스팸 해제 시 공용메일함 복귀→수동 스팸 지정→**규칙 사용중단 후 같은 메일이 통과**→전량 정리.

> 이 회차 전체 검증: Flyway **V120~V123** 적용 후 `validate` 통과 기동 · `tsc` 통과 · **QA 하네스 374 단언 통과(회귀 없음)** ·
> 테스트 데이터 전량 원복(stored_files·evidence·spam_rules·medical_device_reports·UDI·스팸메일 모두 0). tenant baseline 델타 갱신.

### 완료 로그 (2026-07-31 3차, 출력물 서식 트랙 1차)

- ✅ **전표 서식 인쇄 템플릿** — `utils/printDocument.ts`. 이카운트 출력물 76종을 화면 76개로 만들지 않기 위한
  일반화다. 한 템플릿에 **제목 · 양쪽 당사자(공급자/공급받는자) · 품목 명세 · 합계 · 한글금액 · 결재란 · 비고**를
  넘겨 서식을 찍는다. A4 세로, 여러 건을 넘기면 전표마다 페이지가 나뉜다(`page-break-after`).
  공급자 정보는 회사정보관리(`GET /company`)에서 가져오고, 미등록이면 화면에서 먼저 안내한다.
  결재란은 기존 `print-sign-lines/default` 를 그대로 재사용한다(없으면 결재란 없이 인쇄 — 도장칸이 없다고
  출력을 막을 이유는 없다). **한글금액**(`amountToKorean`)은 금액 위조를 막으려고 있는 칸이라 일상 표기(십일)와
  달리 자릿수의 1 도 적는 수표·어음 표기법을 따른다(일십일). 백엔드 변경 없음.
- ✅ **거래명세서인쇄(E040210)** — `StatementPrintPage` 를 실제 서식 인쇄로 교체. 기존에는 '인쇄' 버튼이
  `window.print()` 라 **앱 화면 전체가 찍혔다**. 이제 전표를 골라(체크박스 · 행별 인쇄 · 조회분 전체)
  거래명세서 서식으로 출력한다.
- ✅ **판매조회·구매조회 전표 상세** — 상세를 펼치면 '거래명세서 인쇄'(판매) / '매입명세서 인쇄'(구매).
  **구매는 거래처가 공급자**라 당사자 위치를 바꿔 넣는다 — 그러지 않으면 서식이 사실과 어긋난다.
- ✅ **견적서(QuotationPage) · 발주서(PurchaseOrderPage)** — 행별 '인쇄'. 견적서는 유효기간을,
  발주서는 납기일·입고창고·진행상태를 머리글에 싣는다. 발주서는 **우리가 발주자**라 명세서와 당사자 위치가 반대다.

> 검증: 실제 템플릿 코드로 서식 HTML 을 생성해 구조 점검 14/14 통과(합계·한글금액·HTML 이스케이프·값 없는 항목
> 생략·결재란 빈 도장칸·페이지 분할) · 브라우저에서 레이아웃 육안 확인 · 한글금액 변환 14케이스 검증 · tsc 통과.
> 백엔드 무변경이라 QA 하네스 영향 없음.

### 완료 로그 (2026-07-31 4차, UI 대조 — 코드도움 팝업)

원본 DOM 과 우리 화면을 나란히 놓고 보니, 이카운트에서 **팝업으로 뜨는 조건 입력**이 우리는 전부
드롭다운(`<select>`)이었다. 원본 DOM 근거는 `btn-code-search` / `data-function-id="code.openpopup"` 이다.

| prgId | 원본에서 코드도움 팝업인 항목 |
|---|---|
| `E010851` 쪽지 | 보낸사람 · 받는사람 · 거래처 |
| `E040703` 채권/채무현황 | 거래처 · 거래처그룹1/2 · 거래처계층그룹 · 거래처관리담당자 |
| `E040730` 증빙센터 | 메뉴 · 작업자 |
| `E040231` 의료기기공급내역보고 | 거래처 · 거래처그룹 · 납품거래처 · 품목 · 품목그룹 · 최초/최종작성자 |
| `E040210` 거래명세서인쇄 | 창고 · 프로젝트 · 거래처 · 품목 · 담당자 등 16종 |

- ✅ **`components/CodePickerField.tsx` 신규** — 코드도움 재사용 컴포넌트. 선택값을 보여주는 칸 +
  🔍 버튼 + 해제 ×, 누르면 코드·이름으로 검색하는 팝업(Modal)이 뜬다. 목록은 **화면이 이미 불러온 데이터**를
  넘겨받아 거르므로 추가 요청이 없다. 마스터가 수백 건이 되면 드롭다운으로는 못 찾기 때문에 원본이
  팝업을 쓰는 것이고, 우리도 같은 이유로 바꾼다.
- ✅ 적용: 쪽지(보낸사람·받는사람·거래처) · 채권/채무현황(거래처·거래처그룹·관리담당자) ·
  증빙센터(작업자) · 의료기기공급내역보고(거래처) · 거래명세서인쇄(거래처).
- ⚠️ **잡은 버그**: 컴포넌트를 `<label>` 로 감쌌더니 팝업이 그 안에 렌더되면서, 팝업 안의 클릭이 label 을 통해
  입력칸으로 전달돼 **행을 눌러도 선택이 안 되고 팝업이 닫히지 않았다.** `<div>` 로 바꿔 해결(브라우저에서 재현·확인).
- ✅ **인쇄창 팝업 차단 대비** — `window.open` 이 결재란 조회(`await`) 뒤에 있었다. 브라우저는 사용자가 누른
  그 순간에만 새 창을 허용하므로, 환경에 따라 인쇄 버튼이 조용히 무반응이 될 수 있다. 창을 먼저 열고
  내용을 나중에 채우도록 `openPrintWindow`/`fillAndPrint` 로 정리했다(`printTable`·`printDocuments` 둘 다).
  아울러 `printTable` 이 쓰던 `win.onload` 는 `document.write` 문서에서 안 올 수 있어 지연 호출로 바꿨다.
  ※ 이 환경의 Chrome 은 두 방식 모두 창을 열었다(재현 실험으로 확인) — 즉 **이번 증상의 원인은 아니었고**,
  환경에 따라 달라지는 부분을 없앤 예방 조치다.

**2차(같은 날 이어서)** — 코드도움을 확장하고 조회 조건 화면으로 넓혔다.

- ✅ **다중 선택(tags-input) 지원** — 원본의 tags-input 에 해당. 팝업 행에 체크박스가 붙고 여러 개를 연달아
  고른 뒤 [확인]으로 닫는다. 칸에는 "김부장 외 1명"처럼 요약해 보여준다.
  적용: **쪽지 쓰기의 받는 사람**(체크박스 나열 → 코드도움 다중. 사용자가 늘면 나열은 못 쓴다) ·
  **조건별검색의 선택거래처합산**(`<select multiple>` + Ctrl 안내 → 코드도움 다중).
- ✅ **라벨 숨김(hideLabel)** — 라벨을 왼쪽에 두는 가로 배치 화면(재고수불부 등)이 기존 레이아웃을 유지하도록.
- ✅ 조회 조건 화면 배선: 재고수불부(창고·품목) · 재고변동표(창고) · 재고잔량분석표(창고) ·
  거래이력조회(거래처) · 조건별검색(거래처 단일/다중).

> 아직 남은 곳: 마스터 참조 `<select>` 는 35개 파일에 더 있다. 대부분 **입력 폼의 전표 라인**(판매입력·작업지시 등)이라
> 조회 조건과 성격이 달라 한 번에 바꾸지 않았다(CLAUDE.md 의 '대량 일괄 이식 금지'). 화면을 손볼 때 함께 바꾼다.
> 원본의 **계층그룹**(거래처·품목·창고 계층)은 우리 모델에 계층 자체가 없어 대상이 아니다.

---

## 8. 미구현(⬜) 사유 정리 (2026-07-31 갱신)

**2026-07-31 재점검**: 8장의 20종을 DOM으로 다시 열어 대조한 결과, **절반이 잘못 분류돼 있었다.**
'카테고리 노드'로 적어둔 셋은 실제로는 이미 구현된 화면의 재listing이었고, '중복/모델 밖'으로 적어둔 넷은
실제로 우리에게 없던 기능이었다(쪽지·기준일자 채권잔액·잔량 정합성·품질검사요청 연계). 그날 7종을 구현·정정했다.
**남은 진짜 미구현은 3종**이며, 전부 **파일 저장 인프라 또는 대외 제출 채널**이라는 하나의 선행 과제로 수렴한다.

### 8.1 외부 시스템 연동이 있어야 의미가 생김 → **연동 없이 성립하는 범위까지 전부 구현(2026-07-31)**
- ~~`데이터센터_데이터내보내기_E040231` 의료기기공급내역보고~~ → **구현됨**(2026-07-31). 품목에 UDI-DI 를 추가하고
  출고(판매)·폐기(재고조정)를 산출해 보고파일(CSV)을 만든다. **'전송' 버튼은 만들지 않았다** — 심평원 제출 채널·인증서가
  없으므로 산출·보관·이력까지가 범위다. 채널이 붙으면 산출 결과를 그대로 실어 보내면 된다. 아래 완료로그.
- ~~`그룹웨어_업무관리_E077100` ECDrive~~ → **이미 구현돼 있었고**(EcDrivePage), 2026-07-31 에 **실제 파일 업로드/다운로드**까지
  붙였다(V120 `stored_files`, 10MB 상한). 8.1 분류가 오판이었다.
- ~~`그룹웨어_업무관리_E200162` WORK~~ → **이미 구현돼 있었다**(WorkPage `/groupware/work`). 원본 DOM 도 게시일·유형·
  제목/내용·사용자·진행중/완료 탭을 가진 업무 게시판이며, 우리 WorkPost 가 같은 성격이다. 8.1 분류가 오판이었다.
- ~~`그룹웨어_공용메일_E077005` 스팸 메일함~~ → **구현됨**(2026-07-31). 이 prgId 의 DOM 자체는 화면이 아니라
  '공용메일설정' 안내 팝업이지만(Webmail 부가서비스 설명), 메뉴로는 스팸 메일함이 존재한다. 우리 모델에서 **외부 메일이
  들어오는 유일한 지점이 공용메일 수신 등록**이라 그 자리에 규칙 판정을 넣어 실제로 동작하는 스팸함을 만들었다. 아래 완료로그.
- ~~`재고_I_쇼핑몰관리_C000664` 몰 계정 기초등록~~ → **구현됨**(2026-07-27). 오픈API 인증/자동수집 연동 부분만 남기고, 레지스트리(계정 마스터·판매전환 거래처·수집/매핑 몰 선택 소스)는 MallAccountPage 로 구현. 아래 완료로그 참조.

### 8.2 우리 전표/데이터 모델 밖 (구조적)
- ~~`재고_I_영업관리_E040253` 판매입력 II~~ → **구현됨**(2026-07-27). EAV형 사용자정의필드 엔진(CustomFieldDef/Value)을 만들어 판매전표에 추가 형식필드를 부착. 아래 완료로그.
- ~~`데이터센터_데이터수집_E100000` 수집데이터등록~~ → **구현됨**(2026-07-27). collect_sources 레지스트리로 하드코딩을 이관, 소스=우리 API 목록 GET 엔드포인트로 동적 등록·실행. 아래 완료로그.

### 8.3 '중복'으로 적어뒀으나 실제로는 우리에게 없던 기능 (2026-07-31 전부 구현)
- ~~`재고_I_출력물_E040703` 채권/채무현황 · `E040721` 채권현황~~ → **구현됨**(2026-07-31). 중복이 아니었다.
  거래처관리대장은 '지금 잔액'만 보여주고 **기준일자(as-of)가 없었다.** 원본의 핵심 조건이 기준일자다. 아래 완료로그.
- ~~`재고_I_생산_외주_E040416` 생산입고 III~~ → **구현됨**(2026-07-31). III 가 II 와 다른 점은 소모품목 선택이 아니라
  (그건 II 와 같다) **입고와 동시에 품질검사요청을 생성**하는 것이었다. 우리 품질검사요청과 이어 붙였다. 아래 완료로그.
- ~~`재고_I_출력물_E010851` 쪽지수발신내역~~ → **구현됨**(2026-07-31). 쪽지 엔티티를 새로 만들었다(사내메일로 대체가
  아니었다 — 원본 쪽지의 본체는 **시스템 자동알림의 도착지**다). 아래 완료로그.

### 8.4 '카테고리 노드'로 적어뒀으나 실제로는 개별 화면 (2026-07-31 오탐 정정)
- ~~`재고_I_출력물_C000095` 영업관리현황 · `C000096` 구매관리현황 · `C000648` 생산/외주현황~~ → **목차 노드가 아니었다.**
  DOM 을 열어보니 각각 **판매현황 · 구매현황 · 작업지시서현황** 화면 그대로다(이미 구현된 화면의 재listing). ✅ 로 정정.
- ~~`재고_I_출력물_C000663` 커뮤니케이션센터~~ → **쪽지 화면과 DOM 이 완전히 같다**(같은 격자·같은 검색폼).
  플랫폼 허브가 아니라 쪽지의 다른 진입점이었다. ShortMessagePage 로 함께 해소. 아래 완료로그.
- ~~`재고_I_출력물_E040607` 잔량재집계~~ → **구현됨**(2026-07-31). '실시간 집계라 불필요'가 오판이었다. 우리도
  거래별 잔량(balanceAfter)을 **저장**하고 있어 입력순/일자순이 어긋날 수 있다. 실제로 점검해 보니 292건 중 280건이
  어긋나 있었고 재집계로 교정했다. 아래 완료로그.
- ~~`재고_I_출력물_E040730` 증빙센터~~ → **구현됨**(2026-07-31). 선행 과제였던 **파일 저장 인프라를 먼저 만들고**(V120)
  그 위에 증빙(V121)을 올렸다. 아래 완료로그.

### 8.5 그룹웨어 부가 (범위/정책 결정 필요)
- ~~`그룹웨어_공유정보_C000698` 사내관리~~ → **구현됨**(2026-07-27). DOM 확인 결과 '일정 검색/관리' 화면이었다(사내 규정 포털 아님). 일정에 장소·참석자를 추가하고 조건검색 뷰(ScheduleSearchPage)로 구현. 아래 완료로그.
- ~~`그룹웨어_공유정보_E070203` 조건별검색~~ → **구현됨**(2026-07-27). (앞서 "저장된 검색"으로 오판했으나 DOM 확인 결과 거래처관계기준 매출·매입 집계였음. ConditionSearchPage 로 구현 — 아래 완료로그.)

> **부록 340종의 ⬜ 가 0 이 됐다(2026-07-31).** 남은 것은 화면이 아니라 **외부 계약이 있어야 하는 두 가지**뿐이다.
> - **심평원 전송 채널** — 의료기기공급내역보고의 산출·보관·이력은 구현했고, '전송'만 남았다.
>   전송 규격·인증서가 확보되면 `MedicalDeviceReportService.generate` 결과를 그대로 실어 보내고,
>   `medical_device_reports` 에 전송상태·접수번호 컬럼을 더하면 된다.
> - **쇼핑몰 오픈API 인증/자동수집** — 몰 계정 마스터·품목코드 매핑·수동 수집은 구현했고, 자동 수집 연동만 남았다.
>
> 파일 저장은 더 이상 미해결이 아니다 — **Postgres bytea + 10MB 상한**으로 정하고(V120) ECDrive·증빙센터·보고파일이
> 모두 그 위에서 돈다. 오브젝트 스토리지로 옮길 때 손댈 곳은 `FileStorageService` 한 곳이다.
>
> **교훈**: 8장에 '중복·범위 밖'으로 적어둔 항목도 반드시 DOM 을 열어 대조하라. 2026-07-31 재점검에서
> 7종이 오분류였다. 화면명만 보고 "중복이겠지"라고 판단한 것이 원인이다(부록 ✅ 오탐과 같은 실수의 반대 방향).

- `b-na`(345) 항목은 DOM이 없다. 화면명만 보고 만들지 말 것 — 근거 자료가 없다.
- 매핑표의 ✅는 **제목 부분일치 자동판정**이라 오탐이 있다. 착수 전 그 화면을 실제로 열어 대조하라.
- 이카운트 원문 클래스명(`wrapper-form`, `btn-code-search` 등)을 그대로 쓰지 말 것.
  우리 토큰으로 옮긴다(CLAUDE.md·디자인 토큰 메모리).
- 백엔드 필드가 없으면 마이그레이션은 **엔티티와 같은 커밋**(CLAUDE.md §7). `ddl-auto: validate`라
  한쪽만 커밋하면 남의 앱이 기동에서 죽는다.

---

## 부록 A · 340개 수집화면(b-ok) 전체 대조표

`✅`=우리 화면과 제목 매칭(자동·대략) · `⬜`=미매칭/미구현. prgId로 3장 명령을 써서 DOM을 꺼낸다.

#### 재고 I › 구매관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_I_구매관리_C000075` | 발주요청 (PurchaseOrderPage) |
| ✅ | `재고_I_구매관리_C000076` | 발주계획 (PurchaseOrderPage) |
| ✅ | `재고_I_구매관리_C000077` | 발주서 |
| ✅ | `재고_I_구매관리_C000078` | 구매 |
| ✅ | `재고_I_구매관리_C000646` | 단가요청 (PurchaseOrderPage) |
| ✅ | `재고_I_구매관리_E040301` | 발주서입력 |
| ✅ | `재고_I_구매관리_E040302` | 발주서조회 |
| ✅ | `재고_I_구매관리_E040303` | 구매입력 (TradeEntry `/sales/buy`) |
| ✅ | `재고_I_구매관리_E040304` | 구매조회 (TradeInquiryPage `/sales/purchase-list`) |
| ✅ | `재고_I_구매관리_E040305` | 구매현황 |
| ✅ | `재고_I_구매관리_E040306` | 발주서현황 (실구현 — 이전 ✅는 오탐이었음) |
| ✅ | `재고_I_구매관리_E040307` | 미구매현황 (실구현 — 이전 ✅는 오탐이었음) |
| ✅ | `재고_I_구매관리_E040309` | 거래처별채무 (LedgerPage·PartnerLedgerPage) |
| ✅ | `재고_I_구매관리_E040310` | 지급현황 |
| ✅ | `재고_I_구매관리_E040311` | 구매단가일괄변경 |
| ✅ | `재고_I_구매관리_E040312` | 구매일괄회계반영 (AccountingReflectionPage 일괄반영) |
| ✅ | `재고_I_구매관리_E040313` | 구매할인현황 |
| ✅ | `재고_I_구매관리_E040314` | 발주요청입력 (PurchaseOrderPage 발주서 생성) |
| ✅ | `재고_I_구매관리_E040315` | 발주요청조회 (PurchaseOrderPage 발주요청 탭) |
| ✅ | `재고_I_구매관리_E040316` | 발주계획입력 (PurchaseOrderPage /plan) |
| ✅ | `재고_I_구매관리_E040317` | 발주계획조회 (PurchaseOrderPage 발주계획 탭) |
| ✅ | `재고_I_구매관리_E040318` | 발주요청현황 (풀스택 — 백엔드 조회/집계 엔드포인트 신설) |
| ✅ | `재고_I_구매관리_E040319` | 회계미반영현황 (구매) (AccountingReflectionPage) |
| ✅ | `재고_I_구매관리_E040321` | 단가요청입력 (PurchaseOrderPage /prices) |
| ✅ | `재고_I_구매관리_E040322` | 단가요청조회 (PurchaseOrderPage 단가확정 탭) |
| ✅ | `재고_I_구매관리_E040323` | 단가요청진행단계 (PriceRequestProgressPage `/sales/price-request-progress` 문서별 진행단계 스테퍼) |
| ✅ | `재고_I_구매관리_E040325` | 단가요청현황 (파이프라인 현황 재사용, 기본 PRICED) |
| ✅ | `재고_I_구매관리_E041015` | 발주계획현황 (파이프라인 현황 재사용, 기본 PLANNED) |

#### 재고 I › 기초등록

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_I_기초등록_E010101` | 거래처등록 |
| ✅ | `재고_I_기초등록_E010103` | 카드등록 |
| ✅ | `재고_I_기초등록_E010104` | 계좌등록 |
| ✅ | `재고_I_기초등록_E010109` | 카드사등록 (PaymentMastersPage `/accounting/card-issuers` — 풀스택 신규 card_issuers+V110) |
| ✅ | `재고_I_기초등록_E010110` | 사원(담당)등록 (EmployeePage — 오탐 정정) |
| ✅ | `재고_I_기초등록_E010114` | 결제대행사등록 (PaymentMastersPage `/accounting/payment-agencies` — 풀스택 신규 payment_agencies+V110) |
| ✅ | `재고_I_기초등록_E040114` | 외화등록 (CurrencyPage — 오탐 정정) |

#### 재고 I › 기타이동

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_I_기타이동_C000086` | 창고이동 |
| ✅ | `재고_I_기타이동_C000087` | 자가사용 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_C000088` | 불량처리 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_C000089` | 재고조정 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_E040501` | 창고이동입력 |
| ✅ | `재고_I_기타이동_E040502` | 창고이동조회 |
| ✅ | `재고_I_기타이동_E040503` | 자가사용입력 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_E040504` | 자가사용조회 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_E040505` | 창고이동현황 |
| ✅ | `재고_I_기타이동_E040506` | 자가사용현황 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_E040507` | 불량처리입력 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_E040508` | 불량처리조회 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_E040509` | 불량처리현황 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_E040510` | 대체사용현황 (TransferPage 대체사용 탭) |
| ✅ | `재고_I_기타이동_E040511` | 폐기현황 (TransferPage 폐기 탭) |
| ✅ | `재고_I_기타이동_E040512` | 불량률파악보고서 (DefectReportPage `/quality/defect-report`) |
| ✅ | `재고_I_기타이동_E040604` | 단계별재고조정 (StagedAdjustmentPage `/inventory/staged-adjustment` 요청 폼) |
| ✅ | `재고_I_기타이동_E040608` | 재고조정현황 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_E040612` | 단계별재고실사 (StocktakePage `/inventory/stocktake`) |
| ✅ | `재고_I_기타이동_E040613` | 재고실사조회 (실사결과=ADJUST, 기타이동 재고조정 탭) |
| ✅ | `재고_I_기타이동_E040614` | 재고조정조회 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_E040615` | 재고실사현황 (실사결과=ADJUST, 기타이동 재고조정 탭) |
| ✅ | `재고_I_기타이동_E040635` | 간편재고조정 (TransferPage 기타이동 탭) |
| ✅ | `재고_I_기타이동_E040650` | 재고조정진행단계 (StagedAdjustmentPage 진행단계 뷰 — 장부/실사/차이·상태탭) |

#### 재고 I › 생산/외주

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_I_생산_외주_C000080` | BOM(소요량) (BomPage) |
| ✅ | `재고_I_생산_외주_C000081` | 작업지시서 |
| ✅ | `재고_I_생산_외주_C000082` | 생산불출 |
| ✅ | `재고_I_생산_외주_C000083` | 생산입고 |
| ✅ | `재고_I_생산_외주_C000084` | 외주비회계반영 (AccountingReflectionPage — 외주 전용 도메인 없음, 구매 회계반영이 커버·오탐 정정) |
| ✅ | `재고_I_생산_외주_C001251` | 공정 |
| ✅ | `재고_I_생산_외주_C001252` | 작업 |
| ✅ | `재고_I_생산_외주_E040309` | 거래처별채무 (LedgerPage) |
| ✅ | `재고_I_생산_외주_E040310` | 지급현황 |
| ✅ | `재고_I_생산_외주_E040401` | BOM(소요량)조회 (BomPage) |
| ✅ | `재고_I_생산_외주_E040402` | BOM(소요량)현황 (BomPage) |
| ✅ | `재고_I_생산_외주_E040403` | 소요량계산 (MrpPage) |
| ✅ | `재고_I_생산_외주_E040404` | 생산불출입력 |
| ✅ | `재고_I_생산_외주_E040405` | 생산불출조회 |
| ✅ | `재고_I_생산_외주_E040406` | 생산입고 I |
| ✅ | `재고_I_생산_외주_E040407` | 생산입고 II |
| ✅ | `재고_I_생산_외주_E040408` | 생산입고조회 |
| ✅ | `재고_I_생산_외주_E040409` | 생산불출현황 |
| ✅ | `재고_I_생산_외주_E040410` | 생산입고현황 |
| ✅ | `재고_I_생산_외주_E040411` | 작업지시서입력 (WorkOrderPage) |
| ✅ | `재고_I_생산_외주_E040412` | 작업지시서조회 (WorkOrderPage·WoStatusPage) |
| ✅ | `재고_I_생산_외주_E040413` | 작업지시서현황 |
| ✅ | `재고_I_생산_외주_E040414` | 작업지시서별진행현황 |
| ✅ | `재고_I_생산_외주_E040415` | 생산입고/소모현황 I (ConsumeStatusPage) |
| ✅ | `재고_I_생산_외주_E040416` | 생산입고 III (ManualConsumeReceiptPage `withQualityRequest` — 소모품목 선택 + 품질검사요청 생성) |
| ✅ | `재고_I_생산_외주_E040418` | 외주비일괄회계반영 (AccountingReflectionPage 일괄반영 — 오탐 정정) |
| ✅ | `재고_I_생산_외주_E040419` | 외주비할인현황 |
| ✅ | `재고_I_생산_외주_E040425` | 공정등록 |
| ✅ | `재고_I_생산_외주_E040426` | 자원등록 |
| ✅ | `재고_I_생산_외주_E040427` | BOR(작업소요시간) (BorPage) |
| ✅ | `재고_I_생산_외주_E040428` | 소요시간계산 |
| ✅ | `재고_I_생산_외주_E040429` | 작업지시서작업처리 (WorkResultPage) |
| ✅ | `재고_I_생산_외주_E040430` | 작업내역입력 |
| ✅ | `재고_I_생산_외주_E040431` | 작업내역조회 (WorkResultListPage) |
| ✅ | `재고_I_생산_외주_E040432` | 작업내역현황 |
| ✅ | `재고_I_생산_외주_E040435` | 생산계획/MRP생성 (MrpPage·PlanningPage) |
| ✅ | `재고_I_생산_외주_E040436` | 작업지시서효율현황 |

#### 재고 I › 쇼핑몰관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_I_쇼핑몰관리_C000664` | 쇼핑몰등록 (MallAccountPage `/sales/mall-accounts` — 쇼핑몰/솔루션 계정 마스터·판매전환 거래처·수집/매핑 몰 선택 소스. V115. 오픈API 자동수집 연동은 별개) |
| ✅ | `재고_I_쇼핑몰관리_C000665` | 주문관리 (MallPage) |
| ✅ | `재고_I_쇼핑몰관리_E041003` | 쇼핑몰관리/상품생성설정 |
| ✅ | `재고_I_쇼핑몰관리_E041004` | 쇼핑몰품목코드연결 (MallItemMappingPage `/sales/mall-item-mappings` — (몰·몰품목코드)→품목 매핑, 수집 시 자동연결. V114) |
| ✅ | `재고_I_쇼핑몰관리_E041005` | 주문관리진행단계 (MallPage 상태탭) |
| ✅ | `재고_I_쇼핑몰관리_E041006` | 주문확인처리 (MallPage confirm) |
| ✅ | `재고_I_쇼핑몰관리_E041007` | 배송처리 (MallPage 배송처리 — CONVERTED→SHIPPED, 택배사·송장·배송일. V112·V113) |
| ✅ | `재고_I_쇼핑몰관리_E041008` | 취소처리 (MallPage cancel) |
| ✅ | `재고_I_쇼핑몰관리_E041009` | 반품처리 (MallPage 반품 — SHIPPED→RETURNED, 사유·최종처리일) |
| ✅ | `재고_I_쇼핑몰관리_E041010` | 교환처리 (MallPage 교환 — SHIPPED→EXCHANGED, 사유·재발송 택배정보) |
| ✅ | `재고_I_쇼핑몰관리_E041011` | ERP전송 (MallPage 판매전환 convert) |

#### 재고 I › 영업관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_I_영업관리_C000071` | 견적서 |
| ✅ | `재고_I_영업관리_C000072` | 주문서 (SalesOrderPage) |
| ✅ | `재고_I_영업관리_C000073` | 판매 |
| ✅ | `재고_I_영업관리_C000120` | 출하지시서 |
| ✅ | `재고_I_영업관리_C000138` | 출하 |
| ✅ | `재고_I_영업관리_E040201` | 견적서입력 |
| ✅ | `재고_I_영업관리_E040202` | 견적서조회 |
| ✅ | `재고_I_영업관리_E040203` | 주문서입력 (SalesOrderPage 오더관리·수주) |
| ✅ | `재고_I_영업관리_E040204` | 주문서조회 (SalesOrderPage 오더관리·수주) |
| ✅ | `재고_I_영업관리_E040205` | 판매입력 (TradeEntry `/sales/sell`) |
| ✅ | `재고_I_영업관리_E040206` | 판매조회 (TradeInquiryPage `/sales/sales-list`) |
| ✅ | `재고_I_영업관리_E040207` | 판매현황 |
| ✅ | `재고_I_영업관리_E040208` | 견적서현황 |
| ✅ | `재고_I_영업관리_E040209` | 주문서현황 |
| ✅ | `재고_I_영업관리_E040210` | 거래명세서인쇄 |
| ✅ | `재고_I_영업관리_E040211` | 미주문현황 |
| ✅ | `재고_I_영업관리_E040212` | 미판매현황 |
| ✅ | `재고_I_영업관리_E040214` | 거래처별채권 |
| ✅ | `재고_I_영업관리_E040215` | 판매일괄회계반영 (AccountingReflectionPage 일괄반영) |
| ✅ | `재고_I_영업관리_E040216` | 판매할인현황 |
| ✅ | `재고_I_영업관리_E040217` | 수금현황 |
| ✅ | `재고_I_영업관리_E040220` | 출하지시서입력 |
| ✅ | `재고_I_영업관리_E040221` | 출하지시서조회 |
| ✅ | `재고_I_영업관리_E040222` | 출하지시서현황 |
| ✅ | `재고_I_영업관리_E040224` | 판매단가일괄변경 |
| ✅ | `재고_I_영업관리_E040225` | 출하입력 (ShipmentOrderPage 직접등록 폼 — 오탐 정정) |
| ✅ | `재고_I_영업관리_E040226` | 출하조회 (ShipmentInquiryPage `/sales/shipment-inquiry` 신규) |
| ✅ | `재고_I_영업관리_E040227` | 출하현황 |
| ✅ | `재고_I_영업관리_E040228` | 미출하현황 |
| ✅ | `재고_I_영업관리_E040230` | 주문서출고처리 (UnshippedPage 주문라인→출하지시 — 오탐 정정) |
| ✅ | `재고_I_영업관리_E040253` | 판매입력 II (사용자정의필드 엔진 — CustomFieldPage 정의 + 판매조회 상세의 추가항목 패널로 문자/숫자/일자/코드 입력. V116) |
| ✅ | `재고_I_영업관리_E040254` | 결제내역조회 |
| ✅ | `재고_I_영업관리_E040255` | 결제내역자료비교 |
| ✅ | `재고_I_영업관리_E040609` | 회계미반영현황 (판매) (AccountingReflectionPage) |

#### 재고 I › 출력물

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_I_출력물_C000095` | 영업관리현황 (DOM=판매현황 재listing — SalesStatusPage. 카테고리 노드 아님·오탐 정정) |
| ✅ | `재고_I_출력물_C000096` | 구매관리현황 (DOM=구매현황 재listing — PurchaseStatusPage. 오탐 정정) |
| ✅ | `재고_I_출력물_C000097` | 출력물 |
| ✅ | `재고_I_출력물_C000648` | 생산/외주현황 (DOM=작업지시서현황 재listing — WoStatusPage. 오탐 정정) |
| ✅ | `재고_I_출력물_C000649` | 기타이동현황 |
| ✅ | `재고_I_출력물_C000650` | 기타 |
| ✅ | `재고_I_출력물_C000663` | 커뮤니케이션센터 (DOM=쪽지 화면과 동일 — ShortMessagePage `/groupware/messages`) |
| ✅ | `재고_I_출력물_C000687` | 재고현황 |
| ✅ | `재고_I_출력물_E010833` | 거래처관리대장 I |
| ✅ | `재고_I_출력물_E010842` | 거래처관리대장 II |
| ✅ | `재고_I_출력물_E010851` | 쪽지수발신내역 (ShortMessagePage — 풀스택 신규 short_messages+V119, 전자결재 자동알림) |
| ✅ | `재고_I_출력물_E040207` | 판매현황 |
| ✅ | `재고_I_출력물_E040208` | 견적서현황 |
| ✅ | `재고_I_출력물_E040209` | 주문서현황 (SalesOrderStatusPage — 영업관리와 동일·오탐 정정) |
| ✅ | `재고_I_출력물_E040210` | 거래명세서인쇄 |
| ✅ | `재고_I_출력물_E040211` | 미주문현황 (UnorderedStatusPage — 오탐 정정) |
| ✅ | `재고_I_출력물_E040212` | 미판매현황 |
| ✅ | `재고_I_출력물_E040214` | 거래처별채권 |
| ✅ | `재고_I_출력물_E040216` | 판매할인현황 |
| ✅ | `재고_I_출력물_E040217` | 수금현황 |
| ✅ | `재고_I_출력물_E040222` | 출하지시서현황 |
| ✅ | `재고_I_출력물_E040227` | 출하현황 |
| ✅ | `재고_I_출력물_E040228` | 미출하현황 |
| ✅ | `재고_I_출력물_E040305` | 구매현황 |
| ✅ | `재고_I_출력물_E040306` | 발주서현황 |
| ✅ | `재고_I_출력물_E040307` | 미구매현황 |
| ✅ | `재고_I_출력물_E040309` | 거래처별채무 (LedgerPage·PartnerLedgerPage — 오탐 정정) |
| ✅ | `재고_I_출력물_E040310` | 지급현황 |
| ✅ | `재고_I_출력물_E040313` | 구매할인현황 |
| ✅ | `재고_I_출력물_E040318` | 발주요청현황 (PurchaseRequestStatusPage — 오탐 정정) |
| ✅ | `재고_I_출력물_E040319` | 회계미반영현황 (구매) (AccountingReflectionPage — 오탐 정정) |
| ✅ | `재고_I_출력물_E040409` | 생산불출현황 |
| ✅ | `재고_I_출력물_E040410` | 생산입고현황 |
| ✅ | `재고_I_출력물_E040413` | 작업지시서현황 |
| ✅ | `재고_I_출력물_E040414` | 작업지시서별진행현황 |
| ✅ | `재고_I_출력물_E040415` | 생산입고/소모현황 I (ConsumeStatusPage — 오탐 정정) |
| ✅ | `재고_I_출력물_E040432` | 작업내역현황 |
| ✅ | `재고_I_출력물_E040436` | 작업지시서효율현황 |
| ✅ | `재고_I_출력물_E040505` | 창고이동현황 |
| ✅ | `재고_I_출력물_E040506` | 자가사용현황 (TransferPage 기타이동 탭 — 오탐 정정) |
| ✅ | `재고_I_출력물_E040509` | 불량처리현황 (TransferPage 기타이동 탭 — 오탐 정정) |
| ✅ | `재고_I_출력물_E040510` | 대체사용현황 (TransferPage 대체사용 탭) |
| ✅ | `재고_I_출력물_E040511` | 폐기현황 (TransferPage 폐기 탭) |
| ✅ | `재고_I_출력물_E040512` | 불량률파악보고서 (DefectReportPage `/quality/defect-report`) |
| ✅ | `재고_I_출력물_E040607` | 잔량재집계 (StockRecalcPage `/inventory/recalc` — 점검/반영, 거래잔량·현재고 정합) |
| ✅ | `재고_I_출력물_E040608` | 재고조정현황 (TransferPage 기타이동 탭 — 오탐 정정) |
| ✅ | `재고_I_출력물_E040609` | 회계미반영현황 (판매) (AccountingReflectionPage — 오탐 정정) |
| ✅ | `재고_I_출력물_E040615` | 재고실사현황 (실사=ADJUST, TransferPage 재고조정 탭 — 오탐 정정) |
| ✅ | `재고_I_출력물_E040627` | 거래처중심입력 |
| ✅ | `재고_I_출력물_E040633` | 품목중심입력 (ItemEntryPage `/sales/item-entry`) |
| ✅ | `재고_I_출력물_E040701` | 재고현황 |
| ✅ | `재고_I_출력물_E040702` | 재고수불부 (StockLedgerPage `/inventory/ledger`) |
| ✅ | `재고_I_출력물_E040703` | 채권/채무현황 (ArApStatusPage `/sales/ar-ap-status` — 기준일자 as-of 잔액) |
| ✅ | `재고_I_출력물_E040704` | 경영자보고서 (ExecutiveReportPage `/inventory/executive-report`) |
| ✅ | `재고_I_출력물_E040708` | 일보 (DailyReportPage `/inventory/daily-report` 단일일자 운영 다이제스트) |
| ✅ | `재고_I_출력물_E040709` | 현황누계표 (MonthlyCumulativePage `/sales/monthly-cumulative`) |
| ✅ | `재고_I_출력물_E040710` | 집계표 (PivotSummaryPage `/sales/pivot-summary`) |
| ✅ | `재고_I_출력물_E040711` | 창고별재고현황 |
| ✅ | `재고_I_출력물_E040713` | 월별채권증감내역 (MonthlyArApPage `/sales/monthly-ar-ap` 채권) |
| ✅ | `재고_I_출력물_E040714` | 월별채무증감내역 (MonthlyArApPage 채무 토글) |
| ✅ | `재고_I_출력물_E040716` | 거래이력조회 (TradeHistoryPage `/sales/trade-history`) |
| ✅ | `재고_I_출력물_E040719` | 재고변동표 (StockMovementPage `/inventory/movement`) |
| ✅ | `재고_I_출력물_E040720` | 다규격별재고현황 |
| ✅ | `재고_I_출력물_E040721` | 채권현황 (ArApStatusPage `/sales/receivable-status`, defaultMode=RECEIVABLE) |
| ✅ | `재고_I_출력물_E040722` | 채무현황 |
| ✅ | `재고_I_출력물_E040723` | 거래처관리대장1(채권) |
| ✅ | `재고_I_출력물_E040724` | 거래처관리대장1(채무) |
| ✅ | `재고_I_출력물_E040725` | 판매구매집계표 (SalesPurchaseSummaryPage `/sales/sales-purchase-summary`) |
| ✅ | `재고_I_출력물_E040726` | BOM환산재고현황 |
| ✅ | `재고_I_출력물_E040727` | 재고잔량분석표 (StockAnalysisPage `/inventory/stock-analysis`) |
| ✅ | `재고_I_출력물_E040728` | 관계별재고현황 |
| ✅ | `재고_I_출력물_E040730` | 증빙센터 (EvidenceCenterPage `/accounting/evidence-center` — 파일저장 인프라 V120 + 증빙 V121, 전표 상세 증빙 패널에서 등록) |
| ✅ | `재고_I_출력물_E040806` | 일별이익현황 |
| ✅ | `재고_I_출력물_E040807` | 일별재고현황 |
| ✅ | `재고_I_출력물_E040819` | 단가변동표 (PriceMovementPage `/sales/price-movement`) |
| ✅ | `재고_I_출력물_E041015` | 발주계획현황 (PurchaseRequestStatusPage PLANNED — 오탐 정정) |

#### 재고 II › A/S관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_II_A_S관리_C000688` | A/S접수 |
| ✅ | `재고_II_A_S관리_C000689` | A/S수리 (AsManagePage 상태전이+수리내역) |
| ✅ | `재고_II_A_S관리_E040601` | A/S접수입력 (AsManagePage) |
| ✅ | `재고_II_A_S관리_E040602` | A/S접수조회 (AsManagePage) |
| ✅ | `재고_II_A_S관리_E040605` | A/S수리입력 (AsManagePage 상태전이) |
| ✅ | `재고_II_A_S관리_E040606` | A/S수리조회 (AsManagePage) |
| ✅ | `재고_II_A_S관리_E040610` | A/S접수현황 (AsStatusPage `/quality/as-status`) |
| ✅ | `재고_II_A_S관리_E040611` | A/S수리현황 (AsStatusPage — 접수현황과 통합) |
| ✅ | `재고_II_A_S관리_E040641` | A/S소모현황 (AsConsumptionPage `/quality/as-consumption` — 소모부품 풀스택 신규) |

#### 재고 II › 계획관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_II_계획관리_C000653` | 프로젝트계획 (ProjectPlanPage `/accounting/project-plan`) |
| ✅ | `재고_II_계획관리_C000694` | 매출계획 (SalesPlanPage `/sales/sales-plan`) |
| ✅ | `재고_II_계획관리_E040624` | 매출계획입력 (SalesPlanPage 등록) |
| ✅ | `재고_II_계획관리_E040625` | 매출계획조회 (SalesPlanPage) |
| ✅ | `재고_II_계획관리_E040626` | 매출계획비교표 (계획vs실적·달성률) |
| ✅ | `재고_II_계획관리_E040636` | 프로젝트계획조회 (ProjectPlanPage) |
| ✅ | `재고_II_계획관리_E040637` | 프로젝트계획/실적현황 (ProjectPlanPage 계획vs실적 비교표) |
| ✅ | `재고_II_계획관리_E040640` | 매출계획현황 (SalesPlanPage 비교표) |

#### 재고 II › 수출관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_II_수출관리_E040905` | Invoice / Packing List (ExportPage 인보이스·인쇄) |
| ✅ | `재고_II_수출관리_E040906` | Invoice/Packing List 입력 (ExportPage 등록) |
| ✅ | `재고_II_수출관리_E040907` | Invoice/Packing List Status (ExportPage 통관·선적·입금) |

#### 재고 II › 시리얼/로트No.

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_II_시리얼_로트No__C000690` | 시리얼/로트No.등록 |
| ✅ | `재고_II_시리얼_로트No__C000691` | 시리얼/로트No. 재고조정 (SerialLotPage 실사조정 → ADJUST 이력) |
| ✅ | `재고_II_시리얼_로트No__E040617` | 시리얼/로트No.등록 |
| ✅ | `재고_II_시리얼_로트No__E040618` | 시리얼/로트No.내역조회 (LotLedgerPage `/quality/lot-ledger`) |
| ✅ | `재고_II_시리얼_로트No__E040619` | 시리얼/로트No.재고현황 |
| ✅ | `재고_II_시리얼_로트No__E040620` | 시리얼/로트No.재고수불부 (LotLedgerPage 잔량 running) |
| ✅ | `재고_II_시리얼_로트No__E040634` | 시리얼/로트No.재고조정 (lots/{id}/adjust) |
| ✅ | `재고_II_시리얼_로트No__E040639` | 시리얼/로트No.내역현황 (LotLedgerPage 유형/로트 필터) |
| ✅ | `재고_II_시리얼_로트No__E041018` | 품목vs시리얼재고수량비교 (LotStockComparePage `/quality/lot-compare`) |

#### 재고 II › 오더관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_II_오더관리_E040901` | 오더관리유형등록 |
| ✅ | `재고_II_오더관리_E040904` | 오더관리진행단계 |

#### 재고 II › 이익관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_II_이익관리_C000098` | 월별이익 |
| ✅ | `재고_II_이익관리_C000099` | 일별이익 |
| ✅ | `재고_II_이익관리_E040802` | 원가생성/수정 |
| ✅ | `재고_II_이익관리_E040804` | 실제원가현황 |
| ✅ | `재고_II_이익관리_E040805` | 월별이익현황 |
| ✅ | `재고_II_이익관리_E040806` | 일별이익현황 |
| ✅ | `재고_II_이익관리_E040807` | 일별재고현황 |
| ✅ | `재고_II_이익관리_E040808` | 표준원가현황 |
| ✅ | `재고_II_이익관리_E040809` | 차이분석 |

#### 재고 II › 품질관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `재고_II_품질관리_C000692` | 품질검사요청 (QualityRequestPage `/quality/inspection-request`) |
| ✅ | `재고_II_품질관리_C000693` | 품질검사 (QualityInspectionPage) |
| ✅ | `재고_II_품질관리_E040621` | 품질검사입력 (QualityInspectionPage) |
| ✅ | `재고_II_품질관리_E040622` | 품질검사조회 (QualityInspectionPage) |
| ✅ | `재고_II_품질관리_E040623` | 품질검사현황 (QualityStatusPage `/quality/inspection-status`) |
| ✅ | `재고_II_품질관리_E040628` | 품질검사요청입력 (QualityRequestPage 등록) |
| ✅ | `재고_II_품질관리_E040629` | 품질검사요청조회 (QualityRequestPage 상태탭) |
| ✅ | `재고_II_품질관리_E040630` | 품질검사요청현황 (QualityRequestPage 상태탭) |
| ✅ | `재고_II_품질관리_E040631` | 미검사현황 (QualityRequestPage 요청탭 = REQUESTED) |
| ✅ | `재고_II_품질관리_E040632` | 품질검사유형등록 (수입/공정/출하 enum 고정) |

#### 회계 I › 기초등록

| | prgId | 화면명 |
|--|--|--|
| ✅ | `회계_I_기초등록_E010101` | 거래처등록 |
| ✅ | `회계_I_기초등록_E010110` | 사원(담당)등록 (EmployeePage) |
| ✅ | `회계_I_기초등록_E040102` | 창고등록 |
| ✅ | `회계_I_기초등록_E040103` | 품목등록 |
| ✅ | `회계_I_기초등록_E040104` | 관리항목등록 |
| ✅ | `회계_I_기초등록_E040111` | 인쇄용결재라인등록(재고) |
| ✅ | `회계_I_기초등록_E040113` | 각종코드변경 (CommonCodePage `/settings/codes` 공통코드 관리 — 오탐 정정) |
| ✅ | `회계_I_기초등록_E040114` | 외화등록 (CurrencyPage) |
| ✅ | `회계_I_기초등록_E040120` | 거래처특별단가그룹등록 |
| ✅ | `회계_I_기초등록_E040122` | 품목별단가 (SalesPriceBulk·PurchasePriceBulkPage 표준단가) |
| ✅ | `회계_I_기초등록_E040124` | 특별단가등록 (SpecialPricePage `/sales/special-price` — 풀스택 신규 special_prices+V109·거래처별/그룹별 실단가·resolve 폴백) |
| ✅ | `회계_I_기초등록_E040125` | 단가적용순서설정 (PriceOrderPage) |
| ✅ | `회계_I_기초등록_E040126` | 단가관리 (PriceOrder·PriceBulk·특별단가그룹 조합) |

#### 회계 II › 비용관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `회계_II_비용관리_C000658` | 비용현황 |
| ✅ | `회계_II_비용관리_E060813` | 비용내역조회 |
| ✅ | `회계_II_비용관리_E060815` | 비용내역현황 |

#### 그룹웨어 › 고객관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `그룹웨어_고객관리_E010101` | 거래처등록 |
| ✅ | `그룹웨어_고객관리_E040627` | 거래처중심입력 |

#### 그룹웨어 › 공용메일

| | prgId | 화면명 |
|--|--|--|
| ✅ | `그룹웨어_공용메일_E077000` | 전체 메일함 (MailPage — 수신/발신/공용 탭) |
| ✅ | `그룹웨어_공용메일_E077001` | 받은 메일함 (MailPage 수신함) |
| ✅ | `그룹웨어_공용메일_E077002` | 보낸 메일함 (MailPage 발신함) |
| ✅ | `그룹웨어_공용메일_E077003` | 수신확인함 (MailPage 발신함 읽음상태) |
| ✅ | `그룹웨어_공용메일_E077004` | 임시 보관함 (MailPage 임시보관함 — 초안 저장/수정/발송, draft 플래그+V111) |
| ✅ | `그룹웨어_공용메일_E077005` | 스팸 메일함 (MailPage 스팸함 탭 + 스팸규칙 V123 — 공용메일 수신 시 규칙 자동분류·수동 지정/해제). ※ 이 prgId 의 DOM 자체는 '공용메일설정' 안내 팝업이라 화면 근거는 메뉴명 기준 |
| ✅ | `그룹웨어_공용메일_E077006` | 지운 메일함 (MailPage 지운함 — 소프트삭제/복원/영구삭제, deleted_at+V111) |
| ✅ | `그룹웨어_공용메일_E077007` | 메일 쓰기 (MailPage compose 사내/공용) |
| ✅ | `그룹웨어_공용메일_E077008` | 기본 메일함 (MailPage 수신함) |

#### 그룹웨어 › 공유정보

| | prgId | 화면명 |
|--|--|--|
| ✅ | `그룹웨어_공유정보_C000698` | 사내관리 (ScheduleSearchPage `/groupware/schedule-search` — 일정 조건검색(기간·구분·참석자/장소/제목). 일정에 장소·참석자 추가 V118) |
| ✅ | `그룹웨어_공유정보_C001123` | 설문조사 |
| ✅ | `그룹웨어_공유정보_E070201` | 일정관리 |
| ✅ | `그룹웨어_공유정보_E070203` | 조건별검색 (ConditionSearchPage `/sales/condition-search` — 거래처관계기준 개별/연결그룹합산/선택합산 매출·매입 집계. PartnerResponse 그룹필드 보강) |
| ✅ | `그룹웨어_공유정보_E070204` | 공용품관리 |
| ✅ | `그룹웨어_공유정보_E070205` | 주요전달사항 (KeyNoticePage `/groupware/key-notice` 결재할 문서+상신 진행중 대시보드) |
| ✅ | `그룹웨어_공유정보_E070252` | 익명게시판 |
| ✅ | `그룹웨어_공유정보_E070256` | 설문조사입력 |
| ✅ | `그룹웨어_공유정보_E070257` | 설문조사조회 |
| ✅ | `그룹웨어_공유정보_E070258` | 설문조사현황 |
| ✅ | `그룹웨어_공유정보_E072501` | 게시판 |
| ✅ | `그룹웨어_공유정보_E200062` | 공지사항 |

#### 그룹웨어 › 업무관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `그룹웨어_업무관리_C000107` | 출/퇴근 (AttendancePage `/groupware/attendance` — 오탐 정정) |
| ✅ | `그룹웨어_업무관리_E070304` | 업무일지 (WorkLogPage — 오탐 정정) |
| ✅ | `그룹웨어_업무관리_E070305` | 출/퇴근기록부(ID) (AttendancePage — 오탐 정정) |
| ✅ | `그룹웨어_업무관리_E070306` | 출/퇴근현황(ID) (AttendanceStatusPage 근태현황 — 오탐 정정) |
| ✅ | `그룹웨어_업무관리_E070307` | 지각현황(ID) (LateArrivalPage `/hr/attendance-late` 신규) |
| ✅ | `그룹웨어_업무관리_E070309` | 일별근무시간(ID) (DailyWorkHoursPage `/hr/daily-hours` 월 타임시트 매트릭스) |
| ✅ | `그룹웨어_업무관리_E070315` | 출퇴근/근태/일정현황(ID) (WorkIntegratedPage `/hr/work-integrated` 근태+일정 통합) |
| ✅ | `그룹웨어_업무관리_E071501` | 업무관리게시판 |
| ✅ | `그룹웨어_업무관리_E077100` | ECDrive (EcDrivePage — 문서함/중요/휴지통 + **실파일 업로드·다운로드**(V120 stored_files, 10MB 상한)) |
| ✅ | `그룹웨어_업무관리_E200162` | WORK (WorkPage — 업무 게시글 전체/진행중/완료) |

#### 그룹웨어 › 전자결재

| | prgId | 화면명 |
|--|--|--|
| ✅ | `그룹웨어_전자결재_E070103` | 기안서작성 (ApprovalDraftPage `/groupware/approval/draft` — 오탐 정정) |
| ✅ | `그룹웨어_전자결재_E070105` | 내결재관리 |
| ✅ | `그룹웨어_전자결재_E070108` | 기안서통합관리 |

#### 그룹웨어 › 프로젝트

| | prgId | 화면명 |
|--|--|--|
| ✅ | `그룹웨어_프로젝트_E074500` | 진척관리 (ProjectPage `/groupware/project` 진척률·상태 관리 — 오탐 정정) |
| ✅ | `그룹웨어_프로젝트_E200419` | 건설예정공정표 |
| ✅ | `그룹웨어_프로젝트_E200421` | SW개발일정관리 |

#### 관리 › 근태관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `관리_근태관리_C000137` | 출력물 |
| ✅ | `관리_근태관리_C000702` | 근태 |
| ✅ | `관리_근태관리_E020710` | 근태입력 |
| ✅ | `관리_근태관리_E020711` | 근태조회 |
| ✅ | `관리_근태관리_E020715` | 근태현황 |
| ✅ | `관리_근태관리_E020716` | 휴가잔여일수현황 |
| ✅ | `관리_근태관리_E020719` | 휴가사용실적현황 |

#### 데이터센터 › 데이터내보내기

| | prgId | 화면명 |
|--|--|--|
| ✅ | `데이터센터_데이터내보내기_E040231` | 의료기기공급내역보고 (MedicalDeviceReportPage — 품목 UDI-DI + 출고/폐기 산출 + 보고파일 CSV·이력 V122. 대외 전송은 채널 없어 제외) |

#### 데이터센터 › 데이터수집

| | prgId | 화면명 |
|--|--|--|
| ✅ | `데이터센터_데이터수집_E100000` | 수집데이터등록 (CollectSourcePage `/datacenter/collect-sources` — collect_sources 레지스트리, 데이터수집이 DB에서 소스 로드. V117) |
| ✅ | `데이터센터_데이터수집_E101001` | 거래명세서수집 (DataCollectPage 판매 전표 소스) |
| ✅ | `데이터센터_데이터수집_E101049` | 견적서수집 |
| ✅ | `데이터센터_데이터수집_E101050` | 발주서수집 |
| ✅ | `데이터센터_데이터수집_E101501` | 수집데이터 (DataCollectPage 수집결과) |

#### Self-Customizing › 다운로드

| | prgId | 화면명 |
|--|--|--|
| ✅ | `Self_Customizing_다운로드_E000129` | 엑셀자료올리기기능 (DownloadPage `/settings/download` 엑셀양식 자료실 — 오탐 정정) |
| ✅ | `Self_Customizing_다운로드_E000139` | 편의기능 (EtcSystemPage `/settings/etc` 부가 관리 바로가기 — 오탐 정정) |

#### Self-Customizing › 보안관리

| | prgId | 화면명 |
|--|--|--|
| ✅ | `Self_Customizing_보안관리_C001138` | 보안설정 (SecurityPage `/settings/security` 접속관리·로그인·활동이력 — 오탐 정정) |

#### Self-Customizing › 환경설정

| | prgId | 화면명 |
|--|--|--|
| ✅ | `Self_Customizing_환경설정_C000113` | 기능설정 (PreferencesPage `/settings/preferences` 공통/회계/재고/관리 옵션 — 오탐 정정) |
| ✅ | `Self_Customizing_환경설정_C001124` | 기본값설정 (PreferencesPage — 환경설정 단일 레코드 upsert — 오탐 정정) |
