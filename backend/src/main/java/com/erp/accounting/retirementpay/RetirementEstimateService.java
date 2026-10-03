package com.erp.accounting.retirementpay;

import com.erp.accounting.retirementpay.dto.RetirementPayDtos.EstimateRow;
import com.erp.common.ApiException;
import com.erp.hr.employee.EmployeeService;
import com.erp.hr.employee.dto.EmployeeDtos.EmployeeResponse;
import com.erp.hr.payroll.PayrollService;
import com.erp.hr.payroll.dto.PayrollDtos.PayslipResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * 퇴직급여추계액(세무 › 원천징수 › 출력물 E030108, 2026-10-04 loginaa 실측).
 *
 * <p>기준일(연 · 월)에 재직 중인 사원마다 지금 퇴직하면 받을 퇴직급여를 어림한다. 원본 2026/10:
 * 변종호(입사 2019/02/15) 3개월동안급여 14,277,000 · 근속 7년 8월 14일 · 3개월근무일수 92 · 재직일수 2,816 · 퇴직급여 35,917,836,
 * 합계 [30명] 129,210,221.
 * <ul>
 *   <li>3개월 = 기준월 바로 앞 석 달(2026/10 이면 7 · 8 · 9월), 근무일수 = 그 석 달의 날수(92).</li>
 *   <li>재직일수 = 정산시작일 ~ 기준월 말일(양 끝 포함).</li>
 *   <li>퇴직급여 = (3개월 급여 + 1년 상여 × 3/12) ÷ 3개월 근무일수 × 30 × 재직일수 ÷ 365, 원 미만 버림.</li>
 *   <li>근속 년/월/일 = (기준월 다음 달 1일) − 정산시작일, 일이 모자라면 정산시작일이 든 달의 날수를 빌린다
 *       (변종호 2/15 → 11/01: 1 + 28 − 15 = 14일).</li>
 *   <li>1년 미만자는 [1년 미만자 포함]을 켜야 나온다.</li>
 * </ul>
 * 급여는 급여명세의 귀속연월로 센다(원본 [급여반영기준] 기본은 지급일). 정산시작일은 입사일이다(중간정산이 없다).
 */
@Service
@RequiredArgsConstructor
public class RetirementEstimateService {

    private static final String BONUS = "상여";

    private final EmployeeService employeeService;
    private final PayrollService payrollService;

    @Transactional(readOnly = true)
    public List<EstimateRow> estimate(String baseMonth, String employeeCode, Long departmentId, boolean includeUnderOneYear) {
        YearMonth base;
        try {
            base = YearMonth.parse(baseMonth);
        } catch (Exception e) {
            throw ApiException.badRequest("기준일 형식이 올바르지 않습니다(YYYY-MM): " + baseMonth);
        }
        LocalDate end = base.atEndOfMonth();
        YearMonth from3 = base.minusMonths(3), to3 = base.minusMonths(1);
        int threeMonthDays = from3.lengthOfMonth() + from3.plusMonths(1).lengthOfMonth() + to3.lengthOfMonth();

        Map<Long, BigDecimal> pay3 = new HashMap<>(), bonus12 = new HashMap<>();
        for (PayslipResponse p : payrollService.payrollBetween(base.minusMonths(12).toString(), to3.toString())) {
            BigDecimal bonus = p.lines().stream().filter(l -> l.name() != null && l.name().contains(BONUS))
                    .map(l -> l.amount()).reduce(BigDecimal.ZERO, BigDecimal::add);
            bonus12.merge(p.employeeId(), bonus, BigDecimal::add);
            if (p.payMonth().compareTo(from3.toString()) >= 0) {
                pay3.merge(p.employeeId(), p.grossPay().subtract(bonus), BigDecimal::add);
            }
        }

        List<EstimateRow> rows = new ArrayList<>();
        for (EmployeeResponse e : employeeService.findAll()) {
            if (e.hireDate() == null || e.hireDate().isAfter(end)) continue;
            if (employeeCode != null && !employeeCode.isBlank() && !employeeCode.equals(e.code())) continue;
            if (departmentId != null && !departmentId.equals(e.departmentId())) continue;
            LocalDate start = e.hireDate();
            long serviceDays = ChronoUnit.DAYS.between(start, end) + 1;
            if (!includeUnderOneYear && start.plusYears(1).isAfter(end.plusDays(1))) continue;
            int[] ymd = tenure(start, end.plusDays(1));
            BigDecimal p3 = pay3.getOrDefault(e.id(), BigDecimal.ZERO);
            BigDecimal b3 = bonus12.getOrDefault(e.id(), BigDecimal.ZERO).multiply(BigDecimal.valueOf(3))
                    .divide(BigDecimal.valueOf(12), 0, RoundingMode.DOWN);
            BigDecimal amount = p3.add(b3).multiply(BigDecimal.valueOf(30)).multiply(BigDecimal.valueOf(serviceDays))
                    .divide(BigDecimal.valueOf((long) threeMonthDays * 365), 0, RoundingMode.DOWN);
            rows.add(new EstimateRow(e.id(), e.code(), e.name(), start, p3, b3, ymd[0], ymd[1], ymd[2],
                    threeMonthDays, serviceDays, amount));
        }
        rows.sort(Comparator.comparing(EstimateRow::startDate).thenComparing(r -> Objects.toString(r.employeeCode(), "")));
        return rows;
    }

    /** 근속 년/월/일 — to − from, 일이 모자라면 from 이 든 달의 날수를 빌린다(원본 실측). */
    static int[] tenure(LocalDate from, LocalDate to) {
        int y = to.getYear() - from.getYear(), m = to.getMonthValue() - from.getMonthValue(), d = to.getDayOfMonth() - from.getDayOfMonth();
        if (d < 0) { d += from.lengthOfMonth(); m -= 1; }
        if (m < 0) { m += 12; y -= 1; }
        return new int[]{y, m, d};
    }
}
