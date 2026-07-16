package com.erp.inventory.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import com.erp.common.BaseTimeEntity;

/**
 * 프로젝트 마스터. (그룹웨어 > 프로젝트 관리)
 */
@Entity
@Table(name = "projects")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Project extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 프로젝트 코드 (예: PRJ-2601) */
    @Column(nullable = false, unique = true, length = 30)
    private String code;

    /** 프로젝트명 */
    @Column(nullable = false, length = 200)
    private String name;

    /** PM(담당자) */
    @Column(length = 50)
    private String manager;

    @Column(nullable = false)
    private LocalDate startDate;

    /** 종료(예정)일 */
    private LocalDate endDate;

    /** 진척률 0~100 */
    @Column(nullable = false)
    @Builder.Default
    private int progress = 0;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ProjectStatus status = ProjectStatus.PLANNING;

    @Column(length = 500)
    private String remark;

    @Column(length = 50)
    private String createdBy;
}
