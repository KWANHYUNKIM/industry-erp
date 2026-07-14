package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 판매 전표(거래명세표). 저장 시 재고 감소 + 거래처 채권(외상매출금) 증가.
 */
@Entity
@Table(name = "sales")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Sales extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표번호 (예: SO-20260706-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String docNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @Column(nullable = false)
    private LocalDate saleDate;

    /** 공급가액 합계 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal supplyAmount = BigDecimal.ZERO;

    /** 부가세 합계 */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;

    /** 합계금액(공급가액+부가세) */
    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    @Column(length = 500)
    private String remark;

    @Column(length = 50)
    private String createdBy;

    /** 귀속 프로젝트. 없으면 일반 영업·간접비다 (억지로 채우면 프로젝트 손익이 거짓말을 한다). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;

    /**
     * 담당 사원. createdBy(입력한 로그인 계정)와 다르다 — 사무직원이 영업사원 대신 전표를 넣으면
     * 실적은 영업사원 것이어야 한다. 비우면 담당자 없는 전표다(실적 집계에서 '미지정'으로 잡힌다).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    /** 회계반영 여부 (판매 전표 → 회계 분개 반영 완료) */
    @Column(nullable = false)
    @Builder.Default
    private boolean accountingReflected = false;

    /** 확인상태. 전자결재 상신/완료/반려에 따라 움직인다. */
    @Enumerated(EnumType.STRING)
    @Column(name = "confirm_status", nullable = false, length = 20)
    @Builder.Default
    private SalesConfirmStatus confirmStatus = SalesConfirmStatus.UNCONFIRMED;

    @Column(name = "confirmed_at")
    private LocalDateTime confirmedAt;

    @OneToMany(mappedBy = "sales", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<SalesLine> lines = new ArrayList<>();

    public void addLine(SalesLine line) {
        line.setSales(this);
        this.lines.add(line);
    }

    /** 전자결재 상신 시 */
    public void markInApproval() {
        this.confirmStatus = SalesConfirmStatus.IN_APPROVAL;
        this.confirmedAt = null;
    }

    /** 결재 완료 또는 수동 확인 */
    public void markConfirmed() {
        this.confirmStatus = SalesConfirmStatus.CONFIRMED;
        this.confirmedAt = LocalDateTime.now();
    }

    /** 반려 또는 확인취소 */
    public void markUnconfirmed() {
        this.confirmStatus = SalesConfirmStatus.UNCONFIRMED;
        this.confirmedAt = null;
    }
}
