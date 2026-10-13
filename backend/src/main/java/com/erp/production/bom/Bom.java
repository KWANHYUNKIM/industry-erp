package com.erp.production.bom;

import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.item.Item;

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
    /** 제품 — 버전마다 행이 하나라 제품 하나에 BOM 이 여럿일 수 있다(V226). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "product_id", nullable = false)
    private Item product;

    /** 원본 [BOM버전] 이름. 처음 만든 BOM 은 '기본'. */
    @Column(name = "version_name", nullable = false, length = 50)
    @Builder.Default
    private String versionName = "기본";

    /** 원본 [기본BOM] — 제품마다 하나. 버전을 고르지 않은 생산·불출·원가·계획은 이것을 쓴다. */
    @Column(name = "is_default", nullable = false)
    @Builder.Default
    private boolean defaultVersion = true;

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
