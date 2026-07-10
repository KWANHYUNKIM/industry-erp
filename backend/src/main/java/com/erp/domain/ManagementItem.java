package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * 관리항목 마스터. 전표/거래에 붙여 관리하는 사용자정의 분류 항목(예: 프로젝트, 부문, 색상 등).
 */
@Entity
@Table(name = "management_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ManagementItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 관리항목코드 (예: MG001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 관리항목명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 설명/비고 */
    @Column(length = 200)
    private String description;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
