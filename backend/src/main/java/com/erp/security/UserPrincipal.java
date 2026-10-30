package com.erp.security;

import com.erp.auth.user.User;
import com.erp.auth.workpermission.EffectivePermissions;
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
 * 권한은 두 종류로 노출한다: 역할은 {@code ROLE_<name>}, 진입할 수 있는 업무는 {@code PERM_<code>}.
 * 업무권한(기본권한 · 권한그룹 · 개별권한을 푼 값)은 {@link #permissions} — 인가 인터셉터와 {@code /api/me/permissions} 가 읽는다.
 * 마스터(ADMIN 역할)면 전권.
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
    /** 진입할 수 있는 업무 코드(권한없음이 아닌 업무). 마스터면 전부. */
    private final Set<String> permissionCodes;
    /** 풀린 업무권한(업무별 권한 · 예외(행위) · 예외(메뉴)). */
    private final EffectivePermissions permissions;
    private final Collection<? extends GrantedAuthority> authorities;

    public UserPrincipal(User user, EffectivePermissions permissions) {
        this.id = user.getId();
        this.username = user.getUsername();
        this.password = user.getPassword();
        this.name = user.getName();
        this.enabled = user.isEnabled();
        this.permissions = permissions;
        this.admin = permissions.isMaster();
        this.permissionCodes = permissions.allowedCodes();

        Set<GrantedAuthority> auths = new LinkedHashSet<>();
        for (var role : user.getRoles()) {
            auths.add(new SimpleGrantedAuthority("ROLE_" + role.getName()));
        }
        for (String code : permissionCodes) {
            auths.add(new SimpleGrantedAuthority(PERM_PREFIX + code));
        }
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
