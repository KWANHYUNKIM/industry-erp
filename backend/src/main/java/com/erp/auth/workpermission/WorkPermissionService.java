package com.erp.auth.workpermission;

import com.erp.auth.role.Role;
import com.erp.auth.role.RoleRepository;
import com.erp.auth.user.BasePermission;
import com.erp.auth.user.User;
import com.erp.auth.user.UserRepository;
import com.erp.auth.workpermission.EffectivePermissions.Access;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.GroupWorksResponse;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.MasterResponse;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.SaveWorkRow;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.UserWorksResponse;
import com.erp.auth.workpermission.dto.WorkPermissionDtos.WorkRow;
import com.erp.common.ApiException;
import com.erp.common.MenuPermissionCatalog;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 업무권한 — 풀기(resolve) · 개별권한 · 권한그룹 업무권한 · 권한복사 · 관리자설정.
 *
 * <p>풀기 순서(원본 도움말 '사용자 ID별 업무 권한 설정 방법'):
 * 마스터면 전권 → 사용자 개별 줄이 있으면 그것 → 기본권한(ALL 권한있음 · NONE 권한없음 · GROUP 권한그룹의 줄, 없으면 권한없음).
 * 마스터 전용 업무(사용자관리)는 마스터가 아니면 늘 권한없음.
 */
@Service
@RequiredArgsConstructor
public class WorkPermissionService {

    private final WorkPermissionRepository repository;
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;

    // ------------------------------------------------------------ 풀기

    /** 인증 때 부른다(트랜잭션 안 — CustomUserDetailsService). */
    @Transactional(readOnly = true)
    public EffectivePermissions resolve(User user) {
        if (user.isMaster()) return EffectivePermissions.master();
        return new EffectivePermissions(false, resolveWorks(user, rowsFor(user)));
    }

    private List<WorkPermission> rowsFor(User user) {
        List<Long> groupIds = groupIdsOf(user);
        return repository.findForResolve(user.getId(), groupIds.isEmpty() ? List.of(-1L) : groupIds);
    }

    private Map<String, Access> resolveWorks(User user, List<WorkPermission> rows) {
        Map<String, WorkPermission> mine = new HashMap<>();
        Map<String, List<WorkPermission>> groups = new HashMap<>();
        for (WorkPermission w : rows) {
            if (w.getUser() != null && w.getUser().getId().equals(user.getId())) mine.put(w.getWorkCode(), w);
            else if (w.getRole() != null) groups.computeIfAbsent(w.getWorkCode(), k -> new ArrayList<>()).add(w);
        }
        Map<String, Access> out = new LinkedHashMap<>();
        for (MenuPermissionCatalog.Perm p : MenuPermissionCatalog.ALL) {
            String code = p.code();
            if (MenuPermissionCatalog.MASTER_ONLY.contains(code)) {
                out.put(code, Access.NONE);
                continue;
            }
            WorkPermission own = mine.get(code);
            out.put(code, own != null ? Access.of(own) : baseAccess(user.getBasePermission(), groups.get(code)));
        }
        return out;
    }

    private static Access baseAccess(BasePermission base, List<WorkPermission> groupRows) {
        return switch (base) {
            case ALL -> Access.ALL;
            case NONE -> Access.NONE;
            case GROUP -> mergeGroups(groupRows);
        };
    }

    /** 권한그룹이 둘 이상이면(옛 역할 여러 개) 가장 넓은 것 — 지금까지 역할 권한을 합집합으로 쓴 것과 같다. */
    private static Access mergeGroups(List<WorkPermission> rows) {
        if (rows == null || rows.isEmpty()) return Access.NONE;
        Access best = Access.NONE;
        for (WorkPermission w : rows) {
            Access a = Access.of(w);
            if (a.mode() == WorkPermissionMode.ALLOW) return a;
            if (best.mode() == WorkPermissionMode.DENY) best = a;
        }
        return best;
    }

    private static List<Long> groupIdsOf(User user) {
        return user.getRoles().stream()
                .filter(r -> !User.MASTER_ROLE.equals(r.getName()))
                .map(Role::getId).sorted().toList();
    }

    // ------------------------------------------------------------ 사용자 개별권한

    @Transactional(readOnly = true)
    public UserWorksResponse userWorks(Long userId) {
        User user = user(userId);
        List<WorkPermission> rows = rowsFor(user);
        Map<String, Access> resolved = user.isMaster() ? EffectivePermissions.master().works() : resolveWorks(user, rows);
        Set<String> individual = rows.stream()
                .filter(w -> w.getUser() != null && w.getUser().getId().equals(userId))
                .map(WorkPermission::getWorkCode).collect(Collectors.toSet());
        Role group = primaryGroup(user);
        return new UserWorksResponse(user.getId(), user.getUsername(), user.getName(), user.isMaster(),
                user.getBasePermission(), group == null ? null : group.getId(),
                group == null ? null : group.getDisplayName(), toRows(resolved, individual));
    }

