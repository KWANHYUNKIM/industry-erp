package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Stock;
import com.erp.inventory.domain.StockTransaction;
import com.erp.inventory.domain.StockTransactionType;
import com.erp.inventory.domain.Warehouse;
import com.erp.inventory.dto.StockDtos.StockResponse;
import com.erp.inventory.dto.StockDtos.StockTransactionRequest;
import com.erp.inventory.dto.StockDtos.StockTransactionResponse;
import com.erp.inventory.repository.ItemRepository;
import com.erp.inventory.repository.StockRepository;
import com.erp.inventory.repository.StockTransactionRepository;
import com.erp.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.dto.StockDtos;

@Service
@RequiredArgsConstructor
public class StockService {

    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final StockRepository stockRepository;
    private final StockTransactionRepository transactionRepository;

    /** 현재고 목록 (품목 x 창고) */
    @Transactional(readOnly = true)
    public List<StockResponse> currentStock() {
        return stockRepository.findAllWithItemAndWarehouse().stream()
                .map(StockResponse::from)
                .toList();
    }

    /** 특정 (품목, 창고)의 현재고. 없으면 0. WMS 로케이션 배치가 이 수량을 넘지 못한다. */
    @Transactional(readOnly = true)
    public BigDecimal quantityOf(Long itemId, Long warehouseId) {
        return stockRepository.findByItemIdAndWarehouseId(itemId, warehouseId)
                .map(Stock::getQuantity)
                .orElse(BigDecimal.ZERO);
    }

    /** 입출고 이력 (최신순, 페이지) */
    @Transactional(readOnly = true)
    public Page<StockTransactionResponse> transactions(int page, int size) {
        Pageable pageable = PageRequest.of(page, size);
        return transactionRepository.findAllWithRefs(pageable)
                .map(StockTransactionResponse::from);
    }

    /** 입고/출고/조정 처리 (재고 화면에서 직접 등록) */
    @Transactional
    public StockTransactionResponse record(StockTransactionRequest req, String username) {
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));

        BigDecimal delta = resolveDelta(req);
        LocalDate date = req.transactionDate() != null ? req.transactionDate() : LocalDate.now();
        StockTransaction tx = applyDelta(item, warehouse, delta, req.type(), req.unitPrice(), date, req.note(), username);
        return StockTransactionResponse.from(tx);
    }

    /**
     * 잔량을 원자적으로 갱신하고 이력을 남긴다. 판매(출고)/구매(입고) 등 다른 서비스에서도 재사용.
     * delta 는 부호 있는 변동량(입고 +, 출고 -).
     */
    @Transactional
    public StockTransaction applyDelta(Item item, Warehouse warehouse, BigDecimal delta,
                                       StockTransactionType type, BigDecimal unitPrice,
                                       LocalDate date, String note, String username) {
        // 잔량 행을 잠그고 조회, 없으면 생성
        Stock stock = stockRepository.findForUpdate(item.getId(), warehouse.getId())
                .orElseGet(() -> stockRepository.save(Stock.builder()
                        .item(item)
                        .warehouse(warehouse)
                        .quantity(BigDecimal.ZERO)
                        .build()));

        BigDecimal newBalance = stock.getQuantity().add(delta);
        if (newBalance.compareTo(BigDecimal.ZERO) < 0) {
            throw ApiException.badRequest(String.format(
                    "재고가 부족합니다. 현재고 %s, 요청 %s (%s)",
                    stock.getQuantity().toPlainString(),
                    delta.abs().toPlainString(),
                    item.getName()));
        }
        stock.setQuantity(newBalance);

        StockTransaction tx = StockTransaction.builder()
                .item(item)
                .warehouse(warehouse)
                .type(type)
                .quantityChange(delta)
                .balanceAfter(newBalance)
                .unitPrice(unitPrice)
                .transactionDate(date != null ? date : LocalDate.now())
                .note(note)
                .createdBy(username)
                .build();
        return transactionRepository.save(tx);
    }

    /**
     * 실사수량(targetQty)에 맞춰 잔량을 조정한다. 차이 계산과 반영을 같은 잠금 안에서 하므로
     * 조회 시점과 반영 시점 사이에 다른 전표가 끼어들어 조정량이 어긋나는 일이 없다.
     */
    @Transactional
    public StockTransaction adjustTo(Item item, Warehouse warehouse, BigDecimal targetQty,
                                     LocalDate date, String note, String username) {
        BigDecimal current = stockRepository.findForUpdate(item.getId(), warehouse.getId())
                .map(Stock::getQuantity)
                .orElse(BigDecimal.ZERO);
        BigDecimal delta = targetQty.subtract(current);
        if (delta.signum() == 0) {
            throw ApiException.badRequest("실사수량이 현재고(" + current.toPlainString() + ")와 같아 조정할 차이가 없습니다.");
        }
        return applyDelta(item, warehouse, delta, StockTransactionType.ADJUST, null, date, note, username);
    }

    /** 유형과 방향으로 실제 증감량(부호 있음) 계산 */
    private BigDecimal resolveDelta(StockTransactionRequest req) {
        BigDecimal qty = req.quantity().abs();
        return switch (req.type()) {
            case INBOUND -> qty;
            case OUTBOUND -> qty.negate();
            case ADJUST -> Boolean.FALSE.equals(req.increase()) ? qty.negate() : qty;
        };
    }
}
