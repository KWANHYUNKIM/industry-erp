package com.erp.hr.contract;

import jakarta.persistence.*;
import lombok.*;

/**
 * 원본 [수신정보입력] › 계약참여자1 [항목등록] 의 항목(C061103, 2026-10-24 실측) — 계약서마다 따로.
 * 원본은 등록한 항목이 [전송정보입력] 격자의 열이 되어 받는 사람마다 값을 적는다. 우리는 받는 사원이 하나라 값도 하나다.
 */
@Entity
@Table(name = "employment_contract_items")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EmploymentContractItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "contract_id", nullable = false)
    private EmploymentContract contract;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 200)
    private String value;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;
}
