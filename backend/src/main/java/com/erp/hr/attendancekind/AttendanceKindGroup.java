package com.erp.hr.attendancekind;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 근태그룹(원본 근태항목등록 [근태그룹] 코드도움 → '근태그룹검색' 창 → [신규] '근태그룹등록') — 근태그룹 코드(00001 꼴) · 근태그룹 명.
 * 근태항목은 고른 그룹의 <b>이름</b>을 {@link AttendanceKind#getKindGroup()} 에 담는다.
 */
@Entity
@Table(name = "attendance_kind_groups")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AttendanceKindGroup extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 50)
    private String name;
}
