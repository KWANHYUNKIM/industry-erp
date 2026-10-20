package com.erp.hr.dailypayitem;

import com.erp.common.ApiException;
import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.DailyPayItemRequest;
import com.erp.hr.dailypayitem.dto.DailyPayItemDtos.DailyPayItemResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 일용근로 수당등록(E020136) · 공제등록(E020137). 2026-10-20 원본 실측:
 * 코드 · 이름 · 표시순서를 넣고 [저장(F8)] → 안내 없이 저장, 수당은 지급유형 '변동(일)' · 과세구분 '전액과세' 가 기본,
 * 코드는 저장 뒤 막힘, 이름을 고치면 계산식이 따라 바뀜, [사용중단/재사용 ▾] 삭제 → '삭제하겠습니까?'.
 */
@Service
@RequiredArgsConstructor
public class DailyPayItemService {

    private final DailyPayItemRepository repository;

    @Transactional(readOnly = true)
    public List<DailyPayItemResponse> findAll(DailyPayItemKind kind, boolean includeInactive) {
        return repository.findByKindOrderBySortOrderAscCodeAsc(kind).stream()
                .filter(i -> includeInactive || i.isActive())
                .map(DailyPayItemResponse::from).toList();
    }

    @Transactional
    public DailyPayItemResponse create(DailyPayItemRequest req) {
        if (req.code() == null || req.code().isBlank()) throw ApiException.badRequest("데이터를 입력하기 바랍니다.");
        String code = req.code().trim();
        if (repository.existsByKindAndCode(req.kind(), code)) {
            throw ApiException.conflict("이미 등록된 코드입니다: " + code);
        }
        DailyPayItem i = DailyPayItem.builder().kind(req.kind()).code(code).build();
        if (req.kind() == DailyPayItemKind.ALLOWANCE) {
            i.setPayMethod("변동(일)");
            i.setTaxType("전액과세");
        }
        apply(i, req);
        return DailyPayItemResponse.from(repository.save(i));
    }

    @Transactional
    public DailyPayItemResponse update(Long id, DailyPayItemRequest req) {
        DailyPayItem i = get(id);
        if (i.isBuiltin() && !i.getName().equals(req.name().trim())) {
            throw ApiException.badRequest("기본 항목의 이름은 바꿀 수 없습니다: " + i.getName());
        }
        apply(i, req);
        if (req.active() != null) i.setActive(req.active());
        return DailyPayItemResponse.from(i);
    }

    @Transactional
    public void delete(Long id) {
        DailyPayItem i = get(id);
        if (i.isBuiltin()) throw ApiException.conflict("급여계산에 쓰는 기본 항목은 삭제할 수 없습니다: " + i.getName());
        repository.delete(i);
    }

    private void apply(DailyPayItem i, DailyPayItemRequest req) {
        i.setName(req.name().trim());
        i.setSortOrder(req.sortOrder());
        if (i.getKind() == DailyPayItemKind.ALLOWANCE) {
            if (req.payMethod() != null && !req.payMethod().isBlank()) i.setPayMethod(req.payMethod().trim());
            if (req.taxType() != null && !req.taxType().isBlank()) i.setTaxType(req.taxType().trim());
            i.setRate(req.rate());
        }
    }

    private DailyPayItem get(Long id) {
        return repository.findById(id).orElseThrow(() -> ApiException.notFound("항목을 찾을 수 없습니다."));
    }
}
