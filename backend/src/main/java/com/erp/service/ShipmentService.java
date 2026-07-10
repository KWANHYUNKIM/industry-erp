package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.*;
import com.erp.dto.ShipmentDtos.CreateShipmentRequest;
import com.erp.dto.ShipmentDtos.ShipLineRequest;
import com.erp.dto.ShipmentDtos.ShipmentResponse;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.ItemRepository;
import com.erp.repository.ShipmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ShipmentService {

    private final ShipmentRepository shipmentRepository;
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

    @Transactional
    public ShipmentResponse updateStatus(Long id, ShipmentStatus status) {
        Shipment shipment = shipmentRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("출하를 찾을 수 없습니다. id=" + id));
        shipment.setStatus(status);
        return ShipmentResponse.from(shipment);
    }

    private String generateShipNo(LocalDate date) {
        String d = date.format(DateTimeFormatter.BASIC_ISO_DATE);
        return "SH-" + d + "-" + String.format("%04d", shipmentRepository.count() + 1);
    }
}
