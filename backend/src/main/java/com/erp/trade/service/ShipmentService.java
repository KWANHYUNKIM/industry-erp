package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.domain.BusinessPartner;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.SalesOrder;
import com.erp.trade.domain.SalesOrderLine;
import com.erp.trade.domain.SalesOrderStatus;
import com.erp.trade.domain.Shipment;
import com.erp.trade.domain.ShipmentLine;
import com.erp.trade.domain.ShipmentStatus;
import com.erp.trade.dto.SalesOrderDtos;
import com.erp.trade.dto.SalesOrderDtos.ShipRequest;
import com.erp.trade.dto.ShipmentDtos.CreateShipmentRequest;
import com.erp.trade.dto.ShipmentDtos.ShipLineRequest;
import com.erp.trade.dto.ShipmentDtos.ShipmentResponse;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.trade.repository.SalesOrderRepository;
import com.erp.trade.repository.ShipmentLineRepository;
import com.erp.trade.repository.ShipmentRepository;
import com.erp.inventory.service.ItemService;
import com.erp.inventory.service.WarehouseService;
import com.erp.hr.service.EmployeeService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.erp.trade.dto.ShipmentDtos;

@Service
@RequiredArgsConstructor
public class ShipmentService {

    /** 아직 출하완료되지 않았어도 이미 잡아둔 수량(초과출하 방지) */
    private static final List<ShipmentStatus> COMMITTED = List.of(ShipmentStatus.READY, ShipmentStatus.SHIPPED);
    private static final List<ShipmentStatus> SHIPPED_ONLY = List.of(ShipmentStatus.SHIPPED);

    private final ShipmentRepository shipmentRepository;
    private final ShipmentLineRepository shipmentLineRepository;
    private final SalesOrderRepository salesOrderRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemService itemService;
    private final WarehouseService warehouseService;
    private final EmployeeService employeeService;
    private final DocumentNoGenerator docNoGenerator;
    private final com.erp.inventory.service.ProjectService projectService;

    @Transactional(readOnly = true)
    public List<ShipmentResponse> findAll() {
        return findAll(null, null);
    }

