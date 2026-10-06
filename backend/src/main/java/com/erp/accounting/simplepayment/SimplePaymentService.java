package com.erp.accounting.simplepayment;

import com.erp.accounting.otherwithholding.OtherWithholding;
import com.erp.accounting.otherwithholding.OtherWithholdingRepository;
import com.erp.accounting.simplepayment.dto.SimplePaymentDtos.DailyRow;
import com.erp.accounting.simplepayment.dto.SimplePaymentDtos.LaborRow;
import com.erp.accounting.simplepayment.dto.SimplePaymentDtos.PayeeRow;
import com.erp.accounting.simplepayment.dto.SimplePaymentDtos.SheetResponse;
import com.erp.accounting.simplepayment.dto.SimplePaymentDtos.StatementRequest;
import com.erp.accounting.simplepayment.dto.SimplePaymentDtos.StatementResponse;
import com.erp.accounting.withholding.WithholdingService;
import com.erp.accounting.withholding.dto.WithholdingDtos;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;

/**
 * 간이지급명세서(세무 › 원천징수 E030116, 2026-10-04 loginaa 실측).
 *
 * <p>목록은 지급연도 내림차순, 같은 해에서는 달 내림차순이고 반기(근로소득) 줄은 그해 맨 뒤 —
 * 원본 '2026년 12 - 12월 · 08 · 08(기타) · 01 · 2026년 하반기 (7~12) · 2025년 12 - 12월 …'.
 * [조회] 서식: 근로소득은 반기 여섯 달 동안 확정 급여명세가 있는 사원마다 근무기간과 달별 급여 등(과세),
 * 사업 · 기타소득은 그 달 기타원천세 지급을 소득자마다 묶어 지급건수 · 지급액 · 필요경비 · 소득금액 · 세율 · 세액.
 */
@Service
@RequiredArgsConstructor
public class SimplePaymentService {

    private final SimplePaymentStatementRepository repository;
    private final OtherWithholdingRepository otherWithholdingRepository;
    private final WithholdingService withholdingService;
    private final com.erp.hr.dailywork.DailyWorkService dailyWorkService;

    /** daily 면 지급명세서(일용직)만, 아니면 간이지급명세서(일용 빼고). */
    @Transactional(readOnly = true)
    public List<StatementResponse> list(boolean daily) {
        return repository.findAll().stream()
                .filter(s -> (s.getKind() == SimplePaymentKind.DAILY) == daily)
                .sorted(Comparator.comparing(SimplePaymentStatement::getPayYear).reversed()
                        .thenComparing(s -> s.getKind() == SimplePaymentKind.LABOR)
                        .thenComparing(SimplePaymentStatement::getPeriod, Comparator.reverseOrder())
                        .thenComparing(SimplePaymentStatement::getKind)
                        .thenComparing(SimplePaymentStatement::getId))
                .map(SimplePaymentService::toResponse).toList();
    }

    @Transactional
    public StatementResponse create(StatementRequest req) {
        checkPeriod(req);
        SimplePaymentStatement s = SimplePaymentStatement.builder().build();
        apply(s, req);
        return toResponse(repository.save(s));
    }

    @Transactional
    public StatementResponse update(Long id, StatementRequest req) {
        checkPeriod(req);
        SimplePaymentStatement s = find(id);
        apply(s, req);
        return toResponse(s);
    }

    @Transactional
    public void delete(List<Long> ids) {
        if (ids == null || ids.isEmpty()) throw ApiException.badRequest("선택된 자료가 없습니다.");
        repository.deleteAllById(ids);
    }

