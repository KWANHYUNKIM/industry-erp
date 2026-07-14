package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/** 공통코드 — 코드 그룹 안의 값 하나. 그룹 안에서 code 는 유일하다. */
@Entity
@Table(name = "common_codes")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CommonCode extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id")
    private CodeGroup group;

    @Column(nullable = false, length = 50)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    /** 그룹마다 의미가 다른 부가값 (예: 카드사 정산일, PG 수수료율) */
    @Column(length = 100)
    private String value1;

    @Column(length = 100)
    private String value2;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(length = 300)
    private String remark;
}
