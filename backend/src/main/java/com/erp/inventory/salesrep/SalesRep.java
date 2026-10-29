package com.erp.inventory.salesrep;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 원본 재고 I · 회계 I › 기초등록 › <b>사원(담당)등록</b>(E010110). 전표의 [담당자] 가 고르는 목록이다.
 *
 * <p>관리 › 사원등록(hr {@code Employee}, 인사 · 급여의 사원)과는 <b>다른 마스터</b>다 — 원본에서
 * 같은 사람(H01 김기현 / 2020-003 김기현)이 두 곳에 따로 들어 있고, 사원(담당)에 만든 사람은 사원리스트에 안 나온다.
 * 판매 · 구매 · 주문 · 견적 · 출하의 담당자가 이것을 가리키므로 trade 가 hr 를 몰라도 된다.
 * 기초 마스터라 inventory 에 둔다(생산 · 재고 전표도 id 로 이것을 든다).
 */
@Entity
@Table(name = "sales_reps")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SalesRep extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 사원(담당)코드 — 원본 다음 번호는 다섯 자리 숫자(00018). */
    @Column(nullable = false, unique = true, length = 50)
    private String code;

    /** 사원(담당)명 */
    @Column(nullable = false, length = 100)
    private String name;

    /** 검색창내용 */
    @Column(name = "search_keyword", length = 100)
    private String searchKeyword;

    /** 적요(여러 줄) */
    @Column(length = 200)
    private String remark;

    /** 담당자연락처 */
    @Column(length = 30)
    private String phone;

    /** 담당자Email */
    @Column(length = 100)
    private String email;

    /** 추가항목3 ~ 6 */
    @Column(length = 100)
    private String extra3;

    @Column(length = 100)
    private String extra4;

    @Column(length = 100)
    private String extra5;

    @Column(length = 100)
    private String extra6;

    /** 사용 — 사용중단하면 전표 코드도움에서 빠진다(지난 전표는 그대로). */
    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
