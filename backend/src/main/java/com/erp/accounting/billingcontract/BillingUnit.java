package com.erp.accounting.billingcontract;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/** 원본 코드도움 '청구단위' — 청구단위코드 · 청구단위명(000 기본청구 · 00001 월말청구, 2026-10-13 실측). */
@Entity
@Table(name = "billing_units")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BillingUnit extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;
}
