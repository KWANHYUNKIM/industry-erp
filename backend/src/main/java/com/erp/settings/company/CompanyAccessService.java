package com.erp.settings.company;

import com.erp.common.ApiException;
import com.erp.settings.company.dto.CompanyDtos.CompanyResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

/**
 * 회사를 <b>지금 쓸 수 있는가</b> — 로그인 · 요청마다의 토큰 검사 · 사용자 수 한도.
 *
 * <p>{@link CompanyService} 와 나눈 이유: 그쪽은 회사를 만들며 {@code TenantSeeder}(→ PasswordEncoder
 * → SecurityConfig → JWT 필터)를 쥐고 있어서, 필터가 그것을 받으면 빈 순환으로 기동이 실패한다.
 * 여기는 레지스트리 하나만 본다.
 */
@Service
@RequiredArgsConstructor
public class CompanyAccessService {

    private final CompanyRepository companyRepository;

    /**
     * 로그인할 회사. 회사코드는 반드시 받는다(원본 이카운트와 같다 — 비워 두면 본사로 들어가던 것을 막았다).
     * 중지됐거나 사용기한이 지난 회사는 여기서 돌려보낸다.
     */
    @Transactional(readOnly = true)
    public CompanyResponse loginTarget(String code) {
        if (code == null || code.isBlank()) {
            throw ApiException.badRequest("회사코드를 입력하세요.");
        }
        Company c = companyRepository.findByCode(code.trim())
                .orElseThrow(() -> ApiException.badRequest("회사코드가 올바르지 않습니다."));
        if (!c.isActive()) {
            throw ApiException.badRequest("사용 중지된 회사입니다.");
        }
        if (!c.usableOn(LocalDate.now())) {
            throw ApiException.badRequest("사용기한(" + c.getExpiresOn() + ")이 지난 회사입니다.");
        }
        return CompanyResponse.from(c);
    }

    /**
     * 이미 받은 토큰으로 들어오는 요청이 지금도 쓸 수 있는 회사인가. 로그인 뒤에 중지하거나 기한이 지나도
     * 토큰이 살아 있는 동안 계속 쓰이던 것을 막는다. 레지스트리에 없는 스키마도 거절한다.
     */
    @Transactional(readOnly = true)
    public boolean isUsable(String schema) {
        return companyRepository.findBySchemaName(schema)
                .map(c -> c.usableOn(LocalDate.now()))
                .orElse(false);
    }

    /**
     * 사용자를 하나 더 쓸 수 있는가. {@code activeUsers} 는 지금 사용 중인 계정 수(새로 늘릴 계정은 빼고).
     * 한도가 없으면 통과.
     */
    @Transactional(readOnly = true)
    public void requireSeat(String schema, long activeUsers) {
        companyRepository.findBySchemaName(schema).ifPresent(c -> {
            if (c.getMaxUsers() != null && activeUsers >= c.getMaxUsers()) {
                throw ApiException.badRequest("사용자 수 한도(" + c.getMaxUsers()
                        + "명)에 찼습니다. 쓰지 않는 사용자를 중지하거나 한도를 늘리세요.");
            }
        });
    }
}
