package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/** 결재란 칸 하나. 제목(담당/검토/승인)은 필수, 결재자 이름은 비워둘 수 있다(빈 칸으로 인쇄). */
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

    /** 칸 제목 (담당 / 검토 / 승인 …) */
    @Column(nullable = false, length = 30)
    private String title;

    /** 결재자 이름. 비우면 빈 칸으로 인쇄된다. */
    @Column(name = "signer_name", length = 50)
    private String signerName;

    @Column(name = "slot_order", nullable = false)
    @Builder.Default
    private Integer slotOrder = 1;
}
