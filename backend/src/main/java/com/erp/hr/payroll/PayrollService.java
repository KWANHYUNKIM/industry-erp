package com.erp.hr.payroll;

import com.erp.common.ApiException;
import com.erp.hr.employee.Employee;
import com.erp.hr.payroll.dto.PayrollDtos.CreatePayslipRequest;
import com.erp.hr.payroll.dto.PayrollDtos.LineInput;
import com.erp.hr.payroll.dto.PayrollDtos.PayslipResponse;
import com.erp.hr.employee.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.regex.Pattern;
import com.erp.accounting.withholding.WithholdingService;
import com.erp.accounting.withholding.WithholdingTaxCalculator;
import com.erp.hr.payroll.dto.PayrollDtos;

/**
 * 급여관리: 급여명세 생성(4대보험·원천징수 자동공제), 급여대장 조회, 확정.
 *
 * 4대보험 근로자 부담 요율은 2026 기준. 소득세·지방소득세는 WithholdingTaxCalculator 가
 * 간이세액표를 근사해 계산하며, 확정된 명세는 WithholdingService 가 원천징수이행상황신고서로 집계한다.
 * 부양가족이 있어 세액을 조정해야 하면 같은 이름("소득세")의 수동 공제 항목으로 넣는다.
 */
@Service
@RequiredArgsConstructor
public class PayrollService {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-\\d{2}");

    // 근로자 부담 요율은 귀속월마다 다르다 — SocialInsuranceRates(36회차: 2025년 요율을 상수로 박아 2026년에도 썼다).

    private final PayslipRepository payslipRepository;
    private final EmployeeRepository employeeRepository;
    private final PayGroupRepository payGroupRepository;
    private final PayGroupEmployeeRepository payGroupEmployeeRepository;
    private final com.erp.hr.workrecord.WorkRecordService workRecordService;
    private final PaySettingService paySettingService;
    private final WithholdingTaxCalculator taxCalculator;
    private final PayDirectAmountRepository payDirectAmountRepository;
    private final PayFormulaService payFormulaService;

    @Transactional(readOnly = true)
    public List<PayslipResponse> payroll(String month) {
        return payslipRepository.findByPayMonth(month).stream()
                .map(PayslipResponse::from)
                .toList();
    }

