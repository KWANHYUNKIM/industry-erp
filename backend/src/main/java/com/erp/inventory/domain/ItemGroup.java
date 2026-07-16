package com.erp.inventory.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 품목그룹 마스터. 사용자가 화면에서 자유롭게 추가/수정한다.
 * 품목의 '구분'({@link ItemCategory})은 제조업 표준 고정값이고, 이 그룹은 그 옆에 붙는 사용자 정의 분류다.
 */
@Entity
@Table(name = "item_groups")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ItemGroup extends BaseTimeEntity {

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
