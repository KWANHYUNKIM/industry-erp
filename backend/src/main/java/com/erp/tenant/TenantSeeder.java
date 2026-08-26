package com.erp.tenant;

import com.erp.accounting.StandardAccounts;
import com.erp.accounting.domain.Account;
import com.erp.accounting.repository.AccountRepository;
import com.erp.common.MenuPermissionCatalog;
import com.erp.auth.domain.Permission;
import com.erp.auth.domain.Role;
import com.erp.auth.domain.User;
import com.erp.auth.repository.PermissionRepository;
import com.erp.auth.repository.RoleRepository;
import com.erp.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 새로 만든 회사 스키마에 기본 역할·권한·최초 관리자를 심는다.
 * <p>
 * {@code REQUIRES_NEW} 로 새 트랜잭션(=새 세션/커넥션)을 열어, 호출 직전에 설정된
 * {@code TenantContext} 대로 그 회사 스키마에 기록한다. 리포지토리는 스키마를 몰라도 된다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TenantSeeder {

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final UserRepository userRepository;
    private final AccountRepository accountRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void seed(String adminUsername, String adminRawPassword, String adminName) {
        Role admin = ensureRole("ADMIN", "관리자", "모든 기능 및 사용자 관리 권한");
        Role manager = ensureRole("MANAGER", "매니저", "모듈 관리 및 승인 권한");
        Role staff = ensureRole("STAFF", "사원", "일반 업무 처리 권한");

        for (MenuPermissionCatalog.Perm p : MenuPermissionCatalog.ALL) {
            permissionRepository.findById(p.code()).orElseGet(() ->
                    permissionRepository.save(Permission.builder()
                            .code(p.code()).name(p.name()).category(p.category()).sort(p.sort())
                            .build()));
        }
        // USER_MANAGE 제외 전체를 MANAGER·STAFF 에 부여(본사와 동일 규칙). ADMIN 은 바이패스.
        List<Permission> defaults = permissionRepository.findAll().stream()
                .filter(p -> !"USER_MANAGE".equals(p.getCode()))
                .toList();
        grantAll(manager, defaults);
        grantAll(staff, defaults);

        if (!userRepository.existsByUsername(adminUsername)) {
            userRepository.save(User.builder()
                    .username(adminUsername)
                    .password(passwordEncoder.encode(adminRawPassword))
                    .name(adminName)
                    .enabled(true)
                    .roles(Set.of(admin))
                    .build());
        }
        ensureReferenceData();
        log.info("테넌트 시드 완료 → 관리자 {}", adminUsername);
    }

    /**
     * 회사가 쓰려면 <b>반드시 있어야 하는</b> 기준자료를 채운다. 이미 있으면 건드리지 않는다.
     *
     * <p>계정과목이 그렇다. 회계반영은 108·255·251·135 를, 급여이체는 801·254 를
     * <b>코드값으로 찾아</b> 쓰기 때문에, 없으면 "계정과목이 없습니다" 로 기능이 막힌다.
     * 예전에는 목록이 본사 시더 안에만 있어서 새 회사는 계정과목 0개로 시작했다.
     *
     * <p>새 회사(TenantSeeder)와 이미 만들어진 회사(TenantMigrationRunner) 양쪽에서 부른다.
     * 그래서 여러 번 불려도 안전해야 한다.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void ensureReferenceData() {
        int added = 0;
        for (StandardAccounts.Spec a : StandardAccounts.ALL) {
            if (accountRepository.existsByCode(a.code())) continue;
            accountRepository.save(Account.builder()
                    .code(a.code()).name(a.name()).division(a.division())
                    .detailCategory(a.detail()).active(true)
                    .build());
            added++;
        }
        if (added > 0) {
            log.info("테넌트 기준자료 보충 → 계정과목 {}개", added);
        }
    }

    private Role ensureRole(String name, String displayName, String description) {
        return roleRepository.findByName(name)
                .orElseGet(() -> roleRepository.save(Role.builder()
                        .name(name).displayName(displayName).description(description).build()));
    }

    private void grantAll(Role role, List<Permission> perms) {
        role.setPermissions(new HashSet<>(perms));
        roleRepository.save(role);
    }
}
