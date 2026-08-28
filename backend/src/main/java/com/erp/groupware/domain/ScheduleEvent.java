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

    /** 시작시간 (예: "14:00", 종일 일정이면 null) */
    @Column(length = 10)
    private String startTime;

    /** 종료시간. 원본 일정관리 목록에 시작시간과 나란히 있는 칸이다. */
    @Column(length = 10)
    private String endTime;

    /** 일정 제목 */
    @Column(nullable = false, length = 200)
    private String title;

    /** 분류 (회의/출장/교육/기타) */
    @Column(length = 30)
    private String category;

    /** 담당 */
    @Column(length = 50)
    private String owner;

    /** 장소 */
    @Column(length = 200)
    private String location;

    /** 참석자(콤마 구분) */
    @Column(length = 500)
    private String attendees;

    /**
     * 원본 일정관리의 [라벨]. <b>[일정구분]과 다른 축</b>이다 —
     * 구분은 '회의·출장' 처럼 일정의 갈래이고, 라벨은 '급함·대외비' 처럼 <b>가로지르는 표시</b>다.
     * 공용품(SupplyUsage.labelText)이 이미 같은 것을 들고 있어 이름과 길이를 맞춘다.
     */
    @Column(name = "label_text", length = 100)
    private String labelText;

    @Column(length = 500)
    private String remark;

    @Column(length = 50)
    private String createdBy;
}
