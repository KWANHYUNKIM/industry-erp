package com.erp.accounting.retirementpay;

import com.erp.accounting.retirementpay.dto.RetirementPayDtos.Calculation;
import com.erp.accounting.retirementpay.dto.RetirementPayDtos.MonthAmount;
import com.erp.accounting.retirementpay.dto.RetirementPayDtos.RetirementPayRequest;
import com.erp.accounting.retirementpay.dto.RetirementPayDtos.RetirementPayResponse;
import com.erp.common.ApiException;
import com.erp.hr.employee.Employee;
import com.erp.hr.employee.EmployeeService;
import com.erp.hr.payroll.PayrollService;
import com.erp.hr.payroll.PayslipLineKind;
import com.erp.hr.payroll.PayslipStatus;
import com.erp.hr.payroll.dto.PayrollDtos.PayslipResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * 퇴직금계산(E030117). 급여는 hr 의 PayrollService 로 읽는다(확정된 급여명세만).
 *
 * <p>원본 계산내역: 급여 계산기간 = 퇴사 3개월 전 달 ~ 퇴사월(9/10 퇴사 → 2026.06 ~ 2026.09),
 * 상여 계산기간 = 퇴사월 11개월 전 ~ 퇴사월(2025.10 ~ 2026.09). 우리 급여에는 상여 구분이 없어
 * 이름에 '상여' 가 든 수당 줄을 상여로 본다(급여에서 빼고 상여로 옮긴다).
 */
@Service
@RequiredArgsConstructor
public class RetirementPayService {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    private final RetirementPayRepository repository;
    private final EmployeeService employeeService;
    private final PayrollService payrollService;

