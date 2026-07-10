package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 설문조사 마스터. (그룹웨어 > 설문조사)
 */
@Entity
@Table(name = "surveys")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Survey extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 설문 제목 */
    @Column(nullable = false, length = 200)
    private String title;

    /** 시작일 */
    private LocalDate startDate;

    /** 종료일 */
    private LocalDate endDate;

    /** 대상 인원수 */
    @Column(nullable = false)
    @Builder.Default
    private int target = 0;

    /** 응답 수 */
    @Column(nullable = false)
    @Builder.Default
    private int responses = 0;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private SurveyStatus status = SurveyStatus.OPEN;

    @Column(length = 50)
    private String createdBy;
}
