package com.erp.groupware.printsign;

import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;

/**
 * 인쇄용 결재라인(원본 E010106 회계 · 재고 · E090102 관리). 모듈마다 결재라인 1 · 2 두 벌이다.
 *
 * 줄 맨 왼쪽의 좁은 [결재라인] 칸(명칭 · 가로 · 글자) 다음에 결재자 1 ~ 9 칸이 붙는다.
 * 전자결재(ApprovalDocument)와는 다르다 — 이건 종이에 도장을 찍을 빈 칸을 그려 주는 것이다.
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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PrintSignModule module;

    /** 결재라인 1 · 2 */
    @Column(name = "line_no", nullable = false)
    private Integer lineNo;

    /** 맨 왼쪽 [결재라인] 칸 — 명칭 · 가로(px) · 글자(px) */
    @Column(name = "label_name", length = 30)
    private String labelName;

    @Column(name = "label_width")
    private Integer labelWidth;

    @Column(name = "label_font")
    private Integer labelFont;

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
