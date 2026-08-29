package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.hr.service.EmployeeService;
import com.erp.inventory.service.ProjectService;
import com.erp.inventory.service.WarehouseService;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.domain.BusinessPartner;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.SalesOrder;
import com.erp.trade.domain.SalesOrderLine;
import com.erp.trade.domain.SalesOrderStatus;
import com.erp.trade.dto.SalesOrderDtos.CreateSalesOrderRequest;
import com.erp.trade.dto.SalesOrderDtos.OrderLineRequest;
import com.erp.trade.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.trade.dto.SalesOrderDtos.UnshippedLineResponse;
import com.erp.trade.dto.SalesOrderDtos.UnsoldLineResponse;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.trade.repository.SalesLineRepository;
import com.erp.trade.domain.OrderStage;
import com.erp.trade.domain.OrderType;
import com.erp.trade.domain.OrderTypeStep;
import com.erp.trade.repository.OrderStageRepository;
import com.erp.trade.repository.OrderTypeRepository;
import com.erp.trade.repository.OrderTypeStepRepository;
import com.erp.trade.repository.SalesOrderRepository;
import com.erp.inventory.service.ItemService;
import com.erp.trade.repository.ShipmentRepository;
import com.erp.trade.repository.QuotationRepository;
import com.erp.trade.domain.QuotationStatus;
import com.erp.trade.domain.ShipmentStatus;
import com.erp.trade.repository.ShipmentLineRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.erp.trade.dto.SalesOrderDtos;

@Service
@RequiredArgsConstructor
public class SalesOrderService {

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final SalesOrderRepository salesOrderRepository;
    /* 다른 모듈의 값은 그 모듈의 service 를 거친다(CLAUDE.md 4.2). */
    private final WarehouseService warehouseService;
    private final ProjectService projectService;
    private final EmployeeService employeeService;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemService itemService;
    private final SalesLineRepository salesLineRepository;
    private final ShipmentRepository shipmentRepository;
    private final QuotationRepository quotationRepository;
    private final ShipmentLineRepository shipmentLineRepository;
    private final DocumentNoGenerator docNoGenerator;
    private final OrderTypeRepository orderTypeRepository;
    private final OrderStageRepository orderStageRepository;
    private final OrderTypeStepRepository orderTypeStepRepository;

    @Transactional(readOnly = true)
    public List<SalesOrderResponse> findAll() {
        return salesOrderRepository.findAllWithPartner().stream()
                .map(SalesOrderResponse::from)
                .toList();
    }

    /**
     * 미출하현황: 접수·진행중 주문의 라인들(완료·취소 제외).
     *
     * <p><b>미출하잔량 = 주문수량 − (출하지시 + 출하완료)</b>. 취소된 출하는 빠진다.
     * 예전에는 출하<b>완료</b>분만 뺐는데, 그러면 출하지시만 낸 수량이 계속 미출하로 남아
     * 화면을 믿고 또 지시를 내면 "출하수량이 잔량을 초과합니다" 로 거부당했다.
     * 화면이 말하는 미출하수량과 실제로 낼 수 있는 잔량이 서로 달랐다.
     */
    @Transactional(readOnly = true)
    public List<UnshippedLineResponse> findUnshipped() {
        List<SalesOrderStatus> open = List.of(SalesOrderStatus.RECEIVED, SalesOrderStatus.IN_PROGRESS);
        Map<Long, BigDecimal> committed = new HashMap<>();
        for (Object[] row : shipmentLineRepository.sumQuantityByOrderLineAll(
                List.of(ShipmentStatus.READY, ShipmentStatus.SHIPPED))) {
            committed.put((Long) row[0], (BigDecimal) row[1]);
        }
        return salesOrderRepository.findByStatusesWithLines(open).stream()
                .flatMap(o -> o.getLines().stream()
                        .map(l -> UnshippedLineResponse.of(o, l,
                                committed.getOrDefault(l.getId(), BigDecimal.ZERO))))
                // 미출하가 남은 줄만. 다 낸 줄이 목록에 남아 있으면 이름과 달리
                // "아직 낼 게 있다" 고 읽히고, 출하지시 버튼도 0 짜리로 눌린다.
                .filter(r -> r.unshippedQty().signum() > 0)
                .toList();
    }

