package com.erp.accounting.ledger.reflection;

import com.erp.accounting.ledger.reflection.dto.AccountingReflectionDtos.ReflectRequest;
import com.erp.accounting.ledger.reflection.dto.AccountingReflectionDtos.ReflectResult;
import com.erp.accounting.ledger.reflection.dto.AccountingReflectionDtos.SlipKind;
import com.erp.accounting.ledger.reflection.dto.AccountingReflectionDtos.SlipResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.ledger.reflection.dto.AccountingReflectionDtos;

@RestController
@RequestMapping("/api/accounting-reflection")
@RequiredArgsConstructor
public class AccountingReflectionController {

    private final AccountingReflectionService service;

    /** 판매/구매 전표의 회계반영 현황 (onlyUnreflected=true 면 미반영만) */
    @GetMapping
    public List<SlipResponse> list(
            @RequestParam SlipKind kind,
            @RequestParam(defaultValue = "false") boolean onlyUnreflected,
            /* 기간 — 거래처관리대장처럼 기간 안 전표의 회계전표번호만 필요한 화면이 전 기간을 받지 않게. 없으면 전 기간. */
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam(required = false) @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        return service.list(kind, onlyUnreflected, from, to);
    }

    /** 선택 전표 일괄 회계반영 (실제 분개 전표 생성) */
    @PostMapping("/reflect")
    public ResponseEntity<ReflectResult> reflect(@Valid @RequestBody ReflectRequest req) {
        return ResponseEntity.ok(service.reflect(req));
    }

    /** 판매일괄회계반영 [매출전표 I] 저장 — 고른 판매(줄)를 회계전표 한 장으로. */
    @PostMapping("/reflect-sales-batch")
    public ResponseEntity<com.erp.accounting.ledger.reflection.dto.AccountingReflectionDtos.SalesBatchResult> reflectSalesBatch(
            @Valid @RequestBody com.erp.accounting.ledger.reflection.dto.AccountingReflectionDtos.SalesBatchRequest req) {
        return ResponseEntity.ok(service.reflectSalesBatch(req));
    }

    /** 회계반영된 판매를 매출전표(분개)까지 함께 삭제 — 원본 [선택삭제]의 [매출전표포함]. */
    @PostMapping("/delete-sales-with-journal")
    public ResponseEntity<ReflectResult> deleteSalesWithJournal(@Valid @RequestBody ReflectRequest req,
            @org.springframework.security.core.annotation.AuthenticationPrincipal com.erp.security.UserPrincipal principal) {
        return ResponseEntity.ok(service.deleteSalesWithJournal(req.ids(), principal.getUsername()));
    }

    /** 선택 전표 회계반영 취소 (연결 분개 전표 삭제) */
    @PostMapping("/unreflect")
    public ResponseEntity<ReflectResult> unreflect(@Valid @RequestBody ReflectRequest req) {
        return ResponseEntity.ok(service.unreflect(req));
    }
}