    /** 사원별급여조회 — 귀속월 구간의 명세를 귀속월 최신순 · 사원코드순으로. */
    @Transactional(readOnly = true)
    public List<PayslipResponse> payrollBetween(String from, String to) {
        return payslipRepository.findByPayMonthBetween(from, to).stream()
                .map(PayslipResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public PayslipResponse get(Long id) {
        return PayslipResponse.from(getPayslip(id));
    }

    /** 급여명세 생성. 기본급+수당을 과세소득으로 보고 4대보험을 자동 공제한다. */
    @Transactional
    public PayslipResponse create(CreatePayslipRequest req, String username) {
        if (!MONTH.matcher(req.payMonth()).matches()) {
            throw ApiException.badRequest("귀속월 형식이 올바르지 않습니다(YYYY-MM): " + req.payMonth());
        }
        Employee emp = employeeRepository.findById(req.employeeId())
                .orElseThrow(() -> ApiException.notFound("사원을 찾을 수 없습니다. id=" + req.employeeId()));
        if (payslipRepository.existsByEmployee_IdAndPayMonth(emp.getId(), req.payMonth())) {
            throw ApiException.conflict(emp.getName() + "의 " + req.payMonth() + " 급여명세가 이미 있습니다.");
        }

        BigDecimal baseSalary = req.baseSalary() != null ? req.baseSalary() : emp.getBaseSalary();
        Payslip p = Payslip.builder()
                .employee(emp)
                .payMonth(req.payMonth())
                .baseSalary(baseSalary)
                .status(PayslipStatus.DRAFT)
                .remark(req.remark())
                .createdBy(username)
                .build();

        // 1) 수당/공제 그룹 적용 — 직군·직급별로 매달 똑같이 붙는 항목들.
        //    그룹을 고르지 않으면 원본처럼 [적용사원등록]에서 이 사원에게 매어 둔 그룹을 쓰고,
        //    그 [지급율(%)]을 금액에 곱한다.
        PayGroup group = null;
        BigDecimal groupRate = BigDecimal.valueOf(100);
        if (req.payGroupId() != null) {
            group = payGroupRepository.findById(req.payGroupId())
                    .orElseThrow(() -> ApiException.notFound("수당/공제 그룹을 찾을 수 없습니다. id=" + req.payGroupId()));
            if (!group.isActive()) {
                throw ApiException.badRequest("사용중지된 그룹입니다: " + group.getName());
            }
        } else {
            var assigned = payGroupEmployeeRepository.findByEmployeeId(emp.getId()).orElse(null);
            if (assigned != null && assigned.getGroup().isActive()) {
                group = assigned.getGroup();
                groupRate = assigned.getRate();
            }
        }
        if (group != null) {
            for (PayGroupLine gl : group.getLines()) {
                // 변동(시간·일) 항목의 그룹 금액은 단가다 — 아래 근무기록으로 셈하고 여기서는 넣지 않는다
                PayMethod m = gl.getPayItem().getPayMethod();
                if (m == PayMethod.HOURLY || m == PayMethod.DAILY) continue;
                p.addLine(PayslipLine.builder()
                        .kind(gl.getPayItem().getKind())
                        .name(gl.getPayItem().getName())
                        .amount(gl.resolveAmount().multiply(groupRate)
                                .divide(BigDecimal.valueOf(100), 0, java.math.RoundingMode.HALF_UP))
                        .taxable(gl.getPayItem().isTaxable())
                        .auto(false)
                        .build());
            }
        }

        // 1-0) 원본 사원등록 [급여지급사항] — 이 사원에게 넣어 둔 고정수당 · 월정공제 금액이 그룹 금액보다 앞선다.
        //      (원본: 출산보육수당 10,000 넣고 개인별계산 → 지급총액 +10,000, 지우면 되돌아감. 2026-10-12 실측)
        java.util.Map<Long, BigDecimal> empAmounts = paySettingService.employeeAmounts(emp.getId());
        for (var ea : empAmounts.entrySet()) {
            PayItem item = paySettingService.item(ea.getKey());
            if (!item.isActive() || item.getPayMethod() == PayMethod.HOURLY || item.getPayMethod() == PayMethod.DAILY) continue;
            p.getLines().removeIf(l -> l.getKind() == item.getKind() && l.getName().equals(item.getName()));
            if (ea.getValue().signum() == 0) continue;
            p.addLine(PayslipLine.builder()
                    .kind(item.getKind()).name(item.getName()).amount(ea.getValue())
                    .taxable(item.isTaxable()).auto(false).build());
        }
        for (int i = 0; i < p.getLines().size(); i++) p.getLines().get(i).setLineNo(i + 1);

        // 1-1) 변동수당 — 원본 계산식 'R( 야근수당(급여지급사항) * 야근수당(근무기록확정) , 0 )' 처럼
        //      확정 근무기록 × 단가. 단가는 사원 그룹에 그 항목이 있으면 그 금액,
        //      없으면 항목 기본금액이다. 지급유형이 변동(시간) · 변동(일)인 항목만 셈한다.
        //      근무입력을 바로 쓰지 않고 그 귀속월에 [근무기록확정]한 값을 쓴다(원본 '야근수당(근무기록확정)').
        java.util.Map<Long, BigDecimal> worked = workRecordService.confirmedByItem(emp.getId(), req.payMonth());
        for (var e : worked.entrySet()) {
            PayItem item = paySettingService.item(e.getKey());
            if (item.getPayMethod() != PayMethod.HOURLY && item.getPayMethod() != PayMethod.DAILY) continue;
            BigDecimal unit = item.getDefaultAmount();
            if (group != null) {
                for (PayGroupLine gl : group.getLines()) {
                    if (gl.getPayItem().getId().equals(item.getId())) unit = gl.resolveAmount();
                }
            }
            if (empAmounts.containsKey(item.getId())) unit = empAmounts.get(item.getId());   // [급여지급사항] 단가가 앞선다
            BigDecimal amount = unit.multiply(e.getValue()).setScale(0, java.math.RoundingMode.HALF_UP);
            if (amount.signum() == 0) continue;
            p.addLine(PayslipLine.builder()
                    .kind(item.getKind())
                    .name(item.getName())
                    .amount(amount)
                    .taxable(item.isTaxable())
                    .auto(false)
                    .build());
        }

        // 2) 사용자 입력 수당·수동공제 (그룹에 없는 이번 달만의 항목)
        if (req.lines() != null) {
            for (LineInput in : req.lines()) {
                if (in.amount() == null || in.amount().signum() < 0) {
                    throw ApiException.badRequest("금액은 0 이상이어야 합니다: " + in.name());
                }
                p.addLine(PayslipLine.builder()
                        .kind(in.kind()).name(in.name()).amount(in.amount())
                        .taxable(in.taxable() == null || in.taxable())
                        .auto(false).build());
            }
        }

        // 1-2) 원본 수당항목 [계산식] — 귀속월에 걸리는 식이 있는 수당은 그 식의 값이 그 항목 금액이다.
        //      원본 부양가족수당 R( ( 기본급(급여지급사항) * 0.01 * 간이세액표 적용 부양가족수(계산항목) ) ):
        //      기본급 3,800,000 · 본인 1명 → 38,000, 배우자 공제 + 가족 1명 → 114,000(2026-10-13 실측). 식이 없는 항목은 위 셈 그대로.
        applyFormulas(p, emp.getId(), req.payMonth(), baseSalary, group, empAmounts, worked);

        // 2-1) 원본 [사전작업] 금액직접입력 — 그 귀속월에 이 사원에게 손으로 정한 금액이 있으면 그 항목의 셈 대신 쓴다.
        //      기본급 · 수당은 과세소득 셈 전에, 소득세 · 지방소득세는 자동 셈을 막도록 여기서, 4대보험은 자동 셈 뒤에 덮는다.
        List<PayDirectAmount> direct = payDirectAmountRepository.findByPayMonthAndEmployeeId(req.payMonth(), emp.getId());
        for (PayDirectAmount d : direct) {
            if (d.getKind() == PayslipLineKind.ALLOWANCE && "기본급".equals(d.getItemName())) {
                baseSalary = d.getAmount();
                p.setBaseSalary(baseSalary);
            } else if (d.getKind() == PayslipLineKind.ALLOWANCE
                    || WithholdingService.INCOME_TAX.equals(d.getItemName()) || WithholdingService.LOCAL_INCOME_TAX.equals(d.getItemName())) {
                overrideLine(p, d);
            }
        }

        // 3) 4대보험 자동 공제.
        //    과세소득 = 기본급 + '과세' 수당합. 식대 같은 비과세 수당은 여기서 빠진다.
        BigDecimal taxableIncome = baseSalary.add(p.getLines().stream()
                .filter(l -> l.getKind() == PayslipLineKind.ALLOWANCE && l.isTaxable())
                .map(PayslipLine::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add));

        java.time.YearMonth ym = java.time.YearMonth.parse(req.payMonth());
        // 원본 사원등록 [기타설정] — '안함' 이면 그 보험 줄이 없다(0 은 addAutoDeduction 이 넣지 않는다).
        // 국민연금은 기준소득월액이 있으면 급여가 아니라 그 값에 요율(원본 실측: 급여가 바뀌어도 그대로).
        EmployeePayrollSetting setting = paySettingService.payrollSetting(emp.getId());
        // 단일세율(외국인근로자 19 %)이면 비과세 수당도 소득으로 본다 — 원본 실측: 지급총액 4,138,000(식대 100,000 포함)에
        // 소득세 786,220 = × 19 %, 건강 148,760 · 고용 37,240 도 지급총액 기준.
        BigDecimal insuredIncome = setting.isSingleTaxRate() ? grossPay(baseSalary, p) : taxableIncome;
        BigDecimal pensionIncome = setting.getPensionBaseAmount() != null ? setting.getPensionBaseAmount() : insuredIncome;
        BigDecimal pension = setting.getPensionMode() == InsuranceCalc.NONE ? BigDecimal.ZERO
                : round(SocialInsuranceRates.pensionBase(pensionIncome, ym)
                .multiply(SocialInsuranceRates.pension(ym)));        // 기준소득월액 상·하한 안에서
        // '보수월액기준' 은 원본도 급여계산이 셈하지 않는다(실측: 보수월액 3,000,000 을 넣어도 건강보험 칸이 빈다).
        BigDecimal health = setting.getHealthMode() != InsuranceBasis.AUTO ? BigDecimal.ZERO
                : round(insuredIncome.multiply(SocialInsuranceRates.health(ym)));
        BigDecimal care = !setting.isLongTermCare() ? BigDecimal.ZERO
                : round(health.multiply(SocialInsuranceRates.longTermCareOfHealth(ym)));   // 장기요양은 건강보험료 기준
        if (setting.isInsuranceReduction()) {
            // 보험료경감 '대상' — 장기요양만 30 % 경감, 10원 미만 버림을 한 번 더(원본 실측 19,070 × 0.7 = 13,349 → 13,340).
            care = round(care.multiply(new BigDecimal("0.7")));
        }
        BigDecimal employment = setting.getEmploymentMode() != InsuranceBasis.AUTO ? BigDecimal.ZERO
                : round(insuredIncome.multiply(SocialInsuranceRates.employment(ym)));

        addAutoDeduction(p, "국민연금", pension);
        addAutoDeduction(p, "건강보험", health);
        addAutoDeduction(p, "장기요양보험", care);
        addAutoDeduction(p, "고용보험", employment);

        // 3) 원천징수. 손으로 넣은 소득세가 있으면 그 값을 그대로 두고 자동 계산하지 않는다
        //    (부양가족 반영 등 회사가 정한 세액을 서버가 덮어쓰면 안 된다).
        if (!hasDeduction(p, WithholdingService.INCOME_TAX)) {
            BigDecimal incomeTax = setting.isSingleTaxRate()
                    ? round(insuredIncome.multiply(SINGLE_TAX_RATE))
                    : taxCalculator.monthlyIncomeTax(taxableIncome,
                        setting.familyCount(), setting.getChildren(), setting.getTaxScale());
            addAutoDeduction(p, WithholdingService.INCOME_TAX, incomeTax);
        }
        if (!hasDeduction(p, WithholdingService.LOCAL_INCOME_TAX)) {
            BigDecimal incomeTax = sumDeduction(p, WithholdingService.INCOME_TAX);
            addAutoDeduction(p, WithholdingService.LOCAL_INCOME_TAX, taxCalculator.localIncomeTax(incomeTax));
        }

        for (PayDirectAmount d : direct) {
            if (d.getKind() == PayslipLineKind.DEDUCTION
                    && !WithholdingService.INCOME_TAX.equals(d.getItemName()) && !WithholdingService.LOCAL_INCOME_TAX.equals(d.getItemName())) {
                overrideLine(p, d);
            }
        }

        p.recalculate();
        return PayslipResponse.from(payslipRepository.save(p));
    }

    /** 금액직접입력 한 칸 — 같은 이름 줄이 있으면 금액만 바꾸고(여럿이면 하나로), 없으면 줄을 더한다. 0 이면 그 줄을 뺀다. */
    private void overrideLine(Payslip p, PayDirectAmount d) {
        List<PayslipLine> same = p.getLines().stream()
                .filter(l -> l.getKind() == d.getKind() && l.getName().equals(d.getItemName())).toList();
        boolean taxable = same.isEmpty()
                ? d.getKind() == PayslipLineKind.ALLOWANCE && paySettingService.taxableByName(d.getItemName())
                : same.get(0).isTaxable();
        p.getLines().removeAll(same);
        if (d.getAmount().signum() != 0) {
            p.addLine(PayslipLine.builder().kind(d.getKind()).name(d.getItemName()).amount(d.getAmount())
                    .taxable(taxable).auto(false).build());
        }
        for (int i = 0; i < p.getLines().size(); i++) p.getLines().get(i).setLineNo(i + 1);
    }

    @Transactional
    public PayslipResponse confirm(Long id) {
        Payslip p = getPayslip(id);
        if (p.getStatus() == PayslipStatus.CONFIRMED) {
            throw ApiException.badRequest("이미 확정된 급여명세입니다.");
        }
        p.setStatus(PayslipStatus.CONFIRMED);
        return PayslipResponse.from(p);
    }

    /**
     * 원본 [일괄수정] '급여내역수정'(2026-10-12 실측): 칸을 고치면 지급총액 · 공제총액 · 실지급액만 합으로 바뀌고
     * 소득세 · 4대보험은 다시 셈하지 않는다. "금액을 직접 수정할 경우 해당 급여대장에만 적용되며 재계산시
     * 수정내역이 유지되지 않습니다." — 그래서 사원 마스터는 건드리지 않는다. 0 으로 고친 줄은 지운다.
     */
    @Transactional
    public List<PayslipResponse> updateAmounts(List<com.erp.hr.payroll.dto.PayrollDtos.AmountEdit> edits) {
        List<PayslipResponse> out = new java.util.ArrayList<>();
        for (var e : edits) {
            Payslip p = getPayslip(e.payslipId());
            if (p.getStatus() == PayslipStatus.CONFIRMED) {
                throw ApiException.badRequest(p.getEmployee().getName() + "의 급여는 확정되어 수정할 수 없습니다.");
            }
            p.setBaseSalary(e.baseSalary());
            for (var c : e.cells() == null ? List.<com.erp.hr.payroll.dto.PayrollDtos.AmountCell>of() : e.cells()) {
                List<PayslipLine> same = p.getLines().stream()
                        .filter(l -> l.getKind() == c.kind() && l.getName().equals(c.name().trim())).toList();
                if (!same.isEmpty()) {
                    same.get(0).setAmount(c.amount());
                    same.stream().skip(1).forEach(p.getLines()::remove);
                    if (c.amount().signum() == 0) p.getLines().remove(same.get(0));
                } else if (c.amount().signum() != 0) {
                    p.addLine(PayslipLine.builder().kind(c.kind()).name(c.name().trim()).amount(c.amount())
                            .auto(false).taxable(c.kind() == PayslipLineKind.ALLOWANCE).build());
                }
            }
            for (int i = 0; i < p.getLines().size(); i++) p.getLines().get(i).setLineNo(i + 1);
            p.recalculate();
            out.add(PayslipResponse.from(p));
        }
        return out;
    }

    @Transactional
    public void delete(Long id) {
        Payslip p = getPayslip(id);
        if (p.getStatus() == PayslipStatus.CONFIRMED) {
            throw ApiException.badRequest("확정된 급여명세는 삭제할 수 없습니다.");
        }
        payslipRepository.delete(p);
    }

    private boolean hasDeduction(Payslip p, String name) {
        return p.getLines().stream()
                .anyMatch(l -> l.getKind() == PayslipLineKind.DEDUCTION && name.equals(l.getName()));
    }

    private BigDecimal sumDeduction(Payslip p, String name) {
        return p.getLines().stream()
                .filter(l -> l.getKind() == PayslipLineKind.DEDUCTION && name.equals(l.getName()))
                .map(PayslipLine::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private void addAutoDeduction(Payslip p, String name, BigDecimal amount) {
        if (amount.signum() <= 0) return;
        p.addLine(PayslipLine.builder()
                .kind(PayslipLineKind.DEDUCTION).name(name).amount(amount).auto(true).build());
    }

    /** 수당 [계산식] 을 표시순서대로 푼다. 앞 항목의 결과는 뒤 식의 'X(수당)' 으로 쓰인다. */
    private void applyFormulas(Payslip p, Long employeeId, String payMonth, BigDecimal baseSalary, PayGroup group,
                               java.util.Map<Long, BigDecimal> empAmounts, java.util.Map<Long, BigDecimal> worked) {
        java.util.Map<Long, String> formulas = payFormulaService.formulasFor(payMonth);
        if (formulas.isEmpty()) return;
        EmployeePayrollSetting setting = paySettingService.payrollSetting(employeeId);
        java.util.Map<String, BigDecimal> vars = new java.util.HashMap<>();
        vars.put("기본급(급여지급사항)", baseSalary);
        vars.put("기본급(수당)", baseSalary);
        java.util.List<PayItem> items = new java.util.ArrayList<>();
        for (Long id : paySettingService.allItemIds()) {
            PayItem item = paySettingService.item(id);
            if (item.getKind() != PayslipLineKind.ALLOWANCE || "기본급".equals(item.getName())) continue;
            items.add(item);
            BigDecimal unit = empAmounts.get(item.getId());
            if (unit == null && group != null) {
                for (PayGroupLine gl : group.getLines()) {
                    if (gl.getPayItem().getId().equals(item.getId())) unit = gl.resolveAmount();
                }
            }
            if (unit == null && (item.getPayMethod() == PayMethod.HOURLY || item.getPayMethod() == PayMethod.DAILY)) {
                unit = item.getDefaultAmount();   // 변동수당 단가 — 위 1-1 셈과 같다
            }
            vars.put(item.getName() + "(급여지급사항)", unit == null ? BigDecimal.ZERO : unit);
            vars.put(item.getName() + "(근무기록확정)", worked.getOrDefault(item.getId(), BigDecimal.ZERO));
            vars.put(item.getName() + "(수당)", lineAmount(p, item.getName()));
        }
        vars.put("건강보험보수월액(기타설정(사원))", nz(setting.getHealthBaseAmount()));
        vars.put("국민연금기준소득월액(기타설정(사원))", nz(setting.getPensionBaseAmount()));
        vars.put("고용보험보수총액(기타설정(사원))", nz(setting.getEmploymentBaseAmount()));
        vars.put("배우자(기타설정(사원))", setting.isSpouseDeduction() ? BigDecimal.ONE : BigDecimal.ZERO);
        vars.put("공제대상가족수(기타설정(사원))", BigDecimal.valueOf(setting.getDependents()));
        vars.put("20세이하 자녀수(기타설정(사원))", BigDecimal.valueOf(setting.getChildren()));
        vars.put("간이세액표적용방법(기타설정(사원))", BigDecimal.valueOf(setting.getTaxScale()));
        vars.put(PayFormulaService.FAMILY_COUNT, BigDecimal.valueOf(setting.familyCount()));
        items.sort(java.util.Comparator.comparingInt(PayItem::getSortOrder).thenComparing(PayItem::getId));
        for (PayItem item : items) {
            String f = formulas.get(item.getId());
            if (f == null || !item.isActive()) continue;
            BigDecimal amount;
            try {
                amount = PayFormula.evaluate(f, vars).setScale(0, RoundingMode.HALF_UP);
            } catch (IllegalArgumentException | ArithmeticException e) {
                throw ApiException.badRequest("[" + item.getName() + "] " + PayFormula.INVALID);
            }
            p.getLines().removeIf(l -> l.getKind() == PayslipLineKind.ALLOWANCE && l.getName().equals(item.getName()));
            vars.put(item.getName() + "(수당)", amount);
            if (amount.signum() <= 0) continue;
            p.addLine(PayslipLine.builder().kind(PayslipLineKind.ALLOWANCE).name(item.getName()).amount(amount)
                    .taxable(item.isTaxable()).auto(false).build());
        }
        for (int i = 0; i < p.getLines().size(); i++) p.getLines().get(i).setLineNo(i + 1);
    }

    private static BigDecimal lineAmount(Payslip p, String name) {
        return p.getLines().stream().filter(l -> l.getKind() == PayslipLineKind.ALLOWANCE && l.getName().equals(name))
                .map(PayslipLine::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    /** 외국인근로자 단일세율(조세특례제한법 제18조의2) — 원본 [기타설정] 단일세율 */
    private static final BigDecimal SINGLE_TAX_RATE = new BigDecimal("0.19");

    /** 지급총액 — 기본급 + 모든 수당(비과세 포함) */
    private static BigDecimal grossPay(BigDecimal baseSalary, Payslip p) {
        return baseSalary.add(p.getLines().stream()
                .filter(l -> l.getKind() == PayslipLineKind.ALLOWANCE)
                .map(PayslipLine::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    private BigDecimal round(BigDecimal v) {
        /*
         * <b>10원 미만 버림.</b> 주석은 '원 단위 절사' 라 해 놓고 원 단위 반올림을 하고 있었다(QA 66회차) —
         * 장기요양 15,116.26 이 15,116 이 됐다. 4대보험료는 국고금관리법 제47조(10원 미만 끝수 버림)대로
         * 공단 고지액이 10원 단위다. 급여에서 떼는 금액이 고지액과 1~9원씩 어긋나면 매달 차액이 남는다.
         */
        return v.divide(BigDecimal.TEN, 0, RoundingMode.DOWN).multiply(BigDecimal.TEN);
    }

    private Payslip getPayslip(Long id) {
        return payslipRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("급여명세를 찾을 수 없습니다. id=" + id));
    }
}
