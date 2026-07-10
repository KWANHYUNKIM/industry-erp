# 아키텍처 규칙

이 문서는 **백엔드 패키지 구조와 의존 규칙**을 정의합니다. 새 코드는 이 규칙을 따르고,
기존 코드를 만질 때 규칙에서 벗어난 부분이 보이면 그 자리에서 고칩니다.

현재 코드는 계층 우선(`controller/`, `service/`, …) 평면 구조이고, **모듈 우선 구조로 이행 중**입니다.
이행 전이라도 아래 의존 규칙은 그대로 적용됩니다.

---

## 1. 모듈

기능 단위로 8개 모듈을 둡니다. 모듈은 프론트엔드 `frontend/src/pages/` 폴더와 1:1로 맞춥니다.

| 모듈 | 책임 | 대표 엔티티 |
|------|------|-------------|
| `common` | 공통 기반. 다른 모듈을 몰라야 함 | `BaseTimeEntity`, `ApiException`, `GlobalExceptionHandler` |
| `auth` | 사용자·역할·인증 | `User`, `Role` |
| `inventory` | 품목·창고·재고 (마스터 데이터) | `Item`, `Warehouse`, `Stock`, `StockTransaction`, `Lot`, `ManagementItem` |
| `trade` | 판매·구매·거래처·정산·출하 | `BusinessPartner`, `Sales`, `Purchase`, `SalesOrder`, `Settlement`, `Shipment` |
| `production` | BOM·작업지시·생산실적·생산계획 | `Bom`, `WorkOrder`, `Production`, `ProductionPlan`, `MaterialIssue` |
| `accounting` | 계정·비용·원가·손익 | `Account`, `Expense`, `ItemCost` |
| `quality` | 품질검사·A/S | `QualityInspection`, `AsRequest` |
| `groupware` | 전자결재·업무일지·근태·게시판·CRM·프로젝트 | `ApprovalDocument`, `WorkJournal`, `Attendance`, `Project` |
| `settings` | Self-Customizing (회사정보·환경설정·보안정책) | `CompanyInfo`, `Preference`, `SecurityPolicy` |

새 클래스는 **자신이 다루는 주 엔티티가 속한 모듈**에 둡니다.
어느 모듈에도 안 맞으면 모듈을 새로 만들지 말고 먼저 논의합니다.

---

## 2. 목표 패키지 구조

모듈 안에 MVC 계층을 둡니다. 계층 안에 모듈을 두지 않습니다.

```
com/erp/
├─ BackendApplication.java
├─ common/            # 전역 예외, BaseTimeEntity
├─ security/          # JWT 필터, SecurityConfig  (인프라)
├─ auth/
│  ├─ controller/     AuthController, UserController, RoleController
│  ├─ service/
│  ├─ repository/
│  ├─ domain/         User, Role
│  └─ dto/
├─ inventory/
│  ├─ controller/     ItemController, WarehouseController, StockController
│  ├─ service/
│  ├─ repository/
│  ├─ domain/         Item, Warehouse, Stock, StockTransaction
│  │  └─ enums/       StockTransactionType, LotStatus
│  └─ dto/            ItemDtos, StockDtos
├─ trade/  production/  accounting/  quality/  groupware/  settings/
```

`@SpringBootApplication`이 `com.erp`에 있고 `@EntityScan`/`@EnableJpaRepositories`를
하드코딩한 곳이 없으므로, 하위 패키지는 자동으로 스캔됩니다. **스캔 설정을 추가하지 마세요.**
추가하는 순간 모듈을 하나 늘릴 때마다 그 목록을 손봐야 합니다.

---

## 3. 계층 의존 방향

```
controller  →  service  →  repository  →  domain
                  ↓
                 dto
```

- 화살표 **역방향 의존 금지**. `domain`은 `service`를 몰라야 합니다.
- **`controller`는 `repository`를 주입하지 않습니다.** 조회만 하는 경우라도 `service`를 거칩니다.
- **`controller`는 엔티티를 반환하지 않습니다.** 항상 `dto`를 반환합니다.
  엔티티를 그대로 직렬화하면 지연로딩 프록시가 터지거나 내부 필드가 API로 새어 나갑니다.
- `service`가 엔티티를 반환하는 것은 같은 모듈 `service` 내부 호출에 한해 허용합니다.

