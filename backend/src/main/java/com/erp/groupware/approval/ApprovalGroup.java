package com.erp.groupware.approval;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 기안서 구분(그룹) — 원본 공통양식 [구분] 코드도움 '구분검색'(그룹코드 · 그룹명, 2026-10-12 loginaa E070107 실측).
 * 양식마다 기본 구분을 두고({@link ApprovalFormTemplate#getGroupCode()}), 기안서의 [구분] 칸이 그 이름을 담는다.
 */
@Entity
@Table(name = "approval_groups")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ApprovalGroup extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20, unique = true)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;

    /** 원본 구분검색수정 [사용중단/재사용 ▲] — 사용중단이면 고르는 목록(구분검색)에 안 나온다. */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
