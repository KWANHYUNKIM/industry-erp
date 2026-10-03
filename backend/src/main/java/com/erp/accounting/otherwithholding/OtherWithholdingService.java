package com.erp.accounting.otherwithholding;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.partner.BusinessPartner;
import com.erp.accounting.income.IncomeType;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.CreateWithholdingRequest;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.IncomeTypeSummary;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.MonthlySummary;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.OtherWithholdingResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos;
import com.erp.trade.partner.PartnerService;

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
        // 소득세도 10원 미만 버림 — 원본 기타원천세(2026-10-04 실측): 사업소득 1,231,234 × 3% = 36,937 → 36,930,
        // 기타소득 9,950,309 → 소득금액 3,980,124 × 20% = 796,024 → 796,020.
        BigDecimal incomeTax = taxable.multiply(type.getTaxRate()).divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);
        // 지방소득세는 10원 미만 버림(QA 66회차 — 근로소득과 같은 규칙).
        BigDecimal localTax = incomeTax.multiply(LOCAL_RATE).divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);

        OtherWithholding w = OtherWithholding.builder()
                .docNo(docNoGenerator.next("WT-", "other_withholdings", "doc_no", "pay_date", req.payDate()))
                .payDate(req.payDate())
                .attributionMonth(req.attributionMonth() != null && !req.attributionMonth().isBlank()
                        ? req.attributionMonth() : java.time.YearMonth.from(req.payDate()).toString())
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