---

## 4. 모듈 간 의존 규칙

### 4.1 의존 방향은 단방향이어야 합니다

현재 코드에서 실제로 측정한 모듈 의존 간선입니다. **순환이 없습니다(DAG).**
이 성질을 깨는 의존을 새로 만들지 마세요.

| 의존하는 모듈 | 의존받는 모듈 |
|---------------|----------------|
| `trade` | `inventory` |
| `production` | `inventory` |
| `quality` | `inventory`, `trade` |
| `accounting` | `inventory`, `trade` |
| `groupware` | `auth`, `trade` |

- `inventory`와 `auth`는 **아무 모듈에도 의존하지 않는 기반층입니다.**
  여기서 다른 모듈을 참조하는 순간 순환이 생깁니다.
- `common`은 모두가 의존하고 아무것도 의존하지 않습니다.
- `settings`는 아직 다른 모듈에 의존하지 않습니다. 그대로 유지하세요.
- 새 의존을 추가하기 전에 위 표에서 반대 방향 간선이 이미 있는지 확인하세요.
  예를 들어 `inventory`가 `trade`를 참조하면 `trade → inventory`와 맞물려 순환이 됩니다.

### 4.2 다른 모듈의 데이터가 필요할 때

**원칙: 다른 모듈은 그 모듈의 `service`를 거쳐 호출합니다. 다른 모듈의 `repository`를 직접 주입하지 않습니다.**

```java
// ❌ production 서비스가 inventory 리포지토리를 직접 주입
public class WorkOrderService {
    private final ItemRepository itemRepository;      // 다른 모듈
    private final WarehouseRepository warehouseRepository;
}

// ✅ inventory 가 공개한 service 를 거친다
public class WorkOrderService {
    private final ItemService itemService;            // inventory 의 공개 API
    private final WarehouseService warehouseService;
}
```

이유는 두 가지입니다. 리포지토리를 직접 주입하면 그 모듈의 불변식(재고 음수 방지, 상태 전이 규칙)을
우회하게 됩니다. 그리고 나중에 모듈을 분리하거나 테이블을 바꿀 때 호출부가 전부 깨집니다.

### 4.3 엔티티 직접 참조는 허용합니다

모듈 경계를 넘는 `@ManyToOne` 매핑은 그대로 둡니다. JPA 조인과 트랜잭션이 정상 동작하고,
DB 스키마도 바뀌지 않습니다.

```java
// trade/domain/Sales.java
@ManyToOne(fetch = FetchType.LAZY, optional = false)
@JoinColumn(name = "warehouse_id")
private Warehouse warehouse;              // inventory.domain.Warehouse — 허용
```

단, **읽기만 허용합니다.** 다른 모듈 엔티티의 상태를 바꾸는 것은 그 모듈의 `service`를 통해서만 합니다.

```java
// ❌ trade 가 inventory 의 재고를 직접 깎음
stock.setQuantity(stock.getQuantity().subtract(qty));

// ✅ inventory 가 규칙(음수 검증 등)을 소유
stockService.decrease(itemId, warehouseId, qty);
```

### 4.4 현재 남아 있는 부채

`service`가 다른 모듈의 `repository`를 직접 주입하는 곳이 **28군데** 있습니다
(전체 리포지토리 주입 102건 중 27%). 대부분 `Item`, `Warehouse`, `User`, `BusinessPartner`를
조회해서 연관관계에 붙이려는 목적입니다.

한 번에 고치지 말고, **해당 서비스를 수정할 일이 생겼을 때 그 서비스만** 규칙에 맞게 바꿉니다.
어떤 서비스가 어떤 리포지토리를 주입하는지는 아래로 확인하고, 1번 모듈 표와 대조해
교차 여부를 판단하세요.

```bash
grep -rn 'import com\.erp\.repository\.' backend/src/main/java/com/erp/service/
```

대표적인 교차 지점: `SalesService → ItemRepository/WarehouseRepository`,
`WorkOrderService → ItemRepository/WarehouseRepository`,
`ProductionPlanService → Item/Stock/WarehouseRepository`,
`ApprovalService·AttendanceService·WorkJournalService → UserRepository`.

---

## 5. 도메인 규칙

