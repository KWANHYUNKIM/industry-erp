package com.erp.config;

import com.erp.common.MenuPermissionCatalog;
import com.erp.accounting.StandardAccounts;
import com.erp.accounting.account.Account;
import com.erp.accounting.account.AccountDivision;
import com.erp.auth.role.Permission;
import com.erp.auth.role.Role;
import com.erp.auth.user.User;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.accounting.account.AccountRepository;
import com.erp.auth.role.PermissionRepository;
import com.erp.auth.role.RoleRepository;
import com.erp.auth.user.UserRepository;
import com.erp.auth.workpermission.WorkPermissionService;
import com.erp.inventory.warehouse.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 기동 시 회사가 쓰려면 반드시 있어야 하는 기준자료(역할 · 권한 카탈로그 · 표준 계정과목 · 기본 창고)를 채운다.
 * 이미 존재하면 건너뛴다 (idempotent). 데모 계정 · 거래처 · 품목은 dev 프로필에서만 — {@link DevDataSeeder}.
 */
@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final WarehouseRepository warehouseRepository;
    private final AccountRepository accountRepository;
    private final PermissionRepository permissionRepository;
    private final PasswordEncoder passwordEncoder;
    private final WorkPermissionService workPermissionService;
    private final ObjectProvider<DevDataSeeder> devSeeder;

    @Value("${app.bootstrap.admin-password:${ERP_ADMIN_PASSWORD:}}")
    private String bootstrapAdminPassword;

    @Override
    @Transactional
    public void run(String... args) {
        Role admin = ensureRole("ADMIN", "관리자", "모든 기능 및 사용자 관리 권한");
        Role manager = ensureRole("MANAGER", "매니저", "모듈 관리 및 승인 권한");
        Role staff = ensureRole("STAFF", "사원", "일반 업무 처리 권한");

        seedPermissions(manager, staff);

        devSeeder.ifAvailable(DevDataSeeder::seed);   // dev 프로필만 — 데모 계정 · 거래처 · 품목
        bootstrapAdmin(admin);

        if (!warehouseRepository.existsByCode("WH-01")) {
            warehouseRepository.save(Warehouse.builder()
                    .code("WH-01")
                    .name("본사창고")
                    .location("본사")
                    .active(true)
                    .build());
            log.info("기본 창고(WH-01 본사창고) 생성 완료");
        }

        seedAccounts();
    }

    /**
     * 본사 첫 관리자. 비밀번호를 코드에 두지 않는다(저장소가 공개 — docs/보안-점검.md H5):
     * {@code app.bootstrap.admin-password}(환경변수 ERP_ADMIN_PASSWORD)가 있을 때만 만든다.
     * 로컬 개발(dev 프로필)의 데모 계정은 {@link DevDataSeeder} 가 심는다.
     */
    private void bootstrapAdmin(Role admin) {
        if (userRepository.existsByUsername("admin")) return;
        if (!StringUtils.hasText(bootstrapAdminPassword)) {
            log.warn("본사 관리자(admin)가 없다 — 만들려면 환경변수 ERP_ADMIN_PASSWORD 를 주고 다시 띄운다.");
            return;
        }
        userRepository.save(User.builder()
                .username("admin")
                .password(passwordEncoder.encode(bootstrapAdminPassword))
                .name("시스템 관리자")
                .email("admin@erp.local")
                .department("경영지원")
                .enabled(true)
                .roles(Set.of(admin))
                .build());
        log.info("본사 관리자 계정(admin) 생성 완료 — 비밀번호는 ERP_ADMIN_PASSWORD");
    }

    /** 표준 계정과목 (계정과목등록/비용관리 화면용). */
    private void seedAccounts() {
        // 목록은 StandardAccounts 하나뿐이다 — 테넌트 시더도 같은 것을 쓴다.
        // 예전엔 여기 안에만 있어서 새로 만든 회사는 계정과목이 0개로 시작했다.
        for (StandardAccounts.Spec a : StandardAccounts.ALL) {
            ensureAccount(a);
        }
        for (StandardAccounts.Spec a : StandardAccounts.ALL) {   // 원본 나무대로 상위계정을 잇는다(비어 있는 것만)
            if (a.parentCode() == null) continue;
            Account child = accountRepository.findByCode(a.code()).orElse(null);
            if (child == null || child.getParent() != null) continue;
            accountRepository.findByCode(a.parentCode()).ifPresent(p -> {
                child.setParent(p);
                accountRepository.save(child);
            });
        }
    }

    private void ensureAccount(StandardAccounts.Spec a) {
        if (!accountRepository.existsByCode(a.code())) {
            accountRepository.save(Account.builder()
                    .code(a.code()).name(a.name()).division(a.division()).detailCategory(a.detail()).active(a.active())
                    .groupAccount(a.group()).debitCredit(a.debitCredit()).evalKind(a.evalKind())
                    .relatedWork(StandardAccounts.relatedWorkOf(a.code()))
                    .partnerAggregate(StandardAccounts.partnerAggregateOf(a.code(), a.name()))
                    .build());
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
     * 권한 카탈로그를 MenuPermissionCatalog 기준으로 시드하고, 기본 권한그룹(MANAGER · STAFF)에 업무권한이 하나도 없으면
     * 사용자관리 빼고 전부 권한있음을 준다(멱등 — 마스터가 손댄 그룹은 건드리지 않는다). ADMIN 은 마스터라 줄이 필요 없다.
     */
    private void seedPermissions(Role manager, Role staff) {
        for (MenuPermissionCatalog.Perm p : MenuPermissionCatalog.ALL) {
            permissionRepository.findById(p.code()).orElseGet(() ->
                    permissionRepository.save(Permission.builder()
                            .code(p.code()).name(p.name()).category(p.category()).sort(p.sort())
                            .build()));
        }
        permissionRepository.flush();
        workPermissionService.grantAllIfEmpty(manager);
        workPermissionService.grantAllIfEmpty(staff);
    }
}
