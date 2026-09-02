package com.erp.config;

import com.erp.groupware.domain.BoardPost;
import com.erp.groupware.domain.Survey;
import com.erp.groupware.domain.SurveyQuestion;
import com.erp.groupware.domain.SurveyStatus;
import com.erp.groupware.domain.enums.SurveyQuestionType;
import com.erp.groupware.domain.SupplyItem;
import com.erp.groupware.repository.BoardRepository;
import com.erp.groupware.repository.SupplyRepository;
import com.erp.groupware.repository.SurveyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 최초 기동 시 그룹웨어(설문조사·공용품·게시판) 데모 데이터를 생성한다.
 * 이미 존재하면 건너뛴다 (idempotent).
 */
@Slf4j
@Component
@Order(6)
@RequiredArgsConstructor
public class GroupwareDataInitializer implements CommandLineRunner {

    private final SurveyRepository surveyRepository;
    private final SupplyRepository supplyRepository;
    private final BoardRepository boardRepository;

    @Override
    @Transactional
    public void run(String... args) {
        seedSurveys();
        seedSupplies();
        seedBoard();
    }

    /**
     * 데모 설문. 제목 단위로 확인하므로 여러 번 돌아도 안전하고, 예전에 문항 없이 만들어진
     * 데모 설문에는 문항을 채워 넣는다 — 문항 없는 설문은 설문이 아니라서 화면 확인이 안 된다.
     */
    private void seedSurveys() {
        survey("2026 직원만족도조사", LocalDateTime.of(2026, 7, 31, 23, 59, 59), SurveyStatus.OPEN,
                q(1, SurveyQuestionType.SCALE, "전반적인 직무 만족도는?", true),
                q(2, SurveyQuestionType.SINGLE, "가장 개선이 필요한 것은?", true,
                        "업무량", "보상", "성장기회", "소통", "근무환경"),
                q(3, SurveyQuestionType.LONG_TEXT, "자유 의견", false));

        survey("사내식당 메뉴조사", LocalDateTime.of(2026, 6, 10, 23, 59, 59), SurveyStatus.CLOSED,
                q(1, SurveyQuestionType.MULTI, "먹고 싶은 메뉴를 모두 고르세요", true,
                        "한식", "중식", "일식", "양식", "분식"),
                q(2, SurveyQuestionType.SHORT_TEXT, "추가하고 싶은 메뉴", false));

        survey("재택근무 선호도조사", LocalDateTime.of(2026, 7, 20, 23, 59, 59), SurveyStatus.OPEN,
                q(1, SurveyQuestionType.SINGLE, "주당 희망 재택 일수", true,
                        "0일", "1일", "2일", "3일", "5일"),
                q(2, SurveyQuestionType.SINGLE_ETC, "재택근무의 가장 큰 걸림돌", false,
                        "협업", "장비", "집중", "보안"));
        log.info("데모 설문 3건 확인 (문항 포함)");
    }

    private void survey(String title, LocalDateTime endAt, SurveyStatus status, SurveyQuestion... questions) {
        Survey s = surveyRepository.findAll().stream()
                .filter(x -> title.equals(x.getTitle()))
                .findFirst()
                .orElse(null);
        if (s == null) {
            s = Survey.builder()
                    .postNo(surveyRepository.maxPostNo() + 1)
                    .title(title).endAt(endAt).status(status).createdBy("admin")
                    .build();
        } else if (!s.getQuestions().isEmpty()) {
            return;   // 이미 문항이 있으면 손대지 않는다
        }
        for (SurveyQuestion q : questions) s.addQuestion(q);
        surveyRepository.save(s);
    }

    private SurveyQuestion q(int seq, SurveyQuestionType type, String content, boolean required, String... options) {
        SurveyQuestion.SurveyQuestionBuilder b = SurveyQuestion.builder()
                .seq(seq).type(type).content(content).required(required);
        if (options.length > 0) b.option1(options[0]);
        if (options.length > 1) b.option2(options[1]);
        if (options.length > 2) b.option3(options[2]);
        if (options.length > 3) b.option4(options[3]);
        if (options.length > 4) b.option5(options[4]);
        return b.build();
    }

    private void seedSupplies() {
        ensureSupply("SP-001", "A4용지", "사무용품", "박스", 42, "복사용지 80g");
        ensureSupply("SP-002", "토너", "소모품", "개", 8, "레이저 프린터용");
        ensureSupply("SP-003", "마우스", "비품", "개", 15, "유선 광마우스");
        ensureSupply("SP-004", "생수", "소모품", "박스", 60, "2L x 6");
        ensureSupply("SP-005", "볼펜", "사무용품", "개", 120, "흑색 0.5mm");
    }

    private void ensureSupply(String code, String name, String category, String unit, long stockQty, String note) {
        if (!supplyRepository.existsByCode(code)) {
            supplyRepository.save(SupplyItem.builder()
                    .code(code).name(name).category(category).unit(unit)
                    .stockQty(BigDecimal.valueOf(stockQty)).note(note).build());
            log.info("데모 공용품 생성 → {} {}", code, name);
        }
    }

    private void seedBoard() {
        if (boardRepository.count() > 0) {
            return;
        }
        boardRepository.save(BoardPost.builder()
                .title("게시판 이용 규칙").category("공지")
                .content("업무관리게시판 이용 시 지켜주실 규칙을 안내드립니다. 상호 존중하는 게시 문화를 부탁드립니다.")
                .author("admin").views(88).build());
        boardRepository.save(BoardPost.builder()
                .title("휴가 사용 안내").category("공지")
                .content("연차 및 반차 사용은 전자결재 시스템을 통해 사전 신청 바랍니다.")
                .author("admin").views(51).build());
        boardRepository.save(BoardPost.builder()
                .title("월간 회의록 공유").category("자료")
                .content("6월 월간 회의록을 공유합니다. 자세한 내용은 첨부 자료를 참고하세요.")
                .author("manager").views(34).build());
        boardRepository.save(BoardPost.builder()
                .title("7월 업무 공지").category("공지")
                .content("7월 주요 업무 일정 및 마감 안내입니다. 각 팀별 일정 확인 바랍니다.")
                .author("admin").views(12).build());
        log.info("데모 게시글 4건 생성");
    }
}
