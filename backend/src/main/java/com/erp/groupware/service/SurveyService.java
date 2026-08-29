package com.erp.groupware.service;

import com.erp.auth.domain.User;
import com.erp.auth.repository.UserRepository;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.groupware.domain.*;
import com.erp.groupware.domain.enums.SurveyQuestionType;
import com.erp.groupware.domain.enums.SurveyResultVisibility;
import com.erp.groupware.domain.enums.SurveyTargetScope;
import com.erp.groupware.dto.SurveyDtos.*;
import com.erp.groupware.repository.SurveyRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 설문조사. 원본 설문조사입력(E070256)·조회(E070257)·현황(E070258) 세 화면이 이 서비스를 쓴다.
 *
 * <p>대상 인원과 응답 수는 저장하지 않고 센다. 예전에는 둘 다 손으로 적는 정수였고,
 * 응답 API 는 그 숫자를 +1 할 뿐이라 "누가 무엇을 답했는지"가 어디에도 없었다.
 */
@Service
@RequiredArgsConstructor
public class SurveyService {

    private final com.erp.common.StoredFileRepository storedFileRepository;
    private final SurveyRepository surveyRepository;
    private final UserRepository userRepository;
    private final DocumentNoGenerator docNo;

    // ── 조회 ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<SurveyResponseDto> findAll(String username) {
        return surveyRepository.findAllWithWriter().stream()
                .map(s -> SurveyResponseDto.from(s, answered(s, username)))
                .toList();
    }

    @Transactional(readOnly = true)
    public SurveyResponseDto get(Long id, String username) {
        Survey s = getSurvey(id);
        return SurveyResponseDto.from(s, answered(s, username));
    }

    // ── 등록·수정 ────────────────────────────────────────────────────────────

    /** 첨부 파일. null 이면 안 붙인 것 — 없는 id 를 주면 그건 오류다. */
    private com.erp.common.StoredFile attachmentOf(Long id) {
        if (id == null) return null;
        com.erp.common.StoredFile f = storedFileRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("첨부 파일을 찾을 수 없습니다. id=" + id));
        /* 붙는 순간 이 파일의 주인을 적는다 — 내려받기를 이 코드로 막는다. */
        if (f.getOwnerCode() == null) f.setOwnerCode("GROUPWARE");
        return f;
    }

    @Transactional
    public SurveyResponseDto create(CreateSurveyRequest req, String username) {
        User writer = userRepository.findByUsername(username).orElse(null);

        // 게시글번호는 max+1 이라 두 사람이 동시에 만들면 같은 번호를 읽는다. 번호 공간에 락을 건다.
        docNo.lockNumberSpace("SURVEY-POST-NO");

        Survey s = Survey.builder()
                .postNo(surveyRepository.maxPostNo() + 1)
                .title(req.title())
                .endAt(req.endAt())
                .targetScope(req.targetScope() != null ? req.targetScope() : SurveyTargetScope.INTERNAL)
                .anonymous(req.anonymous())
                .resultVisibility(req.resultVisibility() != null ? req.resultVisibility() : SurveyResultVisibility.ALL)
                .headerText(StringUtils.hasText(req.headerText()) ? req.headerText() : null)
                .attachment(attachmentOf(req.attachmentId()))
                .status(req.draft() ? SurveyStatus.DRAFT : SurveyStatus.OPEN)
                .writer(writer)
                .createdBy(username)
                .build();

        replaceQuestions(s, req.questions());
        replaceTargets(s, req.targetUserIds());
        validateSendable(s);
        return SurveyResponseDto.from(surveyRepository.save(s), false);
    }

    @Transactional
    public SurveyResponseDto update(Long id, UpdateSurveyRequest req, String username) {
        Survey s = getSurvey(id);
        if (!s.getResponses().isEmpty() && req.questions() != null) {
            // 답이 달린 문항을 갈아 끼우면 기존 응답이 다른 질문에 대한 답이 된다.
            throw ApiException.badRequest("이미 응답이 있는 설문은 문항을 바꿀 수 없습니다.");
        }
        if (req.title() != null) s.setTitle(req.title());
        if (req.endAt() != null) s.setEndAt(req.endAt());
        if (req.targetScope() != null) s.setTargetScope(req.targetScope());
        if (req.anonymous() != null) s.setAnonymous(req.anonymous());
        if (req.resultVisibility() != null) s.setResultVisibility(req.resultVisibility());
        if (req.headerText() != null) s.setHeaderText(StringUtils.hasText(req.headerText()) ? req.headerText() : null);
        // null 이면 안 바꾼다 — 이 요청은 null 필드를 건너뛰는 규칙이다(위 필드들과 같다).
        if (req.attachmentId() != null) s.setAttachment(attachmentOf(req.attachmentId()));
        if (req.questions() != null) replaceQuestions(s, req.questions());
        if (req.targetUserIds() != null) replaceTargets(s, req.targetUserIds());
        if (req.status() != null) {
            if (req.status() == SurveyStatus.OPEN) validateSendable(s);
            s.setStatus(req.status());
        }
        return SurveyResponseDto.from(s, answered(s, username));
    }

    @Transactional
    public void delete(Long id) {
        surveyRepository.delete(getSurvey(id));
    }

    // ── 응답 ────────────────────────────────────────────────────────────────

    @Transactional
    public SurveyResponseDto submit(Long id, SubmitResponseRequest req, String username) {
        Survey s = getSurvey(id);
        if (s.getStatus() != SurveyStatus.OPEN) {
            throw ApiException.badRequest("진행중인 설문에만 응답할 수 있습니다. (현재: " + s.getStatus().getDisplayName() + ")");
        }
        if (s.isExpired()) {
            throw ApiException.badRequest("설문종료일이 지났습니다.");
        }
        if (answered(s, username)) {
            throw ApiException.conflict("이미 응답한 설문입니다.");
        }

        Map<Long, SurveyQuestion> byId = new HashMap<>();
        s.getQuestions().forEach(q -> byId.put(q.getId(), q));

        Map<Long, List<String>> given = new HashMap<>();
        if (req != null && req.answers() != null) {
            for (AnswerRequest a : req.answers()) {
                if (a.questionId() == null || !byId.containsKey(a.questionId())) {
                    throw ApiException.badRequest("이 설문의 문항이 아닙니다. questionId=" + a.questionId());
                }
                given.put(a.questionId(), clean(a.values()));
            }
        }

        // 필수 문항이 비었는지 먼저 전부 확인한다 — 반쯤 저장하고 실패하면 응답이 반쪽으로 남는다.
        for (SurveyQuestion q : s.getQuestions()) {
            List<String> values = given.getOrDefault(q.getId(), List.of());
            if (q.isRequired() && values.isEmpty()) {
                throw ApiException.badRequest("필수 문항에 답하지 않았습니다: " + q.getContent());
            }
            if (!values.isEmpty()) validateAnswer(q, values);
        }

        User me = userRepository.findByUsername(username).orElse(null);
        SurveyResponse r = SurveyResponse.builder()
                // 익명이면 응답자를 넣지 않는다. 넣어 두고 화면에서만 가리면 익명이 아니다.
                .respondent(s.isAnonymous() ? null : me)
                .respondentKey(hash(username))
                .submittedAt(LocalDateTime.now())
                .build();
        for (SurveyQuestion q : s.getQuestions()) {
            List<String> values = given.getOrDefault(q.getId(), List.of());
            if (values.isEmpty()) continue;
            SurveyAnswer a = SurveyAnswer.builder()
                    .question(q)
                    .value(String.join(SurveyAnswer.VALUE_SEPARATOR, values))
                    .build();
            r.addAnswer(a);
            q.getAnswers().add(a);
        }
        s.addResponse(r);
        return SurveyResponseDto.from(s, true);
    }

    // ── 결과 ────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public SurveyResultDto result(Long id, String username) {
        Survey s = getSurvey(id);
        if (!canSeeResult(s, username)) {
            throw ApiException.forbidden("이 설문의 결과를 볼 수 없습니다. (공개범위: "
                    + s.getResultVisibility().getDisplayName() + ")");
        }

        List<QuestionResultDto> questions = s.getQuestions().stream().map(q -> {
            Map<String, Integer> counts = new LinkedHashMap<>();
            if (q.getType().usesOptions()) q.options().forEach(o -> counts.put(o, 0));
            List<String> texts = new ArrayList<>();
            int answered = 0;

            for (SurveyAnswer a : q.getAnswers()) {
                List<String> values = a.values();
                if (values.isEmpty()) continue;
                answered++;
                for (String v : values) {
                    if (counts.containsKey(v)) counts.merge(v, 1, Integer::sum);
                    else texts.add(v);   // 보기에 없는 값 = '기타' 직접 입력이거나 서술형 답변
                }
            }
            return new QuestionResultDto(
                    q.getId(), q.getSeq(), q.getType().getDisplayName(), q.getContent(),
                    q.getType().usesOptions(), counts, texts, answered);
        }).toList();

        int targets = s.getTargets().size();
        int responses = s.getResponses().size();
        return new SurveyResultDto(
                s.getId(), s.getTitle(), targets, responses,
                targets > 0 ? Math.round(responses * 100f / targets) : 0,
                s.isAnonymous(), questions);
    }

    // ── 내부 ────────────────────────────────────────────────────────────────

    private Survey getSurvey(Long id) {
        return surveyRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("설문을 찾을 수 없습니다. id=" + id));
    }

    /** 문항이 하나도 없는 설문을 대상에게 보내면 받는 쪽에 빈 화면이 뜬다. */
    private void validateSendable(Survey s) {
        if (s.getStatus() == SurveyStatus.OPEN && s.getQuestions().isEmpty()) {
            throw ApiException.badRequest("문항이 없는 설문은 발송할 수 없습니다.");
        }
    }

    private void replaceQuestions(Survey s, List<QuestionRequest> reqs) {
        s.getQuestions().clear();
        if (reqs == null) return;
        int seq = 0;
        for (QuestionRequest q : reqs) {
            if (q.type() == null || !StringUtils.hasText(q.content())) continue;   // 빈 줄은 건너뛴다
            seq++;
            SurveyQuestion e = SurveyQuestion.builder()
                    .seq(q.seq() > 0 ? q.seq() : seq)
                    .type(q.type())
                    .content(q.content())
                    .option1(q.option1()).option2(q.option2()).option3(q.option3())
                    .option4(q.option4()).option5(q.option5())
                    .required(q.required())
                    .build();
            if (e.getType().usesOptions() && e.options().isEmpty()) {
                throw ApiException.badRequest(
                        "'" + e.getType().getDisplayName() + "' 문항에는 보기항목이 최소 1개 필요합니다: " + e.getContent());
            }
            s.addQuestion(e);
        }
    }

    private void replaceTargets(Survey s, List<Long> userIds) {
        s.getTargets().clear();
        if (userIds == null) return;
        userIds.stream().distinct().forEach(uid -> {
            User u = userRepository.findById(uid)
                    .orElseThrow(() -> ApiException.notFound("설문대상 사용자를 찾을 수 없습니다. id=" + uid));
            s.addTarget(SurveyTarget.builder().user(u).build());
        });
    }

    /** 익명이든 아니든 respondentKey 로 판단한다 — 익명이라고 두 번 답하게 두면 결과가 망가진다. */
    private boolean answered(Survey s, String username) {
        if (username == null) return false;
        String key = hash(username);
        return s.getResponses().stream().anyMatch(r -> key.equals(r.getRespondentKey()));
    }

    private boolean canSeeResult(Survey s, String username) {
        if (username == null) return false;
        if (username.equals(s.getCreatedBy())) return true;             // 작성자는 언제나
        return switch (s.getResultVisibility()) {
            case ALL -> true;
            case PARTIAL -> s.getTargets().stream()
                    .anyMatch(t -> username.equals(t.getUser().getUsername()));
            case NONE -> false;
        };
    }

    private List<String> clean(List<String> values) {
        if (values == null) return List.of();
        return values.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(v -> !v.isEmpty())
                // 구분자가 값 안에 들어오면 나중에 되읽을 때 한 값이 여러 개로 쪼개진다.
                .map(v -> v.replace(SurveyAnswer.VALUE_SEPARATOR, " "))
                .toList();
    }

    private void validateAnswer(SurveyQuestion q, List<String> values) {
        SurveyQuestionType t = q.getType();
        if (t == SurveyQuestionType.SINGLE || t == SurveyQuestionType.SINGLE_ETC) {
            if (values.size() > 1) {
                throw ApiException.badRequest("단일 선택 문항에 값이 여러 개입니다: " + q.getContent());
            }
        }
        // 기타가 아닌 선택형은 보기에 있는 값만 받는다. 기타형은 직접 입력을 허용한다.
        if (t == SurveyQuestionType.SINGLE || t == SurveyQuestionType.MULTI || t == SurveyQuestionType.RANK) {
            List<String> options = q.options();
            for (String v : values) {
                if (!options.contains(v)) {
                    throw ApiException.badRequest("보기에 없는 값입니다: " + v + " (" + q.getContent() + ")");
                }
            }
        }
    }

    /**
     * 익명 응답의 중복 판정용 표식. 되돌릴 수 없는 해시라서 값만 보고는 누구인지 알 수 없다.
     * 로그인ID 는 회사 안에서 유일하므로 같은 사람이면 같은 값이 나온다.
     */
    private String hash(String username) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] d = md.digest(username.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 을 쓸 수 없습니다.", e);
        }
    }
}
