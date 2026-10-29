package com.erp.trade.sales;

import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.salesrep.SalesRep;
import com.erp.inventory.project.Project;
import com.erp.inventory.warehouse.Warehouse;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** 저장 때 거래처명 — 임의거래처는 화면에서 고친 이름(원본 실측 2026-10-28). 옛 전표는 거래처 이름으로 백필. */
    @Column(name = "partner_name", length = 200)
    private String partnerName;

    /** 화면에 찍을 거래처명 — 전표에 남긴 이름, 없으면 거래처 마스터 이름. */
    public String displayPartnerName() {
        return partnerName != null ? partnerName : (partner != null ? partner.getName() : null);
    }

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
    private SalesRep employee;

    /** 회계반영 여부 (판매 전표 → 회계 분개 반영 완료) */
    @Column(nullable = false)
    @Builder.Default
    private boolean accountingReflected = false;

    /**
     * 판매입력 II [금액조정] 의 <b>할인 감소(-)</b> — 공급가액 · 부가세(원본 E040253, 2026-10-13 loginaa 실측).
     * 원본 창에서는 할인의 [합계] 칸만 고칠 수 있고 공급가액 · 부가세로 나뉜다(1,100 → 1,000 · 100).
     *
     * <p>전표 머리 금액({@link #supplyAmount} · {@link #vatAmount} · {@link #totalAmount})은 <b>할인을 뺀 값</b>이다
     * — 원본 판매조회의 금액합계 · 매출전표 금액이 그렇다(9,900 / 9,000 · 900). 줄 합계 − 할인 = 머리.
     * 판매입력(I) 전표는 늘 0 이다.
     */
    @Column(name = "discount_supply", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal discountSupply = BigDecimal.ZERO;

    @Column(name = "discount_vat", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal discountVat = BigDecimal.ZERO;

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

    /**
     * 반품 전표인가 — <b>줄이 전부 음수 수량</b>인 전표. 저장하는 칸은 없다.
     *
     * <p>원본 판매입력 · 구매입력에는 거래구분 칸이 없고, 반품은 일반 전표에 음수 수량으로 적는다
     * (판매 [반품처리] = 같은 머리 · 수량 · 금액 음수, 2026-10-28 loginaa 실측). 그 전표를 조건으로 거르는
     * 화면(일괄회계반영 [거래구분] · 구매단가일괄변경 [구매구분] · 일별이익 [반품만] · 매출계획)만 이 값을 본다.
     * 예전 return_slip 칸(V177)은 V483 에서 지웠다 — 남아 있던 반품 전표는 전부 줄이 음수라 이 값과 같았다.
     */
    public boolean isReturnSlip() {
        return !lines.isEmpty() && lines.stream().allMatch(l -> l.getQuantity() != null && l.getQuantity().signum() < 0);
    }

    /**
     * 판매입력 II 로 만든 전표인가. 원본은 이 전표를 판매조회에서 열면 창 제목이 '판매입력 II(수정)' 이고
     * (2026-10-22 loginaa 실측), 판매현황 숨은 조건 [판매구분] 이 판매 · 판매 II 로 가른다. 만들 때 정해지고 바뀌지 않는다.
     */
    @Column(name = "input_ii", nullable = false)
    @Builder.Default
    private boolean inputII = false;


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
