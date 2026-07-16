package com.erp.config;

import com.erp.common.MenuPermissionCatalog;
import com.erp.accounting.domain.Account;
import com.erp.accounting.domain.AccountDivision;
import com.erp.trade.domain.BusinessPartner;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.ItemCategory;
import com.erp.trade.domain.PartnerType;
import com.erp.auth.domain.Permission;
import com.erp.auth.domain.Role;
import com.erp.auth.domain.User;
import com.erp.inventory.domain.Warehouse;
import com.erp.accounting.repository.AccountRepository;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.inventory.repository.ItemRepository;
import com.erp.auth.repository.PermissionRepository;
import com.erp.auth.repository.RoleRepository;
import com.erp.auth.repository.UserRepository;
import com.erp.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 최초 기동 시 기본 역할과 관리자 계정을 생성한다.
 * 이미 존재하면 건너뛴다 (idempotent).
 */
@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final WarehouseRepository warehouseRepository;
    private final ItemRepository itemRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final AccountRepository accountRepository;
    private final PermissionRepository permissionRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(String... args) {
        Role admin = ensureRole("ADMIN", "관리자", "모든 기능 및 사용자 관리 권한");
        Role manager = ensureRole("MANAGER", "매니저", "모듈 관리 및 승인 권한");
        Role staff = ensureRole("STAFF", "사원", "일반 업무 처리 권한");

        seedPermissions(manager, staff);

        if (!userRepository.existsByUsername("admin")) {
            User adminUser = User.builder()
                    .username("admin")
                    .password(passwordEncoder.encode("admin1234"))
                    .name("시스템 관리자")
                    .email("admin@erp.local")
                    .department("경영지원")
                    .enabled(true)
                    .roles(Set.of(admin))
                    .build();
            userRepository.save(adminUser);
            log.info("기본 관리자 계정 생성 완료 → 아이디: admin / 비밀번호: admin1234");
        }

        ensureUser("manager", "manager1234", "김부장", "manager@erp.local", "생산관리부", manager);
        ensureUser("staff", "staff1234", "이사원", "staff@erp.local", "생산관리부", staff);

        if (!warehouseRepository.existsByCode("WH-01")) {
            warehouseRepository.save(Warehouse.builder()
                    .code("WH-01")
                    .name("본사창고")
                    .location("본사")
                    .active(true)
                    .build());
            log.info("기본 창고(WH-01 본사창고) 생성 완료");
        }

        seedPartners();
        seedItems();
        seedAccounts();
    }

    /** 표준 계정과목 (계정과목등록/비용관리 화면용). */
    private void seedAccounts() {
        ensureAccount("101", "현금", AccountDivision.ASSET, "유동자산");
        ensureAccount("102", "당좌예금", AccountDivision.ASSET, "유동자산");
        ensureAccount("103", "보통예금", AccountDivision.ASSET, "유동자산");
        ensureAccount("108", "외상매출금", AccountDivision.ASSET, "매출채권");
        ensureAccount("104", "받을수표", AccountDivision.ASSET, "유동자산");
        ensureAccount("134", "가지급금", AccountDivision.ASSET, "유동자산");
        ensureAccount("146", "상품", AccountDivision.ASSET, "재고자산");
        ensureAccount("203", "감가상각누계액", AccountDivision.ASSET, "유형자산");   // 자산 차감계정
        ensureAccount("206", "기계장치", AccountDivision.ASSET, "유형자산");
        ensureAccount("208", "차량운반구", AccountDivision.ASSET, "유형자산");
        ensureAccount("212", "비품", AccountDivision.ASSET, "유형자산");
        ensureAccount("251", "외상매입금", AccountDivision.LIABILITY, "매입채무");
        ensureAccount("331", "자본금", AccountDivision.EQUITY, "자본금");
        ensureAccount("401", "상품매출", AccountDivision.REVENUE, "매출액");
        ensureAccount("451", "상품매출원가", AccountDivision.EXPENSE, "매출원가");
        ensureAccount("811", "복리후생비", AccountDivision.EXPENSE, "판매관리비");
        ensureAccount("812", "여비교통비", AccountDivision.EXPENSE, "판매관리비");
        ensureAccount("814", "통신비", AccountDivision.EXPENSE, "판매관리비");
        ensureAccount("815", "수도광열비", AccountDivision.EXPENSE, "판매관리비");
        ensureAccount("830", "소모품비", AccountDivision.EXPENSE, "판매관리비");
        ensureAccount("831", "지급수수료", AccountDivision.EXPENSE, "판매관리비");
        ensureAccount("833", "광고선전비", AccountDivision.EXPENSE, "판매관리비");
        ensureAccount("818", "감가상각비", AccountDivision.EXPENSE, "판매관리비");
        ensureAccount("835", "대손상각비", AccountDivision.EXPENSE, "판매관리비");
        ensureAccount("914", "유형자산처분이익", AccountDivision.REVENUE, "영업외수익");
        ensureAccount("970", "유형자산처분손실", AccountDivision.EXPENSE, "영업외비용");
    }

    private void ensureAccount(String code, String name, AccountDivision division, String detail) {
        if (!accountRepository.existsByCode(code)) {
            accountRepository.save(Account.builder()
                    .code(code).name(name).division(division).detailCategory(detail).active(true)
                    .build());
        }
    }

    /** 데모 거래처 (수주/정산 화면의 거래처 선택용). */
    private void seedPartners() {
        ensurePartner("CUST-001", "(주)대신전자", PartnerType.CUSTOMER, "김상무", "02-555-0101");
        ensurePartner("CUST-002", "명현농장", PartnerType.CUSTOMER, "박대표", "041-733-0202");
        ensurePartner("CUST-003", "밀양종돈", PartnerType.CUSTOMER, "최과장", "055-352-0303");
        ensurePartner("SUPP-001", "오피스디포", PartnerType.SUPPLIER, "이팀장", "02-777-0404");
        ensurePartner("BOTH-001", "한울ICT", PartnerType.BOTH, "정이사", "031-123-0505");
    }

    private void ensurePartner(String code, String name, PartnerType type, String manager, String phone) {
        if (!partnerRepository.existsByCode(code)) {
            partnerRepository.save(BusinessPartner.builder()
                    .code(code).name(name).type(type).manager(manager).phone(phone).active(true)
                    .build());
            log.info("데모 거래처 생성 → {} {}", code, name);
        }
    }

    /** 데모 품목 (수주/품질 화면의 품목 선택용). */
    private void seedItems() {
        ensureItem("ITM-0001", "MQTT 모뎀 v2.0", "IoT 통신모듈", "EA", ItemCategory.FINISHED, 145000, 50);
        ensureItem("ITM-0002", "AQD 센서모듈", "온습도/암모니아", "EA", ItemCategory.FINISHED, 59000, 100);
        ensureItem("ITM-0003", "열교환기 코어", "STS304", "EA", ItemCategory.SEMI_FINISHED, 82000, 20);
        ensureItem("ITM-0004", "모뎀 PCB 조립품", "4층기판", "EA", ItemCategory.SEMI_FINISHED, 33000, 200);
        ensureItem("ITM-0005", "스테인리스 판재 1.2T", "1000x2000", "SHT", ItemCategory.RAW_MATERIAL, 12500, 300);
        ensureItem("ITM-0006", "방청유 20L", "산업용", "CAN", ItemCategory.SUB_MATERIAL, 41000, 10);
    }

    private void ensureItem(String code, String name, String spec, String unit,
                            ItemCategory category, long unitPrice, long safetyStock) {
        if (!itemRepository.existsByCode(code)) {
            itemRepository.save(Item.builder()
                    .code(code).name(name).spec(spec).unit(unit).category(category)
                    .unitPrice(BigDecimal.valueOf(unitPrice))
                    .safetyStock(BigDecimal.valueOf(safetyStock))
                    .active(true)
                    .build());
            log.info("데모 품목 생성 → {} {}", code, name);
        }
    }

    private void ensureUser(String username, String rawPassword, String name,
                            String email, String department, Role role) {
        if (!userRepository.existsByUsername(username)) {
            userRepository.save(User.builder()
                    .username(username)
                    .password(passwordEncoder.encode(rawPassword))
                    .name(name)
                    .email(email)
                    .department(department)
                    .enabled(true)
                    .roles(Set.of(role))
                    .build());
            log.info("데모 계정 생성 완료 → 아이디: {} / 비밀번호: {}", username, rawPassword);
        }
    }

    private Role ensureRole(String name, String displayName, String description) {
        return roleRepository.findByName(name)
                .orElseGet(() -> roleRepository.save(Role.builder()
                        .name(name)
                        .displayName(displayName)
                        .description(description)
                        .build()));
    }

    /**
     * 권한 카탈로그를 MenuPermissionCatalog 기준으로 시드하고, 기본 역할에 초기 권한을 부여한다.
     * ADMIN 은 코드로 전권 바이패스하므로 부여하지 않는다. MANAGER·STAFF 는 현행 동작(모든 메뉴
     * 접근)을 유지하도록 전체 권한을 준다 — 단 관리자가 이미 손을 댄 역할은 건드리지 않는다(멱등).
     */
    private void seedPermissions(Role manager, Role staff) {
        for (MenuPermissionCatalog.Perm p : MenuPermissionCatalog.ALL) {
            permissionRepository.findById(p.code()).orElseGet(() ->
                    permissionRepository.save(Permission.builder()
                            .code(p.code()).name(p.name()).category(p.category()).sort(p.sort())
                            .build()));
        }
        // 사용자·권한 관리(USER_MANAGE)는 ADMIN 전용(바이패스)으로 남긴다. 기본 역할엔 주지 않는다.
        List<Permission> defaults = permissionRepository.findAll().stream()
                .filter(p -> !"USER_MANAGE".equals(p.getCode()))
                .toList();
        grantAllIfEmpty(manager, defaults);
        grantAllIfEmpty(staff, defaults);
    }

    private void grantAllIfEmpty(Role role, List<Permission> perms) {
        if (role.getPermissions().isEmpty()) {
            role.setPermissions(new HashSet<>(perms));
            roleRepository.save(role);
            log.info("역할 {} 에 기본 권한 {}개 부여", role.getName(), perms.size());
        }
    }
}