    /**
     * 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다).
     *
     * <p>응답 모양은 <b>그대로 둔다.</b> 여러 화면이 알몸 배열을 기대하고 있어,
     * 자르는 껍데기를 씌우면 안 고친 곳이 조용히 빈 표가 된다.
     */
    @Transactional(readOnly = true)
    public List<ShipmentResponse> findAll(LocalDate from, LocalDate to) {
        var found = (from == null && to == null)
                ? shipmentRepository.findAllWithLines()
                : shipmentRepository.findWithLinesByPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1),
                        to != null ? to : LocalDate.of(9999, 12, 31));
        return found.stream()
                .map(ShipmentResponse::from)
                .toList();
    }

    /** 미출하현황: 아직 출하완료되지 않은(출하지시 상태) 출하 목록. */
    @Transactional(readOnly = true)
    public List<ShipmentResponse> findUnshipped() {
        return shipmentRepository.findByStatusWithLines(ShipmentStatus.READY).stream()
                .map(ShipmentResponse::from)
                .toList();
    }

    @Transactional
    public ShipmentResponse create(CreateShipmentRequest req, String username) {
        BusinessPartner partner = TradeMasters.requireUsable(partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId())));
        if (!partner.getType().canSell()) {
            throw ApiException.badRequest("매출처가 아닌 거래처로는 출하할 수 없습니다: " + partner.getName());
        }

        LocalDate shipDate = req.shipDate() != null ? req.shipDate() : LocalDate.now();

        Shipment shipment = Shipment.builder()
                .shipNo(generateShipNo(shipDate))
                .partner(partner)
                .shipDate(shipDate)
                // 출하예정일을 안 주면 출하일자로 본다 — 미출하현황이 그 값으로 거르므로
                // 비워 두면 그 화면에서 통째로 빠진다.
                .dueDate(req.dueDate() != null ? req.dueDate() : shipDate)
                .warehouse(req.warehouseId() != null ? warehouseService.get(req.warehouseId()) : null)
                .employee(req.employeeId() != null ? employeeService.getUsable(req.employeeId()) : null)
                .contact(req.contact())
                .postalCode(req.postalCode())
                // 배송지를 안 주면 거래처 주소를 기본으로 채운다. 대개 그리로 보내고,
                // 다른 곳이면 사람이 고친다.
                .address(req.address() != null && !req.address().isBlank()
                        ? req.address() : partner.getAddress())
                .status(ShipmentStatus.READY)
                .project(req.projectId() != null ? projectService.get(req.projectId()) : null)
                .remark(req.remark())
                .createdBy(username)
                .build();

        BigDecimal totalQty = BigDecimal.ZERO;
        BigDecimal totalAmount = BigDecimal.ZERO;

        for (ShipLineRequest lr : req.lines()) {
            Item item = itemService.getUsable(lr.itemId());
            BigDecimal unitPrice = lr.unitPrice() != null ? lr.unitPrice() : item.getUnitPrice();
            BigDecimal amount = lr.quantity().multiply(unitPrice);

            shipment.addLine(ShipmentLine.builder()
                    .item(item)
                    .quantity(lr.quantity())
                    .unitPrice(unitPrice)
                    .amount(amount)
                    .remark(lr.remark())
                    .build());

            totalQty = totalQty.add(lr.quantity());
            totalAmount = totalAmount.add(amount);
        }

        shipment.setTotalQuantity(totalQty);
        shipment.setTotalAmount(totalAmount);

        return ShipmentResponse.from(shipmentRepository.save(shipment));
    }

    /**
     * 주문(수주)에서 출하를 생성한다. lines가 비어 있으면 남은 잔량 전체를 출하지시한다.
     * 생성 시점에는 출하지시(READY)이므로 누적 출하수량은 아직 늘지 않는다 — 출하완료 처리 시 반영된다.
     */
    @Transactional
    public ShipmentResponse createFromOrder(Long orderId, ShipRequest req, String username) {
        SalesOrder order = salesOrderRepository.findById(orderId)
                .orElseThrow(() -> ApiException.notFound("주문을 찾을 수 없습니다. id=" + orderId));
        if (order.getStatus() == SalesOrderStatus.CANCELED) {
            throw ApiException.badRequest("취소된 주문은 출하할 수 없습니다: " + order.getOrderNo());
        }

        Map<Long, BigDecimal> committed = sumByOrderLine(orderId, COMMITTED);
        Map<Long, SalesOrderLine> lineById = new HashMap<>();
        order.getLines().forEach(l -> lineById.put(l.getId(), l));

        // 요청이 비었으면 잔량이 남은 모든 라인을 전량 출하
        List<SalesOrderDtos.ShipLineRequest> targets =
                (req == null || req.lines() == null || req.lines().isEmpty())
                        ? order.getLines().stream()
                        .map(l -> new SalesOrderDtos.ShipLineRequest(l.getId(), remaining(l, committed)))
                        .filter(t -> t.qty().signum() > 0)
                        .toList()
                        : req.lines();

        if (targets.isEmpty()) {
            throw ApiException.badRequest("출하할 잔량이 없습니다: " + order.getOrderNo());
        }

        LocalDate shipDate = LocalDate.now();
        Shipment shipment = Shipment.builder()
                .shipNo(generateShipNo(shipDate))
                .partner(order.getPartner())
                .salesOrder(order)
                .shipDate(shipDate)
                .status(ShipmentStatus.READY)
                // 주문에서 만든 출하는 프로젝트가 비어 나간다 — 주문서에 프로젝트 칸이 없어
                // 이어받을 것이 없다. 지어내지 않고 출하 화면에서 고르게 둔다.
                .remark("주문 " + order.getOrderNo() + " 출하")
                .createdBy(username)
                .build();

        BigDecimal totalQty = BigDecimal.ZERO;
        BigDecimal totalAmount = BigDecimal.ZERO;

        for (var t : targets) {
            SalesOrderLine line = lineById.get(t.orderLineId());
            if (line == null) {
                throw ApiException.badRequest("주문 " + order.getOrderNo() + "의 라인이 아닙니다. orderLineId=" + t.orderLineId());
            }
            BigDecimal remain = remaining(line, committed);
            if (t.qty().compareTo(remain) > 0) {
                throw ApiException.badRequest(String.format(
                        "출하수량이 잔량을 초과합니다. 품목=%s, 잔량=%s, 요청=%s",
                        line.getItem().getName(), remain.toPlainString(), t.qty().toPlainString()));
            }

            BigDecimal amount = t.qty().multiply(line.getUnitPrice());
            shipment.addLine(ShipmentLine.builder()
                    .item(line.getItem())
                    .orderLine(line)
                    .quantity(t.qty())
                    .unitPrice(line.getUnitPrice())
                    .amount(amount)
                    // 주문에서 만든 출하는 줄 적요가 비어 나간다 — 주문 라인에
                    // 적요 칸이 없어 이어받을 것이 없다. 출하 화면에서 직접 적는다.
                    .build());

            totalQty = totalQty.add(t.qty());
            totalAmount = totalAmount.add(amount);
        }

        shipment.setTotalQuantity(totalQty);
        shipment.setTotalAmount(totalAmount);

        if (order.getStatus() == SalesOrderStatus.RECEIVED) {
            order.setStatus(SalesOrderStatus.IN_PROGRESS);
        }

        return ShipmentResponse.from(shipmentRepository.save(shipment));
    }

    @Transactional
    public ShipmentResponse updateStatus(Long id, ShipmentStatus status) {
        Shipment shipment = shipmentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("출하를 찾을 수 없습니다. id=" + id));
        ShipmentStatus previous = shipment.getStatus();
        shipment.setStatus(status);

        // 출하완료/취소로 바뀌면 근거 주문의 누적 출하수량과 진행상태를 다시 계산한다
        if (previous != status && shipment.getSalesOrder() != null) {
            shipmentRepository.flush();
            recalcOrderProgress(shipment.getSalesOrder());
        }
        return ShipmentResponse.from(shipment);
    }

    /** 주문 라인의 누적 출하수량을 실제 출하완료분으로 다시 채우고, 주문 상태를 갱신한다. */
    private void recalcOrderProgress(SalesOrder order) {
        if (order.getStatus() == SalesOrderStatus.CANCELED || order.getLines().isEmpty()) return;

        Map<Long, BigDecimal> shipped = sumByOrderLine(order.getId(), SHIPPED_ONLY);
        boolean allDone = true;
        for (SalesOrderLine line : order.getLines()) {
            BigDecimal qty = shipped.getOrDefault(line.getId(), BigDecimal.ZERO);
            line.setShippedQty(qty);
            if (qty.compareTo(line.getQuantity()) < 0) allDone = false;
        }

        if (allDone) {
            order.setStatus(SalesOrderStatus.COMPLETED);
        } else if (order.getStatus() == SalesOrderStatus.COMPLETED) {
            // 출하완료를 되돌린 경우 주문도 다시 진행중으로
            order.setStatus(SalesOrderStatus.IN_PROGRESS);
        }
    }

    private BigDecimal remaining(SalesOrderLine line, Map<Long, BigDecimal> committed) {
        return line.getQuantity().subtract(committed.getOrDefault(line.getId(), BigDecimal.ZERO));
    }

    private Map<Long, BigDecimal> sumByOrderLine(Long orderId, List<ShipmentStatus> statuses) {
        Map<Long, BigDecimal> map = new HashMap<>();
        for (Object[] row : shipmentLineRepository.sumQuantityByOrderLine(orderId, statuses)) {
            map.put((Long) row[0], (BigDecimal) row[1]);
        }
        return map;
    }

    /**
     * 출하 삭제.
     *
     * <p>출하는 재고를 건드리지 않으므로(재고는 판매전표가 움직인다) 되돌릴 것이 없다.
     * 지우면 그 라인이 근거로 삼던 수주 라인의 미출하수량이 다시 살아난다 — 그게 맞는 동작이다.
     */
    @Transactional
    public void delete(Long id) {
        Shipment shipment = shipmentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("출하를 찾을 수 없습니다. id=" + id));
        shipmentRepository.delete(shipment);
    }

    private String generateShipNo(LocalDate date) {
        return docNoGenerator.next("SH-", "shipments", "ship_no", "ship_date", date);
    }
}
