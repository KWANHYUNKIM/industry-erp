package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.trade.dto.PriceBulkDtos.PriceBulkApplyRequest;
import com.erp.trade.dto.PriceBulkDtos.PriceBulkApplyResponse;
import com.erp.trade.dto.PriceBulkDtos.PriceBulkItemResponse;
import com.erp.trade.dto.PriceBulkDtos.PriceBulkUpdatedItem;
import com.erp.inventory.repository.ItemRepository;
import com.erp.trade.repository.PurchaseLineRepository;
import com.erp.trade.repository.SalesLineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.erp.trade.dto.PriceBulkDtos;

/**
 * 판매/구매 단가일괄변경 서비스.
 * 기존 ItemRepository 를 재사용하며, Item 의 표준단가(unitPrice)만 변경한다(컬럼 추가 금지).
 * 판매/구매 평균단가는 판매·구매 라인 집계(공급가액 합 / 수량 합)로 파생해 참고용으로 내려준다.
 */
@Service
@RequiredArgsConstructor
public class PriceBulkService {

    private final ItemRepository itemRepository;
    private final SalesLineRepository salesLineRepository;
    private final PurchaseLineRepository purchaseLineRepository;

    @Transactional(readOnly = true)
    public List<PriceBulkItemResponse> findItems() {
        Map<Long, BigDecimal> avgSale = new HashMap<>();
        for (SalesLineRepository.ItemAggregate a : salesLineRepository.aggregateByItem()) {
            BigDecimal avg = average(a.getAmount(), a.getQty());
            if (avg != null) {
                avgSale.put(a.getItemId(), avg);
            }
        }
        Map<Long, BigDecimal> avgPurchase = new HashMap<>();
        for (PurchaseLineRepository.ItemAggregate a : purchaseLineRepository.aggregateByItem()) {
            BigDecimal avg = average(a.getAmount(), a.getQty());
            if (avg != null) {
                avgPurchase.put(a.getItemId(), avg);
            }
        }

        return itemRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .filter(Item::isActive)
                .map(i -> new PriceBulkItemResponse(
                        i.getId(), i.getCode(), i.getName(), i.getSpec(), i.getUnit(),
                        i.getUnitPrice(),
                        avgSale.get(i.getId()),
                        avgPurchase.get(i.getId())))
                .toList();
    }

    @Transactional
    public PriceBulkApplyResponse apply(PriceBulkApplyRequest req) {
        String field = req.field();
        if (!"sale".equals(field) && !"purchase".equals(field)) {
            throw ApiException.badRequest("field 는 'sale' 또는 'purchase' 여야 합니다: " + field);
        }
        String mode = req.mode();
        if (!"rate".equals(mode) && !"amount".equals(mode)) {
            throw ApiException.badRequest("mode 는 'rate' 또는 'amount' 여야 합니다: " + mode);
        }

        List<Item> items = itemRepository.findAllById(req.itemIds());
        if (items.size() != req.itemIds().size()) {
            throw ApiException.notFound("존재하지 않는 품목이 포함되어 있습니다.");
        }

        List<PriceBulkUpdatedItem> updated = new ArrayList<>();
        for (Item item : items) {
            BigDecimal oldPrice = item.getUnitPrice();
            BigDecimal newPrice;
            if ("rate".equals(mode)) {
                // 증감율(%): new = old * (1 + value/100)
                BigDecimal factor = BigDecimal.ONE.add(
                        req.value().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
                newPrice = oldPrice.multiply(factor).setScale(2, RoundingMode.HALF_UP);
            } else {
                // 증감액: new = old + value
                newPrice = oldPrice.add(req.value()).setScale(2, RoundingMode.HALF_UP);
            }
            if (newPrice.compareTo(BigDecimal.ZERO) < 0) {
                newPrice = BigDecimal.ZERO;
            }
            item.setUnitPrice(newPrice);
            updated.add(new PriceBulkUpdatedItem(item.getId(), item.getCode(), item.getName(), oldPrice, newPrice));
        }
        return new PriceBulkApplyResponse(updated.size(), updated);
    }

    private static BigDecimal average(BigDecimal amount, BigDecimal qty) {
        if (amount == null || qty == null || qty.compareTo(BigDecimal.ZERO) == 0) {
            return null;
        }
        return amount.divide(qty, 2, RoundingMode.HALF_UP);
    }
}
