package com.erp.accounting.cost.expensegroup;

import com.erp.accounting.cost.expensecontrol.ExpenseControlType;
import com.erp.accounting.cost.expenseitem.ExpenseItem;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.LinkedHashSet;
import java.util.Set;

/** 비용그룹(원본 E060810 비용그룹등록, 2026-10-20 실측) — 비용 여럿을 묶고 통제유형을 걸 수 있다. 비용내역입력 머리 [비용그룹] 이 고른다. */
@Entity
@Table(name = "expense_groups")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ExpenseGroup extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "control_type_id")
    private ExpenseControlType controlType;

    /** [비용코드] — 꼬리표로 담은 비용들 */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "expense_group_items",
            joinColumns = @JoinColumn(name = "expense_group_id"),
            inverseJoinColumns = @JoinColumn(name = "expense_item_id"))
    @Builder.Default
    private Set<ExpenseItem> items = new LinkedHashSet<>();

    /** [비용항목추가입력여부 ☐추가입력] */
    @Column(name = "add_input", nullable = false)
    private boolean addInput;

    @Column(length = 500)
    private String remark;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;
}
