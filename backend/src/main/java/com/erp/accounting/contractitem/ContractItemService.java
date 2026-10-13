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
        return ContractItemResponse.from(repository.save(i));
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
        return ContractItemResponse.from(i);
    }

    /** 원본 [사용중단/재사용]. */
    @Transactional
    public void setActive(List<Long> ids, boolean active) {
        for (Long id : ids) get(id).setActive(active);
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
                i.getProducts().add(ContractItemProduct.builder().contractItem(i).lineNo(no++).item(itemService.get(p.itemId()))
                        .quantity(p.quantity()).unitPrice(p.unitPrice()).supplyAmount(p.supplyOrDefault()).vatAmount(p.vatOrDefault()).build());
            }
        }
    }
}
