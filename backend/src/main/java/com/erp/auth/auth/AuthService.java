package com.erp.auth.auth;

import com.erp.auth.user.User;
import com.erp.auth.auth.dto.AuthDtos.LoginRequest;
import com.erp.auth.auth.dto.AuthDtos.LoginResponse;
import com.erp.auth.user.dto.UserDtos.UserResponse;
import com.erp.settings.company.CompanyAccessService;
import com.erp.settings.company.dto.CompanyDtos.CompanyResponse;
import com.erp.auth.user.UserRepository;
import com.erp.security.JwtTokenProvider;
import com.erp.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;
import com.erp.auth.auth.dto.AuthDtos;
import com.erp.auth.user.dto.UserDtos;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider tokenProvider;
    private final UserRepository userRepository;
    private final CompanyAccessService companyAccessService;

    // @Transactional 을 걸지 않는다. 걸면 테넌트를 정하기 전에 public 커넥션으로 세션이 열려,
    // 인증이 엉뚱하게 본사(public) 사용자 테이블을 조회한다. 각 조회가 테넌트 설정 후 자기
    // 트랜잭션으로 열리도록 둔다.
    public LoginResponse login(LoginRequest request) {
        // 회사코드 필수 · 중지 · 사용기한은 회사 쪽이 판단한다.
        CompanyResponse company = companyAccessService.loginTarget(request.companyCode());

        // 인증·조회를 이 회사 스키마에서 하도록 테넌트를 건다. 스레드 반납 전에 되돌린다.
        TenantContext.set(company.schemaName());
        try {
            // 자격 증명 검증 (실패 시 BadCredentialsException → 401)
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.username(), request.password()));

            User user = userRepository.findByUsername(request.username())
                    .orElseThrow();  // 인증 통과했으므로 존재 보장
            String token = tokenProvider.createToken(user.getUsername(), company.schemaName());
            return new LoginResponse(token, company.code(), company.name(), UserResponse.from(user));
        } finally {
            TenantContext.clear();
        }
    }
}
