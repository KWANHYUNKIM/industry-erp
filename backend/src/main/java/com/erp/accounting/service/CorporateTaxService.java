package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.accounting.domain.CorporateTaxAdjustment;
import com.erp.accounting.domain.CorporateTaxReturn;
import com.erp.accounting.domain.enums.TaxAdjustmentType;
import com.erp.accounting.domain.enums.TaxReturnStatus;
import com.erp.accounting.dto.CorporateTaxDtos.AddAdjustmentRequest;
import com.erp.accounting.dto.CorporateTaxDtos.CreateReturnRequest;
import com.erp.accounting.dto.CorporateTaxDtos.TaxReturnResponse;
import com.erp.accounting.dto.CorporateTaxDtos.UpdateReturnRequest;
import com.erp.accounting.repository.CorporateTaxReturnRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.dto.CorporateTaxDtos;

/**
 * 법인세. 결산서상 당기순이익(손익계산서)에서 세무조정을 거쳐 과세표준을 내고,
 * 누진세율로 산출세액을 계산한다. 계산 결과는 저장한다 — 세율이 바뀌어도 과거 신고서는 불변.
 */
@Service
@RequiredArgsConstructor
public class CorporateTaxService {

    /** 과세표준 구간과 세율 (2024년 이후 기준). 누진공제 대신 구간별로 쪼개서 곱한다. */
    private static final BigDecimal BRACKET_1 = new BigDecimal("200000000");        // 2억
    private static final BigDecimal BRACKET_2 = new BigDecimal("20000000000");      // 200억
    private static final BigDecimal BRACKET_3 = new BigDecimal("300000000000");     // 3,000억
    private static final BigDecimal RATE_1 = new BigDecimal("0.09");
    private static final BigDecimal RATE_2 = new BigDecimal("0.19");
    private static final BigDecimal RATE_3 = new BigDecimal("0.21");
    private static final BigDecimal RATE_4 = new BigDecimal("0.24");
    /** 법인지방소득세 = 산출세액의 10% */
    private static final BigDecimal LOCAL_RATE = new BigDecimal("0.10");

    private final CorporateTaxReturnRepository returnRepository;
    private final JournalQueryService journalQueryService;

    @Transactional(readOnly = true)
    public List<TaxReturnResponse> findAll() {
        return returnRepository.findAllWithAdjustments().stream()
                .map(TaxReturnResponse::from)
                .toList();
    }

    @Transactional
    public TaxReturnResponse create(CreateReturnRequest req, String username) {
        int year = req.fiscalYear();
        if (returnRepository.existsByFiscalYear(year)) {
            throw ApiException.conflict(year + "년 법인세 신고서가 이미 있습니다.");
        }
        LocalDate from = req.periodFrom() != null ? req.periodFrom() : LocalDate.of(year, 1, 1);
        LocalDate to = req.periodTo() != null ? req.periodTo() : LocalDate.of(year, 12, 31);
        if (to.isBefore(from)) {
            throw ApiException.badRequest("사업연도 종료일이 개시일보다 앞설 수 없습니다.");
        }

        // 결산서상 당기순이익은 손익계산서에서 가져온다 (회계 모듈이 진실의 출처).
        BigDecimal netIncome = journalQueryService.incomeStatement(from, to).netIncome();

        CorporateTaxReturn r = CorporateTaxReturn.builder()
                .fiscalYear(year)
                .periodFrom(from)
                .periodTo(to)
                .status(TaxReturnStatus.DRAFT)
                .netIncome(netIncome)
                .lossCarryforward(nz(req.lossCarryforward()))
                .taxCredit(nz(req.taxCredit()))
                .penaltyTax(nz(req.penaltyTax()))
                .prepaidTax(nz(req.prepaidTax()))
                .remark(req.remark())
                .createdBy(username)
                .build();
        recalculate(r);
        return TaxReturnResponse.from(returnRepository.save(r));
    }

    @Transactional
    public TaxReturnResponse update(Long id, UpdateReturnRequest req) {
        CorporateTaxReturn r = getEditable(id);
        r.setLossCarryforward(nz(req.lossCarryforward()));
        r.setTaxCredit(nz(req.taxCredit()));
        r.setPenaltyTax(nz(req.penaltyTax()));
        r.setPrepaidTax(nz(req.prepaidTax()));
        r.setRemark(req.remark());
        recalculate(r);
        return TaxReturnResponse.from(r);
    }

    /** 결산이 바뀌었을 때 손익계산서에서 당기순이익을 다시 가져온다. */
    @Transactional
    public TaxReturnResponse refreshNetIncome(Long id) {
        CorporateTaxReturn r = getEditable(id);
        r.setNetIncome(journalQueryService.incomeStatement(r.getPeriodFrom(), r.getPeriodTo()).netIncome());
        recalculate(r);
        return TaxReturnResponse.from(r);
    }

