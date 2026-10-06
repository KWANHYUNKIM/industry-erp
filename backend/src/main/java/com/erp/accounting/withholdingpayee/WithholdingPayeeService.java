package com.erp.accounting.withholdingpayee;

import com.erp.accounting.WithholdingCodes;
import com.erp.accounting.withholdingpayee.dto.WithholdingPayeeDtos.PayeeRequest;
import com.erp.accounting.withholdingpayee.dto.WithholdingPayeeDtos.PayeeResponse;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;

/**
 * 소득자등록(세무 › 기타원천세 E030301, 2026-10-04 loginaa 실측).
 *
 * <p>목록 [구분 · 성명(대표자명) · 주민(법인)등록번호 앞자리 · 상호 · 사업자등록번호], 등록 차례(원본 김꽃 · 유강사 · 최이사 · 피아노레슨).
 * [삭제/삭제취소]는 지우지 않고 표시를 뒤집는다 — 지급 줄이 소득자를 가리키고 있어도 막히지 않는다.
 */
@Service
@RequiredArgsConstructor
public class WithholdingPayeeService {

    private final WithholdingPayeeRepository repository;

    @Transactional(readOnly = true)
    public List<PayeeResponse> list(boolean includeDeleted) {
        return repository.findAll().stream()
                .filter(p -> includeDeleted || !p.isDeleted())
                .sorted(Comparator.comparing(WithholdingPayee::getId))
                .map(WithholdingPayeeService::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public PayeeResponse get(Long id) {
        return toResponse(find(id));
    }

    /** 같은 모듈 기타원천세가 지급 줄에 붙일 때 쓴다. */
    @Transactional(readOnly = true)
    public WithholdingPayee find(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("소득자를 찾을 수 없습니다. id=" + id));
    }

    @Transactional
    public PayeeResponse create(PayeeRequest req) {
        WithholdingPayee p = WithholdingPayee.builder().build();
        apply(p, req);
        return toResponse(repository.save(p));
    }

    @Transactional
    public PayeeResponse update(Long id, PayeeRequest req) {
        WithholdingPayee p = find(id);
        apply(p, req);
        return toResponse(p);
    }

    /** [삭제/삭제취소] — 고른 소득자마다 삭제 표시를 뒤집는다. */
    @Transactional
    public void toggleDeleted(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw ApiException.badRequest("선택된 자료가 없습니다.");
        repository.findAllById(ids).forEach(p -> p.setDeleted(!p.isDeleted()));
    }

    private void apply(WithholdingPayee p, PayeeRequest req) {
        String industry = blank(req.industryCode());
        if (industry != null && WithholdingCodes.industryName(industry) == null) {
            throw ApiException.badRequest("업종구분코드가 올바르지 않습니다: " + industry);
        }
        String kindCode = blank(req.payeeKindCode());
        if (kindCode != null && !WithholdingCodes.isPayeeKind(kindCode)) {
            throw ApiException.badRequest("소득자구분코드가 올바르지 않습니다: " + kindCode);
        }
        p.setKind(req.kind());
        p.setBizRegNo(blank(req.bizRegNo()));
        p.setRegNo(req.regNo().trim());
        p.setTradeName(blank(req.tradeName()));
        p.setName(req.name().trim());
        p.setAddress(blank(req.address()));
        p.setEnglishName(blank(req.englishName()));
        p.setBizAddress(blank(req.bizAddress()));
        p.setPayeeKindCode(kindCode);
        p.setIndustryCode(industry);
        p.setBankName(blank(req.bankName()));
        p.setAccountNo(blank(req.accountNo()));
        p.setNonResident(req.nonResident());
        p.setForeigner(req.foreigner());
        p.setNonRealName(req.nonRealName());
        p.setBirthDate(blank(req.birthDate()));
        p.setAccountCode(blank(req.accountCode()));
        p.setMobile(blank(req.mobile()));
        p.setEmail(blank(req.email()));
        p.setMemo(blank(req.memo()));
    }

    private static PayeeResponse toResponse(WithholdingPayee p) {
        return PayeeResponse.from(p, WithholdingCodes.industryName(p.getIndustryCode()));
    }

    private static String blank(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
