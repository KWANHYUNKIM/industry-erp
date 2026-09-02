package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.trade.dto.PriceBulkDtos.PriceBulkApplyRequest;
import com.erp.trade.dto.PriceBulkDtos.PriceBulkApplyResponse;
import com.erp.trade.dto.PriceBulkDtos.PriceBulkItemResponse;
import com.erp.trade.dto.PriceBulkDtos.PriceBulkUpdatedItem;
import com.erp.inventory.repository.ItemRepository;
import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.PurchaseLine;
import com.erp.trade.domain.Sales;
import com.erp.trade.domain.SalesLine;
import com.erp.trade.domain.SalesConfirmStatus;
import com.erp.trade.dto.PriceBulkDtos.SlipLineRow;
import com.erp.trade.dto.PriceBulkDtos.SlipPriceApplyRequest;
import com.erp.trade.dto.PriceBulkDtos.SlipPriceApplyResponse;
import com.erp.trade.dto.PriceBulkDtos.SlipPriceChange;
import com.erp.trade.repository.PurchaseRepository;
import com.erp.trade.repository.SalesRepository;
import com.erp.trade.repository.PurchaseLineRepository;
import com.erp.trade.repository.SalesLineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.erp.trade.dto.PriceBulkDtos;

/**
 * 판매/구매 단가일괄변경 서비스.
 * field 에 따라 <b>판매단가(unitPrice)</b> 또는 <b>구매단가(purchasePrice)</b> 를 바꾼다.
 * 예전에는 컬럼이 하나뿐이라 구매단가일괄변경도 판매단가를 바꿨다 — 화면 이름과 다른 값을
 * 건드리는 셈이라, 구매단가를 올리려다 판매가가 올랐다.
 * 판매/구매 평균단가는 판매·구매 라인 집계(공급가액 합 / 수량 합)로 파생해 참고용으로 내려준다.
 */
@Service
@RequiredArgsConstructor
public class PriceBulkService {

    private final ItemRepository itemRepository;
    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final SalesService salesService;
    private final PurchaseService purchaseService;
    private final SalesLineRepository salesLineRepository;
    private final PurchaseLineRepository purchaseLineRepository;


    /**
     * 전표 라인 조회 (단가일괄변경 화면의 [검색(F8)]).
     *
     * <p>원본은 기준일자·거래처·품목·창고·진행상태로 <b>이미 입력한 전표</b>를 뽑아
     * 그 자리에서 단가를 고친다. 우리 화면은 오랫동안 품목 표준단가만 바꿔서,
     * 지난 전표의 단가를 고치는 일은 전표를 하나씩 열어 수정하는 수밖에 없었다.
     *
     * @param status  "ALL" | "UNCONFIRMED"(미확인) | "CONFIRMED"(확인)
     * @param taxType 원본 [거래유형] — '과세' · '면세'. 안 주면 전부.
     *                <b>전표에 저장된 과세 여부</b>를 본다. 예전에는 부가세가 0 인지로
     *                되짚었는데, 반올림으로 0 이 된 과세 전표가 면세로 섞였다.
     * @param tradeKind 원본 [구매구분]·[거래구분] — '일반' · '반품'. 안 주면 전부.
     */
    @Transactional(readOnly = true)
    public List<SlipLineRow> findSlipLines(String tradeType, LocalDate from, LocalDate to,
                                           Long partnerId, Long itemId, Long warehouseId,
                                           String status, String taxType, String tradeKind) {
        boolean sale = !"PURCHASE".equalsIgnoreCase(tradeType);
        List<SlipLineRow> rows = new ArrayList<>();

        if (sale) {
            /*
             * 잠금 사유를 <b>한 번에</b> 받는다. 전표마다 editLockReason 을 부르면 그 안에서
             * 세금계산서·쇼핑몰주문을 전표당 두 번씩 물어, 700여 전표에 질의가 1,400번 붙었다.
             */
            List<Sales> slips = salesRepository.findWithLinesBySaleDateBetween(from, to);
            java.util.Map<Long, String> locks = salesService.editLockReasons(slips);
            for (Sales s : slips) {
                if (partnerId != null && !partnerId.equals(s.getPartner().getId())) continue;
                if (warehouseId != null && !warehouseId.equals(s.getWarehouse().getId())) continue;
                boolean confirmed = s.getConfirmStatus() == SalesConfirmStatus.CONFIRMED;
                if (!statusMatches(status, confirmed)) continue;
                if (!taxTypeMatches(taxType, s.isTaxable())) continue;
                if (!tradeKindMatches(tradeKind, s.isReturnSlip())) continue;
                String lock = locks.get(s.getId());
                for (SalesLine l : s.getLines()) {
                    if (itemId != null && !itemId.equals(l.getItem().getId())) continue;
                    rows.add(new SlipLineRow(
                            l.getId(), s.getId(), s.getDocNo(), s.getSaleDate(),
                            s.getPartner().getName(),
                            s.getEmployee() != null ? s.getEmployee().getName() : null,
                            s.getWarehouse().getName(),
                            s.isTaxable() ? "과세" : "면세",
                            l.getItem().getCode(), l.getItem().getName(), l.getItem().getSpec(), l.getItem().getUnit(),
                            l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                            lock == null, lock));
                }
            }
        } else {
            List<Purchase> slips = purchaseRepository.findWithLinesByPurchaseDateBetween(from, to);
            java.util.Map<Long, String> locks = purchaseService.editLockReasons(slips);
            for (Purchase p : slips) {
                if (partnerId != null && !partnerId.equals(p.getPartner().getId())) continue;
                if (warehouseId != null && !warehouseId.equals(p.getWarehouse().getId())) continue;
                if (!taxTypeMatches(taxType, p.isTaxable())) continue;
                if (!tradeKindMatches(tradeKind, p.isReturnSlip())) continue;
                // 구매전표에는 확인(진행상태) 개념이 없다 — 그래서 화면 조건에도 두지 않는다.
                String lock = locks.get(p.getId());
                for (PurchaseLine l : p.getLines()) {
                    if (itemId != null && !itemId.equals(l.getItem().getId())) continue;
                    rows.add(new SlipLineRow(
                            l.getId(), p.getId(), p.getDocNo(), p.getPurchaseDate(),
                            p.getPartner().getName(),
                            p.getEmployee() != null ? p.getEmployee().getName() : null,
                            p.getWarehouse().getName(),
                            p.isTaxable() ? "과세" : "면세",
                            l.getItem().getCode(), l.getItem().getName(), l.getItem().getSpec(), l.getItem().getUnit(),
                            l.getQuantity(), l.getUnitPrice(), l.getSupplyAmount(), l.getVatAmount(),
                            lock == null, lock));
                }
            }
        }
        rows.sort(Comparator.comparing(SlipLineRow::slipDate).reversed()
                .thenComparing(SlipLineRow::docNo, Comparator.reverseOrder())
                .thenComparing(SlipLineRow::lineId));
        return rows;
    }

