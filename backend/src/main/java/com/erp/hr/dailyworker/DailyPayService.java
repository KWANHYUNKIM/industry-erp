package com.erp.hr.dailyworker;

import com.erp.common.ApiException;
import com.erp.hr.dailyworker.dto.DailyPayDtos.CalculateResponse;
import com.erp.hr.dailyworker.dto.DailyPayDtos.ConfirmCell;
import com.erp.hr.dailyworker.dto.DailyPayDtos.ConfirmRow;
import com.erp.hr.dailyworker.dto.DailyPayDtos.CreateLedgerRequest;
import com.erp.hr.dailyworker.dto.DailyPayDtos.LedgerResponse;
import com.erp.hr.dailyworker.dto.DailyPayDtos.LineResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 일용근로 급여계산/대장(원본 E020139).
 *
 * <p>2026-10-03 loginaa: 일근무 150,000 인 사원의 근무기록확정 일근무 2 → 전체계산 → 지급총액 300,000 · 소득세 0 · 지방소득세 0 ·
 * 실지급액 300,000. 일용근로소득세는 하루치 (일급 − 150,000) × 6% × (1 − 55%) = 2.7%, 하루 세액 1,000원 미만은 소액부징수 0,
 * 지방소득세는 소득세의 10%(10원 미만 버림). 사원 [급여지급사항]의 월정공제(소득세 · 지방소득세)를 적어 두었으면 그 금액을 쓴다.
 */
@Service
@RequiredArgsConstructor
public class DailyPayService {

    private static final BigDecimal DAILY_DEDUCTION = new BigDecimal("150000");
    private static final BigDecimal EFFECTIVE_RATE = new BigDecimal("0.027");
    private static final BigDecimal MIN_TAX = new BigDecimal("1000");
    private static final BigDecimal LOCAL_RATE = new BigDecimal("0.10");

    private final DailyPayLedgerRepository ledgerRepository;
    private final DailyWorkConfirmRepository confirmRepository;
    private final DailyPayLineRepository lineRepository;
    private final DailyWorkerRepository workerRepository;
    private final DailyWorkEntryRepository entryRepository;

    @Transactional(readOnly = true)
    public List<LedgerResponse> findLedgers() {
        return ledgerRepository.findAllOrdered().stream().map(this::toResponse).toList();
    }

    @Transactional
    public LedgerResponse create(CreateLedgerRequest req) {
        YearMonth ym = YearMonth.parse(req.payMonth());
        int seq = ledgerRepository.maxSeq(req.payMonth()) + 1;
        String paid = req.paidMonth() != null && !req.paidMonth().isBlank() ? req.paidMonth() : req.payMonth();
        LocalDate from = req.periodFrom() != null ? req.periodFrom() : ym.atDay(1);
        LocalDate to = req.periodTo() != null ? req.periodTo() : ym.atEndOfMonth();
        if (to.isBefore(from)) throw ApiException.badRequest("대상기간의 끝이 시작보다 앞섭니다.");
        String name = req.name() != null && !req.name().isBlank() ? req.name().trim()
                : req.payMonth().replace('-', '/') + " " + seq + "차수 (급여)";
        DailyPayLedger l = ledgerRepository.save(DailyPayLedger.builder()
                .payMonth(req.payMonth()).seq(seq).name(name).paidMonth(paid)
                .payDate(req.payDate() != null ? req.payDate() : LocalDate.now())
                .periodFrom(from).periodTo(to).confirmed(false).build());
        return toResponse(l);
    }

    /** 원본 '2026/10 -1 급여가 전체 삭제됩니다. 삭제된 급여는 복구할 수 없습니다.' — 근무기록확정 · 계산 줄도 함께. */
    @Transactional
    public void delete(Long ledgerId) {
        DailyPayLedger l = get(ledgerId);
        lineRepository.deleteByLedger(ledgerId);
        confirmRepository.deleteByLedger(ledgerId);
        ledgerRepository.delete(l);
    }

    @Transactional
    public LedgerResponse toggleConfirm(Long ledgerId) {
        DailyPayLedger l = get(ledgerId);
        l.setConfirmed(!l.isConfirmed());
        return toResponse(l);
    }

    /** 근무기록확정 창 — 일용근로 사원 전부, 저장한 일근무(없으면 0)와 대상기간의 최종근무일. */
    @Transactional(readOnly = true)
    public List<ConfirmRow> confirms(Long ledgerId) {
        DailyPayLedger l = get(ledgerId);
        Map<Long, BigDecimal> saved = new HashMap<>();
        for (DailyWorkConfirm c : confirmRepository.findByLedger(ledgerId)) saved.put(c.getWorker().getId(), c.getDays());
        Map<Long, LocalDate> last = new HashMap<>();
        for (DailyWorkEntry e : entryRepository.findInWorkPeriod(l.getPeriodFrom(), l.getPeriodTo())) {
            last.merge(e.getWorker().getId(), e.getWorkDate(), (a, b) -> a.isAfter(b) ? a : b);
        }
        return workerRepository.findAllWithRefs().stream()
                .map(w -> new ConfirmRow(w.getId(), w.getCode(), w.getName(), last.get(w.getId()),
                        w.getDepartment() != null ? w.getDepartment().getName() : "",
                        saved.getOrDefault(w.getId(), BigDecimal.ZERO)))
                .toList();
    }

