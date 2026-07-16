package com.erp.auth.service;

import com.erp.common.ApiException;
import com.erp.settings.domain.Company;
import com.erp.auth.domain.User;
import com.erp.auth.dto.AuthDtos.LoginRequest;
import com.erp.auth.dto.AuthDtos.LoginResponse;
import com.erp.auth.dto.UserDtos.UserResponse;
import com.erp.settings.repository.CompanyRepository;
import com.erp.auth.repository.UserRepository;
import com.erp.security.JwtTokenProvider;
import com.erp.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import com.erp.auth.dto.AuthDtos;
import com.erp.auth.dto.UserDtos;

@Service
@RequiredArgsConstructor
public class AuthService {

    /** 회사코드 미입력 시 본사 */
    private static final String DEFAULT_COMPANY_CODE = "0001";

    private final AuthenticationManager authenticationManager;
    private final JwtTokenProvider tokenProvider;
    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;

    // @Transactional 을 걸지 않는다. 걸면 테넌트를 정하기 전에 public 커넥션으로 세션이 열려,
    // 인증이 엉뚱하게 본사(public) 사용자 테이블을 조회한다. 각 조회가 테넌트 설정 후 자기
    // 트랜잭션으로 열리도록 둔다.
    public LoginResponse login(LoginRequest request) {
        String code = StringUtils.hasText(request.companyCode())
                ? request.companyCode().trim() : DEFAULT_COMPANY_CODE;
        Company company = companyRepository.findByCode(code)
                .orElseThrow(() -> ApiException.badRequest("회사코드가 올바르지 않습니다."));
        if (!company.isActive()) {
            throw ApiException.badRequest("사용 중지된 회사입니다.");
        }

        // 인증·조회를 이 회사 스키마에서 하도록 테넌트를 건다. 스레드 반납 전에 되돌린다.
        TenantContext.set(company.getSchemaName());
        try {
            // 자격 증명 검증 (실패 시 BadCredentialsException → 401)
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.username(), request.password()));

            User user = userRepository.findByUsername(request.username())
                    .orElseThrow();  // 인증 통과했으므로 존재 보장
            String token = tokenProvider.createToken(user.getUsername(), company.getSchemaName());
            return new LoginResponse(token, company.getCode(), company.getName(), UserResponse.from(user));
        } finally {
            TenantContext.clear();
        }
    }
}
