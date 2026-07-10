package com.erp.service;

import com.erp.domain.User;
import com.erp.dto.AuthDtos.LoginRequest;
import com.erp.dto.AuthDtos.LoginResponse;
import com.erp.dto.UserDtos.UserResponse;
import com.erp.repository.UserRepository;
import com.erp.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider tokenProvider;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        // 자격 증명 검증 (실패 시 BadCredentialsException → 401)
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username(), request.password()));

        User user = userRepository.findByUsername(request.username())
                .orElseThrow();  // 인증 통과했으므로 존재 보장
        String token = tokenProvider.createToken(user.getUsername());
        return new LoginResponse(token, UserResponse.from(user));
    }
}
