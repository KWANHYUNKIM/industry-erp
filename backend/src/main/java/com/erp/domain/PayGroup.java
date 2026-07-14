package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

/**
 * 수당/공제 그룹. 직군·직급별로 매달 똑같이 붙는 수당·공제를 묶어 둔다.
 * 급여계산 때 그룹을 고르면 이 항목들이 명세 라인으로 그대로 들어간다.
 */
@Entity
@Table(name = "pay_groups")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class PayGroup extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String name;

    @Column(length = 200)
    private String remark;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<PayGroupLine> lines = new ArrayList<>();

    public void addLine(PayGroupLine line) {
        line.setGroup(this);
        lines.add(line);
    }

    public void clearLines() {
        lines.clear();
    }
}
