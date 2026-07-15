package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * 권한(메뉴/기능 그룹) 카탈로그 한 건. {@code code} 가 PK 이고, 화면 표기용 {@code name} 과
 * 묶음 표시용 {@code category}(재고·회계·관리·그룹웨어·설정 등)를 가진다.
 * <p>
 * 실제 카탈로그 행은 {@code common.MenuPermissionCatalog} 를 단일 소스로 두고 기동 시 시드한다.
 */
@Entity
@Table(name = "permissions")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Permission {

    /** 권한 코드 (예: SALES, ACCOUNTING, USER_MANAGE) */
    @Id
    @Column(length = 50)
    private String code;

    /** 화면 표기용 이름 (예: 영업·판매) */
    @Column(nullable = false, length = 100)
    private String name;

    /** 묶음 카테고리 (예: 재고, 회계, 관리, 그룹웨어, 설정) */
    @Column(nullable = false, length = 50)
    private String category;

    /** 정렬 순서 */
    @Column(nullable = false)
    private int sort;
}
