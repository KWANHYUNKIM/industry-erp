package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 오더관리 유형 마스터 (예: 일반수주/견적/샘플).
 */
@Entity
@Table(name = "order_types")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrderType extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 유형코드 (예: OT-01) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 유형명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 설명 */
    @Column(length = 200)
    private String description;

    /** 원본 열 [입력메뉴에서 사용] — 전표 입력 화면의 유형 선택에 나올지. */
    @Column(name = "use_in_input", nullable = false)
    @Builder.Default
    private boolean useInInput = true;

    /** 원본 열 [담당자] */
    @Column(length = 50)
    private String manager;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
