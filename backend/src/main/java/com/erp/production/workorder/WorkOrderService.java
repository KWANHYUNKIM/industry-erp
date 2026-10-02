package com.erp.production.workorder;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.item.Item;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.production.production.dto.ProductionDtos.CreateWorkOrderRequest;
import com.erp.production.production.dto.ProductionDtos.WorkOrderResponse;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.warehouse.WarehouseService;
import com.erp.production.productionplan.ProductionPlanStatus;
import com.erp.production.productionplan.ProductionPlanRepository;
import com.erp.production.production.ProductionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.production.production.dto.ProductionDtos;

@Service
@RequiredArgsConstructor
public class WorkOrderService {

    private final WorkOrderRepository workOrderRepository;
    // inventory 의 공개 service 를 거친다(CLAUDE.md 4.2). 리포지토리를 직접 잡으면
    // 사용중지 검사를 통째로 건너뛴다 — 실제로 건너뛰고 있었다.
    private final ItemService itemService;
    private final WarehouseService warehouseService;
    private final DocumentNoGenerator docNoGenerator;
    private final ProductionRepository productionRepository;
    private final ProductionPlanRepository planRepository;
    /**
     * 납품처를 붙이려면 거래처를 읽어야 한다. trade 의 공개 service 를 거친다 —
     * 리포지토리를 직접 주입하면 그 모듈의 규칙을 우회하게 된다(CLAUDE.md 4.2).
     */
    private final com.erp.trade.partner.PartnerService partnerService;
    /** 프로젝트는 inventory 의 공개 service 를 거친다(4.2). */
    private final com.erp.inventory.project.ProjectService projectService;

    @Transactional(readOnly = true)
    public List<WorkOrderResponse> findAll() {
        return findAll(null, null);
    }

    /** 고르는 칸에 쓸 목록 — 지시번호와 품목만 낸다. */
    @Transactional(readOnly = true)
    public List<com.erp.production.production.dto.ProductionDtos.WorkOrderOption> findOptions() {
        return workOrderRepository.findAllWithRefs().stream()
                .map(com.erp.production.production.dto.ProductionDtos.WorkOrderOption::from).toList();
    }

