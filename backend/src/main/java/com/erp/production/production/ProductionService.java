package com.erp.production.production;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.production.bom.Bom;
import com.erp.production.bom.BomLine;
import com.erp.inventory.item.Item;
import com.erp.inventory.stock.StockTransactionType;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.production.workorder.WorkOrder;
import com.erp.production.workorder.WorkOrderStatus;
import com.erp.production.production.dto.ProductionDtos.CreateProductionBatchRequest;
import com.erp.production.production.dto.ProductionDtos.ProductionLine;
import com.erp.production.production.dto.ProductionDtos.CreateProductionRequest;
import com.erp.production.production.dto.ProductionDtos.ManualConsumeLine;
import com.erp.production.production.dto.ProductionDtos.ProductionMaterialResponse;
import com.erp.production.production.dto.ProductionDtos.ProductionResponse;
import com.erp.production.production.dto.ProductionDtos.SaveProductionSlipRequest;
import com.erp.production.production.dto.ProductionDtos.SlipLine;
import com.erp.production.bom.BomRepository;
import com.erp.production.workorder.WorkOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.stock.StockService;
import com.erp.production.production.dto.ProductionDtos;

@Service
@RequiredArgsConstructor
public class ProductionService {

    private final ProductionRepository productionRepository;
    private final WorkOrderRepository workOrderRepository;
    private final BomRepository bomRepository;
    /* inventory 의 것은 그 모듈 service 를 거친다(CLAUDE.md 4.2) — 사용중지한 품목·창고를 막는다. */
    private final com.erp.inventory.item.ItemService itemService;
    private final com.erp.inventory.warehouse.WarehouseService warehouseService;
    private final com.erp.production.process.ProcessService processService;
    private final com.erp.production.bom.BomService bomService;
    private final StockService stockService;
    private final DocumentNoGenerator docNoGenerator;
    /** 프로젝트는 inventory 의 공개 service 를 거친다(리포지토리 직접 주입 금지, 4.2). */
    private final com.erp.inventory.project.ProjectService projectService;

    @Transactional(readOnly = true)
    public List<ProductionResponse> findAll() {
        return findAll(null, null);
    }

    /**
     * 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다).
     *
     * <p>응답 모양은 <b>그대로 둔다.</b> 여러 화면이 알몸 배열을 기대하고 있어,
     * 자르는 껍데기를 씌우면 안 고친 곳이 조용히 빈 표가 된다.
     */
    @Transactional(readOnly = true)
    public List<ProductionResponse> findAll(LocalDate from, LocalDate to) {
        return findAll(from, to, null, null);
    }

