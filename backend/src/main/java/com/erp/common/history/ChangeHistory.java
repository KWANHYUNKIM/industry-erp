package com.erp.common.history;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 수정 · 조회 창 [H] '이력'의 한 줄 — 저장할 때마다 신규 · 수정 · 삭제 · 사용중단 · 재사용을 적는다.
 * 원본은 어느 마스터 · 자료든 같은 창이다(거래처등록 C000009 · 일정관리 E070201 · 공용품관리 E070204, 2026-10-13 loginaa 실측:
 * 만들고 한 번 고치니 '1 GUEST 오후 6:42:47 신규 / 2 GUEST 오후 6:43:31 수정').
 * common 은 다른 모듈을 모르므로 대상은 엔티티가 아니라 (target, targetId) 다. 대상을 지워도 남도록 FK 가 없다.
 */
@Entity
@Table(name = "change_histories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ChangeHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 무엇의 이력인가 — 각 모듈 서비스의 상수(SCHEDULE · SUPPLY_USAGE · PARTNER …, 화면의 EcHistoryButton target 과 같은 글자). */
    @Column(nullable = false, length = 30)
    private String target;

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    /** 원본 [상태] 글자 — {@link ChangeHistoryService#CREATED} … */
    @Column(nullable = false, length = 10)
    private String action;

    /** 작업자 아이디(원본은 대문자로 보인다 — 화면이 바꾼다). */
    @Column(length = 50)
    private String worker;

    @Column(name = "worked_at", nullable = false)
    private LocalDateTime workedAt;
}
