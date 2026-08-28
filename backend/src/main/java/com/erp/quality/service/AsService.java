package com.erp.quality.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.quality.domain.AsPart;
import com.erp.quality.domain.AsRequest;
import com.erp.quality.domain.AsStatus;
import com.erp.trade.domain.BusinessPartner;
import com.erp.inventory.domain.Item;
import com.erp.inventory.service.ProjectService;
import com.erp.inventory.service.WarehouseService;
import com.erp.inventory.domain.StockTransactionType;
import com.erp.inventory.domain.Warehouse;
import com.erp.quality.dto.AsDtos.AsConsumptionRow;
import com.erp.quality.dto.AsDtos.AsPartResponse;
import com.erp.quality.dto.AsDtos.AsResponse;
import com.erp.quality.dto.AsDtos.CreateAsPartRequest;
import com.erp.quality.dto.AsDtos.CreateAsRequest;
import com.erp.quality.dto.AsDtos.UpdateAsRequest;
import com.erp.quality.repository.AsPartRepository;
import com.erp.quality.repository.AsRequestRepository;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.inventory.repository.ItemRepository;
import com.erp.inventory.repository.WarehouseRepository;
import com.erp.inventory.service.StockService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.erp.quality.dto.AsDtos;

@Service
@RequiredArgsConstructor
public class AsService {

    private final AsRequestRepository asRepository;
    private final WarehouseService warehouseService;
    private final ProjectService projectService;
    private final AsPartRepository asPartRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final ItemRepository itemRepository;
    private final WarehouseRepository warehouseRepository;
    private final StockService stockService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<AsResponse> findAll() {
        return asRepository.findAllWithRefs().stream().map(AsResponse::from).toList();
    }

