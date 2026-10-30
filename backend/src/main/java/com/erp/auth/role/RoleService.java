package com.erp.auth.role;

import com.erp.common.ApiException;
import com.erp.auth.role.dto.RoleDtos.CreateRoleRequest;
import com.erp.auth.role.dto.RoleDtos.RoleResponse;
import com.erp.auth.role.dto.RoleDtos.UpdateRoleRequest;
import com.erp.auth.user.UserRepository;
import com.erp.auth.workpermission.WorkPermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import com.erp.auth.role.dto.RoleDtos;

/**
 * 역할과 역할별 메뉴 권한 관리. 쓰기 API 는 USER_MANAGE(ADMIN) 로 인가된다.
 */
@Service
@RequiredArgsConstructor
public class RoleService {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final WorkPermissionService workPermissionService;

    @Transactional(readOnly = true)
    public List<RoleResponse> list() {
        return roleRepository.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
                .map(r -> RoleResponse.from(r, userRepository.countByRoles_Id(r.getId()),
                        workPermissionService.groupAllowedCodes(r.getId())))
                .toList();
    }

    @Transactional
    public RoleResponse create(CreateRoleRequest req) {
        String name = req.name().trim().toUpperCase();
        if (roleRepository.existsByName(name)) {
            throw ApiException.conflict("이미 존재하는 역할 코드입니다: " + name);
        }
        Role role = Role.builder()
                .name(name)
                .displayName(req.displayName().trim())
                .description(req.description())
                .build();
        Role saved = roleRepository.saveAndFlush(role);
        workPermissionService.setGroupAllowedCodes(saved, req.permissionCodes());
        return RoleResponse.from(saved, 0, workPermissionService.groupAllowedCodes(saved.getId()));
    }

    @Transactional
    public RoleResponse update(Long id, UpdateRoleRequest req) {
        Role role = roleRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("역할을 찾을 수 없습니다. id=" + id));
        role.setDisplayName(req.displayName().trim());
        role.setDescription(req.description());
        // permissionCodes 를 안 주면(권한그룹 설정 화면의 이름 고치기) 업무권한은 그대로 둔다.
        if (req.permissionCodes() != null) {
            workPermissionService.setGroupAllowedCodes(role, req.permissionCodes());
        }
        return RoleResponse.from(role, userRepository.countByRoles_Id(id), workPermissionService.groupAllowedCodes(id));
    }

    @Transactional
    public void delete(Long id) {
        Role role = roleRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("역할을 찾을 수 없습니다. id=" + id));
        if (RoleResponse.isSystem(role.getName())) {
            throw ApiException.badRequest("기본 역할(ADMIN·MANAGER·STAFF)은 삭제할 수 없습니다.");
        }
        long users = userRepository.countByRoles_Id(id);
        if (users > 0) {
            throw ApiException.conflict("이 역할을 가진 사용자가 " + users + "명 있어 삭제할 수 없습니다. 먼저 사용자의 역할을 바꾸세요.");
        }
        roleRepository.delete(role);
    }
}
