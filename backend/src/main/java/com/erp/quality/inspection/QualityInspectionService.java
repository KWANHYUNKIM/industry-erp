package com.erp.quality.inspection;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.item.Item;
import com.erp.inventory.project.ProjectService;
import com.erp.inventory.warehouse.WarehouseService;
import com.erp.inventory.lot.Lot;
import com.erp.quality.inspection.dto.QualityDtos.CreateInspectionRequest;
import com.erp.quality.inspection.dto.QualityDtos.InspectionResponse;
import com.erp.inventory.item.ItemService;
import com.erp.inventory.lot.LotService;
import com.erp.quality.inspection.dto.QualityDtos.InspectionLineRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.quality.inspection.dto.QualityDtos;

@Service
@RequiredArgsConstructor
public class QualityInspectionService {

    private final QualityInspectionRepository inspectionRepository;
    /* 예전엔 inventory 의 리포지토리를 바로 주입했다 — 그 모듈의 service 를 거친다(CLAUDE.md 4.2). */
    private final ItemService itemService;
    private final LotService lotService;
    private final DocumentNoGenerator docNoGenerator;
    /* 다른 모듈의 값은 그 모듈의 service 를 거친다(CLAUDE.md 4.2). */
    private final WarehouseService warehouseService;
    private final ProjectService projectService;

    @Transactional(readOnly = true)
    public List<InspectionResponse> findAll() {
        return findAll(null, null);
    }

    /**
     * 목록. 기간을 주면 그만큼만 준다.
     *
     * <p>응답 모양은 <b>그대로 둔다.</b> 여러 화면이 알몸 배열을 기대하고 있어서,
     * 자르는 껍데기를 씌우면 안 고친 곳이 조용히 빈 표가 된다. 기간만 받는다.
     */
    @Transactional(readOnly = true)
    public List<InspectionResponse> findAll(LocalDate from, LocalDate to) {
        List<QualityInspection> found = (from == null && to == null)
                ? inspectionRepository.findAllWithRefs()
                : inspectionRepository.findWithRefsByPeriod(
                        from != null ? from : LocalDate.of(1, 1, 1),
                        to != null ? to : LocalDate.of(9999, 12, 31));
        return found.stream().map(InspectionResponse::from).toList();
    }

    /**
     * 품질검사 저장 — 원본 품질검사입력(E040621)처럼 품목 줄을 든 전표다(2026-10-04 실측).
     * 줄이 없으면 옛 모양(품목 하나 · 검사수량 · 불량수량)을 줄 하나로 바꿔 받는다.
     */
    @Transactional
    public InspectionResponse create(CreateInspectionRequest req, String username) {
        LocalDate date = req.inspectionDate() != null ? req.inspectionDate() : LocalDate.now();
        String inspector = (req.inspector() != null && !req.inspector().isBlank()) ? req.inspector() : username;

        QualityInspection q = QualityInspection.builder()
                .inspectionNo(generateNo(date))
                .inspectionDate(date)
                .type(req.type() != null ? req.type() : QualityInspectionType.INCOMING)
                .inspector(inspector)
                .remark(req.remark())
                .build();
        applyContent(q, req);
        return InspectionResponse.from(inspectionRepository.save(q));
    }

    /** 수정 — 줄을 통째로 바꾼다. 일자는 그대로(번호가 일자를 문다). */
    @Transactional
    public InspectionResponse update(Long id, CreateInspectionRequest req) {
        QualityInspection q = getInspection(id);
        if (req.type() != null) q.setType(req.type());
        if (req.inspector() != null && !req.inspector().isBlank()) q.setInspector(req.inspector());
        q.setRemark(req.remark());
        applyContent(q, req);
        return InspectionResponse.from(q);
    }

    /** 원본 목록의 [종결여부] — 진행중을 누르면 완료, 완료를 누르면 진행중. */
    @Transactional
    public InspectionResponse changeStatus(Long id, InspectionStatus status) {
        QualityInspection q = getInspection(id);
        q.setStatus(status);
        return InspectionResponse.from(q);
    }

