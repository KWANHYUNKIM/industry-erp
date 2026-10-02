package com.erp.accounting.summary;

import com.erp.accounting.summary.dto.AccountingDtos.ItemProfitResponse;
import com.erp.accounting.summary.dto.AccountingDtos.ProfitSummaryResponse;
import com.erp.accounting.summary.dto.AccountingDtos.VatSummaryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import com.erp.accounting.summary.dto.AccountingDtos;

@RestController
@RequestMapping("/api/accounting")
@RequiredArgsConstructor
public class AccountingController {

    private final AccountingService accountingService;

    /** 매입매출·부가세 요약 */
    @GetMapping("/vat-summary")
    public VatSummaryResponse vatSummary(
            @org.springframework.web.bind.annotation.RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @org.springframework.web.bind.annotation.RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        return accountingService.vatSummary(from, to);
    }

    /** 품목별 원가·이익 */
    @GetMapping("/item-profit")
    public List<ItemProfitResponse> itemProfit(
            @org.springframework.web.bind.annotation.RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @org.springframework.web.bind.annotation.RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        return accountingService.itemProfit(from, to);
    }

    /** 손익 요약 */
    @GetMapping("/profit-summary")
    public ProfitSummaryResponse profitSummary(
            @org.springframework.web.bind.annotation.RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @org.springframework.web.bind.annotation.RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        return accountingService.profitSummary(from, to);
    }
}