### 5.1 enum

`domain/`에 엔티티와 enum을 섞지 않습니다. enum은 해당 모듈의 `domain/enums/`에 둡니다.
(현재 `domain/` 75개 중 20개가 enum입니다.)

### 5.2 지연 로딩

- **모든 연관관계는 `FetchType.LAZY`입니다.** `EAGER`를 새로 추가하지 마세요.
- 유일한 예외는 `User.roles`(`@ManyToMany(fetch = EAGER)`)입니다. 인증 필터가 매 요청마다
  권한을 즉시 필요로 하고 역할 수가 적어 유지합니다. 이 예외를 근거로 다른 곳에 `EAGER`를 쓰지 마세요.
- `spring.jpa.open-in-view: false`입니다. **컨트롤러/뷰에서 지연로딩이 초기화되지 않습니다.**
  필요한 연관관계는 `service`의 트랜잭션 안에서 fetch join으로 가져오거나 DTO로 변환해서 내보냅니다.

### 5.3 N+1

목록 조회는 fetch join 전용 쿼리를 둡니다. 이미 쓰는 패턴을 따르세요.

```java
@Query("select w from WorkOrder w join fetch w.product join fetch w.warehouse " +
       "order by w.orderDate desc, w.id desc")
List<WorkOrder> findAllWithRefs();
```

---

## 6. 트랜잭션

- `@Transactional`은 **`service`에만** 붙입니다. `controller`나 `repository`에 붙이지 않습니다.
- 조회 메서드는 `@Transactional(readOnly = true)`.
- 모듈 간 호출은 같은 트랜잭션에 참여합니다. `trade`에서 `stockService.decrease(...)`가 실패하면
  판매 전표도 함께 롤백됩니다. 이 동작에 의존해도 됩니다.

---

## 7. DTO

- 요청/응답 DTO는 자기 모듈의 `dto/` 아래 둡니다.
- 여러 DTO를 한 파일에 중첩 record로 묶는 기존 패턴(`ItemDtos`, `ProductionDtos`)을 유지합니다.
- 다른 모듈의 DTO를 재사용하지 마세요. 필드가 같아도 각자 정의합니다. 그래야 한쪽 API 변경이
  다른 모듈로 번지지 않습니다.

---

## 8. 빌드

```bash
cd backend
rm -rf target && ./mvnw -o compile     # 전체 재컴파일
./mvnw spring-boot:run                 # 실행 (포트 8081)
```

`./mvnw clean`은 오프라인에서 실패합니다(`maven-clean-plugin`이 로컬 저장소에 없음).
`rm -rf target`으로 대체하세요.

**증분 빌드가 유령 오류를 냅니다.** `target/`에 옛 클래스가 남아 있으면
존재하는 클래스를 `cannot find symbol`이라고 보고합니다. 설명 안 되는 컴파일 오류를 만나면
먼저 `rm -rf target`을 하세요.

---

## 9. 패키지 이동을 실제로 실행할 때

아직 이동하지 않았습니다. 실행 시점에 확인한 전제조건입니다.

- **클래스명 297개가 전부 유니크합니다.** 따라서 `import` 자동 삽입이 안전합니다. 이동 전에 다시 확인하세요.
  ```bash
  find backend/src/main/java -name '*.java' -exec basename {} .java \; | sort | uniq -d
  ```
- `@EntityScan` / `@EnableJpaRepositories` / `@ComponentScan` 하드코딩이 없습니다. 수정할 필요 없습니다.
- **DB 마이그레이션은 필요 없습니다.** 테이블·컬럼명은 `@Table`/`@JoinColumn`에 고정돼 있고,
  패키지 이동은 `import` 문만 바꿉니다.
- 가장 위험한 지점은 **지금 같은 패키지라서 `import` 없이 참조되던 클래스들**입니다.
  모듈로 갈라지는 순간 전부 컴파일 오류가 됩니다. 이동 후 `rm -rf target && ./mvnw -o compile`로 검증하고,
  컴파일이 통과해도 앱을 실제로 기동해서 Bean 스캔과 JPA 매핑을 확인하세요.
- 워킹 트리가 깨끗할 때만 시작하세요. 대규모 파일 이동은 진행 중인 작업과 섞이면 되돌리기 어렵습니다.