    /** 근무기록확정 [근무기록] — 대상기간 근무입력의 근무기록을 사원마다 더해 내놓는다(저장하지 않는다). */
    @Transactional(readOnly = true)
    public List<ConfirmRow> loadFromEntries(Long ledgerId) {
        DailyPayLedger l = get(ledgerId);
        Map<Long, BigDecimal> sum = new HashMap<>();
        Map<Long, LocalDate> last = new HashMap<>();
        for (DailyWorkEntry e : entryRepository.findInWorkPeriod(l.getPeriodFrom(), l.getPeriodTo())) {
            sum.merge(e.getWorker().getId(), e.getQuantity(), BigDecimal::add);
            last.merge(e.getWorker().getId(), e.getWorkDate(), (a, b) -> a.isAfter(b) ? a : b);
        }
        return workerRepository.findAllWithRefs().stream()
                .map(w -> new ConfirmRow(w.getId(), w.getCode(), w.getName(), last.get(w.getId()),
                        w.getDepartment() != null ? w.getDepartment().getName() : "",
                        sum.getOrDefault(w.getId(), BigDecimal.ZERO)))
                .toList();
    }

    @Transactional
    public List<ConfirmRow> saveConfirms(Long ledgerId, List<ConfirmCell> cells) {
        DailyPayLedger l = editable(ledgerId);
        confirmRepository.deleteByLedger(ledgerId);
        confirmRepository.flush();
        for (ConfirmCell c : cells) {
            if (c.days() == null || c.days().signum() == 0) continue;
            DailyWorker w = workerRepository.findById(c.workerId())
                    .orElseThrow(() -> ApiException.notFound("일용근로 사원을 찾을 수 없습니다."));
            confirmRepository.save(DailyWorkConfirm.builder().ledger(l).worker(w).days(c.days()).build());
        }
        return confirms(ledgerId);
    }

    @Transactional
    public void deleteConfirms(Long ledgerId) {
        editable(ledgerId);
        confirmRepository.deleteByLedger(ledgerId);
    }

    /** [전체계산] — '기존 자료를 삭제하고 다시 계산합니다.' 지급총액 0 이하는 넣지 않는다(원본 기본 체크). */
    @Transactional
    public CalculateResponse calculate(Long ledgerId) {
        DailyPayLedger l = editable(ledgerId);
        lineRepository.deleteByLedger(ledgerId);
        lineRepository.flush();
        int done = 0, skipped = 0;
        for (DailyWorkConfirm c : confirmRepository.findByLedger(ledgerId)) {
            DailyWorker w = c.getWorker();
            BigDecimal wage = w.getDailyWage() != null ? w.getDailyWage() : BigDecimal.ZERO;
            BigDecimal gross = wage.multiply(c.getDays()).setScale(0, RoundingMode.DOWN);
            if (gross.signum() <= 0) { skipped++; continue; }
            BigDecimal tax = positive(w.getFixedIncomeTax())
                    ? w.getFixedIncomeTax() : dailyTax(wage).multiply(c.getDays()).setScale(0, RoundingMode.DOWN);
            BigDecimal local = positive(w.getFixedLocalTax())
                    ? w.getFixedLocalTax() : tax.multiply(LOCAL_RATE).divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);
            lineRepository.save(DailyPayLine.builder().ledger(l).worker(w).days(c.getDays())
                    .grossPay(gross).incomeTax(tax).localTax(local).netPay(gross.subtract(tax).subtract(local)).build());
            done++;
        }
        return new CalculateResponse(done, skipped);
    }

    @Transactional(readOnly = true)
    public List<LineResponse> lines(Long ledgerId) {
        get(ledgerId);
        return lineRepository.findByLedger(ledgerId).stream().map(LineResponse::from).toList();
    }

    /** 하루치 일용근로소득세 — (일급 − 15만) × 2.7%, 10원 미만 버림, 1,000원 미만 소액부징수. */
    static BigDecimal dailyTax(BigDecimal wage) {
        BigDecimal taxable = wage.subtract(DAILY_DEDUCTION);
        if (taxable.signum() <= 0) return BigDecimal.ZERO;
        BigDecimal tax = taxable.multiply(EFFECTIVE_RATE).divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);
        return tax.compareTo(MIN_TAX) < 0 ? BigDecimal.ZERO : tax;
    }

    private static boolean positive(BigDecimal v) {
        return v != null && v.signum() > 0;
    }

    private DailyPayLedger editable(Long ledgerId) {
        DailyPayLedger l = get(ledgerId);
        if (l.isConfirmed()) throw ApiException.conflict("확정된 급여대장입니다. 확정을 풀고 다시 하세요.");
        return l;
    }

    private DailyPayLedger get(Long id) {
        return ledgerRepository.findById(id).orElseThrow(() -> ApiException.notFound("급여대장을 찾을 수 없습니다."));
    }

    private LedgerResponse toResponse(DailyPayLedger l) {
        List<DailyPayLine> ls = lineRepository.findByLedger(l.getId());
        return new LedgerResponse(l.getId(), l.getPayMonth(), l.getSeq(), l.getName(), l.getPaidMonth(), l.getPayDate(),
                l.getPeriodFrom(), l.getPeriodTo(), l.isConfirmed(), confirmRepository.countByLedger_Id(l.getId()),
                ls.size(), ls.stream().map(DailyPayLine::getGrossPay).reduce(BigDecimal.ZERO, BigDecimal::add));
    }
}
