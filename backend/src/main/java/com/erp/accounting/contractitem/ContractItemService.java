package com.erp.accounting.contractitem;

import com.erp.accounting.account.AccountService;
import com.erp.accounting.contractitem.dto.ContractItemDtos;
import com.erp.accounting.contractitem.dto.ContractItemDtos.ContractItemResponse;
import com.erp.accounting.contractitem.dto.ContractItemDtos.SaveContractItemRequest;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/** 회계 II › 계약관리 › 계약항목등록(E060901). */
@Service
@RequiredArgsConstructor
public class ContractItemService {

    private final ContractItemRepository repository;
    private final AccountService accountService;
    private final com.erp.inventory.item.ItemService itemService;
    private final com.erp.common.history.ChangeHistoryService changeHistory;

    /** [H] 이력 대상 이름(change_history.target). */
    static final String HISTORY = "CONTRACT_ITEM";

    @Transactional(readOnly = true)
    public List<ContractItemResponse> findAll() {
        return repository.findAllWithRefs().stream().map(ContractItemResponse::from).toList();
    }

    @Transactional
    public ContractItemResponse create(SaveContractItemRequest req) {
        String code = req.code().trim();
        if (repository.existsByCode(code)) {
            throw ApiException.conflict("이미 등록된 계약항목코드입니다: " + code);
        }
        ContractItem i = ContractItem.builder().code(code).active(true).build();
        apply(i, req);
        ContractItem saved = repository.save(i);
        changeHistory.record(HISTORY, saved.getId(), com.erp.common.history.ChangeHistoryService.CREATED);
        return ContractItemResponse.from(saved);
    }

    @Transactional
    public ContractItemResponse update(Long id, SaveContractItemRequest req) {
        ContractItem i = get(id);
        String code = req.code().trim();
        if (!i.getCode().equals(code) && repository.existsByCode(code)) {
            throw ApiException.conflict("이미 등록된 계약항목코드입니다: " + code);
        }
        i.setCode(code);
        apply(i, req);
        changeHistory.record(HISTORY, i.getId(), com.erp.common.history.ChangeHistoryService.UPDATED);
        return ContractItemResponse.from(i);
    }

    /** 원본 [사용중단/재사용]. */
    @Transactional
    public void setActive(List<Long> ids, boolean active) {
        for (Long id : ids) {
            ContractItem i = get(id);
            boolean was = i.isActive();
            i.setActive(active);
            if (was != active) changeHistory.recordUpdate(HISTORY, id, was, active);
        }
    }

    /** 수정 창 [H] '이력' — 이 표를 만들기 전 자료는 만든 때로 '신규' 한 줄. */
    @Transactional(readOnly = true)
    public java.util.List<com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse> history(Long id) {
        ContractItem i = get(id);
        return changeHistory.list(HISTORY, id, null, i.getCreatedAt());
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    /** 계약 · 청구 쪽이 계약항목 엔티티를 얻는 진입점. */
    @Transactional(readOnly = true)
    public ContractItem get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("계약항목을 찾을 수 없습니다. id=" + id));
    }

    private void apply(ContractItem i, SaveContractItemRequest req) {
        i.setName(req.name().trim());
        i.setUnitPrice(req.unitPrice() != null ? req.unitPrice() : BigDecimal.ZERO);
        i.setVatIncluded(req.vatIncluded());
        i.setBillingCycle(req.billingCycle());
        i.setSalesAccount(req.salesAccountId() != null ? accountService.getUsable(req.salesAccountId()) : null);
        if (req.products() != null) {
            i.getProducts().clear();
            int no = 1;
            for (ContractItemDtos.ProductLink p : req.products()) {
                i.getProducts().add(ContractItemProduct.builder().contractItem(i).lineNo(no++).item(itemService.get(p.itemId())).spec(p.spec() == null || p.spec().isBlank() ? null : p.spec().trim())
                        .quantity(p.quantity()).unitPrice(p.unitPrice()).supplyAmount(p.supplyOrDefault()).vatAmount(p.vatOrDefault()).build());
            }
        }
        if (req.qtyPrices() != null) {
            i.getQtyPrices().clear();
            int no = 1;
            for (ContractItemDtos.QtyPrice q : req.qtyPrices().stream()
                    .sorted(java.util.Comparator.comparing(ContractItemDtos.QtyPrice::minQuantity)).toList()) {
                i.getQtyPrices().add(ContractItemQtyPrice.builder().contractItem(i).lineNo(no++)
                        .minQuantity(q.minQuantity()).unitPrice(q.unitPrice()).vatIncluded(q.vatIncluded()).build());
            }
        }
    }
}
