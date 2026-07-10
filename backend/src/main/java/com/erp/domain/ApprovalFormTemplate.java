package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 기안서 양식 마스터. (이카운트 '공통양식등록')
 * 사용자가 화면에서 양식을 추가/수정한다. 예전 ApprovalFormType enum 을 대체한다.
 */
@Entity
@Table(name = "approval_form_templates")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ApprovalFormTemplate extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 양식코드 (예: LEAVE, BIZ_TRIP) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 양식명 (예: 휴가신청서) */
    @Column(nullable = false, length = 100)
    private String name;

    /** 화면 정렬 순서 */
    @Column(nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    /**
     * 양식별 입력 항목 정의. 프론트가 이걸 읽어 폼을 그린다.
     * 빈 배열이면 자유서식(본문 리치텍스트)만 쓴다.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "field_schema", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private List<Map<String, Object>> fieldSchema = new ArrayList<>();
}
