package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.BusinessPartner;
import com.erp.domain.Item;
import com.erp.domain.SalesOrder;
import com.erp.domain.SalesOrderLine;
import com.erp.domain.SalesOrderStatus;
import com.erp.domain.Shipment;
import com.erp.domain.ShipmentLine;
import com.erp.domain.ShipmentStatus;
import com.erp.dto.SalesOrderDtos;
import com.erp.dto.SalesOrderDtos.ShipRequest;
import com.erp.dto.ShipmentDtos.CreateShipmentRequest;
import com.erp.dto.ShipmentDtos.ShipLineRequest;
import com.erp.dto.ShipmentDtos.ShipmentResponse;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.ItemRepository;
import com.erp.repository.SalesOrderRepository;
import com.erp.repository.ShipmentLineRepository;
import com.erp.repository.ShipmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
    private final ItemRepository itemRepository;

    @Transactional(readOnly = true)
    public List<ShipmentResponse> findAll() {
        return shipmentRepository.findAllWithLines().stream()
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
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        if (!partner.getType().canSell()) {
            throw ApiException.badRequest("매출처가 아닌 거래처로는 출하할 수 없습니다: " + partner.getName());
        }

        LocalDate shipDate = req.shipDate() != null ? req.shipDate() : LocalDate.now();

        Shipment shipment = Shipment.builder()
                .shipNo(generateShipNo(shipDate))
                .partner(partner)
                .shipDate(shipDate)
                .status(ShipmentStatus.READY)
                .remark(req.remark())
                .createdBy(username)
                .build();

        BigDecimal totalQty = BigDecimal.ZERO;
        BigDecimal totalAmount = BigDecimal.ZERO;

        for (ShipLineRequest lr : req.lines()) {
            Item item = itemRepository.findById(lr.itemId())
                    .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + lr.itemId()));
            BigDecimal unitPrice = lr.unitPrice() != null ? lr.unitPrice() : item.getUnitPrice();
            BigDecimal amount = lr.quantity().multiply(unitPrice);

            shipment.addLine(ShipmentLine.builder()
                    .item(item)
                    .quantity(lr.quantity())
                    .unitPrice(unitPrice)
                    .amount(amount)
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

    private String generateShipNo(LocalDate date) {
        String d = date.format(DateTimeFormatter.BASIC_ISO_DATE);
        return "SH-" + d + "-" + String.format("%04d", shipmentRepository.count() + 1);
    }
}
