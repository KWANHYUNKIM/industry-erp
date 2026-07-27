package com.erp.accounting.domain;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 결제대행사(PG) 마스터(E010114). 온라인 결제대행사(대표자·연락처 포함) 기초등록.
 */
@Entity
@Table(name = "payment_agencies")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PaymentAgency extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 결제대행사코드 (예: PA001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 결제대행사명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 대표자명 */
    @Column(name = "ceo_name", length = 50)
    private String ceoName;

    @Column(length = 30)
    private String phone;

    @Column(length = 100)
    private String email;

    @Column(length = 200)
    private String remark;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
