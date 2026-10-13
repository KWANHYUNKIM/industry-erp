package com.erp.accounting.contractbill;

import com.erp.accounting.contractbill.dto.ContractBillDtos;
import com.erp.accounting.contractbill.dto.ContractBillDtos.BillResponse;
import com.erp.accounting.contractbill.dto.ContractBillDtos.CreateBillRequest;
import com.erp.accounting.contractbill.dto.ContractBillDtos.UpdateBillRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 회계 II › 계약관리 › 청구예정자료생성(E060905) */
@RestController
@RequestMapping("/api/contract-bills")
@RequiredArgsConstructor
public class ContractBillController {

    private final ContractBillService service;

    @GetMapping
    public List<BillResponse> list(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                   @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findAll(from, to);
    }

    @GetMapping("/{id}")
    public BillResponse one(@PathVariable Long id) {
        return service.findOne(id);
    }

    /** [일괄생성] · [거래처별생성] */
    @PostMapping
    public List<BillResponse> create(@Valid @RequestBody CreateBillRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    /** 청구자료수정 [저장] */
    @PutMapping("/{id}")
    public BillResponse update(@PathVariable Long id, @Valid @RequestBody UpdateBillRequest req) {
        return service.update(id, req.lines());
    }

    /** 청구자료수정 [삭제] · 목록 [선택삭제] */
    @PostMapping("/delete")
    public void delete(@RequestBody ContractBillDtos.DeleteRequest req) {
        service.delete(req.ids());
    }
}
