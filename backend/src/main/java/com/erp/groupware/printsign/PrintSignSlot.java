package com.erp.groupware.printsign;

import jakarta.persistence.*;
import lombok.*;

/** 결재자 칸 하나(결재자 1 ~ 9). 명칭과 가로가 둘 다 있어야 인쇄에 나온다. */
@Entity
@Table(name = "print_sign_slots")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PrintSignSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "sign_line_id", nullable = false)
    private PrintSignLine signLine;

    /** 명칭 (담당 / 대리 / 과장 …). 비어 있으면 인쇄에 안 나온다. */
    @Column(length = 30)
    private String title;

    @Column(name = "width_px")
    private Integer widthPx;

    @Column(name = "font_px")
    private Integer fontPx;

    @Column(name = "slot_order", nullable = false)
    @Builder.Default
    private Integer slotOrder = 1;
}
