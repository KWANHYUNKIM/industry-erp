package com.erp.accounting.withholdingpayee;

import com.erp.accounting.WithholdingCodes;
import com.erp.accounting.withholdingpayee.dto.WithholdingPayeeDtos.CodeItem;
import com.erp.accounting.withholdingpayee.dto.WithholdingPayeeDtos.PayeeRequest;
import com.erp.accounting.withholdingpayee.dto.WithholdingPayeeDtos.PayeeResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 소득자등록 (세무 > 기타원천세 > 소득자등록, E030301) */
@RestController
@RequestMapping("/api/withholding-payees")
@RequiredArgsConstructor
public class WithholdingPayeeController {

    private final WithholdingPayeeService service;

    @GetMapping
    public List<PayeeResponse> list(@RequestParam(defaultValue = "false") boolean includeDeleted) {
        return service.list(includeDeleted);
    }

    @GetMapping("/{id}")
    public PayeeResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public PayeeResponse create(@Valid @RequestBody PayeeRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public PayeeResponse update(@PathVariable Long id, @Valid @RequestBody PayeeRequest req) {
        return service.update(id, req);
    }

    /** [삭제/삭제취소] */
    @PostMapping("/toggle-deleted")
    public ResponseEntity<Void> toggleDeleted(@RequestBody List<Long> ids) {
        service.toggleDeleted(ids);
        return ResponseEntity.noContent().build();
    }

    /**
     * 코드도움 — kind: industry(업종구분코드) · payee-kind(소득자구분코드) · other-income(기타소득 소득코드) ·
     * interest-income(이자배당 소득코드) · taxation(과세구분) · special(조세특례) · product(금융상품).
     */
    @GetMapping("/codes/{kind}")
    public List<CodeItem> codes(@PathVariable String kind) {
        return switch (kind) {
            case "industry" -> WithholdingCodes.INDUSTRY.stream().map(c -> new CodeItem(c.code(), c.name(), null, null)).toList();
            case "payee-kind" -> WithholdingCodes.PAYEE_KIND.stream().map(c -> new CodeItem(c.code(), c.name(), null, null)).toList();
            case "other-income" -> WithholdingCodes.OTHER_INCOME.stream()
                    .map(c -> new CodeItem(c.code(), c.name(),
                            c.expenseRate() == null ? null : String.valueOf(c.expenseRate()), String.valueOf(c.taxRate())))
                    .toList();
            case "non-resident-income" -> WithholdingCodes.NON_RESIDENT_INCOME.stream()
                    .map(c -> new CodeItem(c.code(), c.name(), String.valueOf(c.expenseRate()), null)).toList();
            case "interest-income" -> list(WithholdingCodes.INTEREST_INCOME);
            case "taxation" -> list(WithholdingCodes.TAXATION);
            case "special" -> list(WithholdingCodes.SPECIAL);
            case "product" -> list(WithholdingCodes.PRODUCT);
            default -> throw com.erp.common.ApiException.badRequest("코드 종류가 올바르지 않습니다: " + kind);
        };
    }

    private static List<CodeItem> list(List<WithholdingCodes.Code> codes) {
        return codes.stream().map(c -> new CodeItem(c.code(), c.name(), null, null)).toList();
    }
}
