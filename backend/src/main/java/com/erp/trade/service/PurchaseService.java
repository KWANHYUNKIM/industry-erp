package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.domain.BusinessPartner;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.PurchaseOrderLine;
import com.erp.trade.domain.PurchaseOrder;
import com.erp.trade.domain.PurchaseLine;
import com.erp.inventory.domain.StockTransactionType;
import com.erp.inventory.domain.Warehouse;
import com.erp.trade.dto.PurchaseDtos.CreatePurchaseRequest;
import com.erp.trade.dto.PurchaseDtos.PurchaseDiscountRow;
import com.erp.trade.dto.PurchaseDtos.PurchaseLineRequest;
import com.erp.trade.dto.PurchaseDtos.PurchaseResponse;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.trade.domain.PurchaseOrderStatus;
import com.erp.trade.repository.PurchaseLineRepository;
import com.erp.trade.repository.PurchaseOrderRepository;
import com.erp.trade.repository.PurchaseRepository;
import com.erp.trade.repository.TaxInvoiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.List;
import com.erp.hr.service.EmployeeService;
import com.erp.inventory.service.ItemService;
import com.erp.inventory.service.ProjectService;
import com.erp.inventory.service.StockService;
import com.erp.inventory.service.WarehouseService;
import com.erp.trade.dto.PurchaseDtos;

@Service
@RequiredArgsConstructor
public class PurchaseService {

