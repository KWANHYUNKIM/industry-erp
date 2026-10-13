package com.erp.inventory.adjustment;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.item.Item;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.inventory.adjustment.dto.StagedAdjustmentDtos.BulkAdjustRequest;
import com.erp.inventory.adjustment.dto.StagedAdjustmentDtos.BulkAdjustResult;
import com.erp.inventory.adjustment.dto.StagedAdjustmentDtos.CreateStagedRequest;
import com.erp.inventory.adjustment.dto.StagedAdjustmentDtos.StagedResponse;
import com.erp.inventory.adjustment.dto.StockAdjustmentDtos.CreateAdjustmentRequest;
import com.erp.inventory.item.ItemRepository;
import com.erp.inventory.stock.StockService;
import com.erp.inventory.warehouse.WarehouseRepository;
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
    private final StockService stockService;
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

        LocalDate date = req.requestDate() != null ? req.requestDate() : LocalDate.now();
        /*
         * 장부수량은 <b>실사일자의</b> 재고다(없으면 0). 예전에는 입력하는 순간의 현재고를 박아서,
         * 9/30 실사를 10/3 에 넣으면 그 사이 출고만큼 [차이]가 생겼다 — 재고실사현황의
         * 장부·차이 합계가 통째로 어긋난다. 재고조정(adjustTo)이 지난 날짜를 견주는 방식과 같다.
         */
        BigDecimal bookQty = stockService.quantityOn(item.getId(), warehouse.getId(), date);
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
        stockAdjustmentService.createWithoutStocktake(new CreateAdjustmentRequest(
                StockAdjustmentType.ADJUST,
                staged.getItem().getId(),
                staged.getWarehouse().getId(),
                null,
                staged.getActualQty(),
                LocalDate.now(),
                /* 단계별조정은 프로젝트·담당자를 따로 받지 않는다 — 실사 결과를 그대로 맞추는 자리다. */
                null, null,
                "단계별조정 " + staged.getAdjustNo()
                        + (staged.getReason() != null && !staged.getReason().isBlank() ? " (" + staged.getReason() + ")" : ""),
                /* 재고조정에는 [불량유형]·[처리방법]이 없다 — 그 둘은 불량처리·자가사용 쪽 칸이다. */
                null, null
        ), username);
        staged.setStatus(StagedStatus.APPLIED);
        staged.setHandler(username);
        return StagedResponse.from(staged);
    }

    /**
     * 원본 재고조정진행단계 [재고조정] → 단계별재고조정 [저장(F8)] (2026-10-13 loginaa 실측).
     * <b>기준일자에 넣은</b> 단계별 실사를 그 날짜의 재고조정으로 만든다 — 실사 포장김치 본사창고 100(장부 348)을
     * 기준일자 10/13 · 본사창고로 저장하니 재고조정조회에 '단계별 · 26/10/13-2 · 본사창고 · 포장김치 [1KG] · 248' 이 섰다.
     * 조정일자는 오늘이 아니라 기준일자다. [실수량을 변경하지 않은 품목의 수량 0으로 조정]을 켜면
     * 그 날 실사가 없는 품목 중 재고가 남은 것을 0 으로 맞춘다(창 문구 그대로).
     */
    @Transactional
    public BulkAdjustResult adjustAll(BulkAdjustRequest req, String username) {
        java.util.Set<Long> whs = req.warehouseIds() == null ? java.util.Set.of() : new java.util.HashSet<>(req.warehouseIds());
        java.util.function.Predicate<Long> inScope = (wid) -> whs.isEmpty() || whs.contains(wid);
        List<StagedStockAdjustment> counted = stagedRepository.findWithRefsByPeriod(req.date(), req.date()).stream()
                .filter(s -> inScope.test(s.getWarehouse().getId()))
                .toList();
        int n = 0;
        for (StagedStockAdjustment s : counted) {
            if (s.getStatus() != StagedStatus.REQUESTED) continue;
            /* 그 날 재고가 이미 실사수량이면 맞출 차이가 없다 — 조정 없이 반영으로만 넘긴다(같은 품목 실사가 둘이면 둘째가 그렇다). */
            if (stockService.quantityOn(s.getItem().getId(), s.getWarehouse().getId(), req.date()).compareTo(s.getActualQty()) == 0) {
                s.setStatus(StagedStatus.APPLIED);
                s.setHandler(username);
                continue;
            }
            applyOn(s, req.date(), req.reason(), username);
            n++;
        }
        if (req.zeroUncounted()) {
            java.util.Set<String> seen = new java.util.HashSet<>();
            for (StagedStockAdjustment s : counted) seen.add(s.getItem().getId() + ":" + s.getWarehouse().getId());
            for (var row : stockService.stockAsOf(req.date())) {
                if (!inScope.test(row.warehouseId())) continue;
                if (row.quantity() == null || row.quantity().signum() == 0) continue;
                if (!seen.add(row.itemId() + ":" + row.warehouseId())) continue;
                stockAdjustmentService.createWithoutStocktake(new CreateAdjustmentRequest(
                        StockAdjustmentType.ADJUST, row.itemId(), row.warehouseId(), null, BigDecimal.ZERO, req.date(),
                        null, null, stagedReason("단계별조정 실사없음", req.reason()), null, null), username);
                n++;
            }
        }
        return new BulkAdjustResult(n);
    }

    private void applyOn(StagedStockAdjustment staged, LocalDate date, String reason, String username) {
        stockAdjustmentService.createWithoutStocktake(new CreateAdjustmentRequest(
                StockAdjustmentType.ADJUST,
                staged.getItem().getId(),
                staged.getWarehouse().getId(),
                null,
                staged.getActualQty(),
                date,
                null, null,
                stagedReason("단계별조정 " + staged.getAdjustNo(), reason != null && !reason.isBlank() ? reason : staged.getReason()),
                null, null
        ), username);
        staged.setStatus(StagedStatus.APPLIED);
        staged.setHandler(username);
    }

    private static String stagedReason(String head, String reason) {
        return head + (reason != null && !reason.isBlank() ? " (" + reason + ")" : "");
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
