package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.production.domain.MaterialIssue;
import com.erp.inventory.domain.Warehouse;
import com.erp.production.domain.WorkOrder;
import com.erp.production.dto.MaterialIssueDtos.CreateMaterialIssueRequest;
import com.erp.production.dto.MaterialIssueDtos.MaterialIssueResponse;
import com.erp.inventory.service.ItemService;
import com.erp.production.dto.MaterialIssueDtos.CreateMaterialIssueBatchRequest;
import com.erp.production.dto.MaterialIssueDtos.IssueLine;
import com.erp.production.repository.MaterialIssueRepository;
import com.erp.inventory.domain.StockTransactionType;
import com.erp.inventory.service.WarehouseService;
import com.erp.inventory.service.StockService;
import com.erp.inventory.service.ProjectService;
import com.erp.production.repository.WorkOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.production.dto.MaterialIssueDtos;

@Service
@RequiredArgsConstructor
public class MaterialIssueService {

    private final MaterialIssueRepository materialIssueRepository;
    /*
     * inventory 의 공개 service 를 거친다(CLAUDE.md 4.2). 리포지토리를 직접 잡으면
     * 그 모듈의 불변식을 우회하는데, 여기서는 실제로 우회하고 있었다 —
     * 사용중지한 자재·창고로도 생산불출이 그대로 됐다.
     */
    private final ItemService itemService;
    private final WarehouseService warehouseService;
    private final WorkOrderRepository workOrderRepository;
    private final StockService stockService;
    private final ProjectService projectService;

    @Transactional(readOnly = true)
    public List<MaterialIssueResponse> findAll(Long itemId, LocalDate from, LocalDate to) {
        return materialIssueRepository.findAllWithRefs().stream()
                .filter(mi -> itemId == null || mi.getItem().getId().equals(itemId))
                .filter(mi -> from == null || !mi.getIssueDate().isBefore(from))
                .filter(mi -> to == null || !mi.getIssueDate().isAfter(to))
                .map(MaterialIssueResponse::from)
                .toList();
    }

    @Transactional
    public MaterialIssueResponse create(CreateMaterialIssueRequest req) {
        Item item = itemService.getUsable(req.itemId());

        Warehouse warehouse = req.warehouseId() == null ? null
                : warehouseService.getUsable(req.warehouseId());

        WorkOrder workOrder = null;
        if (req.workOrderId() != null) {
            workOrder = workOrderRepository.findById(req.workOrderId())
                    .orElseThrow(() -> ApiException.notFound("작업지시를 찾을 수 없습니다. id=" + req.workOrderId()));
        }

        Warehouse toWarehouse = req.toWarehouseId() == null ? null
                : warehouseService.getUsable(req.toWarehouseId());
        if (warehouse != null && toWarehouse != null && warehouse.getId().equals(toWarehouse.getId())) {
            throw ApiException.badRequest("보내는창고와 받는공장이 같습니다: " + warehouse.getName());
        }

        LocalDate date = req.issueDate() != null ? req.issueDate() : LocalDate.now();
        MaterialIssue mi = MaterialIssue.builder()
                .item(item)
                .warehouse(warehouse)
                .toWarehouse(toWarehouse)
                .workOrder(workOrder)
                .qty(req.qty())
                .issueDate(date)
                .employeeId(req.employeeId())
                /* 다른 모듈의 것은 그 모듈 service 를 거쳐 얻는다(CLAUDE.md 4.2). */
                .project(req.projectId() != null ? projectService.get(req.projectId()) : null)
                .note(req.note())
                .build();
        MaterialIssue saved = materialIssueRepository.save(mi);

        /*
         * 재고를 실제로 옮긴다.
         *
         * <p>예전에는 불출을 <b>기록만</b> 하고 창고 재고는 그대로였다 — 자재를 공장으로 보냈는데
         * 창고에는 그대로 있는 것으로 보였고, 재고현황과 불출현황이 서로 다른 말을 했다.
         * 보내는창고에서 빼고 받는공장에 넣는다. 재고가 모자라면 여기서 막힌다(전체 롤백).
         */
        if (warehouse != null) {
            stockService.applyDelta(item, warehouse, req.qty().negate(),
                    StockTransactionType.OUTBOUND, null, date, "생산불출 " + noteOf(saved), null);
        }
        if (toWarehouse != null) {
            stockService.applyDelta(item, toWarehouse, req.qty(),
                    StockTransactionType.INBOUND, null, date, "생산불출 입고 " + noteOf(saved), null);
        }
        return MaterialIssueResponse.from(saved);
    }

    /**
     * 격자로 받은 여러 줄을 <b>한 트랜잭션</b>에 넣는다(원본 생산불출입력).
     *
     * <p>한 줄이라도 막히면 전부 되돌린다 — 재고가 모자라 세 줄 중 두 줄만 들어가면
     * 창고 수량도 전표도 반쪽이 되고, 사람은 무엇이 들어갔는지 모른다.
     */
    @Transactional
    public List<MaterialIssueResponse> createBatch(CreateMaterialIssueBatchRequest req) {
        List<MaterialIssueResponse> out = new java.util.ArrayList<>();
        for (IssueLine line : req.lines()) {
            out.add(create(new CreateMaterialIssueRequest(
                    line.itemId(), req.warehouseId(), req.toWarehouseId(), req.workOrderId(),
                    line.qty(), req.issueDate(), req.employeeId(), req.projectId(), line.note())));
        }
        return out;
    }

    /** 재고 이력에 적을 이름. 작업지시가 있으면 그 번호로 되짚을 수 있게 한다. */
    private String noteOf(MaterialIssue mi) {
        return mi.getWorkOrder() != null ? mi.getWorkOrder().getOrderNo() : ("#" + mi.getId());
    }

    @Transactional
    public void delete(Long id) {
        MaterialIssue mi = materialIssueRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("생산불출 내역을 찾을 수 없습니다. id=" + id));

        // 옮겼던 재고를 되돌린다. 이력은 지우지 않고 반대 거래를 남긴다.
        if (mi.getToWarehouse() != null) {
            stockService.applyDelta(mi.getItem(), mi.getToWarehouse(), mi.getQty().negate(),
                    StockTransactionType.OUTBOUND, null, mi.getIssueDate(),
                    "생산불출취소 " + noteOf(mi), null);
        }
        if (mi.getWarehouse() != null) {
            stockService.applyDelta(mi.getItem(), mi.getWarehouse(), mi.getQty(),
                    StockTransactionType.INBOUND, null, mi.getIssueDate(),
                    "생산불출취소 " + noteOf(mi), null);
        }
        materialIssueRepository.delete(mi);
    }
}
