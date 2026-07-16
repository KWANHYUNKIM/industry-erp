package com.erp.auth.controller;

import com.erp.auth.dto.AuthDtos.LoginRequest;
import com.erp.auth.dto.AuthDtos.LoginResponse;
import com.erp.auth.dto.UserDtos.UserResponse;
import com.erp.auth.repository.UserRepository;
import com.erp.security.UserPrincipal;
import com.erp.auth.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import com.erp.auth.dto.AuthDtos;
import com.erp.auth.dto.UserDtos;

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

    /** 현재 로그인한 사용자 정보 */
    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(@AuthenticationPrincipal UserPrincipal principal) {
        return userRepository.findByUsername(principal.getUsername())
                .map(UserResponse::from)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
