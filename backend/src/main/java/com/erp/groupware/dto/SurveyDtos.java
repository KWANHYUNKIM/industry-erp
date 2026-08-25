package com.erp.groupware.dto;

import com.erp.groupware.domain.Survey;
import com.erp.groupware.domain.SurveyAnswer;
import com.erp.groupware.domain.SurveyQuestion;
import com.erp.groupware.domain.SurveyStatus;
import com.erp.groupware.domain.enums.SurveyQuestionType;
import com.erp.groupware.domain.enums.SurveyResultVisibility;
import com.erp.groupware.domain.enums.SurveyTargetScope;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class SurveyDtos {

    private SurveyDtos() {}

    // ── 등록/수정 ────────────────────────────────────────────────────────────

    public record QuestionRequest(
            int seq,
            SurveyQuestionType type,
            String content,
            String option1, String option2, String option3, String option4, String option5,
            boolean required
    ) {}

    public record CreateSurveyRequest(
            @NotBlank(message = "설문 제목을 입력하세요.") String title,
            LocalDateTime endAt,
            SurveyTargetScope targetScope,
            boolean anonymous,
            SurveyResultVisibility resultVisibility,
            String headerText,
            List<Long> targetUserIds,
            List<QuestionRequest> questions,
            /** true 면 초안으로 저장. false 면 바로 진행중(발송). */
            boolean draft
    ) {}

    /** null 필드는 변경하지 않는다. questions/targetUserIds 는 주면 통째로 교체한다. */
    public record UpdateSurveyRequest(
            String title,
            LocalDateTime endAt,
            SurveyTargetScope targetScope,
            Boolean anonymous,
            SurveyResultVisibility resultVisibility,
            String headerText,
            List<Long> targetUserIds,
            List<QuestionRequest> questions,
            SurveyStatus status
    ) {}

    // ── 응답 ────────────────────────────────────────────────────────────────

    /** 값 하나. 복수 선택·순위입력은 values 에 여러 개를 담는다. */
    public record AnswerRequest(
            Long questionId,
            List<String> values
    ) {}

    public record SubmitResponseRequest(
            List<AnswerRequest> answers
    ) {}

    // ── 조회 ────────────────────────────────────────────────────────────────

    public record QuestionResponse(
            Long id, int seq,
            SurveyQuestionType type, String typeName, boolean usesOptions,
            String content, List<String> options, boolean required
    ) {
        public static QuestionResponse from(SurveyQuestion q) {
            return new QuestionResponse(
                    q.getId(), q.getSeq(),
                    q.getType(), q.getType().getDisplayName(), q.getType().usesOptions(),
                    q.getContent(), q.options(), q.isRequired());
        }
    }

    public record TargetResponse(Long userId, String userName) {}

    public record SurveyResponseDto(
            Long id, int postNo, String title,
            LocalDateTime endAt,
            SurveyTargetScope targetScope, String targetScopeName,
            boolean anonymous,
            SurveyResultVisibility resultVisibility, String resultVisibilityName,
            String headerText,
            SurveyStatus status, String statusName,
            String createdBy, String writerName,
            LocalDateTime createdAt,
            int questionCount, int targetCount, int responseCount, int responseRate,
            /** 지금 보는 사람이 이미 응답했는가 — 원본 '설문조사 참여여부' 칸. */
            boolean answeredByMe,
            /** 설문종료일이 지났는가. 상태가 '진행중'이어도 시간으로 닫힌다. */
            boolean expired,
            List<QuestionResponse> questions,
            List<TargetResponse> targets
    ) {
        public static SurveyResponseDto from(Survey s, boolean answeredByMe) {
            int targets = s.getTargets().size();
            int responses = s.getResponses().size();
            int rate = targets > 0 ? Math.round(responses * 100f / targets) : 0;
            return new SurveyResponseDto(
                    s.getId(), s.getPostNo(), s.getTitle(), s.getEndAt(),
                    s.getTargetScope(), s.getTargetScope().getDisplayName(),
                    s.isAnonymous(),
                    s.getResultVisibility(), s.getResultVisibility().getDisplayName(),
                    s.getHeaderText(),
                    s.getStatus(), s.getStatus().getDisplayName(),
                    s.getCreatedBy(),
                    s.getWriter() != null ? s.getWriter().getName() : s.getCreatedBy(),
                    s.getCreatedAt(),
                    s.getQuestions().size(), targets, responses, rate,
                    answeredByMe, s.isExpired(),
                    s.getQuestions().stream().map(QuestionResponse::from).toList(),
                    s.getTargets().stream()
                            .map(t -> new TargetResponse(t.getUser().getId(), t.getUser().getName()))
                            .toList());
        }
    }

    // ── 결과 집계 ────────────────────────────────────────────────────────────

    /**
     * 문항별 집계. 보기가 있는 유형은 보기별 건수를, 없는 유형은 답변 원문을 모아 준다.
     * 두 가지를 한 레코드에 담는 이유는 화면이 문항을 순서대로 훑으며 그리기 때문이다.
     */
    public record QuestionResultDto(
            Long questionId, int seq, String typeName, String content, boolean usesOptions,
            /** 보기 → 응답 수. 보기 없는 유형이면 비어 있다. */
            Map<String, Integer> counts,
            /** 서술형 답변 원문. 보기 있는 유형이면 비어 있다(단, '기타' 입력은 여기 담긴다). */
            List<String> texts,
            int answeredCount
    ) {}

    public record SurveyResultDto(
            Long surveyId, String title,
            int targetCount, int responseCount, int responseRate,
            boolean anonymous,
            List<QuestionResultDto> questions
    ) {}

    /** 응답 한 건(작성자가 개별 응답을 볼 때). 익명이면 respondentName 이 비어 있다. */
    public record ResponseDetailDto(
            Long id, String respondentName, LocalDateTime submittedAt,
            Map<Long, List<String>> answersByQuestionId
    ) {
        public static List<String> valuesOf(SurveyAnswer a) {
            return a.values();
        }
    }
}
