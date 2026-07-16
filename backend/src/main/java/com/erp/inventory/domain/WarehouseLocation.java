package com.erp.inventory.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/** 창고 안의 로케이션(선반). 창고 단위 재고를 어디에 두었는지 쪼개기 위한 좌표다. */
@Entity
@Table(name = "warehouse_locations")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WarehouseLocation extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    /** 로케이션 코드 (예: A-01-3). 창고 안에서 유일 */
    @Column(nullable = false, length = 50)
    private String code;

    @Column(length = 50)
    private String zone;

    @Column(length = 50)
    private String rack;

    @Column(length = 50)
    private String level;

    @Column(length = 200)
    private String description;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
