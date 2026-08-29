package com.erp.quality.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.domain.Item;
import com.erp.inventory.service.ProjectService;
import com.erp.inventory.service.WarehouseService;
import com.erp.inventory.domain.Lot;
import com.erp.quality.domain.QualityInspection;
import com.erp.quality.domain.QualityResult;
import com.erp.quality.dto.QualityDtos.CreateInspectionRequest;
import com.erp.quality.dto.QualityDtos.InspectionResponse;
import com.erp.inventory.repository.ItemRepository;
import com.erp.inventory.repository.LotRepository;
import com.erp.quality.repository.QualityInspectionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.quality.dto.QualityDtos;

@Service
@RequiredArgsConstructor
public class QualityInspectionService {

    private final QualityInspectionRepository inspectionRepository;
    private final ItemRepository itemRepository;
    private final LotRepository lotRepository;
    private final DocumentNoGenerator docNoGenerator;
    /* 다른 모듈의 값은 그 모듈의 service 를 거친다(CLAUDE.md 4.2). */
    private final WarehouseService warehouseService;
    private final ProjectService projectService;

    @Transactional(readOnly = true)
    public List<InspectionResponse> findAll() {
        return inspectionRepository.findAllWithRefs().stream()
                .map(InspectionResponse::from)
                .toList();
    }

    @Transactional
    public InspectionResponse create(CreateInspectionRequest req, String username) {
        Item item = itemRepository.findById(req.itemId())
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + req.itemId()));

        LocalDate date = req.inspectionDate() != null ? req.inspectionDate() : LocalDate.now();
        BigDecimal defect = req.defectQty() != null ? req.defectQty() : BigDecimal.ZERO;
        if (defect.compareTo(req.inspectedQty()) > 0) {
            throw ApiException.badRequest("불량수량이 검사수량보다 클 수 없습니다.");
        }

        QualityResult result = req.result() != null ? req.result() : autoResult(req.inspectedQty(), defect);
        String inspector = (req.inspector() != null && !req.inspector().isBlank()) ? req.inspector() : username;

        // 입력한 로트No.가 등록된 로트면 실제 관계로 연결한다(미등록이면 문자열만 남는다)
        Lot lot = (req.lotNo() != null && !req.lotNo().isBlank())
                ? lotRepository.findByLotNo(req.lotNo()).orElse(null)
                : null;

        QualityInspection q = QualityInspection.builder()
                .inspectionNo(generateNo(date))
                .inspectionDate(date)
                .type(req.type())
                .item(item)
                .lotNo(req.lotNo())
                .lot(lot)
                .warehouse(req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId()))
                .project(req.projectId() == null ? null : projectService.get(req.projectId()))
                .inspectedQty(req.inspectedQty())
                .defectQty(defect)
                .result(result)
                .inspector(inspector)
                /* 불량이 없으면 유형도 없다 — 전량 양품인데 '치수불량' 이 붙어 있으면 헷갈린다. */
                .defectType(defect.signum() > 0 ? blankToNull(req.defectType()) : null)
                .remark(req.remark())
                .build();

        return InspectionResponse.from(inspectionRepository.save(q));
    }

    @Transactional
    public void delete(Long id) {
        QualityInspection q = inspectionRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("검사성적을 찾을 수 없습니다. id=" + id));
        inspectionRepository.delete(q);
    }

    /** 판정 미지정 시 자동판정: 불량 0=합격, 불량률<3%=조건부합격, 그 외 불합격 */
    private QualityResult autoResult(BigDecimal inspected, BigDecimal defect) {
        if (defect.signum() == 0) return QualityResult.PASS;
        if (inspected.signum() == 0) return QualityResult.FAIL;
        double rate = defect.doubleValue() / inspected.doubleValue() * 100.0;
        return rate < 3.0 ? QualityResult.CONDITIONAL : QualityResult.FAIL;
    }

    private String generateNo(LocalDate date) {
        return docNoGenerator.next("QC-", "quality_inspections", "inspection_no", "inspection_date", date);
    }

    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v;
    }
}
