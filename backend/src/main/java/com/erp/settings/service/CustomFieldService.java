package com.erp.settings.service;

import com.erp.common.ApiException;
import com.erp.settings.domain.CustomFieldDef;
import com.erp.settings.domain.CustomFieldValue;
import com.erp.settings.dto.CustomFieldDtos.CreateFieldDefRequest;
import com.erp.settings.dto.CustomFieldDtos.EntityCustomFields;
import com.erp.settings.dto.CustomFieldDtos.FieldDefResponse;
import com.erp.settings.dto.CustomFieldDtos.SaveValuesRequest;
import com.erp.settings.dto.CustomFieldDtos.UpdateFieldDefRequest;
import com.erp.settings.repository.CustomFieldDefRepository;
import com.erp.settings.repository.CustomFieldValueRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * 사용자정의 필드 엔진: 화면별 필드 정의(def) CRUD + 전표별 값(value) 저장/조회.
 * 판매입력 II 등 '추가 형식필드'를 우리 전표 모델을 건드리지 않고 붙이기 위한 범용 EAV.
 */
@Service
@RequiredArgsConstructor
public class CustomFieldService {

    private final CustomFieldDefRepository defRepository;
    private final CustomFieldValueRepository valueRepository;

    // ── 정의 ──
    @Transactional(readOnly = true)
    public List<FieldDefResponse> findDefs(String entityType) {
        return defRepository.findByEntityTypeOrderBySortOrderAscIdAsc(entityType)
                .stream().map(FieldDefResponse::from).toList();
    }

    @Transactional
    public FieldDefResponse createDef(CreateFieldDefRequest req) {
        String entityType = req.entityType().trim();
        String key = req.fieldKey().trim();
        if (defRepository.existsByEntityTypeAndFieldKey(entityType, key)) {
            throw ApiException.conflict("이미 존재하는 필드 키입니다: " + entityType + "/" + key);
        }
        CustomFieldDef d = CustomFieldDef.builder()
                .entityType(entityType).fieldKey(key).label(req.label().trim())
                .fieldType(req.fieldType()).options(req.options())
                .required(Boolean.TRUE.equals(req.required()))
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .active(true)
                .build();
        return FieldDefResponse.from(defRepository.save(d));
    }

    @Transactional
    public FieldDefResponse updateDef(Long id, UpdateFieldDefRequest req) {
        CustomFieldDef d = defRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("사용자정의 필드를 찾을 수 없습니다. id=" + id));
        d.setLabel(req.label().trim());
        d.setFieldType(req.fieldType());
        d.setOptions(req.options());
        if (req.required() != null) d.setRequired(req.required());
        if (req.sortOrder() != null) d.setSortOrder(req.sortOrder());
        if (req.active() != null) d.setActive(req.active());
        return FieldDefResponse.from(d);
    }

    @Transactional
    public void deleteDef(Long id) {
        if (!defRepository.existsById(id)) {
            throw ApiException.notFound("사용자정의 필드를 찾을 수 없습니다. id=" + id);
        }
        defRepository.deleteById(id);
    }

    // ── 값 ──
    /** 폼 렌더용: 활성 정의 + 해당 전표의 값 */
    @Transactional(readOnly = true)
    public EntityCustomFields getForEntity(String entityType, Long entityId) {
        List<FieldDefResponse> defs = defRepository
                .findByEntityTypeAndActiveTrueOrderBySortOrderAscIdAsc(entityType)
                .stream().map(FieldDefResponse::from).toList();
        Map<String, String> values = EntityCustomFields.toValueMap(
                valueRepository.findByEntityTypeAndEntityId(entityType, entityId));
        return new EntityCustomFields(defs, values);
    }

    /** 전표별 값 저장(upsert). 정의된(활성) 필드만 저장하고, 빈 값은 삭제한다. */
    @Transactional
    public EntityCustomFields saveValues(String entityType, Long entityId, SaveValuesRequest req) {
        List<CustomFieldDef> defs = defRepository
                .findByEntityTypeAndActiveTrueOrderBySortOrderAscIdAsc(entityType);
        List<CustomFieldValue> existing = valueRepository.findByEntityTypeAndEntityId(entityType, entityId);

        for (CustomFieldDef def : defs) {
            String key = def.getFieldKey();
            String incoming = req.values().get(key);
            CustomFieldValue cur = existing.stream()
                    .filter(v -> v.getFieldKey().equals(key)).findFirst().orElse(null);

            boolean blank = incoming == null || incoming.isBlank();
            if (def.isRequired() && blank) {
                throw ApiException.badRequest("필수 항목입니다: " + def.getLabel());
            }
            if (blank) {
                if (cur != null) valueRepository.delete(cur);
                continue;
            }
            if (cur != null) {
                cur.setValue(incoming);
            } else {
                valueRepository.save(CustomFieldValue.builder()
                        .entityType(entityType).entityId(entityId).fieldKey(key).value(incoming).build());
            }
        }
        return getForEntity(entityType, entityId);
    }
}
