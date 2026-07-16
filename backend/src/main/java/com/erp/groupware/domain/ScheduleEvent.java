package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 일정. (그룹웨어 > 일정관리)
 */
@Entity
@Table(name = "schedule_events")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ScheduleEvent extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 일자 */
    @Column(nullable = false)
    private LocalDate eventDate;

    /** 시간 (예: "14:00", 종일 일정이면 null) */
    @Column(length = 10)
    private String startTime;

    /** 일정 제목 */
    @Column(nullable = false, length = 200)
    private String title;

    /** 분류 (회의/출장/교육/기타) */
    @Column(length = 30)
    private String category;

    /** 담당 */
    @Column(length = 50)
    private String owner;

    @Column(length = 500)
    private String remark;

    @Column(length = 50)
    private String createdBy;
}
