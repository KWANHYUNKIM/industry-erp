package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 거래처그룹 마스터. 사용자가 화면에서 자유롭게 추가/수정한다.
 * 거래처의 '구분'({@link PartnerType})은 매입/매출 가능 여부를 강제하는 고정값이고,
 * 이 그룹은 그 옆에 붙는 사용자 정의 분류다.
 */
@Entity
@Table(name = "partner_groups")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PartnerGroup extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 그룹코드 */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 그룹명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 화면 정렬 순서 (작을수록 위) */
    @Column(nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    /** 사용 여부. 쓰던 그룹은 지우지 않고 이 값을 내린다. */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
