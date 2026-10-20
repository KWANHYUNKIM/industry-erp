package com.erp.trade.shipmentorder;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.hr.employee.EmployeeService;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.project.ProjectService;
import com.erp.inventory.warehouse.WarehouseService;
import com.erp.trade.TradeMasters;
import com.erp.trade.partner.BusinessPartner;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.trade.shipment.ShipmentService;
import com.erp.trade.shipment.dto.ShipmentDtos.ShipmentResponse;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.LineRequest;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.SaveRequest;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.ShipLine;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.ShipRequest;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.ShipmentOrderResponse;
import com.erp.trade.shipmentorder.dto.ShipmentOrderDtos.UnshippedLine;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 출하지시서(원본 E040220 · E040221 · E040222) · 미출하현황(E040228).
 *
 * <p>원본 흐름: 판매/주문 → 출하지시서 → 출하. 주문서 [전표불러오기] 는 값만 베끼고 잇지 않는다.
 * 미출하 잔량 = 출하지시서 줄 수량 - 이어진 출하 수량. 출하가 이어져도 지시서는 저절로 완료되지 않고,
 * 출하가 이어진 지시서도 지워진다(출하는 남는다 — FK ON DELETE SET NULL).
 */
@Service
@RequiredArgsConstructor
public class ShipmentOrderService {

    private final ShipmentOrderRepository repository;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemService itemService;
    private final WarehouseService warehouseService;
    private final EmployeeService employeeService;
    private final ProjectService projectService;
    private final ShipmentService shipmentService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<ShipmentOrderResponse> findAll(LocalDate from, LocalDate to) {
        List<ShipmentOrder> found = repository.findWithLinesByPeriod(
                from != null ? from : LocalDate.of(1, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31));
        Map<Long, BigDecimal> shipped = shipmentService.shippedByShipmentOrderLines(
                found.stream().flatMap(o -> o.getLines().stream()).map(ShipmentOrderLine::getId).toList());
        return found.stream().map(o -> ShipmentOrderResponse.from(o, shipped)).toList();
    }

    @Transactional(readOnly = true)
    public ShipmentOrderResponse find(Long id) {
        return respond(load(id));
    }

    /** 미출하현황 — 진행중 지시서 줄 중 잔량이 남은 것. */
    @Transactional(readOnly = true)
    public List<UnshippedLine> findUnshipped() {
        List<ShipmentOrderLine> lines = repository.findOpenLines();
        Map<Long, BigDecimal> shipped = shipmentService.shippedByShipmentOrderLines(
                lines.stream().map(ShipmentOrderLine::getId).toList());
        List<UnshippedLine> out = new ArrayList<>();
        for (ShipmentOrderLine l : lines) {
            BigDecimal remain = l.getQuantity().subtract(shipped.getOrDefault(l.getId(), BigDecimal.ZERO));
            if (remain.signum() <= 0) continue;
            ShipmentOrder o = l.getShipmentOrder();
            out.add(new UnshippedLine(o.getId(), o.getOrderNo(), o.getOrderDate(), l.getId(),
                    l.getItem().getId(), l.getItem().getCode(), l.getItem().getName(), l.getItem().getSpec(),
                    l.getQuantity(), remain,
                    o.getWarehouse() != null ? o.getWarehouse().getId() : null,
                    o.getWarehouse() != null ? o.getWarehouse().getName() : null,
                    o.getPartner().getId(), o.getPartner().getName(), o.getDueDate(), l.getRemark()));
        }
        return out;
    }

    @Transactional
    public ShipmentOrderResponse create(SaveRequest req, String username) {
        validate(req);
        LocalDate date = req.orderDate() != null ? req.orderDate() : LocalDate.now();
        ShipmentOrder o = ShipmentOrder.builder()
                .orderNo(docNoGenerator.next("SI-", "shipment_orders", "order_no", "order_date", date))
                .orderDate(date)
                .createdBy(username)
                .build();
        applyHeader(o, req, date);
        for (LineRequest lr : req.lines()) {
            o.addLine(ShipmentOrderLine.builder().item(itemService.getUsable(lr.itemId()))
                    .quantity(lr.quantity()).remark(lr.remark()).build());
        }
        o.setTotalQuantity(total(o));
        return respond(repository.save(o));
    }

    /** 수정 — 원본 '출하지시서입력(수정)' 창. 기존 줄은 id 로 맞춰 고친다(이어진 출하가 계속 그 줄을 가리킨다). */
    @Transactional
    public ShipmentOrderResponse update(Long id, SaveRequest req) {
        validate(req);
        ShipmentOrder o = load(id);
        if (req.orderDate() != null) o.setOrderDate(req.orderDate());
        applyHeader(o, req, o.getOrderDate());
        Map<Long, ShipmentOrderLine> byId = new HashMap<>();
        o.getLines().forEach(l -> byId.put(l.getId(), l));
        Set<Long> keep = new HashSet<>();
        List<ShipmentOrderLine> added = new ArrayList<>();
        for (LineRequest lr : req.lines()) {
            ShipmentOrderLine line = lr.id() != null ? byId.get(lr.id()) : null;
            if (line == null) {
                added.add(ShipmentOrderLine.builder().item(itemService.getUsable(lr.itemId()))
                        .quantity(lr.quantity()).remark(lr.remark()).build());
                continue;
            }
            keep.add(line.getId());
            if (!line.getItem().getId().equals(lr.itemId())) line.setItem(itemService.getUsable(lr.itemId()));
            line.setQuantity(lr.quantity());
            line.setRemark(lr.remark());
        }
        o.getLines().removeIf(l -> !keep.contains(l.getId()));
        added.forEach(o::addLine);
        o.setTotalQuantity(total(o));
        repository.flush();
        return respond(o);
    }

