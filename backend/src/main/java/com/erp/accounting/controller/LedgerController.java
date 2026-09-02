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

    /**
     * 거래처별채권·거래처별채무의 기간 움직임.
     *
     * <p>{@code side=AR} 이면 채권(기초채권 · 재고매출 · 회계매출 · 수금합계 · 기타할인등차액 · 잔액),
     * {@code AP} 면 채무다. 원본 화면이 잔액을 이렇게 쪼개 보여 준다.
     */
    @GetMapping("/partner-movements")
    public List<LedgerDtos.PartnerMovementResponse> partnerMovements(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "AR") String side) {
        return ledgerService.partnerMovements(from, to, !"AP".equalsIgnoreCase(side));
    }
}
