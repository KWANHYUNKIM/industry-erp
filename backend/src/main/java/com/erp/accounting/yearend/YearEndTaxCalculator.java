package com.erp.accounting.yearend;

/**
 * 연말정산 · 중도정산 근로소득세 셈 — 귀속 2025 세법. 상태가 없는 순수 함수만 둔다(다른 모듈을 모른다).
 *
 * <p>원본 정산공제항목 입력(E030109 · E030114 같은 서식) 2026-10-13 loginaa 실측 세 사례로 맞췄다
 * (plans/세무/연말정산.md 4장 — 시험 YearEndTaxCalculatorTest):
 * <ul>
 *   <li>A 총급여 4천만 · 국민연금 1,800,000 · 건강 1,418,000 · 고용 360,000 · 종전 결정 1,500,000/150,000 → 결정 1,606,800 · 차감 106,800</li>
 *   <li>B 총급여 6천만 · 국민연금 2,700,000 · 건강/고용 없음 · 종전 3,000,000/300,000 → 표준세액공제 130,000 · 결정 4,407,500 · 차감 1,407,500</li>
 *   <li>C B + 보장성 1,200,000 · 의료비 5,000,000 → 특별세액공제 600,000 · 결정 3,937,500/393,750 · 차감 937,500/93,750</li>
 * </ul>
 *
 * <p><b>표준세액공제 vs 특별공제</b>: 원본 계산설정 '표준세액공제 자동계산' 은 둘 중 세금이 적은 쪽을 고른다.
 * 표준(13만)을 고르면 특별소득공제(건강 · 고용 · 주택자금) · 특별세액공제(보험료 · 의료비 · 교육비 · 기부금) · 월세는 빠진다
 * (B 에 보장성 1,200,000 만 넣으면 공제 120,000 < 130,000 이라 보험료 칸이 비고 표준 130,000 이 남는다 — 원본 실측).
 *
 * <p>못 잰 것(원본에 자료가 없어 법 조문대로만 둠): 자녀세액공제 · 추가공제 · 세액감면 · 난임/미숙아 의료비율 · 의료비 기타 한도.
 * 금액은 원 단위 long. 차감징수세액은 10원 미만 버림(음수 = 환급).
 */
public final class YearEndTaxCalculator {

    private YearEndTaxCalculator() {}

    public static final long BASIC_DEDUCTION_PER_PERSON = 1_500_000;
    public static final long STANDARD_TAX_CREDIT = 130_000;
    public static final long INSURANCE_BASE_LIMIT = 1_000_000;
    public static final long MEDICAL_OTHER_LIMIT = 7_000_000;

    /** 정산 입력 — 한 사람 한 해(종전 근무지를 더한 값). 기본 부양 인원은 본인 1. */
    public record Input(
            long totalPay,                 // 지급총액(주현 + 종전, 비과세 포함)
            long nonTaxable,               // 한도 안의 비과세(감면 포함) — 총급여에서 뺀다
            int basicDeductionCount,       // 기본공제 인원(본인 포함)
            long additionalDeduction,      // 추가공제(경로 · 장애인 · 부녀자 · 한부모) 금액
            long nationalPension,          // 연금보험료(국민연금 + 기타연금)
            long healthInsurance,          // 건강보험료(장기요양 포함)
            long employmentInsurance,      // 고용보험료
            long housingDeduction,         // 주택자금 소득공제(특별소득공제)
            long otherIncomeDeduction,     // 그 밖의 소득공제(신용카드 · 개인연금저축 …)
            long taxReduction,             // 세액감면
            int childCount,                // 자녀세액공제 대상 자녀 수(8세 이상)
            long otherTaxCredit,           // 표준과 상관없는 세액공제(연금계좌 · 혼인 · 납세조합 …)
            long protectionInsurance,      // 보장성보험료 납입액
            long disabledInsurance,        // 장애인 전용 보장성보험료 납입액
            long medicalSelf,              // 의료비 — 본인 · 65세 이상 · 장애인 · 6세 이하(한도 없음)
            long medicalOther,             // 의료비 — 그 밖의 부양가족(한도 700만)
            long otherSpecialTaxCredit,    // 교육비 · 기부금 · 월세 세액공제액(표준을 고르면 빠진다)
            long prevIncomeTax, long prevLocalTax,       // 기납부 — 종(전)근무지 결정세액
            long currentIncomeTax, long currentLocalTax  // 기납부 — 주(현)근무지 원천징수
    ) {
        public static Builder builder() { return new Builder(); }
    }