    /**
     * 미판매현황: 접수·진행중 주문의 라인 중 아직 판매 전표로 안 끊은 잔량.
     * 미출하(출하 여부)와 다른 질문이다 — 출하는 됐는데 매출을 못 잡은 건도 여기 남는다.
     */
    @Transactional(readOnly = true)
    public List<UnsoldLineResponse> findUnsold() {
        Map<String, BigDecimal> sold = new HashMap<>();
        for (SalesLineRepository.OrderItemAggregate a : salesLineRepository.aggregateSoldByOrderAndItem()) {
            sold.merge(a.getOrderId() + ":" + a.getItemId(), a.getQty(), BigDecimal::add);
        }
        List<SalesOrderStatus> open = List.of(SalesOrderStatus.RECEIVED, SalesOrderStatus.IN_PROGRESS);
        return salesOrderRepository.findByStatusesWithLines(open).stream()
                .flatMap(o -> o.getLines().stream()
                        .map(l -> UnsoldLineResponse.of(o, l, sold.get(o.getId() + ":" + l.getItem().getId()))))
                .filter(r -> r.unsoldQty().signum() > 0)
                .toList();
    }

    @Transactional
    public SalesOrderResponse create(CreateSalesOrderRequest req, String username) {
        BusinessPartner partner = TradeMasters.requireUsable(partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId())));
        if (!partner.getType().canSell()) {
            throw ApiException.badRequest("매출처가 아닌 거래처에는 주문을 받을 수 없습니다: " + partner.getName());
        }

        boolean taxable = req.taxable() == null || req.taxable();
        LocalDate orderDate = req.orderDate() != null ? req.orderDate() : LocalDate.now();

        SalesOrder order = SalesOrder.builder()
                .orderNo(generateOrderNo(orderDate))
                .partner(partner)
                .orderDate(orderDate)
                .dueDate(req.dueDate())
                .warehouse(req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId()))
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .employee(req.employeeId() == null ? null : employeeService.get(req.employeeId()))
                .status(SalesOrderStatus.RECEIVED)
                .remark(req.remark())
                .createdBy(username)
                .build();

        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;

        for (OrderLineRequest lr : req.lines()) {
            Item item = itemService.getUsable(lr.itemId());
            BigDecimal supply = lr.quantity().multiply(lr.unitPrice());
            BigDecimal vat = taxable ? supply.multiply(VAT_RATE).setScale(0, RoundingMode.HALF_UP) : BigDecimal.ZERO;

            order.addLine(SalesOrderLine.builder()
                    .item(item)
                    .quantity(lr.quantity())
                    .unitPrice(lr.unitPrice())
                    .supplyAmount(supply)
                    .vatAmount(vat)
                    .build());

            totalSupply = totalSupply.add(supply);
            totalVat = totalVat.add(vat);
        }

        order.setSupplyAmount(totalSupply);
        order.setVatAmount(totalVat);
        order.setTotalAmount(totalSupply.add(totalVat));

        return SalesOrderResponse.from(salesOrderRepository.save(order));
    }

    /**
     * 오더관리 유형·진행단계 지정. (오더관리진행단계 화면)
     *
     * <p>단계를 안 주면 <b>유형에 적힌 순서대로 한 칸</b> 나아간다. 유형에 단계가 없으면
     * 나아갈 곳이 없으므로 막는다 — 아무 단계나 찍어 주면 그 순서는 아무 뜻이 없다.
     *
     * <p>{@code complete} 면 마지막 단계로 보낸다(원본의 [전체단계완료]).
     */
    @Transactional
    public SalesOrderResponse updateStage(Long id, Long orderTypeId, Long stageId, boolean complete) {
        SalesOrder order = salesOrderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("수주를 찾을 수 없습니다. id=" + id));

        if (orderTypeId != null) {
            OrderType type = orderTypeRepository.findById(orderTypeId)
                    .orElseThrow(() -> ApiException.badRequest("오더유형을 찾을 수 없습니다. id=" + orderTypeId));
            order.setOrderType(type);
        }

        if (stageId != null) {
            OrderStage stage = orderStageRepository.findById(stageId)
                    .orElseThrow(() -> ApiException.badRequest("진행단계를 찾을 수 없습니다. id=" + stageId));
            order.setStage(stage);
            return SalesOrderResponse.from(order);
        }

        if (order.getOrderType() == null) {
            throw ApiException.badRequest("오더유형을 먼저 지정하세요. 유형이 있어야 다음 단계를 알 수 있습니다.");
        }
        List<OrderTypeStep> steps = orderTypeStepRepository.findByTypeWithStage(order.getOrderType().getId());
        if (steps.isEmpty()) {
            throw ApiException.badRequest(
                    "이 유형에 진행단계가 없습니다. 오더관리유형리스트에서 단계를 먼저 정하세요: "
                            + order.getOrderType().getName());
        }
        if (complete) {
            order.setStage(steps.get(steps.size() - 1).getStage());
            return SalesOrderResponse.from(order);
        }

        int current = -1;
        if (order.getStage() != null) {
            for (int i = 0; i < steps.size(); i++) {
                if (steps.get(i).getStage().getId().equals(order.getStage().getId())) {
                    current = i;
                    break;
                }
            }
        }
        if (current >= steps.size() - 1) {
            throw ApiException.badRequest("이미 마지막 단계입니다: " + order.getStage().getName());
        }
        order.setStage(steps.get(current + 1).getStage());
        return SalesOrderResponse.from(order);
    }

    @Transactional
    public SalesOrderResponse updateStatus(Long id, SalesOrderStatus status) {
        SalesOrder order = salesOrderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("주문서를 찾을 수 없습니다. id=" + id));
        order.setStatus(status);
        return SalesOrderResponse.from(order);
    }

    /**
     * 수주 삭제.
     *
     * <p>뒤에 붙은 것이 하나라도 있으면 막는다. 출하·판매전표가 이 수주를 근거로 가리키고
     * 있는데 수주만 사라지면 그쪽 화면에서 출처가 빈칸이 되고, 미출하·미판매 집계가 어긋난다.
     * 견적서도 전환 결과로 이 수주를 가리킨다.
     */
    @Transactional
    public void delete(Long id) {
        SalesOrder order = salesOrderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("주문서를 찾을 수 없습니다. id=" + id));
        if (shipmentRepository.existsBySalesOrderId(id)) {
            throw ApiException.conflict(
                    "출하가 있어 지울 수 없습니다. 먼저 출하를 지우세요: " + order.getOrderNo());
        }
        if (salesLineRepository.existsBySourceOrderId(id)) {
            throw ApiException.conflict(
                    "판매전표가 있어 지울 수 없습니다. 먼저 판매전표를 지우세요: " + order.getOrderNo());
        }
        // 견적서에서 전환된 수주면 그 견적서의 전환을 풀어 준다.
        //
        // 여기서 거절하면 아무것도 못 지운다 — 견적서는 "수주를 먼저 지우라" 하고
        // 수주는 "견적서를 먼저 되돌리라" 해서 둘이 서로를 막는다. 전환을 되돌리는 기능도 없다.
        // 수주가 사라지면 그 견적서는 전환된 적 없는 상태로 돌아가는 것이 맞다.
        //
        // 되돌릴 상태는 SENT 로 둔다. 발송 시각을 따로 저장하지 않아 전환 직전이 작성이었는지
        // 발송이었는지 알 수 없는데, 견적은 보통 고객에게 보낸 뒤 수주로 넘어간다.
        quotationRepository.findByConvertedOrderId(id).ifPresent(q -> {
            q.setConvertedOrderId(null);
            q.setStatus(QuotationStatus.SENT);
        });
        salesOrderRepository.delete(order);
    }

    private String generateOrderNo(LocalDate date) {
        return docNoGenerator.next("SN-", "sales_orders", "order_no", "order_date", date);
    }

    /** 통합검색용. 수주번호·거래처명 부분일치 상위 limit 건과 총 건수. */
    @Transactional(readOnly = true)
    public List<SalesOrderResponse> search(String like, int limit) {
        return salesOrderRepository.searchTop(like, PageRequest.of(0, limit)).stream()
                .map(SalesOrderResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public long searchCount(String like) {
        return salesOrderRepository.searchCount(like);
    }

}
