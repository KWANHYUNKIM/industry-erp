package com.erp.accounting.controller;

import com.erp.accounting.dto.LedgerDtos.PartnerBalanceResponse;
import com.erp.accounting.service.LedgerService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.dto.LedgerDtos;

@RestController
@RequestMapping("/api/ledger")
@RequiredArgsConstructor
public class LedgerController {

    private final LedgerService ledgerService;

    /** 거래처별 채권/채무 현황. asOf 를 주면 그 날짜까지의 기준일자 잔액. */
    @GetMapping("/partner-balances")
    public List<PartnerBalanceResponse> partnerBalances(
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        return ledgerService.partnerBalances(asOf);
    }
}