    public static final class Builder {
        private long totalPay, nonTaxable, additionalDeduction, nationalPension, healthInsurance, employmentInsurance,
                housingDeduction, otherIncomeDeduction, taxReduction, otherTaxCredit, protectionInsurance,
                disabledInsurance, medicalSelf, medicalOther, otherSpecialTaxCredit,
                prevIncomeTax, prevLocalTax, currentIncomeTax, currentLocalTax;
        private int basicDeductionCount = 1, childCount;

        public Builder totalPay(long v) { totalPay = v; return this; }
        public Builder nonTaxable(long v) { nonTaxable = v; return this; }
        public Builder basicDeductionCount(int v) { basicDeductionCount = v; return this; }
        public Builder additionalDeduction(long v) { additionalDeduction = v; return this; }
        public Builder nationalPension(long v) { nationalPension = v; return this; }
        public Builder healthInsurance(long v) { healthInsurance = v; return this; }
        public Builder employmentInsurance(long v) { employmentInsurance = v; return this; }
        public Builder housingDeduction(long v) { housingDeduction = v; return this; }
        public Builder otherIncomeDeduction(long v) { otherIncomeDeduction = v; return this; }
        public Builder taxReduction(long v) { taxReduction = v; return this; }
        public Builder childCount(int v) { childCount = v; return this; }
        public Builder otherTaxCredit(long v) { otherTaxCredit = v; return this; }
        public Builder protectionInsurance(long v) { protectionInsurance = v; return this; }
        public Builder disabledInsurance(long v) { disabledInsurance = v; return this; }
        public Builder medicalSelf(long v) { medicalSelf = v; return this; }
        public Builder medicalOther(long v) { medicalOther = v; return this; }
        public Builder otherSpecialTaxCredit(long v) { otherSpecialTaxCredit = v; return this; }
        public Builder prevTax(long income, long local) { prevIncomeTax = income; prevLocalTax = local; return this; }
        public Builder currentTax(long income, long local) { currentIncomeTax = income; currentLocalTax = local; return this; }

        public Input build() {
            return new Input(totalPay, nonTaxable, basicDeductionCount, additionalDeduction, nationalPension,
                    healthInsurance, employmentInsurance, housingDeduction, otherIncomeDeduction, taxReduction,
                    childCount, otherTaxCredit, protectionInsurance, disabledInsurance, medicalSelf, medicalOther,
                    otherSpecialTaxCredit, prevIncomeTax, prevLocalTax, currentIncomeTax, currentLocalTax);
        }
    }

