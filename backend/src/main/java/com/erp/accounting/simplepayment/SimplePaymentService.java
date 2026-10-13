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
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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

    static final String DUPLICATE = "이미 생성된 자료입니다.";
    /** 원본 기타소득 서식 머리: '거주자의 기타소득 간이지급명세서는 소득코드 76(강연료 등), 79(자문료 등)에 해당하는 자료만 제출합니다.' */
    static final Set<String> OTHER_CODES = Set.of("76", "79");

    private final SimplePaymentStatementRepository repository;
    private final OtherWithholdingRepository otherWithholdingRepository;
    private final WithholdingService withholdingService;
    private final ObjectMapper objectMapper;

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
        // 원본 E030116: 같은 자료구분 · 지급연월이 이미 있으면 '이미 생성된 자료입니다.'(2026-10-13, 간이 근로소득 2026 하반기).
        // 지급명세서(일용직) E020146 도 같다(2026-10-14 2026년 10월 두 번째 [저장] 이 막힘).
        if (repository.existsByKindAndPayYearAndPeriod(req.kind(), req.payYear(), req.period())) {
            throw ApiException.badRequest(DUPLICATE);
        }
        SimplePaymentStatement s = SimplePaymentStatement.builder().build();
        apply(s, req);
        snapshot(s);
        return toResponse(repository.save(s));
    }

    @Transactional
    public StatementResponse update(Long id, StatementRequest req) {
        checkPeriod(req);
        SimplePaymentStatement s = find(id);
        // 원본 수정 창은 자료구분 · 지급연월이 잠겨 있다 — 신고일자 · 담당자 · 제출자만 바뀐다(일용직도 같다)
        if ((req.kind() != s.getKind() || !req.payYear().equals(s.getPayYear()) || !req.period().equals(s.getPeriod()))) {
            throw ApiException.badRequest("자료구분 · 지급연월은 바꿀 수 없습니다.");
        }
        if (repository.existsByKindAndPayYearAndPeriodAndIdNot(req.kind(), req.payYear(), req.period(), id)) {
            throw ApiException.badRequest(DUPLICATE);
        }
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
            List<DailyRow> rows = s.getSheetSnapshot() != null ? read(s.getSheetSnapshot(), new TypeReference<List<DailyRow>>() {})
                    : countDaily(s);
            return new SheetResponse(toResponse(s), List.of(), List.of(), rows);
        }
        List<PayeeRow> rows = s.getSheetSnapshot() != null ? read(s.getSheetSnapshot(), new TypeReference<List<PayeeRow>>() {})
                : countPayees(s);
        return new SheetResponse(toResponse(s), List.of(), rows, List.of());
    }

    /**
     * [새로불러오기] — 원본 확인 창 '직접 수정한 사항은 유지되지 않으며, 입력된 자료를 바탕으로 새로 불러옵니다.' 뒤
     * 그 달 기타원천세(일용직은 일용근로 급여대장)를 다시 세어 담아 둔다(다시 열어도 새 숫자). 근로는 늘 새로 센다.
     * 원본 지급명세서(일용직) 2026-10-14: 400,000(2일)로 만든 뒤 대장을 600,000(3일)으로 다시 계산해도 서식 400,000 →
     * [새로불러오기] 뒤 '1 명 1 건 600,000'.
     */
    @Transactional
    public SheetResponse reload(Long id) {
        snapshot(find(id));
        return sheet(id);
    }

    /** 만들 때 · [새로불러오기] 때 서식 숫자를 담아 둔다 — 사업 · 기타소득 · 일용근로. 근로소득은 담지 않는다. */
    private void snapshot(SimplePaymentStatement s) {
        if (isPayee(s.getKind())) s.setSheetSnapshot(write(countPayees(s)));
        else if (s.getKind() == SimplePaymentKind.DAILY) s.setSheetSnapshot(write(countDaily(s)));
    }

    /** 그 지급연월의 일용근로 급여대장을 사람마다 — 원천징수영수증(일용직) 목록과 같은 숫자. */
    private List<DailyRow> countDaily(SimplePaymentStatement s) {
        String month = YearMonth.of(s.getPayYear(), s.getPeriod()).toString();
        return withholdingService.dailyReceipts(month).stream()
                .map(w -> new DailyRow(w.employeeName(), w.days(), w.lastDate(), w.totalPay(), w.incomeTax(), w.localIncomeTax()))
                .toList();
    }

    private static boolean isPayee(SimplePaymentKind kind) {
        return kind == SimplePaymentKind.BUSINESS || kind == SimplePaymentKind.OTHER;
    }

    /**
     * 그 달 기타원천세를 소득자 · 업종(소득)코드마다 한 줄로 — 원본 같은 소득자 · 940909 두 건(1,000,000 + 200,000)은
     * 한 줄 1,200,000. 기타소득은 소득코드 76 · 79 만(62 300,000 은 빠진다).
     */
    private List<PayeeRow> countPayees(SimplePaymentStatement s) {
        YearMonth ym = YearMonth.of(s.getPayYear(), s.getPeriod());
        Map<String, List<OtherWithholding>> byPayee = new LinkedHashMap<>();
        for (OtherWithholding w : otherWithholdingRepository.findBetween(ym.atDay(1), ym.atEndOfMonth())) {
            if (w.getIncomeType() != s.getKind().getIncomeType()) continue;
            if (s.getKind() == SimplePaymentKind.OTHER && !OTHER_CODES.contains(Objects.toString(w.getIncomeCode(), ""))) continue;
            byPayee.computeIfAbsent(w.getPayeeName() + "\u0000" + Objects.toString(w.getPayeeRegNo(), "")
                    + "\u0000" + Objects.toString(w.getIncomeCode(), ""), k -> new ArrayList<>()).add(w);
        }
        List<PayeeRow> rows = new ArrayList<>();
        int rate = s.getKind().getIncomeType().getTaxRate().movePointRight(2).setScale(0, RoundingMode.HALF_UP).intValue();
        byPayee.values().forEach(list -> {
            OtherWithholding first = list.get(0);
            rows.add(new PayeeRow(first.getPayeeName(), first.getPayeeRegNo(), first.getIncomeCode(), list.size(),
                    sum(list, OtherWithholding::getGrossAmount), sum(list, OtherWithholding::getExpenseAmount),
                    sum(list, OtherWithholding::getTaxableAmount), rate,
                    sum(list, OtherWithholding::getIncomeTax), sum(list, OtherWithholding::getLocalIncomeTax)));
        });
        return rows;
    }

    private String write(List<?> rows) {
        try {
            return objectMapper.writeValueAsString(rows);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private <T> List<T> read(String json, TypeReference<List<T>> type) {
        try {
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
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
