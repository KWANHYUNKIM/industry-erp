package com.erp.groupware.domain;

import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;
import com.erp.groupware.domain.enums.SurveyResultVisibility;
import com.erp.groupware.domain.enums.SurveyTargetScope;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 설문조사. (그룹웨어 &gt; 공유정보 &gt; 설문조사)
 *
 * <p>원래 이 엔티티는 제목·기간과 <b>대상 인원수·응답 수를 손으로 적는 정수</b>뿐이었다.
 * 질문도 응답도 없어서 사실 설문이 아니었다. 원본 설문조사입력(E070256)에 맞춰
 * 질문({@link SurveyQuestion})·대상·응답({@link SurveyResponse})을 실제로 갖는다.
 *
 * <p>대상 인원과 응답 수는 저장하지 않고 센다. 두 곳에 적으면 반드시 어긋난다.
 */
@Entity
@Table(name = "surveys")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Survey extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 게시글번호 — 원본 설문조사조회·현황의 조회 조건. 업무관리 게시글과 같은 방식(정수 일련번호). */
    @Column(name = "post_no", nullable = false)
    @Builder.Default
    private int postNo = 0;

    @Column(nullable = false, length = 200)
    private String title;

    /** 설문종료일. 원본은 날짜와 시각을 같이 받는다. */
    @Column(name = "end_at")
    private LocalDateTime endAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_scope", nullable = false, length = 20)
    @Builder.Default
    private SurveyTargetScope targetScope = SurveyTargetScope.INTERNAL;

    /** 익명사용여부. 켜면 응답에 응답자를 남기지 않는다. */
    @Column(nullable = false)
    @Builder.Default
    private boolean anonymous = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "result_visibility", nullable = false, length = 20)
    @Builder.Default
    private SurveyResultVisibility resultVisibility = SurveyResultVisibility.ALL;

    /** 머리말. null 이면 '사용안함'. */
    @Column(name = "header_text", length = 1000)
    private String headerText;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private SurveyStatus status = SurveyStatus.DRAFT;

    /** 작성자. 컬럼은 예전부터 있던 created_by_id 를 그대로 쓴다(같은 뜻을 두 컬럼으로 늘리지 않는다). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id")
    private User writer;

    /** 작성자 로그인ID. writer 가 지워져도 누가 썼는지는 남는다. */
    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "survey", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("seq asc")
    @Builder.Default
    private List<SurveyQuestion> questions = new ArrayList<>();

    @OneToMany(mappedBy = "survey", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<SurveyTarget> targets = new ArrayList<>();

    @OneToMany(mappedBy = "survey", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<SurveyResponse> responses = new ArrayList<>();

    public void addQuestion(SurveyQuestion q) {
        q.setSurvey(this);
        questions.add(q);
    }

    public void addTarget(SurveyTarget t) {
        t.setSurvey(this);
        targets.add(t);
    }

    public void addResponse(SurveyResponse r) {
        r.setSurvey(this);
        responses.add(r);
    }

    /** 마감 시각이 지났는지. 상태와 별개로 시간으로도 닫힌다. */
    public boolean isExpired() {
        return endAt != null && endAt.isBefore(LocalDateTime.now());
    }
}