    /** 원천징수영수증 단계표의 칸 — 괄호 숫자는 서식 칸 번호. */
    public record Result(
            long totalSalary,              // (21) 총급여
            long earnedIncomeDeduction,    // (22) 근로소득공제
            long earnedIncomeAmount,       // (23) 근로소득금액
            long personalDeduction,        // (24 ~ 30) 인적공제(기본 + 추가)
            long pensionDeduction,         // (31) 연금보험료공제
            long specialIncomeDeduction,   // (33) 특별소득공제(건강 · 고용 · 주택자금)
            long otherIncomeDeduction,     // (46) 그 밖의 소득공제
            long incomeDeductionTotal,
            long taxBase,                  // (48) 과세표준
            long computedTax,              // (49) 산출세액
            long taxReduction,             // (54) 세액감면
            long earnedIncomeTaxCredit,    // (55) 근로소득세액공제
            long childTaxCredit,           // (57) 자녀세액공제
            long insuranceBase, long insuranceCredit,   // (61) 보장성보험료 공제대상 · 세액공제
            long medicalBase, long medicalCredit,       // (62) 의료비 공제대상 · 세액공제
            long otherSpecialTaxCredit,    // 교육비 · 기부금 · 월세
            long standardTaxCredit,        // 표준세액공제
            long otherTaxCredit,
            long taxCreditTotal,           // (71) 세액공제 계
            boolean standardChosen,
            long decidedIncomeTax, long decidedLocalTax, long decidedRuralTax,   // (72)(73) 결정세액
            long prevIncomeTax, long prevLocalTax,                              // (74) 기납부 종(전)
            long currentIncomeTax, long currentLocalTax,                        // (75) 기납부 주(현)
            long balanceIncomeTax, long balanceLocalTax                         // (77) 차감징수세액(음수 = 환급)
    ) {}

    public static Result calculate(Input in) {
        Result special = calculate(in, false);
        Result standard = calculate(in, true);
        // 세금이 적은 쪽. 같으면 특별공제 쪽(원본 C · A 처럼 특별공제가 있으면 그 칸을 보인다).
        return standard.decidedIncomeTax() < special.decidedIncomeTax() ? standard : special;
    }

    private static Result calculate(Input in, boolean useStandard) {
        long totalSalary = Math.max(0, in.totalPay() - in.nonTaxable());
        long eid = earnedIncomeDeduction(totalSalary);
        long eia = totalSalary - eid;

        long personal = BASIC_DEDUCTION_PER_PERSON * Math.max(1, in.basicDeductionCount()) + in.additionalDeduction();
        long pension = in.nationalPension();
        long specialIncome = useStandard ? 0 : in.healthInsurance() + in.employmentInsurance() + in.housingDeduction();
        long other = in.otherIncomeDeduction();
        // 소득공제는 근로소득금액을 넘지 못한다(과세표준 0 아래로 안 간다).
        long deductionTotal = Math.min(eia, personal + pension + specialIncome + other);
        long taxBase = eia - deductionTotal;
        long computed = basicTax(taxBase);

        long reduction = Math.min(computed, in.taxReduction());
        long earnedCredit = earnedIncomeTaxCredit(computed, totalSalary);
        long child = childTaxCredit(in.childCount());

        long insBase = 0, insCredit = 0, medBase = 0, medCredit = 0, otherSpecial = 0, standardCredit = 0;
        if (useStandard) {
            standardCredit = STANDARD_TAX_CREDIT;
        } else {
            long prot = Math.min(in.protectionInsurance(), INSURANCE_BASE_LIMIT);
            long dis = Math.min(in.disabledInsurance(), INSURANCE_BASE_LIMIT);
            insBase = prot + dis;
            insCredit = prot * 12 / 100 + dis * 15 / 100;
            medBase = medicalBase(in.medicalSelf(), in.medicalOther(), totalSalary);
            medCredit = medBase * 15 / 100;
            otherSpecial = in.otherSpecialTaxCredit();
        }
        long creditTotal = earnedCredit + child + insCredit + medCredit + otherSpecial + standardCredit + in.otherTaxCredit();
        // 세액공제는 산출세액 − 감면 을 넘지 못한다(결정세액 0 아래로 안 간다).
        creditTotal = Math.min(creditTotal, computed - reduction);
        long decided = computed - reduction - creditTotal;
        long decidedLocal = decided / 10;

        long balance = truncTen(decided - in.prevIncomeTax() - in.currentIncomeTax());
        long balanceLocal = truncTen(decidedLocal - in.prevLocalTax() - in.currentLocalTax());

        return new Result(totalSalary, eid, eia, personal, pension, specialIncome, other, deductionTotal, taxBase,
                computed, reduction, earnedCredit, child, insBase, insCredit, medBase, medCredit, otherSpecial,
                standardCredit, in.otherTaxCredit(), creditTotal, useStandard, decided, decidedLocal, 0,
                in.prevIncomeTax(), in.prevLocalTax(), in.currentIncomeTax(), in.currentLocalTax(), balance, balanceLocal);
    }