    /**
     * 목록. 기간은 <b>두 축</b>으로 물을 수 있다.
     *
     * <ul>
     *   <li><b>from·to — 생산일.</b> 그 날에 찍힌 실적을 본다(예전 그대로다).</li>
     *   <li><b>woFrom·woTo — 지시일.</b> 그 기간에 <b>지시된</b> 작업의 실적을 본다.
     *       생산일이 기간 밖이어도 따라온다.</li>
     * </ul>
     *
     * <p>축이 둘인 까닭은 <b>묻는 질문이 다르기</b> 때문이다. 작업지시별로 묶어 진행을 세는
     * 화면은 "이 지시가 얼마나 됐나" 를 묻는다 — 생산일로 자르면 진행이 덜 된 것처럼 보인다.
     * 생산 목록은 "그날 무엇을 만들었나" 를 묻는다.
     *
     * <p><b>둘을 함께 주면 거절한다.</b> 교집합인지 합집합인지 부르는 쪽마다 다르게 읽을
     * 자리라, 조용히 한쪽으로 정하면 <b>표가 틀려도 200 이 온다</b>. 둘 다 필요하면
     * 두 번 부르고 합친다(작업지시진행현황이 그렇게 한다).
     */
    @Transactional(readOnly = true)
    public List<ProductionResponse> findAll(LocalDate from, LocalDate to, LocalDate woFrom, LocalDate woTo) {
        boolean byOrder = woFrom != null || woTo != null;
        if (byOrder && (from != null || to != null)) {
            throw ApiException.badRequest("생산일(from·to)과 지시일(woFrom·woTo)을 함께 줄 수 없습니다. 한 축만 고르세요.");
        }
        var found = byOrder
                ? productionRepository.findWithRefsByOrderPeriod(
                        woFrom != null ? woFrom : LocalDate.of(1, 1, 1),
                        woTo != null ? woTo : LocalDate.of(9999, 12, 31))
                : (from == null && to == null)
                ? productionRepository.findAllWithRefs()
                : productionRepository.findWithRefsByPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1),
                        to != null ? to : LocalDate.of(9999, 12, 31));
        return found.stream()
                .map(ProductionResponse::from)
                .toList();
    }

    /** 제품 하나의 BOM 소요량(미저장). 원본 생산입고 II·III [BOM풀기]. */
    @Transactional(readOnly = true)
    public List<ProductionMaterialResponse> bomPreview(Long productId, BigDecimal qty, boolean all) {
        Item product = itemService.get(productId);
        getBom(product);   // BOM 이 없으면 여기서 알린다
        return bomService.explode(productId, qty, all).stream()
                .map(x -> new ProductionMaterialResponse(
                        x.component().getId(), x.component().getCode(), x.component().getName(),
                        x.component().getUnit(), x.quantity(), x.component().getSpec(), null, null))
                .toList();
    }

    /** 전표 하나의 줄들. 원본 생산입고조회에서 번호를 누르면 여는 것. */
    @Transactional(readOnly = true)
    public List<ProductionResponse> findSlip(String prodNo) {
        List<Production> rows = productionRepository.findSlip(prodNo);
        if (rows.isEmpty()) throw ApiException.notFound("생산입고 전표를 찾을 수 없습니다: " + prodNo);
        return rows.stream().map(ProductionResponse::from).toList();
    }

    /**
     * 원본 생산입고 I·II·III 의 [저장]. 줄이 몇 개든 <b>번호 하나</b>를 매기고 한 트랜잭션에 넣는다.
     * 한 줄이라도 막히면(재고 부족·지시수량 초과) 전부 되돌린다.
     */
    @Transactional
    public List<ProductionResponse> createSlip(SaveProductionSlipRequest req, String username) {
        LocalDate date = req.productionDate() != null ? req.productionDate() : LocalDate.now();
        return saveSlip(req, generateProdNo(date), date, username);
    }

    /**
     * 전표 고치기. 원본은 조회에서 번호를 눌러 연 전표를 그대로 고쳐 [저장] 한다.
     *
     * <p>옛 줄을 모두 되돌리고(재고·작업지시 진척) 새 줄로 다시 넣는다 — 줄 하나만 바꿔도
     * 소모가 달라지므로 줄 단위로 맞추는 것보다 이편이 틀릴 데가 적다. 일자가 같으면 번호를 지킨다.
     */
    @Transactional
    public List<ProductionResponse> updateSlip(String prodNo, SaveProductionSlipRequest req, String username) {
        List<Production> old = productionRepository.findSlip(prodNo);
        if (old.isEmpty()) throw ApiException.notFound("생산입고 전표를 찾을 수 없습니다: " + prodNo);
        LocalDate oldDate = old.get(0).getProductionDate();
        LocalDate date = req.productionDate() != null ? req.productionDate() : oldDate;
        for (Production p : old) reverse(p, username);
        productionRepository.deleteAll(old);
        productionRepository.flush();
        String no = date.equals(oldDate) ? prodNo : generateProdNo(date);
        return saveSlip(req, no, date, username);
    }

    /** 전표째 지운다. 원본 생산입고 전표의 [삭제]. */
    @Transactional
    public void deleteSlip(String prodNo, String username) {
        List<Production> rows = productionRepository.findSlip(prodNo);
        if (rows.isEmpty()) throw ApiException.notFound("생산입고 전표를 찾을 수 없습니다: " + prodNo);
        for (Production p : rows) reverse(p, username);
        productionRepository.deleteAll(rows);
    }

    private List<ProductionResponse> saveSlip(SaveProductionSlipRequest req, String prodNo, LocalDate date, String username) {
        Warehouse headTo = req.warehouseId() != null ? warehouseService.getUsable(req.warehouseId()) : null;
        Warehouse headFrom = req.fromWarehouseId() != null ? warehouseService.getUsable(req.fromWarehouseId()) : null;
        var project = req.projectId() != null ? projectService.get(req.projectId()) : null;
        List<ProductionResponse> out = new java.util.ArrayList<>();
        int lineNo = 0;
        for (SlipLine line : req.lines()) {
            lineNo++;
            Item product = itemService.getUsable(line.productId());
            WorkOrder wo = line.workOrderId() != null ? getWorkOrder(line.workOrderId()) : null;
            if (wo != null && !wo.getProduct().getId().equals(product.getId())) {
                throw ApiException.badRequest(lineNo + "번째 줄: 작업지시서(" + wo.getOrderNo() + ")의 품목과 생산품목이 다릅니다.");
            }
            Warehouse to = line.warehouseId() != null ? warehouseService.getUsable(line.warehouseId())
                    : headTo != null ? headTo : wo != null ? wo.getWarehouse() : null;
            if (to == null) throw ApiException.badRequest(lineNo + "번째 줄: 받는창고를 입력하세요.");
            Warehouse from = line.fromWarehouseId() != null ? warehouseService.getUsable(line.fromWarehouseId()) : headFrom;
            if (from == null) throw ApiException.badRequest(lineNo + "번째 줄: 생산된공장을 입력하세요.");

            List<ManualConsumeLine> manual = null;
            if (req.entryType() != ProductionEntryType.I) {
                manual = line.materials() == null ? List.of()
                        : line.materials().stream().map(m -> new ManualConsumeLine(m.componentId(), m.quantity())).toList();
            }
            Production p = createLine(wo, product, line.producedQty(), date, from, to, project,
                    line.note(), line.laborMinutes(), req.employeeId(), manual, prodNo, lineNo, username);
            p.setEntryType(req.entryType());
            p.setLotNo(blankToNull(line.lotNo()));
            if (line.processId() != null) p.setProcess(processService.getUsable(line.processId()));
            if (manual != null && line.materials() != null) {
                for (int i = 0; i < p.getMaterials().size(); i++) {
                    p.getMaterials().get(i).setNote(line.materials().get(i).note());
                    p.getMaterials().get(i).setLotNo(blankToNull(line.materials().get(i).lotNo()));
                }
            }
            applySubcontract(p, from, line.subcontractUnitPrice(), line.subcontractAmount(), line.subcontractVat());
            out.add(ProductionResponse.from(productionRepository.save(p)));
        }
        return out;
    }

    /**
     * 원본 격자의 [외주비단가]·[외주비합계]·[외주비부가세].
     * 단가를 안 줬고 생산된공장이 <b>외주</b>처면 품목의 [외주비단가]를 깐다(원본도 품목에서 불러온다).
     * 합계 = 단가 × 수량(원 미만 반올림), 부가세 = 합계의 10%(원 미만 버림). 사람이 적은 값은 그대로 둔다.
     */
    private void applySubcontract(Production p, Warehouse from, BigDecimal unitPrice, BigDecimal amount, BigDecimal vat) {
        BigDecimal price = unitPrice;
        if (price == null) {
            price = from != null && "외주".equals(from.getKind()) && p.getProduct().getSubcontractPrice() != null
                    ? p.getProduct().getSubcontractPrice() : BigDecimal.ZERO;
        }
        BigDecimal amt = amount != null ? amount
                : price.multiply(p.getProducedQty()).setScale(0, java.math.RoundingMode.HALF_UP);
        BigDecimal tax = vat != null ? vat
                : amt.multiply(new BigDecimal("0.1")).setScale(0, java.math.RoundingMode.DOWN);
        p.setSubcontractUnitPrice(price);
        p.setSubcontractAmount(amt);
        p.setSubcontractVat(tax);
    }

    /**
     * 격자로 받은 여러 줄을 <b>한 트랜잭션</b>에 넣는다. 원본처럼 줄이 몇 개든 번호는 하나다.
     * 한 줄이라도 막히면 전부 되돌린다 — 반쪽 입고가 남으면 재고와 실적이 서로 다른 말을 한다.
     */
    @Transactional
    public java.util.List<ProductionResponse> createBatch(CreateProductionBatchRequest req, String username) {
        LocalDate date = req.productionDate() != null ? req.productionDate() : LocalDate.now();
        String prodNo = generateProdNo(date);
        java.util.List<ProductionResponse> out = new java.util.ArrayList<>();
        int lineNo = 0;
        for (ProductionLine line : req.lines()) {
            lineNo++;
            out.add(create(new CreateProductionRequest(
                    line.workOrderId(), line.producedQty(), date,
                    req.fromWarehouseId(), req.warehouseId(), req.projectId(),
                    line.note(), line.laborMinutes(), req.employeeId(), line.materials()), username, prodNo, lineNo));
        }
        return out;
    }

    /** 생산실적 등록: 자재 출고(수동 소모목록 있으면 그대로, 없으면 BOM 자동소모) + 완제품 입고 */
    @Transactional
    public ProductionResponse create(CreateProductionRequest req, String username) {
        LocalDate date = req.productionDate() != null ? req.productionDate() : LocalDate.now();
        return create(req, username, generateProdNo(date), 1);
    }

    private ProductionResponse create(CreateProductionRequest req, String username, String prodNo, int lineNo) {
        WorkOrder wo = getWorkOrder(req.workOrderId());
        boolean manualConsume = req.materials() != null && !req.materials().isEmpty();
        LocalDate date = req.productionDate() != null ? req.productionDate() : LocalDate.now();

        /*
         * 원본은 [생산된공장] → [받는창고] 로 옮기는 전표다(생산입고조회의 두 열).
         * 둘 다 안 주면 예전처럼 작업지시의 창고 하나에서 오간다. 공장을 안 쓰는 회사도 있다.
         */
        Warehouse warehouse = req.warehouseId() != null ? warehouseService.get(req.warehouseId()) : wo.getWarehouse();
        Warehouse from = req.fromWarehouseId() != null ? warehouseService.get(req.fromWarehouseId()) : null;
        var project = req.projectId() != null ? projectService.get(req.projectId()) : null;

        Production p = createLine(wo, wo.getProduct(), req.producedQty(), date, from, warehouse, project,
                req.note(), req.laborMinutes(), req.employeeId(), manualConsume ? req.materials() : null,
                prodNo, lineNo, username);
        p.setEntryType(manualConsume ? ProductionEntryType.II : ProductionEntryType.I);
        applySubcontract(p, from, null, null, null);
        return ProductionResponse.from(productionRepository.save(p));
    }

    /**
     * 생산품목 한 줄을 만든다: 자재 소모 → 완제품 입고 → 작업지시 진척.
     *
     * @param manual null 이면 BOM 자동소모(생산입고 I), 아니면 그 목록만 소모(II·III — 비었으면 소모 없음)
     * @param from   생산된공장(자재가 빠지는 곳). null 이면 받는창고에서 뺀다 — 공장을 안 쓰는 회사도 있다.
     */
    private Production createLine(WorkOrder wo, Item product, BigDecimal qty, LocalDate date,
                                  Warehouse from, Warehouse warehouse,
                                  com.erp.inventory.project.Project project, String note, Integer laborMinutes,
                                  Long employeeId, List<ManualConsumeLine> manual,
                                  String prodNo, int lineNo, String username) {
        if (wo != null) {
            BigDecimal remaining = wo.getPlannedQty().subtract(wo.getProducedQty());
            if (qty.compareTo(remaining) > 0) {
                throw ApiException.badRequest(String.format(
                        "지시수량을 초과합니다. 잔여 %s (지시 %s, 기생산 %s)",
                        remaining.toPlainString(), wo.getPlannedQty().toPlainString(), wo.getProducedQty().toPlainString()));
            }
        }
        Warehouse consumeAt = from != null ? from : warehouse;

        Production production = Production.builder()
                .prodNo(prodNo)
                .lineNo(lineNo)
                .workOrder(wo)
                .product(product)
                .warehouse(warehouse)
                .fromWarehouse(from)
                .project(project)
                .note(note)
                .laborMinutes(laborMinutes)
                .employeeId(employeeId)
                .producedQty(qty)
                .productionDate(date)
                .createdBy(username)
                .build();

        // 1) 자재 소요 출고 (재고 부족 시 전체 롤백)
        if (manual != null) {
            for (ManualConsumeLine line : manual) {
                Item component = itemService.get(line.componentId());
                if (component.getId().equals(product.getId())) {
                    throw ApiException.badRequest("완제품 자신을 소모자재로 선택할 수 없습니다: " + component.getName());
                }
                stockService.applyDelta(component, consumeAt, line.quantity().negate(),
                        StockTransactionType.OUTBOUND, null, date,
                        "생산소요(수동) " + prodNo, username);
                production.addMaterial(ProductionMaterial.builder()
                        .component(component).quantity(line.quantity()).build());
            }
        } else {
            Bom bom = getBom(product);
            for (BomLine line : bom.getLines()) {
                Item component = line.getComponent();
                BigDecimal consume = line.getQuantity().multiply(qty);
                stockService.applyDelta(component, consumeAt, consume.negate(),
                        StockTransactionType.OUTBOUND, null, date,
                        "생산소요 " + prodNo, username);
                production.addMaterial(ProductionMaterial.builder()
                        .component(component).quantity(consume).build());
            }
        }

        // 2) 완제품 입고
        stockService.applyDelta(product, warehouse, qty,
                StockTransactionType.INBOUND, null, date,
                "생산입고 " + prodNo, username);

        // 3) 작업지시 진척 갱신
        if (wo != null) {
            wo.setProducedQty(wo.getProducedQty().add(qty));
            wo.setStatus(wo.getProducedQty().compareTo(wo.getPlannedQty()) >= 0
                    ? WorkOrderStatus.COMPLETED : WorkOrderStatus.IN_PROGRESS);
        }
        return production;
    }

    /**
     * 생산실적 삭제. 원본(이카운트) 생산입고조회의 [선택삭제] 에 해당한다.
     *
     * <p>재고는 <b>지우지 않고 반대 거래를 남긴다</b> — 완제품을 출고하고 자재를 되돌린다.
     * 이력을 지우면 왜 재고가 움직였는지 아무도 설명할 수 없게 된다.
     */
    @Transactional
    public void delete(Long id, String username) {
        Production p = productionRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("생산실적을 찾을 수 없습니다. id=" + id));
        reverse(p, username);
        productionRepository.delete(p);
    }

    /**
     * 외주비가 붙은 생산입고 줄. 기간은 생산일이다. 원본 외주비일괄회계반영의 자료다.
     * 외주비합계·부가세가 둘 다 0 인 줄은 넘길 것이 없어 빠진다.
     */
    @Transactional(readOnly = true)
    public List<ProductionDtos.SubcontractLine> findSubcontract(LocalDate from, LocalDate to) {
        return productionRepository.findWithRefsByPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31))
                .stream()
                .filter(p -> p.getSubcontractAmount().signum() != 0 || p.getSubcontractVat().signum() != 0)
                .map(p -> new ProductionDtos.SubcontractLine(
                        p.getId(), p.getProdNo(), p.getLineNo(), p.getProductionDate(),
                        p.getProduct().getId(), p.getProduct().getCode(), p.getProduct().getName(), p.getProducedQty(),
                        p.getSubcontractUnitPrice(), p.getSubcontractAmount(), p.getSubcontractVat(),
                        p.getFromWarehouse() != null ? p.getFromWarehouse().getId() : null,
                        p.getFromWarehouse() != null ? p.getFromWarehouse().getName() : null,
                        p.getFromWarehouse() != null ? p.getFromWarehouse().getKind() : null,
                        p.getFromWarehouse() != null ? p.getFromWarehouse().getOutsourcingPartnerId() : null,
                        p.getProject() != null ? p.getProject().getId() : null,
                        p.getEmployeeId(), p.getNote(), p.getSubcontractJournalId()))
                .toList();
    }

    /** 외주비를 넘긴(또는 되돌린) 회계전표를 줄에 적는다. journalId 가 null 이면 '안 넘김' 으로 돌린다. */
    @Transactional
    public void markSubcontractJournal(List<Long> productionIds, Long journalId) {
        for (Production p : productionRepository.findAllById(productionIds)) {
            p.setSubcontractJournalId(journalId);
        }
    }

    /** 한 줄이 움직인 재고·작업지시 진척을 되돌린다(행은 지우지 않는다). */
    private void reverse(Production p, String username) {
        /* 원본도 회계반영한 전표는 반영을 먼저 취소해야 고치거나 지울 수 있다. */
        if (p.getSubcontractJournalId() != null) {
            throw ApiException.badRequest("외주비를 회계반영한 생산입고입니다. 외주비일괄회계반영에서 반영을 먼저 취소하세요: " + p.getProdNo());
        }
        LocalDate date = p.getProductionDate();
        Warehouse warehouse = p.getWarehouse();

        // 1) 완제품을 도로 뺀다. 이미 팔려 나가 재고가 모자라면 여기서 막힌다 —
        //    그 편이 맞다. 없는 물건을 지워서 재고를 음수로 만들면 안 된다.
        stockService.applyDelta(p.getProduct(), warehouse, p.getProducedQty().negate(),
                StockTransactionType.OUTBOUND, null, date,
                "생산입고취소 " + p.getProdNo(), username);

        // 2) 소모했던 자재를 되돌린다 — 뺐던 곳(생산된공장)으로 돌려놓는다.
        //    받는창고로 돌려놓으면 공장 재고가 영영 모자란 채로 남는다.
        Warehouse consumedAt = p.getFromWarehouse() != null ? p.getFromWarehouse() : warehouse;
        for (ProductionMaterial m : p.getMaterials()) {
            stockService.applyDelta(m.getComponent(), consumedAt, m.getQuantity(),
                    StockTransactionType.INBOUND, null, date,
                    "생산소요취소 " + p.getProdNo(), username);
        }

        // 3) 작업지시 진척을 되돌린다. 완료였던 것이 다시 진행중/계획으로 돌아간다.
        WorkOrder wo = p.getWorkOrder();
        if (wo != null) {
            BigDecimal left = wo.getProducedQty().subtract(p.getProducedQty());
            wo.setProducedQty(left.signum() < 0 ? BigDecimal.ZERO : left);
            wo.setStatus(wo.getProducedQty().signum() == 0
                    ? WorkOrderStatus.PLANNED
                    : (wo.getProducedQty().compareTo(wo.getPlannedQty()) >= 0
                            ? WorkOrderStatus.COMPLETED : WorkOrderStatus.IN_PROGRESS));
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private WorkOrder getWorkOrder(Long id) {
        return workOrderRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("작업지시를 찾을 수 없습니다. id=" + id));
    }

    private Bom getBom(Item product) {
        return bomRepository.findByProductIdWithProduct(product.getId())
                .orElseThrow(() -> ApiException.badRequest(
                        "제품의 BOM(자재명세서)이 등록되어 있지 않습니다: " + product.getName()));
    }

    private String generateProdNo(LocalDate date) {
        return docNoGenerator.next("PR-", "productions", "prod_no", "production_date", date);
    }
}
