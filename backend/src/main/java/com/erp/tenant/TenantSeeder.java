package com.erp.tenant;

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
        log.info("테넌트 시드 완료 → 관리자 {}", adminUsername);
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
