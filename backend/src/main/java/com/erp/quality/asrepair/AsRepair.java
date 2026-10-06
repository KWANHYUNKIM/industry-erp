package com.erp.quality.asrepair;

import com.erp.common.BaseTimeEntity;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.quality.asrequest.AsRequest;
import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import lombok.*;

/**
 * A/S수리(E040605) — 원본은 접수와 <b>따로인 전표</b>다(2026-10-03 loginaa 실측).
 * 수리 자체는 재고를 움직이지 않는다. 부품 · 수리비는 [판매연결전표]로 판매를 만들어 잇는다({@link AsRepairSale}).
 */
@Entity
@Table(name = "as_repairs")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AsRepair extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "repair_no", nullable = false, unique = true, length = 30)
    private String repairNo;

    @Column(name = "repair_date", nullable = false)
    private LocalDate repairDate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    /** [접수번호] — [A/S접수] 로 불러왔으면 그 접수. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "as_request_id")
    private AsRequest asRequest;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    /** [담당자] — 원본은 사원 코드도움이고 필수다. quality 는 hr 을 참조할 수 없어 이름을 든다. */
    @Column(name = "charge", nullable = false, length = 50)
    private String charge;

    @Enumerated(EnumType.STRING)
    @Column(name = "repair_type", length = 20)
    private AsRepairType repairType;

    @Column(length = 200)
    private String title;

    @Column(length = 1000)
    private String content;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private AsRepairStatus status = AsRepairStatus.IN_PROGRESS;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "repair", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @org.hibernate.annotations.BatchSize(size = 100)
    @Builder.Default
    private List<AsRepairLine> lines = new ArrayList<>();
}