    private void applyContent(QualityInspection q, CreateInspectionRequest req) {
        List<InspectionLineRequest> lines = req.lines() != null && !req.lines().isEmpty()
                ? req.lines()
                : legacyLine(req);
        if (lines.isEmpty()) throw ApiException.badRequest("자료를 입력 바랍니다.");

        q.getLines().clear();
        inspectionRepository.flush();
        int no = 1;
        BigDecimal sampleSum = BigDecimal.ZERO;
        BigDecimal defectSum = BigDecimal.ZERO;
        boolean anyFail = false, allPass = true;
        for (InspectionLineRequest lr : lines) {
            Item item = itemService.get(lr.itemId());
            InspectionMethod method = lr.method() != null ? lr.method() : InspectionMethod.FULL;
            /* 전수면 시료 = 수량(원본은 시료 칸을 막고 수량을 그대로 찍는다). */
            BigDecimal sample = method == InspectionMethod.FULL ? lr.quantity()
                    : (lr.sampleQty() != null ? lr.sampleQty() : BigDecimal.ZERO);
            BigDecimal defect = lr.defectQty() != null ? lr.defectQty() : BigDecimal.ZERO;
            if (sample.compareTo(lr.quantity()) > 0) {
                throw ApiException.badRequest("시료는 수량보다 클 수 없습니다.");
            }
            if (defect.compareTo(sample) > 0) {
                throw ApiException.badRequest("부적격은 시료보다 클 수 없습니다.");
            }
            InspectionPass pass = lr.passResult() != null ? lr.passResult() : InspectionPass.NA;
            q.getLines().add(QualityInspectionLine.builder()
                    .inspection(q).lineNo(no++).item(item).method(method)
                    .quantity(lr.quantity()).sampleQty(sample).defectQty(defect).passResult(pass)
                    /* 불량이 없으면 유형도 없다 — 전량 양품인데 '치수불량' 이 붙어 있으면 헷갈린다. */
                    .defectType(defect.signum() > 0 ? blankToNull(lr.defectType()) : null)
                    .build());
            sampleSum = sampleSum.add(sample);
            defectSum = defectSum.add(defect);
            anyFail |= pass == InspectionPass.FAIL;
            allPass &= pass == InspectionPass.PASS;
        }
        QualityInspectionLine first = q.getLines().get(0);
        /* 머리는 줄에서 모은 값 — 품질검사현황 · 불량률파악보고서가 이것을 읽는다. */
        q.setItem(first.getItem());
        q.setInspectedQty(sampleSum);
        q.setDefectQty(defectSum);
        q.setDefectType(q.getLines().stream().map(QualityInspectionLine::getDefectType)
                .filter(t -> t != null).findFirst().orElse(null));
        q.setResult(req.result() != null ? req.result()
                : anyFail ? QualityResult.FAIL : allPass ? QualityResult.PASS : autoResult(sampleSum, defectSum));

        // 입력한 로트No.가 등록된 로트면 실제 관계로 연결한다(미등록이면 문자열만 남는다)
        q.setLotNo(req.lotNo());
        q.setLot(req.lotNo() != null && !req.lotNo().isBlank() ? lotService.findByLotNo(req.lotNo()).orElse(null) : null);
        q.setWarehouse(req.warehouseId() == null ? null : warehouseService.getUsable(req.warehouseId()));
        q.setProject(req.projectId() == null ? null : projectService.get(req.projectId()));
    }

    /** 옛 모양(품목 하나) → 전수 줄 하나. 시료 = 검사수량, 부적격 = 불량수량. */
    private static List<InspectionLineRequest> legacyLine(CreateInspectionRequest req) {
        if (req.itemId() == null) return List.of();
        if (req.inspectedQty() == null) throw ApiException.badRequest("검사수량을 입력하세요.");
        BigDecimal defect = req.defectQty() != null ? req.defectQty() : BigDecimal.ZERO;
        if (defect.compareTo(req.inspectedQty()) > 0) {
            throw ApiException.badRequest("불량수량이 검사수량보다 클 수 없습니다.");
        }
        return List.of(new InspectionLineRequest(req.itemId(), InspectionMethod.FULL, req.inspectedQty(),
                req.inspectedQty(), defect, null, req.defectType()));
    }

    private QualityInspection getInspection(Long id) {
        return inspectionRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("검사성적을 찾을 수 없습니다. id=" + id));
    }

    @Transactional
    public void delete(Long id) {
        inspectionRepository.delete(getInspection(id));
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
