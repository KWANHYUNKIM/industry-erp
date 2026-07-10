package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.*;
import com.erp.dto.SalesDtos.CreateSalesRequest;
import com.erp.dto.SalesDtos.SalesDiscountRow;
import com.erp.dto.SalesDtos.SalesLineRequest;
import com.erp.dto.SalesDtos.SalesResponse;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.ItemRepository;
import com.erp.repository.SalesRepository;
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
public class SalesService {

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final SalesRepository salesRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final WarehouseRepository warehouseRepository;
    private final ItemRepository itemRepository;
    private final StockService stockService;

    @Transactional(readOnly = true)
    public List<SalesResponse> findAll() {
        return salesRepository.findAllWithRefs().stream()
                .map(SalesResponse::from)
                .toList();
    }

    /**
     * 판매할인현황: 품목 기준단가(item.unitPrice) 대비 실판매단가(line.unitPrice) 차이를 라인별로 집계.
     * 기준단가보다 싸게 팔았으면 할인(양수). from/to 미지정 시 전체 기간.
     */
    @Transactional(readOnly = true)
    public List<SalesDiscountRow> findDiscounts(LocalDate from, LocalDate to) {
        LocalDate f = from != null ? from : LocalDate.of(1900, 1, 1);
        LocalDate t = to != null ? to : LocalDate.of(9999, 12, 31);
        List<SalesDiscountRow> rows = new ArrayList<>();
        for (Sales s : salesRepository.findWithLinesBySaleDateBetween(f, t)) {
            for (SalesLine l : s.getLines()) {
                BigDecimal base = l.getItem().getUnitPrice();
                BigDecimal sale = l.getUnitPrice();
                BigDecimal perUnit = base.subtract(sale);
                BigDecimal amount = perUnit.multiply(l.getQuantity());
                BigDecimal rate = base.compareTo(BigDecimal.ZERO) > 0
                        ? perUnit.multiply(BigDecimal.valueOf(100)).divide(base, 2, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO;
                rows.add(new SalesDiscountRow(
                        s.getSaleDate(), s.getDocNo(), s.getPartner().getName(), l.getItem().getName(),
                        l.getQuantity(), base, sale, perUnit, amount, rate));
            }
        }
        return rows;
    }

    @Transactional
    public SalesResponse create(CreateSalesRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        if (!partner.getType().canSell()) {
            throw ApiException.badRequest("매출처가 아닌 거래처에는 판매할 수 없습니다: " + partner.getName());
        }
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));

        boolean taxable = req.taxable() == null || req.taxable();
        LocalDate saleDate = req.saleDate() != null ? req.saleDate() : LocalDate.now();

        Sales sales = Sales.builder()
                .docNo(generateDocNo(saleDate))
                .partner(partner)
                .warehouse(warehouse)
                .saleDate(saleDate)
                .createdBy(username)
                .remark(req.remark())
                .build();

        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;

        for (SalesLineRequest lr : req.lines()) {
            Item item = itemRepository.findById(lr.itemId())
                    .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + lr.itemId()));
            BigDecimal supply = lr.quantity().multiply(lr.unitPrice());
            BigDecimal vat = taxable ? supply.multiply(VAT_RATE).setScale(0, RoundingMode.HALF_UP) : BigDecimal.ZERO;

            SalesLine line = SalesLine.builder()
                    .item(item)
                    .quantity(lr.quantity())
                    .unitPrice(lr.unitPrice())
                    .supplyAmount(supply)
                    .vatAmount(vat)
                    .build();
            sales.addLine(line);

            totalSupply = totalSupply.add(supply);
            totalVat = totalVat.add(vat);

            // 재고 감소(출고). 재고 부족 시 예외 → 전체 롤백
            stockService.applyDelta(item, warehouse, lr.quantity().negate(),
                    StockTransactionType.OUTBOUND, lr.unitPrice(), saleDate,
                    "판매 " + sales.getDocNo(), username);
        }

        sales.setSupplyAmount(totalSupply);
        sales.setVatAmount(totalVat);
        sales.setTotalAmount(totalSupply.add(totalVat));

        return SalesResponse.from(salesRepository.save(sales));
    }

    private String generateDocNo(LocalDate date) {
        String d = date.format(DateTimeFormatter.BASIC_ISO_DATE);
        return "SO-" + d + "-" + String.format("%04d", salesRepository.count() + 1);
    }
}
