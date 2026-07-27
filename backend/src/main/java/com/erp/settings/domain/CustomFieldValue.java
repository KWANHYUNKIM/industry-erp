package com.erp.settings.domain;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 사용자정의 필드 값. (entityType, entityId, fieldKey) → 값.
 * entityId 는 대상 전표의 PK(예: 판매전표 id)지만 FK 로 묶지 않는다 — settings 가 다른 모듈을 몰라야 하므로.
 */
@Entity
@Table(name = "custom_field_values",
        uniqueConstraints = @UniqueConstraint(name = "uk_custom_field_values", columnNames = {"entity_type", "entity_id", "field_key"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CustomFieldValue extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entity_type", nullable = false, length = 40)
    private String entityType;

    @Column(name = "entity_id", nullable = false)
    private Long entityId;

    @Column(name = "field_key", nullable = false, length = 50)
    private String fieldKey;

    @Column(length = 1000)
    private String value;
}
