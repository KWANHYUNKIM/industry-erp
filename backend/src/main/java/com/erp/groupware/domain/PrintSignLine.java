package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;

/**
 * 인쇄용 결재라인(결재란). 출력물 우측 상단에 찍히는 담당/검토/승인 칸이다.
 *
 * 전자결재(ApprovalDocument)와는 다르다. 저건 시스템에서 실제로 결재를 받는 것이고,
 * 이건 종이에 도장을 찍을 빈 칸을 그려주는 것이다. 그래서 결재자 이름은 선택이다 —
 * 이름을 비워두면 빈 칸으로 인쇄된다.
 *
 * 기본(default) 결재란은 하나만 둔다. 목록 화면의 [인쇄]는 그 기본 결재란을 쓴다.
 */
@Entity
@Table(name = "print_sign_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PrintSignLine extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 서식명 (예: 거래명세서 결재란) */
    @Column(nullable = false, unique = true, length = 100)
    private String name;

    /** 목록 인쇄에 쓰는 기본 결재란인지 */
    @Column(name = "is_default", nullable = false)
    @Builder.Default
    private boolean defaultLine = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(length = 200)
    private String remark;

    @OneToMany(mappedBy = "signLine", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("slotOrder asc")
    @Builder.Default
    private List<PrintSignSlot> slots = new ArrayList<>();

    public void clearSlots() {
        this.slots.clear();
    }

    public void addSlot(PrintSignSlot slot) {
        slot.setSignLine(this);
        slot.setSlotOrder(this.slots.size() + 1);
        this.slots.add(slot);
    }
}