    /** 개별로 정한 업무만 받아 통째로 바꾼다(안 보낸 업무는 개별 줄을 지워 기본권한을 따르게). */
    @Transactional
    public UserWorksResponse saveUserWorks(Long userId, List<SaveWorkRow> rows) {
        User user = user(userId);
        Map<String, WorkPermission> existing = repository.findByUser_Id(userId).stream()
                .collect(Collectors.toMap(WorkPermission::getWorkCode, Function.identity()));
        Set<String> keep = new HashSet<>();
        for (SaveWorkRow r : rows) {
            requireWork(r.workCode());
            if (MenuPermissionCatalog.MASTER_ONLY.contains(r.workCode())) {
                throw ApiException.badRequest("(" + MenuPermissionCatalog.nameOf(r.workCode())
                        + ") 는 마스터만 쓰는 업무라 권한을 줄 수 없습니다.");
            }
            WorkPermission w = existing.get(r.workCode());
            if (w == null) w = WorkPermission.builder().user(user).workCode(r.workCode()).mode(r.mode()).build();
            apply(w, r);
            repository.save(w);
            keep.add(r.workCode());
        }
        existing.values().stream().filter(w -> !keep.contains(w.getWorkCode())).forEach(repository::delete);
        repository.flush();
        return userWorks(userId);
    }

    /** 업무 하나만 개별로 정한다(권한승인 — 요청한 업무만 바꾸고 나머지 개별 줄은 둔다). */
    @Transactional
    public UserWorksResponse saveUserWork(Long userId, SaveWorkRow row) {
        User user = user(userId);
        requireWork(row.workCode());
        if (MenuPermissionCatalog.MASTER_ONLY.contains(row.workCode())) {
            throw ApiException.badRequest("마스터만 쓰는 업무라 권한을 줄 수 없습니다.");
        }
        WorkPermission w = repository.findByUser_Id(userId).stream()
                .filter(x -> x.getWorkCode().equals(row.workCode())).findFirst()
                .orElseGet(() -> WorkPermission.builder().user(user).workCode(row.workCode()).mode(row.mode()).build());
        apply(w, row);
        repository.saveAndFlush(w);
        return userWorks(userId);
    }

    /** 기본권한 · 권한그룹. GROUP 이면 사용자의 ADMIN 아닌 역할을 그 그룹 하나로 바꾼다. */
    @Transactional
    public UserWorksResponse saveBase(Long userId, BasePermission base, Long groupId) {
        User user = user(userId);
        user.setBasePermission(base);
        if (base == BasePermission.GROUP) {
            if (groupId == null) throw ApiException.badRequest("권한그룹을 고르세요.");
            Role group = group(groupId);
            if (User.MASTER_ROLE.equals(group.getName())) throw ApiException.badRequest("마스터는 관리자설정에서 정합니다.");
            Set<Role> roles = user.getRoles().stream()
                    .filter(r -> User.MASTER_ROLE.equals(r.getName())).collect(Collectors.toCollection(HashSet::new));
            roles.add(group);
            user.setRoles(roles);
        }
        userRepository.flush();
        return userWorks(userId);
    }

    /** 권한복사 — 기본권한 · 권한그룹 · 개별 줄을 그대로. 마스터 여부는 옮기지 않는다(관리자설정). */
    @Transactional
    public void copy(Long sourceUserId, List<Long> targetUserIds) {
        User src = user(sourceUserId);
        List<WorkPermission> srcRows = repository.findByUser_Id(sourceUserId);
        for (Long targetId : new HashSet<>(targetUserIds)) {
            if (targetId.equals(sourceUserId)) continue;
            User t = user(targetId);
            t.setBasePermission(src.getBasePermission());
            Set<Role> roles = t.getRoles().stream()
                    .filter(r -> User.MASTER_ROLE.equals(r.getName())).collect(Collectors.toCollection(HashSet::new));
            src.getRoles().stream().filter(r -> !User.MASTER_ROLE.equals(r.getName())).forEach(roles::add);
            t.setRoles(roles);
            repository.deleteAll(repository.findByUser_Id(targetId));
            repository.flush();
            for (WorkPermission s : srcRows) {
                repository.save(WorkPermission.builder().user(t).workCode(s.getWorkCode()).mode(s.getMode())
                        .canCreate(s.isCanCreate()).canUpdate(s.isCanUpdate()).canDelete(s.isCanDelete())
                        .canExport(s.isCanExport()).menuRules(s.getMenuRules()).build());
            }
        }
    }

    // ------------------------------------------------------------ 권한그룹 업무권한

