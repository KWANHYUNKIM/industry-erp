package com.erp.accounting.extrafield;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/** 추가항목유형(원본 E010118) — 전표 입력에서 이 유형에 묶인 계정 줄에 항목 칸을 더 붙인다. */
@Entity
@Table(name = "extra_field_types")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ExtraFieldType extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
