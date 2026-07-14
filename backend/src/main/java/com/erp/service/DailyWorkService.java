package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.DailyWorkRecord;
import com.erp.domain.Employee;
import com.erp.dto.DailyWorkDtos.CreateDailyWorkRequest;
import com.erp.dto.DailyWorkDtos.DailyWorkResponse;
import com.erp.dto.DailyWorkDtos.DailyWorkSummary;
import com.erp.dto.DailyWorkDtos.PayRequest;
import com.erp.repository.DailyWorkRecordRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/**
 * 일용근로급여. 일용직은 근무한 날마다 일당을 받으므로 출역 기록 단위로 관리하고,
 * 등록 시점에 일용근로소득세를 계산해 박아 둔다.
 */
@Service
@RequiredArgsConstructor
public class DailyWorkService {

    /** 일 15만원 근로소득공제 */
    private static final BigDecimal DAILY_DEDUCTION = new BigDecimal("150000");
    /** 산출세액 6% × 근로소득세액공제 55% 차감 → 실효 2.7% */
    private static final BigDecimal EFFECTIVE_RATE = new BigDecimal("0.027");
    /** 소액부징수: 결정세액 1,000원 미만은 징수하지 않는다 (일 단위) */
    private static final BigDecimal MIN_TAX = new BigDecimal("1000");
    private static final BigDecimal LOCAL_RATE = new BigDecimal("0.10");

    private final DailyWorkRecordRepository repository;
    private final EmployeeService employeeService;

    @Transactional(readOnly = true)
    public DailyWorkSummary findMonth(String month) {
        YearMonth ym = parseMonth(month);
        List<DailyWorkRecord> records = repository.findBetween(ym.atDay(1), ym.atEndOfMonth());
        List<DailyWorkResponse> rows = records.stream().map(DailyWorkResponse::from).toList();

        return new DailyWorkSummary(
                ym.toString(),
                (int) records.stream().map(r -> r.getEmployee().getId()).distinct().count(),
                records.size(),
                sum(rows, DailyWorkResponse::dailyWage),
                sum(rows, DailyWorkResponse::incomeTax),
                sum(rows, DailyWorkResponse::localIncomeTax),
                sum(rows, DailyWorkResponse::netPay),
                sum(rows.stream().filter(r -> !r.paid()).toList(), DailyWorkResponse::netPay),
                rows);
    }

    @Transactional
    public DailyWorkResponse create(CreateDailyWorkRequest req, String username) {
        Employee e = employeeService.get(req.employeeId());
        if (!e.isActive()) {
            throw ApiException.badRequest("퇴사한 사원은 출역 등록을 할 수 없습니다: " + e.getName());
        }
        if (req.dailyWage().signum() <= 0) {
            throw ApiException.badRequest("일당은 0보다 커야 합니다.");
        }
        if (repository.existsByEmployeeIdAndWorkDate(req.employeeId(), req.workDate())) {
            throw ApiException.conflict(e.getName() + "의 " + req.workDate() + " 출역이 이미 등록되어 있습니다.");
        }
        int hours = req.workHours() != null ? req.workHours() : 8;
        if (hours <= 0 || hours > 24) {
            throw ApiException.badRequest("근무시간은 1~24시간 사이여야 합니다.");
        }

        BigDecimal incomeTax = incomeTax(req.dailyWage());
        BigDecimal localTax = incomeTax.multiply(LOCAL_RATE).setScale(0, RoundingMode.DOWN);

        DailyWorkRecord r = DailyWorkRecord.builder()
                .employee(e)
                .workDate(req.workDate())
                .workHours(hours)
                .dailyWage(req.dailyWage())
                .incomeTax(incomeTax)
                .localIncomeTax(localTax)
                .netPay(req.dailyWage().subtract(incomeTax).subtract(localTax))
                .paid(false)
                .remark(req.remark())
                .createdBy(username)
                .build();
        return DailyWorkResponse.from(repository.save(r));
    }

    /**
     * 일용근로소득세.
     * (일당 − 15만원) × 2.7%. 1,000원 미만은 소액부징수로 0원.
     */
    private BigDecimal incomeTax(BigDecimal dailyWage) {
        BigDecimal taxable = dailyWage.subtract(DAILY_DEDUCTION);
        if (taxable.signum() <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal tax = taxable.multiply(EFFECTIVE_RATE).setScale(0, RoundingMode.DOWN);
        return tax.compareTo(MIN_TAX) < 0 ? BigDecimal.ZERO : tax;
    }

    /** 지급 처리. 이미 지급된 건은 건너뛴다(중복 지급 방지). */
    @Transactional
    public List<DailyWorkResponse> pay(PayRequest req) {
        if (req.ids() == null || req.ids().isEmpty()) {
            throw ApiException.badRequest("지급할 출역 기록을 선택하세요.");
        }
        LocalDate paidDate = req.paidDate() != null ? req.paidDate() : LocalDate.now();
        List<DailyWorkRecord> records = repository.findAllById(req.ids());
        if (records.size() != req.ids().size()) {
            throw ApiException.notFound("존재하지 않는 출역 기록이 있습니다.");
        }
        List<DailyWorkRecord> already = records.stream().filter(DailyWorkRecord::isPaid).toList();
        if (!already.isEmpty()) {
            throw ApiException.conflict("이미 지급된 출역이 " + already.size() + "건 있습니다. 미지급 건만 선택하세요.");
        }
        for (DailyWorkRecord r : records) {
            r.setPaid(true);
            r.setPaidDate(paidDate);
        }
        return records.stream().map(DailyWorkResponse::from).toList();
    }

    /** 지급된 출역은 지울 수 없다. 잘못 지급했다면 회계에서 되돌려야 한다. */
    @Transactional
    public void delete(Long id) {
        DailyWorkRecord r = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("출역 기록을 찾을 수 없습니다. id=" + id));
        if (r.isPaid()) {
            throw ApiException.conflict("이미 지급된 출역은 삭제할 수 없습니다.");
        }
        repository.delete(r);
    }

    private BigDecimal sum(List<DailyWorkResponse> rows, java.util.function.Function<DailyWorkResponse, BigDecimal> f) {
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
