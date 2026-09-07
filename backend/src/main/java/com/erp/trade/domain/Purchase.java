package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.hr.domain.Employee;
import com.erp.inventory.domain.Project;
import com.erp.inventory.domain.Warehouse;

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

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

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
     * 원본 [거래구분] — <b>일반 · 반품</b>. 네 화면이 이 구분을 조건으로 든다
     * (판매·구매일괄회계반영, 구매단가일괄변경, 일별이익현황의 [반품만]·[반품제외]).
     *
     * <p>반품은 그 거래의 <b>반대</b>다. 그래서 저장할 때 라인 수량과 전표 금액을
     * <b>음수로 뒤집어</b> 둔다 — 재고·채권·이익을 읽는 쪽이 아무것도 안 바꿔도 맞는다.
     * 화면에서는 되돌려받는 수량을 양수로 적는다(원본도 그렇다).
     */
    @Column(name = "return_slip", nullable = false)
    @Builder.Default
    private boolean returnSlip = false;


    @OneToMany(mappedBy = "purchase", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<PurchaseLine> lines = new ArrayList<>();

    public void addLine(PurchaseLine line) {
        line.setPurchase(this);
        this.lines.add(line);
    }
}
