package com.erp.hr.department;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 부서 마스터. parent 로 상위 부서를 가리켜 조직도 트리를 이룬다.
 * 사원(Employee)은 부서를 FK 로 참조한다.
 */
@Entity
@Table(name = "departments")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Department extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 부서코드 (예: DEPT-0001) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    /** 상위 부서. 최상위면 null */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Department parent;

    /** 같은 depth 안에서의 표시 순서 */
    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    /**
     * 부서장 사원 id — 조직도등록 [부서장지정] · [부서장설정](원본 E090222). 없으면 null.
     * 같은 hr 모듈의 Employee 가 이미 Department 를 @ManyToOne 으로 들고 있어, 되짚는 쪽은 id 만 든다.
     */
    @Column(name = "head_employee_id")
    private Long headEmployeeId;

    /**
     * 조직도등록 Fn › 미포함(원본 E090222) — 나무에서 빠져 [미포함] 아래에 선다. 사원은 그대로 이 부서 소속이다.
     * 다시 넣는 길은 다른 부서의 Fn › 하위부서추가.
     */
    @Column(name = "org_excluded", nullable = false)
    @Builder.Default
    private boolean orgExcluded = false;
}
