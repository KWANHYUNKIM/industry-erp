package com.erp.trade.purchase;

import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.hr.employee.Employee;
import com.erp.inventory.project.Project;
import com.erp.inventory.warehouse.Warehouse;

/**
 * 구매 전표. 저장 시 재고 증가 + 거래처 채무(외상매입금) 증가.
 */
@Entity
@Table(name = "purchases")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Purchase extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 전표번호 (예: PO-20260706-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String docNo;

    /** 거래처 — 비울 수 있다(원본: 채무 없이 재고만 들어오는 입고). */
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
    private LocalDate purchaseDate;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal supplyAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;

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

    /** 담당 사원. createdBy(입력 계정)와 다르다 — 실적은 담당자에게 붙는다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    /** 회계반영 여부 (구매 전표 → 회계 분개 반영 완료) */
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

    /**
     * 반품 전표인가 — <b>줄이 전부 음수 수량</b>인 전표. 저장하는 칸은 없다(판매 {@code Sales.isReturnSlip} 과 같다).
     * 원본 구매입력에도 거래구분 칸이 없고 반품은 음수 수량으로 적는다. 예전 return_slip 칸(V177)은 V483 에서 지웠다.
     */
    public boolean isReturnSlip() {
        return !lines.isEmpty() && lines.stream().allMatch(l -> l.getQuantity() != null && l.getQuantity().signum() < 0);
    }

    /** 외자(수입) 전표의 통화코드(외화등록). null 이면 내자. 금액 열은 늘 원화다. */
    @Column(name = "currency_code", length = 10)
    private String currencyCode;

    /** 외자 전표의 머리 환율. 줄 환율이 없는 줄에 쓴다. */
    @Column(name = "exchange_rate", precision = 18, scale = 4)
    private BigDecimal exchangeRate;

    @OneToMany(mappedBy = "purchase", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<PurchaseLine> lines = new ArrayList<>();

    public void addLine(PurchaseLine line) {
        line.setPurchase(this);
        this.lines.add(line);
    }
}
