package com.erp.security;

import com.erp.auth.domain.Permission;
import com.erp.auth.domain.User;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Spring Security 인증 주체. 도메인 User 를 감싸 id/name 등 부가 정보를 함께 보관한다.
 * <p>
 * 권한은 두 종류로 노출한다: 역할은 {@code ROLE_<name>}, 메뉴 권한은 {@code PERM_<code>}.
 * 인가 인터셉터와 {@code /api/me/permissions} 가 이 값을 읽는다. ADMIN 역할이면 전권.
 */
@Getter
public class UserPrincipal implements UserDetails {

    public static final String ROLE_ADMIN = "ROLE_ADMIN";
    public static final String PERM_PREFIX = "PERM_";

    private final Long id;
    private final String username;
    private final String password;
    private final String name;
    private final boolean enabled;
    private final boolean admin;
    /** 이 사용자에게 부여된 메뉴 권한 코드 (역할들의 합집합). ADMIN 이면 비어 있어도 전권. */
    private final Set<String> permissionCodes;
    private final Collection<? extends GrantedAuthority> authorities;

    public UserPrincipal(User user) {
        this.id = user.getId();
        this.username = user.getUsername();
        this.password = user.getPassword();
        this.name = user.getName();
        this.enabled = user.isEnabled();

        Set<GrantedAuthority> auths = new LinkedHashSet<>();
        Set<String> codes = new LinkedHashSet<>();
        boolean isAdmin = false;
        for (var role : user.getRoles()) {
            auths.add(new SimpleGrantedAuthority("ROLE_" + role.getName()));
            if ("ADMIN".equals(role.getName())) {
                isAdmin = true;
            }
            for (Permission p : role.getPermissions()) {   // LAZY — 인증 트랜잭션 안에서 초기화
                codes.add(p.getCode());
                auths.add(new SimpleGrantedAuthority(PERM_PREFIX + p.getCode()));
            }
        }
        this.admin = isAdmin;
        this.permissionCodes = codes;
        this.authorities = auths.stream().collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }
}
