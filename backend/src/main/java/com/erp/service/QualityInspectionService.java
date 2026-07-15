package com.erp.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.domain.Item;
import com.erp.domain.Lot;
import com.erp.domain.QualityInspection;
import com.erp.domain.QualityResult;
import com.erp.dto.QualityDtos.CreateInspectionRequest;
import com.erp.dto.QualityDtos.InspectionResponse;
import com.erp.repository.ItemRepository;
import com.erp.repository.LotRepository;
import com.erp.repository.QualityInspectionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class QualityInspectionService {

    private final QualityInspectionRepository inspectionRepository;
    private final ItemRepository itemRepository;
    private final LotRepository lotRepository;
    private final DocumentNoGenerator docNoGenerator;

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
                .inspectedQty(req.inspectedQty())
                .defectQty(defect)
                .result(result)
                .inspector(inspector)
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
}
