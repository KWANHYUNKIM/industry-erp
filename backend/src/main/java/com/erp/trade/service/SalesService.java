package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.domain.BusinessPartner;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.Sales;
import com.erp.trade.domain.SalesConfirmStatus;
import com.erp.trade.domain.SalesLine;
import com.erp.inventory.domain.StockTransactionType;
import com.erp.inventory.domain.Warehouse;
import com.erp.trade.dto.SalesDtos.CreateSalesRequest;
import com.erp.trade.dto.SalesDtos.SalesDiscountRow;
import com.erp.trade.dto.SalesDtos.SalesLineRequest;
import com.erp.trade.dto.SalesDtos.SalesResponse;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.trade.repository.MallOrderRepository;
import com.erp.trade.repository.SalesOrderRepository;
import com.erp.trade.repository.SalesRepository;
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
import java.util.List;
import com.erp.hr.service.EmployeeService;
import com.erp.inventory.service.ItemService;
import com.erp.inventory.service.ProjectService;
import com.erp.inventory.service.StockService;
import com.erp.inventory.service.WarehouseService;
import com.erp.trade.dto.SalesDtos;

@Service
@RequiredArgsConstructor
public class SalesService {

    private final ProjectService projectService;
    private final EmployeeService employeeService;

    private static final BigDecimal VAT_RATE = new BigDecimal("0.10");

    private final SalesRepository salesRepository;
    private final BusinessPartnerRepository partnerRepository;
    // 다른 모듈(inventory)은 리포지토리가 아니라 공개 service 를 거친다 — CLAUDE.md 4.2
    private final WarehouseService warehouseService;
    private final ItemService itemService;
    private final StockService stockService;
    private final DocumentNoGenerator docNoGenerator;
    // 수정·삭제를 막아야 하는 후속 문서(같은 trade 모듈이라 직접 조회한다)
    private final TaxInvoiceRepository taxInvoiceRepository;
    // 명세 라인의 근거전표(수주). 같은 trade 모듈이라 리포지토리를 직접 쓴다.
    private final SalesOrderRepository salesOrderRepository;
    private final MallOrderRepository mallOrderRepository;

    /** 판매전표 확인 처리. 결재중인 전표는 결재로만 확인된다. */
    @Transactional
    public SalesResponse confirm(Long id) {
        Sales s = getSales(id);
        if (s.getConfirmStatus() == SalesConfirmStatus.IN_APPROVAL) {
            throw ApiException.badRequest("전자결재 진행중인 전표입니다. 결재가 끝나면 확인 처리됩니다.");
        }
        // 이미 확인된 전표를 또 확인하면 markConfirmed 가 확인일시를 지금으로 덮어쓴다.
        // 확인일시는 마감·감사에서 "언제 확정했나"의 근거라, 더블클릭 한 번에 조용히
        // 바뀌면 안 된다. 되돌리려면 확인취소를 거치게 한다.
        if (s.getConfirmStatus() == SalesConfirmStatus.CONFIRMED) {
            throw ApiException.badRequest("이미 확인된 전표입니다: " + s.getDocNo());
        }
        s.markConfirmed();
        return SalesResponse.from(s);
    }

    /** 확인취소. 결재로 확인된 전표도 되돌릴 수 있다(이카운트의 '확인취소'). */
    @Transactional
    public SalesResponse unconfirm(Long id) {
        Sales s = getSales(id);
        if (s.getConfirmStatus() == SalesConfirmStatus.IN_APPROVAL) {
            throw ApiException.badRequest("전자결재 진행중인 전표는 확인취소할 수 없습니다.");
        }
        if (s.getConfirmStatus() != SalesConfirmStatus.CONFIRMED) {
            throw ApiException.badRequest("확인되지 않은 전표입니다: " + s.getDocNo());
        }
        s.markUnconfirmed();
        return SalesResponse.from(s);
    }

    /** 다른 서비스가 판매전표 엔티티를 얻는 진입점 (리포지토리를 직접 주입하지 않도록). */
    @Transactional(readOnly = true)
    public Sales get(Long id) {
        return getSales(id);
    }

