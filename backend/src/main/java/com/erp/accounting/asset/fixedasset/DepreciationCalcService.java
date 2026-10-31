package com.erp.accounting.asset.fixedasset;

import com.erp.accounting.StandardAccounts;
import com.erp.accounting.ledger.account.Account;
import com.erp.accounting.ledger.account.AccountRepository;
import com.erp.accounting.asset.fixedasset.dto.FixedAssetDtos.*;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.interceptor.TransactionAspectSupport;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 감가상각계산 = 기간 묶음(원본 E010616, 2026-10-22 loginaa 실측).
 *
 * <pre>
 * [신규] 회계기수 · 감가상각기간 → [전체계산] 이 사용중 자산 전체의 그 기간 상각을 만들면서 고정자산대장에 바로 반영
 *   (건수 · 총액을 묶음에 적는다) → 감가상각현황 [조회](감가상각상세내역) · [반영내용삭제]
 *   → 반영을 지우면 [조회] · [고정자산대장에반영] · [삭제] → 기타 [전표생성](일반전표 창에 계정별 분개를 채워 연다) · [이력]
 * </pre>
 *
 * 상각 행은 {@code depreciations.calc_id} 로 묶음에 달리고 분개를 만들지 않는다(전표생성이 일반전표로 따로 만든다).
 */
@Service
@RequiredArgsConstructor
public class DepreciationCalcService {

    private final DepreciationCalcRepository calcRepository;
    private final DepreciationRepository depreciationRepository;
    private final FixedAssetMovementRepository movementRepository;
    private final FixedAssetService assetService;
    private final AccountRepository accountRepository;

    @Transactional(readOnly = true)
    public List<CalcResponse> findAll() {
        List<CalcResponse> out = new ArrayList<>();
        for (DepreciationCalc c : calcRepository.findAllNewestFirst()) {
            out.add(toResponse(c, c.isReflected() ? depreciationRepository.findByCalcId(c.getId()) : List.of()));
        }
        return out;
    }

    @Transactional
    public CalcResponse create(CalcRequest req, String username) {
        YearMonth from = parse(req.periodFrom());
        YearMonth to = parse(req.periodTo());
        if (to.isBefore(from)) throw ApiException.badRequest("감가상각기간의 끝이 시작보다 빠릅니다.");
        DepreciationCalc c = calcRepository.save(DepreciationCalc.builder()
                .fiscalTerm(req.fiscalTerm()).periodFrom(from.toString()).periodTo(to.toString())
                .reflected(false).itemCount(0).totalAmount(BigDecimal.ZERO).excludedMonths(0).createdBy(username).build());
        return toResponse(c, List.of());
    }

