package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.*;
import com.erp.dto.PurchaseDtos.CreatePurchaseRequest;
import com.erp.dto.PurchaseDtos.PurchaseDiscountRow;
import com.erp.dto.PurchaseDtos.PurchaseLineRequest;
import com.erp.dto.PurchaseDtos.PurchaseResponse;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.ItemRepository;
import com.erp.repository.PurchaseRepository;
import com.erp.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PurchaseService {

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final PurchaseRepository purchaseRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final WarehouseRepository warehouseRepository;
    private final ItemRepository itemRepository;
    private final StockService stockService;

    @Transactional(readOnly = true)
    public List<PurchaseResponse> findAll() {
        return purchaseRepository.findAllWithRefs().stream()
                .map(PurchaseResponse::from)
                .toList();
    }

    /**
     * 구매/외주 할인현황: 품목 기준단가(item.unitPrice) 대비 실매입단가(line.unitPrice) 차이를 라인별로 집계.
     * 외주 전용 도메인이 없으므로 외주비할인현황도 동일 로직을 재사용한다. from/to 미지정 시 전체 기간.
     */
    @Transactional(readOnly = true)
    public List<PurchaseDiscountRow> findDiscounts(LocalDate from, LocalDate to) {
        LocalDate f = from != null ? from : LocalDate.of(1900, 1, 1);
        LocalDate t = to != null ? to : LocalDate.of(9999, 12, 31);
        List<PurchaseDiscountRow> rows = new ArrayList<>();
        for (Purchase p : purchaseRepository.findWithLinesByPurchaseDateBetween(f, t)) {
            for (PurchaseLine l : p.getLines()) {
                BigDecimal base = l.getItem().getUnitPrice();
                BigDecimal buy = l.getUnitPrice();
                BigDecimal perUnit = base.subtract(buy);
                BigDecimal amount = perUnit.multiply(l.getQuantity());
                BigDecimal rate = base.compareTo(BigDecimal.ZERO) > 0
                        ? perUnit.multiply(BigDecimal.valueOf(100)).divide(base, 2, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO;
                rows.add(new PurchaseDiscountRow(
                        p.getPurchaseDate(), p.getDocNo(), p.getPartner().getName(), l.getItem().getName(),
                        l.getQuantity(), base, buy, perUnit, amount, rate));
            }
        }
        return rows;
    }

    @Transactional
    public PurchaseResponse create(CreatePurchaseRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        if (!partner.getType().canBuy()) {
            throw ApiException.badRequest("매입처가 아닌 거래처에서는 구매할 수 없습니다: " + partner.getName());
        }
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));

        boolean taxable = req.taxable() == null || req.taxable();
        LocalDate purchaseDate = req.purchaseDate() != null ? req.purchaseDate() : LocalDate.now();

        Purchase purchase = Purchase.builder()
                .docNo(generateDocNo(purchaseDate))
                .partner(partner)
                .warehouse(warehouse)
                .purchaseDate(purchaseDate)
                .createdBy(username)
                .remark(req.remark())
                .build();

        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;

        for (PurchaseLineRequest lr : req.lines()) {
            Item item = itemRepository.findById(lr.itemId())
                    .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + lr.itemId()));
            BigDecimal supply = lr.quantity().multiply(lr.unitPrice());
            BigDecimal vat = taxable ? supply.multiply(VAT_RATE).setScale(0, RoundingMode.HALF_UP) : BigDecimal.ZERO;

            PurchaseLine line = PurchaseLine.builder()
                    .item(item)
                    .quantity(lr.quantity())
                    .unitPrice(lr.unitPrice())
                    .supplyAmount(supply)
                    .vatAmount(vat)
                    .build();
            purchase.addLine(line);

            totalSupply = totalSupply.add(supply);
            totalVat = totalVat.add(vat);

            // 재고 증가(입고)
            stockService.applyDelta(item, warehouse, lr.quantity(),
                    StockTransactionType.INBOUND, lr.unitPrice(), purchaseDate,
                    "구매 " + purchase.getDocNo(), username);
        }

        purchase.setSupplyAmount(totalSupply);
        purchase.setVatAmount(totalVat);
        purchase.setTotalAmount(totalSupply.add(totalVat));

        return PurchaseResponse.from(purchaseRepository.save(purchase));
    }

    private String generateDocNo(LocalDate date) {
        String d = date.format(DateTimeFormatter.BASIC_ISO_DATE);
        return "PO-" + d + "-" + String.format("%04d", purchaseRepository.count() + 1);
    }
}
