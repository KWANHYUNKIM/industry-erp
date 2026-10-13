package com.erp.groupware.schedule;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 일정관리 일정구분 마스터 — 원본 E070201 일정관리등록 [일정구분] 🔍 '일정구분검색'(2026-10-13 loginaa 실측).
 * 일정구분코드 · 일정구분명 둘뿐이다(색은 {@link ScheduleLabel} 이 가진다). 일정에는 이름으로 붙는다
 * ({@link ScheduleEvent#getCategory()}).
 */
@Entity
@Table(name = "schedule_categories")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ScheduleCategory extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(nullable = false, length = 30)
    private String name;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