    @Transactional(readOnly = true)
    public GroupWorksResponse groupWorks(Long groupId) {
        Role role = group(groupId);
        Map<String, WorkPermission> rows = repository.findByRole_Id(groupId).stream()
                .collect(Collectors.toMap(WorkPermission::getWorkCode, Function.identity()));
        Map<String, Access> resolved = new LinkedHashMap<>();
        for (MenuPermissionCatalog.Perm p : MenuPermissionCatalog.ALL) {
            WorkPermission w = rows.get(p.code());
            resolved.put(p.code(), w == null || MenuPermissionCatalog.MASTER_ONLY.contains(p.code())
                    ? Access.NONE : Access.of(w));
        }
        return new GroupWorksResponse(role.getId(), role.getName(), role.getDisplayName(), toRows(resolved, rows.keySet()));
    }

    /** 그룹의 업무권한을 통째로 바꾼다. 보낸 줄 그대로 적고, 안 보낸 업무는 지운다(= 권한없음). */
    @Transactional
    public GroupWorksResponse saveGroupWorks(Long groupId, List<SaveWorkRow> rows) {
        Role role = group(groupId);
        Map<String, WorkPermission> existing = repository.findByRole_Id(groupId).stream()
                .collect(Collectors.toMap(WorkPermission::getWorkCode, Function.identity()));
        Set<String> keep = new HashSet<>();
        for (SaveWorkRow r : rows) {
            requireWork(r.workCode());
            if (MenuPermissionCatalog.MASTER_ONLY.contains(r.workCode())) continue;
            WorkPermission w = existing.get(r.workCode());
            if (w == null) w = WorkPermission.builder().role(role).workCode(r.workCode()).mode(r.mode()).build();
            apply(w, r);
            repository.save(w);
            keep.add(r.workCode());
        }
        existing.values().stream().filter(w -> !keep.contains(w.getWorkCode())).forEach(repository::delete);
        repository.flush();
        return groupWorks(groupId);
    }

    /** 그룹의 업무 하나만 바꾼다(권한승인 › 권한그룹). */
    @Transactional
    public GroupWorksResponse saveGroupWork(Long groupId, SaveWorkRow row) {
        Role role = group(groupId);
        requireWork(row.workCode());
        if (MenuPermissionCatalog.MASTER_ONLY.contains(row.workCode())) {
            throw ApiException.badRequest("마스터만 쓰는 업무라 권한을 줄 수 없습니다.");
        }
        WorkPermission w = repository.findByRole_Id(groupId).stream()
                .filter(x -> x.getWorkCode().equals(row.workCode())).findFirst()
                .orElseGet(() -> WorkPermission.builder().role(role).workCode(row.workCode()).mode(row.mode()).build());
        apply(w, row);
        repository.saveAndFlush(w);
        return groupWorks(groupId);
    }

    /** 옛 역할 API(permissionCodes) — 받은 코드는 권한있음(이미 있는 줄은 그대로), 빠진 코드는 줄을 지운다(= 권한없음). */
    @Transactional
    public void setGroupAllowedCodes(Role role, Collection<String> codes) {
        Set<String> want = codes == null ? Set.of() : new HashSet<>(codes);
        Map<String, WorkPermission> existing = repository.findByRole_Id(role.getId()).stream()
                .collect(Collectors.toMap(WorkPermission::getWorkCode, Function.identity()));
        for (String code : want) {
            requireWork(code);
            if (!existing.containsKey(code)) {
                repository.save(WorkPermission.builder().role(role).workCode(code).mode(WorkPermissionMode.ALLOW).build());
            }
        }
        existing.values().stream().filter(w -> !want.contains(w.getWorkCode())).forEach(repository::delete);
        repository.flush();
    }

    /** 그룹에서 진입할 수 있는 업무 코드(옛 역할 응답의 permissionCodes). */
    @Transactional(readOnly = true)
    public List<String> groupAllowedCodes(Long groupId) {
        return repository.findByRole_Id(groupId).stream()
                .filter(w -> w.getMode() != WorkPermissionMode.DENY)
                .map(WorkPermission::getWorkCode).sorted().toList();
    }

    /** 시더 — 그룹에 줄이 하나도 없으면 사용자관리 빼고 전부 권한있음(지금까지 MANAGER · STAFF 기본값). */
    @Transactional
    public void grantAllIfEmpty(Role role) {
        if (!repository.findByRole_Id(role.getId()).isEmpty()) return;
        List<String> codes = MenuPermissionCatalog.ALL.stream().map(MenuPermissionCatalog.Perm::code)
                .filter(c -> !MenuPermissionCatalog.MASTER_ONLY.contains(c)).toList();
        setGroupAllowedCodes(role, codes);
    }

