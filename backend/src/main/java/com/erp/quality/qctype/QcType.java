package com.erp.quality.qctype;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 원본 재고 II › 품질관리 › 품질검사 › <b>품질검사유형등록</b>(E040632 검사유형리스트)의 한 줄.
 *
 * <p>품질검사 구분 enum({@code inspection.QualityInspectionType} 수입 · 공정 · 출하)과는 다르다 —
 * 이것은 회사가 직접 만드는 유형(예: 출하대기검사)으로, 유형마다 [검사항목설정] 으로 검사할 항목을 칸에 넣고
 * [품목설정] 으로 이 유형을 쓰는 품목을 붙인다.
 *
 * <p>품목은 id 만 든다 — 품목 엔티티를 매핑하면 재고 모듈의 상태를 여기서 바꿀 길이 생긴다(CLAUDE.md 4.3).
 */
@Entity
@Table(name = "quality_inspection_types")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class QcType extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @ElementCollection
    @CollectionTable(name = "quality_type_check_items", joinColumns = @JoinColumn(name = "type_id"))
    @Builder.Default
    private List<QcTypeCheckSlot> checkSlots = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "quality_type_items", joinColumns = @JoinColumn(name = "type_id"))
    @Column(name = "item_id", nullable = false)
    @Builder.Default
    private Set<Long> itemIds = new LinkedHashSet<>();
}
