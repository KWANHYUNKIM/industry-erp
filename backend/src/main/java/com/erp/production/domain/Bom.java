package com.erp.production.domain;

import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;

/**
 * 자재명세서(BOM). 제품 1개를 만드는 데 필요한 자재 구성.
 * 제품(품목) 당 1개의 BOM.
 */
@Entity
@Table(name = "boms")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Bom extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 생산 대상 제품(완제품/반제품) */
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false, unique = true)
    private Item product;

    @Column(length = 300)
    private String remark;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @OneToMany(mappedBy = "bom", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<BomLine> lines = new ArrayList<>();

    public void addLine(BomLine line) {
        line.setBom(this);
        this.lines.add(line);
    }

    public void clearLines() {
        this.lines.clear();
    }
}
