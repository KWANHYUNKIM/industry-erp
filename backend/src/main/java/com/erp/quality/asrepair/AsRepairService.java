package com.erp.quality.asrepair;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.warehouse.WarehouseService;
import com.erp.quality.asrepair.dto.AsRepairDtos.ConsumptionLine;
import com.erp.quality.asrepair.dto.AsRepairDtos.LinkSaleRequest;
import com.erp.quality.asrepair.dto.AsRepairDtos.LinkedSale;
import com.erp.quality.asrepair.dto.AsRepairDtos.RepairLineRequest;
import com.erp.quality.asrepair.dto.AsRepairDtos.RepairRequest;
import com.erp.quality.asrepair.dto.AsRepairDtos.RepairResponse;
import com.erp.quality.asrequest.AsRequestRepository;
import com.erp.trade.partner.PartnerService;
import com.erp.trade.sales.SalesService;
import com.erp.trade.sales.dto.SalesDtos.CreateSalesRequest;
import com.erp.trade.sales.dto.SalesDtos.SalesLineRequest;
import com.erp.trade.sales.dto.SalesDtos.SalesResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A/S수리(E040605 입력 · E040606 조회). 수리는 재고를 안 움직이고, 부품 · 수리비는 판매연결전표로 판매를 만든다
 * (2026-10-03 원본: 수리조회 [생성한 전표] → '판매연결전표' 창의 [신규]).
 */
@Service
@RequiredArgsConstructor
public class AsRepairService {

    private final AsRepairRepository repository;
    private final AsRepairSaleRepository saleLinkRepository;
    private final AsRequestRepository asRequestRepository;
    private final PartnerService partnerService;
    private final WarehouseService warehouseService;
    private final ItemService itemService;
    private final SalesService salesService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<RepairResponse> list(LocalDate from, LocalDate to) {
        List<AsRepair> repairs = repository.findWithRefs(from, to);
        Map<Long, List<LinkedSale>> sales = linkedSales(repairs.stream().map(AsRepair::getId).toList());
        return repairs.stream().map(r -> RepairResponse.from(r, sales.getOrDefault(r.getId(), List.of()))).toList();
    }

    @Transactional(readOnly = true)
    public RepairResponse get(Long id) {
        AsRepair r = find(id);
        return RepairResponse.from(r, linkedSales(List.of(id)).getOrDefault(id, List.of()));
    }

    @Transactional
    public RepairResponse create(RepairRequest req, String user) {
        LocalDate date = req.repairDate() != null ? req.repairDate() : LocalDate.now();
        AsRepair r = AsRepair.builder()
                .repairNo(docNoGenerator.next("AR-", "as_repairs", "repair_no", "repair_date", date))
                .repairDate(date)
                .createdBy(user)
                .build();
        apply(r, req);
        return RepairResponse.from(repository.save(r), List.of());
    }

    /** 원본 수정 창은 일자만 잠근다. */
    @Transactional
    public RepairResponse update(Long id, RepairRequest req) {
        AsRepair r = find(id);
        apply(r, req);
        return get(id);
    }

    /** 판매연결전표가 남아 있으면 지우지 않는다 — 판매를 먼저 지워 재고 · 매출을 되돌린다. */
    @Transactional
    public void delete(Long id) {
        AsRepair r = find(id);
        long linked = saleLinkRepository.countByRepairId(id);
        if (linked > 0) {
            throw ApiException.badRequest(String.format(
                    "%s 에 판매연결전표 %d건이 남아 있습니다 — 판매를 먼저 지운 뒤 삭제하세요.", r.getRepairNo(), linked));
        }
        repository.delete(r);
    }

    /** [판매연결전표] [신규] — 수리의 거래처 · 창고로 판매를 만들고 수리에 잇는다. */
    @Transactional
    public RepairResponse linkSale(Long id, LinkSaleRequest req, String user) {
        AsRepair r = find(id);
        List<SalesLineRequest> lines = req.lines().stream()
                .map(l -> new SalesLineRequest(l.itemId(), l.quantity(), l.unitPrice(), null, null, null, null))
                .toList();
        SalesResponse sale = salesService.create(new CreateSalesRequest(
                r.getPartner().getId(), r.getWarehouse().getId(),
                req.saleDate() != null ? req.saleDate() : r.getRepairDate(),
                null, null, "A/S수리 " + r.getRepairNo(), null, null, null, lines), user);
        saleLinkRepository.save(AsRepairSale.builder().repair(r).salesId(sale.id()).build());
        return get(id);
    }

    /** 판매연결전표를 끊고 그 판매를 지운다(재고 · 매출이 되돌아간다). */
    @Transactional
    public RepairResponse unlinkSale(Long id, Long salesId, String user) {
        AsRepairSale link = saleLinkRepository.findBySalesId(salesId)
                .filter(l -> l.getRepair().getId().equals(id))
                .orElseThrow(() -> ApiException.notFound("이 수리에 이어진 판매가 아닙니다. salesId=" + salesId));
        saleLinkRepository.delete(link);
        salesService.delete(salesId, user);
        return get(id);
    }

