package com.erp.accounting.yearend;

import com.erp.accounting.yearend.dto.TaxSettlementDtos.CurrentPay;
import com.erp.accounting.yearend.dto.TaxSettlementDtos.DeductionRequest;
import com.erp.accounting.yearend.dto.TaxSettlementDtos.DeductionResponse;
import com.erp.accounting.yearend.dto.TaxSettlementDtos.PrevEmployerRequest;
import com.erp.accounting.yearend.dto.TaxSettlementDtos.PrevEmployerResponse;
import com.erp.accounting.yearend.dto.TaxSettlementDtos.SettlementResponse;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

/**
 * 연말정산(E030109) · 중도정산(E030114) — 정산 대상자 · 공제 입력 · 계산처리.
 *
 * <p>accounting 은 hr 을 새로 참조하지 않는다: 사원은 id 로만 받고, 주(현)근무지 한 해 급여는 hr 쪽
 * ({@code hr.payroll.YearEndPayService}) 이 확정 급여명세에서 모아 {@link #calculate(Long, CurrentPay)} 로 넣는다(hr → accounting 허용 간선).
 * 검증 문구는 원본 글자 그대로(plans/세무/연말정산.md 1 · 2 · 3.1장).
 */
@Service
@RequiredArgsConstructor
public class TaxSettlementService {

    private final TaxSettlementRepository repository;

    @Transactional(readOnly = true)
    public List<SettlementResponse> list(int attributionYear, TaxSettlementKind kind) {
        return repository.findByAttributionYearAndKindOrderByIdAsc(attributionYear, kind).stream().map(TaxSettlementService::toResponse).toList();
    }

    /** 그 해 · 그 종류에 이미 정산이 있는 사원 — 대상자추가 창에서 뺀다. */
    @Transactional(readOnly = true)
    public java.util.Set<Long> employeeIds(int attributionYear, TaxSettlementKind kind) {
        return repository.findByAttributionYearAndKindOrderByIdAsc(attributionYear, kind).stream()
                .map(TaxSettlement::getEmployeeId).collect(java.util.stream.Collectors.toSet());
    }

    @Transactional(readOnly = true)
    public SettlementResponse find(Long id) {
        return toResponse(get(id));
    }

    /** 대상자추가 [적용(F8)] — 이미 있는 사원은 건너뛴다. */
    @Transactional
    public List<SettlementResponse> addTargets(int attributionYear, TaxSettlementKind kind, Collection<Long> employeeIds) {
        if (employeeIds == null || employeeIds.isEmpty()) throw ApiException.badRequest("등록할 사원이 선택되지 않았습니다.");
        return employeeIds.stream().distinct()
                .filter(e -> repository.findByAttributionYearAndEmployeeIdAndKind(attributionYear, e, kind).isEmpty())
                .map(e -> repository.save(TaxSettlement.of(attributionYear, e, kind)))
                .map(TaxSettlementService::toResponse).toList();
    }

