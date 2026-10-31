package com.erp.accounting.tax.taxvoucher.dto;

import com.erp.accounting.tax.taxvoucher.TaxVoucher;
import com.erp.accounting.tax.taxvoucher.TaxVoucherSide;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class TaxVoucherDtos {

    private TaxVoucherDtos() {}

    /** 등록 · 수정. 수정에서 side · entryDate 는 바꾸지 않는다(원본 수정 창의 전표일자가 막혀 있다). */
    public record TaxVoucherRequest(
            @NotNull(message = "매출/매입구분을 지정하세요.") TaxVoucherSide side,
            LocalDate entryDate,
            @NotBlank(message = "부가세유형을 선택하세요.") @Size(max = 30) String vatType,
            @NotNull(message = "거래처를 입력 바랍니다.") Long partnerId,
            @NotNull(message = "공급가액을 입력 바랍니다.") BigDecimal supplyAmount,
            BigDecimal vatAmount,
            @Size(max = 300, message = "입력한 글자가 너무 깁니다. 300자까지 넣을 수 있습니다.") String remark,
            Long departmentId,
            Long projectId
    ) {}

    public record TaxVoucherResponse(
            Long id, TaxVoucherSide side, String sideName,
            LocalDate entryDate, Integer entryNo, String vatType,
            Long partnerId, String partnerCode, String partnerName,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            String remark,
            Long departmentId, Long projectId
    ) {
        public static TaxVoucherResponse from(TaxVoucher v) {
            return new TaxVoucherResponse(v.getId(), v.getSide(), v.getSide().getDisplayName(),
                    v.getEntryDate(), v.getEntryNo(), v.getVatType(),
                    v.getPartner().getId(), v.getPartner().getCode(), v.getPartner().getName(),
                    v.getSupplyAmount(), v.getVatAmount(), v.getSupplyAmount().add(v.getVatAmount()),
                    v.getRemark(), v.getDepartmentId(), v.getProject() != null ? v.getProject().getId() : null);
        }
    }
}