    private void apply(AsRepair r, RepairRequest req) {
        r.setPartner(partnerService.get(req.partnerId()));
        r.setWarehouse(warehouseService.getUsable(req.warehouseId()));
        r.setAsRequest(req.asRequestId() == null ? null : asRequestRepository.findById(req.asRequestId())
                .orElseThrow(() -> ApiException.notFound("A/S 접수를 찾을 수 없습니다. id=" + req.asRequestId())));
        r.setCharge(req.charge().trim());
        r.setRepairType(req.repairType());
        r.setTitle(req.title());
        r.setContent(req.content());
        if (req.status() != null) r.setStatus(req.status());
        r.getLines().clear();
        if (r.getId() != null) repository.flush();
        int no = 0;
        for (RepairLineRequest l : req.lines()) {
            r.getLines().add(AsRepairLine.builder().repair(r).lineNo(++no)
                    .item(itemService.get(l.itemId()))
                    .quantity(l.quantity() != null ? l.quantity() : BigDecimal.ONE)
                    .build());
        }
    }

    /** A/S소모현황 — 기준일자(수리일자) 안의 수리에 이어진 판매 줄. 조건은 화면이 이 줄로 거른다. */
    @Transactional(readOnly = true)
    public List<ConsumptionLine> consumption(LocalDate from, LocalDate to) {
        List<AsRepair> repairs = repository.findWithRefs(from, to);
        if (repairs.isEmpty()) return List.of();
        Map<Long, AsRepair> byId = repairs.stream().collect(Collectors.toMap(AsRepair::getId, Function.identity()));
        List<AsRepairSale> links = saleLinkRepository.findByRepairIdIn(List.copyOf(byId.keySet()));
        if (links.isEmpty()) return List.of();
        Set<Long> saleIds = new HashSet<>(links.stream().map(AsRepairSale::getSalesId).toList());
        Map<Long, SalesResponse> sales = salesService.findAll().stream().filter(s -> saleIds.contains(s.id()))
                .collect(Collectors.toMap(SalesResponse::id, Function.identity()));
        List<ConsumptionLine> out = new java.util.ArrayList<>();
        for (AsRepairSale link : links) {
            AsRepair r = byId.get(link.getRepair().getId());
            SalesResponse s = sales.get(link.getSalesId());
            if (r == null || s == null) continue;
            var first = r.getLines().isEmpty() ? null : r.getLines().get(0);
            var req = r.getAsRequest();
            for (var l : s.lines()) {
                out.add(new ConsumptionLine(r.getId(), r.getRepairNo(), r.getRepairDate(),
                        first != null ? first.getItem().getId() : null,
                        first != null ? first.getItem().getName() : null, r.getCharge(),
                        r.getRepairType(), r.getStatus(), r.getTitle(), r.getContent(), r.getCreatedBy(),
                        r.getPartner().getId(), r.getPartner().getName(), r.getWarehouse().getId(),
                        req != null ? req.getReceiptDate() : null, req != null ? req.getCharge() : null,
                        req != null && req.getProject() != null ? req.getProject().getId() : null,
                        s.id(), s.docNo(), s.saleDate(),
                        l.itemId(), l.itemName(), l.quantity(), l.unitPrice(), l.supplyAmount(), l.vatAmount()));
            }
        }
        out.sort((a, b) -> b.repairDate().compareTo(a.repairDate()) != 0 ? b.repairDate().compareTo(a.repairDate())
                : b.repairNo().compareTo(a.repairNo()));
        return out;
    }

    private Map<Long, List<LinkedSale>> linkedSales(List<Long> repairIds) {
        if (repairIds.isEmpty()) return Map.of();
        List<AsRepairSale> links = saleLinkRepository.findByRepairIdIn(repairIds);
        if (links.isEmpty()) return Map.of();
        Set<Long> ids = new HashSet<>(links.stream().map(AsRepairSale::getSalesId).toList());
        Map<Long, SalesResponse> byId = salesService.findAll().stream().filter(s -> ids.contains(s.id()))
                .collect(Collectors.toMap(SalesResponse::id, Function.identity()));
        return links.stream().filter(l -> byId.containsKey(l.getSalesId()))
                .collect(Collectors.groupingBy(l -> l.getRepair().getId(), Collectors.mapping(l -> {
                    SalesResponse s = byId.get(l.getSalesId());
                    return new LinkedSale(s.id(), s.docNo(), s.saleDate(), s.supplyAmount(), s.vatAmount(), s.totalAmount());
                }, Collectors.toList())));
    }

    private AsRepair find(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("A/S 수리를 찾을 수 없습니다. id=" + id));
    }
}