    private Sales getSales(Long id) {
        return salesRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("판매전표를 찾을 수 없습니다. id=" + id));
    }

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
        LocalDate saleDate = req.saleDate() != null ? req.saleDate() : LocalDate.now();
        requireUsableMasters(req);

        Sales sales = Sales.builder()
                .docNo(generateDocNo(saleDate))
                .partner(resolvePartner(req.partnerId()))
                .warehouse(warehouseService.getUsable(req.warehouseId()))
                .saleDate(saleDate)
                .createdBy(username)
                .build();

        applyContent(sales, req, username);
        return SalesResponse.from(salesRepository.save(sales));
    }

    /**
     * 판매전표 수정. 재고에 이미 반영된 전표라서 <b>옛 라인을 재고에 되돌린 뒤 새 라인을 다시 반영</b>한다.
     * 한 트랜잭션 안이므로 도중에 재고가 모자라면 전부 롤백된다.
     *
     * <p>전표번호는 바꾸지 않는다 — 이미 인쇄돼 나간 거래명세서와 어긋나기 때문이다.
     */
    @Transactional
    public SalesResponse update(Long id, CreateSalesRequest req, String username) {
        Sales sales = getSales(id);
        ensureEditable(sales, "수정");

        // 되돌리기는 반드시 '바꾸기 전' 창고·일자로 해야 한다. 창고를 옮기는 수정이면
        // 옛 창고에 되돌리고 새 창고에서 빼야 재고가 맞는다.
        revertStock(sales, "판매수정 원복", username);
        sales.getLines().clear();

        sales.setPartner(resolvePartner(req.partnerId()));
        sales.setWarehouse(warehouseService.get(req.warehouseId()));
        if (req.saleDate() != null) sales.setSaleDate(req.saleDate());

        applyContent(sales, req, username);
        return SalesResponse.from(sales);
    }

    /** 판매전표 삭제. 재고를 되돌린 뒤 지운다. */
    @Transactional
    public void delete(Long id, String username) {
        Sales sales = getSales(id);
        ensureEditable(sales, "삭제");

        revertStock(sales, "판매삭제 원복", username);
        salesRepository.delete(sales);
        try {
            // 다른 모듈(전자결재 첨부 전표)이 이 전표를 참조하고 있으면 여기서 FK 제약에 걸린다.
            // trade 는 groupware 를 참조할 수 없으므로(CLAUDE.md 4.1) 직접 조회하지 않고
            // 제약 위반을 400 으로 번역한다 — ProjectService.delete 와 같은 방식이다.
            salesRepository.flush();
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("다른 문서(전자결재 등)가 참조 중이라 삭제할 수 없습니다: " + sales.getDocNo());
        }
    }

    /** 수정·삭제해도 되는 전표인지. 되돌릴 수 없는 후속 처리가 붙었으면 막는다. */
    private void ensureEditable(Sales s, String action) {
        if (s.isAccountingReflected()) {
            throw ApiException.badRequest("회계반영된 전표는 " + action + "할 수 없습니다. 회계반영을 먼저 취소하세요: " + s.getDocNo());
        }
        if (s.getConfirmStatus() == SalesConfirmStatus.IN_APPROVAL) {
            throw ApiException.badRequest("전자결재 진행중인 전표는 " + action + "할 수 없습니다: " + s.getDocNo());
        }
        if (s.getConfirmStatus() == SalesConfirmStatus.CONFIRMED) {
            throw ApiException.badRequest("확인된 전표는 " + action + "할 수 없습니다. 확인취소를 먼저 하세요: " + s.getDocNo());
        }
        if (taxInvoiceRepository.existsBySales_Id(s.getId())) {
            throw ApiException.badRequest("세금계산서가 발행된 전표는 " + action + "할 수 없습니다: " + s.getDocNo());
        }
        if (mallOrderRepository.existsBySales_Id(s.getId())) {
            throw ApiException.badRequest("쇼핑몰 주문에서 전환된 전표는 " + action + "할 수 없습니다: " + s.getDocNo());
        }
    }

    /** 출고했던 수량을 창고에 되돌린다(입고). 이력을 지우지 않고 반대 거래를 남긴다. */
    private void revertStock(Sales s, String note, String username) {
        for (SalesLine l : s.getLines()) {
            stockService.applyDelta(l.getItem(), s.getWarehouse(), l.getQuantity(),
                    StockTransactionType.INBOUND, l.getUnitPrice(), s.getSaleDate(),
                    note + " " + s.getDocNo(), username);
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
    private void requireUsableMasters(CreateSalesRequest req) {
        TradeMasters.requireUsable(resolvePartner(req.partnerId()));
        req.lines().forEach(l -> itemService.getUsable(l.itemId()));
    }

    private BusinessPartner resolvePartner(Long partnerId) {
        BusinessPartner partner = partnerRepository.findById(partnerId)
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + partnerId));
        if (!partner.getType().canSell()) {
            throw ApiException.badRequest("매출처가 아닌 거래처에는 판매할 수 없습니다: " + partner.getName());
        }
        return partner;
    }

    /** 헤더 부가정보 + 라인 + 합계 + 재고 출고. create/update 가 공유한다. */
    private void applyContent(Sales sales, CreateSalesRequest req, String username) {
        boolean taxable = req.taxable() == null || req.taxable();
        sales.setRemark(req.remark());
        sales.setProject(req.projectId() != null ? projectService.get(req.projectId()) : null);
        sales.setEmployee(req.employeeId() != null ? employeeService.get(req.employeeId()) : null);

        // 부가세는 라인을 만들기 전에 한꺼번에 배분한다 — [거래별부가세계산] 이 켜져 있으면
        // 전표 합계를 알아야 반올림할 수 있기 때문이다. 규칙은 VatAllocator 에 모아 뒀다.
        boolean vatBySlip = Boolean.TRUE.equals(req.vatBySlip());
        sales.setVatBySlip(vatBySlip);
        List<BigDecimal> supplies = req.lines().stream()
                .map(lr -> lr.quantity().multiply(lr.unitPrice()))
                .toList();
        List<BigDecimal> vats = VatAllocator.allocate(supplies, VAT_RATE, taxable, vatBySlip);

        BigDecimal totalSupply = BigDecimal.ZERO;
        BigDecimal totalVat = BigDecimal.ZERO;

        for (int i = 0; i < req.lines().size(); i++) {
            SalesLineRequest lr = req.lines().get(i);
            Item item = itemService.get(lr.itemId());
            BigDecimal supply = supplies.get(i);
            BigDecimal vat = vats.get(i);

            SalesLine line = SalesLine.builder()
                    .item(item)
                    .quantity(lr.quantity())
                    .unitPrice(lr.unitPrice())
                    .supplyAmount(supply)
                    .vatAmount(vat)
                    .remark(lr.remark())
                    .lotNo(lr.lotNo())
                    .extraCost(lr.extraCost())
                    .sourceOrder(lr.sourceOrderId() == null ? null
                            : salesOrderRepository.findById(lr.sourceOrderId())
                                    .orElseThrow(() -> ApiException.notFound(
                                            "근거전표(수주)를 찾을 수 없습니다. id=" + lr.sourceOrderId())))
                    .build();
            sales.addLine(line);

            totalSupply = totalSupply.add(supply);
            totalVat = totalVat.add(vat);

            // 재고 감소(출고). 재고 부족 시 예외 → 전체 롤백
            stockService.applyDelta(item, sales.getWarehouse(), lr.quantity().negate(),
                    StockTransactionType.OUTBOUND, lr.unitPrice(), sales.getSaleDate(),
                    "판매 " + sales.getDocNo(), username);
        }

        sales.setSupplyAmount(totalSupply);
        sales.setVatAmount(totalVat);
        sales.setTotalAmount(totalSupply.add(totalVat));
    }

    private String generateDocNo(LocalDate date) {
        return docNoGenerator.next("SO-", "sales", "doc_no", "sale_date", date);
    }

    /** 통합검색용. 전표번호·거래처명 부분일치 상위 limit 건과 총 건수. */
    @Transactional(readOnly = true)
    public List<SalesResponse> search(String like, int limit) {
        return salesRepository.searchTop(like, PageRequest.of(0, limit)).stream()
                .map(SalesResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public long searchCount(String like) {
        return salesRepository.searchCount(like);
    }

}
