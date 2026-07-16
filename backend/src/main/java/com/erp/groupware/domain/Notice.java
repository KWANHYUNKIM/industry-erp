package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 공지사항. (그룹웨어 > 공지사항)
 */
@Entity
@Table(name = "notices")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Notice extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 제목 */
    @Column(nullable = false, length = 200)
    private String title;

    /** 본문 */
    @Column(length = 4000)
    private String content;

    /** 분류 (예: 일반/인사/시스템/긴급) */
    @Column(length = 30)
    private String category;

    /** 상단 고정 여부 */
    @Column(nullable = false)
    @Builder.Default
    private boolean pinned = false;

    /** 조회수 */
    @Column(nullable = false)
    @Builder.Default
    private int views = 0;

    /** 작성자 */
    @Column(length = 50)
    private String author;
}
