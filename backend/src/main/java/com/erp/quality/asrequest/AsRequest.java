package com.erp.quality.asrequest;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.item.Item;
import com.erp.inventory.project.Project;
import com.erp.inventory.warehouse.Warehouse;
import com.erp.trade.partner.BusinessPartner;

/**
 * A/S 접수·수리. 고객(매출처)이 맡긴 제품의 수리 요청 관리.
 */
@Entity
@Table(name = "as_requests")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AsRequest extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 접수번호 (예: AS-20260707-0001) */
    @Column(nullable = false, unique = true, length = 30)
    private String asNo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /**
     * 원본 조건의 [창고]. 같은 품목이 창고 셋에 있으면 <b>어느 창고 것을 본 검사인지</b>
     * 알 수가 없었고, 불량률파악보고서에서 창고로 거를 수도 없었다.
     * 검사 시점에 안 정했을 수 있어 nullable 이다.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id")
    private Warehouse warehouse;

    /** 원본 조건의 [프로젝트]. 위와 같은 까닭으로 nullable 이다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private Project project;


    @Column(nullable = false)
    private LocalDate receiptDate;

    /** 원본 A/S접수입력 [제목]. 목록에서 한 건이 무슨 일인지 증상 전문을 읽지 않고 알게 한다. */
    @Column(length = 200)
    private String title;

    /** 원본 A/S접수입력 [수리예정일자]. 언제까지 고쳐 주기로 했나 — 완료일은 끝난 뒤에야 생긴다. */
    private LocalDate scheduledDate;

    /** 고장 증상 */
    @Column(length = 500)
    private String symptom;

    /** 담당(수리기사) */
    @Column(length = 50)
    private String charge;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private AsStatus status = AsStatus.RECEIVED;

    /** 완료일자 */
    private LocalDate doneDate;

    /** 수리내역 */
    @Column(length = 500)
    private String repairNote;

    @Column(length = 50)
    private String createdBy;

    /**
     * 접수 품목 줄(원본 격자). {@link #item} 은 첫 줄의 품목이다 — 수리조회·현황이 한 품목으로 읽어 왔으므로 남겨 둔다.
     */
    @OneToMany(mappedBy = "asRequest", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @org.hibernate.annotations.BatchSize(size = 100)
    @Builder.Default
    private List<AsRequestLine> lines = new ArrayList<>();
}
