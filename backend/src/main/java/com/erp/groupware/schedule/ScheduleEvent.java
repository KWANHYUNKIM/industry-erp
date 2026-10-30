package com.erp.groupware.schedule;

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
     * 원본 일정관리의 [라벨] — 라벨 마스터({@link ScheduleLabel})의 <b>코드</b>로 붙는다(2026-10-30 실측).
     * 이름 · 색은 읽을 때 마스터에서 가져오므로 '라벨수정'에서 바꾸면 이미 넣은 일정의 칩도 따라 바뀐다.
     * [일정구분]과 다른 축이다 — 구분은 일정의 갈래, 라벨은 달력 칸의 색 칩이다.
     */
    @Column(name = "label_code", length = 20)
    private String labelCode;

    @Column(length = 500)
    private String remark;

    @Column(length = 50)
    private String createdBy;

    /**
     * 원본 <b>[공유여부]</b>. 이 일정을 남도 보나. 꺼 두면 만든 사람만 본다.
     * 통합 현황에서 "내 것만" 과 "다 같이 보는 것" 을 갈라 보는 데 쓴다.
     */
    @Column(nullable = false)
    @Builder.Default
    private boolean shared = true;

    /**
     * 원본 <b>[프로젝트]</b>. 이 일정이 어느 현장·과제의 것인가 (선택).
     *
     * <p><code>Project</code> 는 기초 마스터라 그룹웨어가 참조해도 된다
     * (groupware → inventory, CLAUDE.md 4.1 의 이미 있는 간선이다).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "project_id")
    private com.erp.inventory.project.Project project;

    /** 원본 [공유자] — 고른 사람 이름(콤마 구분), 또는 '전체'. 참석자와 따로다. */
    @Column(length = 500)
    private String sharers;

    /**
     * 원본 [반복설정] 으로 만든 일정 묶음. 날마다 한 줄씩 펼쳐 넣고 같은 값을 준다 —
     * 원본 '반복일정삭제'(이번 일정만 · 향후 모든 일정 · 전체 반복일정)가 이 묶음을 기준으로 지운다.
     */
    @Column(name = "repeat_group", length = 40)
    private String repeatGroup;

    /** 원본 반복설정의 요약보기 글('매일, 2026/10/13 부터 3회 까지') — 창의 [반복설정] 자리에 선다. */
    @Column(name = "repeat_rule", length = 200)
    private String repeatRule;

    /** 원본 [권한] 게시글권한 — 참석자 수정/삭제(기본 켬). 조회는 늘 된다. */
    @Column(name = "perm_attendee_edit", nullable = false)
    @Builder.Default
    private boolean permAttendeeEdit = true;

    /** 공유자 수정/삭제(기본 켬). */
    @Column(name = "perm_sharer_edit", nullable = false)
    @Builder.Default
    private boolean permSharerEdit = true;

    /** 이외사용자 조회(기본 끔). 수정/삭제는 못 한다. */
    @Column(name = "perm_others_view", nullable = false)
    @Builder.Default
    private boolean permOthersView = false;
}