    /** [선택삭제] — 정산 결과 · 종전 · 공제 줄이 같이 사라진다. */
    @Transactional
    public void delete(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) throw ApiException.badRequest("삭제할 사원이 선택되지 않았습니다.");
        repository.deleteAllById(ids);
    }

    /**
     * 퇴사자리스트 [선택삭제] · 퇴직처리 [삭제](퇴사 거둠) — 원본 확인 창 "중도정산한 내역이 삭제 됩니다." 대로
     * 그 사원들의 중도정산을 같이 지운다(hr 이 부른다 — hr → accounting 허용 간선).
     */
    @Transactional
    public void deleteByEmployees(Collection<Long> employeeIds, TaxSettlementKind kind) {
        if (employeeIds == null || employeeIds.isEmpty()) return;
        repository.deleteAll(repository.findByEmployeeIdInAndKind(employeeIds, kind));
    }

    /**
     * 중도정산 원천징수연월(지급연월) 선택 창 [저장(F8)] — YYYY-MM. 원본 안내: 퇴사일자를 귀속연월, 이 달을 지급연월로 하여
     * 신고서에 반영된다(plans/세무/E030114.md 3.1). 연말정산은 이 칸을 쓰지 않는다(원본 계산처리 뒤에도 빈칸).
     */
    @Transactional
    public SettlementResponse saveWithholdingMonth(Long id, String month) {
        TaxSettlement s = get(id);
        if (s.getKind() != TaxSettlementKind.MID_TERM) throw ApiException.badRequest("원천징수연월은 중도정산만 정합니다.");
        if (month == null || !month.matches("\\d{4}-(0[1-9]|1[0-2])")) throw ApiException.badRequest("원천징수연월을 입력 바랍니다.");
        s.setWithholdingMonth(month);
        return toResponse(s);
    }

    /** 종(전)근무지 및 납세조합 [저장(F8)] — 그 정산의 종전 줄을 통째로 바꾼다. */
    @Transactional
    public SettlementResponse savePrevEmployers(Long id, List<PrevEmployerRequest> rows) {
        TaxSettlement s = get(id);
        s.getPrevEmployers().clear();
        int no = 1;
        for (PrevEmployerRequest r : rows == null ? List.<PrevEmployerRequest>of() : rows) {
            if (r.bizNo() == null || r.bizNo().isBlank()) throw ApiException.badRequest("사업자등록번호를 입력하세요.");
            TaxSettlementPrevEmployer p = new TaxSettlementPrevEmployer();
            p.setSettlement(s);
            p.setLineNo(no++);
            p.setBizNo(r.bizNo().trim());
            p.setCompanyName(r.companyName());
            p.setPeriodFrom(r.periodFrom());
            p.setPeriodTo(r.periodTo());
            p.setSalary(n(r.salary()));
            p.setBonus(n(r.bonus()));
            p.setOtherPay(n(r.otherPay()));
            p.setNonTaxable(n(r.nonTaxable()));
            p.setReducedIncome(n(r.reducedIncome()));
            p.setNationalPension(n(r.nationalPension()));
            p.setOtherPension(n(r.otherPension()));
            p.setHealthInsurance(n(r.healthInsurance()));
            p.setEmploymentInsurance(n(r.employmentInsurance()));
            p.setDecidedIncomeTax(n(r.decidedIncomeTax()));
            p.setDecidedLocalTax(n(r.decidedLocalTax()));
            p.setDecidedRuralTax(n(r.decidedRuralTax()));
            s.getPrevEmployers().add(p);
        }
        return toResponse(s);
    }

    /** 보험료 세액공제 · 의료비 창 [저장(F8)] — 그 종류의 줄을 통째로 바꾼다. */
    @Transactional
    public SettlementResponse saveDeductions(Long id, List<TaxDeductionKind> kinds, List<DeductionRequest> rows) {
        TaxSettlement s = get(id);
        s.getDeductions().removeIf(d -> kinds.contains(d.getKind()));
        int no = s.getDeductions().stream().mapToInt(TaxSettlementDeduction::getLineNo).max().orElse(0) + 1;
        for (DeductionRequest r : rows == null ? List.<DeductionRequest>of() : rows) {
            if (r.kind() == null) {
                throw ApiException.badRequest(kinds.contains(TaxDeductionKind.MEDICAL) ? "구분을 입력 바랍니다." : "보험료 구분을 입력 바랍니다.");
            }
            if (!kinds.contains(r.kind())) throw ApiException.badRequest("이 창에서 넣을 수 없는 공제입니다: " + r.kind());
            if (n(r.amount()) < 0) throw ApiException.badRequest("납입금액은 0 이상이어야 합니다.");
            if (r.receiptCount() != null && r.receiptCount() < 0) throw ApiException.badRequest("건수는 0 이상이어야 합니다.");
            TaxSettlementDeduction d = new TaxSettlementDeduction();
            d.setSettlement(s);
            d.setLineNo(no++);
            d.setKind(r.kind());
            d.setTargetName(r.targetName());
            d.setRelation(r.relation());
            d.setDataSource(r.dataSource() == null ? TaxDataSource.NTS : r.dataSource());
            d.setUnlimited(r.unlimited() == null || r.unlimited());
            d.setAmount(n(r.amount()));
            d.setReceiptCount(r.receiptCount());
            s.getDeductions().add(d);
        }
        return toResponse(s);
    }

    /**
     * 계산처리 · [저장/계산처리(F8)] — 주(현) 급여(hr 이 모은 값) + 종(전) + 공제 → 계산기 → 결과 칸.
     * 주(현) 급여가 없으면(원본 QA 사원처럼 종전만) {@link CurrentPay#NONE}.
     */
    @Transactional
    public SettlementResponse calculate(Long id, CurrentPay cur) {
        TaxSettlement s = get(id);
        CurrentPay c = cur == null ? CurrentPay.NONE : cur;
        s.setCurTotalPay(c.totalPay());
        s.setCurNonTaxable(c.nonTaxable());
        s.setCurNationalPension(c.nationalPension());
        s.setCurHealthInsurance(c.healthInsurance());
        s.setCurEmploymentInsurance(c.employmentInsurance());
        s.setCurIncomeTax(c.incomeTax());
        s.setCurLocalTax(c.localTax());

        var r = compute(s);

        s.setTotalSalary(r.totalSalary());
        s.setEarnedIncomeDeduction(r.earnedIncomeDeduction());
        s.setEarnedIncomeAmount(r.earnedIncomeAmount());
        s.setIncomeDeductionTotal(r.incomeDeductionTotal());
        s.setTaxBase(r.taxBase());
        s.setComputedTax(r.computedTax());
        s.setTaxReduction(r.taxReduction());
        s.setTaxCreditTotal(r.taxCreditTotal());
        s.setStandardTaxCredit(r.standardTaxCredit());
        s.setDecidedIncomeTax(r.decidedIncomeTax());
        s.setDecidedLocalTax(r.decidedLocalTax());
        s.setDecidedRuralTax(r.decidedRuralTax());
        s.setPrevIncomeTax(r.prevIncomeTax());
        s.setPrevLocalTax(r.prevLocalTax());
        s.setBalanceIncomeTax(r.balanceIncomeTax());
        s.setBalanceLocalTax(r.balanceLocalTax());
        s.setCalculatedAt(LocalDateTime.now());
        return toResponse(s);
    }

    /** 저장된 입력(주현 cur_* · 종전 · 공제)으로 계산기를 돌린다 — 계산처리 때 결과 칸을, 조회 때 영수증 칸 낱낱을 낸다. */
    private static YearEndTaxCalculator.Result compute(TaxSettlement s) {
        var b = YearEndTaxCalculator.Input.builder()
                .basicDeductionCount(s.getBasicDeductionCount())
                .currentTax(s.getCurIncomeTax(), s.getCurLocalTax());
        long pay = s.getCurTotalPay(), pension = s.getCurNationalPension(), health = s.getCurHealthInsurance(),
                employment = s.getCurEmploymentInsurance();
        long prevTax = 0, prevLocal = 0;
        for (TaxSettlementPrevEmployer p : s.getPrevEmployers()) {
            pay += p.taxablePay();
            pension += p.getNationalPension() + p.getOtherPension();
            health += p.getHealthInsurance();
            employment += p.getEmploymentInsurance();
            prevTax += p.getDecidedIncomeTax();
            prevLocal += p.getDecidedLocalTax();
        }
        long protection = 0, disabled = 0, medSelf = 0, medOther = 0;
        for (TaxSettlementDeduction d : s.getDeductions()) {
            switch (d.getKind()) {
                case PROTECTION_INSURANCE -> protection += d.getAmount();
                case DISABLED_INSURANCE -> disabled += d.getAmount();
                case MEDICAL -> { if (d.isUnlimited()) medSelf += d.getAmount(); else medOther += d.getAmount(); }
            }
        }
        return YearEndTaxCalculator.calculate(b.totalPay(pay).nonTaxable(s.getCurNonTaxable())
                .nationalPension(pension).healthInsurance(health).employmentInsurance(employment)
                .protectionInsurance(protection).disabledInsurance(disabled).medicalSelf(medSelf).medicalOther(medOther)
                .prevTax(prevTax, prevLocal).build());
    }

    private TaxSettlement get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("정산 내역을 찾을 수 없습니다."));
    }

    private static long n(Long v) {
        return v == null ? 0 : v;
    }

    private static SettlementResponse toResponse(TaxSettlement s) {
        return new SettlementResponse(s.getId(), s.getAttributionYear(), s.getEmployeeId(), s.getKind(), s.getWithholdingMonth(),
                s.isStandardAuto(), s.isChildCredit(), s.isSingleRate(), s.getBasicDeductionCount(), s.getMemo(), s.getCalculatedAt(),
                s.getCurTotalPay() + s.getPrevEmployers().stream().mapToLong(TaxSettlementPrevEmployer::taxablePay).sum(),
                s.getTotalSalary(), s.getEarnedIncomeDeduction(), s.getEarnedIncomeAmount(), s.getIncomeDeductionTotal(),
                s.getTaxBase(), s.getComputedTax(), s.getTaxReduction(), s.getTaxCreditTotal(), s.getStandardTaxCredit(),
                s.getDecidedIncomeTax(), s.getDecidedLocalTax(), s.getDecidedRuralTax(),
                s.getPrevIncomeTax(), s.getPrevLocalTax(), s.getCurIncomeTax(), s.getCurLocalTax(),
                s.getBalanceIncomeTax(), s.getBalanceLocalTax(),
                s.getCalculatedAt() == null ? null : compute(s),
                s.getPrevEmployers().stream().map(p -> new PrevEmployerResponse(p.getId(), p.getLineNo(), p.getBizNo(),
                        p.getCompanyName(), p.getPeriodFrom(), p.getPeriodTo(), p.getSalary(), p.getBonus(), p.getOtherPay(),
                        p.taxablePay(), p.getNonTaxable(), p.getReducedIncome(), p.getNationalPension(), p.getOtherPension(),
                        p.getHealthInsurance(), p.getEmploymentInsurance(), p.getDecidedIncomeTax(), p.getDecidedLocalTax(),
                        p.getDecidedRuralTax())).toList(),
                s.getDeductions().stream().map(d -> new DeductionResponse(d.getId(), d.getLineNo(), d.getKind(), d.getTargetName(),
                        d.getRelation(), d.getDataSource(), d.isUnlimited(), d.getAmount(), d.getReceiptCount())).toList());
    }
}
