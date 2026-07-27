package com.erp.settings.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.settings.domain.enums.CustomFieldType;
import jakarta.persistence.*;
import lombok.*;

/**
 * 사용자정의 필드 정의(Self-Customizing). 화면(entityType)마다 추가 형식필드를 정의한다.
 * 예: 판매입력 II(entityType="SALES")에 '납품희망일'(DATE)·'담당MD'(TEXT)·'채널'(CODE) 등.
 * 범용 EAV 로, 특정 모듈 엔티티를 참조하지 않는다(settings 독립성 유지).
 */
@Entity
@Table(name = "custom_field_defs",
        uniqueConstraints = @UniqueConstraint(name = "uk_custom_field_defs", columnNames = {"entity_type", "field_key"}))
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CustomFieldDef extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 대상 화면/엔티티 구분 (예: SALES) */
    @Column(name = "entity_type", nullable = false, length = 40)
    private String entityType;

    /** 필드 키 (저장·조회 식별자, 영문/숫자) */
    @Column(name = "field_key", nullable = false, length = 50)
    private String fieldKey;

    /** 화면 표시 라벨 */
    @Column(nullable = false, length = 100)
    private String label;

    @Enumerated(EnumType.STRING)
    @Column(name = "field_type", nullable = false, length = 20)
    @Builder.Default
    private CustomFieldType fieldType = CustomFieldType.TEXT;

    /** CODE 형식의 선택지 (콤마 구분) */
    @Column(name = "options", length = 500)
    private String options;

    @Column(nullable = false)
    @Builder.Default
    private boolean required = false;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
