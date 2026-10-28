package com.erp.inventory.project;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 프로젝트그룹 마스터. 프로젝트등록의 프로젝트그룹1 · 2 코드도움이 고른다.
 * 프로젝트는 그룹 <b>코드</b>를 글자로 담는다(FK 없음 — 기존 자료 유지).
 */
@Entity
@Table(name = "project_groups")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ProjectGroup extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