    @Transactional(readOnly = true)
    public SheetResponse sheet(Long id) {
        SimplePaymentStatement s = find(id);
        if (s.getKind() == SimplePaymentKind.LABOR) {
            int firstMonth = s.getPeriod() == 1 ? 1 : 7;
            YearMonth from = YearMonth.of(s.getPayYear(), firstMonth), to = from.plusMonths(5);
            List<LaborRow> rows = new ArrayList<>();
            for (WithholdingDtos.LedgerEmployee e : withholdingService.ledger(from.toString(), to.toString())) {
                Map<String, BigDecimal> byMonth = new HashMap<>();
                e.months().forEach(m -> byMonth.put(m.payMonth(), m.taxablePay()));
                List<BigDecimal> monthly = new ArrayList<>();
                for (int i = 0; i < 6; i++) monthly.add(byMonth.get(from.plusMonths(i).toString()));
                LocalDate workFrom = later(e.hireDate(), from.atDay(1));
                LocalDate workTo = e.resignDate() != null && e.resignDate().isBefore(to.atEndOfMonth()) ? e.resignDate() : to.atEndOfMonth();
                rows.add(new LaborRow(e.employeeName(), workFrom, workTo, monthly,
                        monthly.stream().filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add)));
            }
            return new SheetResponse(toResponse(s), rows, List.of(), List.of());
        }
        YearMonth ym = YearMonth.of(s.getPayYear(), s.getPeriod());
        if (s.getKind() == SimplePaymentKind.DAILY) {
            List<DailyRow> rows = dailyWorkService.monthWorkers(ym).stream()
                    .map(w -> new DailyRow(w.name(), w.days(), w.lastDate(), w.wage(), w.incomeTax(), w.localIncomeTax()))
                    .toList();
            return new SheetResponse(toResponse(s), List.of(), List.of(), rows);
        }
        Map<String, List<OtherWithholding>> byPayee = new LinkedHashMap<>();
        for (OtherWithholding w : otherWithholdingRepository.findBetween(ym.atDay(1), ym.atEndOfMonth())) {
            if (w.getIncomeType() != s.getKind().getIncomeType()) continue;
            byPayee.computeIfAbsent(w.getPayeeName() + "\u0000" + Objects.toString(w.getPayeeRegNo(), ""), k -> new ArrayList<>()).add(w);
        }
        List<PayeeRow> rows = new ArrayList<>();
        int rate = s.getKind().getIncomeType().getTaxRate().movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValue();
        byPayee.values().forEach(list -> {
            OtherWithholding first = list.get(0);
            rows.add(new PayeeRow(first.getPayeeName(), first.getPayeeRegNo(), list.size(),
                    sum(list, OtherWithholding::getGrossAmount), sum(list, OtherWithholding::getExpenseAmount),
                    sum(list, OtherWithholding::getTaxableAmount), rate,
                    sum(list, OtherWithholding::getIncomeTax), sum(list, OtherWithholding::getLocalIncomeTax)));
        });
        return new SheetResponse(toResponse(s), List.of(), rows, List.of());
    }

    private static BigDecimal sum(List<OtherWithholding> list, java.util.function.Function<OtherWithholding, BigDecimal> f) {
        return list.stream().map(f).filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static LocalDate later(LocalDate a, LocalDate b) {
        return a != null && a.isAfter(b) ? a : b;
    }

    private static void checkPeriod(StatementRequest req) {
        int max = req.kind() == SimplePaymentKind.LABOR ? 2 : 12;
        if (req.period() < 1 || req.period() > max) throw ApiException.badRequest("지급연월이 올바르지 않습니다.");
    }

    private static void apply(SimplePaymentStatement s, StatementRequest req) {
        s.setKind(req.kind());
        s.setPayYear(req.payYear());
        s.setPeriod(req.period());
        s.setReportDate(req.reportDate());
        s.setManagerDept(req.managerDept().trim());
        s.setManagerName(req.managerName().trim());
        s.setManagerPhone(req.managerPhone().trim());
        s.setSubmitter(req.submitter());
    }

    private SimplePaymentStatement find(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("간이지급명세서를 찾을 수 없습니다: " + id));
    }

    private static StatementResponse toResponse(SimplePaymentStatement s) {
        return new StatementResponse(s.getId(), s.getKind(), s.getKind().getDisplayName(), s.getPayYear(), s.getPeriod(),
                s.getReportDate(), s.getManagerDept(), s.getManagerName(), s.getManagerPhone(),
                s.getSubmitter(), s.getSubmitter().getDisplayName());
    }
}
