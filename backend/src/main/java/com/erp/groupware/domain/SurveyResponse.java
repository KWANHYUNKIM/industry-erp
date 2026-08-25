package com.erp.groupware.domain;

import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 설문 응답 한 건(한 사람이 낸 답 묶음).
 *
 * <p>익명 설문이면 {@code respondent} 를 <b>비운 채로</b> 저장한다. 넣어 두고 화면에서만
 * 가리는 방식은 익명이 아니다 — DB 를 열면 그대로 보인다.
 */
@Entity
@Table(name = "survey_responses")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SurveyResponse extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "survey_id", nullable = false)
    private Survey survey;

    /** 익명 설문이면 null. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "respondent_id")
    private User respondent;

    /**
     * 익명 설문에서 "이 사람이 이미 응답했는가"만 판단하려고 남기는 표식.
     * 로그인ID 를 해시해서 넣는다 — 누가 무엇을 답했는지는 알 수 없고, 중복 응답만 막는다.
     */
    @Column(name = "respondent_key", length = 64)
    private String respondentKey;

    @Column(name = "submitted_at", nullable = false)
    private LocalDateTime submittedAt;

    @OneToMany(mappedBy = "response", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<SurveyAnswer> answers = new ArrayList<>();

    public void addAnswer(SurveyAnswer a) {
        a.setResponse(this);
        answers.add(a);
    }
}
