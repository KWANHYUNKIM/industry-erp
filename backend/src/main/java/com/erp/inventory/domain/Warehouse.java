package com.erp.inventory.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 창고 마스터.
 */
@Entity
@Table(name = "warehouses")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Warehouse extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 창고코드 (예: WH-01) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 창고명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 위치/주소 */
    @Column(length = 200)
    private String location;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