    @Transactional(readOnly = true)
    public List<RetirementPayResponse> list(LocalDate from, LocalDate to) {
        return repository.findBetween(from, to).stream().map(RetirementPayResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public RetirementPayResponse get(Long id) {
        return RetirementPayResponse.from(find(id));
    }

    /** 저장하지 않고 셈만 한다 — 원본 창에서 칸을 바꿀 때마다 다시 센다. */
    @Transactional(readOnly = true)
    public Calculation calculate(RetirementPayRequest req) {
        validate(req);
        return calc(employeeService.get(req.employeeId()), req);
    }

    @Transactional
    public RetirementPayResponse create(RetirementPayRequest req) {
        validate(req);
        Employee e = employeeService.get(req.employeeId());
        RetirementPay r = RetirementPay.builder().employee(e).build();
        apply(r, req, calc(e, req));
        return RetirementPayResponse.from(repository.save(r));
    }

    @Transactional
    public RetirementPayResponse update(Long id, RetirementPayRequest req) {
        RetirementPay r = find(id);
        RetirementPayRequest fixed = new RetirementPayRequest(r.getEmployee().getId(), req.withholdingMonth(), req.payDate(),
                req.startDate(), req.retireDate(), req.retireReason(), req.executive(), req.extraPay(),
                req.retirementPay(), req.nonTaxable());
        validate(fixed);
        apply(r, fixed, calc(r.getEmployee(), fixed));
        return RetirementPayResponse.from(r);
    }

    @Transactional
    public void delete(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            throw ApiException.badRequest("리스트에 선택된 자료가 없습니다.");
        }
        repository.deleteAllById(ids);
    }

    private void apply(RetirementPay r, RetirementPayRequest req, Calculation c) {
        r.setWithholdingMonth(req.withholdingMonth());
        r.setPayDate(req.payDate());
        r.setStartDate(req.startDate());
        r.setRetireDate(req.retireDate());
        r.setRetireReason(req.retireReason());
        r.setExecutive(Boolean.TRUE.equals(req.executive()));
        r.setWage3m(c.wage3m());
        r.setBonus1y(c.bonus1y());
        r.setExtraPay(c.extraPay());
        r.setWorkDays3m(c.workDays3m());
        r.setServiceDays(c.serviceDays());
        r.setServiceMonths(c.serviceMonths());
        r.setServiceYears(c.serviceYears());
        r.setRetirementPay(c.retirementPay());
        r.setNonTaxable(c.nonTaxable());
        r.setIncomeTax(c.tax().incomeTax());
        r.setLocalIncomeTax(c.tax().localIncomeTax());
    }

    private Calculation calc(Employee e, RetirementPayRequest req) {
        LocalDate retire = req.retireDate();
        YearMonth retireYm = YearMonth.from(retire);
        YearMonth wageFrom = YearMonth.from(retire.minusMonths(3));
        YearMonth bonusFrom = retireYm.minusMonths(11);

        List<MonthAmount> wages = new ArrayList<>();
        List<MonthAmount> bonuses = new ArrayList<>();
        for (YearMonth ym = bonusFrom; !ym.isAfter(retireYm); ym = ym.plusMonths(1)) {
            BigDecimal wage = BigDecimal.ZERO;
            BigDecimal bonus = BigDecimal.ZERO;
            for (PayslipResponse p : payrollService.payroll(ym.toString())) {
                if (!e.getId().equals(p.employeeId()) || p.status() != PayslipStatus.CONFIRMED) continue;
                BigDecimal b = p.lines().stream()
                        .filter(l -> l.kind() == PayslipLineKind.ALLOWANCE && l.name() != null && l.name().contains("상여"))
                        .map(l -> l.amount()).reduce(BigDecimal.ZERO, BigDecimal::add);
                bonus = bonus.add(b);
                wage = wage.add(p.grossPay().subtract(b));
            }
            if (!ym.isBefore(wageFrom)) wages.add(0, new MonthAmount(ym.toString(), wage));
            if (bonus.signum() != 0) bonuses.add(0, new MonthAmount(ym.toString(), bonus));
        }
        BigDecimal wage3m = wages.stream().map(MonthAmount::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal bonus1y = bonuses.stream().map(MonthAmount::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal bonus3m = bonus1y.multiply(BigDecimal.valueOf(3)).divide(BigDecimal.valueOf(12), 0, RoundingMode.DOWN);
        BigDecimal extra = req.extraPay() == null ? BigDecimal.ZERO : req.extraPay();
        BigDecimal total = wage3m.add(bonus3m).add(extra);

        int workDays = RetirementTaxCalculator.workDays3m(retire);
        int serviceDays = RetirementTaxCalculator.serviceDays(req.startDate(), retire);
        BigDecimal daily = workDays > 0 ? total.divide(BigDecimal.valueOf(workDays), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
        BigDecimal computed = RetirementTaxCalculator.retirementPay(total, workDays, serviceDays, retire);
        int months = RetirementTaxCalculator.serviceMonths(req.startDate(), retire);
        int years = RetirementTaxCalculator.serviceYears(months);

        BigDecimal pay = req.retirementPay() != null ? req.retirementPay().setScale(0, RoundingMode.DOWN) : computed;
        BigDecimal nonTaxable = req.nonTaxable() == null ? BigDecimal.ZERO : req.nonTaxable();
        var tax = RetirementTaxCalculator.tax(pay.subtract(nonTaxable), years);

        return new Calculation(wageFrom.toString(), retireYm.toString(), wages, wage3m,
                bonusFrom.toString(), retireYm.toString(), bonuses, bonus1y, bonus3m,
                extra, total, workDays, daily, serviceDays, computed,
                months, years, pay, nonTaxable, tax);
    }

    private static void validate(RetirementPayRequest req) {
        if (req.employeeId() == null) throw ApiException.badRequest("사원을 선택하세요.");
        if (req.startDate() == null || req.retireDate() == null || req.payDate() == null) {
            throw ApiException.badRequest("기산일 · 퇴사일 · 지급일을 입력하세요.");
        }
        if (req.startDate().isAfter(req.retireDate())) {
            throw ApiException.badRequest("기산일이 퇴사일보다 늦습니다.");
        }
        if (req.withholdingMonth() == null || !MONTH.matcher(req.withholdingMonth()).matches()) {
            throw ApiException.badRequest("원천징수연월 형식이 올바르지 않습니다(YYYY-MM): " + req.withholdingMonth());
        }
        if (req.retirementPay() != null && req.retirementPay().signum() < 0) {
            throw ApiException.badRequest("퇴직급여는 0 이상이어야 합니다.");
        }
    }

    private RetirementPay find(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("퇴직금계산 자료를 찾을 수 없습니다: " + id));
    }
}
