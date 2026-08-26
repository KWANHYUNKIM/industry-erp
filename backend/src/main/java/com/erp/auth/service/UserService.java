package com.erp.auth.service;

import com.erp.common.ApiException;
import com.erp.auth.domain.Role;
import com.erp.auth.domain.User;
import com.erp.auth.dto.UserDtos.CreateUserRequest;
import com.erp.auth.dto.UserDtos.UpdateUserRequest;
import com.erp.auth.dto.UserDtos.UserResponse;
import com.erp.auth.repository.RoleRepository;
import com.erp.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import com.erp.auth.dto.UserDtos;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public List<UserResponse> findAll() {
        return userRepository.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
                .map(UserResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public UserResponse findById(Long id) {
        return UserResponse.from(getUser(id));
    }

    @Transactional
    public UserResponse create(CreateUserRequest request) {
        if (userRepository.existsByUsername(request.username())) {
            throw ApiException.conflict("이미 사용 중인 아이디입니다: " + request.username());
        }

        User user = User.builder()
                .username(request.username())
                .password(passwordEncoder.encode(request.password()))
                .name(request.name())
                .email(request.email())
                .department(request.department())
                .enabled(true)
                .roles(resolveRoles(request.roleNames()))
                .build();

        return UserResponse.from(userRepository.save(user));
    }

    /** 사용여부만 바꾼다. 다른 필드는 건드리지 않는다. */
    @Transactional
    public UserResponse setEnabled(Long id, boolean enabled) {
        User user = getUser(id);
        user.setEnabled(enabled);
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse update(Long id, UpdateUserRequest request) {
        User user = getUser(id);
        user.setName(request.name());
        user.setEmail(request.email());
        user.setDepartment(request.department());
        if (request.enabled() != null) {
            user.setEnabled(request.enabled());
        }
        if (request.roleNames() != null) {
            user.setRoles(resolveRoles(request.roleNames()));
        }
        if (StringUtils.hasText(request.password())) {
            user.setPassword(passwordEncoder.encode(request.password()));
        }
        return UserResponse.from(user);
    }

    /**
     * 사용자 삭제. 작성 이력이 있으면 지울 수 없다.
     *
     * created_by 가 users(username) 에 FK(ON DELETE RESTRICT)로 묶여 있어(V95), 전표·문서를 하나라도
     * 작성한 계정은 DB 가 삭제를 거부한다. 그 예외를 그대로 흘려보내면 사용자에게 500 이 보이므로
     * 여기서 무슨 일이 일어났는지 말해준다 — 이력을 지우는 것보다 계정을 사용중지로 내리는 것이 맞다.
     */
    @Transactional
    public void delete(Long id) {
        User user = getUser(id);
        try {
            userRepository.delete(user);
            userRepository.flush();   // FK 위반을 트랜잭션 커밋이 아니라 여기서 잡는다
        } catch (DataIntegrityViolationException e) {
            throw ApiException.conflict("작성한 전표·문서가 있는 사용자는 삭제할 수 없습니다: "
                    + user.getUsername() + " (사용중지로 내리세요)");
        }
    }

    /** 다른 서비스가 사용자 엔티티를 얻는 진입점 (리포지토리를 직접 주입하지 않도록). */
    @Transactional(readOnly = true)
    public User get(Long id) {
        return getUser(id);
    }

    /** 로그인 아이디로 사용자 엔티티. 로그인한 본인을 찾는 다른 모듈의 진입점. */
    @Transactional(readOnly = true)
    public User getByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다: " + username));
    }

    private User getUser(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다. id=" + id));
    }

    /**
     * 역할 이름을 실제 역할로 바꾼다.
     *
     * <p><b>비어 있으면 거절한다.</b> 예전에는 역할을 안 주면 STAFF 를 자동으로 붙였는데,
     * STAFF 는 권한을 22개 가진 역할이다. 화면에서 권한 체크박스를 전부 해제하고 등록하면
     * "권한 없음"으로 만든 줄 알지만 실제로는 거의 전권을 가진 계정이 생겼다.
     * 실수로 빠뜨린 것과 일부러 비운 것을 서버가 구분할 수 없으니, 조용히 고르지 말고 물어야 한다.
     *
     * <p>수정({@code update})에서 {@code roleNames} 가 {@code null} 인 것은 "역할은 그대로"라는
     * 뜻이고 호출부가 걸러낸다. 여기까지 왔다는 것은 역할을 정하겠다는 뜻이다.
     */
    private Set<Role> resolveRoles(Set<String> roleNames) {
        Set<Role> roles = new HashSet<>();
        if (roleNames == null || roleNames.isEmpty()) {
            throw ApiException.badRequest("권한그룹을 하나 이상 선택하세요.");
        }
        for (String name : roleNames) {
            Role role = roleRepository.findByName(name)
                    .orElseThrow(() -> ApiException.badRequest("존재하지 않는 역할입니다: " + name));
            roles.add(role);
        }
        return roles;
    }
}
