package com.erp.accounting.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 계정과목 마스터. (회계 기초등록 > 계정과목등록)
 */
@Entity
@Table(name = "accounts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Account extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 계정코드 (예: 811) */
    @Column(nullable = false, unique = true, length = 20)
    private String code;

    /** 계정과목명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 계정 구분 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private AccountDivision division;

    /** 세부분류 (예: 판매관리비) */
    @Column(length = 50)
    private String detailCategory;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
