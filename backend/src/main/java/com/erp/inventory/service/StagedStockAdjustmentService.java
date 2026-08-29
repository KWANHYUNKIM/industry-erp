package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.StagedStockAdjustment;
import com.erp.inventory.domain.Warehouse;
import com.erp.inventory.domain.enums.StagedStatus;
import com.erp.inventory.domain.enums.StockAdjustmentType;
import com.erp.inventory.dto.StagedAdjustmentDtos.CreateStagedRequest;
import com.erp.inventory.dto.StagedAdjustmentDtos.StagedResponse;
import com.erp.inventory.dto.StockAdjustmentDtos.CreateAdjustmentRequest;
import com.erp.inventory.repository.ItemRepository;
import com.erp.inventory.repository.StagedStockAdjustmentRepository;
import com.erp.inventory.repository.StockRepository;
import com.erp.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class StagedStockAdjustmentService {

    private final StagedStockAdjustmentRepository stagedRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final StockRepository stockRepository;
    private final StockAdjustmentService stockAdjustmentService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<StagedResponse> findAll(StagedStatus status) {
        return findAll(status, null, null);
    }

    /**
     * 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다).
     *
     * <p>응답 모양은 <b>그대로 둔다.</b> 여러 화면이 알몸 배열을 기대하고 있어,
     * 자르는 껍데기를 씌우면 안 고친 곳이 조용히 빈 표가 된다.
     */
    @Transactional(readOnly = true)
    public List<StagedResponse> findAll(StagedStatus status, LocalDate from, LocalDate to) {
        List<StagedStockAdjustment> rows = status != null
                ? stagedRepository.findByStatusWithRefs(status)
                : (from == null && to == null
                        ? stagedRepository.findAllWithRefs()
                        : stagedRepository.findWithRefsByPeriod(
                                from != null ? from : LocalDate.of(1, 1, 1),
                                to != null ? to : LocalDate.of(9999, 12, 31)));
        return rows.stream().map(StagedResponse::from).toList();
    }

    @Transactional
    public StagedResponse create(CreateStagedRequest req, String username) {
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));

        // 요청 시점의 장부수량 스냅샷(없으면 0)
        BigDecimal bookQty = stockRepository.findByItemIdAndWarehouseId(item.getId(), warehouse.getId())
                .map(s -> s.getQuantity())
                .orElse(BigDecimal.ZERO);

        LocalDate date = req.requestDate() != null ? req.requestDate() : LocalDate.now();
        StagedStockAdjustment staged = StagedStockAdjustment.builder()
                .adjustNo(docNoGenerator.next("ST-", "staged_stock_adjustments", "adjust_no", "request_date", date))
                .requestDate(date)
                .item(item)
                .warehouse(warehouse)
                .bookQty(bookQty)
                .actualQty(req.actualQty())
                .reason(req.reason())
                .status(StagedStatus.REQUESTED)
                .requester(username)
                .build();
        return StagedResponse.from(stagedRepository.save(staged));
    }

    /** 반영(승인) — 일반 재고조정(ADJUST)을 생성해 실제 재고를 실사수량에 맞춘다. */
    @Transactional
    public StagedResponse apply(Long id, String username) {
        StagedStockAdjustment staged = get(id);
        requireRequested(staged);
        stockAdjustmentService.create(new CreateAdjustmentRequest(
                StockAdjustmentType.ADJUST,
                staged.getItem().getId(),
                staged.getWarehouse().getId(),
                null,
                staged.getActualQty(),
                LocalDate.now(),
                /* 단계별조정은 프로젝트·담당자를 따로 받지 않는다 — 실사 결과를 그대로 맞추는 자리다. */
                null, null,
                "단계별조정 " + staged.getAdjustNo()
                        + (staged.getReason() != null && !staged.getReason().isBlank() ? " (" + staged.getReason() + ")" : "")
        ), username);
        staged.setStatus(StagedStatus.APPLIED);
        staged.setHandler(username);
        return StagedResponse.from(staged);
    }

    @Transactional
    public StagedResponse reject(Long id, String username) {
        StagedStockAdjustment staged = get(id);
        requireRequested(staged);
        staged.setStatus(StagedStatus.REJECTED);
        staged.setHandler(username);
        return StagedResponse.from(staged);
    }

    @Transactional
    public void delete(Long id) {
        StagedStockAdjustment staged = get(id);
        if (staged.getStatus() == StagedStatus.APPLIED) {
            throw ApiException.badRequest("이미 반영된 조정은 삭제할 수 없습니다.");
        }
        stagedRepository.delete(staged);
    }

    private void requireRequested(StagedStockAdjustment staged) {
        if (staged.getStatus() != StagedStatus.REQUESTED) {
            throw ApiException.badRequest("이미 처리된 조정입니다(현재: " + staged.getStatus().getDisplayName() + ").");
        }
    }

    private StagedStockAdjustment get(Long id) {
        return stagedRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("단계별조정을 찾을 수 없습니다. id=" + id));
    }
}