    /** 진행상태 — 원본 [진행상태] 링크 펼침(진행중 · 완료). 확인 창 없이 바로 바뀐다. */
    @Transactional
    public ShipmentOrderResponse updateStatus(Long id, ShipmentOrderStatus status) {
        ShipmentOrder o = load(id);
        o.setStatus(status);
        return respond(o);
    }

    /** 삭제 — 원본은 출하가 이어져 있어도 막지 않는다. 출하 줄의 연결만 비워진다(DB ON DELETE SET NULL). */
    @Transactional
    public void delete(Long id) {
        repository.delete(load(id));
    }

    /** 출하지시서에 이어 출하를 만든다(원본 출하입력 [출하지시] › 잔량적용 → 수량 고쳐 저장). */
    @Transactional
    public ShipmentResponse ship(Long id, ShipRequest req, String username) {
        ShipmentOrder o = load(id);
        Map<Long, BigDecimal> shipped = shipmentService.shippedByShipmentOrderLines(
                o.getLines().stream().map(ShipmentOrderLine::getId).toList());
        Map<Long, ShipmentOrderLine> byId = new HashMap<>();
        o.getLines().forEach(l -> byId.put(l.getId(), l));
        Map<ShipmentOrderLine, BigDecimal> qty = new LinkedHashMap<>();
        if (req == null || req.lines() == null || req.lines().isEmpty()) {
            for (ShipmentOrderLine l : o.getLines()) {
                BigDecimal remain = l.getQuantity().subtract(shipped.getOrDefault(l.getId(), BigDecimal.ZERO));
                if (remain.signum() > 0) qty.put(l, remain);
            }
        } else {
            for (ShipLine sl : req.lines()) {
                ShipmentOrderLine l = byId.get(sl.lineId());
                if (l == null) throw ApiException.badRequest("이 출하지시서의 줄이 아닙니다. lineId=" + sl.lineId());
                BigDecimal remain = l.getQuantity().subtract(shipped.getOrDefault(l.getId(), BigDecimal.ZERO));
                if (sl.quantity().compareTo(remain) > 0) {
                    throw ApiException.badRequest(String.format("출하수량이 잔량을 초과합니다. 품목=%s, 잔량=%s, 요청=%s",
                            l.getItem().getName(), remain.stripTrailingZeros().toPlainString(),
                            sl.quantity().stripTrailingZeros().toPlainString()));
                }
                qty.put(l, sl.quantity());
            }
        }
        if (qty.isEmpty()) throw ApiException.badRequest("출하할 잔량이 없습니다: " + o.getOrderNo());
        return shipmentService.createFromShipmentOrder(o, qty, req != null ? req.shipDate() : null, username);
    }

    private void validate(SaveRequest req) {
        if (req.lines() == null || req.lines().isEmpty()) {
            throw ApiException.badRequest("그리드(표)에 최소 1줄 이상 입력되어야 합니다.");
        }
        if (req.partnerId() == null) throw ApiException.badRequest("거래처를 선택하세요.");
    }

    private void applyHeader(ShipmentOrder o, SaveRequest req, LocalDate date) {
        BusinessPartner partner = TradeMasters.requireUsable(partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId())));
        o.setPartner(partner);
        o.setEmployee(req.employeeId() != null ? employeeService.getUsable(req.employeeId()) : null);
        o.setWarehouse(req.warehouseId() != null ? warehouseService.get(req.warehouseId()) : null);
        o.setProject(req.projectId() != null ? projectService.get(req.projectId()) : null);
        o.setContact(req.contact());
        // 출하예정일 — 원본 기본 오늘(전표 일자). 비우면 일자로 본다.
        o.setDueDate(req.dueDate() != null ? req.dueDate() : date);
        o.setPostalCode(req.postalCode());
        o.setAddress(req.address());
        o.setRemark(req.remark());
    }

    private static BigDecimal total(ShipmentOrder o) {
        return o.getLines().stream().map(ShipmentOrderLine::getQuantity).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private ShipmentOrder load(Long id) {
        return repository.findWithLines(id)
                .orElseThrow(() -> ApiException.notFound("출하지시서를 찾을 수 없습니다. id=" + id));
    }

    private ShipmentOrderResponse respond(ShipmentOrder o) {
        Map<Long, BigDecimal> shipped = shipmentService.shippedByShipmentOrderLines(
                o.getLines().stream().map(ShipmentOrderLine::getId).filter(Objects::nonNull).toList());
        return ShipmentOrderResponse.from(o, shipped);
    }
}
