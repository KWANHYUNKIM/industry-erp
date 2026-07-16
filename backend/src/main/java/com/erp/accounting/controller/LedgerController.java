package com.erp.accounting.controller;

import com.erp.accounting.dto.LedgerDtos.PartnerBalanceResponse;
import com.erp.accounting.service.LedgerService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import com.erp.accounting.dto.LedgerDtos;

@RestController
@RequestMapping("/api/ledger")
@RequiredArgsConstructor
public class LedgerController {

    private final LedgerService ledgerService;

    /** 거래처별 채권/채무 현황 */
    @GetMapping("/partner-balances")
    public List<PartnerBalanceResponse> partnerBalances() {
        return ledgerService.partnerBalances();
    }
}
