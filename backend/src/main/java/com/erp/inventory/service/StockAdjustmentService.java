package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.StockAdjustment;
import com.erp.inventory.domain.StockTransaction;
import com.erp.inventory.domain.StockTransactionType;
import com.erp.inventory.domain.Warehouse;
import com.erp.inventory.domain.enums.StockAdjustmentType;
import com.erp.inventory.dto.StockAdjustmentDtos.AdjustmentResponse;
import com.erp.inventory.dto.StockAdjustmentDtos.CreateAdjustmentRequest;
import com.erp.inventory.repository.ItemRepository;
import com.erp.inventory.repository.StockAdjustmentRepository;
import com.erp.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.dto.StockAdjustmentDtos;

/**
 * 기타이동 — 자가사용·불량처리·재고조정.
 * 재고 증감은 StockService 가 소유한다(음수 재고 방지·수불 이력 기록). 여기서는 전표만 남긴다.
 */
@Service
@RequiredArgsConstructor
public class StockAdjustmentService {

    private final StockAdjustmentRepository adjustmentRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final StockService stockService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<AdjustmentResponse> findAll() {
        return adjustmentRepository.findAllWithRefs().stream()
                .map(AdjustmentResponse::from)
                .toList();
    }

    @Transactional
    public AdjustmentResponse create(CreateAdjustmentRequest req, String username) {
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));

        LocalDate date = req.adjustDate() != null ? req.adjustDate() : LocalDate.now();
        String adjustNo = docNoGenerator.next("SA-", "stock_adjustments", "adjust_no", "adjust_date", date);
        String note = req.type().getDisplayName() + " " + adjustNo
                + (req.reason() != null && !req.reason().isBlank() ? " (" + req.reason() + ")" : "");

        // 재고 부족·차이 없음은 StockService 가 예외로 막고, 전표까지 함께 롤백된다.
        StockTransaction tx = switch (req.type()) {
            case SELF_USE, DEFECT -> {
                BigDecimal qty = required(req.quantity(), "차감할 수량을 입력하세요.");
                if (qty.signum() <= 0) {
                    throw ApiException.badRequest("수량은 0보다 커야 합니다.");
                }
                yield stockService.applyDelta(item, warehouse, qty.negate(),
                        StockTransactionType.OUTBOUND, null, date, note, username);
            }
            case ADJUST -> stockService.adjustTo(item, warehouse,
                    required(req.actualQty(), "실사수량을 입력하세요."), date, note, username);
        };

        StockAdjustment adjustment = StockAdjustment.builder()
                .adjustNo(adjustNo)
                .adjustDate(date)
                .type(req.type())
                .item(item)
                .warehouse(warehouse)
                .beforeQty(tx.getBalanceAfter().subtract(tx.getQuantityChange()))
                .quantityChange(tx.getQuantityChange())
                .afterQty(tx.getBalanceAfter())
                .reason(req.reason())
                .createdBy(username)
                .build();
        return AdjustmentResponse.from(adjustmentRepository.save(adjustment));
    }

    private BigDecimal required(BigDecimal value, String message) {
        if (value == null) {
            throw ApiException.badRequest(message);
        }
        return value;
    }
}
