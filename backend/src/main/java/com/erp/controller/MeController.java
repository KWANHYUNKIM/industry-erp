package com.erp.controller;

import com.erp.security.UserPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 현재 로그인 사용자의 인가 정보. 프론트가 메뉴 노출·라우트 가드에 쓴다.
 * ADMIN 이면 {@code admin=true} 이고 개별 코드와 무관하게 전권이다.
 */
@RestController
@RequestMapping("/api/me")
public class MeController {

    public record MyPermissions(boolean admin, List<String> codes) {}

    @GetMapping("/permissions")
    public MyPermissions permissions(@AuthenticationPrincipal UserPrincipal principal) {
        return new MyPermissions(
                principal.isAdmin(),
                principal.getPermissionCodes().stream().sorted().toList());
    }
}
