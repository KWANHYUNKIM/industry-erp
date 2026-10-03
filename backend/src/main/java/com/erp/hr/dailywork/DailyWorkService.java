package com.erp.hr.dailywork;

import com.erp.hr.employee.EmployeeService;
import com.erp.common.ApiException;
import com.erp.hr.employee.Employee;
import com.erp.hr.dailywork.dto.DailyWorkDtos.CreateDailyWorkRequest;
import com.erp.hr.dailywork.dto.DailyWorkDtos.DailyWorkResponse;
import com.erp.hr.dailywork.dto.DailyWorkDtos.DailyWorkSummary;
import com.erp.hr.dailywork.dto.DailyWorkDtos.PayRequest;
import com.erp.accounting.bankcard.BankCardService;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.journal.JournalService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import com.erp.hr.dailywork.dto.DailyWorkDtos;

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
    private final JournalService journalService;
    private final BankCardService bankCardService;

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
        // 지방소득세는 10원 미만 버림(QA 66회차 — 근로소득과 같은 규칙).
        BigDecimal localTax = incomeTax.multiply(LOCAL_RATE).divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);

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
        // 10원 미만 버림(국고금관리법 제47조 — QA 67회차, 예전엔 원 미만만 버려 1,714 처럼 찍혔다).
        BigDecimal tax = taxable.multiply(EFFECTIVE_RATE).divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);
        return tax.compareTo(MIN_TAX) < 0 ? BigDecimal.ZERO : tax;
    }

    /** 지급 처리. 이미 지급된 건은 건너뛴다(중복 지급 방지). */
    @Transactional
    public List<DailyWorkResponse> pay(PayRequest req, String username) {
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
        BigDecimal wage = records.stream().map(DailyWorkRecord::getDailyWage).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal tax = records.stream().map(r -> r.getIncomeTax().add(r.getLocalIncomeTax()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        String desc = "일용직 지급 " + records.size() + "건";
        // 지급은 장부에 남아야 한다 — 예전엔 '지급됨' 표시만 했다(QA 69회차).
        JournalEntry entry = journalService.createFromDailyWagePay(paidDate, wage, tax, req.bankAccountId(), desc, username);
        if (req.bankAccountId() != null) {
            bankCardService.recordExternal(req.bankAccountId(), false, wage.subtract(tax), paidDate, desc, entry, username);
        }
        for (DailyWorkRecord r : records) {
            r.setPaid(true);
            r.setPaidDate(paidDate);
            r.setJournalEntry(entry);
        }
        return records.stream().map(DailyWorkResponse::from).toList();
    }

    /** 한 달 출역의 합 — 원천징수이행상황신고서의 [일용근로] 줄이 쓴다. */
    public record MonthTotals(int count, BigDecimal wage, BigDecimal incomeTax, BigDecimal localIncomeTax) {}

    /**
     * 그 달(근무일 기준) 출역의 인원·지급액·세액. 신고서가 근로소득(급여명세)만 세고 일용근로를 빼먹어
     * 원천세가 덜 신고됐다(QA 68회차).
     */
    @Transactional(readOnly = true)
    public MonthTotals monthTotals(YearMonth ym) {
        List<DailyWorkRecord> rs = repository.findBetween(ym.atDay(1), ym.atEndOfMonth());
        return new MonthTotals(
                (int) rs.stream().map(r -> r.getEmployee().getId()).distinct().count(),
                rs.stream().map(DailyWorkRecord::getDailyWage).reduce(BigDecimal.ZERO, BigDecimal::add),
                rs.stream().map(DailyWorkRecord::getIncomeTax).reduce(BigDecimal.ZERO, BigDecimal::add),
                rs.stream().map(DailyWorkRecord::getLocalIncomeTax).reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    /** 지급명세서(일용직) 한 사람 — 그 달 근무일수 · 최종근무일 · 지급액 · 세액. */
    public record MonthWorker(String name, int days, java.time.LocalDate lastDate, BigDecimal wage,
                              BigDecimal incomeTax, BigDecimal localIncomeTax) {}

    /** 그 달(근무일 기준) 출역을 사람마다 묶는다 — 지급명세서(일용직)의 ② 소득자 줄. 이름 차례. */
    @Transactional(readOnly = true)
    public List<MonthWorker> monthWorkers(YearMonth ym) {
        java.util.Map<Long, List<DailyWorkRecord>> by = new java.util.LinkedHashMap<>();
        for (DailyWorkRecord r : repository.findBetween(ym.atDay(1), ym.atEndOfMonth())) {
            by.computeIfAbsent(r.getEmployee().getId(), k -> new java.util.ArrayList<>()).add(r);
        }
        return by.values().stream().map(rs -> new MonthWorker(
                        rs.get(0).getEmployee().getName(),
                        (int) rs.stream().map(DailyWorkRecord::getWorkDate).distinct().count(),
                        rs.stream().map(DailyWorkRecord::getWorkDate).max(java.util.Comparator.naturalOrder()).orElse(null),
                        rs.stream().map(DailyWorkRecord::getDailyWage).reduce(BigDecimal.ZERO, BigDecimal::add),
                        rs.stream().map(DailyWorkRecord::getIncomeTax).reduce(BigDecimal.ZERO, BigDecimal::add),
                        rs.stream().map(DailyWorkRecord::getLocalIncomeTax).reduce(BigDecimal.ZERO, BigDecimal::add)))
                .sorted(java.util.Comparator.comparing(MonthWorker::name))
                .toList();
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
