package com.erp.accounting.cost.dto;

import com.erp.accounting.cost.CostMethod;
import com.erp.accounting.cost.CostPeriod;
import com.erp.accounting.cost.OutsourcingBasis;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class CostPeriodDtos {

    private CostPeriodDtos() {}

    /** 원본 [신규] 기본등록. 앞 기간이 있으면 시작월은 서버가 그 다음 달로 정한다(화면에서도 잠김). */
    public record CreateCostPeriodRequest(
            @Size(max = 7, message = "시작월을 확인하세요.")
            @Pattern(regexp = "\\d{4}-\\d{2}", message = "시작월을 확인하세요.") String startMonth,
            @NotBlank(message = "종료월을 입력하세요.") @Size(max = 7, message = "종료월을 확인하세요.")
            @Pattern(regexp = "\\d{4}-\\d{2}", message = "종료월을 확인하세요.") String endMonth,
            @NotNull(message = "원가계산법을 선택하세요.") CostMethod method,
            @NotNull(message = "외주비기준을 선택하세요.") OutsourcingBasis outsourcingBasis
    ) {}

    /** 목록 한 줄 — 원본 열 [기준년월 · 원가계산방법 · 계산기준] 과 지금 어디까지 했나. */
    public record CostPeriodResponse(
            Long id, String startMonth, String endMonth,
            CostMethod method, String methodName,
            OutsourcingBasis outsourcingBasis, String outsourcingBasisName,
            boolean generated, boolean latest
    ) {
        public static CostPeriodResponse from(CostPeriod p, boolean latest) {
            return new CostPeriodResponse(p.getId(), p.getStartMonth(), p.getEndMonth(),
                    p.getMethod(), p.getMethod().getDisplayName(),
                    p.getOutsourcingBasis(), p.getOutsourcingBasis().getDisplayName(),
                    p.isGenerated(), latest);
        }
    }

    /** 사전작업 · 원가계산 결과 — 몇 품목에 원가가 섰나. */
    public record CostRunResult(int months, int rows) {}
}
