package com.erp.config;

import com.erp.auth.role.Role;
import com.erp.auth.role.RoleRepository;
import com.erp.auth.user.User;
import com.erp.auth.user.UserRepository;
import com.erp.inventory.item.Item;
import com.erp.inventory.item.ItemCategory;
import com.erp.inventory.item.ItemRepository;
import com.erp.trade.partner.BusinessPartner;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.trade.partner.PartnerType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Set;

/**
 * <b>로컬 개발 전용</b>(dev 프로필 — {@code ./mvnw spring-boot:run}) 데모 계정 · 거래처 · 품목.
 *
 * <p>계정 비밀번호가 공개 저장소에 적혀 있으므로 운영(dev 아님)에서는 심지 않는다(docs/보안-점검.md H5).
 * 비밀번호는 로그에 찍지 않는다. 이미 있으면 건너뛴다(idempotent). 따로 도는 러너가 아니라 {@link DataInitializer} 가 역할을 만든 뒤
 * 같은 트랜잭션에서 부른다 — 뒤에 도는 시더(@Order 2~)가 데모 품목을 찾으므로 예전 차례를 그대로 지킨다.
 */
@Slf4j
@Component
@Profile("dev")
@RequiredArgsConstructor
public class DevDataSeeder {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final ItemRepository itemRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final PasswordEncoder passwordEncoder;

    /** DataInitializer 의 트랜잭션 안에서 부른다. */
    void seed() {
        ensureUser("admin", "admin1234", "시스템 관리자", "admin@erp.local", "경영지원", role("ADMIN"));
        ensureUser("manager", "manager1234", "김부장", "manager@erp.local", "생산관리부", role("MANAGER"));
        ensureUser("staff", "staff1234", "이사원", "staff@erp.local", "생산관리부", role("STAFF"));
        seedPartners();
        seedItems();
    }

    private Role role(String name) {
        return roleRepository.findByName(name).orElseThrow();
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
            log.info("데모 계정 생성 → 아이디: {}", username);   // 비밀번호는 로그에 남기지 않는다
        }
    }
}
