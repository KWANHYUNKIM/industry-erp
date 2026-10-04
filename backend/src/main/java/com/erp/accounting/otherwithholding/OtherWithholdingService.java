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
        OtherWithholdingDtos.InterestDetail in = null;
        if (type == IncomeType.INTEREST || type == IncomeType.DIVIDEND) {
            type = code != null && code.startsWith("5") ? IncomeType.DIVIDEND : IncomeType.INTEREST;
            if (code != null && !com.erp.accounting.WithholdingCodes.contains(com.erp.accounting.WithholdingCodes.INTEREST_INCOME, code)) {
                throw ApiException.badRequest("소득코드가 올바르지 않습니다: " + code);
            }
            in = l.interest();
            if (in != null) {
                checkCode(com.erp.accounting.WithholdingCodes.TAXATION, in.taxationCode(), "과세구분코드");
                checkCode(com.erp.accounting.WithholdingCodes.SPECIAL, in.specialCode(), "조세특례코드");
                checkCode(com.erp.accounting.WithholdingCodes.PRODUCT, in.productCode(), "금융상품코드");
                if (in.periodFrom() != null && in.periodTo() != null && in.periodTo().isBefore(in.periodFrom())) {
                    throw ApiException.badRequest("지급대상기간 종료일이 시작일보다 빠릅니다.");
                }
            }
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
        // [소액부징수] — 소득세 1,000원 미만인 기타 · 이자배당 줄(원본 기타 1,000 → 80 → 0, 사업 1,000 → 30 은 그대로).
        // [과세최저한] — 기타소득금액 50,000원 이하(원본 소득금액 400 → 0, 80,000 은 그대로).
        if (l.taxExempt() == TaxExempt.SMALL) {
            if (type == IncomeType.BUSINESS) throw ApiException.badRequest("사업소득은 소액부징수 대상이 아닙니다.");
            if (incomeTax.compareTo(THOUSAND) >= 0) throw ApiException.badRequest("소득세가 1,000원 미만인 줄만 소액부징수할 수 있습니다.");
        } else if (l.taxExempt() == TaxExempt.MIN) {
            if (type != IncomeType.OTHER) throw ApiException.badRequest("과세최저한은 기타소득에만 있습니다.");
            if (taxable.compareTo(new BigDecimal("50000")) > 0) throw ApiException.badRequest("소득금액이 50,000원 이하인 줄만 과세최저한으로 둘 수 있습니다.");
        }
        if (l.taxExempt() != null) {
            incomeTax = BigDecimal.ZERO;
            localTax = BigDecimal.ZERO;
        }
        return OtherWithholding.builder()
                .docNo(docNoGenerator.next("WT-", "other_withholdings", "doc_no", "pay_date", req.payDate()))
                .payDate(req.payDate()).slipSeq(seq).lineNo(lineNo)
                .attributionMonth(req.attributionMonth()).payMonth(req.payMonth())
                .incomeType(type)
                .payee(payee)
                .payeeName(payee == null ? null : (payee.getTradeName() != null ? payee.getTradeName() : payee.getName()))
                .payeeRegNo(payee == null ? null : (payee.getBizRegNo() != null ? payee.getBizRegNo() : payee.getRegNo()))
                .incomeCode(code).industryName(industryName)
                .expenseRate(expenseRate).taxRate(taxRate).taxExempt(l.taxExempt())
                .accountNo(in == null ? null : blankToNull(in.accountNo()))
                .taxationCode(in == null ? null : blankToNull(in.taxationCode()))
                .specialCode(in == null ? null : blankToNull(in.specialCode()))
                .productCode(in == null ? null : blankToNull(in.productCode()))
                .securityCode(in == null ? null : blankToNull(in.securityCode()))
                .bondInterestCode(in == null ? null : blankToNull(in.bondInterestCode()))
                .periodFrom(in == null ? null : in.periodFrom())
                .periodTo(in == null ? null : in.periodTo())
                .interestRate(in == null ? null : in.interestRate())
                .changeKind(in == null ? null : (in.changeKind() == null ? ChangeKind.FIRST : in.changeKind()))
                .changeMonth(in == null ? null : blankToNull(in.changeMonth()))
                .trustIncome(in != null && in.trustIncome())
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
                w.getNetAmount(), w.getDescription(), w.getTaxExempt(),
                w.getIncomeType() == IncomeType.INTEREST || w.getIncomeType() == IncomeType.DIVIDEND
                        ? new OtherWithholdingDtos.InterestDetail(w.getAccountNo(), w.getTaxationCode(), w.getSpecialCode(),
                                w.getProductCode(), w.getSecurityCode(), w.getBondInterestCode(), w.getPeriodFrom(), w.getPeriodTo(),
                                w.getInterestRate(), w.getChangeKind(), w.getChangeMonth(), w.isTrustIncome())
                        : null)).toList();
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

    /**
     * 원천징수영수증(보관용, E030318) — 서식구분(사업 · 이자배당 · 기타)과 귀속연월 from ~ to 의 지급을 소득자마다 묶는다.
     * 원본 2026/01 ~ 10 사업소득: '-'(소득자 없는 줄 27,017,060) · 유강사 1,231,234 · 피아노레슨 888,594, 이름 차례('-' 가 먼저).
     * 소득자 없는 줄의 묶음은 사업소득에서만 나온다 — 원본 기타소득 목록에는 2026/05 소득자 없는 50,000,000 이 없다.
     * 이름은 상호가 아니라 성명(유강사). 업종구분은 그 소득자 줄의 업종구분코드(지급 줄의 코드, 소득자등록 기본값이 아니다).
     */
    @Transactional(readOnly = true)
    public List<OtherWithholdingDtos.ReceiptPayee> receipts(String kind, String from, String to) {
        java.util.Set<IncomeType> types = switch (kind) {
            case "BUSINESS" -> java.util.Set.of(IncomeType.BUSINESS);
            case "OTHER" -> java.util.Set.of(IncomeType.OTHER);
            case "INTEREST" -> java.util.Set.of(IncomeType.INTEREST, IncomeType.DIVIDEND);
            default -> throw ApiException.badRequest("서식구분이 올바르지 않습니다: " + kind);
        };
        YearMonth f = parseMonth(from), t = parseMonth(to);
        java.util.Map<Long, List<OtherWithholding>> byPayee = new java.util.LinkedHashMap<>();
        for (OtherWithholding w : repository.findLinesBetween(java.time.LocalDate.of(2000, 1, 1), java.time.LocalDate.of(2999, 12, 31))) {
            if (!types.contains(w.getIncomeType())) continue;
            if (w.getAttributionMonth().compareTo(f.toString()) < 0 || w.getAttributionMonth().compareTo(t.toString()) > 0) continue;
            if (w.getPayee() == null && !"BUSINESS".equals(kind)) continue;
            byPayee.computeIfAbsent(w.getPayee() == null ? 0L : w.getPayee().getId(), k -> new ArrayList<>()).add(w);
        }
        List<OtherWithholdingDtos.ReceiptPayee> out = new ArrayList<>();
        byPayee.forEach((id, lines) -> {
            com.erp.accounting.withholdingpayee.WithholdingPayee p = lines.get(0).getPayee();
            List<OtherWithholdingDtos.ReceiptLine> rl = lines.stream().map(w -> new OtherWithholdingDtos.ReceiptLine(
                    w.getPayDate(), w.getAttributionMonth(), w.getIncomeCode(), w.getGrossAmount(), w.getExpenseAmount(),
                    w.getTaxableAmount(), w.getTaxRate(), w.getIncomeTax(), w.getLocalIncomeTax(),
                    w.getIncomeTax().add(w.getLocalIncomeTax()))).toList();
            BigDecimal gross = sumOf(lines, OtherWithholding::getGrossAmount);
            BigDecimal tax = sumOf(lines, OtherWithholding::getIncomeTax).add(sumOf(lines, OtherWithholding::getLocalIncomeTax));
            List<String> codes = lines.stream().map(OtherWithholding::getIncomeCode).filter(java.util.Objects::nonNull).distinct().toList();
            out.add(p == null
                    ? new OtherWithholdingDtos.ReceiptPayee(null, null, "", null, null, null, null, false, codes.isEmpty() ? null : codes.get(0),
                            codes, gross, tax, rl)
                    : new OtherWithholdingDtos.ReceiptPayee(p.getId(), p.getRegNo(), p.getName(), p.getTradeName(), p.getBizRegNo(),
                            p.getAddress(), p.getBizAddress(), p.isForeigner(), codes.isEmpty() ? p.getIndustryCode() : codes.get(codes.size() - 1),
                            codes, gross, tax, rl));
        });
        out.sort(java.util.Comparator.comparing(OtherWithholdingDtos.ReceiptPayee::name));
        return out;
    }

    /**
     * 지급명세서(보고용, E030319) — 귀속연도의 지급을 소득자 × 업종구분코드(기타는 소득구분코드) × 지급연도 × 세율로 묶은 연간집계표.
     * 소득자 없는 줄은 뺀다. 원본 2026 사업소득: ④ 2명 · ⑤ 3건 · 3,230,939 · 96,910 · 9,680 · 106,590, 줄은 유강사 940903 2027
     * (2027/01/19 지급 · 2026/12 귀속) · 유강사 940909 2026 · 피아노레슨 940909 2026 — 사업은 이름 · 코드 차례,
     * 기타는 소득구분코드 · 이름 차례(60 최이사 · 76 유강사 · 76 피아노레슨 · 79 유강사).
     */
    @Transactional(readOnly = true)
    public OtherWithholdingDtos.PaymentStatement paymentStatement(String kind, int year) {
        java.util.Set<IncomeType> types = switch (kind) {
            case "BUSINESS" -> java.util.Set.of(IncomeType.BUSINESS);
            case "OTHER" -> java.util.Set.of(IncomeType.OTHER);
            case "INTEREST" -> java.util.Set.of(IncomeType.INTEREST, IncomeType.DIVIDEND);
            default -> throw ApiException.badRequest("서식구분이 올바르지 않습니다: " + kind);
        };
        String prefix = year + "-";
        List<OtherWithholding> lines = repository.findLinesBetween(java.time.LocalDate.of(2000, 1, 1), java.time.LocalDate.of(2999, 12, 31))
                .stream().filter(w -> types.contains(w.getIncomeType()) && w.getPayee() != null
                        && w.getAttributionMonth().startsWith(prefix)).toList();
        java.util.Map<String, List<OtherWithholding>> groups = new java.util.LinkedHashMap<>();
        for (OtherWithholding w : lines) {
            String key = w.getPayee().getId() + "|" + w.getIncomeCode() + "|" + w.getPayDate().getYear() + "|" + w.getTaxRate().stripTrailingZeros();
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(w);
        }
        List<OtherWithholdingDtos.StatementRow> rows = new ArrayList<>();
        groups.values().forEach(g -> {
            OtherWithholding h = g.get(0);
            BigDecimal tax = sumOf(g, OtherWithholding::getIncomeTax), local = sumOf(g, OtherWithholding::getLocalIncomeTax);
            rows.add(new OtherWithholdingDtos.StatementRow(h.getIncomeCode(), h.getPayee().getName(), h.getPayee().getRegNo(),
                    h.getPayee().isForeigner(), h.getPayDate().getYear(), g.size(), sumOf(g, OtherWithholding::getGrossAmount),
                    sumOf(g, OtherWithholding::getExpenseAmount), sumOf(g, OtherWithholding::getTaxableAmount), h.getTaxRate(),
                    tax, local, tax.add(local)));
        });
        java.util.Comparator<OtherWithholdingDtos.StatementRow> byName = java.util.Comparator.comparing(OtherWithholdingDtos.StatementRow::name);
        java.util.Comparator<OtherWithholdingDtos.StatementRow> byCode = java.util.Comparator.comparing(r -> java.util.Objects.toString(r.code(), ""));
        rows.sort("OTHER".equals(kind) ? byCode.thenComparing(byName) : byName.thenComparing(byCode));
        List<OtherWithholding> small = lines.stream().filter(w -> w.getTaxExempt() == TaxExempt.SMALL).toList();
        BigDecimal tax = sumOf(lines, OtherWithholding::getIncomeTax), local = sumOf(lines, OtherWithholding::getLocalIncomeTax);
        return new OtherWithholdingDtos.PaymentStatement(year,
                (int) lines.stream().map(w -> w.getPayee().getId()).distinct().count(), lines.size(),
                sumOf(lines, OtherWithholding::getGrossAmount), sumOf(lines, OtherWithholding::getTaxableAmount),
                tax, local, tax.add(local), small.size(), sumOf(small, OtherWithholding::getGrossAmount), rows);
    }

    private static void checkCode(List<com.erp.accounting.WithholdingCodes.Code> codes, String code, String label) {
        if (code != null && !code.isBlank() && !com.erp.accounting.WithholdingCodes.contains(codes, code.trim())) {
            throw ApiException.badRequest(label + "가 올바르지 않습니다: " + code);
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
