package com.erp.accounting.otherwithholding;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.partner.BusinessPartner;
import com.erp.accounting.income.IncomeType;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.CreateWithholdingRequest;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.IncomeTypeSummary;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.MonthlySummary;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.OtherWithholdingResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos;
import com.erp.trade.partner.PartnerService;

/**
 * 기타원천세: 근로소득 외의 지급(사업·기타·이자·배당)에 대한 원천징수.
 * 세액은 등록 시점에 계산해 기록에 박아 둔다.
 */
@Service
@RequiredArgsConstructor
public class OtherWithholdingService {

    /** 지방소득세 = 소득세의 10% */
    private static final BigDecimal LOCAL_RATE = new BigDecimal("0.10");
    /** 원본 소득코드 60 — 필요경비 없는 기타소득. */
    private static final String NO_EXPENSE_CODE = "60";
    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final BigDecimal THOUSAND = new BigDecimal("1000");

    private final OtherWithholdingRepository repository;
    private final PartnerService partnerService;
    private final DocumentNoGenerator docNoGenerator;
    private final com.erp.accounting.withholdingpayee.WithholdingPayeeService payeeService;

    @Transactional(readOnly = true)
    public MonthlySummary findMonth(String month) {
        YearMonth ym = parseMonth(month);
        List<OtherWithholding> records = repository.findBetween(ym.atDay(1), ym.atEndOfMonth());
        List<OtherWithholdingResponse> rows = records.stream().map(OtherWithholdingResponse::from).toList();

        List<IncomeTypeSummary> byType = new ArrayList<>();
        for (IncomeType type : IncomeType.values()) {
            List<OtherWithholdingResponse> of = rows.stream().filter(r -> r.incomeType() == type).toList();
            if (of.isEmpty()) continue;
            byType.add(new IncomeTypeSummary(
                    type, type.getDisplayName(), of.size(),
                    sum(of, OtherWithholdingResponse::grossAmount),
                    sum(of, OtherWithholdingResponse::incomeTax),
                    sum(of, OtherWithholdingResponse::localIncomeTax)));
        }

        return new MonthlySummary(
                ym.toString(), rows.size(),
                sum(rows, OtherWithholdingResponse::grossAmount),
                sum(rows, OtherWithholdingResponse::incomeTax),
                sum(rows, OtherWithholdingResponse::localIncomeTax),
                sum(rows, OtherWithholdingResponse::netAmount),
                byType, rows);
    }

