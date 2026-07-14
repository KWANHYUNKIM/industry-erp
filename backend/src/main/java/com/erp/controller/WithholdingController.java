package com.erp.controller;

import com.erp.dto.WithholdingDtos.WithholdingReceipt;
import com.erp.dto.WithholdingDtos.WithholdingStatement;
import com.erp.service.WithholdingService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/withholding")
@RequiredArgsConstructor
public class WithholdingController {

    private final WithholdingService service;

    /** 원천징수이행상황신고서 (귀속월) */
    @GetMapping("/statement")
    public WithholdingStatement statement(@RequestParam String month) {
        return service.statement(month);
    }

    /** 근로소득 원천징수영수증 (연간, 사원별) */
    @GetMapping("/receipts")
    public List<WithholdingReceipt> receipts(@RequestParam int year) {
        return service.receipts(year);
    }
}
