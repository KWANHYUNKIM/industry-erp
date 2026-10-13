package com.erp.hr.payroll;

import com.erp.hr.payroll.dto.InsuranceRateDtos.InsuranceRateRequest;
import com.erp.hr.payroll.dto.InsuranceRateDtos.InsuranceRateResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.YearMonth;

/**
 * 연도별 4대보험 요율 — 회사가 정한 줄(세율/세액등록)이 있으면 그것, 없으면 법정 요율.
 * 원본 loginaa 는 2026 급여에도 2025 요율을 쓴다 — 이 설정으로 같게 맞출 수 있다(기본은 법정 요율).
 */
@Service
@RequiredArgsConstructor
public class SocialInsuranceRateService {

    private final SocialInsuranceRateRepository repository;

    /** 급여계산이 쓰는 그 귀속월의 요율 */
    public record Rates(BigDecimal pension, BigDecimal health, BigDecimal longTermCareOfHealth, BigDecimal employment) {}

    @Transactional(readOnly = true)
    public Rates rates(YearMonth ym) {
        return repository.findByRateYear(ym.getYear())
                .map(r -> new Rates(r.getPensionRate(), r.getHealthRate(), r.getLongTermCareRate(), r.getEmploymentRate()))
                .orElseGet(() -> statutory(ym));
    }

    @Transactional(readOnly = true)
    public InsuranceRateResponse get(int year) {
        return repository.findByRateYear(year)
                .map(r -> new InsuranceRateResponse(year, true, r.getPensionRate(), r.getHealthRate(),
                        r.getLongTermCareRate(), r.getEmploymentRate()))
                .orElseGet(() -> {
                    Rates s = statutory(YearMonth.of(year, 1));
                    return new InsuranceRateResponse(year, false, s.pension(), s.health(), s.longTermCareOfHealth(), s.employment());
                });
    }

    @Transactional
    public InsuranceRateResponse save(int year, InsuranceRateRequest req) {
        SocialInsuranceRate r = repository.findByRateYear(year)
                .orElseGet(() -> SocialInsuranceRate.builder().rateYear(year).build());
        r.setPensionRate(req.pensionRate());
        r.setHealthRate(req.healthRate());
        r.setLongTermCareRate(req.longTermCareRate());
        r.setEmploymentRate(req.employmentRate());
        repository.save(r);
        return get(year);
    }

    /** 그 해 줄을 지워 법정 요율로 되돌린다 */
    @Transactional
    public InsuranceRateResponse reset(int year) {
        repository.findByRateYear(year).ifPresent(repository::delete);
        return get(year);
    }

    private static Rates statutory(YearMonth ym) {
        return new Rates(SocialInsuranceRates.pension(ym), SocialInsuranceRates.health(ym),
                SocialInsuranceRates.longTermCareOfHealth(ym), SocialInsuranceRates.employment(ym));
    }
}
