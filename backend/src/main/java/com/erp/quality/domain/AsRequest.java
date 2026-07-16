package com.erp.quality.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.BusinessPartner;

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

    @Column(nullable = false)
    private LocalDate receiptDate;

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
}
