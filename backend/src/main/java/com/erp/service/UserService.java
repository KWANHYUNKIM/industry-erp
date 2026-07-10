package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Role;
import com.erp.domain.User;
import com.erp.dto.UserDtos.CreateUserRequest;
import com.erp.dto.UserDtos.UpdateUserRequest;
import com.erp.dto.UserDtos.UserResponse;
import com.erp.repository.RoleRepository;
import com.erp.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

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

    @Transactional
    public void delete(Long id) {
        User user = getUser(id);
        userRepository.delete(user);
    }

    private User getUser(Long id) {
        return userRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다. id=" + id));
    }

    private Set<Role> resolveRoles(Set<String> roleNames) {
        Set<Role> roles = new HashSet<>();
        if (roleNames == null || roleNames.isEmpty()) {
            // 역할 미지정 시 기본 STAFF 부여
            roles.add(roleRepository.findByName("STAFF")
                    .orElseThrow(() -> ApiException.badRequest("기본 역할(STAFF)이 존재하지 않습니다.")));
            return roles;
        }
        for (String name : roleNames) {
            Role role = roleRepository.findByName(name)
                    .orElseThrow(() -> ApiException.badRequest("존재하지 않는 역할입니다: " + name));
            roles.add(role);
        }
        return roles;
    }
}
