package com.erp.groupware.service;

import com.erp.common.ApiException;
import com.erp.groupware.domain.SupplyItem;
import com.erp.groupware.dto.SupplyDtos.CreateSupplyRequest;
import com.erp.groupware.dto.SupplyDtos.SupplyResponse;
import com.erp.groupware.dto.SupplyDtos.UpdateSupplyRequest;
import com.erp.groupware.repository.SupplyRepository;
import com.erp.groupware.repository.SupplyUsageRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import com.erp.groupware.dto.SupplyDtos;

@Service
@RequiredArgsConstructor
public class SupplyService {

    private final SupplyRepository supplyRepository;
    private final SupplyUsageRepository supplyUsageRepository;

    @Transactional(readOnly = true)
    public List<SupplyResponse> findAll() {
        return supplyRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(SupplyResponse::from)
                .toList();
    }

    @Transactional
    public SupplyResponse create(CreateSupplyRequest req) {
        if (supplyRepository.existsByCode(req.code())) {
            throw ApiException.conflict("이미 존재하는 품목코드입니다: " + req.code());
        }
        SupplyItem s = SupplyItem.builder()
                .code(req.code())
                .name(req.name())
                .category(req.category())
                .unit(req.unit())
                .stockQty(req.stockQty() != null ? req.stockQty() : BigDecimal.ZERO)
                .note(req.note())
                .build();
        return SupplyResponse.from(supplyRepository.save(s));
    }

    @Transactional
    public SupplyResponse update(Long id, UpdateSupplyRequest req) {
        SupplyItem s = get(id);
        if (req.name() != null) s.setName(req.name());
        if (req.category() != null) s.setCategory(req.category());
        if (req.unit() != null) s.setUnit(req.unit());
        if (req.stockQty() != null) s.setStockQty(req.stockQty());
        if (req.note() != null) s.setNote(req.note());
        return SupplyResponse.from(s);
    }

    @Transactional
    public void delete(Long id) {
        // 사용내역이 남아 있는 공용품을 지우면 "무엇을 빌렸는지 모르는 기록"이 생긴다.
        // FK 로도 막히지만, 그 경우 DB 제약 위반 메시지가 그대로 새어 나가므로 여기서 먼저 막는다.
        if (supplyUsageRepository.existsBySupplyItemId(id)) {
            throw ApiException.conflict("사용내역이 있는 공용품은 삭제할 수 없습니다.");
        }
        supplyRepository.delete(get(id));
    }

    private SupplyItem get(Long id) {
        return supplyRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("공용품을 찾을 수 없습니다. id=" + id));
    }
}
