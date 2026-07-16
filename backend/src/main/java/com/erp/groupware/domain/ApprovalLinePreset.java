package com.erp.groupware.domain;

import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;
import com.erp.common.BaseTimeEntity;

/**
 * 결재선 프리셋 (이카운트 '결재설정').
 * 기안할 때마다 결재자를 하나씩 고르지 않도록, 자주 쓰는 결재 순서를 미리 만들어 둔다.
 * 기안서에 적용하면 이 순서대로 ApprovalLine 이 만들어진다.
 */
@Entity
@Table(name = "approval_line_presets")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ApprovalLinePreset extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 프리셋 이름 (예: 팀장→본부장→대표) */
    @Column(nullable = false, unique = true, length = 100)
    private String name;

    /** 어떤 양식에 쓰는 결재선인지 (비우면 모든 양식 공통) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "form_template_id")
    private ApprovalFormTemplate formTemplate;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @OneToMany(mappedBy = "preset", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("stepOrder asc")
    @Builder.Default
    private List<ApprovalLinePresetStep> steps = new ArrayList<>();

    public void addStep(ApprovalLinePresetStep step) {
        step.setPreset(this);
        step.setStepOrder(steps.size() + 1);
        steps.add(step);
    }

    public void clearSteps() {
        steps.clear();
    }
}
