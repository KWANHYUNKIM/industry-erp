package com.erp.accounting.contractitem;

import com.erp.accounting.contractitem.dto.ContractItemDtos;
import com.erp.accounting.contractitem.dto.ContractItemDtos.ContractItemResponse;
import com.erp.accounting.contractitem.dto.ContractItemDtos.SaveContractItemRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 회계 II › 계약관리 › 계약항목등록(E060901) */
@RestController
@RequestMapping("/api/contract-items")
@RequiredArgsConstructor
public class ContractItemController {

    private final ContractItemService service;

    @GetMapping
    public List<ContractItemResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ContractItemResponse create(@Valid @RequestBody SaveContractItemRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    public ContractItemResponse update(@PathVariable Long id, @Valid @RequestBody SaveContractItemRequest req) {
        return service.update(id, req);
    }

    /** 원본 [사용중단/재사용] */
    @PostMapping("/active")
    public void setActive(@Valid @RequestBody ContractItemDtos.ActiveRequest req) {
        service.setActive(req.ids(), req.active());
    }

    /** 수정 창 [H] */
    @GetMapping("/{id}/history")
    public List<com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse> history(@PathVariable Long id) {
        return service.history(id);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }
}
