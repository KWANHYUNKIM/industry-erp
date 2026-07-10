package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Item;
import com.erp.domain.StockTransactionType;
import com.erp.domain.StockTransfer;
import com.erp.domain.Warehouse;
import com.erp.dto.StockTransferDtos.CreateTransferRequest;
import com.erp.dto.StockTransferDtos.TransferResponse;
import com.erp.repository.ItemRepository;
import com.erp.repository.StockTransferRepository;
import com.erp.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class StockTransferService {

    private final StockTransferRepository transferRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final StockService stockService;

    @Transactional(readOnly = true)
    public List<TransferResponse> findAll() {
        return transferRepository.findAllWithRefs().stream()
                .map(TransferResponse::from)
                .toList();
    }

    /** 창고 간 이동: 출고창고에서 차감(OUTBOUND) 후 입고창고에 가산(INBOUND). 한 트랜잭션으로 원자 처리. */
    @Transactional
    public TransferResponse create(CreateTransferRequest req, String username) {
        if (req.fromWarehouseId().equals(req.toWarehouseId())) {
            throw ApiException.badRequest("출고창고와 입고창고가 같을 수 없습니다.");
        }
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse from = warehouseRepository.findById(req.fromWarehouseId())
                .orElseThrow(() -> ApiException.notFound("출고창고를 찾을 수 없습니다. id=" + req.fromWarehouseId()));
        Warehouse to = warehouseRepository.findById(req.toWarehouseId())
                .orElseThrow(() -> ApiException.notFound("입고창고를 찾을 수 없습니다. id=" + req.toWarehouseId()));

        LocalDate date = req.transferDate() != null ? req.transferDate() : LocalDate.now();
        String transferNo = generateNo(date);
        String note = "창고이동 " + transferNo + " (" + from.getName() + "→" + to.getName() + ")";

        // 출고창고 차감 (재고 부족 시 applyDelta 내부에서 예외 → 전체 롤백)
        stockService.applyDelta(item, from, req.quantity().negate(), StockTransactionType.OUTBOUND, null, date, note, username);
        // 입고창고 가산
        stockService.applyDelta(item, to, req.quantity(), StockTransactionType.INBOUND, null, date, note, username);

        StockTransfer transfer = StockTransfer.builder()
                .transferNo(transferNo)
                .transferDate(date)
                .item(item)
                .fromWarehouse(from)
                .toWarehouse(to)
                .quantity(req.quantity())
                .reason(req.reason())
                .createdBy(username)
                .build();
        return TransferResponse.from(transferRepository.save(transfer));
    }

    private String generateNo(LocalDate date) {
        String d = date.format(DateTimeFormatter.BASIC_ISO_DATE);
        return "TR-" + d + "-" + String.format("%04d", transferRepository.count() + 1);
    }
}