    /** 근로소득공제(소득세법 47조, 2024~ 한도 2천만). 원 미만 버림. */
    public static long earnedIncomeDeduction(long totalSalary) {
        long d;
        if (totalSalary <= 5_000_000) d = totalSalary * 70 / 100;
        else if (totalSalary <= 15_000_000) d = 3_500_000 + (totalSalary - 5_000_000) * 40 / 100;
        else if (totalSalary <= 45_000_000) d = 7_500_000 + (totalSalary - 15_000_000) * 15 / 100;
        else if (totalSalary <= 100_000_000) d = 12_000_000 + (totalSalary - 45_000_000) * 5 / 100;
        else d = 14_750_000 + (totalSalary - 100_000_000) * 2 / 100;
        return Math.min(d, 20_000_000);
    }

    /** 기본세율(소득세법 55조, 2023~). 원 미만 버림. */
    public static long basicTax(long taxBase) {
        if (taxBase <= 0) return 0;
        long[][] brackets = {   // {하한, 누진 기본세액, 세율 %}
                {1_000_000_000L, 384_060_000L, 45}, {500_000_000L, 174_060_000L, 42}, {300_000_000L, 94_060_000L, 40},
                {150_000_000L, 37_060_000L, 38}, {88_000_000L, 15_360_000L, 35}, {50_000_000L, 6_240_000L, 24},
                {14_000_000L, 840_000L, 15}, {0L, 0L, 6}};
        for (long[] b : brackets) {
            if (taxBase > b[0]) return b[1] + (taxBase - b[0]) * b[2] / 100;
        }
        return 0;
    }

    /** 근로소득세액공제(59조): 산출 130만 이하 55%, 넘으면 71.5만 + 초과분 30%. 총급여 구간별 한도. */
    public static long earnedIncomeTaxCredit(long computedTax, long totalSalary) {
        long credit = computedTax <= 1_300_000 ? computedTax * 55 / 100 : 715_000 + (computedTax - 1_300_000) * 30 / 100;
        long limit;
        if (totalSalary <= 33_000_000) limit = 740_000;
        else if (totalSalary <= 70_000_000) limit = Math.max(660_000, 740_000 - (totalSalary - 33_000_000) * 8 / 1000);
        else if (totalSalary <= 120_000_000) limit = Math.max(500_000, 660_000 - (totalSalary - 70_000_000) / 2);
        else limit = Math.max(200_000, 500_000 - (totalSalary - 120_000_000) / 2);
        return Math.min(credit, limit);
    }

    /** 자녀세액공제(59조의2, 2025 귀속): 1명 25만 · 2명 55만 · 3명부터 한 명당 40만 더. 원본 못 잼. */
    public static long childTaxCredit(int children) {
        if (children <= 0) return 0;
        if (children == 1) return 250_000;
        return 550_000 + (children - 2) * 400_000L;
    }

    /**
     * 의료비 공제대상 — 총급여 3% 를 넘는 몫. 문턱은 '그 밖의 부양가족' 의료비에서 먼저 빼고, 그쪽은 700만 한도.
     * 원본 C: 본인 5,000,000 − 60,000,000 × 3% = 3,200,000.
     */
    public static long medicalBase(long self, long other, long totalSalary) {
        long threshold = totalSalary * 3 / 100;
        long otherNet = other - threshold;
        long selfNet = self;
        if (otherNet < 0) { selfNet += otherNet; otherNet = 0; }
        return Math.max(0, selfNet) + Math.min(otherNet, MEDICAL_OTHER_LIMIT);
    }

    /** 10원 미만 버림(0 쪽으로) — 차감징수세액. */
    static long truncTen(long v) {
        return v / 10 * 10;
    }
}