    @Transactional
    public TaxReturnResponse addAdjustment(Long id, AddAdjustmentRequest req) {
        CorporateTaxReturn r = getEditable(id);
        if (req.amount().signum() <= 0) {
            throw ApiException.badRequest("조정 금액은 0보다 커야 합니다. 방향은 구분(익금산입/손금산입)으로 정합니다.");
        }
        r.getAdjustments().add(CorporateTaxAdjustment.builder()
                .taxReturn(r)
                .type(req.type())
                .name(req.name().trim())
                .amount(req.amount())
                .remark(req.remark())
                .build());
        recalculate(r);
        return TaxReturnResponse.from(r);
    }

    @Transactional
    public TaxReturnResponse removeAdjustment(Long id, Long adjustmentId) {
        CorporateTaxReturn r = getEditable(id);
        boolean removed = r.getAdjustments().removeIf(a -> a.getId().equals(adjustmentId));
        if (!removed) {
            throw ApiException.notFound("조정 항목을 찾을 수 없습니다. id=" + adjustmentId);
        }
        recalculate(r);
        return TaxReturnResponse.from(r);
    }

    /** 확정. 확정된 신고서는 더 이상 수정하지 않는다. */
    @Transactional
    public TaxReturnResponse confirm(Long id) {
        CorporateTaxReturn r = get(id);
        if (r.getStatus() == TaxReturnStatus.CONFIRMED) {
            throw ApiException.conflict("이미 확정된 신고서입니다: " + r.getFiscalYear() + "년");
        }
        r.setStatus(TaxReturnStatus.CONFIRMED);
        return TaxReturnResponse.from(r);
    }

    @Transactional
    public void delete(Long id) {
        CorporateTaxReturn r = get(id);
        if (r.getStatus() == TaxReturnStatus.CONFIRMED) {
            throw ApiException.conflict("확정된 신고서는 삭제할 수 없습니다.");
        }
        returnRepository.delete(r);
    }

    /**
     * 신고서 전체를 다시 계산한다. 조정·이월결손금·세액공제 어느 하나가 바뀌면
     * 과세표준부터 차감납부세액까지 전부 달라지므로, 부분 갱신을 하지 않는다.
     */
    private void recalculate(CorporateTaxReturn r) {
        BigDecimal additions = sum(r, TaxAdjustmentType.ADD);
        BigDecimal deductions = sum(r, TaxAdjustmentType.DEDUCT);
        r.setAdditions(additions);
        r.setDeductions(deductions);

        BigDecimal income = r.getNetIncome().add(additions).subtract(deductions);
        // 결손이면 이월결손금 공제 여지가 없고 과세표준은 0이다 (음수 세금은 없다).
        BigDecimal taxBase = income.subtract(r.getLossCarryforward()).max(BigDecimal.ZERO);
        r.setTaxBase(taxBase);

        BigDecimal calculated = progressiveTax(taxBase);
        r.setCalculatedTax(calculated);
        r.setLocalIncomeTax(calculated.multiply(LOCAL_RATE).setScale(0, RoundingMode.DOWN));

        // 총부담세액은 음수가 될 수 없다. 세액공제가 산출세액보다 커도 0에서 멈춘다.
        BigDecimal total = calculated.subtract(r.getTaxCredit()).max(BigDecimal.ZERO).add(r.getPenaltyTax());
        r.setTotalTax(total);
        // 기납부세액이 더 많으면 환급(음수)이다 — 이건 그대로 보여줘야 한다.
        r.setPayableTax(total.subtract(r.getPrepaidTax()));
    }

    /** 구간별 누진세율. 2억 9%, 200억 19%, 3,000억 21%, 초과 24%. */
    private BigDecimal progressiveTax(BigDecimal taxBase) {
        if (taxBase.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal tax = BigDecimal.ZERO;
        BigDecimal remaining = taxBase;

        BigDecimal tier1 = remaining.min(BRACKET_1);
        tax = tax.add(tier1.multiply(RATE_1));
        remaining = remaining.subtract(tier1);

        if (remaining.signum() > 0) {
            BigDecimal tier2 = remaining.min(BRACKET_2.subtract(BRACKET_1));
            tax = tax.add(tier2.multiply(RATE_2));
            remaining = remaining.subtract(tier2);
        }
        if (remaining.signum() > 0) {
            BigDecimal tier3 = remaining.min(BRACKET_3.subtract(BRACKET_2));
            tax = tax.add(tier3.multiply(RATE_3));
            remaining = remaining.subtract(tier3);
        }
        if (remaining.signum() > 0) {
            tax = tax.add(remaining.multiply(RATE_4));
        }
        return tax.setScale(0, RoundingMode.DOWN);
    }

    private BigDecimal sum(CorporateTaxReturn r, TaxAdjustmentType type) {
        return r.getAdjustments().stream()
                .filter(a -> a.getType() == type)
                .map(CorporateTaxAdjustment::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private CorporateTaxReturn getEditable(Long id) {
        CorporateTaxReturn r = get(id);
        if (r.getStatus() == TaxReturnStatus.CONFIRMED) {
            throw ApiException.conflict("확정된 신고서는 수정할 수 없습니다: " + r.getFiscalYear() + "년");
        }
        return r;
    }

    private CorporateTaxReturn get(Long id) {
        return returnRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("법인세 신고서를 찾을 수 없습니다. id=" + id));
    }

    private BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
