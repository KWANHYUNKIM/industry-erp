package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.hr.domain.Employee;
import com.erp.inventory.domain.Project;
import com.erp.inventory.domain.Warehouse;

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

    /**
     * 부가세를 <b>전표 단위</b>로 계산했는가. 이카운트 판매·구매입력의 [거래별부가세계산]
     * ({@code calcbySlip}) 이다. false 면 라인별로 반올림한다 — 잔돈이 1원 단위로 달라진다.
     *
     * <p>버튼을 누른 결과가 아니라 <b>전표의 성질</b>로 저장한다. 저장하지 않으면 같은 전표를
     * 수정할 때 조용히 라인별 계산으로 되돌아가 합계가 바뀐다.
     */
    @Column(name = "vat_by_slip", nullable = false)
    @Builder.Default
    private boolean vatBySlip = false;

    /**
     * 과세 전표인가. 원본 판매·구매일괄회계반영의 <b>[부가세유형]</b> (과세 · 면세).
     *
     * <p><b>전표에 저장한다.</b> 예전에는 입력할 때 계산에만 쓰고 버려서, 필요할 때마다
     * '부가세가 0이면 면세' 로 되짚었다. 부가세는 반올림하므로 <b>과세인데 부가세가 0 인
     * 전표</b>가 나온다(공급가액 4원 → 부가세 0.4원 → 0원). 그 전표의 단가를 올리면
     * 면세로 오인해 부가세가 0 으로 남았다 — 실측했다.
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean taxable = true;


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
