package com.erp.auth.auth;

import com.erp.auth.auth.dto.AuthDtos.LoginRequest;
import com.erp.auth.auth.dto.AuthDtos.LoginResponse;
import com.erp.auth.user.dto.UserDtos.UserResponse;
import com.erp.auth.user.UserRepository;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import com.erp.auth.auth.dto.AuthDtos;
import com.erp.auth.user.dto.UserDtos;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final UserRepository userRepository;

    /** 로그인 → JWT 토큰 + 사용자 정보 */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    /** 로그아웃 — 서버에서 이 사용자의 토큰을 회수한다. 토큰이 이미 안 통하면(401) 프론트는 그냥 지운다. */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal != null) authService.logout(principal.getUsername());
        return ResponseEntity.noContent().build();
    }

    /** 현재 로그인한 사용자 정보 */
    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(@AuthenticationPrincipal UserPrincipal principal) {
        return userRepository.findByUsername(principal.getUsername())
                .map(UserResponse::from)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
