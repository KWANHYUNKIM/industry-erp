package com.erp.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.domain.BusinessPartner;
import com.erp.domain.OtherWithholding;
import com.erp.domain.enums.IncomeType;
import com.erp.dto.OtherWithholdingDtos.CreateWithholdingRequest;
import com.erp.dto.OtherWithholdingDtos.IncomeTypeSummary;
import com.erp.dto.OtherWithholdingDtos.MonthlySummary;
import com.erp.dto.OtherWithholdingDtos.OtherWithholdingResponse;
import com.erp.repository.OtherWithholdingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * 기타원천세: 근로소득 외의 지급(사업·기타·이자·배당)에 대한 원천징수.
 * 세액은 등록 시점에 계산해 기록에 박아 둔다.
 */
@Service
@RequiredArgsConstructor
public class OtherWithholdingService {

    /** 지방소득세 = 소득세의 10% */
    private static final BigDecimal LOCAL_RATE = new BigDecimal("0.10");

    private final OtherWithholdingRepository repository;
    private final PartnerService partnerService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public MonthlySummary findMonth(String month) {
        YearMonth ym = parseMonth(month);
        List<OtherWithholding> records = repository.findBetween(ym.atDay(1), ym.atEndOfMonth());
        List<OtherWithholdingResponse> rows = records.stream().map(OtherWithholdingResponse::from).toList();

        List<IncomeTypeSummary> byType = new ArrayList<>();
        for (IncomeType type : IncomeType.values()) {
            List<OtherWithholdingResponse> of = rows.stream().filter(r -> r.incomeType() == type).toList();
            if (of.isEmpty()) continue;
            byType.add(new IncomeTypeSummary(
                    type, type.getDisplayName(), of.size(),
                    sum(of, OtherWithholdingResponse::grossAmount),
                    sum(of, OtherWithholdingResponse::incomeTax),
                    sum(of, OtherWithholdingResponse::localIncomeTax)));
        }

        return new MonthlySummary(
                ym.toString(), rows.size(),
                sum(rows, OtherWithholdingResponse::grossAmount),
                sum(rows, OtherWithholdingResponse::incomeTax),
                sum(rows, OtherWithholdingResponse::localIncomeTax),
                sum(rows, OtherWithholdingResponse::netAmount),
                byType, rows);
    }

    @Transactional
    public OtherWithholdingResponse create(CreateWithholdingRequest req, String username) {
        if (req.grossAmount().signum() <= 0) {
            throw ApiException.badRequest("지급액은 0보다 커야 합니다.");
        }
        BusinessPartner partner = req.partnerId() != null ? partnerService.get(req.partnerId()) : null;

        // 거래처를 고르면 그 상호를, 아니면 직접 적은 이름을 쓴다. 둘 다 없으면 누구에게 줬는지 알 수 없다.
        String payeeName = (req.payeeName() != null && !req.payeeName().isBlank())
                ? req.payeeName().trim()
                : (partner != null ? partner.getName() : null);
        if (payeeName == null) {
            throw ApiException.badRequest("거래처를 선택하거나 지급받는 사람 이름을 입력하세요.");
        }

        IncomeType type = req.incomeType();
        // 기타소득만 필요경비 60% 를 인정한다. 과세대상은 그 나머지.
        BigDecimal expense = req.grossAmount().multiply(type.getExpenseRate()).setScale(0, RoundingMode.DOWN);
        BigDecimal taxable = req.grossAmount().subtract(expense);
        BigDecimal incomeTax = taxable.multiply(type.getTaxRate()).setScale(0, RoundingMode.DOWN);
        BigDecimal localTax = incomeTax.multiply(LOCAL_RATE).setScale(0, RoundingMode.DOWN);

        OtherWithholding w = OtherWithholding.builder()
                .docNo(docNoGenerator.next("WT-", "other_withholdings", "doc_no", "pay_date", req.payDate()))
                .payDate(req.payDate())
                .incomeType(type)
                .partner(partner)
                .payeeName(payeeName)
                .payeeRegNo(req.payeeRegNo() != null && !req.payeeRegNo().isBlank()
                        ? req.payeeRegNo().trim()
                        : (partner != null ? partner.getBizRegNo() : null))
                .grossAmount(req.grossAmount())
                .expenseAmount(expense)
                .taxableAmount(taxable)
                .incomeTax(incomeTax)
                .localIncomeTax(localTax)
                .netAmount(req.grossAmount().subtract(incomeTax).subtract(localTax))
                .description(req.description())
                .createdBy(username)
                .build();
        return OtherWithholdingResponse.from(repository.save(w));
    }

    @Transactional
    public void delete(Long id) {
        OtherWithholding w = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("원천징수 기록을 찾을 수 없습니다. id=" + id));
        repository.delete(w);
    }

    private BigDecimal sum(List<OtherWithholdingResponse> rows,
                           java.util.function.Function<OtherWithholdingResponse, BigDecimal> f) {
        return rows.stream().map(f).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private YearMonth parseMonth(String month) {
        try {
            return month == null || month.isBlank() ? YearMonth.now() : YearMonth.parse(month);
        } catch (Exception e) {
            throw ApiException.badRequest("귀속월 형식이 잘못되었습니다 (예: 2026-07): " + month);
        }
    }
}