    // ------------------------------------------------------------ 관리자설정(마스터)

    /** 회사의 마스터들(사용 중인 계정). 자물쇠 화면의 '우리회사마스터 : a , b' 와 관리자설정이 쓴다. */
    @Transactional(readOnly = true)
    public List<MasterResponse> masters() {
        return userRepository.findAll(Sort.by("id")).stream()
                .filter(u -> u.isEnabled() && u.isMaster())
                .map(u -> new MasterResponse(u.getId(), u.getUsername(), u.getName())).toList();
    }

    /** 마스터 사용자 엔티티(권한요청 알림을 보낼 사람들). */
    @Transactional(readOnly = true)
    public List<User> masterUsers() {
        return userRepository.findAll(Sort.by("id")).stream().filter(u -> u.isEnabled() && u.isMaster()).toList();
    }

    /** 마스터를 통째로 정한다 — ADMIN 역할을 붙이고 뗀다. 한 명 이상, 그리고 바꾸는 본인은 빠질 수 없다. */
    @Transactional
    public List<MasterResponse> saveMasters(List<Long> userIds, Long actorId) {
        Set<Long> want = new HashSet<>(userIds);
        if (want.isEmpty()) throw ApiException.badRequest("마스터는 한 명 이상이어야 합니다.");
        if (actorId != null && !want.contains(actorId)) {
            throw ApiException.badRequest("지금 로그인한 마스터는 뺄 수 없습니다. 다른 마스터로 로그인해서 바꾸세요.");
        }
        Role admin = roleRepository.findByName(User.MASTER_ROLE)
                .orElseThrow(() -> ApiException.notFound("마스터 역할(ADMIN)이 없습니다."));
        for (Long id : want) user(id);   // 없는 id 거르기
        for (User u : userRepository.findAll()) {
            boolean on = want.contains(u.getId());
            if (on && !u.isMaster()) {
                Set<Role> roles = new HashSet<>(u.getRoles());
                roles.add(admin);
                u.setRoles(roles);
            } else if (!on && u.isMaster()) {
                u.setRoles(u.getRoles().stream().filter(r -> !User.MASTER_ROLE.equals(r.getName()))
                        .collect(Collectors.toCollection(HashSet::new)));
            }
        }
        userRepository.flush();
        return masters();
    }

    // ------------------------------------------------------------ 도움

    private static void apply(WorkPermission w, SaveWorkRow r) {
        boolean c = r.create() == null || r.create();
        boolean u = r.update() == null || r.update();
        boolean d = r.delete() == null || r.delete();
        boolean e = r.export() == null || r.export();
        String menus = EffectivePermissions.formatMenus(r.menus());
        WorkPermissionMode mode = r.mode();
        if (mode != WorkPermissionMode.DENY) {
            // 원본: 행위 칸이 하나라도 꺼져 있으면 예외(행위), 아니고 꺼진 메뉴가 있으면 예외(메뉴), 둘 다 없으면 권한있음.
            boolean menuOff = r.menus() != null && r.menus().containsValue(Boolean.FALSE);
            mode = !(c && u && d && e) ? WorkPermissionMode.EXC_ACTION
                    : menuOff ? WorkPermissionMode.EXC_MENU : WorkPermissionMode.ALLOW;
        } else {
            c = u = d = e = false;
            menus = null;
        }
        w.setMode(mode);
        w.setCanCreate(c);
        w.setCanUpdate(u);
        w.setCanDelete(d);
        w.setCanExport(e);
        w.setMenuRules(menus);
    }

    private static List<WorkRow> toRows(Map<String, Access> resolved, Set<String> individual) {
        List<WorkRow> out = new ArrayList<>();
        for (MenuPermissionCatalog.Perm p : MenuPermissionCatalog.ALL) {
            Access a = resolved.getOrDefault(p.code(), Access.NONE);
            out.add(new WorkRow(p.code(), p.name(), p.category(), MenuPermissionCatalog.MASTER_ONLY.contains(p.code()),
                    individual.contains(p.code()), a.mode(), a.create(), a.update(), a.delete(), a.export(), a.menus()));
        }
        return out;
    }

    private static Role primaryGroup(User user) {
        return user.getRoles().stream().filter(r -> !User.MASTER_ROLE.equals(r.getName()))
                .min(Comparator.comparing(Role::getId)).orElse(null);
    }

    private static void requireWork(String code) {
        if (!MenuPermissionCatalog.exists(code)) throw ApiException.badRequest("없는 업무입니다: " + code);
    }

    private User user(Long id) {
        return userRepository.findById(id).orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다. id=" + id));
    }

    private Role group(Long id) {
        return roleRepository.findById(id).orElseThrow(() -> ApiException.notFound("권한그룹을 찾을 수 없습니다. id=" + id));
    }
}