    @Transactional
    public AsResponse create(CreateAsRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));

        LocalDate date = req.receiptDate() != null ? req.receiptDate() : LocalDate.now();

        AsRequest as = AsRequest.builder()
                .asNo(generateNo(date))
                .partner(partner)
                .item(item)
                .receiptDate(date)
                .warehouse(req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId()))
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .title(req.title())
                .scheduledDate(req.scheduledDate())
                .symptom(req.symptom())
                .charge(req.charge())
                .status(AsStatus.RECEIVED)
                .createdBy(username)
                .build();

        return AsResponse.from(asRepository.save(as));
    }

    @Transactional
    public AsResponse update(Long id, UpdateAsRequest req) {
        AsRequest as = asRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("A/S 접수를 찾을 수 없습니다. id=" + id));
        if (req.status() != null) {
            as.setStatus(req.status());
            // 완료로 바뀌면 완료일 자동 설정
            if (req.status() == AsStatus.COMPLETED && as.getDoneDate() == null && req.doneDate() == null) {
                as.setDoneDate(LocalDate.now());
            }
        }
        if (req.charge() != null) as.setCharge(req.charge());
        if (req.title() != null) as.setTitle(req.title());
        if (req.scheduledDate() != null) as.setScheduledDate(req.scheduledDate());
        if (req.repairNote() != null) as.setRepairNote(req.repairNote());
        if (req.doneDate() != null) as.setDoneDate(req.doneDate());
        return AsResponse.from(as);
    }

    private String generateNo(LocalDate date) {
        return docNoGenerator.next("AS-", "as_requests", "as_no", "receipt_date", date);
    }

    // ------------------------------------------------------------ 소모부품

    @Transactional(readOnly = true)
    public List<AsPartResponse> findParts(Long asId) {
        return asPartRepository.findByAsRequestIdWithRefs(asId).stream().map(AsPartResponse::from).toList();
    }

    /** A/S에 소모부품을 추가하고 창고 재고를 차감(OUTBOUND)한다. */
    @Transactional
    public AsPartResponse addPart(Long asId, CreateAsPartRequest req, String username) {
        AsRequest as = asRepository.findById(asId)
                .orElseThrow(() -> ApiException.notFound("A/S 접수를 찾을 수 없습니다. id=" + asId));
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));
        Warehouse warehouse = warehouseRepository.findById(req.warehouseId())
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + req.warehouseId()));
        if (req.quantity().signum() <= 0) {
            throw ApiException.badRequest("수량은 0보다 커야 합니다.");
        }

        // 재고 차감(음수 재고는 StockService 가 막고 전표까지 함께 롤백).
        String note = "A/S소모 " + as.getAsNo()
                + (req.remark() != null && !req.remark().isBlank() ? " (" + req.remark() + ")" : "");
        stockService.applyDelta(item, warehouse, req.quantity().negate(),
                StockTransactionType.OUTBOUND, req.unitPrice(), LocalDate.now(), note, username);

        AsPart part = AsPart.builder()
                .asRequest(as).item(item).warehouse(warehouse)
                .quantity(req.quantity()).unitPrice(req.unitPrice()).remark(req.remark())
                .createdBy(username)
                .build();
        return AsPartResponse.from(asPartRepository.save(part));
    }

    /** 소모부품 삭제 — 차감했던 재고를 되돌린다(INBOUND). */
    @Transactional
    public void deletePart(Long partId, String username) {
        AsPart part = asPartRepository.findById(partId)
                .orElseThrow(() -> ApiException.notFound("소모부품을 찾을 수 없습니다. id=" + partId));
        stockService.applyDelta(part.getItem(), part.getWarehouse(), part.getQuantity(),
                StockTransactionType.INBOUND, part.getUnitPrice(), LocalDate.now(),
                "A/S소모 취소 " + part.getAsRequest().getAsNo(), username);
        asPartRepository.delete(part);
    }

    /**
     * A/S소모현황 — 품목별 소모 수량·금액·A/S 건수 집계.
     *
     * <p>원본 조건 실측(사본): 접수일자 · 창고 · 프로젝트 · 수리담당자 · 접수담당자 ·
     * 수리유형 · 거래처 · 수리품목. 이 가운데 우리가 가진 넷(접수일자·창고·거래처·수리품목)을
     * 받는다. <b>합친 뒤에는 못 거르므로</b> 화면이 아니라 여기서 걸러야 한다.
     */
    @Transactional(readOnly = true)
    public List<AsConsumptionRow> consumption(LocalDate from, LocalDate to,
                                              Long warehouseId, Long partnerId, Long repairItemId) {
        Map<Long, Acc> byItem = new LinkedHashMap<>();
        for (AsPart p : asPartRepository.findAllWithRefs()) {
            AsRequest as = p.getAsRequest();
            if (from != null && as.getReceiptDate().isBefore(from)) continue;
            if (to != null && as.getReceiptDate().isAfter(to)) continue;
            if (warehouseId != null && !warehouseId.equals(p.getWarehouse().getId())) continue;
            if (partnerId != null && !partnerId.equals(as.getPartner().getId())) continue;
            if (repairItemId != null && !repairItemId.equals(as.getItem().getId())) continue;
            Acc acc = byItem.computeIfAbsent(p.getItem().getId(),
                    k -> new Acc(p.getItem().getName()));
            acc.totalQty = acc.totalQty.add(p.getQuantity());
            if (p.getUnitPrice() != null) {
                acc.totalAmount = acc.totalAmount.add(p.getUnitPrice().multiply(p.getQuantity()));
            }
            acc.asIds.add(p.getAsRequest().getId());
        }
        List<AsConsumptionRow> rows = new ArrayList<>();
        for (Map.Entry<Long, Acc> e : byItem.entrySet()) {
            Acc a = e.getValue();
            rows.add(new AsConsumptionRow(e.getKey(), a.name, a.asIds.size(), a.totalQty, a.totalAmount));
        }
        rows.sort((x, y) -> y.totalQty().compareTo(x.totalQty()));
        return rows;
    }

    private static final class Acc {
        final String name;
        BigDecimal totalQty = BigDecimal.ZERO;
        BigDecimal totalAmount = BigDecimal.ZERO;
        final java.util.Set<Long> asIds = new java.util.HashSet<>();
        Acc(String name) { this.name = name; }
    }
}
