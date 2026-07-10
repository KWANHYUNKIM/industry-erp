package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * 오더관리 진행단계 마스터 (예: 접수→견적→수주확정→생산→출하).
 */
@Entity
@Table(name = "order_stages")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrderStage extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 단계코드 (예: ST-01) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 단계명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 진행 순서 */
    @Column(nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
