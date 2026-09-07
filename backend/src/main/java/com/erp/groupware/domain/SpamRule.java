package com.erp.groupware.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.groupware.domain.enums.SpamRuleKind;
import jakarta.persistence.*;
import lombok.*;

/**
 * 스팸 분류 규칙. 공용메일함으로 들어온 메일(외부 발신)을 등록할 때 이 규칙들과 대조해 스팸으로 가른다.
 *
 * 외부 메일서버(IMAP)나 스팸필터 연동은 없다. 우리 모델에서 '외부에서 들어온 메일'은
 * 공용메일 수신 등록 경로뿐이고, 그 지점이 곧 규칙을 적용할 자리다.
 */
@Entity
@Table(name = "spam_rules")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SpamRule extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private SpamRuleKind kind;

    /** 부분일치 문자열(대소문자 무시). 정규식이 아니다 — 잘못 쓴 정규식으로 멀쩡한 메일이 사라지는 편이 더 나쁘다. */
    @Column(nullable = false, length = 200)
    private String pattern;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(length = 200)
    private String note;
}
