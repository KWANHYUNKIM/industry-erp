package com.erp.groupware.schedule;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 일정관리 라벨 마스터 — 원본 E070201 일정관리등록 [라벨] 🔍 → '라벨검색'(2026-10-13 loginaa 실측).
 * 라벨코드 · 라벨명 · 색상. 달력 칸의 둥근 칩이 이 라벨이다(회의 빨강 · 연차 주황 · 주말근무 파랑 …) —
 * 일정구분(코드 · 이름만 있는 마스터)이 아니다. 일정에는 코드로 붙는다({@link ScheduleEvent#getLabelCode()}).
 */
@Entity
@Table(name = "schedule_labels")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ScheduleLabel extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(nullable = false, length = 20)
    private String name;

    /** '#ff0000' 꼴. 기본 검정. */
    @Column(nullable = false, length = 7)
    private String color;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
