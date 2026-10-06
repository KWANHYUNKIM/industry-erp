package com.erp.quality.asrequest;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.trade.partner.BusinessPartner;
import com.erp.inventory.item.Item;
import com.erp.inventory.project.ProjectService;
import com.erp.inventory.warehouse.WarehouseService;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.quality.asrequest.dto.AsDtos.AsResponse;
import com.erp.quality.asrequest.dto.AsDtos.CreateAsRequest;
import com.erp.quality.asrequest.dto.AsDtos.UpdateAsRequest;
import com.erp.trade.partner.PartnerService;
import com.erp.quality.asrequest.dto.AsDtos.AsLineRequest;
import com.erp.inventory.item.ItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.quality.asrequest.dto.AsDtos;

@Service
@RequiredArgsConstructor
public class AsService {

    private final AsRequestRepository asRepository;
    private final WarehouseService warehouseService;
    private final ProjectService projectService;
    /* 같은 모듈 — 수리가 이어진 접수는 지우지 않는다(수리가 접수를 문다). */
    private final com.erp.quality.asrepair.AsRepairRepository asRepairRepository;
    private final PartnerService partnerService;
    private final ItemService itemService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<AsResponse> findAll() {
        return findAll(null, null);
    }

    /**
     * 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다).
     *
     * <p>응답 모양은 <b>그대로 둔다.</b> 여러 화면이 알몸 배열을 기대하고 있어,
     * 자르는 껍데기를 씌우면 안 고친 곳이 조용히 빈 표가 된다.
     */
    @Transactional(readOnly = true)
    public List<AsResponse> findAll(LocalDate from, LocalDate to) {
        return findAll(from, to, null, null);
    }

    /**
     * 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다).
     *
     * <p><b>doneFrom·doneTo 는 수리한 날</b>이다. 원본 A/S수리현황(E040611)은 그것을
     * <b>주 조건</b>으로 쓰고 접수일자를 보조로 둔다 — 우리는 접수일로만 걸러
     * 이번 달에 고친 건을 서버에서 좁힐 수가 없었다. 안 고친 건은 그 날이 없으니 빠진다.
     *
     * <p>둘 다 주면 <b>수리일 쪽이 이긴다</b> — 원본이 그쪽을 주 조건으로 쓰기 때문이다.
     */
    @Transactional(readOnly = true)
    public List<AsResponse> findAll(LocalDate from, LocalDate to, LocalDate doneFrom, LocalDate doneTo) {
        var found = (doneFrom != null || doneTo != null)
                ? asRepository.findWithRefsByDonePeriod(
                        doneFrom != null ? doneFrom : LocalDate.of(1, 1, 1),
                        doneTo != null ? doneTo : LocalDate.of(9999, 12, 31))
                : (from == null && to == null)
                        ? asRepository.findAllWithRefs()
                        : asRepository.findWithRefsByPeriod(
                                from != null ? from : LocalDate.of(1, 1, 1),
                                to != null ? to : LocalDate.of(9999, 12, 31));
        return found.stream().map(AsResponse::from).toList();
    }

    @Transactional
    public AsResponse create(CreateAsRequest req, String username) {
        BusinessPartner partner = partnerService.get(req.partnerId());
        List<AsLineRequest> lines = req.lines() != null && !req.lines().isEmpty() ? req.lines()
                : req.itemId() != null ? List.of(new AsLineRequest(req.itemId(), BigDecimal.ONE)) : List.of();
        if (lines.isEmpty()) throw ApiException.badRequest("품목을 1개 이상 입력하세요.");

        LocalDate date = req.receiptDate() != null ? req.receiptDate() : LocalDate.now();

        AsRequest as = AsRequest.builder()
                .asNo(generateNo(date))
                .partner(partner)
                .receiptDate(date)
                .warehouse(warehouseService.getUsable(req.warehouseId()))
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .title(req.title())
                .scheduledDate(req.scheduledDate())
                .symptom(req.symptom())
                .charge(req.charge())
                .status(AsStatus.RECEIVED)
                .createdBy(username)
                .build();

        applyLines(as, lines);
        return AsResponse.from(asRepository.save(as));
    }

    /**
     * 품목 줄을 통째로 갈아 끼운다. 접수 머리의 {@code item} 은 첫 줄 품목 — 수리조회·현황이 그 값을 읽는다.
     * 수리품목은 고객이 가진 물건이라 지금 단종(사용중지)이어도 받는다 — get, getUsable 이 아니다.
     */
    private void applyLines(AsRequest as, List<AsLineRequest> lines) {
        if (lines.isEmpty()) throw ApiException.badRequest("품목을 1개 이상 입력하세요.");
        as.getLines().clear();
        if (as.getId() != null) asRepository.flush();
        int no = 0;
        for (AsLineRequest l : lines) {
            Item item = itemService.get(l.itemId());
            if (no == 0) as.setItem(item);
            as.getLines().add(AsRequestLine.builder()
                    .asRequest(as).lineNo(++no).item(item)
                    .quantity(l.quantity() != null ? l.quantity() : BigDecimal.ONE)
                    .build());
        }
    }

    /**
     * 원본 A/S접수조회 [선택삭제] · 수정 창 [삭제] — "선택한 전표를 삭제 하겠습니까?".
     * 이 접수를 불러온 A/S수리가 있으면 막는다 — 수리가 접수를 문다(2026-10-04 소모부품(AsPart)을 걷어 내며 바꿈:
     * 부품은 이제 수리의 판매연결전표로 팔고, 재고는 판매가 뺀다).
     */
    @Transactional
    public void delete(Long id) {
        AsRequest as = asRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("A/S 접수를 찾을 수 없습니다. id=" + id));
        if (asRepairRepository.existsByAsRequestId(id)) {
            throw ApiException.badRequest(as.getAsNo() + " 을(를) 불러온 A/S수리가 있습니다 — 수리를 먼저 지운 뒤 삭제하세요.");
        }
        asRepository.delete(as);
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
        /* 원본 수정 창은 일자만 잠근다 — 거래처 · 창고 · 프로젝트 · 접수내용 · 품목 줄도 고친다. */
        if (req.partnerId() != null) as.setPartner(partnerService.get(req.partnerId()));
        if (req.warehouseId() != null) as.setWarehouse(warehouseService.getUsable(req.warehouseId()));
        if (req.projectId() != null) as.setProject(projectService.get(req.projectId()));
        if (req.symptom() != null) as.setSymptom(req.symptom());
        if (req.lines() != null) applyLines(as, req.lines());
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
}
