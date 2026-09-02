package com.erp.groupware.domain;

import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;
import com.erp.inventory.domain.Item;
import jakarta.persistence.*;
import lombok.*;

/**
 * My품목 — 사용자가 자주 쓰는 품목 묶음.
 * 이카운트 판매입력 툴바의 <b>[My품목 ▾]</b>(원본 버튼 id {@code group12myProdLoadsubmain})에 대응한다.
 * 눌러서 즐겨찾기 품목을 명세에 한 번에 담는다.
 *
 * <p><b>왜 groupware 에 있나.</b> 이 엔티티는 {@link User} 와 {@link Item} 을 <b>둘 다</b> 참조해야 한다.
 * 모듈 의존 규칙(CLAUDE.md 4.1)상 그게 가능한 모듈은 groupware 뿐이다 —
 * {@code inventory}·{@code auth} 는 아무 모듈도 참조하지 않는 기반층이고, {@code trade} 는 auth 를 모른다.
 * 화면은 재고 I 에 있지만 엔티티가 사는 곳은 참조 방향이 정한다. 개인 소유물이라는 점에서
 * 같은 패키지의 {@link UserNote}(E Note)와 성격이 같다.
 */
@Entity
@Table(name = "my_items", uniqueConstraints = {
        @UniqueConstraint(name = "uk_my_items_owner_item", columnNames = {"owner_id", "item_id"})
})
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MyItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "item_id", nullable = false)
    private Item item;

    /** 담을 기본 수량. 자주 쓰는 묶음은 수량까지 정해져 있는 경우가 많다. */
    @Column(name = "default_qty", nullable = false)
    @Builder.Default
    private Integer defaultQty = 1;

    /** 목록 정렬 순서. 작은 값이 먼저. */
    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;
}