    /**
     * 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다).
     *
     * <p>응답 모양은 <b>그대로 둔다.</b> 여러 화면이 알몸 배열을 기대하고 있어,
     * 자르는 껍데기를 씌우면 안 고친 곳이 조용히 빈 표가 된다.
     */
    @Transactional(readOnly = true)
    public List<WorkOrderResponse> findAll(LocalDate from, LocalDate to) {
        var found = (from == null && to == null)
                ? workOrderRepository.findAllWithRefs()
                : workOrderRepository.findWithRefsByPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1),
                        to != null ? to : LocalDate.of(9999, 12, 31));
        return found.stream()
                .map(WorkOrderResponse::from)
                .toList();
    }

    /**
     * 작업지시 삭제.
     *
     * <p>삭제가 아예 없었다. 품목이나 수량을 잘못 넣은 작업지시는 지울 방법이 없어
     * 목록에 죽은 지시가 계속 쌓였다 — 견적·수주·발주·출하에서 이미 한 번 고친 것과 같다.
     *
     * <p>생산실적이 붙어 있으면 막는다. 실적만 남고 지시가 사라지면 재고가 왜 움직였는지
     * 설명할 수 없고 효율현황의 계획수량이 통째로 비어 버린다. 실적을 먼저 지우면 된다.
     *
     * <p>생산계획에서 나온 지시라면 계획의 연결을 풀어 준다. 안 그러면 계획이 '지시완료' 인
     * 채로 다시 지시할 수도 없는 상태가 된다.
     */
    @Transactional
    public void delete(Long id) {
        WorkOrder wo = workOrderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("작업지시를 찾을 수 없습니다. id=" + id));

        long results = productionRepository.countByWorkOrder_Id(id);
        if (results > 0) {
            throw ApiException.badRequest(
                    "생산실적이 있는 작업지시는 삭제할 수 없습니다. 실적 " + results + "건을 먼저 지우세요: "
                            + wo.getOrderNo());
        }

        planRepository.findByWorkOrder_Id(id).forEach(plan -> {
            plan.setWorkOrder(null);
            plan.setStatus(ProductionPlanStatus.CONFIRMED);
        });

        workOrderRepository.delete(wo);
    }

    @Transactional
    public WorkOrderResponse create(CreateWorkOrderRequest req, String username) {
        Item product = itemService.getUsable(req.productId());
        Warehouse warehouse = warehouseService.getUsable(req.warehouseId());

        LocalDate orderDate = req.orderDate() != null ? req.orderDate() : LocalDate.now();

        WorkOrder wo = WorkOrder.builder()
                .orderNo(generateOrderNo(orderDate))
                .product(product)
                .warehouse(warehouse)
                .plannedQty(req.plannedQty())
                .orderDate(orderDate)
                .dueDate(req.dueDate())
                .partner(req.partnerId() != null ? partnerService.get(req.partnerId()) : null)
                // 담당자는 id 만 든다 — production 은 hr 을 참조할 수 없다(순환).
                .employeeId(req.employeeId())
                .remark(req.remark())
                .createdBy(username)
                .build();

        return WorkOrderResponse.from(workOrderRepository.save(wo));
    }

    /** 전표 하나의 줄들. 원본 작업지시서조회에서 번호를 눌러 여는 것. */
    @Transactional(readOnly = true)
    public List<WorkOrderResponse> findSlip(String orderNo) {
        List<WorkOrder> rows = workOrderRepository.findSlip(orderNo);
        if (rows.isEmpty()) throw ApiException.notFound("작업지시서를 찾을 수 없습니다: " + orderNo);
        return rows.stream().map(WorkOrderResponse::from).toList();
    }

    /** 원본 작업지시서입력 [저장] — 줄이 몇 개든 번호 하나. */
    @Transactional
    public List<WorkOrderResponse> createSlip(ProductionDtos.SaveWorkOrderSlipRequest req, String username) {
        LocalDate orderDate = req.orderDate() != null ? req.orderDate() : LocalDate.now();
        return saveSlip(req, generateOrderNo(orderDate), orderDate, List.of(), username);
    }

    /**
     * 전표 고치기. 줄 차례가 같은 줄은 <b>같은 행을 고친다</b> — 생산입고·생산불출이 그 id 를 가리키고 있어서
     * 지우고 다시 만들면 연결이 끊긴다. 남는 줄은 지우고(실적이 있으면 막는다), 늘어난 줄은 새로 만든다.
     *
     * <p>이미 생산한 줄은 품목을 바꿀 수 없고 지시수량을 기생산 밑으로 줄일 수 없다 —
     * 실적과 지시가 서로 다른 품목·수량을 말하게 된다.
     */
    @Transactional
    public List<WorkOrderResponse> updateSlip(String orderNo, ProductionDtos.SaveWorkOrderSlipRequest req, String username) {
        List<WorkOrder> old = workOrderRepository.findSlip(orderNo);
        if (old.isEmpty()) throw ApiException.notFound("작업지시서를 찾을 수 없습니다: " + orderNo);
        LocalDate orderDate = req.orderDate() != null ? req.orderDate() : old.get(0).getOrderDate();
        return saveSlip(req, orderNo, orderDate, old, username);
    }

    /** 전표째 삭제. 줄 하나라도 생산실적이 있으면 막는다. */
    @Transactional
    public void deleteSlip(String orderNo) {
        List<WorkOrder> rows = workOrderRepository.findSlip(orderNo);
        if (rows.isEmpty()) throw ApiException.notFound("작업지시서를 찾을 수 없습니다: " + orderNo);
        for (WorkOrder wo : rows) delete(wo.getId());
    }

    private List<WorkOrderResponse> saveSlip(ProductionDtos.SaveWorkOrderSlipRequest req, String orderNo,
                                             LocalDate orderDate, List<WorkOrder> old, String username) {
        var partner = req.partnerId() != null ? partnerService.get(req.partnerId()) : null;
        var project = req.projectId() != null ? projectService.get(req.projectId()) : null;
        List<WorkOrderResponse> out = new java.util.ArrayList<>();
        int lineNo = 0;
        for (var line : req.lines()) {
            lineNo++;
            Item product = itemService.getUsable(line.productId());
            Warehouse warehouse = warehouseService.getUsable(line.warehouseId());
            WorkOrder wo = lineNo <= old.size() ? old.get(lineNo - 1) : null;
            if (wo == null) {
                wo = WorkOrder.builder().orderNo(orderNo).createdBy(username).build();
            } else if (wo.getProducedQty().signum() > 0) {
                if (!wo.getProduct().getId().equals(product.getId())) {
                    throw ApiException.badRequest(lineNo + "번째 줄: 이미 생산한 줄은 품목을 바꿀 수 없습니다(" + wo.getProduct().getName() + ").");
                }
                if (line.plannedQty().compareTo(wo.getProducedQty()) < 0) {
                    throw ApiException.badRequest(lineNo + "번째 줄: 지시수량을 기생산(" + wo.getProducedQty().toPlainString() + ")보다 줄일 수 없습니다.");
                }
            }
            wo.setLineNo(lineNo);
            wo.setProduct(product);
            wo.setWarehouse(warehouse);
            wo.setPlannedQty(line.plannedQty());
            wo.setOrderDate(orderDate);
            wo.setDueDate(req.dueDate());
            wo.setPartner(partner);
            wo.setProject(project);
            // 담당자는 id 만 든다 — production 은 hr 을 참조할 수 없다(순환).
            wo.setEmployeeId(req.employeeId());
            wo.setRemark(req.remark());
            // 지시수량이 바뀌면 진행상태도 다시 센다.
            if (wo.getProducedQty().signum() > 0) {
                wo.setStatus(wo.getProducedQty().compareTo(wo.getPlannedQty()) >= 0
                        ? WorkOrderStatus.COMPLETED : WorkOrderStatus.IN_PROGRESS);
            }
            out.add(WorkOrderResponse.from(workOrderRepository.save(wo)));
        }
        for (int i = req.lines().size(); i < old.size(); i++) delete(old.get(i).getId());
        return out;
    }

    private String generateOrderNo(LocalDate date) {
        return docNoGenerator.next("WO-", "work_orders", "order_no", "order_date", date);
    }
}
