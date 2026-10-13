package com.erp.accounting.billingcontract;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.project.Project;
import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 회계 II › 계약관리 › 계약 › <b>계약입력</b>(E060902) 한 장 — 2026-10-13 loginaa 실측.
 *
 * <p>머리: 계약일자(오늘) · 거래처 · 계약코드(다음 번호 5자리 '00017') · 계약명 · 청구시작일(오늘) · 청구종료일(필수) ·
 * 부가세유형(세금계산서 · 영세율 · 계산서 · 소매매출 · 수출 · 카드매출 · …) · 통화(내자) · 담당자 · 부서 · 프로젝트 · 적요.
 * 계약조회의 [계약번호] 는 계약일자-No.('2026/10/13 -1').
 * 담당자 · 부서는 hr 모듈이라 id 만 든다(CLAUDE.md 4.1 — accounting→hr 를 더 늘리지 않는다).
 */
@Entity
@Table(name = "billing_contracts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BillingContract extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "contract_date", nullable = false)
    private LocalDate contractDate;

    @Column(name = "doc_no", nullable = false)
    private Integer docNo;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(length = 100)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @Column(name = "bill_start", nullable = false)
    private LocalDate billStart;

    @Column(name = "bill_end", nullable = false)
    private LocalDate billEnd;

    @Column(name = "vat_type", nullable = false, length = 30)
    private String vatType;

    @Column(name = "foreign_currency", nullable = false)
    private boolean foreignCurrency;

    @Column(name = "employee_id")
    private Long employeeId;

    @Column(name = "department_id")
    private Long departmentId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    @Column(length = 200)
    private String remark;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "contract", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo")
    @Builder.Default
    private List<BillingContractLine> lines = new ArrayList<>();
}
