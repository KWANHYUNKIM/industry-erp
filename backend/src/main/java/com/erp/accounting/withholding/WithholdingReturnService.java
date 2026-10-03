package com.erp.accounting.withholding;

import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingReturnRequest;
import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingReturnResponse;
import com.erp.common.ApiException;
import com.erp.settings.companyinfo.CompanyInfoService;
import com.erp.settings.companyinfo.dto.CompanyInfoDtos.CompanyInfoResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 원천징수이행상황신고서 목록(E030101) — 신고서를 만들고 · 고치고 · 지운다.
 * 원본처럼 만든 뒤에는 신고방법 · 귀속연월 · 지급연월 · 연말정산포함을 못 바꾼다(신고구분 · 신고일자만).
 */
@Service
@RequiredArgsConstructor
public class WithholdingReturnService {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    private final WithholdingReturnRepository repository;
    private final CompanyInfoService companyInfoService;

    @Transactional(readOnly = true)
    public List<WithholdingReturnResponse> list() {
        CompanyInfoResponse company = companyInfoService.get();
        return repository.findAllByOrderByAttributionMonthDescIdDesc().stream()
                .map(r -> WithholdingReturnResponse.from(r, company))
                .toList();
    }

    @Transactional
    public WithholdingReturnResponse create(WithholdingReturnRequest req) {
        if (req.filingType() == null || req.filingMethod() == null || req.reportDate() == null) {
            throw ApiException.badRequest("신고구분 · 신고방법 · 신고일자를 입력하세요.");
        }
        month(req.attributionMonth(), "귀속연월");
        month(req.payMonth(), "지급연월");
        if (repository.existsByAttributionMonthAndPayMonthAndFilingType(
                req.attributionMonth(), req.payMonth(), req.filingType())) {
            throw ApiException.conflict("동일한 원천징수이행상황신고서가 있습니다.");
        }
        WithholdingReturn r = repository.save(WithholdingReturn.builder()
                .filingType(req.filingType())
                .filingMethod(req.filingMethod())
                .attributionMonth(req.attributionMonth())
                .payMonth(req.payMonth())
                .reportDate(req.reportDate())
                .includeYearEnd(Boolean.TRUE.equals(req.includeYearEnd()))
                .build());
        return WithholdingReturnResponse.from(r, companyInfoService.get());
    }

    /** 신고구분 · 신고일자만 바꾼다. 나머지는 요청에 실려 와도 무시한다(원본에서 막힌 칸). */
    @Transactional
    public WithholdingReturnResponse update(Long id, WithholdingReturnRequest req) {
        WithholdingReturn r = find(id);
        if (req.filingType() != null && req.filingType() != r.getFilingType()) {
            if (repository.existsByAttributionMonthAndPayMonthAndFilingType(
                    r.getAttributionMonth(), r.getPayMonth(), req.filingType())) {
                throw ApiException.conflict("동일한 원천징수이행상황신고서가 있습니다.");
            }
            r.setFilingType(req.filingType());
        }
        if (req.reportDate() != null) r.setReportDate(req.reportDate());
        return WithholdingReturnResponse.from(r, companyInfoService.get());
    }

    @Transactional
    public void delete(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            throw ApiException.badRequest("리스트에 선택된 자료가 없습니다.");
        }
        repository.deleteAllById(ids);
    }

    private WithholdingReturn find(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("원천징수이행상황신고서를 찾을 수 없습니다: " + id));
    }

    private static void month(String v, String label) {
        if (v == null || !MONTH.matcher(v).matches()) {
            throw ApiException.badRequest(label + " 형식이 올바르지 않습니다(YYYY-MM): " + v);
        }
    }
}
