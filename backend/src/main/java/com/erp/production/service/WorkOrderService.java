package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.domain.Item;
import com.erp.inventory.domain.Warehouse;
import com.erp.production.domain.WorkOrder;
import com.erp.production.dto.ProductionDtos.CreateWorkOrderRequest;
import com.erp.production.dto.ProductionDtos.WorkOrderResponse;
import com.erp.inventory.service.ItemService;
import com.erp.inventory.service.WarehouseService;
import com.erp.production.domain.ProductionPlanStatus;
import com.erp.production.repository.ProductionPlanRepository;
import com.erp.production.repository.ProductionRepository;
import com.erp.production.repository.WorkOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import com.erp.production.dto.ProductionDtos;

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
    private final com.erp.trade.service.PartnerService partnerService;

    @Transactional(readOnly = true)
    public List<WorkOrderResponse> findAll() {
        return findAll(null, null);
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

    private String generateOrderNo(LocalDate date) {
        return docNoGenerator.next("WO-", "work_orders", "order_no", "order_date", date);
    }
}
