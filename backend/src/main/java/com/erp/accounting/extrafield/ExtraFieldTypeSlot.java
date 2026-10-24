package com.erp.accounting.extrafield;

import jakarta.persistence.*;
import lombok.*;

/** 유형 × 추가항목 1~8 — 사용 · 필수 · 기본값. */
@Entity
@Table(name = "extra_field_type_slots")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ExtraFieldTypeSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "type_id")
    private ExtraFieldType type;

    @Column(name = "slot_no", nullable = false)
    private int slotNo;

    @Column(nullable = false)
    private boolean enabled;

    @Column(nullable = false)
    private boolean required;

    @Column(name = "default_value", length = 100)
    private String defaultValue;
}