    /** [전체계산] · [고정자산대장에반영] — 그 기간 상각을 만들어 대장에 반영한다. */
    @Transactional
    public CalcResponse calculate(Long id, String username) {
        DepreciationCalc c = find(id);
        if (c.isReflected()) throw ApiException.conflict("이미 고정자산대장에 반영된 감가상각입니다 — 반영내용삭제 후 다시 하세요.");
        List<Depreciation> rows = run(c, username);
        c.setItemCount((int) rows.stream().map((d) -> d.getAsset().getId()).distinct().count());
        c.setTotalAmount(rows.stream().map(Depreciation::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        c.setExcludedMonths(excluded(c, rows));
        c.setReflected(true);
        return toResponse(c, rows);
    }

    /** 감가상각현황 [반영내용삭제] — 대장에 반영한 상각 행만 지우고 누계액을 되돌린다(건수 · 총액은 남는다). */
    @Transactional
    public CalcResponse unreflect(Long id) {
        DepreciationCalc c = find(id);
        List<Depreciation> rows = depreciationRepository.findByCalcId(id);
        if (!c.isReflected() || rows.isEmpty()) throw ApiException.badRequest("고정자산대장에 반영된 감가상각내역이 없습니다.");
        Map<Long, String> lastPeriod = new LinkedHashMap<>();
        for (Depreciation d : rows) lastPeriod.merge(d.getAsset().getId(), d.getPeriod(), (a, b) -> a.compareTo(b) >= 0 ? a : b);
        for (Depreciation d : rows) {
            FixedAsset a = d.getAsset();
            if (a.getStatus() == AssetStatus.DISPOSED) {
                throw ApiException.conflict(a.getAssetNo() + " " + a.getName() + " 은(는) 처분된 자산입니다 — 처분을 먼저 취소하세요.");
            }
        }
        for (Map.Entry<Long, String> e : lastPeriod.entrySet()) {
            List<String> later = depreciationRepository.findPeriodsByAssetId(e.getKey()).stream()
                    .filter((p) -> p.compareTo(e.getValue()) > 0).sorted().toList();
            if (!later.isEmpty()) {
                throw ApiException.badRequest("뒤 달 " + String.join(", ", later) + " 상각이 있습니다 — 마지막 달부터 취소하세요.");
            }
        }
        for (Depreciation d : rows) {
            FixedAsset a = d.getAsset();
            a.setAccumulatedDepreciation(a.getAccumulatedDepreciation().subtract(d.getAmount()));
            depreciationRepository.delete(d);
        }
        depreciationRepository.flush();
        c.setReflected(false);
        return toResponse(c, List.of());
    }

    /** 감가상각현황 [삭제] — 묶음 통째(반영돼 있으면 그 내용도). */
    @Transactional
    public void delete(Long id) {
        DepreciationCalc c = find(id);
        if (c.isReflected()) unreflect(id);
        calcRepository.delete(c);
    }

    /**
     * 감가상각현황 [조회] — 감가상각상세내역. 반영돼 있으면 그 행으로, 아니면 <b>계산을 돌려 본 뒤 되돌려</b>(롤백) 같은 숫자를 보인다.
     */
    @Transactional
    public List<CalcDetailLine> detail(Long id, String username) {
        DepreciationCalc c = find(id);
        boolean simulate = !c.isReflected();
        List<Depreciation> rows = simulate ? run(c, username) : depreciationRepository.findByCalcId(id);
        List<CalcDetailLine> out = buildDetail(c, rows);
        if (simulate) TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        return out;
    }

    /** 기타 [전표생성] — 반영된 상각을 계정마다 묶어 일반전표 초안으로(대) 감가상각누계액 / 차) 감가상각비). */
    @Transactional(readOnly = true)
    public SlipDraft slipDraft(Long id) {
        find(id);
        List<Depreciation> rows = depreciationRepository.findByCalcId(id);
        if (rows.isEmpty()) throw ApiException.badRequest("고정자산대장에 반영된 감가상각내역이 없습니다.");
        record Key(String assetCode, Account accum, Account expense) {}
        Map<Key, BigDecimal> sums = new LinkedHashMap<>();
        for (Depreciation d : rows.stream().sorted(Comparator.comparing((Depreciation x) -> x.getAsset().getAssetAccount().getCode())
                .thenComparing(Depreciation::getId)).toList()) {
            FixedAsset a = d.getAsset();
            Account accum = a.getAccumAccount() != null ? a.getAccumAccount() : byCode(StandardAccounts.ACCUMULATED_DEPRECIATION);
            Account expense = a.getExpenseAccount() != null ? a.getExpenseAccount() : byCode(StandardAccounts.DEPRECIATION_EXPENSE);
            sums.merge(new Key(a.getAssetAccount().getCode(), accum, expense), d.getAmount(), BigDecimal::add);
        }
        List<SlipDraftLine> lines = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (Map.Entry<Key, BigDecimal> e : sums.entrySet()) {
            Account ac = e.getKey().accum();
            Account ex = e.getKey().expense();
            lines.add(new SlipDraftLine("4대", ac.getId(), ac.getCode(), ac.getName(), BigDecimal.ZERO, e.getValue()));
            lines.add(new SlipDraftLine("3차", ex.getId(), ex.getCode(), ex.getName(), e.getValue(), BigDecimal.ZERO));
            total = total.add(e.getValue());
        }
        return new SlipDraft(LocalDate.now(), lines, total, total);
    }

    /** 기타 [이력] */
    @Transactional(readOnly = true)
    public List<CalcHistoryRow> history(Long id) {
        find(id);
        Map<Long, CalcHistoryRow> by = new LinkedHashMap<>();
        for (Depreciation d : depreciationRepository.findByCalcId(id)) {
            by.putIfAbsent(d.getAsset().getId(), new CalcHistoryRow(d.getAsset().getAssetNo(), d.getAsset().getName(),
                    d.getCreatedBy(), d.getCreatedAt(), "고정자산대장에 반영"));
        }
        return new ArrayList<>(by.values());
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    private List<Depreciation> run(DepreciationCalc c, String username) {
        YearMonth from = YearMonth.parse(c.getPeriodFrom());
        YearMonth to = YearMonth.parse(c.getPeriodTo());
        for (YearMonth ym = from; !ym.isAfter(to); ym = ym.plusMonths(1)) {
            assetService.depreciateMonth(ym, username, c);
        }
        depreciationRepository.flush();
        return depreciationRepository.findByCalcId(c.getId());
    }

    private int excluded(DepreciationCalc c, List<Depreciation> rows) {
        int periodMonths = (int) (YearMonth.parse(c.getPeriodFrom()).until(YearMonth.parse(c.getPeriodTo()), java.time.temporal.ChronoUnit.MONTHS) + 1);
        Map<Long, Long> months = new LinkedHashMap<>();
        for (Depreciation d : rows) months.merge(d.getAsset().getId(), 1L, Long::sum);
        int ex = 0;
        for (long m : months.values()) ex += Math.max(0, periodMonths - (int) m);
        return ex;
    }

    private List<CalcDetailLine> buildDetail(DepreciationCalc c, List<Depreciation> rows) {
        LocalDate fromDate = YearMonth.parse(c.getPeriodFrom()).atDay(1);
        LocalDate toDate = YearMonth.parse(c.getPeriodTo()).atEndOfMonth();
        Map<Long, List<Depreciation>> by = new LinkedHashMap<>();
        for (Depreciation d : rows) by.computeIfAbsent(d.getAsset().getId(), (k) -> new ArrayList<>()).add(d);
        List<CalcDetailLine> out = new ArrayList<>();
        for (List<Depreciation> ds : by.values()) {
            FixedAsset a = ds.get(0).getAsset();
            BigDecimal open = BigDecimal.ZERO;
            BigDecimal change = BigDecimal.ZERO;
            for (FixedAssetMovement m : movementRepository.findByAssetId(a.getId())) {
                BigDecimal signed = m.getKind() == MovementKind.INCREASE ? m.getAmount() : m.getAmount().negate();
                if (m.getSlipDate().isBefore(fromDate)) open = open.add(signed);
                else if (!m.getSlipDate().isAfter(toDate)) change = change.add(signed);
            }
            BigDecimal amount = ds.stream().map(Depreciation::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal prior = depreciationRepository.sumBefore(a.getId(), c.getPeriodFrom());
            BigDecimal close = open.add(change);
            out.add(new CalcDetailLine(a.getAssetAccount().getCode(), a.getAssetAccount().getName(), a.getAssetNo(), a.getName(),
                    a.getAcquisitionDate(), a.getUsefulLifeYears(), ds.size(), open, change, close,
                    prior, close.subtract(prior), amount, prior.add(amount), close.subtract(prior).subtract(amount)));
        }
        out.sort(Comparator.comparing(CalcDetailLine::assetAccountName).thenComparing(CalcDetailLine::assetNo));
        return out;
    }

    private CalcResponse toResponse(DepreciationCalc c, List<Depreciation> rows) {
        String summary = null;
        if (!rows.isEmpty()) {
            List<FixedAsset> assets = rows.stream().map(Depreciation::getAsset).distinct().toList();
            summary = assets.get(0).getName() + (assets.size() > 1 ? " 외 " + (assets.size() - 1) + "건" : "");
        }
        return new CalcResponse(c.getId(), c.getFiscalTerm(), c.getPeriodFrom(), c.getPeriodTo(), c.getItemCount(),
                c.getTotalAmount(), c.isReflected(), c.getExcludedMonths(), summary);
    }

    private DepreciationCalc find(Long id) {
        return calcRepository.findById(id).orElseThrow(() -> ApiException.notFound("감가상각계산을 찾을 수 없습니다. id=" + id));
    }

    private Account byCode(String code) {
        return accountRepository.findByCode(code).orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + code));
    }

    private static YearMonth parse(String s) {
        try {
            return YearMonth.parse(s);
        } catch (DateTimeParseException e) {
            throw ApiException.badRequest("감가상각기간 형식이 올바르지 않습니다(yyyy-MM): " + s);
        }
    }
}
