package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;
import com.erp.auth.domain.User;

/** 결재선 프리셋의 한 단계 — 몇 번째로 누가 결재하는지. */
@Entity
@Table(name = "approval_line_preset_steps")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ApprovalLinePresetStep {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "preset_id", nullable = false)
    private ApprovalLinePreset preset;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "approver_id", nullable = false)
    private User approver;

    @Column(nullable = false)
    private Integer stepOrder;
}
