package com.erp.accounting.controller;

import com.erp.accounting.dto.AccountingDtos.ItemProfitResponse;
import com.erp.accounting.dto.AccountingDtos.ProfitSummaryResponse;
import com.erp.accounting.dto.AccountingDtos.VatSummaryResponse;
import com.erp.accounting.service.AccountingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import com.erp.accounting.dto.AccountingDtos;

@RestController
@RequestMapping("/api/accounting")
@RequiredArgsConstructor
public class AccountingController {

    private final AccountingService accountingService;

    /** 매입매출·부가세 요약 */
    @GetMapping("/vat-summary")
    public VatSummaryResponse vatSummary() {
        return accountingService.vatSummary();
    }

    /** 품목별 원가·이익 */
    @GetMapping("/item-profit")
    public List<ItemProfitResponse> itemProfit() {
        return accountingService.itemProfit();
    }

    /** 손익 요약 */
    @GetMapping("/profit-summary")
    public ProfitSummaryResponse profitSummary() {
        return accountingService.profitSummary();
    }
}
