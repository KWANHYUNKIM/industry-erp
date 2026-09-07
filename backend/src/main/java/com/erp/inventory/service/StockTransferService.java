package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.StockTransactionType;
import com.erp.inventory.domain.StockTransfer;
import com.erp.inventory.domain.Warehouse;
import com.erp.inventory.dto.StockTransferDtos.CreateTransferRequest;
import com.erp.inventory.dto.StockTransferDtos.TransferResponse;
import com.erp.inventory.repository.ItemRepository;
import com.erp.inventory.repository.StockTransferRepository;
import com.erp.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.dto.StockTransferDtos;

@Service
@RequiredArgsConstructor
public class StockTransferService {

    private final StockTransferRepository transferRepository;
    private final ProjectService projectService;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final StockService stockService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<TransferResponse> findAll() {
        return findAll(null, null);
    }

    /**
     * 창고이동 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다).
     *
     * <p>창고이동조회 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내,
     * 전 기간을 받아 브라우저에서 걸렀다.
     */
    @Transactional(readOnly = true)
    public List<TransferResponse> findAll(LocalDate from, LocalDate to) {
        var found = (from == null && to == null)
                ? transferRepository.findAllWithRefs()
                : transferRepository.findWithRefsByPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1),
                        to != null ? to : LocalDate.of(9999, 12, 31));
        return found.stream().map(TransferResponse::from).toList();
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
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .employeeId(req.employeeId())
                .reason(req.reason())
                .createdBy(username)
                .build();
        return TransferResponse.from(transferRepository.save(transfer));
    }

    /**
     * 창고이동 취소.
     *
     * <p>이 자리가 <b>아예 없었다.</b> 판매·구매·자재불출·재고조정은 모두 지울 수 있는데
     * 창고이동만 없어서, 창고를 잘못 골라 옮기면 되돌릴 방법이 없었다. 화면에도 [삭제]가
     * 없어서 사람이 할 수 있는 일은 <b>반대로 한 번 더 옮기는 것</b>뿐인데, 그러면
     * 창고이동조회에 있지도 않은 이동이 두 줄 남는다.
     *
     * <p>되돌리는 방식은 바로 옆 자재불출과 같다 — 옮겼던 재고를 반대로 옮기고,
     * 수불이력은 지우지 않고 반대 거래를 남긴다. 이미 입고창고에서 빠져나간 뒤라
     * 되돌릴 재고가 모자라면 {@code applyDelta} 가 막는다(그 편이 맞다 — 없는 물건을
     * 되돌리는 척하면 재고가 음수가 된다).
     */
    @Transactional
    public void delete(Long id, String username) {
        StockTransfer t = transferRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("창고이동을 찾을 수 없습니다. id=" + id));

        String note = "창고이동취소 " + t.getTransferNo()
                + " (" + t.getFromWarehouse().getName() + "→" + t.getToWarehouse().getName() + ")";
        // 입고창고에서 빼고
        stockService.applyDelta(t.getItem(), t.getToWarehouse(), t.getQuantity().negate(),
                StockTransactionType.OUTBOUND, null, t.getTransferDate(), note, username);
        // 출고창고로 되돌린다
        stockService.applyDelta(t.getItem(), t.getFromWarehouse(), t.getQuantity(),
                StockTransactionType.INBOUND, null, t.getTransferDate(), note, username);

        transferRepository.delete(t);
    }

    private String generateNo(LocalDate date) {
        return docNoGenerator.next("TR-", "stock_transfers", "transfer_no", "transfer_date", date);
    }
}
