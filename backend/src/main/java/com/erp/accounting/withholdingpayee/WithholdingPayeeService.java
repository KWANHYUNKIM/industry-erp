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
 * [삭제/삭제취소 ▴] — 임시삭제 · 삭제취소는 표시만 바꾸고(지급 줄이 가리켜도 막히지 않음), 영구삭제는 지급 줄이 가리키면 막힌다.
 */
@Service
@RequiredArgsConstructor
public class WithholdingPayeeService {

    private final WithholdingPayeeRepository repository;
    /** 같은 모듈(accounting) 기타원천세 — 영구삭제 막힘을 보려고 읽기만 한다. 서비스를 주입하면 OtherWithholdingService → 이 서비스와 순환이 된다. */
    private final com.erp.accounting.otherwithholding.OtherWithholdingRepository otherWithholdingRepository;

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

    /**
     * [삭제/삭제취소 ▴] 의 [임시삭제] · [삭제취소] — 확인 창 없이 표시만 바꾼다(원본 2026-10-20: 임시삭제한 줄은 목록에 남고
     * 칸이 분홍 rgb(255,235,235), 삭제취소하면 흰 줄로 돌아온다).
     */
    @Transactional
    public void setDeleted(List<Long> ids, boolean deleted) {
        if (ids == null || ids.isEmpty()) throw ApiException.badRequest("선택된 자료가 없습니다.");
        repository.findAllById(ids).forEach(p -> p.setDeleted(deleted));
    }

    /**
     * [영구삭제] — 기타원천세 지급 줄이 가리키는 소득자(같은 소득자 · 같은 주민(법인)등록번호)는 지우지 않고
     * 원본 '삭제불가소득자' 창에 띄울 줄(주민(법인)등록번호 앞 7자리 · 소득자명 · 소득구분)을 돌려준다. 하나라도 막히면 아무것도 지우지 않는다.
     */
    @Transactional
    public List<com.erp.accounting.withholdingpayee.dto.WithholdingPayeeDtos.BlockedPayee> deletePermanently(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw ApiException.badRequest("선택된 자료가 없습니다.");
        List<WithholdingPayee> payees = repository.findAllById(ids);
        List<com.erp.accounting.withholdingpayee.dto.WithholdingPayeeDtos.BlockedPayee> blocked = new java.util.ArrayList<>();
        for (WithholdingPayee p : payees) {
            String reg = p.getRegNo().replace("-", "");
            otherWithholdingRepository.findUsing(p.getId(), p.getRegNo()).stream().findFirst().ifPresent(w ->
                    blocked.add(new com.erp.accounting.withholdingpayee.dto.WithholdingPayeeDtos.BlockedPayee(reg.length() > 7 ? reg.substring(0, 7) : reg, p.getName(),
                            w.getIncomeType() == com.erp.accounting.income.IncomeType.INTEREST
                                    || w.getIncomeType() == com.erp.accounting.income.IncomeType.DIVIDEND
                                    ? "이자배당소득" : w.getIncomeType().getDisplayName())));
        }
        if (blocked.isEmpty()) repository.deleteAll(payees);
        return blocked;
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
