package com.erp.trade.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.common.BaseTimeEntity;

/**
 * 오더관리 유형 마스터 (예: 일반수주/견적/샘플).
 */
@Entity
@Table(name = "order_types")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class OrderType extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 유형코드 (예: OT-01) */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 유형명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 설명 */
    @Column(length = 200)
    private String description;

    /** 원본 열 [입력메뉴에서 사용] — 전표 입력 화면의 유형 선택에 나올지. */
    @Column(name = "use_in_input", nullable = false)
    @Builder.Default
    private boolean useInInput = true;

    /** 원본 열 [담당자] */
    /**
     * 원본 오더관리유형등록의 <b>[처리메뉴]</b> — 이 유형을 어느 입력 화면에서 고를 수 있나.
     *
     * <p>[입력메뉴에서 사용]은 <b>쓰나 안 쓰나</b>일 뿐 <b>어디서</b> 쓰는지는 말하지 않는다.
     * 유형이 늘어나면 주문서 화면의 유형 목록에 발주용·A/S용까지 다 뜬다.
     *
     * <p>화면 경로를 글자로 담는다(예: /sales/orders). 메뉴는 코드가 아니라 화면이라
     * 참조할 테이블이 없다. 안 정하면 어느 화면에서나 쓴다는 뜻이다.
     */
    @Column(name = "proc_menu", length = 200)
    private String procMenu;

    @Column(length = 50)
    private String manager;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
