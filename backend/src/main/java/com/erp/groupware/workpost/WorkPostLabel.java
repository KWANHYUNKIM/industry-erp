package com.erp.groupware.workpost;

import com.erp.common.BaseTimeEntity;
import com.erp.groupware.board.PostBoard;
import jakarta.persistence.*;
import lombok.*;

/**
 * 게시판 라벨 마스터 — 원본 공지사항 · WORK 의 [라벨] › + '라벨조회'(2026-10-12 loginaa E200080 실측).
 * 라벨코드 · 라벨명 · 색상, 게시판마다 따로. 글에는 이름으로 붙는다({@link WorkPost#getLabels()}).
 */
@Entity
@Table(name = "work_post_labels")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class WorkPostLabel extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PostBoard board;

    @Column(nullable = false, length = 20)
    private String code;

    @Column(nullable = false, length = 20)
    private String name;

    /** '#33b579' 꼴. 원본 기본값은 검정. */
    @Column(nullable = false, length = 7)
    private String color;

    /** 원본 [사용중단/재사용]. 사용중단이면 [라벨] · [라벨변경] 후보에서 빠진다. */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
