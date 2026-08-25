package com.erp.groupware.domain;

import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;
import com.erp.groupware.domain.enums.SupplyReturnStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 공용품 사용내역. (그룹웨어 &gt; 사내관리 &gt; 공용품관리)
 *
 * <p>공용품관리 화면은 공용품 <b>마스터</b>가 아니라 "누가 언제 어떤 공용품을 빌려 쓰고
 * 반납했는가"를 다룬다. 마스터는 {@link SupplyItem} 이고, 이 엔티티가 그 사용 기록이다.
 *
 * <p>회의실·차량처럼 시간 단위로 잡는 물건이 있어서 일정(ScheduleEvent)과 같은 모양의
 * 시작·종료 시간을 가진다. 종일 사용이면 시간이 비어 있다.
 */
@Entity
@Table(name = "supply_usages")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SupplyUsage extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 빌린 공용품 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "supply_item_id", nullable = false)
    private SupplyItem supplyItem;

    /** 사용자 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "use_date", nullable = false)
    private LocalDate useDate;

    /** 시작시간. 종일 사용이면 null. */
    @Column(name = "start_time", length = 10)
    private String startTime;

    /** 종료시간. 종일 사용이면 null. */
    @Column(name = "end_time", length = 10)
    private String endTime;

    @Column(nullable = false, length = 200)
    private String title;

    /** 적요 */
    @Column(length = 500)
    private String remark;

    /** 라벨 — 사용내역을 묶어 보는 꼬리표 */
    @Column(name = "label_text", length = 100)
    private String labelText;

    @Enumerated(EnumType.STRING)
    @Column(name = "return_status", nullable = false, length = 20)
    @Builder.Default
    private SupplyReturnStatus returnStatus = SupplyReturnStatus.NOT_RETURNED;

    /** 종일 사용 */
    @Column(name = "all_day", nullable = false)
    @Builder.Default
    private boolean allDay = false;
}
