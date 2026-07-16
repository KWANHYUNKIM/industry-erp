package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.domain.BusinessPartner;

/**
 * 고객관리(CRM) 영업활동/상담 이력.
 */
@Entity
@Table(name = "crm_activities")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CrmActivity extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private LocalDate activityDate;

    /** 고객사(거래처) */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false)
    private BusinessPartner partner;

    /** 담당 연락처(고객측 담당자) */
    @Column(length = 50)
    private String contactName;

    /** 영업담당(사내) */
    @Column(length = 50)
    private String charge;

    /** 활동내용 */
    @Column(length = 500)
    private String activity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private CrmStage stage = CrmStage.LEAD;

    /** 다음 액션(후속 조치) */
    @Column(length = 300)
    private String nextAction;
}
