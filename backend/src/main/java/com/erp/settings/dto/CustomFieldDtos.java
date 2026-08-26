package com.erp.settings.dto;

import com.erp.settings.domain.CustomFieldDef;
import com.erp.settings.domain.CustomFieldValue;
import com.erp.settings.domain.enums.CustomFieldType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.Map;

public final class CustomFieldDtos {

    private CustomFieldDtos() {}

    // ── 정의(def) ──
    public record CreateFieldDefRequest(
            @NotBlank(message = "대상 화면(entityType)을 지정하세요.") String entityType,
            @NotBlank(message = "필드 키를 입력하세요.") String fieldKey,
            @NotBlank(message = "라벨을 입력하세요.") String label,
            @NotNull(message = "형식을 선택하세요.") CustomFieldType fieldType,
            String options,
            Boolean required,
            Integer sortOrder
    ) {}

    public record UpdateFieldDefRequest(
            @NotBlank(message = "라벨을 입력하세요.") String label,
            @NotNull(message = "형식을 선택하세요.") CustomFieldType fieldType,
            String options,
            Boolean required,
            Integer sortOrder,
            Boolean active
    ) {}

    public record FieldDefResponse(
            Long id, String entityType, String fieldKey, String label,
            CustomFieldType fieldType, String fieldTypeName,
            String options, boolean required, int sortOrder, boolean active
    ) {
        public static FieldDefResponse from(CustomFieldDef d) {
            return new FieldDefResponse(
                    d.getId(), d.getEntityType(), d.getFieldKey(), d.getLabel(),
                    d.getFieldType(), d.getFieldType().getDisplayName(),
                    d.getOptions(), d.isRequired(), d.getSortOrder(), d.isActive());
        }
    }

    // ── 값(value) ──
    /** 특정 전표의 사용자정의 값 저장: fieldKey → value 맵 */
    public record SaveValuesRequest(
            @NotNull(message = "저장할 값을 넣으세요.") Map<String, String> values
    ) {}

    /** 활성 정의 + 해당 전표의 값 을 함께 반환(폼 렌더용) */
    public record EntityCustomFields(
            List<FieldDefResponse> defs,
            Map<String, String> values
    ) {
        public static Map<String, String> toValueMap(List<CustomFieldValue> vals) {
            return vals.stream().collect(java.util.stream.Collectors.toMap(
                    CustomFieldValue::getFieldKey, v -> v.getValue() != null ? v.getValue() : ""));
        }
    }
}
