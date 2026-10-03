package com.erp.quality.asrepair;

import com.erp.inventory.item.Item;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.*;

/** A/S수리 품목 줄 — 원본 격자 [품목코드 · 품목명 · 규격 · 수량]. 고친 물건이라 재고는 안 움직인다. */
@Entity
@Table(name = "as_repair_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AsRepairLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "as_repair_id")
    private AsRepair repair;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id")
    private Item item;

    @Column(nullable = false, precision = 18, scale = 4)
    private BigDecimal quantity;
}