    /**
     * 원본 [구매구분]·[거래구분]. 안 주면(빈 값) 전부 통과.
     * 반품 전표는 수량·금액이 음수라, 여기서 걸러 내면 단가를 고칠 대상에서 빠진다.
     */
    private boolean tradeKindMatches(String tradeKind, boolean returnSlip) {
        if (tradeKind == null || tradeKind.isBlank()) return true;
        return "반품".equals(tradeKind) ? returnSlip : !returnSlip;
    }

    /** 원본 [거래유형]. 안 주면(빈 값) 전부 통과. */
    private boolean taxTypeMatches(String taxType, boolean taxable) {
        if (taxType == null || taxType.isBlank()) return true;
        return "면세".equals(taxType) ? !taxable : taxable;
    }

    private boolean statusMatches(String status, boolean confirmed) {
        if (status == null || status.isBlank() || "ALL".equalsIgnoreCase(status)) return true;
        return "CONFIRMED".equalsIgnoreCase(status) == confirmed;
    }

    /** 전표 라인 단가 일괄 적용. 금액 재계산은 각 전표를 소유한 서비스가 한다. */
    @Transactional
    public SlipPriceApplyResponse applySlipPrices(SlipPriceApplyRequest req) {
        Map<Long, BigDecimal> prices = new LinkedHashMap<>();
        for (SlipPriceChange c : req.changes()) {
            prices.put(c.lineId(), c.unitPrice());
        }
        List<String> docNos = new ArrayList<>();
        if ("PURCHASE".equalsIgnoreCase(req.tradeType())) {
            purchaseService.changeLinePrices(prices).forEach(p -> docNos.add(p.getDocNo()));
        } else {
            salesService.changeLinePrices(prices).forEach(s -> docNos.add(s.getDocNo()));
        }
        return new SlipPriceApplyResponse(prices.size(), docNos.size(), docNos);
    }

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
                        i.getPurchasePrice(),
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
        boolean sale = "sale".equals(field);
        for (Item item : items) {
            // 화면이 말한 단가를 바꾼다. 판매단가일괄변경은 판매단가, 구매단가일괄변경은 구매단가.
            BigDecimal oldPrice = sale ? item.getUnitPrice() : item.getPurchasePrice();
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
            if (sale) {
                item.setUnitPrice(newPrice);
            } else {
                item.setPurchasePrice(newPrice);
            }
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