    @Transactional
    public OtherWithholdingResponse create(CreateWithholdingRequest req, String username) {
        if (req.grossAmount().signum() <= 0) {
            throw ApiException.badRequest("지급액은 0보다 커야 합니다.");
        }
        BusinessPartner partner = req.partnerId() != null ? partnerService.get(req.partnerId()) : null;

        // 거래처를 고르면 그 상호를, 아니면 직접 적은 이름을 쓴다. 둘 다 없으면 누구에게 줬는지 알 수 없다.
        String payeeName = (req.payeeName() != null && !req.payeeName().isBlank())
                ? req.payeeName().trim()
                : (partner != null ? partner.getName() : null);
        if (payeeName == null) {
            throw ApiException.badRequest("거래처를 선택하거나 지급받는 사람 이름을 입력하세요.");
        }

        IncomeType type = req.incomeType();
        String incomeCode = req.incomeCode() != null && !req.incomeCode().isBlank() ? req.incomeCode().trim() : null;
        // 기타소득만 필요경비 60% 를 인정한다(원 미만 버림 — 원본 1,231,233 → 738,739). 과세대상은 그 나머지.
        // 단 소득코드 60(필요경비 없는 기타소득)은 경비가 없다 — 원본 555,555 → 소득세 111,110.
        BigDecimal expenseRate = type == IncomeType.OTHER && NO_EXPENSE_CODE.equals(incomeCode) ? BigDecimal.ZERO : type.getExpenseRate();
        BigDecimal expense = req.grossAmount().multiply(expenseRate).setScale(0, RoundingMode.DOWN);
        BigDecimal taxable = req.grossAmount().subtract(expense);
        // 소득세도 10원 미만 버림 — 원본 기타원천세(2026-10-04 실측): 사업소득 1,231,234 × 3% = 36,937 → 36,930,
        // 기타소득 9,950,309 → 소득금액 3,980,124 × 20% = 796,024 → 796,020.
        BigDecimal incomeTax = taxable.multiply(type.getTaxRate()).divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);
        // 지방소득세는 10원 미만 버림(QA 66회차 — 근로소득과 같은 규칙).
        BigDecimal localTax = incomeTax.multiply(LOCAL_RATE).divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);

        OtherWithholding w = OtherWithholding.builder()
                .docNo(docNoGenerator.next("WT-", "other_withholdings", "doc_no", "pay_date", req.payDate()))
                .payDate(req.payDate())
                .slipSeq(repository.maxSlipSeq(req.payDate()) + 1)
                .lineNo(1)
                .payMonth(YearMonth.from(req.payDate()).toString())
                .taxRate(type.getTaxRate().movePointRight(2))
                .expenseRate(type == IncomeType.OTHER ? expenseRate.movePointRight(2) : null)
                .attributionMonth(req.attributionMonth() != null && !req.attributionMonth().isBlank()
                        ? req.attributionMonth() : java.time.YearMonth.from(req.payDate()).toString())
                .incomeType(type)
                .partner(partner)
                .payeeName(payeeName)
                .payeeRegNo(req.payeeRegNo() != null && !req.payeeRegNo().isBlank()
                        ? req.payeeRegNo().trim()
                        : (partner != null ? partner.getBizRegNo() : null))
                .incomeCode(incomeCode)
                .grossAmount(req.grossAmount())
                .expenseAmount(expense)
                .taxableAmount(taxable)
                .incomeTax(incomeTax)
                .localIncomeTax(localTax)
                .netAmount(req.grossAmount().subtract(incomeTax).subtract(localTax))
                .description(req.description())
                .createdBy(username)
                .build();
        return OtherWithholdingResponse.from(repository.save(w));
    }

    @Transactional
    public void delete(Long id) {
        OtherWithholding w = repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("원천징수 기록을 찾을 수 없습니다. id=" + id));
        repository.delete(w);
    }

    private BigDecimal sum(List<OtherWithholdingResponse> rows,
                           java.util.function.Function<OtherWithholdingResponse, BigDecimal> f) {
        return rows.stream().map(f).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private YearMonth parseMonth(String month) {
        try {
            return month == null || month.isBlank() ? YearMonth.now() : YearMonth.parse(month);
        } catch (Exception e) {
            throw ApiException.badRequest("귀속월 형식이 잘못되었습니다 (예: 2026-07): " + month);
        }
    }

    // ── 원본 기타원천세입력(E030314) — 전표 한 장 · 여러 줄 ─────────────────────────────

    /** 원본 사업소득 세율 선택지(%) — 3 · 5 · 20. */
    private static final List<BigDecimal> BUSINESS_RATES = List.of(new BigDecimal("3"), new BigDecimal("5"), new BigDecimal("20"));
    /** 원본 기타소득 세율 선택지(%) — 0 · 15 · 20 · 30. */
    private static final List<BigDecimal> OTHER_RATES = List.of(BigDecimal.ZERO, new BigDecimal("15"), new BigDecimal("20"), new BigDecimal("30"));
    /** 원본 필요경비율 선택지(%) — 0 · 60 · 70 · 80 · 90 ('====' 는 안 고른 것). */
    private static final List<BigDecimal> EXPENSE_RATES = List.of(BigDecimal.ZERO, new BigDecimal("60"), new BigDecimal("70"),
            new BigDecimal("80"), new BigDecimal("90"));
    private static final java.time.format.DateTimeFormatter SLIP_DATE = java.time.format.DateTimeFormatter.ofPattern("yyyy/MM/dd");

    @Transactional(readOnly = true)
    public OtherWithholdingDtos.SlipResponse getSlip(java.time.LocalDate payDate, int slipSeq) {
        List<OtherWithholding> lines = repository.findSlip(payDate, slipSeq);
        if (lines.isEmpty()) throw ApiException.notFound("전표를 찾을 수 없습니다. " + slipNo(payDate, slipSeq));
        return toSlip(lines);
    }

    /** 새 전표 — 같은 지급일자의 다음 순번을 매긴다(2025/07/31-1, -2 …). */
    @Transactional
    public OtherWithholdingDtos.SlipResponse createSlip(OtherWithholdingDtos.SlipRequest req, String username) {
        int seq = repository.maxSlipSeq(req.payDate()) + 1;
        return toSlip(saveLines(req, seq, username));
    }

    /** 고치기 — 줄을 통째로 갈아 끼운다. 지급일자를 바꾸면 새 날짜의 다음 순번으로 옮긴다(원본도 전표번호가 바뀐다). */
    @Transactional
    public OtherWithholdingDtos.SlipResponse updateSlip(java.time.LocalDate payDate, int slipSeq,
                                                      OtherWithholdingDtos.SlipRequest req, String username) {
        List<OtherWithholding> old = repository.findSlip(payDate, slipSeq);
        if (old.isEmpty()) throw ApiException.notFound("전표를 찾을 수 없습니다. " + slipNo(payDate, slipSeq));
        repository.deleteAll(old);
        repository.flush();
        int seq = payDate.equals(req.payDate()) ? slipSeq : repository.maxSlipSeq(req.payDate()) + 1;
        return toSlip(saveLines(req, seq, username));
    }

    @Transactional
    public void deleteSlips(List<OtherWithholdingDtos.SlipKey> keys) {
        if (keys == null || keys.isEmpty()) throw ApiException.badRequest("선택된 자료가 없습니다.");
        for (OtherWithholdingDtos.SlipKey k : keys) repository.deleteAll(repository.findSlip(k.payDate(), k.slipSeq()));
    }

    /**
     * 기타원천세조회 — 전표마다 한 줄, 최근 지급일자부터. 소득자가 하나도 없는 전표는 빠진다
     * (원본 2025/04/04 이자배당 전표 · 2026/03/30 사업소득 전표가 현황에만 보이고 조회에는 없다).
     */
    @Transactional(readOnly = true)
    public List<OtherWithholdingDtos.SlipListRow> listSlips(java.time.LocalDate from, java.time.LocalDate to) {
        java.util.Map<String, List<OtherWithholding>> bySlip = new java.util.LinkedHashMap<>();
        for (OtherWithholding w : repository.findLinesBetween(from, to)) {
            bySlip.computeIfAbsent(slipNo(w.getPayDate(), w.getSlipSeq()), k -> new ArrayList<>()).add(w);
        }
        List<OtherWithholdingDtos.SlipListRow> rows = new ArrayList<>();
        bySlip.forEach((no, lines) -> {
            List<OtherWithholding> named = lines.stream().filter(w -> w.getPayeeName() != null).toList();
            if (named.isEmpty()) return;
            OtherWithholding h = lines.get(0);
            String summary = named.get(0).getPayeeName() + (named.size() > 1 ? " 외 " + (named.size() - 1) + "건" : "");
            BigDecimal gross = sumOf(lines, OtherWithholding::getGrossAmount);
            BigDecimal tax = sumOf(lines, OtherWithholding::getIncomeTax).add(sumOf(lines, OtherWithholding::getLocalIncomeTax));
            rows.add(new OtherWithholdingDtos.SlipListRow(no, h.getPayDate(), h.getSlipSeq(), h.getAttributionMonth(), h.getPayMonth(),
                    summary, h.getIncomeType(), slipTypeName(h.getIncomeType()), gross, tax, gross.subtract(tax)));
        });
        java.util.Collections.reverse(rows);
        return rows;
    }

    /** 기타원천세현황 — 지급 줄마다(소득자 없는 줄 포함), 지급일자 · 순번 · 줄 차례. 달 소계는 화면이 붙인다. */
    @Transactional(readOnly = true)
    public List<OtherWithholdingDtos.LineReportRow> lineReport(java.time.LocalDate from, java.time.LocalDate to) {
        return repository.findLinesBetween(from, to).stream()
                .map(w -> new OtherWithholdingDtos.LineReportRow(slipNo(w.getPayDate(), w.getSlipSeq()), w.getPayDate(),
                        w.getSlipSeq(), w.getAttributionMonth(), w.getPayMonth(), w.getPayeeName(), w.getIncomeType(),
                        slipTypeName(w.getIncomeType()),
                        w.getIncomeType() == IncomeType.BUSINESS ? "00" : w.getIncomeCode(),
                        w.getGrossAmount(), w.getTaxableAmount(), w.getTaxRate(),
                        w.getIncomeTax().add(w.getLocalIncomeTax()), w.getDescription()))
                .toList();
    }

    private List<OtherWithholding> saveLines(OtherWithholdingDtos.SlipRequest req, int seq, String username) {
        List<OtherWithholdingDtos.SlipLineRequest> lines = req.lines() == null ? List.of() : req.lines();
        if (lines.isEmpty()) throw ApiException.badRequest("지급총액을 입력바랍니다.");
        List<OtherWithholding> saved = new ArrayList<>();
        int lineNo = 0;
        for (OtherWithholdingDtos.SlipLineRequest l : lines) {
            saved.add(repository.save(line(req, l, seq, ++lineNo, username)));
        }
        return saved;
    }

    private OtherWithholding line(OtherWithholdingDtos.SlipRequest req, OtherWithholdingDtos.SlipLineRequest l,
                                  int seq, int lineNo, String username) {
        String code = l.incomeCode() == null || l.incomeCode().isBlank() ? null : l.incomeCode().trim();
        IncomeType type = req.incomeType();
        // 이자배당소득은 한 소득구분이다 — 소득코드 5x(배당)면 배당소득, 아니면 이자소득으로 센다.
        if (type == IncomeType.INTEREST || type == IncomeType.DIVIDEND) {
            type = code != null && code.startsWith("5") ? IncomeType.DIVIDEND : IncomeType.INTEREST;
        }
        BigDecimal taxRate = l.taxRate();
        BigDecimal expenseRate = null;
        String industryName = null;
        if (type == IncomeType.BUSINESS) {
            if (BUSINESS_RATES.stream().noneMatch(r -> r.compareTo(taxRate) == 0)) throw ApiException.badRequest("세율은 3% · 5% · 20% 중에서 고르세요.");
            if (code != null) {
                String fromTable = com.erp.accounting.WithholdingCodes.industryName(code);
                if (fromTable == null) throw ApiException.badRequest("업종구분코드가 올바르지 않습니다: " + code);
                industryName = l.industryName() != null && !l.industryName().isBlank() ? l.industryName().trim() : fromTable;
            }
        } else if (type == IncomeType.OTHER) {
            if (code != null && com.erp.accounting.WithholdingCodes.otherIncome(code) == null) {
                throw ApiException.badRequest("소득코드가 올바르지 않습니다: " + code);
            }
            if (OTHER_RATES.stream().noneMatch(r -> r.compareTo(taxRate) == 0)) throw ApiException.badRequest("세율은 0% · 15% · 20% · 30% 중에서 고르세요.");
            if (l.expenseRate() == null) throw ApiException.badRequest("필요경비율을 선택바랍니다.");
            if (EXPENSE_RATES.stream().noneMatch(r -> r.compareTo(l.expenseRate()) == 0)) throw ApiException.badRequest("필요경비율은 0% · 60% · 70% · 80% · 90% 중에서 고르세요.");
            expenseRate = l.expenseRate();
        } else if (taxRate.signum() < 0 || taxRate.compareTo(new BigDecimal("100")) > 0) {
            throw ApiException.badRequest("세율이 올바르지 않습니다.");
        }
        com.erp.accounting.withholdingpayee.WithholdingPayee payee = l.payeeId() == null ? null : payeeService.find(l.payeeId());
        BigDecimal gross = l.grossAmount();
        BigDecimal expense = expenseRate == null ? BigDecimal.ZERO
                : gross.multiply(expenseRate).divide(HUNDRED, 0, RoundingMode.DOWN);       // 원본 1,231,233 × 60% = 738,739
        BigDecimal taxable = gross.subtract(expense);
        BigDecimal incomeTax = taxable.multiply(taxRate).divide(THOUSAND, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);   // 10원 미만 버림
        BigDecimal localTax = incomeTax.multiply(LOCAL_RATE).divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);
        return OtherWithholding.builder()
                .docNo(docNoGenerator.next("WT-", "other_withholdings", "doc_no", "pay_date", req.payDate()))
                .payDate(req.payDate()).slipSeq(seq).lineNo(lineNo)
                .attributionMonth(req.attributionMonth()).payMonth(req.payMonth())
                .incomeType(type)
                .payee(payee)
                .payeeName(payee == null ? null : (payee.getTradeName() != null ? payee.getTradeName() : payee.getName()))
                .payeeRegNo(payee == null ? null : (payee.getBizRegNo() != null ? payee.getBizRegNo() : payee.getRegNo()))
                .incomeCode(code).industryName(industryName)
                .expenseRate(expenseRate).taxRate(taxRate)
                .grossAmount(gross).expenseAmount(expense).taxableAmount(taxable)
                .incomeTax(incomeTax).localIncomeTax(localTax)
                .netAmount(gross.subtract(incomeTax).subtract(localTax))
                .description(l.description())
                .createdBy(username)
                .build();
    }

    private OtherWithholdingDtos.SlipResponse toSlip(List<OtherWithholding> lines) {
        OtherWithholding h = lines.get(0);
        List<OtherWithholdingDtos.SlipLineResponse> out = lines.stream().map(w -> new OtherWithholdingDtos.SlipLineResponse(
                w.getId(), w.getLineNo(), w.getPayee() == null ? null : w.getPayee().getId(), w.getPayeeName(),
                w.getPayee() == null ? null : w.getPayee().getKind().getDisplayName().replace(" ", ""),
                w.getIncomeCode(), codeName(w), w.getGrossAmount(), w.getExpenseRate(), w.getExpenseAmount(), w.getTaxableAmount(),
                w.getTaxRate(), w.getIncomeTax(), w.getLocalIncomeTax(), w.getIncomeTax().add(w.getLocalIncomeTax()),
                w.getNetAmount(), w.getDescription())).toList();
        return new OtherWithholdingDtos.SlipResponse(slipNo(h.getPayDate(), h.getSlipSeq()), h.getPayDate(), h.getSlipSeq(),
                h.getAttributionMonth(), h.getPayMonth(), h.getIncomeType(), slipTypeName(h.getIncomeType()), out);
    }

    private static String codeName(OtherWithholding w) {
        if (w.getIncomeType() == IncomeType.BUSINESS) return w.getIncomeCode() == null ? null
                : (w.getIndustryName() != null ? w.getIndustryName() : com.erp.accounting.WithholdingCodes.industryName(w.getIncomeCode()));
        com.erp.accounting.WithholdingCodes.OtherIncomeCode c = com.erp.accounting.WithholdingCodes.otherIncome(w.getIncomeCode());
        return c == null ? null : c.name();
    }

    /** 원본 소득구분 이름 — 이자 · 배당은 한 구분 '이자배당소득'. */
    private static String slipTypeName(IncomeType t) {
        return t == IncomeType.INTEREST || t == IncomeType.DIVIDEND ? "이자배당소득" : t.getDisplayName();
    }

    /** 원본 전표번호 표기 — 2025/07/31-2. */
    public static String slipNo(java.time.LocalDate payDate, int seq) {
        return payDate.format(SLIP_DATE) + "-" + seq;
    }

    private static BigDecimal sumOf(List<OtherWithholding> rows, java.util.function.Function<OtherWithholding, BigDecimal> f) {
        return rows.stream().map(f).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
