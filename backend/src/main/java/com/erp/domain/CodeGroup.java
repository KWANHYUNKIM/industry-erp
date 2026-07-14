package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

/**
 * 코드 그룹 — "무엇의 목록인가"(카드사·결제대행사·추가항목유형 등).
 * 시스템 그룹(system=true)은 화면이 group_code 로 찾으므로 삭제할 수 없다.
 */
@Entity
@Table(name = "code_groups")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CodeGroup extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_code", nullable = false, unique = true, length = 50)
    private String groupCode;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 300)
    private String description;

    /** 시스템이 참조하는 그룹. 삭제 금지 */
    @Column(nullable = false)
    @Builder.Default
    private boolean system = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<CommonCode> codes = new ArrayList<>();
}
