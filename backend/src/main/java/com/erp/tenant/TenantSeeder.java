package com.erp.tenant;

import com.erp.accounting.StandardAccounts;
import com.erp.accounting.ledger.account.Account;
import com.erp.accounting.ledger.account.AccountRepository;
import com.erp.common.MenuPermissionCatalog;
import com.erp.settings.companyinfo.CompanyInfo;
import com.erp.settings.companyinfo.CompanyInfoRepository;
import com.erp.auth.role.Permission;
import com.erp.auth.role.Role;
import com.erp.auth.user.User;
import com.erp.auth.role.PermissionRepository;
import com.erp.auth.role.RoleRepository;
import com.erp.auth.user.UserRepository;
import com.erp.auth.workpermission.WorkPermissionService;
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
    private final CompanyInfoRepository companyInfoRepository;
    private final PasswordEncoder passwordEncoder;
    private final WorkPermissionService workPermissionService;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void seed(String companyName, String adminUsername, String adminRawPassword, String adminName) {
        Role admin = ensureRole("ADMIN", "관리자", "모든 기능 및 사용자 관리 권한");
        Role manager = ensureRole("MANAGER", "매니저", "모듈 관리 및 승인 권한");
        Role staff = ensureRole("STAFF", "사원", "일반 업무 처리 권한");

        for (MenuPermissionCatalog.Perm p : MenuPermissionCatalog.ALL) {
            permissionRepository.findById(p.code()).orElseGet(() ->
                    permissionRepository.save(Permission.builder()
                            .code(p.code()).name(p.name()).category(p.category()).sort(p.sort())
                            .build()));
        }
        // 사용자관리 제외 전체를 MANAGER·STAFF 권한그룹에(본사와 동일 규칙). ADMIN 은 마스터라 줄이 필요 없다.
        permissionRepository.flush();
        workPermissionService.grantAllIfEmpty(manager);
        workPermissionService.grantAllIfEmpty(staff);

        if (!userRepository.existsByUsername(adminUsername)) {
            userRepository.save(User.builder()
                    .username(adminUsername)
                    .password(passwordEncoder.encode(adminRawPassword))
                    .name(adminName)
                    .enabled(true)
                    .roles(Set.of(admin))
                    .build());
        }
        ensureReferenceData(companyName);
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
    public void ensureReferenceData(String companyName) {
        int added = 0;
        for (StandardAccounts.Spec a : StandardAccounts.ALL) {
            if (accountRepository.existsByCode(a.code())) continue;
            accountRepository.save(Account.builder()
                    .code(a.code()).name(a.name()).division(a.division())
                    .detailCategory(a.detail()).active(a.active()).groupAccount(a.group())
                    .debitCredit(a.debitCredit()).evalKind(a.evalKind())
                    .relatedWork(StandardAccounts.relatedWorkOf(a.code()))
                    .partnerAggregate(StandardAccounts.partnerAggregateOf(a.code(), a.name()))
                    .build());
            added++;
        }
        linkStandardAccountTree();
        ensureCompanyInfo(companyName);
        if (added > 0) {
            log.info("테넌트 기준자료 보충 → 계정과목 {}개", added);
        }
    }

    /** 원본 나무대로 상위계정을 잇는다 — 상위가 비어 있는 계정만(사용자가 고친 나무는 두고). */
    private void linkStandardAccountTree() {
        for (StandardAccounts.Spec a : StandardAccounts.ALL) {
            if (a.parentCode() == null) continue;
            Account child = accountRepository.findByCode(a.code()).orElse(null);
            if (child == null || child.getParent() != null) continue;
            accountRepository.findByCode(a.parentCode()).ifPresent(p -> {
                child.setParent(p);
                accountRepository.save(child);
            });
        }
    }

    /**
     * 회사정보에 <b>상호만이라도</b> 넣어 둔다.
     *
     * <p>거래명세서·견적서·발주서는 공급자란을 회사정보에서 읽는다. 비어 있으면
     * 인쇄물에 "(회사정보 미등록)" 이 찍힌다 — 거래처에 건네는 문서라 그대로 나가면 곤란하다.
     * 회사를 만들 때 상호를 이미 받았으므로 그것만이라도 채운다.
     * 사업자등록번호·대표자 같은 나머지는 업체가 회사정보 화면에서 채운다.
     */
    private void ensureCompanyInfo(String companyName) {
        if (companyName == null || companyName.isBlank()) return;
        if (companyInfoRepository.findFirstByOrderByIdAsc().isPresent()) return;
        companyInfoRepository.save(CompanyInfo.builder().name(companyName.trim()).build());
    }

    private Role ensureRole(String name, String displayName, String description) {
        return roleRepository.findByName(name)
                .orElseGet(() -> roleRepository.save(Role.builder()
                        .name(name).displayName(displayName).description(description).build()));
    }
}
