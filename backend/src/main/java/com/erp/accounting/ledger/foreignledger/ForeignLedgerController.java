package com.erp.accounting.ledger.foreignledger;

import com.erp.accounting.ledger.foreignledger.dto.ForeignLedgerDtos.Response;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/** 외화장부(E010831). */
@RestController
@RequestMapping("/api/accounting/foreign-ledger")
@RequiredArgsConstructor
public class ForeignLedgerController {

    private final ForeignLedgerService foreignLedgerService;

    @GetMapping
    public Response ledger(@RequestParam(defaultValue = "PARTNER") String mode,
                           @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                           @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                           @RequestParam(required = false) Long accountId,
                           @RequestParam(required = false) Long partnerId,
                           @RequestParam(required = false) Long departmentId,
                           @RequestParam(required = false) Long projectId,
                           @RequestParam(required = false) String currency,
                           @RequestParam(defaultValue = "true") boolean includeStopped) {
        return foreignLedgerService.ledger(mode, from, to, accountId, partnerId, departmentId, projectId, currency, includeStopped);
    }
}