    private final ProjectService projectService;
    private final EmployeeService employeeService;

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final PurchaseRepository purchaseRepository;
    private final BusinessPartnerRepository partnerRepository;
    // 다른 모듈(inventory)은 리포지토리가 아니라 공개 service 를 거친다 — CLAUDE.md 4.2
    private final WarehouseService warehouseService;
    private final ItemService itemService;
    private final StockService stockService;
    private final DocumentNoGenerator docNoGenerator;
    // 수정·삭제를 막아야 하는 후속 문서(같은 trade 모듈이라 직접 조회한다)
    private final TaxInvoiceRepository taxInvoiceRepository;
    // 명세 라인의 근거전표(발주서). 같은 trade 모듈이라 리포지토리를 직접 쓴다.
    private final PurchaseOrderRepository purchaseOrderRepository;
    private final PurchaseLineRepository purchaseLineRepository;

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
                /*
                 * 기준은 <b>구매단가</b>다. 예전에는 판매 기준단가(unitPrice)와 견줬는데,
                 * 매입가가 판매가보다 높은 것이 이상할 이유가 없어서 개발 자료 488줄이
                 * 전부 '할증' 으로 찍혔다 — 화면 이름은 할인현황인데 할인이 0건이었다.
                 *
                 * 구매단가가 0 이면 기준을 안 정한 것이므로 할인을 계산하지 않는다.
                 * 없는 기준으로 만든 숫자를 보여 주느니 0 이 낫다.
                 */
                BigDecimal base = l.getItem().getPurchasePrice();
                BigDecimal buy = l.getUnitPrice();
                boolean hasBase = base != null && base.signum() > 0;
                BigDecimal perUnit = hasBase ? base.subtract(buy) : BigDecimal.ZERO;
                BigDecimal amount = perUnit.multiply(l.getQuantity());
                BigDecimal rate = hasBase
                        ? perUnit.multiply(BigDecimal.valueOf(100)).divide(base, 2, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO;
                rows.add(new PurchaseDiscountRow(
                        p.getPurchaseDate(), p.getDocNo(), p.getPartner().getName(),
                        l.getItem().getCode(), l.getItem().getName(),
                        p.getWarehouse() != null ? p.getWarehouse().getName() : null,
                        p.getProject() != null ? p.getProject().getName() : null,
                        p.getEmployee() != null ? p.getEmployee().getName() : null,
                        l.getQuantity(), base, buy, perUnit, amount, rate));
            }
        }
        return rows;
    }

    @Transactional
    public PurchaseResponse create(CreatePurchaseRequest req, String username) {
        LocalDate purchaseDate = req.purchaseDate() != null ? req.purchaseDate() : LocalDate.now();
        requireUsableMasters(req);
        requireWithinOrderQty(req, null);

        Purchase purchase = Purchase.builder()
                .docNo(generateDocNo(purchaseDate))
                .partner(resolvePartner(req.partnerId()))
                .warehouse(warehouseService.getUsable(req.warehouseId()))
                .purchaseDate(purchaseDate)
                .createdBy(username)
                .build();

        applyContent(purchase, req, username);
        return PurchaseResponse.from(purchaseRepository.save(purchase));
    }

    /**
     * 구매전표 수정. 입고했던 수량을 되돌린 뒤 새 내용으로 다시 입고한다.
     * 되돌릴 때 <b>이미 팔려 나가 재고가 없으면</b> 음수 재고가 되지 않도록 StockService 가 막는다 →
     * 전체 롤백되고 "재고가 부족합니다"가 나온다. 그 경우 판매 전표를 먼저 손봐야 한다.
     */
    @Transactional
    public PurchaseResponse update(Long id, CreatePurchaseRequest req, String username) {
        Purchase purchase = getPurchase(id);
        ensureEditable(purchase, "수정");
        // 자기 자신은 빼고 센다 — 안 그러면 수량을 그대로 둔 수정도 "잔량 초과" 로 거부된다.
        requireWithinOrderQty(req, id);

        revertStock(purchase, "구매수정 원복", username);
        purchase.getLines().clear();

        purchase.setPartner(resolvePartner(req.partnerId()));
        purchase.setWarehouse(warehouseService.get(req.warehouseId()));
        if (req.purchaseDate() != null) purchase.setPurchaseDate(req.purchaseDate());

        applyContent(purchase, req, username);
        return PurchaseResponse.from(purchase);
    }

    /** 구매전표 삭제. 입고분을 되돌린 뒤 지운다. */
    @Transactional
    public void delete(Long id, String username) {
        Purchase purchase = getPurchase(id);
        ensureEditable(purchase, "삭제");

        revertStock(purchase, "구매삭제 원복", username);

        // 발주 입고전환으로 생긴 전표라면 발주서의 입고 연결을 풀고 '발주확정'으로 되돌린다.
        // 이게 곧 입고취소다 — 이카운트에도 별도의 [입고취소] 버튼은 없고, 입고전표를 지우는 것이 취소다.
        // 풀어 주지 않으면 purchase_orders.converted_purchase_id FK 에 걸려 영영 못 지운다.
        purchaseOrderRepository.findByConvertedPurchaseId(purchase.getId()).ifPresent(po -> {
            po.setConvertedPurchaseId(null);
            po.setStatus(PurchaseOrderStatus.ORDERED);
        });
        purchaseRepository.delete(purchase);
        try {
            purchaseRepository.flush();
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("다른 문서(전자결재 등)가 참조 중이라 삭제할 수 없습니다: " + purchase.getDocNo());
        }
    }

    private Purchase getPurchase(Long id) {
        return purchaseRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("구매전표를 찾을 수 없습니다. id=" + id));
    }

    /**
     * 구매 전표 <b>라인 단가</b>를 바꾼다. (단가일괄변경 화면)
     *
     * <p>수량은 건드리지 않으므로 재고는 움직이지 않는다. 공급가액·부가세·전표합계만
     * 다시 계산한다. 부가세 배분 규칙(라인별 반올림 / 거래별부가세계산)은 입력할 때와
     * 같은 {@link VatAllocator} 를 쓴다 — 여기서 따로 계산하면 두 경로가 갈라진다.
     *
     * <p>과세 여부는 전표에 저장돼 있지 않다(입력 때 계산에만 쓰인다). 그래서
     * <b>원래 부가세가 0 이었으면 면세로 보고 0 을 유지</b>한다. 면세 전표의 단가를 고쳤다고
     * 갑자기 부가세가 붙으면 안 된다.
     *
     * <p>수정 가능 여부는 {@code ensureEditable} 이 그대로 판단한다 — 확인·회계반영·
     * 세금계산서 발행된 전표는 단가도 못 고친다.
     *
     * @param prices 라인 id → 새 단가
     * @return 실제로 바뀐 전표 (같은 전표의 여러 라인을 한 번에 줘도 한 번만 담긴다)
     */
    @Transactional
    public List<Purchase> changeLinePrices(Map<Long, BigDecimal> prices) {
        if (prices.isEmpty()) return List.of();

        Map<Long, Purchase> touched = new LinkedHashMap<>();
        for (Map.Entry<Long, BigDecimal> e : prices.entrySet()) {
            PurchaseLine line = purchaseLineRepository.findById(e.getKey())
                    .orElseThrow(() -> ApiException.notFound("전표 라인을 찾을 수 없습니다. id=" + e.getKey()));
            Purchase slip = line.getPurchase();
            if (!touched.containsKey(slip.getId())) {
                ensureEditable(slip, "단가변경");
                touched.put(slip.getId(), slip);
            }
            line.setUnitPrice(e.getValue());
        }
        touched.values().forEach(this::recalcAmounts);
        return List.copyOf(touched.values());
    }

    /** 라인 단가가 바뀐 뒤 공급가액·부가세·전표합계를 다시 맞춘다. */
    private void recalcAmounts(Purchase slip) {
        boolean taxable = slip.getVatAmount().signum() != 0;
        List<PurchaseLine> lines = slip.getLines();
        List<BigDecimal> supplies = lines.stream()
                .map(l -> l.getQuantity().multiply(l.getUnitPrice()))
                .toList();
        List<BigDecimal> vats = VatAllocator.allocate(supplies, VAT_RATE, taxable, slip.isVatBySlip());

        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;
        for (int i = 0; i < lines.size(); i++) {
            lines.get(i).setSupplyAmount(supplies.get(i));
            lines.get(i).setVatAmount(vats.get(i));
            totalSupply = totalSupply.add(supplies.get(i));
            totalVat = totalVat.add(vats.get(i));
        }
        slip.setSupplyAmount(totalSupply);
        slip.setVatAmount(totalVat);
        slip.setTotalAmount(totalSupply.add(totalVat));
    }

    /** 왜 못 고치는지 한 마디로. 고칠 수 있으면 null. ensureEditable 과 같은 조건을 본다. */
    @Transactional(readOnly = true)
    public String editLockReason(Purchase p) {
        try {
            ensureEditable(p, "수정");
            return null;
        } catch (ApiException e) {
            return e.getMessage();
        }
    }

    private void ensureEditable(Purchase p, String action) {
        if (p.isAccountingReflected()) {
            throw ApiException.badRequest("회계반영된 전표는 " + action + "할 수 없습니다. 회계반영을 먼저 취소하세요: " + p.getDocNo());
        }
        if (taxInvoiceRepository.existsByPurchase_Id(p.getId())) {
            throw ApiException.badRequest("세금계산서가 발행된 전표는 " + action + "할 수 없습니다: " + p.getDocNo());
        }
    }

    /** 입고했던 수량을 창고에서 다시 뺀다. 이력을 지우지 않고 반대 거래를 남긴다. */
    private void revertStock(Purchase p, String note, String username) {
        for (PurchaseLine l : p.getLines()) {
            stockService.applyDelta(l.getItem(), p.getWarehouse(), l.getQuantity().negate(),
                    StockTransactionType.OUTBOUND, l.getUnitPrice(), p.getPurchaseDate(),
                    note + " " + p.getDocNo(), username);
        }
    }

    /**
     * 새 전표에 사용중지된 마스터를 쓰지 못하게 막는다.
     *
     * <p>사용중지는 "더 이상 쓰지 말자"는 표시인데, 지금까지는 표시만 되고 아무것도 막지 않아서
     * 중지한 품목·거래처로 전표가 그대로 저장됐다. 코드도움 목록에도 남아 있어 실수로 고르기 쉽다.
     *
     * <p><b>수정(update)은 막지 않는다.</b> 이미 저장된 전표에 그때는 살아 있던 품목이 들어 있는데,
     * 나중에 그 품목을 중지했다고 해서 비고 한 줄 고치는 것까지 막으면 옛 전표를 손댈 수 없게 된다.
     * 새로 쓰는 자리에서만 막는다.
     */
    private void requireUsableMasters(CreatePurchaseRequest req) {
        TradeMasters.requireUsable(resolvePartner(req.partnerId()));
        req.lines().forEach(l -> itemService.getUsable(l.itemId()));
    }

    private BusinessPartner resolvePartner(Long partnerId) {
        BusinessPartner partner = partnerRepository.findById(partnerId)
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + partnerId));
        if (!partner.getType().canBuy()) {
            throw ApiException.badRequest("매입처가 아닌 거래처에서는 구매할 수 없습니다: " + partner.getName());
        }
        return partner;
    }

    /** 헤더 부가정보 + 라인 + 합계 + 재고 입고. create/update 가 공유한다. */
    /**
     * 근거발주가 붙은 라인은 <b>발주수량을 넘길 수 없다.</b> 판매 쪽과 같은 규칙이다
     * (SalesService.requireWithinOrderQty). 구매도 검사가 없어 발주 10 에 15 를 살 수 있었다.
     *
     * @param excludePurchaseId 수정 중인 전표. 자기 수량을 두 번 세면 멀쩡한 수정이 거부된다.
     */
    private void requireWithinOrderQty(CreatePurchaseRequest req, Long excludePurchaseId) {
        Map<Long, Map<Long, BigDecimal>> wanted = new HashMap<>();
        for (PurchaseLineRequest lr : req.lines()) {
            if (lr.sourceOrderId() == null) continue;
            wanted.computeIfAbsent(lr.sourceOrderId(), k -> new HashMap<>())
                    .merge(lr.itemId(), lr.quantity(), BigDecimal::add);
        }
        for (Map.Entry<Long, Map<Long, BigDecimal>> e : wanted.entrySet()) {
            PurchaseOrder order = purchaseOrderRepository.findById(e.getKey())
                    .orElseThrow(() -> ApiException.notFound("근거전표(발주서)를 찾을 수 없습니다. id=" + e.getKey()));

            Map<Long, BigDecimal> ordered = new HashMap<>();
            for (PurchaseOrderLine ol : order.getLines()) {
                ordered.merge(ol.getItem().getId(), ol.getQuantity(), BigDecimal::add);
            }
            Map<Long, BigDecimal> already = new HashMap<>();
            for (PurchaseLineRepository.OrderItemAggregate a
                    : purchaseLineRepository.aggregateBoughtByOrder(e.getKey(), excludePurchaseId)) {
                already.merge(a.getItemId(), a.getQty(), BigDecimal::add);
            }

            for (Map.Entry<Long, BigDecimal> w : e.getValue().entrySet()) {
                BigDecimal orderQty = ordered.getOrDefault(w.getKey(), BigDecimal.ZERO);
                if (orderQty.signum() == 0) {
                    throw ApiException.badRequest(
                            "근거발주 " + order.getOrderNo() + " 에 없는 품목입니다: "
                                    + itemService.get(w.getKey()).getName());
                }
                BigDecimal remain = orderQty.subtract(already.getOrDefault(w.getKey(), BigDecimal.ZERO));
                if (w.getValue().compareTo(remain) > 0) {
                    throw ApiException.badRequest(String.format(
                            "근거발주의 잔량을 초과합니다. 발주=%s, 품목=%s, 발주=%s, 이미구매=%s, 잔량=%s, 요청=%s",
                            order.getOrderNo(), itemService.get(w.getKey()).getName(),
                            orderQty.toPlainString(),
                            already.getOrDefault(w.getKey(), BigDecimal.ZERO).toPlainString(),
                            remain.toPlainString(), w.getValue().toPlainString()));
                }
            }
        }
    }

    private void applyContent(Purchase purchase, CreatePurchaseRequest req, String username) {
        boolean taxable = req.taxable() == null || req.taxable();
        purchase.setRemark(req.remark());
        purchase.setProject(req.projectId() != null ? projectService.get(req.projectId()) : null);
        purchase.setEmployee(req.employeeId() != null ? employeeService.get(req.employeeId()) : null);

        // 부가세는 라인을 만들기 전에 한꺼번에 배분한다 — [거래별부가세계산] 이 켜져 있으면
        // 전표 합계를 알아야 반올림할 수 있기 때문이다. 규칙은 VatAllocator 에 모아 뒀다.
        boolean vatBySlip = Boolean.TRUE.equals(req.vatBySlip());
        purchase.setVatBySlip(vatBySlip);
        List<BigDecimal> supplies = req.lines().stream()
                .map(lr -> lr.quantity().multiply(lr.unitPrice()))
                .toList();
        List<BigDecimal> vats = VatAllocator.allocate(supplies, VAT_RATE, taxable, vatBySlip);

        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;

        for (int i = 0; i < req.lines().size(); i++) {
            PurchaseLineRequest lr = req.lines().get(i);
            Item item = itemService.get(lr.itemId());
            BigDecimal supply = supplies.get(i);
            BigDecimal vat = vats.get(i);

            PurchaseLine line = PurchaseLine.builder()
                    .item(item)
                    .quantity(lr.quantity())
                    .unitPrice(lr.unitPrice())
                    .supplyAmount(supply)
                    .vatAmount(vat)
                    .remark(lr.remark())
                    .lotNo(lr.lotNo())
                    .extraCost(lr.extraCost())
                    .sourceOrder(lr.sourceOrderId() == null ? null
                            : purchaseOrderRepository.findById(lr.sourceOrderId())
                                    .orElseThrow(() -> ApiException.notFound(
                                            "근거전표(발주서)를 찾을 수 없습니다. id=" + lr.sourceOrderId())))
                    .build();
            purchase.addLine(line);

            totalSupply = totalSupply.add(supply);
            totalVat = totalVat.add(vat);

            // 재고 증가(입고)
            stockService.applyDelta(item, purchase.getWarehouse(), lr.quantity(),
                    StockTransactionType.INBOUND, lr.unitPrice(), purchase.getPurchaseDate(),
                    "구매 " + purchase.getDocNo(), username);
        }

        purchase.setSupplyAmount(totalSupply);
        purchase.setVatAmount(totalVat);
        purchase.setTotalAmount(totalSupply.add(totalVat));
    }

    private String generateDocNo(LocalDate date) {
        return docNoGenerator.next("PO-", "purchases", "doc_no", "purchase_date", date);
    }

    /** 통합검색용. 전표번호·거래처명 부분일치 상위 limit 건과 총 건수. */
    @Transactional(readOnly = true)
    public List<PurchaseResponse> search(String like, int limit) {
        return purchaseRepository.searchTop(like, PageRequest.of(0, limit)).stream()
                .map(PurchaseResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public long searchCount(String like) {
        return purchaseRepository.searchCount(like);
    }

}
