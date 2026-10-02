package com.erp.production.materialissue;

import com.erp.common.ApiException;
import com.erp.inventory.item.Item;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.production.workorder.WorkOrder;
import com.erp.production.materialissue.dto.MaterialIssueDtos.CreateMaterialIssueRequest;
import com.erp.production.materialissue.dto.MaterialIssueDtos.MaterialIssueResponse;
import com.erp.inventory.item.ItemService;
import com.erp.production.materialissue.dto.MaterialIssueDtos.CreateMaterialIssueBatchRequest;
import com.erp.production.materialissue.dto.MaterialIssueDtos.IssueLine;
import com.erp.inventory.stock.StockTransactionType;
import com.erp.inventory.warehouse.WarehouseService;
import com.erp.inventory.stock.StockService;
import com.erp.inventory.project.ProjectService;
import com.erp.production.workorder.WorkOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.production.materialissue.dto.MaterialIssueDtos;

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
    private final com.erp.common.DocumentNoGenerator docNoGenerator;
    private final com.erp.production.bom.BomService bomService;

    @Transactional(readOnly = true)
    public List<MaterialIssueResponse> findAll(Long itemId, LocalDate from, LocalDate to) {
        return findAll(itemId, from, to, null, null);
    }

    /**
     * 목록. 기간 축이 <b>둘</b>이다 — <b>from·to 는 불출일</b>, <b>woFrom·woTo 는 지시일</b>.
     *
     * <p>뒤는 작업지시별로 묶어 진행을 세는 화면이 쓴다. 그 화면의 기간은 지시일이고,
     * 기간 안의 지시에 <b>그 밖의 날에 찍힌 불출</b>이 있으면 그것까지 세어야 한다 —
     * 불출일로 자르면 덜 낸 것처럼 보인다. 생산실적과 같은 규칙이라
     * <b>둘을 함께 주면 거절한다</b>(ProductionService.findAll 참고).
     *
     * <p>지시가 없는 불출(기타 불출)은 지시일로 물으면 <b>빠진다</b> — 묻는 것이
     * "이 지시가 얼마나 났나" 라서, 지시에 안 붙은 줄은 그 질문의 답이 아니다.
     */
    @Transactional(readOnly = true)
    public List<MaterialIssueResponse> findAll(Long itemId, LocalDate from, LocalDate to,
                                               LocalDate woFrom, LocalDate woTo) {
        boolean byOrder = woFrom != null || woTo != null;
        if (byOrder && (from != null || to != null)) {
            throw ApiException.badRequest("불출일(from·to)과 지시일(woFrom·woTo)을 함께 줄 수 없습니다. 한 축만 고르세요.");
        }
        return materialIssueRepository.findAllWithRefs().stream()
                .filter(mi -> itemId == null || mi.getItem().getId().equals(itemId))
                .filter(mi -> !byOrder || (mi.getWorkOrder() != null
                        && (woFrom == null || !mi.getWorkOrder().getOrderDate().isBefore(woFrom))
                        && (woTo == null || !mi.getWorkOrder().getOrderDate().isAfter(woTo))))
                .filter(mi -> byOrder || from == null || !mi.getIssueDate().isBefore(from))
                .filter(mi -> byOrder || to == null || !mi.getIssueDate().isAfter(to))
                .map(MaterialIssueResponse::from)
                .toList();
    }

    @Transactional
    public MaterialIssueResponse create(CreateMaterialIssueRequest req) {
        LocalDate date = req.issueDate() != null ? req.issueDate() : LocalDate.now();
        /* 다른 전표와 같은 방식으로 센다 — count()+1 은 지운 번호를 다시 쓴다. */
        return create(req, docNoGenerator.next("MI-", "material_issues", "issue_no", "issue_date", date));
    }

    private MaterialIssueResponse create(CreateMaterialIssueRequest req, String issueNo) {
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
                .issueNo(issueNo)
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
        /*
         * 원본은 줄이 몇 개든 전표번호가 하나다("2026/10/02 -1"). 줄마다 번호를 따로 매기면
         * 불출조회에 한 번 넣은 전표가 여러 건으로 보이고, 불출증도 줄마다 따로 찍힌다.
         */
        LocalDate date = req.issueDate() != null ? req.issueDate() : LocalDate.now();
        String issueNo = docNoGenerator.next("MI-", "material_issues", "issue_no", "issue_date", date);
        List<MaterialIssueResponse> out = new java.util.ArrayList<>();
        for (IssueLine line : req.lines()) {
            out.add(create(new CreateMaterialIssueRequest(
                    line.itemId(), req.warehouseId(), req.toWarehouseId(),
                    line.workOrderId() != null ? line.workOrderId() : req.workOrderId(),
                    line.qty(), date, req.employeeId(), req.projectId(), line.note()), issueNo));
        }
        return out;
    }

    /**
     * 작업지시서의 소요자재와 그동안 불출한 양. 원본 생산불출입력 [작업지시서] → [잔량으로BOM풀기]·[BOM풀기].
     *
     * <p>BOM 이 없는 제품은 줄이 안 나온다(풀 것이 없다). 같은 지시·같은 자재로 이미 낸 불출을 빼서
     * 잔량을 센다 — 지시 하나를 여러 번 나눠 불출하는 것이 보통이다.
     */
    @Transactional(readOnly = true)
    public List<MaterialIssueDtos.WorkOrderRequirement> requirements(List<Long> workOrderIds) {
        return requirements(workOrderIds, false);
    }

    /** all 이면 반제품을 끝까지 풀어 원재료로 낸다(원본 BOM풀기 [전체]). */
    @Transactional(readOnly = true)
    public List<MaterialIssueDtos.WorkOrderRequirement> requirements(List<Long> workOrderIds, boolean all) {
        List<MaterialIssueDtos.WorkOrderRequirement> out = new java.util.ArrayList<>();
        if (workOrderIds == null || workOrderIds.isEmpty()) return out;
        java.util.Map<String, java.math.BigDecimal> issued = new java.util.HashMap<>();
        for (MaterialIssue mi : materialIssueRepository.findByWorkOrderIdIn(workOrderIds)) {
            issued.merge(mi.getWorkOrder().getId() + ":" + mi.getItem().getId(), mi.getQty(), java.math.BigDecimal::add);
        }
        for (Long woId : workOrderIds) {
            WorkOrder wo = workOrderRepository.findById(woId)
                    .orElseThrow(() -> ApiException.notFound("작업지시를 찾을 수 없습니다. id=" + woId));
            for (var x : bomService.explode(wo.getProduct().getId(), wo.getPlannedQty(), all)) {
                Item c = x.component();
                java.math.BigDecimal required = x.quantity();
                java.math.BigDecimal done = issued.getOrDefault(wo.getId() + ":" + c.getId(), java.math.BigDecimal.ZERO);
                java.math.BigDecimal remaining = required.subtract(done).max(java.math.BigDecimal.ZERO);
                out.add(new MaterialIssueDtos.WorkOrderRequirement(
                        wo.getId(), wo.getOrderNo(), wo.getOrderDate(),
                        wo.getProduct().getId(), wo.getProduct().getCode(), wo.getProduct().getName(),
                        wo.getPlannedQty(),
                        wo.getPartner() != null ? wo.getPartner().getId() : null,
                        wo.getPartner() != null ? wo.getPartner().getName() : null,
                        wo.getEmployeeId(),
                        c.getId(), c.getCode(), c.getName(), c.getSpec(), c.getUnit(),
                        wo.getPlannedQty().signum() == 0 ? java.math.BigDecimal.ZERO
                                : required.divide(wo.getPlannedQty(), 6, java.math.RoundingMode.HALF_UP).stripTrailingZeros(),
                        required, done, remaining));
            }
        }
        return out;
    }

    /** 재고 이력에 적을 이름. 작업지시가 있으면 그 번호로 되짚을 수 있게 한다. */
    private String noteOf(MaterialIssue mi) {
        return mi.getWorkOrder() != null ? mi.getWorkOrder().getOrderNo() : ("#" + mi.getId());
    }

    /** 원본 [진행상태변경]. 미확인 ↔ 확인만 사람이 바꾼다 — 결재중은 전자결재가 정한다. 바꾼 전표 수를 준다. */
    @Transactional
    public int changeStatus(List<String> issueNos, com.erp.production.production.ProductionConfirmStatus status) {
        if (status == com.erp.production.production.ProductionConfirmStatus.IN_APPROVAL) throw ApiException.badRequest("결재중은 전자결재로만 바뀝니다.");
        int changed = 0;
        for (String no : issueNos) {
            List<MaterialIssue> rows = materialIssueRepository.findByIssueNo(no);
            if (rows.isEmpty()) throw ApiException.notFound("생산불출 전표를 찾을 수 없습니다: " + no);
            if (rows.get(0).getConfirmStatus() == com.erp.production.production.ProductionConfirmStatus.IN_APPROVAL) {
                throw ApiException.badRequest("전자결재 진행중인 전표입니다: " + no);
            }
            if (rows.get(0).getConfirmStatus() == status) continue;
            rows.forEach(r -> r.setConfirmStatus(status));
            changed++;
        }
        return changed;
    }

    @Transactional
    public void delete(Long id) {
        MaterialIssue mi = materialIssueRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("생산불출 내역을 찾을 수 없습니다. id=" + id));
        if (mi.getConfirmStatus() == com.erp.production.production.ProductionConfirmStatus.CONFIRMED) {
            throw ApiException.badRequest("확인된 전표는 지울 수 없습니다. 확인취소를 먼저 하세요: " + mi.getIssueNo());
        }

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
