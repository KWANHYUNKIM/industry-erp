package com.erp.accounting.contractbill.dto;

import com.erp.accounting.billingcontract.BillingContractLine;
import com.erp.accounting.contractbill.ContractBill;
import com.erp.accounting.contractbill.ContractBillLine;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class ContractBillDtos {
    private ContractBillDtos() {}

    /** 청구자료생성 — [일괄생성] 은 한 장, [거래처별생성] 은 거래처마다 한 장(byPartner). */
    public record CreateBillRequest(
            @NotNull(message = "일자를 입력하세요.") LocalDate billDate,
            @NotBlank String vatType,
            boolean byPartner,
            @NotEmpty(message = "청구할 계약을 [계약] 으로 불러오세요.") List<@Valid BillLine> lines
    ) {}

    public record UpdateBillRequest(@NotEmpty(message = "청구할 줄이 없습니다.") List<@Valid BillLine> lines) {}

    public record BillLine(
            Long id,
            @NotNull Long contractLineId,
            @NotBlank @Size(max = 7) String billMonth,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            @Size(max = 200) String remark
    ) {}

    public record BillLineResponse(
            Long id, Long contractLineId, String itemCode, String itemName, String contractCode, String contractName,
            Long partnerId, String partnerName, String billMonth,
            BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            String billingUnitCode, String billingUnitName, String remark, Long journalEntryId
    ) {
        public static BillLineResponse from(ContractBillLine l) {
            BillingContractLine cl = l.getContractLine();
            return new BillLineResponse(l.getId(), cl.getId(), cl.getItem().getCode(), cl.getItem().getName(),
                    cl.getContract().getCode(), cl.getContract().getName(),
                    cl.getContract().getPartner().getId(), cl.getContract().getPartner().getName(), l.getBillMonth(),
                    l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    cl.getBillingUnit() != null ? cl.getBillingUnit().getCode() : null,
                    cl.getBillingUnit() != null ? cl.getBillingUnit().getName() : null, l.getRemark(), l.getJournalEntryId());
        }
    }

    public record BillResponse(
            Long id, LocalDate billDate, Integer docNo, String vatType,
            boolean accountingReflected, boolean salesCreated, BigDecimal totalAmount, List<BillLineResponse> lines
    ) {
        public static BillResponse from(ContractBill b, List<ContractBillLine> lines) {
            BigDecimal total = lines.stream().map((l) -> l.getSupplyAmount().add(l.getVatAmount())).reduce(BigDecimal.ZERO, BigDecimal::add);
            return new BillResponse(b.getId(), b.getBillDate(), b.getDocNo(), b.getVatType(),
                    !lines.isEmpty() && lines.stream().allMatch((l) -> l.getJournalEntryId() != null), b.isSalesCreated(), total, lines.stream().map(BillLineResponse::from).toList());
        }
    }

    public record DeleteRequest(List<Long> ids) {}

    /**
     * 회계/판매일괄반영(E060906) · 회계미반영현황(계약)(E060908) 한 줄 — 청구자료 줄과 그 계약 · 거래처 · 항목.
     * 화면이 거래처별로 묶고(일괄반영) 조건(계약 · 계약항목 · 거래처 · 담당자 · 부가세유형 · 청구단위 · 내.외자 · 부서 · 프로젝트)으로 거른다.
     */
    public record BillLineView(
            Long lineId, Long billId, LocalDate billDate, Integer billDocNo, String vatType, Long journalEntryId,
            Long contractId, String contractCode, String contractName,
            Long partnerId, String partnerCode, String partnerName,
            Long employeeId, Long departmentId, Long projectId, String projectName, boolean foreignCurrency,
            Long itemId, String itemCode, String itemName, Long salesAccountId,
            String billMonth, BigDecimal quantity, BigDecimal unitPrice, BigDecimal supplyAmount, BigDecimal vatAmount,
            Long billingUnitId, String billingUnitName, String remark
    ) {
        public static BillLineView from(ContractBillLine l) {
            BillingContractLine cl = l.getContractLine();
            var c = cl.getContract();
            var i = cl.getItem();
            return new BillLineView(l.getId(), l.getBill().getId(), l.getBill().getBillDate(), l.getBill().getDocNo(), l.getBill().getVatType(),
                    l.getJournalEntryId(), c.getId(), c.getCode(), c.getName(),
                    c.getPartner().getId(), c.getPartner().getCode(), c.getPartner().getName(),
                    c.getEmployeeId(), c.getDepartmentId(), c.getProject() != null ? c.getProject().getId() : null,
                    c.getProject() != null ? c.getProject().getName() : null, c.isForeignCurrency(),
                    i.getId(), i.getCode(), i.getName(), i.getSalesAccount() != null ? i.getSalesAccount().getId() : null,
                    l.getBillMonth(), l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                    cl.getBillingUnit() != null ? cl.getBillingUnit().getId() : null,
                    cl.getBillingUnit() != null ? cl.getBillingUnit().getName() : null, l.getRemark());
        }
    }

    /**
     * 회계/판매일괄반영 [매출전표 I] 창 [저장(F8)] — 고른 거래처 한 곳의 청구자료 줄을 매출전표 I 한 장으로(2026-10-13 실측:
     * 전표일자(오늘) · 부서 · 프로젝트 · 부가세유형 · 거래처 · 공급가액 · 부가세 · 적요(항목명) · 매출계정(4049 제품매출) · 입금계좌(1089 외상매출금)).
     */
    public record ReflectRequest(
            @NotEmpty(message = "반영할 자료를 선택 바랍니다.") List<Long> lineIds,
            LocalDate entryDate,
            Long departmentId,
            Long projectId,
            @NotBlank(message = "부가세유형: 자료를 입력 바랍니다.") @Size(max = 30) String vatType,
            @NotNull(message = "거래처: 자료를 입력 바랍니다.") Long partnerId,
            @NotNull(message = "공급가액: 자료를 입력 바랍니다.") @Positive(message = "공급가액은 0보다 커야 합니다.") BigDecimal supplyAmount,
            @PositiveOrZero(message = "부가세는 0 이상이어야 합니다.") BigDecimal vatAmount,
            @Size(max = 300, message = "적요는 300자까지 넣을 수 있습니다.") String description,
            @NotNull(message = "매출계정: 자료를 입력 바랍니다.") Long accountId,
            @NotNull(message = "입금계좌: 자료를 입력 바랍니다.") Long settleAccountId,
            @Size(max = 30) String eInvoiceKind,
            Boolean vatOmitted
    ) {}

    /** 매출(세금)계산서현황(계약)(E060910, 제목 '매출청구서현황') 한 줄 — 반영으로 만든 매출전표 I. */
    public record InvoiceRow(
            Long journalEntryId, LocalDate entryDate, Integer entryNo, String docNo,
            Long partnerId, String partnerName, Long departmentId, Long projectId, String vatType, String confirmStatus,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount, List<Long> billIds
    ) {}
}
